#include "engine/SnapshotBuilder.hpp"

#include "engine/PersistenceManager.hpp"
#include "engine/TorrentUtils.hpp"

#include <algorithm>
#include <shared_mutex>

#include <libtorrent/file_storage.hpp>
#include <libtorrent/peer_info.hpp>
#include <libtorrent/torrent_flags.hpp>
#include <libtorrent/torrent_info.hpp>
#include <libtorrent/torrent_status.hpp>

namespace
{

std::int64_t estimate_eta(libtorrent::v2::torrent_status const &status)
{
    if (status.download_rate <= 0)
    {
        return -1;
    }
    auto remaining = status.total_wanted - status.total_wanted_done;
    if (remaining <= 0)
    {
        return 0;
    }
    return (remaining + static_cast<std::int64_t>(status.download_rate) - 1) /
           static_cast<std::int64_t>(status.download_rate);
}

std::string to_state_string(libtorrent::v2::torrent_status::state_t state)
{
    using state_t = libtorrent::v2::torrent_status::state_t;
    switch (state)
    {
    case state_t::checking_files:
        return "checking-files";
    case state_t::downloading_metadata:
        return "downloading-metadata";
    case state_t::downloading:
        return "downloading";
    case state_t::finished:
        return "finished";
    case state_t::seeding:
        return "seeding";
    case state_t::checking_resume_data:
        return "checking-resume-data";
    default:
        return "unknown";
    }
}

int to_transmission_status(libtorrent::v2::torrent_status const &status)
{
    if (status.flags & libtorrent::torrent_flags::paused)
    {
        return 0;
    }
    switch (status.state)
    {
    case libtorrent::v2::torrent_status::state_t::checking_files:
    case libtorrent::v2::torrent_status::state_t::checking_resume_data:
        return 2;
    case libtorrent::v2::torrent_status::state_t::downloading_metadata:
    case libtorrent::v2::torrent_status::state_t::downloading:
        return 4;
    case libtorrent::v2::torrent_status::state_t::finished:
    case libtorrent::v2::torrent_status::state_t::seeding:
        return 6;
    default:
        return 0;
    }
}

} // namespace

