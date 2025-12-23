#include "rpc/Serializer.hpp"

#include <chrono>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <limits>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>
#include <yyjson.h>

#include "utils/Base64.hpp"
#include "utils/Endpoint.hpp"
#include "utils/FS.hpp"
#include "utils/Json.hpp"
#include "utils/Version.hpp"

#include <algorithm>
#include <cstdlib>

namespace tt::rpc
{

namespace
{

char const *message_for_status(engine::Core::AddTorrentStatus status)
{
    switch (status)
    {
    case engine::Core::AddTorrentStatus::Ok:
        return "torrent queued";
    case engine::Core::AddTorrentStatus::InvalidUri:
        return "invalid magnet URI";
    case engine::Core::AddTorrentStatus::InvalidPath:
        return "unable to create save path";
    }
    return "unknown status";
}

std::uint64_t to_epoch_seconds(std::chrono::system_clock::time_point tp)
{
    return static_cast<std::uint64_t>(
        std::chrono::duration_cast<std::chrono::seconds>(tp.time_since_epoch())
            .count());
}

std::string to_utf8(std::filesystem::path const &path)
{
    auto encoded = path.generic_u8string();
    return std::string(encoded.begin(), encoded.end());
}

std::filesystem::path
download_path_or_default(std::filesystem::path const &path)
{
    if (!path.empty())
    {
        return path;
    }
    return tt::utils::data_root() / "downloads";
}

void add_session_stats(yyjson_mut_doc *doc, yyjson_mut_val *session,
                       engine::SessionSnapshot const &snapshot)
{
    yyjson_mut_obj_add_uint(doc, session, "downloadSpeed",
                            snapshot.download_rate);
    yyjson_mut_obj_add_uint(doc, session, "uploadSpeed", snapshot.upload_rate);
    yyjson_mut_obj_add_uint(doc, session, "torrentCount",
                            static_cast<std::uint64_t>(snapshot.torrent_count));
    yyjson_mut_obj_add_uint(
        doc, session, "activeTorrentCount",
        static_cast<std::uint64_t>(snapshot.active_torrent_count));
    yyjson_mut_obj_add_uint(
        doc, session, "pausedTorrentCount",
        static_cast<std::uint64_t>(snapshot.paused_torrent_count));
    yyjson_mut_obj_add_uint(doc, session, "dhtNodes", snapshot.dht_nodes);

    auto *cumulative = yyjson_mut_obj(doc);
    yyjson_mut_obj_add_uint(doc, cumulative, "uploadedBytes",
                            snapshot.cumulative_stats.uploaded_bytes);
    yyjson_mut_obj_add_uint(doc, cumulative, "downloadedBytes",
                            snapshot.cumulative_stats.downloaded_bytes);
    yyjson_mut_obj_add_uint(doc, cumulative, "filesAdded", 0);
    yyjson_mut_obj_add_uint(doc, cumulative, "secondsActive",
                            snapshot.cumulative_stats.seconds_active);
    yyjson_mut_obj_add_uint(doc, cumulative, "sessionCount",
                            snapshot.cumulative_stats.session_count);
    yyjson_mut_obj_add_val(doc, session, "cumulativeStats", cumulative);

    auto *current = yyjson_mut_obj(doc);
    yyjson_mut_obj_add_uint(doc, current, "uploadedBytes",
                            snapshot.current_stats.uploaded_bytes);
    yyjson_mut_obj_add_uint(doc, current, "downloadedBytes",
                            snapshot.current_stats.downloaded_bytes);
    yyjson_mut_obj_add_uint(doc, current, "filesAdded", 0);
    yyjson_mut_obj_add_uint(doc, current, "secondsActive",
                            snapshot.current_stats.seconds_active);
    yyjson_mut_obj_add_uint(doc, current, "sessionCount",
                            snapshot.current_stats.session_count);
    yyjson_mut_obj_add_val(doc, session, "currentStats", current);
}

bool session_stats_equal(engine::SessionSnapshot const &a,
                         engine::SessionSnapshot const &b)
{
    return a.download_rate == b.download_rate &&
           a.upload_rate == b.upload_rate &&
           a.torrent_count == b.torrent_count &&
           a.active_torrent_count == b.active_torrent_count &&
           a.paused_torrent_count == b.paused_torrent_count &&
           a.dht_nodes == b.dht_nodes;
}

void attach_labels(yyjson_mut_doc *doc, yyjson_mut_val *entry,
                   engine::TorrentSnapshot const &torrent)
{
    auto *labels = yyjson_mut_arr(doc);
    yyjson_mut_obj_add_val(doc, entry, "labels", labels);
    for (auto const &label : torrent.labels)
    {
        yyjson_mut_arr_add_str(doc, labels, label.c_str());
    }
}

std::string encode_piece_bitfield(std::vector<int> const &bits)
{
    std::vector<std::uint8_t> payload((bits.size() + 7) / 8);
    for (std::size_t i = 0; i < bits.size(); ++i)
    {
        if (bits[i] == 0)
        {
            continue;
        }
        payload[i / 8] |= static_cast<std::uint8_t>(1u << (i % 8));
    }
    return tt::utils::encode_base64(payload);
}

std::string encode_piece_availability(std::vector<int> const &availability)
{
    std::vector<std::uint8_t> payload;
    payload.reserve(availability.size() * 2);
    for (int count : availability)
    {
        auto clamped = static_cast<std::uint16_t>(std::clamp(count, 0, 0xFFFF));
        payload.push_back(static_cast<std::uint8_t>(clamped & 0xFF));
        payload.push_back(static_cast<std::uint8_t>((clamped >> 8) & 0xFF));
    }
    return tt::utils::encode_base64(payload);
}

void add_labels_if_changed(yyjson_mut_doc *doc, yyjson_mut_val *entry,
                           std::vector<std::string> const &previous,
                           std::vector<std::string> const &current)
{
    if (previous == current)
    {
        return;
    }
    auto *labels = yyjson_mut_arr(doc);
    yyjson_mut_obj_add_val(doc, entry, "labels", labels);
    for (auto const &label : current)
    {
        yyjson_mut_arr_add_str(doc, labels, label.c_str());
    }
}

constexpr double kSerializerRealEpsilon = 1e-6;

inline void add_if_changed_sint(yyjson_mut_doc *doc, yyjson_mut_val *entry,
                                char const *key, std::int64_t previous,
                                std::int64_t current)
{
    if (previous == current)
    {
        return;
    }
    yyjson_mut_obj_add_sint(doc, entry, key, current);
}

inline void add_if_changed_uint(yyjson_mut_doc *doc, yyjson_mut_val *entry,
                                char const *key, std::uint64_t previous,
                                std::uint64_t current)
{
    if (previous == current)
    {
        return;
    }
    yyjson_mut_obj_add_uint(doc, entry, key, current);
}

inline void add_if_changed_real(yyjson_mut_doc *doc, yyjson_mut_val *entry,
                                char const *key, double previous,
                                double current)
{
    if (std::fabs(previous - current) <= kSerializerRealEpsilon)
    {
        return;
    }
    yyjson_mut_obj_add_real(doc, entry, key, current);
}

inline void add_if_changed_bool(yyjson_mut_doc *doc, yyjson_mut_val *entry,
                                char const *key, bool previous, bool current)
{
    if (previous == current)
    {
        return;
    }
    yyjson_mut_obj_add_bool(doc, entry, key, current);
}

inline void add_if_changed_str(yyjson_mut_doc *doc, yyjson_mut_val *entry,
                               char const *key, std::string const &previous,
                               std::string const &current)
{
    if (previous == current)
    {
        return;
    }
    yyjson_mut_obj_add_str(doc, entry, key, current.c_str());
}

void add_torrent_delta(yyjson_mut_doc *doc, yyjson_mut_val *entry,
                       engine::TorrentSnapshot const &previous,
                       engine::TorrentSnapshot const &current)
{
    yyjson_mut_obj_add_sint(doc, entry, "id", current.id);
    add_if_changed_str(doc, entry, "hashString", previous.hash, current.hash);
    add_if_changed_str(doc, entry, "name", previous.name, current.name);
    add_if_changed_sint(doc, entry, "totalSize", previous.total_size,
                        current.total_size);
    add_if_changed_real(doc, entry, "percentDone", previous.progress,
                        current.progress);
    add_if_changed_sint(doc, entry, "status", previous.status, current.status);
    add_if_changed_uint(doc, entry, "rateDownload", previous.download_rate,
                        current.download_rate);
    add_if_changed_uint(doc, entry, "rateUpload", previous.upload_rate,
                        current.upload_rate);
    add_if_changed_sint(doc, entry, "peersConnected", previous.peers_connected,
                        current.peers_connected);
    add_if_changed_sint(doc, entry, "peersSendingToUs",
                        previous.peers_sending_to_us,
                        current.peers_sending_to_us);
    add_if_changed_sint(doc, entry, "peersGettingFromUs",
                        previous.peers_getting_from_us,
                        current.peers_getting_from_us);
    add_if_changed_sint(doc, entry, "eta", previous.eta, current.eta);
    add_if_changed_sint(doc, entry, "addedDate", previous.added_time,
                        current.added_time);
    add_if_changed_sint(doc, entry, "queuePosition", previous.queue_position,
                        current.queue_position);
    add_if_changed_real(doc, entry, "uploadRatio", previous.ratio,
                        current.ratio);
    add_if_changed_sint(doc, entry, "uploadedEver", previous.uploaded,
                        current.uploaded);
    add_if_changed_sint(doc, entry, "downloadedEver", previous.downloaded,
                        current.downloaded);
    add_if_changed_str(doc, entry, "downloadDir", previous.download_dir,
                       current.download_dir);
    add_if_changed_sint(doc, entry, "leftUntilDone", previous.left_until_done,
                        current.left_until_done);
    add_if_changed_sint(doc, entry, "sizeWhenDone", previous.size_when_done,
                        current.size_when_done);
    add_if_changed_sint(doc, entry, "error", previous.error, current.error);
    add_if_changed_str(doc, entry, "errorString", previous.error_string,
                       current.error_string);
    add_if_changed_bool(doc, entry, "sequentialDownload",
                        previous.sequential_download,
                        current.sequential_download);
    add_if_changed_bool(doc, entry, "superSeeding", previous.super_seeding,
                        current.super_seeding);
    add_if_changed_bool(doc, entry, "isFinished", previous.is_finished,
                        current.is_finished);
    add_labels_if_changed(doc, entry, previous.labels, current.labels);
    add_if_changed_sint(doc, entry, "bandwidthPriority",
                        previous.bandwidth_priority,
                        current.bandwidth_priority);
}

std::string serialize_ws_event_base(
    std::string_view name,
    std::optional<std::function<void(yyjson_mut_doc *, yyjson_mut_val *)>> const
        &builder)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }
    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);
    yyjson_mut_obj_add_str(native, root, "type", "event");
    std::string event_name(name);
    yyjson_mut_obj_add_str(native, root, "event", event_name.c_str());
    if (builder)
    {
        auto *data = yyjson_mut_obj(native);
        (*builder)(native, data);
        yyjson_mut_obj_add_val(native, root, "data", data);
    }
    else
    {
        yyjson_mut_obj_add_null(native, root, "data");
    }
    return doc.write(R"({"type":"event"})");
}

} // namespace

