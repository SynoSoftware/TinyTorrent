
#include "services/SystemInstallService.hpp"

#include "utils/FS.hpp"
#include "utils/Log.hpp"

#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <objbase.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <windows.h>
#include <winreg.h>
#endif

#include <algorithm>
#include <array>
#include <atomic>
#include <condition_variable>
#include <cstdlib>
#include <cwctype>
#include <deque>
#include <filesystem>
#include <format>
#include <future>
#include <functional>
#include <fstream>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <system_error>
#include <thread>
#include <type_traits>
#include <utility>
#include <vector>
namespace
{

struct ShortcutCreationOutcome
{
    bool success = false;
    std::string message;
    std::vector<std::pair<std::string, std::string>> created;
};

struct InstallOutcome
{
    bool success = false;
    bool permission_denied = false;
    std::string message;
    std::optional<std::filesystem::path> target_path;
};

std::string path_to_string(std::filesystem::path const &value)
{
    try
    {
        return value.string();
    }
    catch (...)
    {
        return {};
    }
}
#if defined(_WIN32)
constexpr wchar_t kAutorunRegistryPath[] =
    L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
constexpr wchar_t kAutorunValueName[] = L"TinyTorrent";
constexpr wchar_t kMagnetCommandKey[] =
    L"Software\\Classes\\magnet\\shell\\open\\command";
constexpr wchar_t kTorrentExtensionKey[] = L"Software\\Classes\\.torrent";
constexpr wchar_t kTorrentClassKey[] =
    L"Software\\Classes\\TinyTorrent.torrent";
constexpr wchar_t kTorrentCommandKey[] =
    L"Software\\Classes\\TinyTorrent.torrent\\shell\\open\\command";
constexpr wchar_t kTorrentClassName[] = L"TinyTorrent.torrent";

struct HandlerRegistryStatus
{
    bool magnet = false;
    bool torrent = false;
    bool requires_elevation = false;
};

struct SystemHandlerResult
{
    bool success = false;
    bool permission_denied = false;
    std::string message;
};

std::string format_win_error_message(DWORD code)
{
    std::error_code ec(static_cast<int>(code), std::system_category());
    return ec.message();
}

std::wstring reg_sz_to_wstring(std::vector<wchar_t> &buffer,
                                 DWORD size_bytes)
{
    if (buffer.empty())
    {
        return {};
    }

    auto written = static_cast<std::size_t>(size_bytes / sizeof(wchar_t));
    if (written >= buffer.size())
    {
        written = buffer.size() - 1;
    }
    buffer[written] = L'\0';
    while (written > 0 && buffer[written - 1] == L'\0')
    {
        --written;
    }
    return std::wstring(buffer.data(), buffer.data() + written);
}

std::optional<std::wstring> read_registry_string(HKEY root,
                                                 wchar_t const *subkey,
                                                 wchar_t const *value_name)
{
    HKEY key = nullptr;
    auto status = RegOpenKeyExW(root, subkey, 0, KEY_READ, &key);
    if (status != ERROR_SUCCESS)
    {
        return std::nullopt;
    }

    DWORD type = 0;
    DWORD size = 0;
    auto name = value_name && value_name[0] != L'\0' ? value_name : nullptr;
    status = RegQueryValueExW(key, name, nullptr, &type, nullptr, &size);
    if (status != ERROR_SUCCESS || type != REG_SZ || size == 0)
    {
        RegCloseKey(key);
        return std::nullopt;
    }

    std::vector<wchar_t> buffer(size / sizeof(wchar_t) + 1ull, L'\0');
    status = RegQueryValueExW(key, name, nullptr, nullptr,
                              reinterpret_cast<LPBYTE>(buffer.data()), &size);
    RegCloseKey(key);
    if (status != ERROR_SUCCESS)
    {
        return std::nullopt;
    }

    return reg_sz_to_wstring(buffer, size);
}

std::optional<std::wstring> read_autorun_value()
{
    return read_registry_string(HKEY_CURRENT_USER, kAutorunRegistryPath,
                                kAutorunValueName);
}

std::wstring compose_autorun_command(std::wstring extra_args = {})
{
    if (auto exe = tt::utils::executable_path(); exe && !exe->empty())
    {
        std::wstring command = L"\"" + exe->wstring() + L"\"";
        if (!extra_args.empty())
        {
            command += extra_args;
        }
        return command;
    }
    return {};
}

bool write_autorun_value(std::wstring const &command, std::string &message)
{
    HKEY key = nullptr;
    auto status = RegCreateKeyExW(HKEY_CURRENT_USER, kAutorunRegistryPath, 0,
                                  nullptr, REG_OPTION_NON_VOLATILE, KEY_WRITE,
                                  nullptr, &key, nullptr);
    if (status != ERROR_SUCCESS)
    {
        message = format_win_error_message(status);
        return false;
    }
    DWORD data_size =
        static_cast<DWORD>((command.size() + 1ull) * sizeof(wchar_t));
    status = RegSetValueExW(key, kAutorunValueName, 0, REG_SZ,
                            reinterpret_cast<const BYTE *>(command.c_str()),
                            data_size);
    RegCloseKey(key);
    if (status != ERROR_SUCCESS)
    {
        message = format_win_error_message(status);
        return false;
    }
    return true;
}

bool delete_autorun_value(std::string &message)
{
    HKEY key = nullptr;
    auto status = RegOpenKeyExW(HKEY_CURRENT_USER, kAutorunRegistryPath, 0,
                                KEY_SET_VALUE, &key);
    if (status != ERROR_SUCCESS)
    {
        message = format_win_error_message(status);
        return false;
    }
    status = RegDeleteValueW(key, kAutorunValueName);
    RegCloseKey(key);
    if (status == ERROR_SUCCESS || status == ERROR_FILE_NOT_FOUND)
    {
        return true;
    }
    message = format_win_error_message(status);
    return false;
}

std::wstring trim_wide(std::wstring value)
{
    auto is_space = [](wchar_t ch)
    { return ch == L' ' || ch == L'\t' || ch == L'\r' || ch == L'\n'; };
    while (!value.empty() && is_space(value.front()))
    {
        value.erase(value.begin());
    }
    while (!value.empty() && is_space(value.back()))
    {
        value.pop_back();
    }
    return value;
}

std::wstring to_lower_wide(std::wstring value)
{
    std::transform(value.begin(), value.end(), value.begin(), [](wchar_t ch)
                   { return static_cast<wchar_t>(std::towlower(ch)); });
    return value;
}

bool registry_value_matches(std::optional<std::wstring> const &value,
                            std::wstring const &expected)
{
    if (!value)
    {
        return false;
    }
    auto left = to_lower_wide(trim_wide(*value));
    auto right = to_lower_wide(trim_wide(expected));
    return left == right;
}

std::wstring compose_handler_command()
{
    if (auto exe = tt::utils::executable_path(); exe && !exe->empty())
    {
        return std::wstring(L"\"") + exe->wstring() + L"\" \"%1\"";
    }
    return {};
}

HandlerRegistryStatus query_handler_status()
{
    HandlerRegistryStatus status{};
    auto expected = compose_handler_command();
    if (expected.empty())
    {
        return status;
    }
    auto magnet_cmd =
        read_registry_string(HKEY_CURRENT_USER, kMagnetCommandKey, L"");
    status.magnet = registry_value_matches(magnet_cmd, expected);

    if (auto hklm_magnet =
            read_registry_string(HKEY_LOCAL_MACHINE, kMagnetCommandKey, L""))
    {
        if (!registry_value_matches(hklm_magnet, expected))
        {
            status.requires_elevation = true;
        }
    }

    auto torrent_assoc =
        read_registry_string(HKEY_CURRENT_USER, kTorrentExtensionKey, L"");
    auto torrent_cmd =
        read_registry_string(HKEY_CURRENT_USER, kTorrentCommandKey, L"");
    auto assoc_match =
        torrent_assoc && to_lower_wide(trim_wide(*torrent_assoc)) ==
                             to_lower_wide(std::wstring(kTorrentClassName));
    status.torrent =
        assoc_match && registry_value_matches(torrent_cmd, expected);

    if (auto hklm_assoc =
            read_registry_string(HKEY_LOCAL_MACHINE, kTorrentExtensionKey, L""))
    {
        auto assoc_value = to_lower_wide(trim_wide(*hklm_assoc));
        auto expected_assoc = to_lower_wide(std::wstring(kTorrentClassName));
        if (!assoc_value.empty() && assoc_value != expected_assoc)
        {
            status.requires_elevation = true;
        }
    }
    if (auto hklm_torrent_cmd =
            read_registry_string(HKEY_LOCAL_MACHINE, kTorrentCommandKey, L""))
    {
        if (!registry_value_matches(hklm_torrent_cmd, expected))
        {
            status.requires_elevation = true;
        }
    }
    return status;
}

std::wstring utf8_to_wide(std::string_view text)
{
    if (text.empty())
    {
        return {};
    }
    int required = MultiByteToWideChar(
        CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0);
    if (required <= 0)
    {
        return {};
    }
    std::wstring wide;
    wide.resize(static_cast<size_t>(required));
    MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()),
                        wide.data(), required);
    return wide;
}

