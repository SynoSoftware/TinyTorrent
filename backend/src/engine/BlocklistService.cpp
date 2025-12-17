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

    tasks_->submit(
        [this]
        {
            auto result = manager_->reload();
            if (!result)
            {
                if (callbacks_.log_info)
                    callbacks_.log_info("blocklist: no path or empty file");
                return;
            }

            // apply on engine thread
            torrents_->enqueue_task(
                [this, r = *result]() mutable
                {
                    torrents_->set_ip_filter(r.filter);
                    entries_ = r.entries;
                    last_update_ = r.timestamp;
                    if (callbacks_.log_info)
                    {
                        callbacks_.log_info(
                            std::string("blocklist applied, entries=") +
                            std::to_string(entries_));
                    }
                });
        });
    return true;
}

} // namespace tt::engine
