#pragma once

#include "engine/Core.hpp"

// FIX: Include Libtorrent headers directly to avoid namespace v1/v2 ambiguity
#include <libtorrent/torrent_handle.hpp>
#include <libtorrent/torrent_status.hpp>

#include <chrono>
#include <filesystem>
#include <functional>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace tt::engine
{

class AutomationAgent
{
  public:
    using TaskScheduler = std::function<void(std::function<void()>)>;
    using TorrentEnqueueFn =
        std::function<Core::AddTorrentStatus(TorrentAddRequest)>;
    using MoveStorageFn = std::function<void(
        std::string const &hash, std::filesystem::path const &path)>;

    AutomationAgent(TaskScheduler schedule_io, TaskScheduler enqueue_task,
                    TorrentEnqueueFn enqueue_torrent,
                    MoveStorageFn move_storage_callback);

    AutomationAgent(AutomationAgent const &) = delete;
    AutomationAgent &operator=(AutomationAgent const &) = delete;

    void configure(std::filesystem::path watch_dir, bool watch_enabled,
                   std::filesystem::path download_path,
                   std::filesystem::path incomplete_dir,
                   bool incomplete_enabled);

    void set_download_path(std::filesystem::path download_path);
    void scan();

    void process_completion(libtorrent::torrent_handle const &handle,
                            libtorrent::torrent_status const &status);

  private:
    struct WatchFileSnapshot
    {
        std::uintmax_t size = 0;
        std::filesystem::file_time_type mtime;
        std::chrono::steady_clock::time_point last_change =
            std::chrono::steady_clock::time_point::min();
    };

    struct WatchEntryInfo
    {
        std::filesystem::path path;
        std::uintmax_t size = 0;
        std::filesystem::file_time_type mtime;
    };

    static std::vector<WatchEntryInfo>
    collect_watch_entries(std::filesystem::path const &watch_dir);
    void process_watch_entries(std::filesystem::path const &watch_dir,
                               std::filesystem::path download_path,
                               std::vector<WatchEntryInfo> entries);
    void mark_watch_file(std::filesystem::path const &source,
                         char const *suffix);

    std::filesystem::path determine_completion_destination(
        std::filesystem::path const &base, std::filesystem::path const &current,
        std::string const &name, std::string const &hash);

    std::filesystem::path
    resolve_unique_completion_target(std::filesystem::path const &target,
                                     std::filesystem::path const &current);

    TaskScheduler schedule_io_;
    TaskScheduler enqueue_task_;
    TorrentEnqueueFn enqueue_torrent_;
    MoveStorageFn move_storage_callback_;

    bool watch_enabled_ = false;
    std::filesystem::path watch_dir_;
    std::filesystem::path download_path_;

    bool incomplete_enabled_ = false;
    std::filesystem::path incomplete_dir_;

    std::unordered_map<std::filesystem::path, WatchFileSnapshot>
        watch_dir_snapshots_;
};

} // namespace tt::engine