std::string wide_to_utf8(std::wstring_view text)
{
    if (text.empty())
    {
        return {};
    }
    int required = WideCharToMultiByte(CP_UTF8, 0, text.data(),
                                       static_cast<int>(text.size()), nullptr,
                                       0, nullptr, nullptr);
    if (required <= 0)
    {
        return {};
    }
    std::string out;
    out.resize(static_cast<size_t>(required));
    WideCharToMultiByte(CP_UTF8, 0, text.data(), static_cast<int>(text.size()),
                        out.data(), required, nullptr, nullptr);
    return out;
}

std::optional<std::filesystem::path> known_folder(REFKNOWNFOLDERID id)
{
    PWSTR folder = nullptr;
    if (FAILED(SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, nullptr, &folder)))
    {
        return std::nullopt;
    }
    std::filesystem::path result(folder);
    CoTaskMemFree(folder);
    return result;
}

bool create_windows_shortcut(std::filesystem::path const &link_path,
                             std::filesystem::path const &target_path,
                             std::wstring const &args,
                             std::wstring const &description)
{
    IShellLinkW *shell_link = nullptr;
    HRESULT hr =
        CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER,
                         IID_PPV_ARGS(&shell_link));
    if (FAILED(hr) || shell_link == nullptr)
    {
        return false;
    }

    shell_link->SetPath(target_path.c_str());
    if (!args.empty())
    {
        shell_link->SetArguments(args.c_str());
    }
    if (!description.empty())
    {
        shell_link->SetDescription(description.c_str());
    }
    shell_link->SetIconLocation(target_path.c_str(), 0);

    IPersistFile *persist = nullptr;
    hr = shell_link->QueryInterface(IID_PPV_ARGS(&persist));
    if (SUCCEEDED(hr) && persist != nullptr)
    {
        std::error_code ec;
        std::filesystem::create_directories(link_path.parent_path(), ec);
        hr = persist->Save(link_path.c_str(), TRUE);
        persist->Release();
    }

    shell_link->Release();
    return SUCCEEDED(hr);
}

