#pragma once

#include "../services/SystemInstallService.hpp"
#include <string>
#include <optional>
#include <vector>

namespace tt::application::installer
{
using ShortcutRequest = ::ShortcutRequest;
using SystemInstallResult = ::SystemInstallResult;
using AutorunStatus = ::AutorunStatus;
using SystemHandlerStatus = ::SystemHandlerStatus;
using SystemActionResult = ::SystemActionResult;

struct SystemInstallRequest
{
    ShortcutRequest shortcut;
    bool register_handlers = false;
    bool install_to_program_files = false;
};

class IInstallerActions
{
  public:
    virtual ~IInstallerActions() noexcept = default;
    virtual SystemInstallResult install(SystemInstallRequest const &request) = 0;
};
} // namespace tt::application::installer