bool torrent_snapshot_equal(engine::TorrentSnapshot const &a,
                            engine::TorrentSnapshot const &b)
{
    return a.hash == b.hash && a.name == b.name && a.state == b.state &&
           a.progress == b.progress && a.total_wanted == b.total_wanted &&
           a.total_done == b.total_done && a.total_size == b.total_size &&
           a.downloaded == b.downloaded && a.uploaded == b.uploaded &&
           a.download_rate == b.download_rate &&
           a.upload_rate == b.upload_rate && a.status == b.status &&
           a.queue_position == b.queue_position &&
           a.peers_connected == b.peers_connected &&
           a.seeds_connected == b.seeds_connected &&
           a.peers_sending_to_us == b.peers_sending_to_us &&
           a.peers_getting_from_us == b.peers_getting_from_us &&
           a.eta == b.eta && a.total_wanted_done == b.total_wanted_done &&
           a.added_time == b.added_time && a.ratio == b.ratio &&
           a.is_finished == b.is_finished &&
           a.sequential_download == b.sequential_download &&
           a.super_seeding == b.super_seeding &&
           a.download_dir == b.download_dir && a.error == b.error &&
           a.error_string == b.error_string &&
           a.left_until_done == b.left_until_done &&
           a.size_when_done == b.size_when_done && a.labels == b.labels &&
           a.bandwidth_priority == b.bandwidth_priority;
}

