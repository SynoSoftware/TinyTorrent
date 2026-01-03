#pragma once

#include <filesystem>
#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <vector>

// --- Data Structures (Moved from Dispatcher) ---

struct ShortcutRequest
{
    std::string name = "TinyTorrent";
    std::string args;
    std::vector<std::string> locations;
};

struct SystemInstallResult
{
    bool success = false;
    bool install_requested = false;
    bool install_success = false;
    bool permission_denied = false;
    std::string message;
    std::string install_message;
    std::string installed_path;
    bool handlers_registered = false;
    std::string handler_message;
    std::vector<std::pair<std::string, std::string>>
        shortcuts; // Location -> Path
};

struct AutorunStatus
{
    bool enabled = false;
    bool supported = false;
    bool requires_elevation = false;
};

struct SystemHandlerStatus
{
    bool registered = false;
    bool supported = false;
    bool requires_elevation = false;
    bool magnet = false;
    bool torrent = false;
};

struct SystemActionResult
{
    bool success = false;
    std::string message;
};

// --- Service Interface ---

class SystemInstallService
{
  public:
    SystemInstallService();
    ~SystemInstallService();

    // Prevent copy
    SystemInstallService(const SystemInstallService &) = delete;
    SystemInstallService &operator=(const SystemInstallService &) = delete;

    // Core Installation Logic
    SystemInstallResult install(ShortcutRequest const &request,
                                bool register_handlers,
                                bool install_to_program_files);

    // Autorun Management
    AutorunStatus get_autorun_status(bool hidden_when_autorun);
    SystemActionResult set_autorun(bool enabled, bool hidden_when_autorun);

    // Protocol Handler Management
    SystemHandlerStatus get_handler_status();
    SystemActionResult set_handler_enabled(bool enabled);

    // Shell Interaction (Reveal/Open)
    SystemActionResult reveal_path(std::filesystem::path const &path);
    SystemActionResult open_path(std::filesystem::path const &path);

    // Lifecycle
    void shutdown();

private:
    struct Impl; // PIMPL to hide <windows.h> and StaWorker
    std::unique_ptr<Impl> impl_;
};

namespace tt::application::installer
{
using SystemInstallResult = ::SystemInstallResult;
using AutorunStatus = ::AutorunStatus;
using SystemHandlerStatus = ::SystemHandlerStatus;
using SystemActionResult = ::SystemActionResult;
}
