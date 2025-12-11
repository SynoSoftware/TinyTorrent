#pragma once

#include "engine/Core.hpp"

#include <chrono>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace tt::rpc {

struct FsEntry {
  std::string name;
  std::string type;
  std::uint64_t size = 0;
};

std::string serialize_fs_browse(std::string const &path,
                                std::string const &parent,
                                std::string const &separator,
                                std::vector<FsEntry> const &entries);
std::string serialize_fs_space(std::string const &path,
                               std::uint64_t free_bytes,
                               std::uint64_t total_bytes);
std::string serialize_system_action(std::string const &action, bool success,
                                    std::string const &message);

std::string serialize_capabilities();

std::string serialize_session_settings(
    engine::CoreSettings const &settings, std::size_t blocklist_entries,
    std::optional<std::chrono::system_clock::time_point> blocklist_updated,
    std::string const &rpc_bind);
std::string serialize_session_stats(engine::SessionSnapshot const &snapshot);
std::string serialize_add_result(engine::Core::AddTorrentStatus status);
std::string serialize_error(std::string_view message);
std::string serialize_torrent_list(
    std::vector<engine::TorrentSnapshot> const &torrents);
std::string serialize_torrent_detail(
    std::vector<engine::TorrentDetail> const &details);
std::string serialize_free_space(std::string const &path, std::uint64_t sizeBytes,
                                 std::uint64_t totalSize);
std::string serialize_success();
std::string serialize_session_test(bool port_open);
std::string serialize_torrent_rename(int id, std::string const &name,
                                     std::string const &path);
std::string serialize_blocklist_update(
    std::size_t entries,
    std::optional<std::chrono::system_clock::time_point> last_updated);
std::string serialize_ws_snapshot(engine::SessionSnapshot const &snapshot);
std::string serialize_ws_patch(engine::SessionSnapshot const &snapshot,
                               std::vector<engine::TorrentSnapshot> const &added,
                               std::vector<engine::TorrentSnapshot> const &updated,
                               std::vector<int> const &removed);
std::string serialize_ws_event_torrent_added(int id);
std::string serialize_ws_event_torrent_finished(int id);
std::string serialize_ws_event_blocklist_updated(std::size_t count);
std::string serialize_ws_event_app_shutdown();
std::string serialize_ws_event_error(std::string const &message, int code);

} // namespace tt::rpc
