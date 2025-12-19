#include "libtorrent/partfile_extension.hpp"

#include <memory>
#include <mutex>
#include <string>

namespace libtorrent
{
namespace tt
{

namespace
{
std::shared_ptr<std::string> g_extension =
    std::make_shared<std::string>(".parts");
std::mutex g_extension_mutex;
} // namespace

std::string partfile_extension()
{
    std::lock_guard<std::mutex> lock(g_extension_mutex);
    return *g_extension;
}

void set_partfile_extension(std::string extension)
{
    if (extension.empty())
    {
        extension = ".parts";
    }
    else if (extension.front() != '.')
    {
        extension.insert(extension.begin(), '.');
    }

    auto updated = std::make_shared<std::string>(std::move(extension));
    std::lock_guard<std::mutex> lock(g_extension_mutex);
    g_extension = std::move(updated);
}

} // namespace tt
} // namespace libtorrent
