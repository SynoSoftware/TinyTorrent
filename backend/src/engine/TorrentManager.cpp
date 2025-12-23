#include "engine/TorrentManager.hpp"
#include "engine/TorrentUtils.hpp"

#include "utils/Log.hpp"
#include "utils/Shutdown.hpp"

#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>
#endif

#include <cerrno>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <libtorrent/alert_types.hpp>
#include <libtorrent/torrent_flags.hpp>
#include <libtorrent/write_resume_data.hpp>
#include <memory>
#include <span>
#include <system_error>
#include <vector>
#if defined(__has_include)
#if __has_include(<sanitizer/common_interface_defs.h>)
#include <sanitizer/common_interface_defs.h>
#define TT_HAS_SANITIZER_COMMON_INTERFACE 1
#endif
#endif

namespace
{

#if defined(TT_HAS_SANITIZER_COMMON_INTERFACE)
void annotate_alert_buffer(std::vector<libtorrent::alert *> const &buffer,
                           std::size_t old_size, std::size_t new_size)
{
    auto const capacity = buffer.capacity();
    if (capacity == 0)
    {
        return;
    }
    auto const element_size = sizeof(libtorrent::alert *);
    auto const begin = reinterpret_cast<char const *>(buffer.data());
    auto const end = begin + capacity * element_size;
    auto const old_mid = begin + old_size * element_size;
    auto const new_mid = begin + new_size * element_size;
    __sanitizer_annotate_contiguous_container(begin, end, old_mid, new_mid);
}
#else
void annotate_alert_buffer(std::vector<libtorrent::alert *> const &,
                           std::size_t, std::size_t)
{
}
#endif

} // namespace
#if defined(_WIN32)
#include <fcntl.h>
#include <io.h>
#else
#include <fcntl.h>
#include <unistd.h>
#endif

