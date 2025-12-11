#include "rpc/Serializer.hpp"

#include <cstdint>
#include <limits>
#include <optional>
#include <string>
#include <string_view>
#include <yyjson.h>

#include <cstdlib>

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
  yyjson_mut_doc *doc = yyjson_mut_doc_new(nullptr);
  if (doc == nullptr) {
    return "{}";
  }

  yyjson_mut_val *root = yyjson_mut_obj(doc);
  yyjson_mut_doc_set_root(doc, root);
  yyjson_mut_obj_add_str(doc, root, "result", "success");

  yyjson_mut_val *arguments = yyjson_mut_obj(doc);
  yyjson_mut_obj_add_val(doc, root, "arguments", arguments);

  yyjson_mut_obj_add_str(doc, arguments, "version", "TinyTorrent 0.1.0");
  yyjson_mut_obj_add_uint(doc, arguments, "rpc-version", 17);
  yyjson_mut_obj_add_uint(doc, arguments, "rpc-version-min", 1);
  yyjson_mut_obj_add_str(doc, arguments, "download-dir",
                         settings.download_path.string().c_str());
  if (auto port = parse_listen_port(settings.listen_interface)) {
    yyjson_mut_obj_add_uint(doc, arguments, "peer-port", *port);
  }

  char *json = yyjson_mut_write(doc, 0, nullptr);
  std::string result = json ? json : "{}";

  yyjson_mut_doc_free(doc);
  std::free(json);
  return result;
}

std::string serialize_session_stats(engine::SessionSnapshot const &snapshot) {
  yyjson_mut_doc *doc = yyjson_mut_doc_new(nullptr);
  if (doc == nullptr) {
    return "{}";
  }

  yyjson_mut_val *root = yyjson_mut_obj(doc);
  yyjson_mut_doc_set_root(doc, root);
  yyjson_mut_obj_add_str(doc, root, "result", "success");

  yyjson_mut_val *arguments = yyjson_mut_obj(doc);
  yyjson_mut_obj_add_val(doc, root, "arguments", arguments);

  yyjson_mut_obj_add_uint(doc, arguments, "downloadSpeed", snapshot.download_rate);
  yyjson_mut_obj_add_uint(doc, arguments, "uploadSpeed", snapshot.upload_rate);
  yyjson_mut_obj_add_uint(doc, arguments, "torrentCount",
                          static_cast<std::uint64_t>(snapshot.torrent_count));
  yyjson_mut_obj_add_uint(doc, arguments, "activeTorrentCount",
                          static_cast<std::uint64_t>(snapshot.active_torrent_count));
  yyjson_mut_obj_add_uint(doc, arguments, "pausedTorrentCount",
                          static_cast<std::uint64_t>(snapshot.paused_torrent_count));
  yyjson_mut_obj_add_uint(doc, arguments, "dhtNodes", snapshot.dht_nodes);

  auto cumulative = yyjson_mut_obj(doc);
  yyjson_mut_obj_add_uint(doc, cumulative, "uploadedBytes", 0);
  yyjson_mut_obj_add_uint(doc, cumulative, "downloadedBytes", 0);
  yyjson_mut_obj_add_uint(doc, cumulative, "filesAdded", 0);
  yyjson_mut_obj_add_uint(doc, cumulative, "secondsActive", 0);
  yyjson_mut_obj_add_uint(doc, cumulative, "sessionCount", 0);
  yyjson_mut_obj_add_val(doc, arguments, "cumulativeStats", cumulative);

  auto current = yyjson_mut_obj(doc);
  yyjson_mut_obj_add_uint(doc, current, "uploadedBytes", 0);
  yyjson_mut_obj_add_uint(doc, current, "downloadedBytes", 0);
  yyjson_mut_obj_add_uint(doc, current, "filesAdded", 0);
  yyjson_mut_obj_add_uint(doc, current, "secondsActive", 0);
  yyjson_mut_obj_add_uint(doc, current, "sessionCount", 0);
  yyjson_mut_obj_add_val(doc, arguments, "currentStats", current);

  char *json = yyjson_mut_write(doc, 0, nullptr);
  std::string response = json ? json : R"({"result":"error"})";

  yyjson_mut_doc_free(doc);
  std::free(json);
  return response;
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
  yyjson_mut_doc *doc = yyjson_mut_doc_new(nullptr);
  if (doc == nullptr) {
    return "{}";
  }

  yyjson_mut_val *root = yyjson_mut_obj(doc);
  yyjson_mut_doc_set_root(doc, root);
  yyjson_mut_obj_add_str(doc, root, "result", "success");

  yyjson_mut_val *arguments = yyjson_mut_obj(doc);
  yyjson_mut_obj_add_val(doc, root, "arguments", arguments);

  yyjson_mut_val *array = yyjson_mut_arr(doc);
  yyjson_mut_obj_add_val(doc, arguments, "torrents", array);

  for (auto const &torrent : torrents) {
    yyjson_mut_val *entry = yyjson_mut_obj(doc);
    add_torrent_summary(doc, entry, torrent);
    yyjson_mut_arr_add_val(array, entry);
  }

  char *json = yyjson_mut_write(doc, 0, nullptr);
  std::string response = json ? json : R"({"result":"error"})";

  yyjson_mut_doc_free(doc);
  std::free(json);
  return response;
}