ShortcutCreationOutcome create_shortcuts(ShortcutRequest const &request,
                                         std::filesystem::path const &target)
{
    ShortcutCreationOutcome outcome;
    std::wstring wide_args = utf8_to_wide(request.args);
    std::wstring wide_desc = utf8_to_wide("TinyTorrent");

    std::filesystem::path link_filename =
        std::filesystem::u8path(request.name + ".lnk");

    for (auto const &loc : request.locations)
    {
        std::optional<std::filesystem::path> base;
        if (loc == "desktop")
        {
            base = known_folder(FOLDERID_Desktop);
        }
        else if (loc == "start-menu")
        {
            base = known_folder(FOLDERID_Programs);
        }
        else if (loc == "startup")
        {
            base = known_folder(FOLDERID_Startup);
        }
        else
        {
            continue;
        }

        if (!base)
        {
            continue;
        }
        auto link_path = *base / link_filename;
        if (create_windows_shortcut(link_path, target, wide_args, wide_desc))
        {
            outcome.created.emplace_back(loc,
                                         wide_to_utf8(link_path.wstring()));
        }
    }

    outcome.success = !outcome.created.empty();
    if (!outcome.success && outcome.message.empty())
    {
        outcome.message = "no shortcuts created";
    }
    return outcome;
}

InstallOutcome install_to_program_files(std::filesystem::path const &source)
{
    InstallOutcome outcome;
    auto program_files = known_folder(FOLDERID_ProgramFiles);
    if (!program_files)
    {
        outcome.message = "unable to locate Program Files folder";
        return outcome;
    }
    auto install_dir = *program_files / "TinyTorrent";
    std::error_code ec;
    std::filesystem::create_directories(install_dir, ec);
    if (ec)
    {
        outcome.permission_denied = (ec == std::errc::permission_denied) ||
                                    (ec.value() == ERROR_ACCESS_DENIED);
        outcome.message = std::format("unable to prepare {}: {}",
                                      install_dir.string(), ec.message());
        return outcome;
    }
    auto target = install_dir / "TinyTorrent.exe";
    if (source == target)
    {
        outcome.success = true;
        outcome.target_path = target;
        outcome.message =
            std::format("already installed at {}", path_to_string(target));
        return outcome;
    }
    try
    {
        std::filesystem::copy_file(
            source, target, std::filesystem::copy_options::overwrite_existing);
        outcome.success = true;
        outcome.target_path = target;
        outcome.message =
            std::format("installed to {}", path_to_string(target));
    }
    catch (std::filesystem::filesystem_error const &ex)
    {
        outcome.permission_denied =
            (ex.code() == std::errc::permission_denied) ||
            (ex.code().value() == ERROR_ACCESS_DENIED);
        outcome.message = ex.what();
    }
    return outcome;
}
#endif

