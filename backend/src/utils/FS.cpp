#include "utils/FS.hpp"

#include <filesystem>
#include <optional>
#include <system_error>
#include <vector>

#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <Windows.h>
#include <ShlObj.h>
#elif defined(__APPLE__)
#include <mach-o/dyld.h>
#else
#include <unistd.h>
#endif

namespace tt::utils
{

namespace
{
std::optional<std::filesystem::path> ensure_directory(
    std::filesystem::path const &candidate)
{
    std::error_code ec;
    std::filesystem::create_directories(candidate, ec);
    if (!ec || std::filesystem::exists(candidate))
    {
        return candidate;
    }
    return std::nullopt;
}

std::filesystem::path fallback_root()
{
    if (auto exe = executable_path(); exe && !exe->filename().empty())
    {
        return exe->parent_path();
    }
    return std::filesystem::current_path();
}
} // namespace

std::optional<std::filesystem::path> executable_path()
{
#if defined(_WIN32)
    std::vector<wchar_t> buffer(32768);
    while (true)
    {
        DWORD length = GetModuleFileNameW(nullptr, buffer.data(),
                                          static_cast<DWORD>(buffer.size()));
        if (length == 0)
        {
            return std::nullopt;
        }
        if (length < buffer.size())
        {
            return std::filesystem::path(buffer.data(), buffer.data() + length);
        }
        if (buffer.size() >= (1 << 16))
        {
            return std::nullopt;
        }
        buffer.resize(buffer.size() * 2);
    }
#elif defined(__APPLE__)
    uint32_t size = 0;
    _NSGetExecutablePath(nullptr, &size);
    if (size == 0)
    {
        return std::nullopt;
    }
    std::vector<char> buffer(size);
    if (_NSGetExecutablePath(buffer.data(), &size) != 0)
    {
        return std::nullopt;
    }
    return std::filesystem::path(buffer.data());
#else
    std::vector<char> buffer(4096);
    while (true)
    {
        ssize_t length =
            readlink("/proc/self/exe", buffer.data(), buffer.size());
        if (length == -1)
        {
            return std::nullopt;
        }
        if (static_cast<std::size_t>(length) < buffer.size())
        {
            return std::filesystem::path(buffer.data(), buffer.data() + length);
        }
        buffer.resize(buffer.size() * 2);
    }
#endif
}

std::optional<std::filesystem::path> tiny_torrent_appdata_root()
{
#if defined(_WIN32)
    PWSTR local_app = nullptr;
    if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE,
                                       nullptr, &local_app)) &&
        local_app)
    {
        std::filesystem::path path(local_app);
        CoTaskMemFree(local_app);
        path /= "TinyTorrent";
        if (auto ensured = ensure_directory(path))
        {
            return *ensured;
        }
    }
    wchar_t fallback_path[MAX_PATH] = {};
    if (SUCCEEDED(SHGetFolderPathW(nullptr,
                                   CSIDL_LOCAL_APPDATA | CSIDL_FLAG_CREATE,
                                   nullptr, SHGFP_TYPE_CURRENT, fallback_path)))
    {
        std::filesystem::path path(fallback_path);
        path /= "TinyTorrent";
        if (auto ensured = ensure_directory(path))
        {
            return *ensured;
        }
    }
#endif
    return std::nullopt;
}

std::filesystem::path data_root()
{
#if defined(_WIN32)
    if (auto appdata = tiny_torrent_appdata_root())
    {
        auto root = *appdata;
        root /= "data";
        if (auto ensured = ensure_directory(root))
        {
            return *ensured;
        }
        return {};
    }
#endif
    auto fallback = fallback_root();
    fallback /= "data";
    if (auto ensured = ensure_directory(fallback))
    {
        return *ensured;
    }
    return fallback;
}

} // namespace tt::utils
