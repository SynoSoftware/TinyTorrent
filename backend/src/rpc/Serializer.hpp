#pragma once

#include "engine/Core.hpp"

#include <string>
#include <string_view>
#include <vector>

namespace tt::rpc {

std::string serialize_session_settings(engine::CoreSettings const &settings);
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

} // namespace tt::rpc
