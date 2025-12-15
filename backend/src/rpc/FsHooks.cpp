#include "rpc/FsHooks.hpp"

#include <algorithm>
#include <filesystem>
#include <system_error>

namespace tt::rpc::filesystem
{

namespace
{

std::vector<FsEntry>
default_collect_directory_entries(std::filesystem::path const &path)
{
    std::vector<FsEntry> result;
    std::error_code ec;
    for (auto const &entry : std::filesystem::directory_iterator(path, ec))
    {
        if (ec)
        {
            break;
        }
        FsEntry info;
        info.name = entry.path().filename().string();
        bool is_dir = entry.is_directory(ec);
        if (!ec && is_dir)
        {
            info.type = "directory";
        }
        else
        {
            bool is_file = entry.is_regular_file(ec);
            if (!ec && is_file)
            {
                info.type = "file";
            }
            else
            {
                info.type = "other";
            }
            if (!ec && is_file)
            {
                auto size_ec = std::error_code{};
                info.size = entry.file_size(size_ec);
                if (size_ec)
                {
                    info.size = 0;
                }
            }
        }
        result.push_back(std::move(info));
    }
    std::sort(result.begin(), result.end(),
              [](auto const &a, auto const &b)
              {
                  if (a.type != b.type)
                  {
                      return a.type < b.type;
                  }
                  return a.name < b.name;
              });
    return result;
}

std::optional<std::filesystem::space_info>
default_query_space(std::filesystem::path const &path)
{
    std::error_code ec;
    auto info = std::filesystem::space(path, ec);
    if (ec)
    {
        return std::nullopt;
    }
    return info;
}

bool default_path_exists(std::filesystem::path const &path)
{
    std::error_code ec;
    return std::filesystem::exists(path, ec);
}

bool default_is_directory(std::filesystem::path const &path)
{
    std::error_code ec;
    return std::filesystem::is_directory(path, ec);
}

DirectoryEntriesFn g_directory_entries = default_collect_directory_entries;
PathCheckFn g_path_exists = default_path_exists;
PathCheckFn g_is_directory = default_is_directory;
SpaceQueryFn g_space_query = default_query_space;

} // namespace

std::vector<FsEntry>
collect_directory_entries(std::filesystem::path const &path)
{
    return g_directory_entries(path);
}

std::optional<std::filesystem::space_info>
query_space(std::filesystem::path const &path)
{
    return g_space_query(path);
}

bool path_exists(std::filesystem::path const &path)
{
    return g_path_exists(path);
}

bool is_directory(std::filesystem::path const &path)
{
    return g_is_directory(path);
}

DirectoryEntriesFn set_directory_entries_handler(DirectoryEntriesFn handler)
{
    DirectoryEntriesFn previous = g_directory_entries;
    if (handler)
    {
        g_directory_entries = std::move(handler);
    }
    else
    {
        g_directory_entries = default_collect_directory_entries;
    }
    return previous;
}

PathCheckFn set_path_exists_handler(PathCheckFn handler)
{
    PathCheckFn previous = g_path_exists;
    if (handler)
    {
        g_path_exists = std::move(handler);
    }
    else
    {
        g_path_exists = default_path_exists;
    }
    return previous;
}

PathCheckFn set_is_directory_handler(PathCheckFn handler)
{
    PathCheckFn previous = g_is_directory;
    if (handler)
    {
        g_is_directory = std::move(handler);
    }
    else
    {
        g_is_directory = default_is_directory;
    }
    return previous;
}

SpaceQueryFn set_space_query_handler(SpaceQueryFn handler)
{
    SpaceQueryFn previous = g_space_query;
    if (handler)
    {
        g_space_query = std::move(handler);
    }
    else
    {
        g_space_query = default_query_space;
    }
    return previous;
}

} // namespace tt::rpc::filesystem
