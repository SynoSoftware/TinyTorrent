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
    // TODO: If manager_ has a path, run manager_->reload() on tasks_ then
    // enqueue application of the resulting ip_filter on TorrentManager.
    // Update entries_/last_update_ and log via callbacks_.
    return true;
}

} // namespace tt::engine