std::string join_messages(std::vector<std::string> const &values)
{
    std::string result;
    for (auto const &value : values)
    {
        if (result.empty())
        {
            result = value;
        }
        else
        {
            result += "; ";
            result += value;
        }
    }
    return result;
}

std::string escape_shell_argument(std::string const &value)
{
    std::string result;
    result.reserve(value.size() + 4);
    result.push_back('\'');
    for (char ch : value)
    {
        if (ch == '\'')
        {
            result += "'\\''";
            continue;
        }
        result.push_back(ch);
    }
    result.push_back('\'');
    return result;
}

bool run_external_command(std::string const &command)
{
    if (command.empty())
    {
        return false;
    }
    int status = std::system(command.c_str());
    return status == 0;
}

bool open_with_default_app(std::filesystem::path const &path)
{
    if (path.empty())
    {
        return false;
    }
#if defined(_WIN32)
    auto wide_path = path.wstring();
    auto handle = ShellExecuteW(nullptr, L"open", wide_path.c_str(), nullptr,
                                nullptr, SW_SHOWNORMAL);
    return reinterpret_cast<intptr_t>(handle) > 32;
#elif defined(__APPLE__)
    return run_external_command("open " + escape_shell_argument(path.string()));
#else
    return run_external_command("xdg-open " +
                                escape_shell_argument(path.string()));
#endif
}

bool reveal_in_file_manager(std::filesystem::path const &target)
{
    if (target.empty())
    {
        return false;
    }
    auto subject = target;
    if (!std::filesystem::is_directory(subject))
    {
        subject = subject.parent_path();
    }
    if (subject.empty())
    {
        subject = std::filesystem::current_path();
    }
#if defined(_WIN32)
    auto params = std::wstring(L"/select,") + target.wstring();
    auto handle = ShellExecuteW(nullptr, L"open", L"explorer.exe",
                                params.c_str(), nullptr, SW_SHOWNORMAL);
    return reinterpret_cast<intptr_t>(handle) > 32;
#else
    return open_with_default_app(subject);
#endif
}

#if defined(_WIN32)
SystemHandlerResult register_windows_handler()
{
    SystemHandlerResult result;
    auto exe_path = tt::utils::executable_path();
    if (!exe_path)
    {
        result.message = "unable to determine executable path";
        return result;
    }

    std::wstring command = L"\"" + exe_path->wstring() + L"\" \"%1\"";
    auto set_value = [&](std::wstring const &subkey,
                         std::wstring const &value_name,
                         std::wstring const &value) -> DWORD
    {
        HKEY handle = nullptr;
        DWORD disposition = 0;
        auto status = RegCreateKeyExW(
            HKEY_CURRENT_USER, subkey.c_str(), 0, nullptr,
            REG_OPTION_NON_VOLATILE, KEY_WRITE, nullptr, &handle, &disposition);
        if (status != ERROR_SUCCESS)
        {
            return status;
        }
        auto name_ptr = value_name.empty() ? nullptr : value_name.c_str();
        auto data_ptr = reinterpret_cast<const BYTE *>(value.c_str());
        auto data_size =
            static_cast<DWORD>((value.size() + 1) * sizeof(wchar_t));
        status =
            RegSetValueExW(handle, name_ptr, 0, REG_SZ, data_ptr, data_size);
        RegCloseKey(handle);
        return status;
    };

    auto fail = [&](std::string const &context,
                    DWORD code) -> SystemHandlerResult
    {
        SystemHandlerResult failure;
        failure.permission_denied = code == ERROR_ACCESS_DENIED;
        if (failure.permission_denied)
        {
            failure.message = "permission-denied";
        }
        else
        {
            std::error_code ec(static_cast<int>(code), std::system_category());
            failure.message = context + ": " + ec.message();
        }
        return failure;
    };

    auto apply = [&](std::wstring const &key, std::wstring const &name,
                     std::wstring const &value) -> DWORD
    { return set_value(key, name, value); };

    if (auto status =
            apply(L"Software\\Classes\\magnet", {}, L"URL:magnet Protocol");
        status != ERROR_SUCCESS)
    {
        return fail("magnet registration failed", status);
    }
    if (auto status = apply(L"Software\\Classes\\magnet", L"URL Protocol",
                            L"");
        status != ERROR_SUCCESS)
    {
        return fail("magnet registration failed", status);
    }
    if (auto status =
            apply(L"Software\\Classes\\magnet\\shell\\open\\command",
                  {}, command);
        status != ERROR_SUCCESS)
    {
        return fail("magnet handler registration failed", status);
    }
    if (auto status = apply(L"Software\\Classes\\.torrent", {},
                            L"TinyTorrent.torrent");
        status != ERROR_SUCCESS)
    {
        return fail("torrent extension registration failed", status);
    }
    if (auto status = apply(
            L"Software\\Classes\\TinyTorrent.torrent\\shell\\open\\command",
            {}, command);
        status != ERROR_SUCCESS)
    {
        return fail("torrent handler registration failed", status);
    }

    SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
    TT_LOG_INFO("registered magnet/.torrent handler ({})",
                exe_path->string());
    result.success = true;
    result.message = "system handler registered";
    return result;
}

