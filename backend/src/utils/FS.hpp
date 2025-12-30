#pragma once

#include <filesystem>
#include <optional>

namespace tt::utils
{

std::filesystem::path data_root();
std::optional<std::filesystem::path> executable_path();
std::optional<std::filesystem::path> tiny_torrent_appdata_root();

} // namespace tt::utils