namespace tt::engine
{

SnapshotBuilder::SnapshotBuilder(
    PersistenceManager *persistence, std::unordered_map<int, int> &priorities,
    std::shared_mutex &priorities_mutex,
    std::function<std::uint64_t(int)> ensure_revision,
    std::function<std::string(std::string const &)> error_lookup)
    : persistence_(persistence), priorities_(priorities),
      priorities_mutex_(priorities_mutex),
      ensure_revision_(std::move(ensure_revision)),
      error_lookup_(std::move(error_lookup))
{
}

TorrentSnapshot
SnapshotBuilder::build_snapshot(int rpc_id,
                                libtorrent::v2::torrent_status const &status,
                                std::uint64_t revision)
{
    TorrentSnapshot snapshot;
    snapshot.id = rpc_id;
    snapshot.hash = info_hash_to_hex(status.info_hashes);
    snapshot.name = status.name;
    snapshot.state = to_state_string(status.state);
    snapshot.progress = status.progress;
    snapshot.total_wanted = status.total_wanted;
    snapshot.total_done = status.total_wanted_done;
    snapshot.total_size = status.total;
    snapshot.downloaded = status.total_payload_download;
    snapshot.uploaded = status.total_payload_upload;
    snapshot.download_rate = status.download_payload_rate;
    snapshot.upload_rate = status.upload_payload_rate;
    snapshot.status = to_transmission_status(status);
    snapshot.queue_position = static_cast<int>(status.queue_position);
    snapshot.peers_connected = status.num_peers;
    snapshot.seeds_connected = status.num_seeds;
    snapshot.peers_sending_to_us = status.num_seeds;
    snapshot.peers_getting_from_us =
        std::max(0, status.num_peers - status.num_seeds);
    snapshot.eta = estimate_eta(status);
    snapshot.total_wanted_done = status.total_wanted_done;
    snapshot.added_time = status.added_time;
    snapshot.ratio =
        status.total_download > 0
            ? static_cast<double>(status.total_upload) / status.total_download
            : 0.0;
    snapshot.is_finished = status.is_finished;
    snapshot.sequential_download = static_cast<bool>(
        status.flags & libtorrent::torrent_flags::sequential_download);
    snapshot.super_seeding = static_cast<bool>(
        status.flags & libtorrent::torrent_flags::super_seeding);
    snapshot.download_dir = status.save_path;
    snapshot.error = status.errc.value();
    snapshot.error_string = status.errc.message();
    if (auto override = error_lookup_(snapshot.hash); !override.empty())
    {
        snapshot.error_string = std::move(override);
    }
    snapshot.left_until_done = std::max<std::int64_t>(
        0, status.total_wanted - status.total_wanted_done);
    snapshot.size_when_done = status.total_wanted;
    if (revision == 0)
    {
        revision = ensure_revision_(rpc_id);
    }
    snapshot.revision = revision;

    {
        std::shared_lock<std::shared_mutex> lock(priorities_mutex_);
        auto priority_it = priorities_.find(rpc_id);
        if (priority_it != priorities_.end())
        {
            snapshot.bandwidth_priority = priority_it->second;
        }
    }

    return snapshot;
}

TorrentDetail
SnapshotBuilder::collect_detail(int rpc_id,
                                libtorrent::torrent_handle const &handle,
                                libtorrent::v2::torrent_status const &status)
{
    TorrentDetail detail;
    detail.summary = build_snapshot(rpc_id, status);

    if (persistence_ && !detail.summary.hash.empty())
    {
        detail.summary.labels = persistence_->get_labels(detail.summary.hash);
    }

    detail.files = collect_files(handle);
    detail.trackers = collect_trackers(handle);
    detail.peers = collect_peers(handle);

    if (auto const *ti = handle.torrent_file().get())
    {
        detail.piece_count = ti->num_pieces();
        detail.piece_size = ti->piece_length();
    }
    else
    {
        detail.piece_count = 0;
        detail.piece_size = 0;
    }

    detail.piece_states.clear();
    int const pieces = status.pieces.size();
    if (pieces > 0)
    {
        detail.piece_states.resize(pieces);
        for (int i = 0; i < pieces; ++i)
        {
            detail.piece_states[i] =
                status.pieces.get_bit(libtorrent::piece_index_t(i)) ? 1 : 0;
        }
    }

    std::vector<int> availability;
    handle.piece_availability(availability);
    detail.piece_availability = std::move(availability);

    return detail;
}

std::vector<TorrentFileInfo>
SnapshotBuilder::collect_files(libtorrent::torrent_handle const &handle)
{
    std::vector<TorrentFileInfo> files;
    if (!handle.is_valid())
    {
        return files;
    }
    auto const *ti = handle.torrent_file().get();
    if (ti == nullptr)
    {
        return files;
    }

    std::vector<std::int64_t> progress = handle.file_progress();
    auto const &storage = ti->files();

    files.reserve(storage.num_files());
    for (int index = 0; index < storage.num_files(); ++index)
    {
        libtorrent::file_index_t file_index(index);
        TorrentFileInfo entry;
        entry.index = index;
        entry.name = storage.file_path(file_index);
        entry.length = storage.file_size(file_index);
        entry.bytes_completed =
            index < static_cast<int>(progress.size()) ? progress[index] : 0;
        entry.progress =
            entry.length > 0
                ? static_cast<double>(entry.bytes_completed) / entry.length
                : 0.0;
        auto priority = handle.file_priority(file_index);
        entry.priority = static_cast<int>(
            static_cast<std::uint8_t>(priority)); // explicit conversion
        entry.wanted = priority != libtorrent::dont_download;
        files.push_back(entry);
    }
    return files;
}

std::vector<TorrentTrackerInfo>
SnapshotBuilder::collect_trackers(libtorrent::torrent_handle const &handle)
{
    std::vector<TorrentTrackerInfo> trackers;
    if (!handle.is_valid())
    {
        return trackers;
    }
    auto const *ti = handle.torrent_file().get();
    if (ti == nullptr)
    {
        return trackers;
    }
    auto const &entries = ti->trackers();
    for (auto const &entry : entries)
    {
        TorrentTrackerInfo info;
        info.announce = entry.url;
        info.tier = entry.tier;
        trackers.push_back(info);
    }
    return trackers;
}

std::vector<TorrentPeerInfo>
SnapshotBuilder::collect_peers(libtorrent::torrent_handle const &handle)
{
    std::vector<TorrentPeerInfo> peers;
    if (!handle.is_valid())
    {
        return peers;
    }

    std::vector<libtorrent::peer_info> peer_list;
    handle.get_peer_info(peer_list);
    peers.reserve(peer_list.size());
    for (auto const &peer : peer_list)
    {
        TorrentPeerInfo info;
        info.client_name = peer.client;
        info.client_is_choking =
            static_cast<bool>(peer.flags & libtorrent::peer_info::choked);
        info.client_is_interested =
            static_cast<bool>(peer.flags & libtorrent::peer_info::interesting);
        info.peer_is_choking = !static_cast<bool>(
            peer.flags & libtorrent::peer_info::remote_interested);
        info.peer_is_interested = static_cast<bool>(
            peer.flags & libtorrent::peer_info::remote_interested);
        info.flag_str = std::to_string(static_cast<unsigned>(peer.flags));
        info.rate_to_client = peer.payload_down_speed;
        info.rate_to_peer = peer.payload_up_speed;
        info.progress = peer.progress;
        if (peer.ip.address().is_v4() || peer.ip.address().is_v6())
        {
            info.address = peer.ip.address().to_string() + ":" +
                           std::to_string(peer.ip.port());
        }
        else
        {
            info.address = peer.ip.address().to_string();
        }
        peers.push_back(info);
    }

    return peers;
}

} // namespace tt::engine