SystemHandlerResult unregister_windows_handler()
{
    SystemHandlerResult result;
    auto status = query_handler_status();
    if (!status.magnet && !status.torrent)
    {
        result.success = true;
        result.message = "system handler already unregistered";
        return result;
    }
    std::vector<std::string> errors;
    auto delete_key = [&](wchar_t const *key) -> bool
    {
        auto code = RegDeleteKeyW(HKEY_CURRENT_USER, key);
        if (code == ERROR_SUCCESS || code == ERROR_FILE_NOT_FOUND)
        {
            return true;
        }
        if (code == ERROR_ACCESS_DENIED)
        {
            result.permission_denied = true;
        }
        errors.push_back(format_win_error_message(code));
        return false;
    };
    auto delete_key_chain =
        [&](std::vector<wchar_t const *> const &keys) -> bool
    {
        bool ok = true;
        for (auto key : keys)
        {
            if (!key)
            {
                continue;
            }
            ok = delete_key(key) && ok;
        }
        return ok;
    };
    bool ok = true;
    if (status.magnet)
    {
        ok = delete_key_chain({
                 L"Software\\Classes\\magnet\\shell\\open\\command",
                 L"Software\\Classes\\magnet\\shell\\open",
                 L"Software\\Classes\\magnet\\shell",
                 L"Software\\Classes\\magnet",
             }) &&
             ok;
    }
    if (status.torrent)
    {
        bool can_delete_assoc = false;
        if (auto current_assoc =
                read_registry_string(HKEY_CURRENT_USER, kTorrentExtensionKey,
                                      L"");
            current_assoc)
        {
            auto assoc_value = to_lower_wide(trim_wide(*current_assoc));
            auto expected_assoc =
                to_lower_wide(std::wstring(kTorrentClassName));
            if (!assoc_value.empty() && assoc_value == expected_assoc)
            {
                can_delete_assoc = true;
            }
        }
        if (can_delete_assoc)
        {
            ok = delete_key(kTorrentExtensionKey) && ok;
        }
        ok =
            delete_key_chain({
                L"Software\\Classes\\TinyTorrent.torrent\\shell\\open\\command",
                L"Software\\Classes\\TinyTorrent.torrent\\shell\\open",
                L"Software\\Classes\\TinyTorrent.torrent\\shell",
                L"Software\\Classes\\TinyTorrent.torrent",
            }) &&
            ok;
    }
    SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
    result.success = ok;
    if (ok)
    {
        result.message = "system handler unregistered";
    }
    else
    {
        std::string combined;
        for (auto const &entry : errors)
        {
            if (combined.empty())
            {
                combined = entry;
            }
            else
            {
                combined += "; ";
                combined += entry;
            }
        }
        result.message = combined;
    }
    return result;
}
#endif
#if defined(__linux__)
SystemHandlerResult register_linux_handler()
{
    SystemHandlerResult result;
    auto exe_path = tt::utils::executable_path();
    if (!exe_path)
    {
        result.message = "unable to determine executable path";
        return result;
    }
    char const *home = std::getenv("HOME");
    if (home == nullptr || home[0] == '\0')
    {
        result.message = "HOME environment variable is not set";
        return result;
    }
    std::filesystem::path data_home;
    if (char const *xdg = std::getenv("XDG_DATA_HOME"); xdg && xdg[0] != '\0')
    {
        data_home = xdg;
    }
    else
    {
        data_home = std::filesystem::path(home) / ".local/share";
    }
    auto applications = data_home / "applications";
    std::error_code ec;
    std::filesystem::create_directories(applications, ec);
    if (ec)
    {
        result.permission_denied = (ec == std::errc::permission_denied);
        result.message = std::format("unable to ensure {}: {}",
                                     applications.string(), ec.message());
        return result;
    }
    auto desktop_file = applications / "tinytorrent.desktop";
    auto tmp_file = desktop_file;
    tmp_file += ".tmp";
    std::ofstream output(tmp_file, std::ios::trunc);
    if (!output)
    {
        result.message = std::format("unable to write {}", tmp_file.string());
        return result;
    }
    output << "[Desktop Entry]\n";
    output << "Type=Application\n";
    output << "Name=TinyTorrent\n";
    output << std::format("Exec=\"{}\" \"%u\"\n", exe_path->string());
    output << "MimeType=application/x-bittorrent;x-scheme-handler/magnet;\n";
    output << "Categories=Network;FileTransfer;\n";
    output << "Terminal=false\n";
    output << "StartupNotify=false\n";
    output << "Icon=tinytorrent\n";
    output.close();
    if (!output)
    {
        result.message = std::format("failed to write {}", tmp_file.string());
        return result;
    }
    std::filesystem::rename(tmp_file, desktop_file, ec);
    if (ec)
    {
        result.permission_denied = (ec == std::errc::permission_denied);
        result.message = std::format("unable to store {}: {}",
                                     desktop_file.string(), ec.message());
        return result;
    }
    auto run_command = [](std::string command)
    { return !command.empty() && std::system(command.c_str()) == 0; };
    bool mime_success = true;
    for (auto const *command :
         std::array<char const *, 2>{
             "xdg-mime default tinytorrent.desktop x-scheme-handler/magnet",
             "xdg-mime default tinytorrent.desktop application/x-bittorrent"})
    {
        mime_success &= run_command(command);
    }
    result.success = true;
    if (mime_success)
    {
        result.message = "system handler registered";
    }
    else
    {
        result.message = "desktop entry created; xdg-mime failed (ensure xdg-utils installed)";
    }
    return result;
}
#endif

