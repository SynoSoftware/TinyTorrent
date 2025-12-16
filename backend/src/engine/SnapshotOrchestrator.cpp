#include "engine/SnapshotOrchestrator.hpp"

#include "engine/HistoryAgent.hpp"
#include "engine/PersistenceManager.hpp"
#include "engine/SnapshotBuilder.hpp"
#include "engine/TorrentManager.hpp"

#include <chrono>
#include <memory>

namespace tt::engine
{

SnapshotOrchestrator::SnapshotOrchestrator(TorrentManager *manager,
                                           SnapshotBuilder *builder,
                                           PersistenceManager *persistence,
                                           HistoryAgent *history)
    : manager_(manager), builder_(builder), persistence_(persistence),
      history_(history)
{
}

SnapshotOrchestrator::Clock::time_point SnapshotOrchestrator::Clock::now()
{
    return std::chrono::steady_clock::now();
}

void SnapshotOrchestrator::rebuild()
{
    // TODO: Pull statuses from TorrentManager and use builder_ to create
    // TorrentSnapshot entries. Populate SessionSnapshot with session totals and
    // cumulative stats, then publish via TorrentManager::store_snapshot.
}

void SnapshotOrchestrator::mark_torrent_dirty(int /*id*/)
{
    // TODO: Bump per-torrent revision so rebuild emits updated snapshot entry.
}

std::shared_ptr<SessionSnapshot> SnapshotOrchestrator::snapshot_copy() const
{
    // TODO: Return TorrentManager::snapshot_copy or local cached snapshot.
    return {};
}

} // namespace tt::engine
