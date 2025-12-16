#pragma once

#include "engine/Core.hpp" // SessionSnapshot

#include <chrono>
#include <functional>
#include <memory>

namespace tt::engine
{

class SnapshotBuilder;
class TorrentManager;
class PersistenceManager;
class HistoryAgent;

// SnapshotOrchestrator coordinates snapshot construction and publication.
// Plan:
//  - Own a SnapshotBuilder and build SessionSnapshot on each tick or alert.
//  - Keep torrent revisions consistent and purge missing IDs via
//  TorrentManager.
//  - Record session totals/history deltas and update cumulative stats.
//  - Expose snapshot_copy() for RPC thread and mark_torrent_dirty() hook.
class SnapshotOrchestrator
{
  public:
    struct Clock
    {
        using time_point = std::chrono::steady_clock::time_point;
        using duration = std::chrono::steady_clock::duration;
        static time_point now();
    };

    SnapshotOrchestrator(TorrentManager *manager, SnapshotBuilder *builder,
                         PersistenceManager *persistence,
                         HistoryAgent *history);

    // Trigger a snapshot rebuild using current torrent statuses.
    void rebuild();

    // Mark a torrent for revision bump prior to rebuild.
    void mark_torrent_dirty(int id);

    // Return the latest published snapshot copy for consumers.
    std::shared_ptr<SessionSnapshot> snapshot_copy() const;

  private:
    TorrentManager *manager_ = nullptr;
    SnapshotBuilder *builder_ = nullptr;
    PersistenceManager *persistence_ = nullptr;
    HistoryAgent *history_ = nullptr;

    // TODO: track torrent revisions and cumulative stats.
    // TODO: integrate history recording (download/upload deltas).
    // TODO: integrate SessionTotals capture and elapsed time tracking.
};

} // namespace tt::engine