#if defined(__APPLE__)
SystemHandlerResult register_mac_handler()
{
    SystemHandlerResult result;
    result.message =
        "system-register-handler requires a GUI bundle on macOS; install TinyTorrent.app to register handlers";
    return result;
}
#endif

SystemHandlerResult register_platform_handler()
{
#if defined(_WIN32)
    return register_windows_handler();
#elif defined(__linux__)
    return register_linux_handler();
#elif defined(__APPLE__)
    return register_mac_handler();
#else
    SystemHandlerResult result;
    result.message = "system-register-handler unsupported";
    return result;
#endif
}

SystemHandlerResult unregister_platform_handler()
{
#if defined(_WIN32)
    return unregister_windows_handler();
#else
    SystemHandlerResult result;
    result.message = "system-handler unsupported";
    return result;
#endif
}

#if defined(_WIN32)
class ScopedCOM
{
  public:
    ScopedCOM() noexcept
        : initialized_(SUCCEEDED(CoInitializeEx(
              nullptr, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE)))
    {
    }

    ~ScopedCOM()
    {
        if (initialized_)
        {
            CoUninitialize();
        }
    }

    [[nodiscard]] bool initialized() const noexcept
    {
        return initialized_;
    }

  private:
    bool initialized_ = false;
};
#else
class ScopedCOM
{
  public:
    ScopedCOM() noexcept = default;
    ~ScopedCOM() noexcept = default;
};
#endif
#if defined(_WIN32)
class StaWorker
{
  public:
    struct QueuedWork
    {
        std::function<void()> work;
        std::function<void()> cancel;
    };

    StaWorker();
    ~StaWorker();

    void post(QueuedWork work);
    bool com_ready() const noexcept;

  private:
    void run();

    std::thread thread_;
    std::mutex mutex_;
    std::condition_variable cv_;
    std::deque<QueuedWork> queue_;
    bool stop_ = false;
    bool started_ = false;
    std::atomic<bool> com_ready_{false};
};

StaWorker::StaWorker()
{
    thread_ = std::thread([this]() { run(); });
    std::unique_lock<std::mutex> lock(mutex_);
    cv_.wait(lock, [this]() { return started_; });
}

StaWorker::~StaWorker()
{
    {
        std::lock_guard<std::mutex> lock(mutex_);
        stop_ = true;
        while (!queue_.empty())
        {
            auto work = std::move(queue_.front());
            queue_.pop_front();
            if (work.cancel)
            {
                work.cancel();
            }
        }
    }
    cv_.notify_all();
    if (thread_.joinable())
    {
        thread_.join();
    }
}

void StaWorker::post(QueuedWork work)
{
    std::lock_guard<std::mutex> lock(mutex_);
    if (stop_)
    {
        if (work.cancel)
        {
            work.cancel();
        }
        return;
    }
    queue_.push_back(std::move(work));
    cv_.notify_one();
}

