#pragma once

#include "engine/Core.hpp"

#include <chrono>
#include <filesystem>
#include <functional>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace tt::engine {

class AutomationAgent {
public:
  using TaskScheduler = std::function<void(std::function<void()>)>;
  using TorrentEnqueueFn = std::function<Core::AddTorrentStatus(TorrentAddRequest)>;

  AutomationAgent(TaskScheduler schedule_io,
                  TaskScheduler enqueue_task,
                  TorrentEnqueueFn enqueue_torrent);

  AutomationAgent(AutomationAgent const &) = delete;
  AutomationAgent &operator=(AutomationAgent const &) = delete;

  void configure(std::filesystem::path watch_dir, bool enabled,
                 std::filesystem::path download_path);
  void set_download_path(std::filesystem::path download_path);
  void scan();

private:
  struct WatchFileSnapshot {
    std::uintmax_t size = 0;
    std::filesystem::file_time_type mtime;
    std::chrono::steady_clock::time_point last_change =
        std::chrono::steady_clock::time_point::min();
  };

  struct WatchEntryInfo {
    std::filesystem::path path;
    std::uintmax_t size = 0;
    std::filesystem::file_time_type mtime;
  };

  static std::vector<WatchEntryInfo> collect_watch_entries(
      std::filesystem::path const &watch_dir);
  void process_watch_entries(std::filesystem::path const &watch_dir,
                             std::filesystem::path download_path,
                             std::vector<WatchEntryInfo> entries);
  void mark_watch_file(std::filesystem::path const &source, char const *suffix);

  TaskScheduler schedule_io_;
  TaskScheduler enqueue_task_;
  TorrentEnqueueFn enqueue_torrent_;

  bool enabled_ = false;
  std::filesystem::path watch_dir_;
  std::filesystem::path download_path_;
  std::unordered_map<std::filesystem::path, WatchFileSnapshot> watch_dir_snapshots_;
};

} // namespace tt::engine
