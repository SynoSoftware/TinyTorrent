#pragma once

#pragma once

#include "engine/Core.hpp"

#include <functional>
#include <optional>
#include <shared_mutex>
#include <unordered_map>
#include <vector>

#include <libtorrent/torrent_handle.hpp>
#include <libtorrent/torrent_status.hpp>

namespace tt::engine
{

class PersistenceManager;

class SnapshotBuilder
{
  public:
    SnapshotBuilder(
        PersistenceManager *persistence,
        std::unordered_map<int, int> &priorities,
        std::shared_mutex &priorities_mutex,
        std::function<std::uint64_t(int)> ensure_revision,
        std::function<std::string(std::string const &)> error_lookup);

    TorrentSnapshot
    build_snapshot(int rpc_id, libtorrent::v2::torrent_status const &status,
                   std::uint64_t revision = 0,
                   std::optional<std::int64_t> previous_added = std::nullopt);

    TorrentDetail collect_detail(int rpc_id,
                                 libtorrent::torrent_handle const &handle,
                                 libtorrent::v2::torrent_status const &status);

  private:
    std::vector<TorrentFileInfo>
    collect_files(libtorrent::torrent_handle const &handle);

    std::vector<TorrentTrackerInfo>
    collect_trackers(libtorrent::torrent_handle const &handle);

    std::vector<TorrentPeerInfo>
    collect_peers(libtorrent::torrent_handle const &handle);

    PersistenceManager *persistence_ = nullptr;
    std::unordered_map<int, int> &priorities_;
    std::shared_mutex &priorities_mutex_;
    std::function<std::uint64_t(int)> ensure_revision_;
    std::function<std::string(std::string const &)> error_lookup_;
};

} // namespace tt::engine