std::optional<std::uint16_t> parse_listen_port(std::string_view interface)
{
    auto colon = interface.find_last_of(':');
    if (colon == std::string_view::npos)
    {
        return std::nullopt;
    }
    auto port_str = interface.substr(colon + 1);
    try
    {
        auto port = std::stoi(std::string(port_str));
        if (port < 0 || port > std::numeric_limits<std::uint16_t>::max())
        {
            return std::nullopt;
        }
        return static_cast<std::uint16_t>(port);
    }
    catch (...)
    {
        return std::nullopt;
    }
}

std::optional<std::uint16_t> parse_rpc_port(std::string_view value)
{
    if (value.empty())
    {
        return std::nullopt;
    }
    try
    {
        auto port = std::stoi(std::string(value));
        if (port < 0 || port > std::numeric_limits<std::uint16_t>::max())
        {
            return std::nullopt;
        }
        return static_cast<std::uint16_t>(port);
    }
    catch (...)
    {
        return std::nullopt;
    }
}

std::string serialize_capabilities()
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }

    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);
    yyjson_mut_obj_add_str(native, root, "result", "success");

    auto *arguments = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, root, "arguments", arguments);
    yyjson_mut_obj_add_str(native, arguments, "server-version",
                           tt::version::kDisplayVersion);
    yyjson_mut_obj_add_str(native, arguments, "version",
                           tt::version::kDisplayVersion);
    yyjson_mut_obj_add_uint(native, arguments, "rpc-version", 17);
    yyjson_mut_obj_add_uint(native, arguments, "rpc-version-min", 1);
    yyjson_mut_obj_add_str(native, arguments, "websocket-endpoint", "/ws");
    yyjson_mut_obj_add_str(native, arguments, "websocket-path", "/ws");
    yyjson_mut_obj_add_str(native, arguments, "platform", "win32");

    std::vector<std::string> features = {"fs-browse",
                                         "fs-create-dir",
                                         "fs-space",
                                         "fs-write-file",
                                         "system-integration",
                                         "system-install",
                                         "system-autorun",
                                         "system-reveal",
                                         "system-open",
                                         "system-register-handler",
                                         "system-handler-status",
                                         "system-handler-enable",
                                         "system-handler-disable",
                                         "session-tray-status",
                                         "session-pause-all",
                                         "session-resume-all",
                                         "traffic-history",
                                         "sequential-download",
                                         "proxy-configuration",
                                         "labels"};
#if defined(_WIN32)
    features.push_back("native-dialogs");
#endif
    auto *features_arr = yyjson_mut_arr(native);
    yyjson_mut_obj_add_val(native, arguments, "features", features_arr);
    for (auto const &feature : features)
    {
        yyjson_mut_arr_add_str(native, features_arr, feature.c_str());
    }

    return doc.write(R"({"result":"error"})");
}

