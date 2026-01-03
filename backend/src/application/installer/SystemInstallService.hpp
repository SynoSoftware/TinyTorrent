#pragma once

#include "application/installer/InstallerActions.hpp"

#include <memory>

namespace tt::application::installer
{
class SystemInstallService
{
  public:
    explicit SystemInstallService(
        std::shared_ptr<IInstallerActions> actions = {});

    SystemInstallResult install(SystemInstallRequest request) const;

  private:
    std::shared_ptr<IInstallerActions> actions_;
};
} // namespace tt::application::installer