namespace
{

#if defined(_WIN32)
int open_metadata_temp(std::filesystem::path const &path)
{
    return _wopen(path.c_str(), _O_WRONLY | _O_CREAT | _O_TRUNC | _O_BINARY,
                  _S_IREAD | _S_IWRITE);
}

bool sync_descriptor(int fd)
{
    return _commit(fd) == 0;
}

void close_descriptor(int fd)
{
    _close(fd);
}
#else
int open_metadata_temp(std::filesystem::path const &path)
{
    return ::open(path.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
}

bool sync_descriptor(int fd)
{
    return ::fsync(fd) == 0;
}

void close_descriptor(int fd)
{
    ::close(fd);
}
#endif

bool write_metadata_with_fsync(std::filesystem::path const &target,
                               std::span<std::uint8_t const> data)
{
    std::error_code ec;
    auto tmp = target;
    tmp += ".tmp";
    auto parent = tmp.parent_path();
    if (!parent.empty())
    {
        std::filesystem::create_directories(parent, ec);
        if (ec)
        {
            TT_LOG_INFO("failed to create metadata directory {}: {}",
                        parent.string(), ec.message());
            return false;
        }
    }
    int fd = open_metadata_temp(tmp);
    if (fd < 0)
    {
        TT_LOG_INFO("failed to open metadata temp file {}: {}", tmp.string(),
                    std::error_code(errno, std::generic_category()).message());
        return false;
    }
    const char *bytes = reinterpret_cast<const char *>(data.data());
    std::size_t remaining = data.size();
    bool success = true;
    while (remaining > 0)
    {
#if defined(_WIN32)
        int chunk = _write(fd, bytes + (data.size() - remaining),
                           static_cast<unsigned>(remaining));
        if (chunk <= 0)
        {
            success = false;
            break;
        }
        remaining -= static_cast<std::size_t>(chunk);
#else
        auto chunk = ::write(fd, bytes + (data.size() - remaining),
                             static_cast<std::size_t>(remaining));
        if (chunk <= 0)
        {
            success = false;
            break;
        }
        remaining -= static_cast<std::size_t>(chunk);
#endif
    }
    if (remaining != 0)
    {
        success = false;
    }
    if (success)
    {
        success = sync_descriptor(fd);
    }
    close_descriptor(fd);
    if (!success)
    {
        std::error_code ignore_ec;
        std::filesystem::remove(tmp, ignore_ec);
        return false;
    }
    std::filesystem::rename(tmp, target, ec);
#if defined(_WIN32)
    if (ec)
    {
        auto tmp_w = tmp.wstring();
        auto target_w = target.wstring();
        if (!tmp_w.empty() && !target_w.empty())
        {
            DWORD flags = MOVEFILE_COPY_ALLOWED | MOVEFILE_REPLACE_EXISTING;
            if (MoveFileExW(tmp_w.c_str(), target_w.c_str(), flags))
            {
                ec.clear();
            }
        }
    }
#endif
    if (ec)
    {
        std::error_code ignore_ec;
        std::filesystem::remove(tmp, ignore_ec);
        TT_LOG_INFO("failed to rename metadata file {} -> {}: {}", tmp.string(),
                    target.string(), ec.message());
        return false;
    }
    return true;
}

} // namespace

namespace tt::engine
{

TorrentManager::TorrentManager()
{
    alert_buffer_.reserve(kAlertBufferCapacity);
}

TorrentManager::~TorrentManager()
{
    // Ensure session is destroyed before other members
    // libtorrent session must be destroyed cleanly to avoid
    // potential callbacks accessing freed memory
    if (session_)
    {
        session_->pause();
        session_.reset();
    }
}

void TorrentManager::start_session(libtorrent::v2::session_params params)
{
    session_ = std::make_unique<libtorrent::session>(std::move(params));
}

libtorrent::session *TorrentManager::session() const noexcept
{
    return session_.get();
}

void TorrentManager::enqueue_task(std::function<void()> task)
{
    {
        std::unique_lock<std::mutex> lock(task_mutex_);
        while (tasks_.size() >= kMaxPendingTasks)
        {
            TT_LOG_INFO(
                "task queue maxed out ({}); waiting for engine to catch up",
                tasks_.size());
            task_space_cv_.wait(lock, [this]
                                { return tasks_.size() < kMaxPendingTasks; });
        }
        tasks_.push_back(std::move(task));
    }
    wake_cv_.notify_one();
}

void TorrentManager::process_tasks()
{
    std::deque<std::function<void()>> pending;
    {
        std::lock_guard<std::mutex> lock(task_mutex_);
        pending.swap(tasks_);
    }
    task_space_cv_.notify_all();
    if (pending.empty())
    {
        return;
    }
    TT_LOG_DEBUG("Processing {} pending engine commands", pending.size());
    std::size_t task_index = 0;
    for (; task_index < pending.size(); ++task_index)
    {
        auto &task = pending[task_index];
        try
        {
            task();
        }
        catch (std::exception const &ex)
        {
            TT_LOG_ERROR("engine task threw std::exception: {}", ex.what());
            TT_LOG_ERROR("engine task failed; continuing");
            continue;
        }
        catch (...)
        {
            TT_LOG_ERROR("engine task threw unknown exception");
            TT_LOG_ERROR("engine task failed; continuing");
            continue;
        }
    }
}

void TorrentManager::wait_for_work(unsigned idle_sleep_ms,
                                   std::atomic_bool const &shutdown_requested)
{
    std::unique_lock<std::mutex> lock(wake_mutex_);
    wake_cv_.wait_for(lock, std::chrono::milliseconds(idle_sleep_ms),
                      [&]
                      {
                          return !tasks_.empty() ||
                                 shutdown_requested.load(
                                     std::memory_order_relaxed);
                      });
}

std::shared_ptr<SessionSnapshot> TorrentManager::snapshot_copy() const noexcept
{
    return snapshot_.load(std::memory_order_acquire);
}

void TorrentManager::store_snapshot(std::shared_ptr<SessionSnapshot> snapshot)
{
    snapshot_.store(std::move(snapshot), std::memory_order_release);
}

TorrentManager::SnapshotBuildResult
TorrentManager::build_snapshot(SnapshotBuildCallbacks const &callbacks)
{
    SnapshotBuildResult result;
    if (!session_)
    {
        return result;
    }
    auto handles = session_->get_torrents();
    auto snapshot = std::make_shared<SessionSnapshot>();
    snapshot->torrents.reserve(handles.size());
    std::unordered_map<int, TorrentSnapshot> updated_cache;
    std::uint64_t total_download_rate = 0;
    std::uint64_t total_upload_rate = 0;
    std::size_t paused_count = 0;
    std::size_t seeding_count = 0;
    std::size_t error_count = 0;

    for (auto const &handle : handles)
    {
        if (!handle.is_valid())
        {
            continue;
        }
        auto status = handle.status();
        auto const hash = info_hash_to_hex(status.info_hashes);
        int id = assign_rpc_id(status.info_hashes.get_best());

        result.seen_ids.insert(id);

        if (callbacks.on_torrent_visit)
        {
            callbacks.on_torrent_visit(id, handle, status);
        }

        std::uint64_t revision =
            callbacks.ensure_revision ? callbacks.ensure_revision(id) : 0;

        TorrentSnapshot entry;
        if (auto cached = cached_snapshot(id, revision))
        {
            entry = *cached;
        }
        else if (callbacks.build_snapshot_entry)
        {
            std::optional<std::int64_t> cached_added_time = std::nullopt;
            auto it = snapshot_cache_.find(id);
            if (it != snapshot_cache_.end())
            {
                cached_added_time = it->second.added_time;
            }
            entry = callbacks.build_snapshot_entry(id, status, revision,
                                                   cached_added_time);
        }
        else
        {
            continue;
        }

        entry.revision = revision;

        if (callbacks.labels_for_torrent)
        {
            entry.labels = callbacks.labels_for_torrent(id, hash);
        }

        if (callbacks.priority_for_torrent)
        {
            entry.bandwidth_priority = callbacks.priority_for_torrent(id);
        }

        updated_cache[id] = entry;
        snapshot->torrents.push_back(entry);

        if (entry.state == "seeding")
        {
            ++seeding_count;
        }
        if (entry.error != 0)
        {
            ++error_count;
        }

        const auto download_payload =
            status.download_payload_rate > 0 ? status.download_payload_rate : 0;
        const auto upload_payload =
            status.upload_payload_rate > 0 ? status.upload_payload_rate : 0;
        total_download_rate += static_cast<std::uint64_t>(download_payload);
        total_upload_rate += static_cast<std::uint64_t>(upload_payload);
        if (static_cast<bool>(status.flags & libtorrent::torrent_flags::paused))
        {
            ++paused_count;
        }
    }

    snapshot->torrent_count = snapshot->torrents.size();
    snapshot->paused_torrent_count = paused_count;
    snapshot->active_torrent_count =
        snapshot->torrent_count > paused_count
            ? snapshot->torrent_count - paused_count
            : 0;
    snapshot->seeding_torrent_count = seeding_count;
    snapshot->error_torrent_count = error_count;
    snapshot->download_rate = total_download_rate;
    snapshot->upload_rate = total_upload_rate;
    snapshot->dht_nodes = 0;

    snapshot_cache_ = std::move(updated_cache);
    store_snapshot(snapshot);
    result.snapshot = std::move(snapshot);
    return result;
}
void TorrentManager::notify()
{
    wake_cv_.notify_one();
}

void TorrentManager::set_alert_callbacks(AlertCallbacks callbacks)
{
    callbacks_ = std::move(callbacks);
}

void TorrentManager::process_alerts()
{
    if (!session_)
    {
        return;
    }
    auto const previous_annotated_size = alert_buffer_annotated_size_;
    annotate_alert_buffer(alert_buffer_, previous_annotated_size, 0);
    alert_buffer_.clear();
    annotate_alert_buffer(alert_buffer_, 0, alert_buffer_.capacity());
    alert_buffer_annotated_size_ = 0;
    session_->pop_alerts(&alert_buffer_);
    annotate_alert_buffer(alert_buffer_, 0, alert_buffer_.size());
    alert_buffer_annotated_size_ = alert_buffer_.size();
    for (auto const *alert : alert_buffer_)
    {
        if (auto *finished =
                libtorrent::alert_cast<libtorrent::torrent_finished_alert>(
                    alert))
        {
            handle_torrent_finished(*finished);
        }
        else if (auto *resume =
                     libtorrent::alert_cast<libtorrent::save_resume_data_alert>(
                         alert))
        {
            handle_save_resume_data_alert(*resume);
        }
        else if (auto *failed = libtorrent::alert_cast<
                     libtorrent::save_resume_data_failed_alert>(alert))
        {
            handle_save_resume_data_failed_alert(*failed);
        }
        else if (auto *metadata = libtorrent::alert_cast<
                     libtorrent::metadata_received_alert>(alert))
        {
            handle_metadata_received_alert(*metadata);
        }
        else if (auto *add_failed =
                     libtorrent::alert_cast<libtorrent::add_torrent_alert>(
                         alert))
        {
            if (add_failed->error && callbacks_.on_torrent_add_failed)
            {
                callbacks_.on_torrent_add_failed(*add_failed);
            }
        }
        else if (auto *metadata_failed =
                     libtorrent::alert_cast<libtorrent::metadata_failed_alert>(
                         alert))
        {
            if (callbacks_.on_metadata_failed)
            {
                callbacks_.on_metadata_failed(*metadata_failed);
            }
        }
        else if (auto *state =
                     libtorrent::alert_cast<libtorrent::state_update_alert>(
                         alert))
        {
            if (callbacks_.on_state_update)
            {
                callbacks_.on_state_update(state->status);
            }
        }
        else if (auto *listen =
                     libtorrent::alert_cast<libtorrent::listen_succeeded_alert>(
                         alert))
        {
            if (callbacks_.on_listen_succeeded)
            {
                callbacks_.on_listen_succeeded(*listen);
            }
        }
        else if (auto *failed =
                     libtorrent::alert_cast<libtorrent::listen_failed_alert>(
                         alert))
        {
            if (callbacks_.on_listen_failed)
            {
                callbacks_.on_listen_failed(*failed);
            }
        }
        else if (auto *file_error =
                     libtorrent::alert_cast<libtorrent::file_error_alert>(
                         alert))
        {
            if (callbacks_.on_file_error)
            {
                callbacks_.on_file_error(*file_error);
            }
        }
        else if (auto *tracker_error =
                     libtorrent::alert_cast<libtorrent::tracker_error_alert>(
                         alert))
        {
            if (callbacks_.on_tracker_error)
            {
                callbacks_.on_tracker_error(*tracker_error);
            }
        }
        else if (auto *delete_failed = libtorrent::alert_cast<
                     libtorrent::torrent_delete_failed_alert>(alert))
        {
            if (callbacks_.on_torrent_delete_failed)
            {
                callbacks_.on_torrent_delete_failed(*delete_failed);
            }
        }
        else if (auto *portmap_failed =
                     libtorrent::alert_cast<libtorrent::portmap_error_alert>(
                         alert))
        {
            if (callbacks_.on_portmap_error)
            {
                callbacks_.on_portmap_error(*portmap_failed);
            }
        }
        else if (auto *moved =
                     libtorrent::alert_cast<libtorrent::storage_moved_alert>(
                         alert))
        {
            if (callbacks_.on_storage_moved)
            {
                callbacks_.on_storage_moved(*moved);
            }
        }
        else if (auto *storage_failed = libtorrent::alert_cast<
                     libtorrent::storage_moved_failed_alert>(alert))
        {
            if (callbacks_.on_storage_moved_failed)
            {
                callbacks_.on_storage_moved_failed(*storage_failed);
            }
        }
        else if (auto *fastresume = libtorrent::alert_cast<
                     libtorrent::fastresume_rejected_alert>(alert))
        {
            if (callbacks_.on_fastresume_rejected)
            {
                callbacks_.on_fastresume_rejected(*fastresume);
            }
        }
    }
}

void TorrentManager::async_add_torrent(libtorrent::add_torrent_params params)
{
    enqueue_task(
        [this, params = std::move(params)]() mutable
        {
            if (session_)
            {
                session_->async_add_torrent(std::move(params));
            }
        });
}

std::vector<libtorrent::torrent_handle> TorrentManager::torrent_handles() const
{
    if (!session_)
    {
        return {};
    }
    return session_->get_torrents();
}

SessionTotals TorrentManager::capture_session_totals() const
{
    SessionTotals totals{};
    if (!session_)
    {
        return totals;
    }
    for (auto const &handle : session_->get_torrents())
    {
        if (!handle.is_valid())
        {
            continue;
        }
        auto status = handle.status();
        if (status.total_upload > 0)
        {
            totals.uploaded += static_cast<std::uint64_t>(status.total_upload);
        }
        if (status.total_download > 0)
        {
            totals.downloaded +=
                static_cast<std::uint64_t>(status.total_download);
        }
    }
    return totals;
}

std::vector<libtorrent::torrent_handle>
TorrentManager::handles_for_ids(std::vector<int> const &ids) const
{
    std::vector<libtorrent::torrent_handle> result;
    result.reserve(ids.size());
    for (int id : ids)
    {
        if (auto handle = handle_for_id(id); handle)
        {
            result.push_back(*handle);
        }
    }
    return result;
}

void TorrentManager::set_ip_filter(libtorrent::ip_filter &&filter)
{
    if (!session_)
    {
        return;
    }
    session_->set_ip_filter(filter);
}

void TorrentManager::remove_torrent(libtorrent::torrent_handle const &handle,
                                    bool delete_data)
{
    if (!session_ || !handle.is_valid())
    {
        return;
    }
    auto flags = decltype(libtorrent::session::delete_files){};
    if (delete_data)
    {
        flags = libtorrent::session::delete_files;
    }
    session_->remove_torrent(handle, flags);
}

std::vector<char>
TorrentManager::write_session_params(libtorrent::save_state_flags_t mode) const
{
    if (!session_)
    {
        return {};
    }
    auto params = session_->session_state(mode);
    return libtorrent::write_session_params_buf(params, mode);
}

void TorrentManager::handle_torrent_finished(
    libtorrent::torrent_finished_alert const &alert)
{
    if (!callbacks_.on_torrent_finished)
    {
        return;
    }
    auto handle = alert.handle;
    if (!handle.is_valid())
    {
        return;
    }
    callbacks_.on_torrent_finished(handle, handle.status());
}

void TorrentManager::handle_metadata_received_alert(
    libtorrent::metadata_received_alert const &alert)
{
    auto const &handle = alert.handle;
    if (!handle.is_valid())
    {
        return;
    }

    // Metadata arrival changes the torrent state materially; request a fresh
    // resume-data blob so persistence is updated without waiting for a timer.
    handle.save_resume_data();

    if (!callbacks_.metadata_file_path || !callbacks_.on_metadata_persisted)
    {
        return;
    }
    auto const info = handle.info_hashes().get_best();
    if (!hash_is_nonzero(info))
    {
        return;
    }
    auto hash = info_hash_to_hex(info);
    auto const *ti = handle.torrent_file().get();
    if (ti == nullptr)
    {
        return;
    }
    try
    {
        libtorrent::add_torrent_params params;
        params.ti = std::make_shared<libtorrent::torrent_info>(*ti);
        auto payload = libtorrent::write_torrent_file_buf(
            params, libtorrent::write_torrent_flags_t{});
        if (payload.empty())
        {
            return;
        }
        auto path = callbacks_.metadata_file_path(hash);
        if (path.empty())
        {
            return;
        }
        std::vector<std::uint8_t> metadata(payload.begin(), payload.end());
        if (!write_metadata_with_fsync(path, metadata))
        {
            TT_LOG_INFO("failed to write metadata for {} to {}", hash,
                        path.string());
            return;
        }
        callbacks_.on_metadata_persisted(hash, path, metadata);
    }
    catch (std::system_error const &ex)
    {
        TT_LOG_INFO("failed to serialize metadata for {}: {}", hash, ex.what());
    }
}

void TorrentManager::handle_save_resume_data_alert(
    libtorrent::save_resume_data_alert const &alert)
{
    if (auto hash = info_hash_from_params(alert.params); hash)
    {
        if (callbacks_.on_resume_data)
        {
            callbacks_.on_resume_data(*hash, alert.params);
        }
        if (callbacks_.on_resume_hash_completed)
        {
            callbacks_.on_resume_hash_completed(*hash);
        }
        return;
    }
    if (auto hash = hash_from_handle(alert.handle); hash)
    {
        if (callbacks_.on_resume_hash_completed)
        {
            callbacks_.on_resume_hash_completed(*hash);
        }
        return;
    }
    if (callbacks_.extend_resume_deadline)
    {
        callbacks_.extend_resume_deadline();
    }
}

void TorrentManager::handle_save_resume_data_failed_alert(
    libtorrent::save_resume_data_failed_alert const &alert)
{
    TT_LOG_INFO("save resume data failed: {}", alert.error.message());
    if (auto hash = hash_from_handle(alert.handle); hash)
    {
        if (callbacks_.on_resume_hash_completed)
        {
            callbacks_.on_resume_hash_completed(*hash);
        }
        return;
    }
    if (callbacks_.extend_resume_deadline)
    {
        callbacks_.extend_resume_deadline();
    }
}

void TorrentManager::apply_settings(libtorrent::settings_pack const &pack)
{
    if (session_)
    {
        session_->apply_settings(pack);
    }
}

void TorrentManager::set_pex_enabled(bool enabled)
{
    if (!session_)
    {
        return;
    }
    auto handles = session_->get_torrents();
    for (auto const &handle : handles)
    {
        if (!handle.is_valid())
        {
            continue;
        }
        auto flag = libtorrent::torrent_flags::disable_pex;
        if (enabled)
        {
            handle.unset_flags(flag);
        }
        else
        {
            handle.set_flags(flag);
        }
    }
}

void TorrentManager::set_torrent_bandwidth_limits(
    std::vector<int> const &ids, std::optional<int> download_limit_kbps,
    std::optional<bool> download_limited, std::optional<int> upload_limit_kbps,
    std::optional<bool> upload_limited)
{
    if (!session_)
    {
        return;
    }
    for (int id : ids)
    {
        if (auto handle = handle_for_id(id); handle)
        {
            if (download_limit_kbps || download_limited)
            {
                bool enabled =
                    download_limited.value_or(download_limit_kbps.has_value());
                int limit = enabled ? download_limit_kbps.value_or(0) : 0;
                handle->set_download_limit(kbps_to_bytes(limit, enabled));
            }
            if (upload_limit_kbps || upload_limited)
            {
                bool enabled =
                    upload_limited.value_or(upload_limit_kbps.has_value());
                int limit = enabled ? upload_limit_kbps.value_or(0) : 0;
                handle->set_upload_limit(kbps_to_bytes(limit, enabled));
            }
        }
    }
}

int TorrentManager::assign_rpc_id(libtorrent::sha1_hash const &hash)
{
    if (!hash_is_nonzero(hash))
    {
        return 0;
    }
    auto it = hash_to_id_.find(hash);
    if (it != hash_to_id_.end())
    {
        return it->second;
    }
    int id = next_id_++;
    hash_to_id_.emplace(hash, id);
    id_to_hash_.emplace(id, hash);
    return id;
}

std::optional<int>
TorrentManager::id_for_hash(libtorrent::sha1_hash const &hash) const
{
    if (!hash_is_nonzero(hash))
    {
        return std::nullopt;
    }
    auto it = hash_to_id_.find(hash);
    if (it == hash_to_id_.end())
    {
        return std::nullopt;
    }
    return it->second;
}

void TorrentManager::recover_rpc_mappings(
    std::vector<std::pair<std::string, int>> const &mappings)
{
    for (auto const &entry : mappings)
    {
        if (entry.first.empty() || entry.second <= 0)
        {
            continue;
        }
        if (auto hash = sha1_from_hex(entry.first); hash)
        {
            update_rpc_id(*hash, entry.second);
        }
    }
}

void TorrentManager::update_rpc_id(libtorrent::sha1_hash const &hash, int id)
{
    if (!hash_is_nonzero(hash) || id <= 0)
    {
        return;
    }
    auto it = hash_to_id_.find(hash);
    int previous_id = 0;
    if (it != hash_to_id_.end())
    {
        previous_id = it->second;
        if (previous_id == id)
        {
            if (id >= next_id_)
            {
                next_id_ = id + 1;
            }
            return;
        }
        it->second = id;
    }
    else
    {
        hash_to_id_.emplace(hash, id);
    }
    if (previous_id > 0 && previous_id != id)
    {
        id_to_hash_.erase(previous_id);
    }
    id_to_hash_[id] = hash;
    if (id >= next_id_)
    {
        next_id_ = id + 1;
    }
}

std::optional<libtorrent::torrent_handle>
TorrentManager::handle_for_id(int id) const
{
    if (id <= 0 || !session_)
    {
        return std::nullopt;
    }
    auto it = id_to_hash_.find(id);
    if (it == id_to_hash_.end())
    {
        return std::nullopt;
    }
    auto handle = session_->find_torrent(it->second);
    if (!handle.is_valid())
    {
        return std::nullopt;
    }
    return handle;
}

std::optional<TorrentSnapshot>
TorrentManager::cached_snapshot(int id, std::uint64_t revision) const
{
    if (id <= 0)
    {
        return std::nullopt;
    }
    auto it = snapshot_cache_.find(id);
    if (it != snapshot_cache_.end() && it->second.revision == revision)
    {
        return it->second;
    }
    return std::nullopt;
}

std::vector<int>
TorrentManager::purge_missing_ids(std::unordered_set<int> const &seen_ids)
{
    std::vector<int> removed;
    for (auto it = id_to_hash_.begin(); it != id_to_hash_.end();)
    {
        if (!seen_ids.contains(it->first))
        {
            removed.push_back(it->first);
            hash_to_id_.erase(it->second);
            it = id_to_hash_.erase(it);
        }
        else
        {
            ++it;
        }
    }
    return removed;
}

bool TorrentManager::has_pending_move(std::string const &hash) const
{
    if (hash.empty())
    {
        return false;
    }
    std::lock_guard<std::mutex> guard(pending_move_mutex_);
    return pending_move_paths_.contains(hash);
}

void TorrentManager::queue_pending_move(
    std::string const &hash, std::filesystem::path const &destination)
{
    if (hash.empty() || destination.empty())
    {
        return;
    }
    std::lock_guard<std::mutex> guard(pending_move_mutex_);
    pending_move_paths_[hash] = destination;
}

void TorrentManager::cancel_pending_move(std::string const &hash)
{
    if (hash.empty())
    {
        return;
    }
    std::lock_guard<std::mutex> guard(pending_move_mutex_);
    pending_move_paths_.erase(hash);
}

} // namespace tt::engine