std::string serialize_session_settings(
    engine::CoreSettings const &settings, std::size_t blocklist_entries,
    std::optional<std::chrono::system_clock::time_point> blocklist_updated,
    std::string const &rpc_bind, std::string const &listen_error)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }

    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);
    yyjson_mut_obj_add_str(native, root, "result", "success");

    auto *arguments = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, root, "arguments", arguments);

    yyjson_mut_obj_add_str(native, arguments, "version",
                           tt::version::kDisplayVersion);
    yyjson_mut_obj_add_uint(native, arguments, "rpc-version", 17);
    yyjson_mut_obj_add_uint(native, arguments, "rpc-version-min", 1);
    auto download_dir =
        to_utf8(download_path_or_default(settings.download_path));
    yyjson_mut_obj_add_str(native, arguments, "download-dir",
                           download_dir.c_str());
    yyjson_mut_obj_add_sint(native, arguments, "speed-limit-down",
                            settings.download_rate_limit_kbps);
    yyjson_mut_obj_add_bool(native, arguments, "speed-limit-down-enabled",
                            settings.download_rate_limit_enabled);
    yyjson_mut_obj_add_sint(native, arguments, "speed-limit-up",
                            settings.upload_rate_limit_kbps);
    yyjson_mut_obj_add_bool(native, arguments, "speed-limit-up-enabled",
                            settings.upload_rate_limit_enabled);
    yyjson_mut_obj_add_sint(native, arguments, "peer-limit-global",
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
    if (!settings.incomplete_dir.empty())
    {
        auto incomplete_dir = to_utf8(settings.incomplete_dir);
        yyjson_mut_obj_add_str(native, arguments, "incomplete-dir",
                               incomplete_dir.c_str());
    }
    yyjson_mut_obj_add_bool(native, arguments, "incomplete-dir-enabled",
                            settings.incomplete_dir_enabled);
    if (!settings.watch_dir.empty())
    {
        auto watch_dir = to_utf8(settings.watch_dir);
        yyjson_mut_obj_add_str(native, arguments, "watch-dir",
                               watch_dir.c_str());
    }
    yyjson_mut_obj_add_bool(native, arguments, "watch-dir-enabled",
                            settings.watch_dir_enabled);
    yyjson_mut_obj_add_bool(native, arguments, "rename-partial-files",
                            settings.rename_partial_files);
    yyjson_mut_obj_add_real(native, arguments, "seedRatioLimit",
                            settings.seed_ratio_limit);
    yyjson_mut_obj_add_bool(native, arguments, "seedRatioLimited",
                            settings.seed_ratio_enabled);
    yyjson_mut_obj_add_sint(native, arguments, "idle-seeding-limit",
                            settings.seed_idle_limit_minutes);
    yyjson_mut_obj_add_bool(native, arguments, "idle-seeding-limit-enabled",
                            settings.seed_idle_enabled);
    yyjson_mut_obj_add_sint(native, arguments, "proxy-type",
                            settings.proxy_type);
    if (!settings.proxy_hostname.empty())
    {
        yyjson_mut_obj_add_str(native, arguments, "proxy-host",
                               settings.proxy_hostname.c_str());
    }
    yyjson_mut_obj_add_sint(native, arguments, "proxy-port",
                            settings.proxy_port);
    yyjson_mut_obj_add_bool(native, arguments, "proxy-auth-enabled",
                            settings.proxy_auth_enabled);
    if (!settings.proxy_username.empty())
    {
        yyjson_mut_obj_add_str(native, arguments, "proxy-username",
                               settings.proxy_username.c_str());
    }
    if (!settings.proxy_password.empty())
    {
        yyjson_mut_obj_add_str(native, arguments, "proxy-password",
                               "<REDACTED>");
    }
    else
    {
        yyjson_mut_obj_add_null(native, arguments, "proxy-password");
    }
    yyjson_mut_obj_add_bool(native, arguments, "proxy-peer-connections",
                            settings.proxy_peer_connections);
    if (!settings.proxy_hostname.empty() && settings.proxy_port > 0)
    {
        tt::net::HostPort parts{settings.proxy_hostname,
                                std::to_string(settings.proxy_port)};
        auto formatted = tt::net::format_host_port(parts);
        if (!formatted.empty())
        {
            yyjson_mut_obj_add_str(native, arguments, "proxy-url",
                                   formatted.c_str());
        }
    }
    yyjson_mut_obj_add_sint(native, arguments, "engine-disk-cache",
                            settings.disk_cache_mb);
    yyjson_mut_obj_add_sint(native, arguments, "engine-hashing-threads",
                            settings.hashing_threads);
    yyjson_mut_obj_add_sint(native, arguments, "queue-stalled-minutes",
                            settings.queue_stalled_minutes);
    yyjson_mut_obj_add_bool(native, arguments, "history-enabled",
                            settings.history_enabled);
    yyjson_mut_obj_add_sint(native, arguments, "history-interval",
                            settings.history_interval_seconds);
    yyjson_mut_obj_add_sint(native, arguments, "history-retention-days",
                            settings.history_retention_days);
    bool blocklist_enabled = !settings.blocklist_path.empty();
    yyjson_mut_obj_add_bool(native, arguments, "blocklist-enabled",
                            blocklist_enabled);
    yyjson_mut_obj_add_uint(native, arguments, "blocklist-size",
                            static_cast<std::uint64_t>(blocklist_entries));
    if (blocklist_updated.has_value())
    {
        yyjson_mut_obj_add_uint(native, arguments, "blocklist-last-updated",
                                to_epoch_seconds(*blocklist_updated));
    }
    if (blocklist_enabled)
    {
        auto blocklist_path = to_utf8(settings.blocklist_path);
        yyjson_mut_obj_add_str(native, arguments, "blocklist-path",
                               blocklist_path.c_str());
    }
    if (auto port = parse_listen_port(settings.listen_interface))
    {
        yyjson_mut_obj_add_uint(native, arguments, "peer-port", *port);
    }
    if (!listen_error.empty())
    {
        yyjson_mut_obj_add_str(native, arguments, "listen-error",
                               listen_error.c_str());
    }
    auto [rpc_host, rpc_port] = tt::net::parse_rpc_bind(rpc_bind);
    if (!rpc_host.empty())
    {
        yyjson_mut_obj_add_str(native, arguments, "rpc-bind-address",
                               rpc_host.c_str());
    }
    if (auto port = parse_rpc_port(rpc_port); port)
    {
        yyjson_mut_obj_add_uint(native, arguments, "rpc-port", *port);
    }

    return doc.write();
}

