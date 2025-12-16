#pragma once

#include <chrono>
#include <functional>
#include <filesystem>
#include <optional>

namespace tt::engine
{

class BlocklistManager;
class AsyncTaskService;
class TorrentManager;

// BlocklistService coordinates async blocklist reloads and application to
// TorrentManager. Intended to replace Core's inline schedule_blocklist_reload.
// Plan:
//  - Expose a reload() that offloads parsing to AsyncTaskService and then
//    applies the new filter on the engine thread.
//  - Track entries/last-update for stats/UI.
//  - Surface errors via a callback or logger.
class BlocklistService
{
  public:
    struct Callbacks
    {
        std::function<void(std::string const &)> log_info;
        std::function<void(std::string const &)> log_error;
    };

    BlocklistService(BlocklistManager *manager,
                     AsyncTaskService *tasks,
                     TorrentManager *torrents,
                     Callbacks callbacks = {});

    // Schedule a reload if a path is configured. Non-blocking.
    bool reload_async();

    std::size_t entries() const noexcept { return entries_; }
    std::optional<std::chrono::system_clock::time_point> last_update() const
    {
        return last_update_;
    }

  private:
    BlocklistManager *manager_ = nullptr;
    AsyncTaskService *tasks_ = nullptr;
    TorrentManager *torrents_ = nullptr;
    Callbacks callbacks_{};

    std::size_t entries_ = 0;
    std::optional<std::chrono::system_clock::time_point> last_update_;
};

} // namespace tt::engine