bool StaWorker::com_ready() const noexcept
{
    return com_ready_.load(std::memory_order_acquire);
}

void StaWorker::run()
{
    HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED |
                                             COINIT_DISABLE_OLE1DDE);
    bool initialized = SUCCEEDED(hr);
    com_ready_.store(initialized, std::memory_order_release);

    {
        std::lock_guard<std::mutex> lock(mutex_);
        started_ = true;
    }
    cv_.notify_all();

    while (true)
    {
        QueuedWork work;
        {
            std::unique_lock<std::mutex> lock(mutex_);
            if (queue_.empty() && !stop_)
            {
                lock.unlock();
                DWORD res = MsgWaitForMultipleObjects(0, nullptr, FALSE, 50,
                                                      QS_ALLINPUT);
                if (res == WAIT_OBJECT_0)
                {
                    MSG msg;
                    while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE))
                    {
                        TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    }
                }
                lock.lock();
            }
            if (stop_ && queue_.empty())
            {
                break;
            }
            if (queue_.empty())
            {
                continue;
            }
            work = std::move(queue_.front());
            queue_.pop_front();
        }
        if (work.work)
        {
            work.work();
        }
    }

    if (initialized)
    {
        CoUninitialize();
    }
}

template<typename Fn>
auto run_sta_task(StaWorker &worker, Fn &&fn)
    -> std::invoke_result_t<Fn>
{
    using Result = std::invoke_result_t<Fn>;
    auto promise = std::make_shared<std::promise<Result>>();
    auto future = promise->get_future();
    worker.post(StaWorker::QueuedWork{
        [fn = std::forward<Fn>(fn), promise]() mutable
        {
            try
            {
                if constexpr (std::is_void_v<Result>)
                {
                    fn();
                    promise->set_value();
                }
                else
                {
                    promise->set_value(fn());
                }
            }
            catch (...)
            {
                promise->set_exception(std::current_exception());
            }
        },
        [promise]() mutable
        {
            try
            {
                promise->set_exception(
                    std::make_exception_ptr(std::runtime_error(
                        "STA task cancelled")));
            }
            catch (...)
            {
            }
        }});
    return future.get();
}
#endif
} // namespace

struct SystemInstallService::Impl
{
#if defined(_WIN32)
    StaWorker sta_worker;
#endif
};

SystemInstallService::SystemInstallService()
    : impl_(std::make_unique<Impl>())
{
}

SystemInstallService::~SystemInstallService() = default;

void SystemInstallService::shutdown()
{
    impl_.reset();
}
SystemInstallResult SystemInstallService::install(
    ShortcutRequest const &request, bool register_handlers,
    bool install_to_program_files_flag)
{
    SystemInstallResult result;
#if defined(_WIN32)
    if (!impl_)
    {
        result.message = "system-install unavailable";
        return result;
    }
    try
    {
        result = run_sta_task(impl_->sta_worker, [request, register_handlers,
                                                   install_to_program_files_flag]()
        {
            SystemInstallResult local_result;
            local_result.install_requested = install_to_program_files_flag;

            auto executable_path = tt::utils::executable_path();
            if (!executable_path || executable_path->empty())
            {
                local_result.message = "unable to determine executable path";
                return local_result;
            }

            std::filesystem::path shortcut_target = *executable_path;
            std::vector<std::string> error_messages;

            if (install_to_program_files_flag)
            {
                auto install_result =
                    install_to_program_files(*executable_path);
                local_result.install_success = install_result.success;
                local_result.permission_denied |= install_result.permission_denied;
                local_result.install_message = install_result.message;
                if (install_result.target_path)
                {
                    local_result.installed_path =
                        path_to_string(*install_result.target_path);
                    shortcut_target = *install_result.target_path;
                }
                if (!install_result.success && !install_result.message.empty())
                {
                    error_messages.push_back(install_result.message);
                }
            }

            auto shortcuts = create_shortcuts(request, shortcut_target);
            local_result.shortcuts = shortcuts.created;
            if (!shortcuts.success && !shortcuts.message.empty())
            {
                error_messages.push_back(shortcuts.message);
            }

            local_result.success = shortcuts.success;
            if (install_to_program_files_flag && !local_result.install_success)
            {
                local_result.success = false;
            }

            if (!shortcuts.success)
            {
                local_result.success = false;
            }

            if (register_handlers)
            {
                auto handler_result = register_platform_handler();
                local_result.handlers_registered = handler_result.success;
                local_result.handler_message = handler_result.message;
                local_result.permission_denied |= handler_result.permission_denied;
                if (!handler_result.success && !handler_result.message.empty())
                {
                    error_messages.push_back(handler_result.message);
                }
                if (!handler_result.success)
                {
                    local_result.success = false;
                }
            }

            if (!error_messages.empty())
            {
                local_result.message = join_messages(error_messages);
            }
            return local_result;
        });
    }
    catch (std::exception const &ex)
    {
        TT_LOG_INFO("system-install: STA task failed: {}", ex.what());
        result.message = ex.what();
    }
    catch (...)
    {
        TT_LOG_INFO("system-install: STA task failed with unknown error");
        result.message = "internal error";
    }
#else
    result.message = "system-install unsupported";
#endif
    return result;
}

