#include "application/installer/SystemInstallService.hpp"

#include <array>

namespace tt::application::installer
{
namespace
{
constexpr std::array<char const *, 3> kDefaultShortcutLocations = {
    "desktop", "start-menu", "startup"};
} // namespace

SystemInstallService::SystemInstallService(
    std::shared_ptr<IInstallerActions> actions)
    : actions_(std::move(actions))
{
}

SystemInstallResult SystemInstallService::install(
    SystemInstallRequest request) const
{
    if (!actions_)
    {
        SystemInstallResult result;
        result.message = "system-install unsupported";
        return result;
    }
    if (request.shortcut.name.empty())
    {
        request.shortcut.name = "TinyTorrent";
    }
    if (request.shortcut.locations.empty())
    {
        request.shortcut.locations.assign(kDefaultShortcutLocations.begin(),
                                          kDefaultShortcutLocations.end());
    }
    return actions_->install(std::move(request));
}
} // namespace tt::application::installer