std::string serialize_session_stats(engine::SessionSnapshot const &snapshot)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
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
    yyjson_mut_obj_add_uint(
        native, arguments, "activeTorrentCount",
        static_cast<std::uint64_t>(snapshot.active_torrent_count));
    yyjson_mut_obj_add_uint(
        native, arguments, "pausedTorrentCount",
        static_cast<std::uint64_t>(snapshot.paused_torrent_count));
    yyjson_mut_obj_add_uint(native, arguments, "dhtNodes", snapshot.dht_nodes);

    auto *cumulative = yyjson_mut_obj(native);
    yyjson_mut_obj_add_uint(native, cumulative, "uploadedBytes",
                            snapshot.cumulative_stats.uploaded_bytes);
    yyjson_mut_obj_add_uint(native, cumulative, "downloadedBytes",
                            snapshot.cumulative_stats.downloaded_bytes);
    yyjson_mut_obj_add_uint(native, cumulative, "filesAdded", 0);
    yyjson_mut_obj_add_uint(native, cumulative, "secondsActive",
                            snapshot.cumulative_stats.seconds_active);
    yyjson_mut_obj_add_uint(native, cumulative, "sessionCount",
                            snapshot.cumulative_stats.session_count);
    yyjson_mut_obj_add_val(native, arguments, "cumulativeStats", cumulative);

    auto *current = yyjson_mut_obj(native);
    yyjson_mut_obj_add_uint(native, current, "uploadedBytes",
                            snapshot.current_stats.uploaded_bytes);
    yyjson_mut_obj_add_uint(native, current, "downloadedBytes",
                            snapshot.current_stats.downloaded_bytes);
    yyjson_mut_obj_add_uint(native, current, "filesAdded", 0);
    yyjson_mut_obj_add_uint(native, current, "secondsActive",
                            snapshot.current_stats.seconds_active);
    yyjson_mut_obj_add_uint(native, current, "sessionCount",
                            snapshot.current_stats.session_count);
    yyjson_mut_obj_add_val(native, arguments, "currentStats", current);

    return doc.write(R"({"result":"error"})");
}

std::string serialize_session_tray_status(std::uint64_t download_kbps,
                                          std::uint64_t upload_kbps,
                                          std::size_t active_count,
                                          std::size_t seeding_count,
                                          bool any_error, bool all_paused,
                                          std::string const &download_dir,
                                          std::string const &error_message)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }

    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);
    yyjson_mut_obj_add_str(native, root, "result", "success");

    auto *arguments = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, root, "arguments", arguments);
    yyjson_mut_obj_add_uint(native, arguments, "downloadSpeed",
                            static_cast<std::uint64_t>(download_kbps));
    yyjson_mut_obj_add_uint(native, arguments, "uploadSpeed",
                            static_cast<std::uint64_t>(upload_kbps));
    yyjson_mut_obj_add_uint(native, arguments, "activeTorrentCount",
                            static_cast<std::uint64_t>(active_count));
    yyjson_mut_obj_add_uint(native, arguments, "seedingCount",
                            static_cast<std::uint64_t>(seeding_count));
    yyjson_mut_obj_add_bool(native, arguments, "anyError", any_error);
    yyjson_mut_obj_add_bool(native, arguments, "allPaused", all_paused);
    if (!download_dir.empty())
    {
        yyjson_mut_obj_add_str(native, arguments, "downloadDir",
                               download_dir.c_str());
    }
    if (!error_message.empty())
    {
        yyjson_mut_obj_add_str(native, arguments, "errorMessage",
                               error_message.c_str());
    }

    return doc.write(R"({"result":"error"})");
}

static void add_torrent_summary(yyjson_mut_doc *doc, yyjson_mut_val *entry,
                                engine::TorrentSnapshot const &torrent)
{
    yyjson_mut_obj_add_sint(doc, entry, "id", torrent.id);
    yyjson_mut_obj_add_str(doc, entry, "hashString", torrent.hash.c_str());
    yyjson_mut_obj_add_str(doc, entry, "name", torrent.name.c_str());
    yyjson_mut_obj_add_sint(doc, entry, "totalSize", torrent.total_size);
    yyjson_mut_obj_add_real(doc, entry, "percentDone", torrent.progress);
    yyjson_mut_obj_add_sint(doc, entry, "status", torrent.status);
    yyjson_mut_obj_add_uint(doc, entry, "rateDownload", torrent.download_rate);
    yyjson_mut_obj_add_uint(doc, entry, "rateUpload", torrent.upload_rate);
    yyjson_mut_obj_add_sint(doc, entry, "peersConnected",
                            torrent.peers_connected);
    yyjson_mut_obj_add_sint(doc, entry, "peersSendingToUs",
                            torrent.peers_sending_to_us);
    yyjson_mut_obj_add_sint(doc, entry, "peersGettingFromUs",
                            torrent.peers_getting_from_us);
    yyjson_mut_obj_add_sint(doc, entry, "eta", torrent.eta);
    yyjson_mut_obj_add_sint(doc, entry, "addedDate", torrent.added_time);
    yyjson_mut_obj_add_sint(doc, entry, "queuePosition",
                            torrent.queue_position);
    yyjson_mut_obj_add_real(doc, entry, "uploadRatio", torrent.ratio);
    yyjson_mut_obj_add_sint(doc, entry, "uploadedEver", torrent.uploaded);
    yyjson_mut_obj_add_sint(doc, entry, "downloadedEver", torrent.downloaded);
    yyjson_mut_obj_add_str(doc, entry, "downloadDir",
                           torrent.download_dir.c_str());
    yyjson_mut_obj_add_sint(doc, entry, "leftUntilDone",
                            torrent.left_until_done);
    yyjson_mut_obj_add_sint(doc, entry, "sizeWhenDone", torrent.size_when_done);
    yyjson_mut_obj_add_sint(doc, entry, "error", torrent.error);
    yyjson_mut_obj_add_str(doc, entry, "errorString",
                           torrent.error_string.c_str());
    yyjson_mut_obj_add_bool(doc, entry, "sequentialDownload",
                            torrent.sequential_download);
    yyjson_mut_obj_add_bool(doc, entry, "superSeeding", torrent.super_seeding);
    yyjson_mut_obj_add_bool(doc, entry, "isFinished", torrent.is_finished);
}

std::string
serialize_torrent_list(std::vector<engine::TorrentSnapshot> const &torrents)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
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

    for (auto const &torrent : torrents)
    {
        auto *entry = yyjson_mut_obj(native);
        add_torrent_summary(native, entry, torrent);
        auto *labels = yyjson_mut_arr(native);
        yyjson_mut_obj_add_val(native, entry, "labels", labels);
        for (auto const &label : torrent.labels)
        {
            yyjson_mut_arr_add_str(native, labels, label.c_str());
        }
        yyjson_mut_obj_add_sint(native, entry, "bandwidthPriority",
                                torrent.bandwidth_priority);
        yyjson_mut_arr_add_val(array, entry);
    }

    return doc.write(R"({"result":"error"})");
}

