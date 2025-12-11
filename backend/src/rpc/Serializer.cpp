#include "rpc/Serializer.hpp"

#include <cstdint>
#include <limits>
#include <optional>
#include <string>
#include <string_view>
#include <yyjson.h>

#include <cstdlib>
#include "utils/Json.hpp"

namespace tt::rpc {

namespace {

char const *message_for_status(engine::Core::AddTorrentStatus status) {
  switch (status) {
    case engine::Core::AddTorrentStatus::Ok:
      return "torrent queued";
    case engine::Core::AddTorrentStatus::InvalidUri:
      return "invalid magnet URI";
  }
  return "unknown status";
}

} // namespace

std::optional<std::uint16_t> parse_listen_port(std::string_view interface) {
  auto colon = interface.find_last_of(':');
  if (colon == std::string_view::npos) {
    return std::nullopt;
  }
  auto port_str = interface.substr(colon + 1);
  try {
    auto port = std::stoi(std::string(port_str));
    if (port < 0 || port > std::numeric_limits<std::uint16_t>::max()) {
      return std::nullopt;
    }
    return static_cast<std::uint16_t>(port);
  } catch (...) {
    return std::nullopt;
  }
}

std::string serialize_session_settings(engine::CoreSettings const &settings) {
  tt::json::MutableDocument doc;
  if (!doc.is_valid()) {
    return "{}";
  }

  auto *native = doc.doc();
  auto *root = yyjson_mut_obj(native);
  doc.set_root(root);
  yyjson_mut_obj_add_str(native, root, "result", "success");

  auto *arguments = yyjson_mut_obj(native);
  yyjson_mut_obj_add_val(native, root, "arguments", arguments);

  yyjson_mut_obj_add_str(native, arguments, "version", "TinyTorrent 0.1.0");
  yyjson_mut_obj_add_uint(native, arguments, "rpc-version", 17);
  yyjson_mut_obj_add_uint(native, arguments, "rpc-version-min", 1);
  yyjson_mut_obj_add_str(native, arguments, "download-dir",
                         settings.download_path.string().c_str());
  if (auto port = parse_listen_port(settings.listen_interface)) {
    yyjson_mut_obj_add_uint(native, arguments, "peer-port", *port);
  }

  return doc.write("{}");
}

std::string serialize_session_stats(engine::SessionSnapshot const &snapshot) {
  tt::json::MutableDocument doc;
  if (!doc.is_valid()) {
    return "{}";
  }

  auto *native = doc.doc();
  auto *root = yyjson_mut_obj(native);
  doc.set_root(root);
  yyjson_mut_obj_add_str(native, root, "result", "success");

  auto *arguments = yyjson_mut_obj(native);
  yyjson_mut_obj_add_val(native, root, "arguments", arguments);
  yyjson_mut_obj_add_uint(native, arguments, "downloadSpeed",
                          snapshot.download_rate);
  yyjson_mut_obj_add_uint(native, arguments, "uploadSpeed",
                          snapshot.upload_rate);
  yyjson_mut_obj_add_uint(native, arguments, "torrentCount",
                          static_cast<std::uint64_t>(snapshot.torrent_count));
  yyjson_mut_obj_add_uint(native, arguments, "activeTorrentCount",
                          static_cast<std::uint64_t>(snapshot.active_torrent_count));
  yyjson_mut_obj_add_uint(native, arguments, "pausedTorrentCount",
                          static_cast<std::uint64_t>(snapshot.paused_torrent_count));
  yyjson_mut_obj_add_uint(native, arguments, "dhtNodes", snapshot.dht_nodes);

  auto *cumulative = yyjson_mut_obj(native);
  yyjson_mut_obj_add_uint(native, cumulative, "uploadedBytes", 0);
  yyjson_mut_obj_add_uint(native, cumulative, "downloadedBytes", 0);
  yyjson_mut_obj_add_uint(native, cumulative, "filesAdded", 0);
  yyjson_mut_obj_add_uint(native, cumulative, "secondsActive", 0);
  yyjson_mut_obj_add_uint(native, cumulative, "sessionCount", 0);
  yyjson_mut_obj_add_val(native, arguments, "cumulativeStats", cumulative);

  auto *current = yyjson_mut_obj(native);
  yyjson_mut_obj_add_uint(native, current, "uploadedBytes", 0);
  yyjson_mut_obj_add_uint(native, current, "downloadedBytes", 0);
  yyjson_mut_obj_add_uint(native, current, "filesAdded", 0);
  yyjson_mut_obj_add_uint(native, current, "secondsActive", 0);
  yyjson_mut_obj_add_uint(native, current, "sessionCount", 0);
  yyjson_mut_obj_add_val(native, arguments, "currentStats", current);

  return doc.write(R"({"result":"error"})");
}

static void add_torrent_summary(yyjson_mut_doc *doc, yyjson_mut_val *entry,
                                engine::TorrentSnapshot const &torrent) {
  yyjson_mut_obj_add_sint(doc, entry, "id", torrent.id);
  yyjson_mut_obj_add_str(doc, entry, "hashString", torrent.hash.c_str());
  yyjson_mut_obj_add_str(doc, entry, "name", torrent.name.c_str());
  yyjson_mut_obj_add_sint(doc, entry, "totalSize", torrent.total_size);
  yyjson_mut_obj_add_real(doc, entry, "percentDone", torrent.progress);
  yyjson_mut_obj_add_sint(doc, entry, "status", torrent.status);
  yyjson_mut_obj_add_uint(doc, entry, "rateDownload", torrent.download_rate);
  yyjson_mut_obj_add_uint(doc, entry, "rateUpload", torrent.upload_rate);
  yyjson_mut_obj_add_sint(doc, entry, "peersConnected", torrent.peers_connected);
  yyjson_mut_obj_add_sint(doc, entry, "peersSendingToUs",
                          torrent.peers_sending_to_us);
  yyjson_mut_obj_add_sint(doc, entry, "peersGettingFromUs",
                          torrent.peers_getting_from_us);
  yyjson_mut_obj_add_sint(doc, entry, "eta", torrent.eta);
  yyjson_mut_obj_add_sint(doc, entry, "addedDate", torrent.added_time);
  yyjson_mut_obj_add_sint(doc, entry, "queuePosition", torrent.queue_position);
  yyjson_mut_obj_add_real(doc, entry, "uploadRatio", torrent.ratio);
  yyjson_mut_obj_add_sint(doc, entry, "uploadedEver", torrent.uploaded);
  yyjson_mut_obj_add_sint(doc, entry, "downloadedEver", torrent.downloaded);
  yyjson_mut_obj_add_str(doc, entry, "downloadDir", torrent.download_dir.c_str());
  yyjson_mut_obj_add_sint(doc, entry, "leftUntilDone", torrent.left_until_done);
  yyjson_mut_obj_add_sint(doc, entry, "sizeWhenDone", torrent.size_when_done);
  yyjson_mut_obj_add_sint(doc, entry, "error", torrent.error);
  yyjson_mut_obj_add_str(doc, entry, "errorString", torrent.error_string.c_str());
  yyjson_mut_obj_add_bool(doc, entry, "sequentialDownload",
                         torrent.sequential_download);
  yyjson_mut_obj_add_bool(doc, entry, "superSeeding", torrent.super_seeding);
  yyjson_mut_obj_add_bool(doc, entry, "isFinished", torrent.is_finished);
}

std::string serialize_torrent_list(
    std::vector<engine::TorrentSnapshot> const &torrents) {
  tt::json::MutableDocument doc;
  if (!doc.is_valid()) {
    return "{}";
  }

  auto *native = doc.doc();
  auto *root = yyjson_mut_obj(native);
  doc.set_root(root);
  yyjson_mut_obj_add_str(native, root, "result", "success");

  auto *arguments = yyjson_mut_obj(native);
  yyjson_mut_obj_add_val(native, root, "arguments", arguments);

  auto *array = yyjson_mut_arr(native);
  yyjson_mut_obj_add_val(native, arguments, "torrents", array);

  for (auto const &torrent : torrents) {
    auto *entry = yyjson_mut_obj(native);
    add_torrent_summary(native, entry, torrent);
    yyjson_mut_arr_add_val(array, entry);
  }

  return doc.write(R"({"result":"error"})");
}

std::string serialize_torrent_detail(
    std::vector<engine::TorrentDetail> const &details) {
  tt::json::MutableDocument doc;
  if (!doc.is_valid()) {
    return "{}";
  }

  auto *native = doc.doc();
  auto *root = yyjson_mut_obj(native);
  doc.set_root(root);
  yyjson_mut_obj_add_str(native, root, "result", "success");

  auto *arguments = yyjson_mut_obj(native);
  yyjson_mut_obj_add_val(native, root, "arguments", arguments);

  auto *array = yyjson_mut_arr(native);
  yyjson_mut_obj_add_val(native, arguments, "torrents", array);

  for (auto const &detail : details) {
    auto *entry = yyjson_mut_obj(native);
    add_torrent_summary(native, entry, detail.summary);

    auto *files = yyjson_mut_arr(native);
    yyjson_mut_obj_add_val(native, entry, "files", files);
    for (auto const &file : detail.files) {
      auto *file_entry = yyjson_mut_obj(native);
      yyjson_mut_obj_add_sint(native, file_entry, "index", file.index);
      yyjson_mut_obj_add_str(native, file_entry, "name", file.name.c_str());
      yyjson_mut_obj_add_uint(native, file_entry, "length", file.length);
      yyjson_mut_obj_add_uint(native, file_entry, "bytesCompleted",
                              file.bytes_completed);
      yyjson_mut_obj_add_real(native, file_entry, "progress", file.progress);
      yyjson_mut_obj_add_sint(native, file_entry, "priority", file.priority);
      yyjson_mut_obj_add_bool(native, file_entry, "wanted", file.wanted);
      yyjson_mut_arr_add_val(files, file_entry);
    }

    auto *trackers = yyjson_mut_arr(native);
    yyjson_mut_obj_add_val(native, entry, "trackers", trackers);
    for (auto const &tracker : detail.trackers) {
      auto *tracker_entry = yyjson_mut_obj(native);
      yyjson_mut_obj_add_str(native, tracker_entry, "announce",
                            tracker.announce.c_str());
      yyjson_mut_obj_add_sint(native, tracker_entry, "tier", tracker.tier);
      yyjson_mut_arr_add_val(trackers, tracker_entry);
    }

    auto *peers = yyjson_mut_arr(native);
    yyjson_mut_obj_add_val(native, entry, "peers", peers);
    for (auto const &peer : detail.peers) {
      auto *peer_entry = yyjson_mut_obj(native);
      yyjson_mut_obj_add_str(native, peer_entry, "address", peer.address.c_str());
      yyjson_mut_obj_add_bool(native, peer_entry, "clientIsChoking",
                             peer.client_is_choking);
      yyjson_mut_obj_add_bool(native, peer_entry, "clientIsInterested",
                             peer.client_is_interested);
      yyjson_mut_obj_add_bool(native, peer_entry, "peerIsChoking",
                             peer.peer_is_choking);
      yyjson_mut_obj_add_bool(native, peer_entry, "peerIsInterested",
                             peer.peer_is_interested);
      yyjson_mut_obj_add_str(native, peer_entry, "clientName",
                            peer.client_name.c_str());
      yyjson_mut_obj_add_uint(native, peer_entry, "rateToClient",
                              peer.rate_to_client);
      yyjson_mut_obj_add_uint(native, peer_entry, "rateToPeer",
                              peer.rate_to_peer);
      yyjson_mut_obj_add_real(native, peer_entry, "progress", peer.progress);
      yyjson_mut_obj_add_str(native, peer_entry, "flagStr", peer.flag_str.c_str());
      yyjson_mut_arr_add_val(peers, peer_entry);
    }

    yyjson_mut_obj_add_uint(native, entry, "pieceCount", detail.piece_count);
    yyjson_mut_obj_add_uint(native, entry, "pieceSize", detail.piece_size);

    auto *states = yyjson_mut_arr(native);
    yyjson_mut_obj_add_val(native, entry, "pieceStates", states);
    for (int value : detail.piece_states) {
      yyjson_mut_arr_add_uint(native, states, static_cast<std::uint64_t>(value));
    }

    auto *availability = yyjson_mut_arr(native);
    yyjson_mut_obj_add_val(native, entry, "pieceAvailability", availability);
    for (int value : detail.piece_availability) {
      yyjson_mut_arr_add_uint(native, availability,
                              static_cast<std::uint64_t>(value));
    }

    yyjson_mut_arr_add_val(array, entry);
  }

  return doc.write(R"({"result":"error"})");
}

std::string serialize_free_space(std::string const &path, std::uint64_t sizeBytes,
                                 std::uint64_t totalSize) {
  tt::json::MutableDocument doc;
  if (!doc.is_valid()) {
    return "{}";
  }

  auto *native = doc.doc();
  auto *root = yyjson_mut_obj(native);
  doc.set_root(root);
  yyjson_mut_obj_add_str(native, root, "result", "success");

  auto *arguments = yyjson_mut_obj(native);
  yyjson_mut_obj_add_val(native, root, "arguments", arguments);
  yyjson_mut_obj_add_str(native, arguments, "path", path.c_str());
  yyjson_mut_obj_add_uint(native, arguments, "sizeBytes", sizeBytes);
  yyjson_mut_obj_add_uint(native, arguments, "totalSize", totalSize);

  return doc.write(R"({"result":"error"})");
}

std::string serialize_success() {
  tt::json::MutableDocument doc;
  if (!doc.is_valid()) {
    return "{}";
  }

  auto *native = doc.doc();
  auto *root = yyjson_mut_obj(native);
  doc.set_root(root);
  yyjson_mut_obj_add_str(native, root, "result", "success");

  auto *arguments = yyjson_mut_obj(native);
  yyjson_mut_obj_add_val(native, root, "arguments", arguments);

  return doc.write(R"({"result":"error"})");
}

std::string serialize_torrent_rename(int id, std::string const &name,
                                     std::string const &path) {
  tt::json::MutableDocument doc;
  if (!doc.is_valid()) {
    return "{}";
  }

  auto *native = doc.doc();
  auto *root = yyjson_mut_obj(native);
  doc.set_root(root);
  yyjson_mut_obj_add_str(native, root, "result", "success");

  auto *arguments = yyjson_mut_obj(native);
  yyjson_mut_obj_add_val(native, root, "arguments", arguments);
  yyjson_mut_obj_add_sint(native, arguments, "id", id);
  yyjson_mut_obj_add_str(native, arguments, "name", name.c_str());
  yyjson_mut_obj_add_str(native, arguments, "path", path.c_str());

  return doc.write(R"({"result":"error"})");
}

std::string serialize_session_test(bool port_open) {
  tt::json::MutableDocument doc;
  if (!doc.is_valid()) {
    return "{}";
  }

  auto *native = doc.doc();
  auto *root = yyjson_mut_obj(native);
  doc.set_root(root);
  yyjson_mut_obj_add_str(native, root, "result", "success");

  auto *arguments = yyjson_mut_obj(native);
  yyjson_mut_obj_add_val(native, root, "arguments", arguments);
  yyjson_mut_obj_add_bool(native, arguments, "portIsOpen", port_open);

  return doc.write(R"({"result":"error"})");
}

std::string serialize_add_result(engine::Core::AddTorrentStatus status) {
  tt::json::MutableDocument doc;
  if (!doc.is_valid()) {
    return "{}";
  }

  auto *native = doc.doc();
  auto *root = yyjson_mut_obj(native);
  doc.set_root(root);

  if (status == engine::Core::AddTorrentStatus::Ok) {
    yyjson_mut_obj_add_str(native, root, "result", "success");
  } else {
    yyjson_mut_obj_add_str(native, root, "result", "error");
  }

  auto *arguments = yyjson_mut_obj(native);
  yyjson_mut_obj_add_val(native, root, "arguments", arguments);
  yyjson_mut_obj_add_str(native, arguments, "message",
                        message_for_status(status));

  return doc.write(R"({"result":"error"})");
}

std::string serialize_error(std::string_view message) {
  tt::json::MutableDocument doc;
  if (!doc.is_valid()) {
    return "{}";
  }

  auto *native = doc.doc();
  auto *root = yyjson_mut_obj(native);
  doc.set_root(root);
  yyjson_mut_obj_add_str(native, root, "result", "error");

  auto *arguments = yyjson_mut_obj(native);
  yyjson_mut_obj_add_val(native, root, "arguments", arguments);
  yyjson_mut_obj_add_strn(native, arguments, "message", message.data(),
                          message.size());

  return doc.write(R"({"result":"error"})");
}

} // namespace tt::rpc