std::string serialize_torrent_detail(
    std::vector<engine::TorrentDetail> const &details) {
  yyjson_mut_doc *doc = yyjson_mut_doc_new(nullptr);
  if (doc == nullptr) {
    return "{}";
  }

  yyjson_mut_val *root = yyjson_mut_obj(doc);
  yyjson_mut_doc_set_root(doc, root);
  yyjson_mut_obj_add_str(doc, root, "result", "success");

  yyjson_mut_val *arguments = yyjson_mut_obj(doc);
  yyjson_mut_obj_add_val(doc, root, "arguments", arguments);

  yyjson_mut_val *array = yyjson_mut_arr(doc);
  yyjson_mut_obj_add_val(doc, arguments, "torrents", array);

  for (auto const &detail : details) {
    yyjson_mut_val *entry = yyjson_mut_obj(doc);
    add_torrent_summary(doc, entry, detail.summary);

    auto files = yyjson_mut_arr(doc);
    yyjson_mut_obj_add_val(doc, entry, "files", files);
    for (auto const &file : detail.files) {
      yyjson_mut_val *file_entry = yyjson_mut_obj(doc);
      yyjson_mut_obj_add_sint(doc, file_entry, "index", file.index);
      yyjson_mut_obj_add_str(doc, file_entry, "name", file.name.c_str());
      yyjson_mut_obj_add_uint(doc, file_entry, "length", file.length);
      yyjson_mut_obj_add_uint(doc, file_entry, "bytesCompleted",
                              file.bytes_completed);
      yyjson_mut_obj_add_real(doc, file_entry, "progress", file.progress);
      yyjson_mut_obj_add_sint(doc, file_entry, "priority", file.priority);
      yyjson_mut_obj_add_bool(doc, file_entry, "wanted", file.wanted);
      yyjson_mut_arr_add_val(files, file_entry);
    }

    auto trackers = yyjson_mut_arr(doc);
    yyjson_mut_obj_add_val(doc, entry, "trackers", trackers);
    for (auto const &tracker : detail.trackers) {
      yyjson_mut_val *tracker_entry = yyjson_mut_obj(doc);
      yyjson_mut_obj_add_str(doc, tracker_entry, "announce",
                            tracker.announce.c_str());
      yyjson_mut_obj_add_sint(doc, tracker_entry, "tier", tracker.tier);
      yyjson_mut_arr_add_val(trackers, tracker_entry);
    }

    auto peers = yyjson_mut_arr(doc);
    yyjson_mut_obj_add_val(doc, entry, "peers", peers);
    for (auto const &peer : detail.peers) {
      yyjson_mut_val *peer_entry = yyjson_mut_obj(doc);
      yyjson_mut_obj_add_str(doc, peer_entry, "address", peer.address.c_str());
      yyjson_mut_obj_add_bool(doc, peer_entry, "clientIsChoking",
                             peer.client_is_choking);
      yyjson_mut_obj_add_bool(doc, peer_entry, "clientIsInterested",
                             peer.client_is_interested);
      yyjson_mut_obj_add_bool(doc, peer_entry, "peerIsChoking",
                             peer.peer_is_choking);
      yyjson_mut_obj_add_bool(doc, peer_entry, "peerIsInterested",
                             peer.peer_is_interested);
      yyjson_mut_obj_add_str(doc, peer_entry, "clientName",
                            peer.client_name.c_str());
      yyjson_mut_obj_add_uint(doc, peer_entry, "rateToClient",
                              peer.rate_to_client);
      yyjson_mut_obj_add_uint(doc, peer_entry, "rateToPeer", peer.rate_to_peer);
      yyjson_mut_obj_add_real(doc, peer_entry, "progress", peer.progress);
      yyjson_mut_obj_add_str(doc, peer_entry, "flagStr", peer.flag_str.c_str());
      yyjson_mut_arr_add_val(peers, peer_entry);
    }

    yyjson_mut_obj_add_uint(doc, entry, "pieceCount", detail.piece_count);
    yyjson_mut_obj_add_uint(doc, entry, "pieceSize", detail.piece_size);

    auto states = yyjson_mut_arr(doc);
    yyjson_mut_obj_add_val(doc, entry, "pieceStates", states);
    for (int value : detail.piece_states) {
      yyjson_mut_arr_add_uint(doc, states, static_cast<std::uint64_t>(value));
    }

    auto availability = yyjson_mut_arr(doc);
    yyjson_mut_obj_add_val(doc, entry, "pieceAvailability", availability);
    for (int value : detail.piece_availability) {
      yyjson_mut_arr_add_uint(doc, availability,
                              static_cast<std::uint64_t>(value));
    }

    yyjson_mut_arr_add_val(array, entry);
  }

  char *json = yyjson_mut_write(doc, 0, nullptr);
  std::string response = json ? json : R"({"result":"error"})";

  yyjson_mut_doc_free(doc);
  std::free(json);
  return response;
}