std::string
serialize_torrent_detail(std::vector<engine::TorrentDetail> const &details)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
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

    for (auto const &detail : details)
    {
        auto *entry = yyjson_mut_obj(native);
        add_torrent_summary(native, entry, detail.summary);
        auto *labels = yyjson_mut_arr(native);
        yyjson_mut_obj_add_val(native, entry, "labels", labels);
        for (auto const &label : detail.summary.labels)
        {
            yyjson_mut_arr_add_str(native, labels, label.c_str());
        }
        yyjson_mut_obj_add_sint(native, entry, "bandwidthPriority",
                                detail.summary.bandwidth_priority);

        auto *files = yyjson_mut_arr(native);
        yyjson_mut_obj_add_val(native, entry, "files", files);
        for (auto const &file : detail.files)
        {
            auto *file_entry = yyjson_mut_obj(native);
            yyjson_mut_obj_add_sint(native, file_entry, "index", file.index);
            yyjson_mut_obj_add_str(native, file_entry, "name",
                                   file.name.c_str());
            yyjson_mut_obj_add_uint(native, file_entry, "length", file.length);
            yyjson_mut_obj_add_uint(native, file_entry, "bytesCompleted",
                                    file.bytes_completed);
            yyjson_mut_obj_add_real(native, file_entry, "progress",
                                    file.progress);
            yyjson_mut_obj_add_sint(native, file_entry, "priority",
                                    file.priority);
            yyjson_mut_obj_add_bool(native, file_entry, "wanted", file.wanted);
            yyjson_mut_arr_add_val(files, file_entry);
        }

        auto *trackers = yyjson_mut_arr(native);
        yyjson_mut_obj_add_val(native, entry, "trackers", trackers);
        for (auto const &tracker : detail.trackers)
        {
            auto *tracker_entry = yyjson_mut_obj(native);
            yyjson_mut_obj_add_str(native, tracker_entry, "announce",
                                   tracker.announce.c_str());
            yyjson_mut_obj_add_sint(native, tracker_entry, "tier",
                                    tracker.tier);
            yyjson_mut_arr_add_val(trackers, tracker_entry);
        }

        auto *peers = yyjson_mut_arr(native);
        yyjson_mut_obj_add_val(native, entry, "peers", peers);
        for (auto const &peer : detail.peers)
        {
            auto *peer_entry = yyjson_mut_obj(native);
            yyjson_mut_obj_add_str(native, peer_entry, "address",
                                   peer.address.c_str());
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
            yyjson_mut_obj_add_real(native, peer_entry, "progress",
                                    peer.progress);
            yyjson_mut_obj_add_str(native, peer_entry, "flagStr",
                                   peer.flag_str.c_str());
            yyjson_mut_arr_add_val(peers, peer_entry);
        }

        yyjson_mut_obj_add_uint(native, entry, "pieceCount",
                                detail.piece_count);
        yyjson_mut_obj_add_uint(native, entry, "pieceSize", detail.piece_size);

        auto state_bits = encode_piece_bitfield(detail.piece_states);
        yyjson_mut_obj_add_str(native, entry, "pieceStates",
                               state_bits.c_str());

        auto availability_payload =
            encode_piece_availability(detail.piece_availability);
        yyjson_mut_obj_add_str(native, entry, "pieceAvailability",
                               availability_payload.c_str());

        yyjson_mut_arr_add_val(array, entry);
    }

    return doc.write(R"({"result":"error"})");
}

std::string serialize_free_space(std::string const &path,
                                 std::uint64_t sizeBytes,
                                 std::uint64_t totalSize)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
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

std::string serialize_success()
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
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
                                     std::string const &path)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
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
    std::optional<std::chrono::system_clock::time_point> last_updated)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
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
    if (last_updated)
    {
        yyjson_mut_obj_add_uint(native, arguments, "blocklist-last-updated",
                                to_epoch_seconds(*last_updated));
    }

    return doc.write(R"({"result":"error"})");
}

std::string
serialize_history_data(std::vector<engine::HistoryBucket> const &buckets,
                       std::int64_t step, int recording_interval)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }
    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);
    yyjson_mut_obj_add_str(native, root, "result", "success");

    auto *arguments = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, root, "arguments", arguments);
    yyjson_mut_obj_add_sint(native, arguments, "step", step);
    yyjson_mut_obj_add_sint(native, arguments, "recording-interval",
                            recording_interval);

    auto *array = yyjson_mut_arr(native);
    yyjson_mut_obj_add_val(native, arguments, "data", array);
    for (auto const &entry : buckets)
    {
        auto *tuple = yyjson_mut_arr(native);
        yyjson_mut_arr_add_sint(native, tuple, entry.timestamp);
        yyjson_mut_arr_add_uint(native, tuple, entry.total_down);
        yyjson_mut_arr_add_uint(native, tuple, entry.total_up);
        yyjson_mut_arr_add_uint(native, tuple, entry.peak_down);
        yyjson_mut_arr_add_uint(native, tuple, entry.peak_up);
        yyjson_mut_arr_add_val(array, tuple);
    }

    return doc.write(R"({"result":"error"})");
}

std::string serialize_ws_snapshot(engine::SessionSnapshot const &snapshot)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }

    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);
    yyjson_mut_obj_add_str(native, root, "type", "sync-snapshot");

    auto *data = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, root, "data", data);

    auto *session = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, data, "session", session);
    add_session_stats(native, session, snapshot);

    auto *torrents = yyjson_mut_arr(native);
    yyjson_mut_obj_add_val(native, data, "torrents", torrents);
    for (auto const &torrent : snapshot.torrents)
    {
        auto *entry = yyjson_mut_obj(native);
        add_torrent_summary(native, entry, torrent);
        attach_labels(native, entry, torrent);
        yyjson_mut_obj_add_sint(native, entry, "bandwidthPriority",
                                torrent.bandwidth_priority);
        yyjson_mut_arr_add_val(torrents, entry);
    }

    return doc.write(R"({"type":"error"})");
}

