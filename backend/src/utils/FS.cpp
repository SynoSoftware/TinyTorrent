#include "utils/FS.hpp"

#include <filesystem>
#include <optional>
#include <vector>

#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <Windows.h>
#elif defined(__APPLE__)
#include <mach-o/dyld.h>
#else
#include <unistd.h>
#endif

namespace tt::utils
{

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

std::filesystem::path data_root()
{
    std::filesystem::path root;
    if (auto exe = executable_path(); exe && !exe->filename().empty())
    {
        root = exe->parent_path();
    }
    if (root.empty())
    {
        root = std::filesystem::current_path();
    }
    root /= "data";
    std::filesystem::create_directories(root);
    return root;
}

} // namespace tt::utils