AutorunStatus SystemInstallService::get_autorun_status(
    bool hidden_when_autorun)
{
    AutorunStatus status;
#if defined(_WIN32)
    status.supported = true;
    std::wstring extra_args =
        hidden_when_autorun ? L" --start-hidden" : std::wstring{};
    auto command = compose_autorun_command(extra_args);
    if (!command.empty())
    {
        if (auto existing = read_autorun_value(); existing && *existing == command)
        {
            status.enabled = true;
        }
    }
#endif
    return status;
}

SystemActionResult SystemInstallService::set_autorun(bool enabled,
                                                      bool hidden_when_autorun)
{
    SystemActionResult result;
#if defined(_WIN32)
    std::wstring extra_args =
        hidden_when_autorun ? L" --start-hidden" : std::wstring{};
    if (!enabled)
    {
        std::string message;
        bool success = delete_autorun_value(message);
        result.success = success;
        if (!success)
        {
            result.message = message;
        }
        return result;
    }
    auto command = compose_autorun_command(extra_args);
    if (command.empty())
    {
        result.message = "unable to determine executable path";
        return result;
    }
    std::string message;
    bool success = write_autorun_value(command, message);
    result.success = success;
    if (!success)
    {
        result.message = message;
    }
#else
    result.message = "system-autorun unsupported";
#endif
    return result;
}

SystemHandlerStatus SystemInstallService::get_handler_status()
{
    SystemHandlerStatus status;
#if defined(_WIN32)
    auto query = query_handler_status();
    status.magnet = query.magnet;
    status.torrent = query.torrent;
    status.requires_elevation = query.requires_elevation;
    status.registered = query.magnet && query.torrent;
    status.supported = true;
#endif
    return status;
}

SystemActionResult SystemInstallService::set_handler_enabled(bool enabled)
{
    SystemActionResult result;
#if defined(_WIN32)
    SystemHandlerResult handler_result = enabled
                                           ? register_platform_handler()
                                           : unregister_platform_handler();
    result.success = handler_result.success;
    result.message = handler_result.message;
#else
    result.message = "system-handler unsupported";
#endif
    return result;
}

SystemActionResult SystemInstallService::reveal_path(
    std::filesystem::path const &path)
{
    SystemActionResult result;
#if defined(_WIN32)
    if (!impl_)
    {
        result.message = "system-reveal unavailable";
        return result;
    }
    try
    {
        result = run_sta_task(impl_->sta_worker, [path]() mutable
        {
            SystemActionResult action;
            bool success = reveal_in_file_manager(path);
            action.success = success;
            if (!success)
            {
                action.message = "unable to reveal path";
            }
            return action;
        });
    }
    catch (std::exception const &ex)
    {
        TT_LOG_INFO("system-reveal: STA task failed: {}", ex.what());
        result.message = ex.what();
    }
    catch (...)
    {
        TT_LOG_INFO("system-reveal: STA task failed with unknown error");
        result.message = "internal error";
    }
#else
    result.message = "system-reveal unsupported";
#endif
    return result;
}

SystemActionResult SystemInstallService::open_path(
    std::filesystem::path const &path)
{
    SystemActionResult result;
#if defined(_WIN32)
    if (!impl_)
    {
        result.message = "system-open unavailable";
        return result;
    }
    try
    {
        result = run_sta_task(impl_->sta_worker, [path]() mutable
        {
            SystemActionResult action;
            bool success = open_with_default_app(path);
            action.success = success;
            if (!success)
            {
                action.message = "unable to open path";
            }
            return action;
        });
    }
    catch (std::exception const &ex)
    {
        TT_LOG_INFO("system-open: STA task failed: {}", ex.what());
        result.message = ex.what();
    }
    catch (...)
    {
        TT_LOG_INFO("system-open: STA task failed with unknown error");
        result.message = "internal error";
    }
#else
    result.message = "system-open unsupported";
#endif
    return result;
}