std::string serialize_free_space(std::string const &path, std::uint64_t sizeBytes,
                                 std::uint64_t totalSize) {
  yyjson_mut_doc *doc = yyjson_mut_doc_new(nullptr);
  if (doc == nullptr) {
    return "{}";
  }

  yyjson_mut_val *root = yyjson_mut_obj(doc);
  yyjson_mut_doc_set_root(doc, root);
  yyjson_mut_obj_add_str(doc, root, "result", "success");

  yyjson_mut_val *arguments = yyjson_mut_obj(doc);
  yyjson_mut_obj_add_val(doc, root, "arguments", arguments);
  yyjson_mut_obj_add_str(doc, arguments, "path", path.c_str());
  yyjson_mut_obj_add_uint(doc, arguments, "sizeBytes", sizeBytes);
  yyjson_mut_obj_add_uint(doc, arguments, "totalSize", totalSize);

  char *json = yyjson_mut_write(doc, 0, nullptr);
  std::string response = json ? json : R"({"result":"error"})";

  yyjson_mut_doc_free(doc);
  std::free(json);
  return response;
}

std::string serialize_success() {
  yyjson_mut_doc *doc = yyjson_mut_doc_new(nullptr);
  if (doc == nullptr) {
    return "{}";
  }

  yyjson_mut_val *root = yyjson_mut_obj(doc);
  yyjson_mut_doc_set_root(doc, root);
  yyjson_mut_obj_add_str(doc, root, "result", "success");

  yyjson_mut_val *arguments = yyjson_mut_obj(doc);
  yyjson_mut_obj_add_val(doc, root, "arguments", arguments);

  char *json = yyjson_mut_write(doc, 0, nullptr);
  std::string response = json ? json : R"({"result":"error"})";

  yyjson_mut_doc_free(doc);
  std::free(json);
  return response;
}