std::string serialize_ws_patch(
    engine::SessionSnapshot const &snapshot,
    std::vector<engine::TorrentSnapshot> const &added,
    std::vector<std::pair<engine::TorrentSnapshot,
                          engine::TorrentSnapshot>> const &updated,
    std::vector<int> const &removed)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }

    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);
    yyjson_mut_obj_add_str(native, root, "type", "sync-patch");

    auto *data = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, root, "data", data);

    auto *session = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, data, "session", session);
    add_session_stats(native, session, snapshot);

    auto *torrents = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, data, "torrents", torrents);

    auto *removed_arr = yyjson_mut_arr(native);
    yyjson_mut_obj_add_val(native, torrents, "removed", removed_arr);
    for (int id : removed)
    {
        yyjson_mut_arr_add_sint(native, removed_arr, id);
    }

    auto *added_arr = yyjson_mut_arr(native);
    yyjson_mut_obj_add_val(native, torrents, "added", added_arr);
    for (auto const &torrent : added)
    {
        auto *entry = yyjson_mut_obj(native);
        add_torrent_summary(native, entry, torrent);
        attach_labels(native, entry, torrent);
        yyjson_mut_obj_add_sint(native, entry, "bandwidthPriority",
                                torrent.bandwidth_priority);
        yyjson_mut_arr_add_val(added_arr, entry);
    }

    auto *updated_arr = yyjson_mut_arr(native);
    yyjson_mut_obj_add_val(native, torrents, "updated", updated_arr);
    for (auto const &update : updated)
    {
        auto *entry = yyjson_mut_obj(native);
        // Send a full torrent summary for updated entries so websocket
        // clients receive complete objects (avoids partial-delta validation
        // failures on the frontend).
        add_torrent_summary(native, entry, update.second);
        attach_labels(native, entry, update.second);
        yyjson_mut_obj_add_sint(native, entry, "bandwidthPriority",
                                update.second.bandwidth_priority);
        yyjson_mut_arr_add_val(updated_arr, entry);
    }

    return doc.write(R"({"type":"error"})");
}

std::string serialize_ws_event_torrent_added(int id)
{
    return serialize_ws_event_base(
        "torrent-added",
        std::optional<std::function<void(yyjson_mut_doc *, yyjson_mut_val *)>>(
            [id](yyjson_mut_doc *doc, yyjson_mut_val *value)
            { yyjson_mut_obj_add_sint(doc, value, "id", id); }));
}

std::string serialize_ws_event_torrent_finished(int id)
{
    return serialize_ws_event_base(
        "torrent-finished",
        std::optional<std::function<void(yyjson_mut_doc *, yyjson_mut_val *)>>(
            [id](yyjson_mut_doc *doc, yyjson_mut_val *value)
            { yyjson_mut_obj_add_sint(doc, value, "id", id); }));
}

std::string serialize_ws_event_blocklist_updated(std::size_t count)
{
    return serialize_ws_event_base(
        "blocklist-updated",
        std::optional<std::function<void(yyjson_mut_doc *, yyjson_mut_val *)>>(
            [count](yyjson_mut_doc *doc, yyjson_mut_val *value)
            {
                yyjson_mut_obj_add_uint(doc, value, "count",
                                        static_cast<std::uint64_t>(count));
            }));
}

std::string serialize_ws_event_app_shutdown()
{
    return serialize_ws_event_base("app-shutdown", std::nullopt);
}

std::string serialize_ws_event_error(std::string const &message, int code)
{
    return serialize_ws_event_base(
        "error",
        std::optional<std::function<void(yyjson_mut_doc *, yyjson_mut_val *)>>(
            [&message, code](yyjson_mut_doc *doc, yyjson_mut_val *value)
            {
                yyjson_mut_obj_add_str(doc, value, "message", message.c_str());
                yyjson_mut_obj_add_sint(doc, value, "code", code);
            }));
}

std::string serialize_fs_browse(std::string const &path,
                                std::string const &parent,
                                std::string const &separator,
                                std::vector<FsEntry> const &entries)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
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
    for (auto const &entry : entries)
    {
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
                               std::uint64_t total_bytes)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
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

std::string serialize_fs_write_result(std::uint64_t bytes_written)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }

    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);
    yyjson_mut_obj_add_str(native, root, "result", "success");

    auto *arguments = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, root, "arguments", arguments);
    yyjson_mut_obj_add_uint(native, arguments, "bytesWritten", bytes_written);

    return doc.write(R"({"result":"error"})");
}

std::string serialize_dialog_paths(std::vector<std::string> const &paths)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }

    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);
    yyjson_mut_obj_add_str(native, root, "result", "success");

    auto *arguments = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, root, "arguments", arguments);

    auto *array = yyjson_mut_arr(native);
    yyjson_mut_obj_add_val(native, arguments, "paths", array);
    for (auto const &path : paths)
    {
        yyjson_mut_arr_add_str(native, array, path.c_str());
    }

    return doc.write(R"({"result":"error"})");
}

std::string serialize_dialog_path(std::optional<std::string> const &path)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }

    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);
    yyjson_mut_obj_add_str(native, root, "result", "success");

    auto *arguments = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, root, "arguments", arguments);
    if (path)
    {
        yyjson_mut_obj_add_str(native, arguments, "path", path->c_str());
    }
    else
    {
        yyjson_mut_obj_add_null(native, arguments, "path");
    }

    return doc.write(R"({"result":"error"})");
}

