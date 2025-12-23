#include "utils/Log.hpp"

#include <fstream>
#include <mutex>

namespace tt::log
{

void append_log_line_to_file(std::string const &line)
{
    static std::mutex s_mutex;
    static std::ofstream s_ofs;
    if (!s_ofs.is_open())
    {
        s_ofs.open("tinytorrent.log", std::ios::app | std::ios::out);
    }
    if (s_ofs.is_open())
    {
        std::lock_guard<std::mutex> lk(s_mutex);
        s_ofs << line << '\n';
        s_ofs.flush();
    }
}

} // namespace tt::log