std::string serialize_torrent_rename(int id, std::string const &name,
                                     std::string const &path) {
  yyjson_mut_doc *doc = yyjson_mut_doc_new(nullptr);
  if (doc == nullptr) {
    return "{}";
  }

  yyjson_mut_val *root = yyjson_mut_obj(doc);
  yyjson_mut_doc_set_root(doc, root);
  yyjson_mut_obj_add_str(doc, root, "result", "success");

  yyjson_mut_val *arguments = yyjson_mut_obj(doc);
  yyjson_mut_obj_add_val(doc, root, "arguments", arguments);
  yyjson_mut_obj_add_sint(doc, arguments, "id", id);
  yyjson_mut_obj_add_str(doc, arguments, "name", name.c_str());
  yyjson_mut_obj_add_str(doc, arguments, "path", path.c_str());

  char *json = yyjson_mut_write(doc, 0, nullptr);
  std::string response = json ? json : R"({"result":"error"})";

  yyjson_mut_doc_free(doc);
  std::free(json);
  return response;
}

std::string serialize_session_test(bool port_open) {
  yyjson_mut_doc *doc = yyjson_mut_doc_new(nullptr);
  if (doc == nullptr) {
    return "{}";
  }

  yyjson_mut_val *root = yyjson_mut_obj(doc);
  yyjson_mut_doc_set_root(doc, root);
  yyjson_mut_obj_add_str(doc, root, "result", "success");

  yyjson_mut_val *arguments = yyjson_mut_obj(doc);
  yyjson_mut_obj_add_val(doc, root, "arguments", arguments);
  yyjson_mut_obj_add_bool(doc, arguments, "portIsOpen", port_open);

  char *json = yyjson_mut_write(doc, 0, nullptr);
  std::string response = json ? json : R"({"result":"error"})";

  yyjson_mut_doc_free(doc);
  std::free(json);
  return response;
}

std::string serialize_add_result(engine::Core::AddTorrentStatus status) {
  yyjson_mut_doc *doc = yyjson_mut_doc_new(nullptr);
  if (doc == nullptr) {
    return "{}";
  }

  yyjson_mut_val *root = yyjson_mut_obj(doc);
  yyjson_mut_doc_set_root(doc, root);

  if (status == engine::Core::AddTorrentStatus::Ok) {
    yyjson_mut_obj_add_str(doc, root, "result", "success");
  } else {
    yyjson_mut_obj_add_str(doc, root, "result", "error");
  }

  yyjson_mut_val *arguments = yyjson_mut_obj(doc);
  yyjson_mut_obj_add_val(doc, root, "arguments", arguments);
  yyjson_mut_obj_add_str(doc, arguments, "message", message_for_status(status));

  char *json = yyjson_mut_write(doc, 0, nullptr);
  std::string response = json ? json : R"({"result":"error"})";

  yyjson_mut_doc_free(doc);
  std::free(json);
  return response;
}

std::string serialize_error(std::string_view message) {
  yyjson_mut_doc *doc = yyjson_mut_doc_new(nullptr);
  if (doc == nullptr) {
    return "{}";
  }

  yyjson_mut_val *root = yyjson_mut_obj(doc);
  yyjson_mut_doc_set_root(doc, root);
  yyjson_mut_obj_add_str(doc, root, "result", "error");

  yyjson_mut_val *arguments = yyjson_mut_obj(doc);
  yyjson_mut_obj_add_val(doc, root, "arguments", arguments);
  yyjson_mut_obj_add_strn(doc, arguments, "message", message.data(), message.size());

  char *json = yyjson_mut_write(doc, 0, nullptr);
  std::string response = json ? json : R"({"result":"error"})";

  yyjson_mut_doc_free(doc);
  std::free(json);
  return response;
}

} // namespace tt::rpc