std::string serialize_system_action(std::string const &action, bool success,
                                    std::string const &message,
                                    bool requires_elevation)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }

    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);
    yyjson_mut_obj_add_str(native, root, "result",
                           success ? "success" : "error");

    auto *arguments = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, root, "arguments", arguments);
    yyjson_mut_obj_add_str(native, arguments, "action", action.c_str());
    yyjson_mut_obj_add_bool(native, arguments, "success", success);
    yyjson_mut_obj_add_bool(native, arguments, "requiresElevation",
                            requires_elevation);
    if (!message.empty())
    {
        yyjson_mut_obj_add_str(native, arguments, "message", message.c_str());
    }

    return doc.write(R"({"result":"error"})");
}

std::string serialize_autorun_status(bool enabled, bool supported,
                                     bool requires_elevation)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }

    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);
    yyjson_mut_obj_add_str(native, root, "result", "success");

    auto *arguments = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, root, "arguments", arguments);
    yyjson_mut_obj_add_bool(native, arguments, "enabled", enabled);
    yyjson_mut_obj_add_bool(native, arguments, "supported", supported);
    yyjson_mut_obj_add_bool(native, arguments, "requiresElevation",
                            requires_elevation);

    return doc.write(R"({"result":"error"})");
}

std::string serialize_handler_status(bool registered, bool supported,
                                     bool requires_elevation,
                                     bool magnet_registered,
                                     bool torrent_registered)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }

    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);
    yyjson_mut_obj_add_str(native, root, "result", "success");

    auto *arguments = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, root, "arguments", arguments);
    yyjson_mut_obj_add_bool(native, arguments, "registered", registered);
    yyjson_mut_obj_add_bool(native, arguments, "supported", supported);
    yyjson_mut_obj_add_bool(native, arguments, "requiresElevation",
                            requires_elevation);
    yyjson_mut_obj_add_bool(native, arguments, "magnetRegistered",
                            magnet_registered);
    yyjson_mut_obj_add_bool(native, arguments, "torrentRegistered",
                            torrent_registered);

    return doc.write(R"({"result":"error"})");
}

std::string serialize_system_create_shortcuts(
    bool success, std::string const &message,
    std::vector<std::pair<std::string, std::string>> const &created)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }

    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);
    yyjson_mut_obj_add_str(native, root, "result",
                           success ? "success" : "error");

    auto *arguments = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, root, "arguments", arguments);
    yyjson_mut_obj_add_str(native, arguments, "action",
                           "system-create-shortcuts");
    yyjson_mut_obj_add_bool(native, arguments, "success", success);
    if (!message.empty())
    {
        yyjson_mut_obj_add_str(native, arguments, "message", message.c_str());
    }

    auto *created_obj = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, arguments, "created", created_obj);
    for (auto const &[location, path] : created)
    {
        yyjson_mut_obj_add_str(native, created_obj, location.c_str(),
                               path.c_str());
    }

    return doc.write(R"({"result":"error"})");
}

std::string serialize_system_install(SystemInstallResult const &result)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }

    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);
    yyjson_mut_obj_add_str(native, root, "result",
                           result.success ? "success" : "error");

    auto *arguments = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, root, "arguments", arguments);
    yyjson_mut_obj_add_str(native, arguments, "action", "system-install");
    yyjson_mut_obj_add_bool(native, arguments, "success", result.success);
    if (result.permission_denied)
    {
        yyjson_mut_obj_add_bool(native, arguments, "permissionDenied", true);
    }
    if (!result.message.empty())
    {
        yyjson_mut_obj_add_str(native, arguments, "message",
                               result.message.c_str());
    }

    auto *shortcut_obj = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, arguments, "shortcuts", shortcut_obj);
    for (auto const &[location, path] : result.shortcuts)
    {
        yyjson_mut_obj_add_str(native, shortcut_obj, location.c_str(),
                               path.c_str());
    }

    if (result.install_requested)
    {
        yyjson_mut_obj_add_bool(native, arguments, "installSuccess",
                                result.install_success);
        if (!result.install_message.empty())
        {
            yyjson_mut_obj_add_str(native, arguments, "installMessage",
                                   result.install_message.c_str());
        }
        if (result.installed_path)
        {
            yyjson_mut_obj_add_str(native, arguments, "installedPath",
                                   result.installed_path->c_str());
        }
    }

    yyjson_mut_obj_add_bool(native, arguments, "handlersRegistered",
                            result.handlers_registered);
    if (!result.handler_message.empty())
    {
        yyjson_mut_obj_add_str(native, arguments, "handlerMessage",
                               result.handler_message.c_str());
    }

    return doc.write(R"({"result":"error"})");
}

std::string serialize_session_test(bool port_open)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
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

std::string serialize_add_result(engine::Core::AddTorrentStatus status)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return "{}";
    }

    auto *native = doc.doc();
    auto *root = yyjson_mut_obj(native);
    doc.set_root(root);

    if (status == engine::Core::AddTorrentStatus::Ok)
    {
        yyjson_mut_obj_add_str(native, root, "result", "success");
    }
    else
    {
        yyjson_mut_obj_add_str(native, root, "result", "error");
    }

    auto *arguments = yyjson_mut_obj(native);
    yyjson_mut_obj_add_val(native, root, "arguments", arguments);
    yyjson_mut_obj_add_str(native, arguments, "message",
                           message_for_status(status));

    return doc.write(R"({"result":"error"})");
}

std::string serialize_error(std::string_view message,
                            std::optional<std::string_view> details)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
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
#ifndef NDEBUG
    if (details && !details->empty())
    {
        yyjson_mut_obj_add_strn(native, arguments, "detail", details->data(),
                                details->size());
    }
#endif

    return doc.write(R"({"result":"error"})");
}

} // namespace tt::rpc
