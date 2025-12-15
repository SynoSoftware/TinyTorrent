#include "engine/AutomationAgent.hpp"

#include "utils/Log.hpp"

#include <fstream>
#include <iterator>
#include <system_error>

namespace tt::engine {

namespace {

constexpr std::uintmax_t kMaxWatchFileSize = 64ull * 1024 * 1024;
constexpr auto kWatchFileStabilityThreshold = std::chrono::seconds(3);

} // namespace

AutomationAgent::AutomationAgent(TaskScheduler schedule_io,
                                 TaskScheduler enqueue_task,
                                 TorrentEnqueueFn enqueue_torrent)
    : schedule_io_(std::move(schedule_io)),
      enqueue_task_(std::move(enqueue_task)),
      enqueue_torrent_(std::move(enqueue_torrent)) {}

void AutomationAgent::configure(std::filesystem::path watch_dir, bool enabled,
                                std::filesystem::path download_path) {
  bool dir_changed = watch_dir_ != watch_dir;
  watch_dir_ = std::move(watch_dir);
  enabled_ = enabled;
  download_path_ = std::move(download_path);
  if (!enabled_ || watch_dir_.empty() || dir_changed) {
    watch_dir_snapshots_.clear();
  }
}

void AutomationAgent::set_download_path(std::filesystem::path download_path) {
  download_path_ = std::move(download_path);
}

void AutomationAgent::scan() {
  if (!enabled_ || watch_dir_.empty()) {
    watch_dir_snapshots_.clear();
    return;
  }
  auto directory = watch_dir_;
  auto download_path = download_path_;
  schedule_io_([this, directory = std::move(directory), download_path]() mutable {
    auto entries = collect_watch_entries(directory);
    enqueue_task_([this, directory = std::move(directory),
                   download_path = std::move(download_path),
                   entries = std::move(entries)]() mutable {
      process_watch_entries(directory, std::move(download_path),
                            std::move(entries));
    });
  });
}

std::vector<AutomationAgent::WatchEntryInfo>
AutomationAgent::collect_watch_entries(std::filesystem::path const &watch_dir) {
  std::vector<WatchEntryInfo> result;
  if (watch_dir.empty()) {
    return result;
  }
  std::error_code ec;
  std::filesystem::create_directories(watch_dir, ec);
  if (ec) {
    TT_LOG_INFO("failed to create watch-dir {}: {}", watch_dir.string(), ec.message());
    return result;
  }
  for (auto const &entry :
       std::filesystem::directory_iterator(watch_dir, ec)) {
    if (ec) {
      TT_LOG_INFO("watch-dir iteration failed: {}", ec.message());
      break;
    }
    std::error_code file_ec;
    if (!entry.is_regular_file(file_ec) || file_ec) {
      continue;
    }
    auto path = entry.path();
    if (path.extension() != ".torrent") {
      continue;
    }
    auto size = entry.file_size(file_ec);
    if (file_ec) {
      continue;
    }
    if (size > kMaxWatchFileSize) {
      TT_LOG_INFO("watch-dir skipping oversized file {} ({} bytes)",
                  path.string(), size);
      continue;
    }
    auto mtime = entry.last_write_time(file_ec);
    if (file_ec) {
      continue;
    }
    result.push_back(WatchEntryInfo{path, size, mtime});
  }
  return result;
}

void AutomationAgent::process_watch_entries(
    std::filesystem::path const &watch_dir,
    std::filesystem::path download_path,
    std::vector<WatchEntryInfo> entries) {
  auto now = std::chrono::steady_clock::now();
  std::unordered_set<std::filesystem::path> seen;
  seen.reserve(entries.size());
  for (auto const &entry : entries) {
    seen.insert(entry.path);
    auto it = watch_dir_snapshots_.find(entry.path);
    if (it == watch_dir_snapshots_.end()) {
      watch_dir_snapshots_.emplace(entry.path,
                                   WatchFileSnapshot{entry.size, entry.mtime, now});
      continue;
    }
    auto &snapshot = it->second;
    if (snapshot.size != entry.size || snapshot.mtime != entry.mtime) {
      snapshot.size = entry.size;
      snapshot.mtime = entry.mtime;
      snapshot.last_change = now;
      continue;
    }
    if (now - snapshot.last_change < kWatchFileStabilityThreshold) {
      continue;
    }
    std::ifstream input(entry.path, std::ios::binary);
    if (!input) {
      mark_watch_file(entry.path, ".invalid");
      continue;
    }
    std::vector<std::uint8_t> buffer((std::istreambuf_iterator<char>(input)),
                                     std::istreambuf_iterator<char>());
    if (buffer.empty()) {
      mark_watch_file(entry.path, ".invalid");
      continue;
    }
    TorrentAddRequest request;
    request.metainfo = std::move(buffer);
    request.download_path = download_path;
    auto status = enqueue_torrent_(std::move(request));
    if (status == Core::AddTorrentStatus::Ok) {
      mark_watch_file(entry.path, ".added");
      continue;
    }
    auto reason = status == Core::AddTorrentStatus::InvalidUri
                      ? "invalid torrent metadata"
                      : "failed to queue torrent";
    TT_LOG_INFO("watch-dir enqueue failed for {}: {}", entry.path.string(), reason);
    mark_watch_file(entry.path, ".invalid");
  }
  for (auto it = watch_dir_snapshots_.begin();
       it != watch_dir_snapshots_.end();) {
    if (seen.contains(it->first)) {
      ++it;
      continue;
    }
    it = watch_dir_snapshots_.erase(it);
  }
}

void AutomationAgent::mark_watch_file(std::filesystem::path const &source,
                                      char const *suffix) {
  if (source.empty()) {
    return;
  }
  std::error_code ec;
  auto target = source;
  watch_dir_snapshots_.erase(source);
  target += suffix;
  std::filesystem::remove(target, ec);
  std::filesystem::rename(source, target, ec);
  if (ec) {
    TT_LOG_INFO("failed to rename watch file {}: {}", source.string(), ec.message());
  }
}

} // namespace tt::engine
