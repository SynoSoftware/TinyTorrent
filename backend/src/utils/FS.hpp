#pragma once

#include <filesystem>
#include <optional>

namespace tt::utils
{

std::filesystem::path data_root();
std::optional<std::filesystem::path> executable_path();

} // namespace tt::utils
