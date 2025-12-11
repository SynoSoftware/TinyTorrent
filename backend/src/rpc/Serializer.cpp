#include "rpc/Serializer.hpp"

#include <array>
#include <chrono>
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

std::uint64_t to_epoch_seconds(std::chrono::system_clock::time_point tp) {
  return static_cast<std::uint64_t>(
      std::chrono::duration_cast<std::chrono::seconds>(tp.time_since_epoch()).count());
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

std::string normalize_rpc_host(std::string host) {
  if (host.size() >= 2 && host.front() == '[' && host.back() == ']') {
    host = host.substr(1, host.size() - 2);
  }
  if (host == "0.0.0.0") {
    host = "127.0.0.1";
  }
  return host;
}

std::optional<std::uint16_t> parse_rpc_port(std::string_view value) {
  if (value.empty()) {
    return std::nullopt;
  }
  try {
    auto port = std::stoi(std::string(value));
    if (port < 0 || port > std::numeric_limits<std::uint16_t>::max()) {
      return std::nullopt;
    }
    return static_cast<std::uint16_t>(port);
  } catch (...) {
    return std::nullopt;
  }
}

std::pair<std::string, std::string> parse_rpc_bind(std::string const &value) {
  if (value.empty()) {
    return {"", ""};
  }
  auto scheme = value.find("://");
  auto host_start = (scheme == std::string::npos) ? 0 : scheme + 3;
  auto host_end = value.find('/', host_start);
  auto host_port = host_end == std::string::npos
                       ? value.substr(host_start)
                       : value.substr(host_start, host_end - host_start);
  if (host_port.empty()) {
    return {"", ""};
  }
  std::string host = host_port;
  std::string port;
  if (host.front() == '[') {
    auto closing = host.find(']');
    if (closing != std::string::npos) {
      if (closing + 1 < host.size() && host[closing + 1] == ':') {
        port = host.substr(closing + 2);
      }
      host = host.substr(0, closing + 1);
    }
  } else {
    auto colon = host.find_last_of(':');
    if (colon != std::string::npos && host.find(':') == colon) {
      port = host.substr(colon + 1);
      host = host.substr(0, colon);
    }
  }
  host = normalize_rpc_host(host);
  return {host, port};
}

std::string serialize_capabilities() {
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
  yyjson_mut_obj_add_str(native, arguments, "server-version",
                         "TinyTorrent 1.0.0");
  yyjson_mut_obj_add_str(native, arguments, "version", "TinyTorrent 1.0.0");
  yyjson_mut_obj_add_uint(native, arguments, "rpc-version", 17);
  yyjson_mut_obj_add_uint(native, arguments, "rpc-version-min", 1);
  yyjson_mut_obj_add_str(native, arguments, "websocket-endpoint", "/ws");
  yyjson_mut_obj_add_str(native, arguments, "websocket-path", "/ws");
  yyjson_mut_obj_add_str(native, arguments, "platform", "win32");

  static constexpr std::array<char const *, 8> kFeatures = {
      "fs-browse",       "system-integration", "system-reveal",
      "system-open",     "proxy-configuration", "proxy-support",
      "sequential-download", "labels"};
  auto *features = yyjson_mut_arr(native);
  yyjson_mut_obj_add_val(native, arguments, "features", features);
  for (auto const feature : kFeatures) {
    yyjson_mut_arr_add_str(native, features, feature);
  }

  return doc.write(R"({"result":"error"})");
}

std::string serialize_session_settings(
    engine::CoreSettings const &settings, std::size_t blocklist_entries,
    std::optional<std::chrono::system_clock::time_point> blocklist_updated,
    std::string const &rpc_bind) {
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
  yyjson_mut_obj_add_sint(native, arguments, "speed-limit-down",
                         settings.download_rate_limit_kbps);
  yyjson_mut_obj_add_bool(native, arguments, "speed-limit-down-enabled",
                         settings.download_rate_limit_enabled);
  yyjson_mut_obj_add_sint(native, arguments, "speed-limit-up",
                         settings.upload_rate_limit_kbps);
  yyjson_mut_obj_add_bool(native, arguments, "speed-limit-up-enabled",
                         settings.upload_rate_limit_enabled);
  yyjson_mut_obj_add_sint(native, arguments, "peer-limit",
                         settings.peer_limit);
  yyjson_mut_obj_add_sint(native, arguments, "peer-limit-per-torrent",
                         settings.peer_limit_per_torrent);
  yyjson_mut_obj_add_sint(native, arguments, "alt-speed-down",
                          settings.alt_download_rate_limit_kbps);
  yyjson_mut_obj_add_sint(native, arguments, "alt-speed-up",
                          settings.alt_upload_rate_limit_kbps);
  yyjson_mut_obj_add_bool(native, arguments, "alt-speed-enabled",
                         settings.alt_speed_enabled);
  yyjson_mut_obj_add_bool(native, arguments, "alt-speed-time-enabled",
                         settings.alt_speed_time_enabled);
  yyjson_mut_obj_add_sint(native, arguments, "alt-speed-time-begin",
                          settings.alt_speed_time_begin);
  yyjson_mut_obj_add_sint(native, arguments, "alt-speed-time-end",
                          settings.alt_speed_time_end);
  yyjson_mut_obj_add_sint(native, arguments, "alt-speed-time-day",
                          settings.alt_speed_time_day);
  yyjson_mut_obj_add_sint(native, arguments, "encryption",
                          static_cast<int>(settings.encryption));
  yyjson_mut_obj_add_bool(native, arguments, "dht-enabled",
                         settings.dht_enabled);
  yyjson_mut_obj_add_bool(native, arguments, "pex-enabled",
                         settings.pex_enabled);
  yyjson_mut_obj_add_bool(native, arguments, "lpd-enabled",
                         settings.lpd_enabled);
  yyjson_mut_obj_add_bool(native, arguments, "utp-enabled",
                         settings.utp_enabled);
  yyjson_mut_obj_add_sint(native, arguments, "download-queue-size",
                          settings.download_queue_size);
  yyjson_mut_obj_add_sint(native, arguments, "seed-queue-size",
                          settings.seed_queue_size);
  yyjson_mut_obj_add_bool(native, arguments, "queue-stalled-enabled",
                         settings.queue_stalled_enabled);
  if (!settings.incomplete_dir.empty()) {
    yyjson_mut_obj_add_str(native, arguments, "incomplete-dir",
                           settings.incomplete_dir.string().c_str());
  }
  yyjson_mut_obj_add_bool(native, arguments, "incomplete-dir-enabled",
                         settings.incomplete_dir_enabled);
  if (!settings.watch_dir.empty()) {
    yyjson_mut_obj_add_str(native, arguments, "watch-dir",
                           settings.watch_dir.string().c_str());
  }
  yyjson_mut_obj_add_bool(native, arguments, "watch-dir-enabled",
                         settings.watch_dir_enabled);
  yyjson_mut_obj_add_real(native, arguments, "seed-ratio-limit",
                          settings.seed_ratio_limit);
  yyjson_mut_obj_add_bool(native, arguments, "seed-ratio-limited",
                         settings.seed_ratio_enabled);
  yyjson_mut_obj_add_sint(native, arguments, "seed-idle-limit",
                          settings.seed_idle_limit_minutes);
  yyjson_mut_obj_add_bool(native, arguments, "seed-idle-limited",
                         settings.seed_idle_enabled);
  yyjson_mut_obj_add_sint(native, arguments, "proxy-type",
                          settings.proxy_type);
  if (!settings.proxy_hostname.empty()) {
    yyjson_mut_obj_add_str(native, arguments, "proxy-host",
                           settings.proxy_hostname.c_str());
  }
  yyjson_mut_obj_add_sint(native, arguments, "proxy-port",
                          settings.proxy_port);
  yyjson_mut_obj_add_bool(native, arguments, "proxy-auth-enabled",
                         settings.proxy_auth_enabled);
  if (!settings.proxy_username.empty()) {
    yyjson_mut_obj_add_str(native, arguments, "proxy-username",
                           settings.proxy_username.c_str());
  }
  if (!settings.proxy_password.empty()) {
    yyjson_mut_obj_add_str(native, arguments, "proxy-password",
                           "<REDACTED>");
  } else {
    yyjson_mut_obj_add_null(native, arguments, "proxy-password");
  }
  yyjson_mut_obj_add_bool(native, arguments, "proxy-peer-connections",
                         settings.proxy_peer_connections);
  bool blocklist_enabled = !settings.blocklist_path.empty();
  yyjson_mut_obj_add_bool(native, arguments, "blocklist-enabled",
                         blocklist_enabled);
  yyjson_mut_obj_add_uint(native, arguments, "blocklist-size",
                          static_cast<std::uint64_t>(blocklist_entries));
  if (blocklist_updated.has_value()) {
    yyjson_mut_obj_add_uint(native, arguments, "blocklist-last-updated",
                            to_epoch_seconds(*blocklist_updated));
  }
  if (blocklist_enabled) {
    yyjson_mut_obj_add_str(native, arguments, "blocklist-path",
                           settings.blocklist_path.string().c_str());
  }
  if (auto port = parse_listen_port(settings.listen_interface)) {
    yyjson_mut_obj_add_uint(native, arguments, "peer-port", *port);
  }
  auto [rpc_host, rpc_port] = parse_rpc_bind(rpc_bind);
  if (!rpc_host.empty()) {
    yyjson_mut_obj_add_str(native, arguments, "rpc-bind-address", rpc_host.c_str());
  }
  if (auto port = parse_rpc_port(rpc_port); port) {
    yyjson_mut_obj_add_uint(native, arguments, "rpc-port", *port);
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
    auto *labels = yyjson_mut_arr(native);
    yyjson_mut_obj_add_val(native, entry, "labels", labels);
    for (auto const &label : torrent.labels) {
      yyjson_mut_arr_add_str(native, labels, label.c_str());
    }
    yyjson_mut_obj_add_sint(native, entry, "bandwidthPriority",
                            torrent.bandwidth_priority);
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
    auto *labels = yyjson_mut_arr(native);
    yyjson_mut_obj_add_val(native, entry, "labels", labels);
    for (auto const &label : detail.summary.labels) {
      yyjson_mut_arr_add_str(native, labels, label.c_str());
    }
    yyjson_mut_obj_add_sint(native, entry, "bandwidthPriority",
                            detail.summary.bandwidth_priority);

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

std::string serialize_blocklist_update(
    std::size_t entries,
    std::optional<std::chrono::system_clock::time_point> last_updated) {
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
  yyjson_mut_obj_add_uint(native, arguments, "blocklist-size",
                          static_cast<std::uint64_t>(entries));
  if (last_updated) {
    yyjson_mut_obj_add_uint(native, arguments, "blocklist-last-updated",
                            to_epoch_seconds(*last_updated));
  }

  return doc.write(R"({"result":"error"})");
}

std::string serialize_fs_browse(std::string const &path,
                                std::string const &parent,
                                std::string const &separator,
                                std::vector<FsEntry> const &entries) {
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
  yyjson_mut_obj_add_str(native, arguments, "parent", parent.c_str());
  yyjson_mut_obj_add_str(native, arguments, "separator", separator.c_str());

  auto *array = yyjson_mut_arr(native);
  yyjson_mut_obj_add_val(native, arguments, "entries", array);
  for (auto const &entry : entries) {
    auto *item = yyjson_mut_obj(native);
    yyjson_mut_obj_add_str(native, item, "name", entry.name.c_str());
    yyjson_mut_obj_add_str(native, item, "type", entry.type.c_str());
    yyjson_mut_obj_add_uint(native, item, "size", entry.size);
    yyjson_mut_arr_add_val(array, item);
  }

  return doc.write(R"({"result":"error"})");
}

std::string serialize_fs_space(std::string const &path,
                               std::uint64_t free_bytes,
                               std::uint64_t total_bytes) {
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
  yyjson_mut_obj_add_uint(native, arguments, "freeBytes", free_bytes);
  yyjson_mut_obj_add_uint(native, arguments, "totalBytes", total_bytes);

  return doc.write(R"({"result":"error"})");
}

std::string serialize_system_action(std::string const &action, bool success,
                                    std::string const &message) {
  tt::json::MutableDocument doc;
  if (!doc.is_valid()) {
    return "{}";
  }

  auto *native = doc.doc();
  auto *root = yyjson_mut_obj(native);
  doc.set_root(root);
  yyjson_mut_obj_add_str(native, root, "result", success ? "success" : "error");

  auto *arguments = yyjson_mut_obj(native);
  yyjson_mut_obj_add_val(native, root, "arguments", arguments);
  yyjson_mut_obj_add_str(native, arguments, "action", action.c_str());
  yyjson_mut_obj_add_bool(native, arguments, "success", success);
  if (!message.empty()) {
    yyjson_mut_obj_add_str(native, arguments, "message", message.c_str());
  }

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
