#pragma once

#include "rpc/Serializer.hpp"

#include <filesystem>
#include <functional>
#include <optional>
#include <vector>

namespace tt::rpc::filesystem
{

using DirectoryEntriesFn =
    std::function<std::vector<FsEntry>(std::filesystem::path const &)>;
using PathCheckFn = std::function<bool(std::filesystem::path const &)>;
using SpaceQueryFn = std::function<std::optional<std::filesystem::space_info>(
    std::filesystem::path const &)>;

std::vector<FsEntry>
collect_directory_entries(std::filesystem::path const &path);
std::optional<std::filesystem::space_info>
query_space(std::filesystem::path const &path);
bool path_exists(std::filesystem::path const &path);
bool is_directory(std::filesystem::path const &path);

DirectoryEntriesFn set_directory_entries_handler(DirectoryEntriesFn handler);
PathCheckFn set_path_exists_handler(PathCheckFn handler);
PathCheckFn set_is_directory_handler(PathCheckFn handler);
SpaceQueryFn set_space_query_handler(SpaceQueryFn handler);

} // namespace tt::rpc::filesystem
