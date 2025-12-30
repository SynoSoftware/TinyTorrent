#include "utils/Log.hpp"
#include "utils/FS.hpp"

#include <filesystem>
#include <fstream>
#include <mutex>
#include <optional>

namespace tt::log
{

void append_log_line_to_file(std::string const &line)
{
    static std::mutex s_mutex;
    static std::ofstream s_ofs;
    static std::optional<std::filesystem::path> s_path;
    if (!s_path)
    {
        if (auto root = tt::utils::tiny_torrent_appdata_root())
        {
            s_path = *root / "tinytorrent.log";
        }
        else
        {
            s_path = std::filesystem::path("tinytorrent.log");
        }
    }
    if (!s_ofs.is_open())
    {
        s_ofs.open(s_path->string(), std::ios::app | std::ios::out);
    }
    if (s_ofs.is_open())
    {
        std::lock_guard<std::mutex> lk(s_mutex);
        s_ofs << line << '\n';
        s_ofs.flush();
    }
}

} // namespace tt::log
