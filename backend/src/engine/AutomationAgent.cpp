#include "engine/AutomationAgent.hpp"

#include "utils/Log.hpp"

#include <libtorrent/hex.hpp>
#include <libtorrent/torrent_handle.hpp>
#include <libtorrent/torrent_status.hpp>

#include <fstream>
#include <iterator>
#include <system_error>

namespace tt::engine
{

namespace
{

constexpr std::uintmax_t kMaxWatchFileSize = 64ull * 1024 * 1024;
constexpr auto kWatchFileStabilityThreshold = std::chrono::seconds(3);

std::string sha1_to_hex(libtorrent::sha1_hash const &hash)
{
    constexpr char kHexDigits[] = "0123456789abcdef";
    std::string result;
    result.reserve(20 * 2);
    for (int i = 0; i < 20; ++i)
    {
        auto byte = static_cast<unsigned char>(hash[i]);
        result.push_back(kHexDigits[byte >> 4]);
        result.push_back(kHexDigits[byte & 0x0F]);
    }
    return result;
}

} // namespace

AutomationAgent::AutomationAgent(TaskScheduler schedule_io,
                                 TaskScheduler enqueue_task,
                                 TorrentEnqueueFn enqueue_torrent,
                                 MoveQueueFn queue_move_callback,
                                 MoveCancelFn cancel_move_callback,
                                 MoveCompleteFn complete_move_callback)
    : schedule_io_(std::move(schedule_io)),
      enqueue_task_(std::move(enqueue_task)),
      enqueue_torrent_(std::move(enqueue_torrent)),
      queue_move_callback_(std::move(queue_move_callback)),
      cancel_move_callback_(std::move(cancel_move_callback)),
      complete_move_callback_(std::move(complete_move_callback))
{
}

void AutomationAgent::configure(std::filesystem::path watch_dir,
                                bool watch_enabled,
                                std::filesystem::path download_path,
                                std::filesystem::path incomplete_dir,
                                bool incomplete_enabled)
{
    bool dir_changed = watch_dir_ != watch_dir;
    watch_dir_ = std::move(watch_dir);
    watch_enabled_ = watch_enabled;
    download_path_ = std::move(download_path);
    incomplete_dir_ = std::move(incomplete_dir);
    incomplete_enabled_ = incomplete_enabled;

    if (!watch_enabled_ || watch_dir_.empty() || dir_changed)
    {
        watch_dir_snapshots_.clear();
    }
}

void AutomationAgent::set_download_path(std::filesystem::path download_path)
{
    download_path_ = std::move(download_path);
}

void AutomationAgent::scan()
{
    if (!watch_enabled_ || watch_dir_.empty())
    {
        watch_dir_snapshots_.clear();
        return;
    }
    auto directory = watch_dir_;
    auto download_path = download_path_;
    schedule_io_(
        [this, directory = std::move(directory), download_path]() mutable
        {
            auto entries = collect_watch_entries(directory);
            enqueue_task_(
                [this, directory = std::move(directory),
                 download_path = std::move(download_path),
                 entries = std::move(entries)]() mutable
                {
                    process_watch_entries(directory, std::move(download_path),
                                          std::move(entries));
                });
        });
}

void AutomationAgent::process_completion(
    libtorrent::torrent_handle const &handle,
    libtorrent::v2::torrent_status const &status)
{
    if (!incomplete_enabled_ || incomplete_dir_.empty() ||
        download_path_.empty())
    {
        return;
    }
    if (status.save_path != incomplete_dir_.string())
    {
        return;
    }
    if (!status.is_seeding)
    {
        return;
    }
    if (download_path_ == incomplete_dir_)
    {
        return;
    }

    auto default_path = download_path_;
    auto hash_str = sha1_to_hex(status.info_hashes.get_best());
    if (hash_str.empty())
    {
        return;
    }

    auto current_save = std::filesystem::path(status.save_path);
    auto candidate_name = status.name.empty() ? hash_str : status.name;

    auto handle_copy = handle;
    auto source_path = status.save_path;

    schedule_io_(
        [this, default_path, current_save, candidate_name, hash_str,
         source_path, handle_copy]() mutable
        {
            auto destination = determine_completion_destination(
                default_path, current_save, candidate_name, hash_str);

            if (destination.empty())
            {
                TT_LOG_INFO("move-complete skipped for {}: unable to determine "
                            "safe destination",
                            hash_str);
                return;
            }
            if (destination == current_save)
            {
                return;
            }

            enqueue_task_(
                [this, handle_copy, destination, hash_str,
                 source_path]() mutable
                {
                    auto handle = handle_copy;
                    if (!handle.is_valid())
                    {
                        return;
                    }
                    TT_LOG_INFO("moving {} from {} to {}", hash_str,
                                source_path, destination.string());

                    track_pending_move(hash_str, destination);

                    handle.move_storage(destination.string());
                });
        });
}

void AutomationAgent::track_pending_move(
    std::string const &hash, std::filesystem::path const &destination)
{
    if (hash.empty() || destination.empty())
    {
        return;
    }
    if (queue_move_callback_)
    {
        queue_move_callback_(hash, destination);
    }
}

void AutomationAgent::handle_storage_moved(
    std::string const &hash, std::filesystem::path const &destination)
{
    if (hash.empty())
    {
        return;
    }
    if (complete_move_callback_)
    {
        complete_move_callback_(hash, destination);
    }
}

void AutomationAgent::handle_storage_move_failed(std::string const &hash)
{
    if (hash.empty())
    {
        return;
    }
    if (cancel_move_callback_)
    {
        cancel_move_callback_(hash);
    }
}

std::vector<AutomationAgent::WatchEntryInfo>
AutomationAgent::collect_watch_entries(std::filesystem::path const &watch_dir)
{
    std::vector<WatchEntryInfo> result;
    if (watch_dir.empty())
    {
        return result;
    }
    std::error_code ec;
    std::filesystem::create_directories(watch_dir, ec);
    if (ec)
    {
        TT_LOG_INFO("failed to create watch-dir {}: {}", watch_dir.string(),
                    ec.message());
        return result;
    }
    for (auto const &entry : std::filesystem::directory_iterator(watch_dir, ec))
    {
        if (ec)
        {
            TT_LOG_INFO("watch-dir iteration failed: {}", ec.message());
            break;
        }
        std::error_code file_ec;
        if (!entry.is_regular_file(file_ec) || file_ec)
        {
            continue;
        }
        auto path = entry.path();
        if (path.extension() != ".torrent")
        {
            continue;
        }
        auto size = entry.file_size(file_ec);
        if (file_ec)
        {
            continue;
        }
        if (size > kMaxWatchFileSize)
        {
            TT_LOG_INFO("watch-dir skipping oversized file {} ({} bytes)",
                        path.string(), size);
            continue;
        }
        auto mtime = entry.last_write_time(file_ec);
        if (file_ec)
        {
            continue;
        }
        result.push_back(WatchEntryInfo{path, size, mtime});
    }
    return result;
}

void AutomationAgent::process_watch_entries(
    std::filesystem::path const &watch_dir, std::filesystem::path download_path,
    std::vector<WatchEntryInfo> entries)
{
    auto now = std::chrono::steady_clock::now();
    std::unordered_set<std::filesystem::path> seen;
    seen.reserve(entries.size());
    std::vector<WatchEntryInfo> stable_entries;
    stable_entries.reserve(entries.size());
    for (auto const &entry : entries)
    {
        seen.insert(entry.path);
        auto it = watch_dir_snapshots_.find(entry.path);
        if (it == watch_dir_snapshots_.end())
        {
            watch_dir_snapshots_.emplace(
                entry.path, WatchFileSnapshot{entry.size, entry.mtime, now});
            continue;
        }
        auto &snapshot = it->second;
        if (snapshot.size != entry.size || snapshot.mtime != entry.mtime)
        {
            snapshot.size = entry.size;
            snapshot.mtime = entry.mtime;
            snapshot.last_change = now;
            continue;
        }
        if (now - snapshot.last_change < kWatchFileStabilityThreshold)
        {
            continue;
        }
        stable_entries.push_back(entry);
    }
    for (auto it = watch_dir_snapshots_.begin();
         it != watch_dir_snapshots_.end();)
    {
        if (seen.contains(it->first))
        {
            ++it;
            continue;
        }
        it = watch_dir_snapshots_.erase(it);
    }

    if (stable_entries.empty())
    {
        return;
    }

    schedule_io_(
        [this, download_path = std::move(download_path),
         stable_entries = std::move(stable_entries)]() mutable
        {
            std::vector<std::pair<WatchEntryInfo, std::vector<std::uint8_t>>>
                buffers;
            buffers.reserve(stable_entries.size());
            for (auto const &entry : stable_entries)
            {
                std::vector<std::uint8_t> buffer;
                std::ifstream input(entry.path, std::ios::binary);
                if (input)
                {
                    buffer.assign(std::istreambuf_iterator<char>(input),
                                  std::istreambuf_iterator<char>());
                }
                buffers.emplace_back(entry, std::move(buffer));
            }
            enqueue_task_(
                [this, download_path = std::move(download_path),
                 buffers = std::move(buffers)]() mutable
                {
                    finish_watch_entries(std::move(download_path),
                                         std::move(buffers));
                });
        });
}

void AutomationAgent::finish_watch_entries(
    std::filesystem::path download_path,
    std::vector<std::pair<WatchEntryInfo, std::vector<std::uint8_t>>> entries)
{
    for (auto &entry : entries)
    {
        auto const &info = entry.first;
        auto &buffer = entry.second;
        if (buffer.empty())
        {
            mark_watch_file(info.path, ".invalid");
            continue;
        }
        TorrentAddRequest request;
        request.metainfo = std::move(buffer);
        request.download_path = download_path;
        auto status = enqueue_torrent_(std::move(request));
        if (status == Core::AddTorrentStatus::Ok)
        {
            mark_watch_file(info.path, ".added");
            continue;
        }
        auto reason = status == Core::AddTorrentStatus::InvalidUri
                          ? "invalid torrent metadata"
                          : "failed to queue torrent";
        TT_LOG_INFO("watch-dir enqueue failed for {}: {}",
                    info.path.string(), reason);
        mark_watch_file(info.path, ".invalid");
    }
}


void AutomationAgent::mark_watch_file(std::filesystem::path const &source,
                                      char const *suffix)
{
    if (source.empty())
    {
        return;
    }
    std::error_code ec;
    auto target = source;
    watch_dir_snapshots_.erase(source);
    target += suffix;
    std::filesystem::remove(target, ec);
    std::filesystem::rename(source, target, ec);
    if (ec)
    {
        TT_LOG_INFO("failed to rename watch file {}: {}", source.string(),
                    ec.message());
    }
}

std::filesystem::path AutomationAgent::determine_completion_destination(
    std::filesystem::path const &base, std::filesystem::path const &current,
    std::string const &name, std::string const &hash)
{
    if (base.empty())
    {
        return {};
    }
    std::error_code ec;
    bool base_exists = std::filesystem::exists(base, ec);
    if (ec)
    {
        TT_LOG_INFO("completion base unavailable {}: {}", base.string(),
                    ec.message());
        return {};
    }
    auto candidate = base;
    if (base_exists && std::filesystem::is_directory(base, ec) && !ec)
    {
        auto safe_name = name.empty() ? hash : name;
        candidate /= safe_name;
    }
    return resolve_unique_completion_target(candidate, current);
}

std::filesystem::path AutomationAgent::resolve_unique_completion_target(
    std::filesystem::path const &target, std::filesystem::path const &current)
{
    if (target.empty())
    {
        return {};
    }
    if (target == current)
    {
        return target;
    }
    std::error_code ec;
    bool exists = std::filesystem::exists(target, ec);
    if (ec)
    {
        TT_LOG_INFO("failed to inspect {}: {}", target.string(), ec.message());
        return {};
    }
    if (!exists)
    {
        return target;
    }
    auto parent = target.parent_path();
    auto stem = target.stem().string();
    if (stem.empty())
    {
        stem = target.filename().string();
    }
    auto extension = target.extension().string();
    static constexpr int kMaxCompletionAttempts = 1024;
    for (int index = 1; index <= kMaxCompletionAttempts; ++index)
    {
        std::string candidate_name = stem + " (" + std::to_string(index) + ")";
        if (!extension.empty())
        {
            candidate_name += extension;
        }
        auto candidate = parent / candidate_name;
        std::error_code exists_ec;
        if (!std::filesystem::exists(candidate, exists_ec))
        {
            if (exists_ec)
            {
                TT_LOG_INFO("failed to inspect {}: {}", candidate.string(),
                            exists_ec.message());
                return {};
            }
            return candidate;
        }
    }
    TT_LOG_ERROR(
        "unable to find unique completion destination for {} after {} attempts",
        target.string(), kMaxCompletionAttempts);
    return {};
}

} // namespace tt::engine