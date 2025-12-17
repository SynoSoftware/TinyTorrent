#include "engine/BlocklistService.hpp"

#include "engine/AsyncTaskService.hpp"
#include "engine/BlocklistManager.hpp"
#include "engine/TorrentManager.hpp"

namespace tt::engine
{

BlocklistService::BlocklistService(BlocklistManager *manager,
                                   AsyncTaskService *tasks,
                                   TorrentManager *torrents,
                                   Callbacks callbacks)
    : manager_(manager), tasks_(tasks), torrents_(torrents),
      callbacks_(std::move(callbacks))
{
}

bool BlocklistService::reload_async()
{
    if (manager_ == nullptr || tasks_ == nullptr || torrents_ == nullptr)
        return false;

    bool expected = false;
    if (!updating_.compare_exchange_strong(expected, true,
                                           std::memory_order_acq_rel))
    {
        return false;
    }

    tasks_->submit(
        [this]
        {
            auto result = manager_->reload();
            if (!result)
            {
                if (callbacks_.log_info)
                    callbacks_.log_info("blocklist: no path or empty file");
                updating_.store(false, std::memory_order_release);
                return;
            }

            // apply on engine thread
            torrents_->enqueue_task(
                [this, data = std::move(*result)]() mutable
                {
                    torrents_->set_ip_filter(std::move(data.filter));
                    entries_ = data.entries;
                    last_update_ = data.timestamp;
                    if (callbacks_.log_info)
                    {
                        callbacks_.log_info(
                            std::string("blocklist applied, entries=") +
                            std::to_string(entries_));
                    }
                    updating_.store(false, std::memory_order_release);
                });
        });
    return true;
}

} // namespace tt::engine
