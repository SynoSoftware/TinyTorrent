
#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
// Include winsock2 before Windows.h to avoid conflicts with winsock.h
#include <objbase.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <windows.h>
#include <winreg.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#endif
#include "rpc/Dispatcher.hpp"
#include "rpc/SystemHandler.hpp"

#include "rpc/Serializer.hpp"
#include "utils/Base64.hpp"
#include "utils/Endpoint.hpp"
#include "utils/FS.hpp"
#include "utils/Json.hpp"
#include "utils/Log.hpp"
#include "utils/Shutdown.hpp"

#include <algorithm>
#include <array>
#include <atomic>
#include <cctype>
#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cwctype>
#include <deque>
#include <exception>
#include <filesystem>
#include <format>
#include <fstream>
#include <iterator>
#include <functional>
#include <future>
#include <limits>
#include <memory>
#include <mutex>
#include <shared_mutex>
#include <optional>
#include <random>
#include <string>
#include <string_view>
#include <system_error>
#include <thread>
#include <unordered_set>
#include <utility>
#include <vector>
#include <yyjson.h>

namespace tt::rpc
{

namespace
{
std::mutex g_handler_error_mutex;
std::string g_handler_error_message;

void set_handler_error_message(std::string message)
{
    std::lock_guard<std::mutex> lock(g_handler_error_mutex);
    g_handler_error_message = std::move(message);
}

std::string handler_error_message()
{
    std::lock_guard<std::mutex> lock(g_handler_error_mutex);
    return g_handler_error_message;
}

char const *add_torrent_status_name(engine::Core::AddTorrentStatus status)
{
    switch (status)
    {
    case engine::Core::AddTorrentStatus::Ok:
        return "ok";
    case engine::Core::AddTorrentStatus::InvalidUri:
        return "invalid-uri";
    case engine::Core::AddTorrentStatus::InvalidPath:
        return "invalid-path";
    }
    return "unknown";
}

} // namespace

struct ShortcutRequest
{
    std::string name = "TinyTorrent";
    std::string args;
    std::vector<std::string> locations;
};

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

std::string format_win_error_message(DWORD code)
{
    std::error_code ec(static_cast<int>(code), std::system_category());
    return ec.message();
}

std::wstring reg_sz_to_wstring(std::vector<wchar_t> &buffer, DWORD size_bytes)
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

    // +1 to guarantee a trailing NUL even if the registry data isn't.
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

struct HandlerRegistryStatus
{
    bool magnet = false;
    bool torrent = false;
    bool requires_elevation = false;
};

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
        if (auto current_assoc = read_registry_string(
                HKEY_CURRENT_USER, kTorrentExtensionKey, L"");
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
namespace
{
constexpr std::array<char const *, 3> kDefaultShortcutLocations = {
    "desktop", "start-menu", "startup"};

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

std::vector<FsEntry> collect_directory_entries_generic(
    std::filesystem::path const &path)
{
    std::vector<FsEntry> result;
    std::error_code iter_ec;
    for (std::filesystem::directory_iterator iter(path, iter_ec);
         iter != std::filesystem::directory_iterator(); iter.increment(iter_ec))
    {
        if (iter_ec)
        {
            iter_ec.clear();
            continue;
        }
        auto const &entry = *iter;
        FsEntry info;
        info.name = entry.path().filename().string();
        std::error_code type_ec;
        if (entry.is_directory(type_ec))
        {
            info.type = "directory";
        }
        else
        {
            type_ec.clear();
            if (entry.is_regular_file(type_ec))
            {
                info.type = "file";
            }
            else
            {
                info.type = "other";
            }
        }
        if (info.type == "file")
        {
            std::error_code size_ec;
            info.size = entry.file_size(size_ec);
            if (size_ec)
            {
                info.size = 0;
            }
        }
        result.push_back(std::move(info));
    }
    std::sort(result.begin(), result.end(),
              [](FsEntry const &a, FsEntry const &b)
              {
                  if (a.type != b.type)
                  {
                      return a.type < b.type;
                  }
                  return a.name < b.name;
              });
    return result;
}

std::optional<std::filesystem::space_info> query_directory_space(
    std::filesystem::path const &path)
{
    std::error_code ec;
    auto info = std::filesystem::space(path, ec);
    if (ec)
    {
        return std::nullopt;
    }
    return info;
}

bool filesystem_path_exists(std::filesystem::path const &path)
{
    std::error_code ec;
    return std::filesystem::exists(path, ec);
}

bool filesystem_is_directory(std::filesystem::path const &path)
{
    std::error_code ec;
    return std::filesystem::is_directory(path, ec);
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

std::mutex g_sta_worker_mutex;
std::unique_ptr<StaWorker> g_sta_worker;

StaWorker &sta_worker()
{
    std::lock_guard<std::mutex> lock(g_sta_worker_mutex);
    if (!g_sta_worker)
    {
        g_sta_worker = std::make_unique<StaWorker>();
    }
    return *g_sta_worker;
}

void shutdown_sta_worker() noexcept
{
    std::unique_ptr<StaWorker> worker;
    {
        std::lock_guard<std::mutex> lock(g_sta_worker_mutex);
        worker = std::move(g_sta_worker);
    }
}

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

    // Message pump: use MsgWaitForMultipleObjects so that COM/Win32 messages
    // (required for shell dialogs and OLE) are dispatched while waiting
    // for queued work. This prevents deadlocks where dialogs never process
    // messages on STA threads.
    while (true)
    {
        QueuedWork work;
        {
            std::unique_lock<std::mutex> lock(mutex_);
            if (queue_.empty() && !stop_)
            {
                // Release lock while we wait for either messages or timeout.
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
#endif

#if defined(_WIN32)
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

std::optional<ShortcutRequest>
parse_shortcut_request(yyjson_val *arguments,
                       std::vector<std::string> const &default_locations,
                       std::string &error)
{
    ShortcutRequest request;
    request.locations = default_locations;
    auto get_argument = [arguments](char const *key) -> yyjson_val *
    { return arguments ? yyjson_obj_get(arguments, key) : nullptr; };
    if (auto *val = get_argument("name"); val && yyjson_is_str(val))
    {
        request.name = yyjson_get_str(val);
    }
    if (request.name.empty() || request.name.size() > 64)
    {
        error = "invalid name";
        return std::nullopt;
    }
    if (auto *val = get_argument("args"); val && yyjson_is_str(val))
    {
        request.args = yyjson_get_str(val);
    }
    if (auto *val = get_argument("locations"))
    {
        if (!yyjson_is_arr(val))
        {
            error = "locations must be an array";
            return std::nullopt;
        }
        request.locations.clear();
        size_t idx = 0, limit = 0;
        yyjson_val *item = nullptr;
        yyjson_arr_foreach(val, idx, limit, item)
        {
            if (item && yyjson_is_str(item))
            {
                request.locations.emplace_back(yyjson_get_str(item));
            }
        }
    }
    if (request.locations.empty())
    {
        request.locations = default_locations;
    }
    return request;
}

ShortcutCreationOutcome create_shortcuts(ShortcutRequest const &request,
                                         std::filesystem::path const &target)
{
    ShortcutCreationOutcome outcome;
#if defined(_WIN32)
    ScopedCOM com;
    if (!com.initialized())
    {
        outcome.message = "COM initialization failed";
        return outcome;
    }

    auto link_filename = std::filesystem::u8path(request.name + ".lnk");
    auto wide_args = utf8_to_wide(request.args);
    auto wide_desc = utf8_to_wide("TinyTorrent");

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
#else
    outcome.message = "system-create-shortcuts unsupported";
#endif
    return outcome;
}

ShortcutCreationOutcome
create_shortcuts_on_sta(ShortcutRequest const &request,
                        std::filesystem::path const &target)
{
#if defined(_WIN32)
    ShortcutCreationOutcome outcome;
    std::thread sta_thread([request, target, &outcome]() mutable
                           { outcome = create_shortcuts(request, target); });
    sta_thread.join();
    return outcome;
#else
    return create_shortcuts(request, target);
#endif
}

InstallOutcome install_to_program_files(std::filesystem::path const &source)
{
    InstallOutcome outcome;
#if defined(_WIN32)
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
#else
    outcome.message = "program-files install unsupported";
#endif
    return outcome;
}

#endif // defined(_WIN32)

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

std::optional<int> parse_int_value(yyjson_val *value)
{
    if (value == nullptr)
    {
        return std::nullopt;
    }
    if (yyjson_is_sint(value))
    {
        return static_cast<int>(yyjson_get_sint(value));
    }
    if (yyjson_is_uint(value))
    {
        return static_cast<int>(yyjson_get_uint(value));
    }
    if (yyjson_is_real(value))
    {
        return static_cast<int>(yyjson_get_real(value));
    }
    if (yyjson_is_str(value))
    {
        try
        {
            return std::stoi(yyjson_get_str(value));
        }
        catch (...)
        {
            return std::nullopt;
        }
    }
    return std::nullopt;
}

std::optional<std::int64_t> parse_int64_value(yyjson_val *value)
{
    if (value == nullptr)
    {
        return std::nullopt;
    }
    if (yyjson_is_sint(value))
    {
        return static_cast<std::int64_t>(yyjson_get_sint(value));
    }
    if (yyjson_is_uint(value))
    {
        return static_cast<std::int64_t>(yyjson_get_uint(value));
    }
    if (yyjson_is_real(value))
    {
        return static_cast<std::int64_t>(yyjson_get_real(value));
    }
    if (yyjson_is_str(value))
    {
        try
        {
            return std::stoll(yyjson_get_str(value));
        }
        catch (...)
        {
            return std::nullopt;
        }
    }
    return std::nullopt;
}

std::optional<int> parse_int_from_string(std::string_view text)
{
    if (text.empty())
    {
        return std::nullopt;
    }
    try
    {
        size_t idx = 0;
        auto value = std::stoi(std::string(text), &idx);
        if (idx != text.size())
        {
            return std::nullopt;
        }
        return value;
    }
    catch (...)
    {
        return std::nullopt;
    }
}

std::optional<int> parse_port_string(std::string_view text)
{
    if (auto value = parse_int_from_string(text))
    {
        if (*value >= 0 &&
            *value <=
                static_cast<int>(std::numeric_limits<std::uint16_t>::max()))
        {
            return *value;
        }
    }
    return std::nullopt;
}

std::optional<std::pair<std::string, int>>
parse_proxy_url_value(yyjson_val *value)
{
    if (value == nullptr || !yyjson_is_str(value))
    {
        return std::nullopt;
    }
    auto parts =
        tt::net::parse_host_port(std::string_view(yyjson_get_str(value)));
    if (parts.host.empty() || parts.port.empty())
    {
        return std::nullopt;
    }
    if (auto port = parse_port_string(parts.port); port)
    {
        return std::make_pair(std::move(parts.host), *port);
    }
    return std::nullopt;
}

constexpr int kDispatcherMinHistoryIntervalSeconds = 60;

std::vector<int> parse_ids(yyjson_val *arguments)
{
    std::vector<int> result;
    if (arguments == nullptr)
    {
        return result;
    }
    yyjson_val *ids = yyjson_obj_get(arguments, "ids");
    if (ids == nullptr)
    {
        return result;
    }
    if (yyjson_is_arr(ids))
    {
        size_t idx, limit;
        yyjson_val *value = nullptr;
        yyjson_arr_foreach(ids, idx, limit, value)
        {
            if (auto parsed = parse_int_value(value))
            {
                result.push_back(*parsed);
            }
        }
        return result;
    }
    if (auto parsed = parse_int_value(ids))
    {
        result.push_back(*parsed);
    }
    return result;
}

constexpr std::size_t kMaxRequestPathLength = 4096;

std::vector<int> parse_int_array(yyjson_val *arguments, char const *key)
{
    std::vector<int> result;
    if (arguments == nullptr)
    {
        return result;
    }
    yyjson_val *value = yyjson_obj_get(arguments, key);
    if (value == nullptr || !yyjson_is_arr(value))
    {
        return result;
    }
    size_t idx, limit;
    yyjson_val *entry = nullptr;
    yyjson_arr_foreach(value, idx, limit, entry)
    {
        if (auto parsed = parse_int_value(entry))
        {
            result.push_back(*parsed);
        }
    }
    return result;
}

std::optional<std::filesystem::path> parse_download_dir(yyjson_val *arguments)
{
    if (arguments == nullptr)
    {
        return std::nullopt;
    }
    auto *value = yyjson_obj_get(arguments, "download-dir");
    if (value == nullptr || !yyjson_is_str(value))
    {
        return std::nullopt;
    }
    auto candidate = std::filesystem::path(yyjson_get_str(value));
    if (candidate.empty())
    {
        return std::nullopt;
    }
    try
    {
        if (!candidate.is_absolute())
        {
            candidate = std::filesystem::absolute(candidate);
        }
        candidate = candidate.lexically_normal();
        return candidate;
    }
    catch (std::filesystem::filesystem_error const &ex)
    {
        TT_LOG_INFO("session-set download-dir invalid: {}", ex.what());
        return std::nullopt;
    }
}

struct DirectoryError
{
    int code;
    std::string message;
    std::optional<std::string> detail;
};

bool is_network_error(std::error_code const &ec)
{
    if (!ec)
    {
        return false;
    }
    static constexpr std::array<std::errc, 5> network_codes = {
        std::errc::network_unreachable,
        std::errc::host_unreachable,
        std::errc::timed_out,
        std::errc::connection_aborted,
        std::errc::connection_refused,
    };
    for (auto candidate : network_codes)
    {
        if (ec == std::make_error_code(candidate))
        {
            return true;
        }
    }
    return false;
}

int classify_filesystem_error(std::error_code const &ec)
{
    if (is_network_error(ec))
    {
        return 4001;
    }
    return 4003;
}

std::optional<std::string_view>
make_string_view(std::optional<std::string> const &value)
{
    if (!value)
    {
        return std::nullopt;
    }
    return std::string_view(value->data(), value->size());
}

std::optional<DirectoryError>
ensure_directory_exists(std::filesystem::path const &path)
{
    if (path.empty())
    {
        return DirectoryError{4003, "permission denied", std::nullopt};
    }
    try
    {
        std::filesystem::create_directories(path);
    }
    catch (std::filesystem::filesystem_error const &ex)
    {
        auto code = classify_filesystem_error(ex.code());
        std::string message = (code == 4001) ? "path-unreachable" : "permission denied";
        return DirectoryError{code, message, std::string(ex.what())};
    }
    std::error_code ec;
    if (!std::filesystem::is_directory(path, ec))
    {
        auto code = classify_filesystem_error(ec);
        std::string message = (code == 4001) ? "path-unreachable" : "permission denied";
        std::string detail = ec ? ec.message() : "destination exists and is not a directory";
        return DirectoryError{code, message, std::move(detail)};
    }
    return std::nullopt;
}

std::optional<std::uint16_t> parse_peer_port(yyjson_val *arguments)
{
    if (arguments == nullptr)
    {
        return std::nullopt;
    }
    auto *value = yyjson_obj_get(arguments, "peer-port");
    if (value == nullptr)
    {
        return std::nullopt;
    }
    if (auto parsed = parse_int_value(value))
    {
        if (*parsed >= 0 &&
            *parsed <= std::numeric_limits<std::uint16_t>::max())
        {
            return static_cast<std::uint16_t>(*parsed);
        }
    }
    return std::nullopt;
}

bool needs_detail(yyjson_val *fields)
{
    if (fields == nullptr || !yyjson_is_arr(fields))
    {
        return false;
    }
    size_t idx, count;
    yyjson_val *value = nullptr;
    yyjson_arr_foreach(fields, idx, count, value)
    {
        if (!yyjson_is_str(value))
        {
            continue;
        }
        auto str = std::string_view(yyjson_get_str(value));
        if (str == "files" || str == "trackers" || str == "peers" ||
            str == "pieceStates" || str == "pieceAvailability")
        {
            return true;
        }
    }
    return false;
}

bool bool_value(yyjson_val *value, bool default_value = false)
{
    if (value == nullptr)
    {
        return default_value;
    }
    if (yyjson_is_bool(value))
    {
        return yyjson_get_bool(value);
    }
    if (yyjson_is_sint(value))
    {
        return yyjson_get_sint(value) != 0;
    }
    if (yyjson_is_uint(value))
    {
        return yyjson_get_uint(value) != 0;
    }
    if (yyjson_is_str(value))
    {
        auto content = std::string_view(yyjson_get_str(value));
        if (content == "true" || content == "1")
        {
            return true;
        }
        if (content == "false" || content == "0")
        {
            return false;
        }
    }
    return default_value;
}

template <typename Handler> DispatchHandler wrap_sync_handler(Handler handler)
{
    return DispatchHandler(
        [handler = std::move(handler)](yyjson_val *arguments,
                                       ResponseCallback cb) mutable
        {
            try
            {
                cb(handler(arguments));
            }
            catch (std::exception const &ex)
            {
                TT_LOG_INFO("RPC handler threw: {}", ex.what());
                cb(serialize_error("internal error"));
            }
            catch (...)
            {
                TT_LOG_INFO("RPC handler threw unknown exception");
                cb(serialize_error("internal error"));
            }
        });
}

std::optional<bool> parse_bool_flag(yyjson_val *value)
{
    if (value == nullptr)
    {
        return std::nullopt;
    }
    return bool_value(value);
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

std::filesystem::path parse_request_path(yyjson_val *value)
{
    if (value == nullptr || !yyjson_is_str(value))
    {
        return {};
    }
    auto raw = yyjson_get_str(value);
    if (raw == nullptr)
    {
        return {};
    }
    std::string text(raw);
    if (text.empty() || text.size() > kMaxRequestPathLength)
    {
        return {};
    }
    if (text.find('\0') != std::string::npos)
    {
        return {};
    }
    try
    {
#if defined(_WIN32)
        return std::filesystem::u8path(text);
#else
        return std::filesystem::path(text);
#endif
    }
    catch (...)
    {
        return {};
    }
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
    if (auto status = apply(L"Software\\Classes\\magnet", L"URL Protocol", L"");
        status != ERROR_SUCCESS)
    {
        return fail("magnet registration failed", status);
    }
    if (auto status = apply(L"Software\\Classes\\magnet\\shell\\open\\command",
                            {}, command);
        status != ERROR_SUCCESS)
    {
        return fail("magnet handler registration failed", status);
    }
    if (auto status =
            apply(L"Software\\Classes\\.torrent", {}, L"TinyTorrent.torrent");
        status != ERROR_SUCCESS)
    {
        return fail("torrent extension registration failed", status);
    }
    if (auto status = apply(
            L"Software\\Classes\\TinyTorrent.torrent\\shell\\open\\command", {},
            command);
        status != ERROR_SUCCESS)
    {
        return fail("torrent handler registration failed", status);
    }

    SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
    TT_LOG_INFO("registered magnet/.torrent handler ({})", exe_path->string());
    result.success = true;
    result.message = "system handler registered";
    return result;
}
#endif

namespace
{
constexpr std::array<char const *, 2> kRegisterMimeCommands = {
    "xdg-mime default tinytorrent.desktop x-scheme-handler/magnet",
    "xdg-mime default tinytorrent.desktop application/x-bittorrent"};
} // namespace

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
    for (auto const *command : kRegisterMimeCommands)
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
        result.message = "desktop entry created; xdg-mime failed (ensure "
                         "xdg-utils installed)";
    }
    return result;
}
#endif

#if defined(__APPLE__)
SystemHandlerResult register_mac_handler()
{
    SystemHandlerResult result;
    result.message = "system-register-handler requires a GUI bundle on macOS; "
                     "install TinyTorrent.app to register handlers";
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

namespace
{
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

std::string to_lower_copy(std::string_view value)
{
    std::string result(value);
    std::transform(result.begin(), result.end(), result.begin(),
                   [](unsigned char ch)
                   { return static_cast<char>(std::tolower(ch)); });
    return result;
}

} // namespace

std::string to_lower_view(std::string_view value)
{
    std::string result(value);
    std::transform(result.begin(), result.end(), result.begin(),
                   [](unsigned char ch)
                   { return static_cast<char>(std::tolower(ch)); });
    return result;
}

bool path_prefix_matches(std::string const &path,
                         std::string_view prefix) noexcept
{
    if (path.size() < prefix.size())
    {
        return false;
    }
    if (path.compare(0, prefix.size(), prefix) != 0)
    {
        return false;
    }
    if (path.size() == prefix.size())
    {
        return true;
    }
    char next = path[prefix.size()];
    return next == '/' || next == '\\';
}

std::string strip_extended_path_prefix(std::string value) noexcept
{
    if (value.rfind("\\\\?\\", 0) == 0)
    {
        return value.substr(4);
    }
    if (value.rfind("//?/", 0) == 0)
    {
        return value.substr(4);
    }
    return value;
}

bool is_restricted_system_path(std::filesystem::path const &target) noexcept
{
    if (target.empty())
    {
        return false;
    }
    auto normalized = target.lexically_normal();
    std::string path_string;
    try
    {
        path_string = normalized.generic_string();
    }
    catch (...)
    {
        return false;
    }
    path_string = strip_extended_path_prefix(path_string);
    auto lower_path = to_lower_view(path_string);
    static constexpr std::array<std::string_view, 4> restricted_prefixes = {
        "c:/windows", "c:/program files", "c:/program files (x86)",
        "c:/programdata"};
    for (auto prefix : restricted_prefixes)
    {
        if (path_prefix_matches(lower_path, prefix))
        {
            return true;
        }
    }
    return false;
}

std::optional<double> parse_double_value(yyjson_val *value)
{
    if (value == nullptr)
    {
        return std::nullopt;
    }
    if (yyjson_is_real(value))
    {
        return yyjson_get_real(value);
    }
    if (yyjson_is_sint(value))
    {
        return static_cast<double>(yyjson_get_sint(value));
    }
    if (yyjson_is_uint(value))
    {
        return static_cast<double>(yyjson_get_uint(value));
    }
    if (yyjson_is_str(value))
    {
        try
        {
            return std::stod(yyjson_get_str(value));
        }
        catch (...)
        {
            return std::nullopt;
        }
    }
    return std::nullopt;
}

std::optional<engine::EncryptionMode> parse_encryption(yyjson_val *value)
{
    if (value == nullptr)
    {
        return std::nullopt;
    }
    if (yyjson_is_sint(value))
    {
        int code = static_cast<int>(yyjson_get_sint(value));
        switch (code)
        {
        case 1:
            return engine::EncryptionMode::Preferred;
        case 2:
            return engine::EncryptionMode::Required;
        default:
            return engine::EncryptionMode::Tolerated;
        }
    }
    if (yyjson_is_uint(value))
    {
        int code = static_cast<int>(yyjson_get_uint(value));
        switch (code)
        {
        case 1:
            return engine::EncryptionMode::Preferred;
        case 2:
            return engine::EncryptionMode::Required;
        default:
            return engine::EncryptionMode::Tolerated;
        }
    }
    if (yyjson_is_str(value))
    {
        auto text = to_lower_view(yyjson_get_str(value));
        if (text == "preferred" || text == "1" || text == "prefer")
        {
            return engine::EncryptionMode::Preferred;
        }
        if (text == "required" || text == "2")
        {
            return engine::EncryptionMode::Required;
        }
        return engine::EncryptionMode::Tolerated;
    }
    return std::nullopt;
}

std::vector<engine::TrackerEntry> parse_tracker_entries(yyjson_val *value)
{
    std::vector<engine::TrackerEntry> entries;
    if (value == nullptr)
    {
        return entries;
    }
    auto push_entry = [&](yyjson_val *entry)
    {
        if (entry == nullptr)
        {
            return;
        }
        engine::TrackerEntry tracker;
        if (yyjson_is_str(entry))
        {
            tracker.announce = yyjson_get_str(entry);
        }
        else if (yyjson_is_obj(entry))
        {
            auto *announce = yyjson_obj_get(entry, "announce");
            if (announce && yyjson_is_str(announce))
            {
                tracker.announce = yyjson_get_str(announce);
            }
            tracker.tier =
                parse_int_value(yyjson_obj_get(entry, "tier")).value_or(0);
        }
        if (!tracker.announce.empty())
        {
            entries.push_back(std::move(tracker));
        }
    };
    if (yyjson_is_arr(value))
    {
        size_t idx, limit;
        yyjson_val *item = nullptr;
        yyjson_arr_foreach(value, idx, limit, item)
        {
            push_entry(item);
        }
    }
    else
    {
        push_entry(value);
    }
    return entries;
}

std::vector<std::string> parse_tracker_announces(yyjson_val *value)
{
    std::vector<std::string> result;
    if (value == nullptr)
    {
        return result;
    }
    if (yyjson_is_arr(value))
    {
        size_t idx, limit;
        yyjson_val *item = nullptr;
        yyjson_arr_foreach(value, idx, limit, item)
        {
            if (yyjson_is_str(item))
            {
                result.emplace_back(yyjson_get_str(item));
            }
            else if (yyjson_is_obj(item))
            {
                auto *announce = yyjson_obj_get(item, "announce");
                if (announce && yyjson_is_str(announce))
                {
                    result.emplace_back(yyjson_get_str(announce));
                }
            }
        }
    }
    else if (yyjson_is_str(value))
    {
        result.emplace_back(yyjson_get_str(value));
    }
    else if (yyjson_is_obj(value))
    {
        auto *announce = yyjson_obj_get(value, "announce");
        if (announce && yyjson_is_str(announce))
        {
            result.emplace_back(yyjson_get_str(announce));
        }
    }
    return result;
}

std::optional<std::vector<std::string>> parse_labels(yyjson_val *value)
{
    if (value == nullptr)
    {
        return std::nullopt;
    }
    std::vector<std::string> result;
    if (yyjson_is_arr(value))
    {
        size_t idx, limit;
        yyjson_val *item = nullptr;
        yyjson_arr_foreach(value, idx, limit, item)
        {
            if (yyjson_is_str(item))
            {
                result.emplace_back(yyjson_get_str(item));
            }
        }
    }
    else if (yyjson_is_str(value))
    {
        result.emplace_back(yyjson_get_str(value));
    }
    return result;
}

std::optional<int> parse_bandwidth_priority(yyjson_val *value)
{
    if (value == nullptr)
    {
        return std::nullopt;
    }
    if (auto parsed = parse_int_value(value))
    {
        int priority = std::clamp(*parsed, 0, 2);
        return priority;
    }
    if (yyjson_is_str(value))
    {
        auto text = to_lower_view(yyjson_get_str(value));
        if (text == "low" || text == "0")
        {
            return 0;
        }
        if (text == "normal" || text == "1")
        {
            return 1;
        }
        if (text == "high" || text == "2")
        {
            return 2;
        }
    }
    return std::nullopt;
}

#if defined(_WIN32)
struct WsaInitializer
{
    WsaInitializer()
    {
        WSADATA data{};
        started = (WSAStartup(MAKEWORD(2, 2), &data) == 0);
    }
    ~WsaInitializer()
    {
        if (started)
        {
            WSACleanup();
        }
    }
    bool started = false;
};

std::pair<std::string, std::string>
split_listen_interface(std::string const &value)
{
    auto colon = value.find_last_of(':');
    if (colon == std::string::npos)
    {
        return {"127.0.0.1", {}};
    }
    auto host = value.substr(0, colon);
    auto port = value.substr(colon + 1);
    if (host.empty() || host == "0.0.0.0")
    {
        host = "127.0.0.1";
    }
    return {host, port};
}

bool check_session_port(std::string const &listen_interface)
{
    auto [host, port] = split_listen_interface(listen_interface);
    if (port.empty())
    {
        return false;
    }
    WsaInitializer wsa;
    if (!wsa.started)
    {
        return false;
    }

    addrinfo hints{};
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_protocol = IPPROTO_TCP;
    addrinfo *result = nullptr;
    if (getaddrinfo(host.c_str(), port.c_str(), &hints, &result) != 0)
    {
        return false;
    }

    bool success = false;
    for (auto *ptr = result; ptr != nullptr; ptr = ptr->ai_next)
    {
        SOCKET sock =
            socket(ptr->ai_family, ptr->ai_socktype, ptr->ai_protocol);
        if (sock == INVALID_SOCKET)
        {
            continue;
        }
        u_long mode = 1;
        ioctlsocket(sock, FIONBIO, &mode);

        timeval timeout{};
        timeout.tv_sec = 0;
        timeout.tv_usec = 250000;
        setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO,
                   reinterpret_cast<char *>(&timeout), sizeof(timeout));
        setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO,
                   reinterpret_cast<char *>(&timeout), sizeof(timeout));

        auto result_code =
            connect(sock, ptr->ai_addr, static_cast<int>(ptr->ai_addrlen));
        if (result_code == 0)
        {
            success = true;
        }
        else
        {
            auto err = WSAGetLastError();
            if (err == WSAEWOULDBLOCK || err == WSAEINPROGRESS)
            {
                fd_set write_fds;
                FD_ZERO(&write_fds);
                FD_SET(sock, &write_fds);
                timeval select_timeout{};
                select_timeout.tv_sec = 0;
                select_timeout.tv_usec = 200000;
                int ready =
                    select(0, nullptr, &write_fds, nullptr, &select_timeout);
                if (ready > 0 && FD_ISSET(sock, &write_fds))
                {
                    int sock_err = 0;
                    int len = sizeof(sock_err);
                    if (getsockopt(sock, SOL_SOCKET, SO_ERROR,
                                   reinterpret_cast<char *>(&sock_err),
                                   &len) == 0 &&
                        sock_err == 0)
                    {
                        success = true;
                    }
                }
            }
        }
        closesocket(sock);
        if (success)
        {
            break;
        }
    }

    freeaddrinfo(result);
    return success;
}
#else
bool check_session_port(std::string const &)
{
    return false;
}
#endif

std::vector<engine::TorrentSnapshot>
filter_torrents(engine::Core *engine, std::vector<int> const &ids)
{
    if (engine == nullptr)
    {
        return {};
    }
    auto torrents = engine->torrent_list();
    if (ids.empty())
    {
        return torrents;
    }
    std::unordered_set<int> wanted(ids.begin(), ids.end());
    std::vector<engine::TorrentSnapshot> filtered;
    filtered.reserve(wanted.size());
    for (auto const &torrent : torrents)
    {
        if (wanted.contains(torrent.id))
        {
            filtered.push_back(torrent);
        }
    }
    return filtered;
}

std::vector<engine::TorrentDetail>
gather_torrent_details(engine::Core *engine, std::vector<int> const &ids)
{
    std::vector<engine::TorrentDetail> details;
    if (engine == nullptr)
    {
        return details;
    }
    std::vector<int> targets = ids;
    if (targets.empty())
    {
        auto snapshots = engine->torrent_list();
        targets.reserve(snapshots.size());
        for (auto const &snapshot : snapshots)
        {
            targets.push_back(snapshot.id);
        }
    }
    details.reserve(targets.size());
    for (int id : targets)
    {
        if (auto detail = engine->torrent_detail(id))
        {
            details.push_back(std::move(*detail));
        }
    }
    return details;
}

std::string handle_torrent_add(engine::Core *engine, yyjson_val *arguments)
{
    if (engine == nullptr)
    {
        return serialize_error("engine unavailable");
    }
    if (arguments == nullptr || !yyjson_is_obj(arguments))
    {
        return serialize_error("arguments object missing for torrent-add");
    }

    engine::TorrentAddRequest request;
    request.download_path = engine->settings().download_path;

    yyjson_val *download = yyjson_obj_get(arguments, "download-dir");
    if (download && yyjson_is_str(download))
    {
        try
        {
            std::filesystem::path candidate(yyjson_get_str(download));
            if (!candidate.empty())
            {
                if (!candidate.is_absolute())
                {
                    candidate = std::filesystem::absolute(candidate);
                }
                candidate = candidate.lexically_normal();
                request.download_path = std::move(candidate);
            }
        }
        catch (std::filesystem::filesystem_error const &ex)
        {
            return serialize_error("permission denied",
                                   std::string_view(ex.what()), 4003);
        }
    }

    if (auto error = ensure_directory_exists(request.download_path))
    {
        return serialize_error(error->message,
                               make_string_view(error->detail),
                               error->code);
    }

    request.paused = bool_value(yyjson_obj_get(arguments, "paused"));

    auto const has_metainfo = !request.metainfo.empty();
    auto const uri_descriptor =
        request.uri ? std::string(*request.uri) : std::string("<none>");
    TT_LOG_INFO("rpc: torrent-add request validated download-dir={} paused={} "
                "metainfo={} uri={}",
                request.download_path.string(), request.paused,
                has_metainfo ? "yes" : "no", uri_descriptor);

    bool metainfo_loaded = false;
    yyjson_val *metainfo_path_value = yyjson_obj_get(arguments, "metainfo-path");
    if (metainfo_path_value && yyjson_is_str(metainfo_path_value))
    {
        std::filesystem::path candidate(yyjson_get_str(metainfo_path_value));
        if (!candidate.empty())
        {
            try
            {
                if (!candidate.is_absolute())
                {
                    candidate = std::filesystem::absolute(candidate);
                }
                candidate = candidate.lexically_normal();
                std::ifstream input(candidate, std::ios::binary);
                if (!input)
                {
                    return serialize_error("metainfo-read-failure", std::nullopt,
                                           4002);
                }
                std::vector<std::uint8_t> buffer(
                    (std::istreambuf_iterator<char>(input)),
                    std::istreambuf_iterator<char>());
                if (buffer.empty())
                {
                    std::string detail =
                        std::string("metainfo file ") + candidate.string() +
                        " is empty";
                    return serialize_error("metainfo-read-failure", detail,
                                           4002);
                }
                request.metainfo = std::move(buffer);
                metainfo_loaded = true;
            }
            catch (std::filesystem::filesystem_error const &ex)
            {
                return serialize_error("metainfo-read-failure",
                                       std::string_view(ex.what()), 4002);
            }
        }
    }

    if (!metainfo_loaded)
    {
        yyjson_val *metainfo_value = yyjson_obj_get(arguments, "metainfo");
        if (metainfo_value && yyjson_is_str(metainfo_value))
        {
            auto raw = std::string_view(yyjson_get_str(metainfo_value));
            auto decoded = tt::utils::decode_base64(raw);
            if (!decoded || decoded->empty())
            {
                return serialize_error("invalid metainfo content");
            }
            request.metainfo = std::move(*decoded);
        }
        else
        {
            yyjson_val *uri_value = yyjson_obj_get(arguments, "uri");
            if (uri_value == nullptr || !yyjson_is_str(uri_value))
            {
                uri_value = yyjson_obj_get(arguments, "filename");
            }
            if (uri_value == nullptr || !yyjson_is_str(uri_value))
            {
                return serialize_error("uri or filename required");
            }
            request.uri = std::string(yyjson_get_str(uri_value));
        }
    }

    TT_LOG_DEBUG("torrent-add download-dir={} paused={}",
                 request.download_path.string(),
                 static_cast<int>(request.paused));
    auto status = engine->enqueue_add_torrent(std::move(request));
    TT_LOG_INFO("rpc: torrent-add enqueued status={}",
                add_torrent_status_name(status));
    return serialize_add_result(status);
}

std::string handle_tt_get_capabilities()
{
    return serialize_capabilities();
}

std::string handle_session_get(engine::Core *engine,
                               std::string const &rpc_bind,
                               UiPreferences const &ui_preferences)
{
    auto settings = engine ? engine->settings() : engine::CoreSettings{};
    auto entries = engine ? engine->blocklist_entry_count() : 0;
    auto updated = engine
                       ? engine->blocklist_last_update()
                       : std::optional<std::chrono::system_clock::time_point>{};
    auto listen_error = engine ? engine->listen_error() : std::string{};
    auto store_loaded = engine ? engine->state_store_loaded() : false;
    return serialize_session_settings(settings, entries, updated, rpc_bind,
                                      listen_error, store_loaded, ui_preferences);
}

std::string handle_session_store_status(engine::Core *engine)
{
    auto ready = engine ? engine->state_store_loaded() : false;
    return serialize_state_store_status(ready);
}

std::string handle_session_set(engine::Core *engine, yyjson_val *arguments)
{
    std::optional<std::filesystem::path> download;
    if (auto candidate = parse_download_dir(arguments))
    {
        if (auto error = ensure_directory_exists(*candidate))
        {
            return serialize_error(error->message,
                                   make_string_view(error->detail), error->code);
        }
        download = std::move(*candidate);
    }
    if (!engine)
    {
        return serialize_success();
    }
    bool applied = false;
    bool ok = true;
    if (download)
    {
        TT_LOG_DEBUG("session-set download-dir={}", download->string());
        engine->set_download_path(std::move(*download));
        applied = true;
    }
    if (auto port = parse_peer_port(arguments))
    {
        TT_LOG_DEBUG("session-set peer-port={}", static_cast<unsigned>(*port));
        applied = true;
        if (!engine->set_listen_port(*port))
        {
            ok = false;
        }
    }
    auto download_limit =
        parse_int_value(yyjson_obj_get(arguments, "speed-limit-down"));
    auto download_enabled =
        parse_bool_flag(yyjson_obj_get(arguments, "speed-limit-down-enabled"));
    auto upload_limit =
        parse_int_value(yyjson_obj_get(arguments, "speed-limit-up"));
    auto upload_enabled =
        parse_bool_flag(yyjson_obj_get(arguments, "speed-limit-up-enabled"));
    if (download_limit || download_enabled || upload_limit || upload_enabled)
    {
        TT_LOG_DEBUG("session-set speed-limit-down={} enabled={} "
                     "speed-limit-up={} enabled={}",
                     download_limit.value_or(-1),
                     download_enabled.value_or(false),
                     upload_limit.value_or(-1), upload_enabled.value_or(false));
        engine->set_speed_limits(download_limit, download_enabled, upload_limit,
                                 upload_enabled);
        applied = true;
    }
    auto peer_limit =
        parse_int_value(yyjson_obj_get(arguments, "peer-limit-global"));
    if (!peer_limit)
    {
        peer_limit = parse_int_value(yyjson_obj_get(arguments, "peer-limit"));
    }
    auto peer_limit_per_torrent =
        parse_int_value(yyjson_obj_get(arguments, "peer-limit-per-torrent"));
    if (peer_limit || peer_limit_per_torrent)
    {
        TT_LOG_DEBUG("session-set peer-limit={} peer-limit-per-torrent={}",
                     peer_limit.value_or(-1),
                     peer_limit_per_torrent.value_or(-1));
        engine->set_peer_limits(peer_limit, peer_limit_per_torrent);
        applied = true;
    }

    tt::engine::SessionUpdate session_update;
    bool session_update_needed = false;
    if (auto value =
            parse_int_value(yyjson_obj_get(arguments, "alt-speed-down")))
    {
        session_update.alt_speed_down_kbps = *value;
        session_update_needed = true;
    }
    if (auto value = parse_int_value(yyjson_obj_get(arguments, "alt-speed-up")))
    {
        session_update.alt_speed_up_kbps = *value;
        session_update_needed = true;
    }
    if (auto value =
            parse_bool_flag(yyjson_obj_get(arguments, "alt-speed-enabled")))
    {
        session_update.alt_speed_enabled = *value;
        session_update_needed = true;
    }
    if (auto value = parse_bool_flag(
            yyjson_obj_get(arguments, "alt-speed-time-enabled")))
    {
        session_update.alt_speed_time_enabled = *value;
        session_update_needed = true;
    }
    auto alt_speed_time_begin =
        parse_int_value(yyjson_obj_get(arguments, "alt-speed-time-begin"));
    if (!alt_speed_time_begin)
    {
        alt_speed_time_begin =
            parse_int_value(yyjson_obj_get(arguments, "alt-speed-begin"));
    }
    if (alt_speed_time_begin)
    {
        session_update.alt_speed_time_begin = *alt_speed_time_begin;
        session_update_needed = true;
    }
    auto alt_speed_time_end =
        parse_int_value(yyjson_obj_get(arguments, "alt-speed-time-end"));
    if (!alt_speed_time_end)
    {
        alt_speed_time_end =
            parse_int_value(yyjson_obj_get(arguments, "alt-speed-end"));
    }
    if (alt_speed_time_end)
    {
        session_update.alt_speed_time_end = *alt_speed_time_end;
        session_update_needed = true;
    }
    if (auto value =
            parse_int_value(yyjson_obj_get(arguments, "alt-speed-time-day")))
    {
        session_update.alt_speed_time_day = *value;
        session_update_needed = true;
    }
    if (auto enc = parse_encryption(yyjson_obj_get(arguments, "encryption")))
    {
        session_update.encryption = *enc;
        session_update_needed = true;
    }
    if (auto value = parse_bool_flag(yyjson_obj_get(arguments, "dht-enabled")))
    {
        session_update.dht_enabled = *value;
        session_update_needed = true;
    }
    if (auto value = parse_bool_flag(yyjson_obj_get(arguments, "pex-enabled")))
    {
        session_update.pex_enabled = *value;
        session_update_needed = true;
    }
    if (auto value = parse_bool_flag(yyjson_obj_get(arguments, "lpd-enabled")))
    {
        session_update.lpd_enabled = *value;
        session_update_needed = true;
    }
    if (auto value = parse_bool_flag(yyjson_obj_get(arguments, "utp-enabled")))
    {
        session_update.utp_enabled = *value;
        session_update_needed = true;
    }
    if (auto value =
            parse_int_value(yyjson_obj_get(arguments, "download-queue-size")))
    {
        session_update.download_queue_size = *value;
        session_update_needed = true;
    }
    if (auto value =
            parse_int_value(yyjson_obj_get(arguments, "seed-queue-size")))
    {
        session_update.seed_queue_size = *value;
        session_update_needed = true;
    }
    if (auto value =
            parse_bool_flag(yyjson_obj_get(arguments, "queue-stalled-enabled")))
    {
        session_update.queue_stalled_enabled = *value;
        session_update_needed = true;
    }
    if (auto *incomplete = yyjson_obj_get(arguments, "incomplete-dir"))
    {
        if (yyjson_is_str(incomplete))
        {
            std::filesystem::path candidate(yyjson_get_str(incomplete));
            if (!candidate.empty())
            {
                if (auto error = ensure_directory_exists(candidate))
                {
                    return serialize_error(error->message,
                                           make_string_view(error->detail),
                                           error->code);
                }
            }
            session_update.incomplete_dir = std::move(candidate);
            session_update_needed = true;
        }
    }
    if (auto value = parse_bool_flag(
            yyjson_obj_get(arguments, "incomplete-dir-enabled")))
    {
        session_update.incomplete_dir_enabled = *value;
        session_update_needed = true;
    }
    if (auto *watch_dir = yyjson_obj_get(arguments, "watch-dir"))
    {
        if (yyjson_is_str(watch_dir))
        {
            std::filesystem::path candidate(yyjson_get_str(watch_dir));
            if (!candidate.empty())
            {
                if (auto error = ensure_directory_exists(candidate))
                {
                    return serialize_error(error->message,
                                           make_string_view(error->detail),
                                           error->code);
                }
            }
            session_update.watch_dir = std::move(candidate);
            session_update_needed = true;
        }
    }
    if (auto value =
            parse_bool_flag(yyjson_obj_get(arguments, "watch-dir-enabled")))
    {
        session_update.watch_dir_enabled = *value;
        session_update_needed = true;
    }
    if (auto value =
            parse_bool_flag(yyjson_obj_get(arguments, "rename-partial-files")))
    {
        session_update.rename_partial_files = *value;
        session_update_needed = true;
    }
    auto seed_ratio_limit =
        parse_double_value(yyjson_obj_get(arguments, "seedRatioLimit"));
    if (!seed_ratio_limit)
    {
        seed_ratio_limit =
            parse_double_value(yyjson_obj_get(arguments, "seed-ratio-limit"));
    }
    if (seed_ratio_limit)
    {
        session_update.seed_ratio_limit = *seed_ratio_limit;
        session_update_needed = true;
    }
    auto seed_ratio_enabled =
        parse_bool_flag(yyjson_obj_get(arguments, "seedRatioLimited"));
    if (!seed_ratio_enabled)
    {
        seed_ratio_enabled =
            parse_bool_flag(yyjson_obj_get(arguments, "seed-ratio-limited"));
    }
    if (seed_ratio_enabled)
    {
        session_update.seed_ratio_enabled = *seed_ratio_enabled;
        session_update_needed = true;
    }
    auto seed_idle_limit =
        parse_int_value(yyjson_obj_get(arguments, "idle-seeding-limit"));
    if (!seed_idle_limit)
    {
        seed_idle_limit =
            parse_int_value(yyjson_obj_get(arguments, "seed-idle-limit"));
    }
    if (seed_idle_limit)
    {
        session_update.seed_idle_limit = *seed_idle_limit;
        session_update_needed = true;
    }
    auto seed_idle_enabled = parse_bool_flag(
        yyjson_obj_get(arguments, "idle-seeding-limit-enabled"));
    if (!seed_idle_enabled)
    {
        seed_idle_enabled =
            parse_bool_flag(yyjson_obj_get(arguments, "seed-idle-limited"));
    }
    if (seed_idle_enabled)
    {
        session_update.seed_idle_enabled = *seed_idle_enabled;
        session_update_needed = true;
    }
    if (auto value = parse_int_value(yyjson_obj_get(arguments, "proxy-type")))
    {
        session_update.proxy_type = *value;
        session_update_needed = true;
    }
    if (auto *proxy_host = yyjson_obj_get(arguments, "proxy-host"))
    {
        if (yyjson_is_str(proxy_host))
        {
            session_update.proxy_hostname =
                std::string(yyjson_get_str(proxy_host));
            session_update_needed = true;
        }
    }
    if (auto value = parse_int_value(yyjson_obj_get(arguments, "proxy-port")))
    {
        session_update.proxy_port = *value;
        session_update_needed = true;
    }
    if (auto value =
            parse_bool_flag(yyjson_obj_get(arguments, "proxy-auth-enabled")))
    {
        session_update.proxy_auth_enabled = *value;
        session_update_needed = true;
    }
    if (auto *proxy_user = yyjson_obj_get(arguments, "proxy-username"))
    {
        if (yyjson_is_str(proxy_user))
        {
            session_update.proxy_username =
                std::string(yyjson_get_str(proxy_user));
            session_update_needed = true;
        }
    }
    if (auto *proxy_pass = yyjson_obj_get(arguments, "proxy-password"))
    {
        if (yyjson_is_str(proxy_pass))
        {
            auto value = std::string(yyjson_get_str(proxy_pass));
            if (value != "<REDACTED>")
            {
                session_update.proxy_password = std::move(value);
                session_update_needed = true;
            }
        }
    }
    if (auto value = parse_bool_flag(
            yyjson_obj_get(arguments, "proxy-peer-connections")))
    {
        session_update.proxy_peer_connections = *value;
        session_update_needed = true;
    }
    if (auto parsed =
            parse_proxy_url_value(yyjson_obj_get(arguments, "proxy-url")))
    {
        session_update.proxy_hostname = std::move(parsed->first);
        session_update.proxy_port = parsed->second;
        session_update_needed = true;
    }
    if (auto value =
            parse_int_value(yyjson_obj_get(arguments, "engine-disk-cache")))
    {
        session_update.disk_cache_mb = std::max(1, *value);
        session_update_needed = true;
    }
    if (auto value = parse_int_value(
            yyjson_obj_get(arguments, "engine-hashing-threads")))
    {
        session_update.hashing_threads = std::max(1, *value);
        session_update_needed = true;
    }
    if (auto value =
            parse_int_value(yyjson_obj_get(arguments, "queue-stalled-minutes")))
    {
        session_update.queue_stalled_minutes = std::max(0, *value);
        session_update_needed = true;
    }
    if (auto value =
            parse_bool_flag(yyjson_obj_get(arguments, "history-enabled")))
    {
        session_update.history_enabled = *value;
        session_update_needed = true;
    }
    if (auto value =
            parse_int_value(yyjson_obj_get(arguments, "history-interval")))
    {
        session_update.history_interval_seconds = *value;
        session_update_needed = true;
    }
    if (auto value = parse_int_value(
            yyjson_obj_get(arguments, "history-retention-days")))
    {
        session_update.history_retention_days = *value;
        session_update_needed = true;
    }
    if (session_update_needed)
    {
        engine->update_session_settings(std::move(session_update));
        applied = true;
    }
    if (!ok)
    {
        return serialize_error("failed to update session settings");
    }
    return serialize_success();
}

bool update_ui_preferences_from_arguments(yyjson_val *arguments,
                                          UiPreferences &preferences)
{
    if (arguments == nullptr)
    {
        return false;
    }
    auto *ui_root = yyjson_obj_get(arguments, "ui");
    if (ui_root == nullptr || !yyjson_is_obj(ui_root))
    {
        return false;
    }
    bool updated = false;
    if (auto *value = yyjson_obj_get(ui_root, "autoOpen"); value)
    {
        bool next = bool_value(value, preferences.auto_open_ui);
        if (next != preferences.auto_open_ui)
        {
            preferences.auto_open_ui = next;
            updated = true;
        }
    }
    if (auto *value = yyjson_obj_get(ui_root, "autorunHidden"); value)
    {
        bool next = bool_value(value, preferences.hide_ui_when_autorun);
        if (next != preferences.hide_ui_when_autorun)
        {
            preferences.hide_ui_when_autorun = next;
            updated = true;
        }
    }
    if (auto *value = yyjson_obj_get(ui_root, "showSplash"); value)
    {
        bool next = bool_value(value, preferences.show_splash);
        if (next != preferences.show_splash)
        {
            preferences.show_splash = next;
            updated = true;
        }
    }
    if (auto *value = yyjson_obj_get(ui_root, "splashMessage");
        value && yyjson_is_str(value))
    {
        std::string message(yyjson_get_str(value));
        if (message != preferences.splash_message)
        {
            preferences.splash_message = std::move(message);
            updated = true;
        }
    }
    return updated;
}

std::string handle_session_test(engine::Core *engine)
{
    auto port_interface =
        engine ? engine->settings().listen_interface : std::string{};
    bool port_open =
        !port_interface.empty() && check_session_port(port_interface);
    return serialize_session_test(port_open);
}

std::string handle_session_stats(engine::Core *engine)
{
    auto snapshot = engine ? engine->snapshot()
                           : std::make_shared<engine::SessionSnapshot>();
    return serialize_session_stats(*snapshot);
}

std::string handle_session_tray_status(engine::Core *engine,
                                       bool ui_attached,
                                       UiPreferences const &ui_preferences)
{
    if (!engine)
    {
        return serialize_error("engine unavailable");
    }
    auto snapshot = engine->snapshot();
    if (!snapshot)
    {
        return serialize_error("engine unavailable");
    }
    std::size_t seeding_count = snapshot->seeding_torrent_count;
    bool any_error = snapshot->error_torrent_count > 0;
    bool all_paused =
        snapshot->torrent_count > 0 && snapshot->active_torrent_count == 0;
    auto download_dir = engine->settings().download_path.string();
    auto handler_error = handler_error_message();
        return serialize_session_tray_status(
            snapshot->download_rate, snapshot->upload_rate,
            snapshot->active_torrent_count, seeding_count, any_error, all_paused,
            download_dir, handler_error, ui_attached, ui_preferences);
}

std::string handle_session_pause_all(engine::Core *engine)
{
    if (!engine)
    {
        return serialize_error("engine unavailable");
    }
    engine->pause_all();
    return serialize_success();
}

std::string handle_session_resume_all(engine::Core *engine)
{
    if (!engine)
    {
        return serialize_error("engine unavailable");
    }
    engine->resume_all();
    return serialize_success();
}

std::string handle_session_close(engine::Core *engine)
{
    TT_LOG_INFO("session-close requested");
    if (engine)
    {
        engine->stop();
    }
    return serialize_success();
}

std::string handle_blocklist_update(engine::Core *engine)
{
    if (!engine)
    {
        return serialize_error("engine unavailable");
    }
    if (!engine->request_blocklist_reload())
    {
        return serialize_error("blocklist update failed");
    }
    return serialize_blocklist_update(engine->blocklist_entry_count(),
                                      engine->blocklist_last_update());
}

void handle_fs_browse_async(engine::Core *engine, yyjson_val *arguments,
                            ResponseCallback cb)
{
    if (!arguments)
    {
        cb(serialize_error("arguments required for fs-browse"));
        return;
    }
    auto target = parse_request_path(yyjson_obj_get(arguments, "path"));
    if (target.empty())
    {
        target = std::filesystem::current_path();
    }
    auto normalized = target.lexically_normal();
    auto separator = std::string(1, std::filesystem::path::preferred_separator);
    auto work = [normalized = std::move(normalized),
                 separator = std::move(separator), cb = std::move(cb)]() mutable
    {
        try
        {
            if (!filesystem_path_exists(normalized))
            {
                cb(serialize_error("path does not exist"));
                return;
            }
            if (!filesystem_is_directory(normalized))
            {
                cb(serialize_error("path is not a directory"));
                return;
            }
            auto entries = collect_directory_entries_generic(normalized);
            auto parent = normalized.parent_path();
            cb(serialize_fs_browse(path_to_string(normalized),
                                   path_to_string(parent), separator, entries));
        }
        catch (std::filesystem::filesystem_error const &ex)
        {
            TT_LOG_INFO("fs-browse failed: {}", ex.what());
            cb(serialize_error(ex.what()));
        }
        catch (...)
        {
            cb(serialize_error("fs-browse failed"));
        }
    };
    if (engine)
    {
        engine->submit_io_task(std::move(work));
    }
    else
    {
        work();
    }
}

void handle_fs_space_async(engine::Core *engine, yyjson_val *arguments,
                           ResponseCallback cb)
{
    auto target = arguments
                      ? parse_request_path(yyjson_obj_get(arguments, "path"))
                      : std::filesystem::path{};
    if (target.empty())
    {
        target = std::filesystem::current_path();
    }
    auto work = [target = std::move(target), cb = std::move(cb)]()
    {
        try
        {
            auto info = query_directory_space(target);
            if (!info)
            {
                cb(serialize_error("unable to query space"));
                return;
            }
            cb(serialize_fs_space(path_to_string(target), info->available,
                                  info->capacity));
        }
        catch (std::filesystem::filesystem_error const &ex)
        {
            TT_LOG_INFO("fs-space failed: {}", ex.what());
            cb(serialize_error(ex.what()));
        }
        catch (...)
        {
            cb(serialize_error("fs-space failed"));
        }
    };
    if (engine)
    {
        engine->submit_io_task(std::move(work));
    }
    else
    {
        work();
    }
}

void handle_fs_create_dir_async(engine::Core *engine, yyjson_val *arguments,
                                ResponseCallback cb)
{
    auto target = arguments
                      ? parse_request_path(yyjson_obj_get(arguments, "path"))
                      : std::filesystem::path{};
    if (target.empty())
    {
        cb(serialize_error("path required"));
        return;
    }
    auto normalized = target.lexically_normal();
    auto work = [normalized = std::move(normalized), cb = std::move(cb)]()
    {
        try
        {
            if (auto error = ensure_directory_exists(normalized))
            {
                cb(serialize_error(error->message,
                                   make_string_view(error->detail),
                                   error->code));
                return;
            }
            cb(serialize_success());
        }
        catch (std::filesystem::filesystem_error const &ex)
        {
            TT_LOG_INFO("fs-create-dir failed: {}", ex.what());
            cb(serialize_error(ex.what()));
        }
        catch (...)
        {
            cb(serialize_error("fs-create-dir failed"));
        }
    };
    if (engine)
    {
        engine->submit_io_task(std::move(work));
    }
    else
    {
        work();
    }
}

void handle_fs_write_file_async(engine::Core *engine, yyjson_val *arguments,
                                ResponseCallback cb)
{
    if (!arguments)
    {
        cb(serialize_error("arguments required for fs-write-file"));
        return;
    }
    auto *path_value = yyjson_obj_get(arguments, "path");
    if (path_value == nullptr || !yyjson_is_str(path_value))
    {
        cb(serialize_error("path argument required"));
        return;
    }
    std::filesystem::path target(yyjson_get_str(path_value));
    if (target.empty())
    {
        cb(serialize_error("path required"));
        return;
    }
    if (!target.is_absolute())
    {
        cb(serialize_error("path must be absolute"));
        return;
    }
    target = target.lexically_normal();
    auto *data_value = yyjson_obj_get(arguments, "data");
    if (data_value == nullptr || !yyjson_is_str(data_value))
    {
        cb(serialize_error("data argument required"));
        return;
    }
    auto decoded = tt::utils::decode_base64(yyjson_get_str(data_value));
    if (!decoded)
    {
        cb(serialize_error("invalid base64 payload"));
        return;
    }
    bool fail_if_exists = false;
    if (auto *mode_value = yyjson_obj_get(arguments, "mode"))
    {
        if (!yyjson_is_str(mode_value))
        {
            cb(serialize_error("mode must be a string"));
            return;
        }
        auto mode = std::string(yyjson_get_str(mode_value));
        if (mode == "overwrite")
        {
            fail_if_exists = false;
        }
        else if (mode == "fail-if-exists")
        {
            fail_if_exists = true;
        }
        else
        {
            cb(serialize_error("invalid mode"));
            return;
        }
    }
    auto work = [target = std::move(target), bytes = std::move(*decoded),
                 fail_if_exists, cb = std::move(cb)]() mutable
    {
        std::filesystem::path temp_path;
        try
        {
            auto cleanup_temp = [&]()
            {
                if (!temp_path.empty())
                {
                    std::error_code remove_ec;
                    std::filesystem::remove(temp_path, remove_ec);
                }
            };

            std::error_code ec;
            auto parent = target.parent_path();
            if (parent.empty())
            {
                cb(serialize_error("invalid path"));
                return;
            }
            if (!std::filesystem::exists(parent, ec))
            {
                cb(serialize_error("parent directory not found"));
                return;
            }
            if (!std::filesystem::is_directory(parent, ec))
            {
                cb(serialize_error("parent path is not a directory"));
                return;
            }
            if (is_restricted_system_path(target))
            {
                cb(serialize_error("permission denied"));
                return;
            }
            ec.clear();
            bool target_exists = std::filesystem::exists(target, ec);
            if (ec)
            {
                cb(serialize_error(std::format("unable to inspect {}: {}",
                                               target.string(), ec.message())));
                return;
            }
            // Reject writes that would follow an existing symlink target
            if (target_exists)
            {
                std::error_code symlink_ec;
                if (std::filesystem::is_symlink(target, symlink_ec) &&
                    !symlink_ec)
                {
                    cb(serialize_error("refusing to overwrite symbolic link"));
                    return;
                }
            }
            if (fail_if_exists && target_exists)
            {
                cb(serialize_error("file exists"));
                return;
            }
            // Use high-quality randomness to avoid predictable temp names.
            uint64_t rnd = 0;
            try
            {
                std::random_device rd;
                std::mt19937_64 rng(rd());
                std::uniform_int_distribution<uint64_t> dist;
                rnd = dist(rng);
            }
            catch (...)
            {
                rnd = std::hash<std::thread::id>{}(std::this_thread::get_id());
            }
            auto timestamp =
                std::chrono::steady_clock::now().time_since_epoch().count();
            auto thread_hash =
                std::hash<std::thread::id>{}(std::this_thread::get_id());
            auto temp_name = std::format(".tt-write-{:x}-{:x}-{:x}.tmp",
                                         timestamp, thread_hash, rnd);
            temp_path = parent / temp_name;
            {
                std::ofstream output(temp_path.wstring(),
                                     std::ios::binary | std::ios::trunc);
                if (!output)
                {
                    cleanup_temp();
                    cb(serialize_error("unable to write file"));
                    return;
                }
                if (!bytes.empty())
                {
                    output.write(reinterpret_cast<char const *>(bytes.data()),
                                 static_cast<std::streamsize>(bytes.size()));
                }
                output.close();
                if (!output)
                {
                    cleanup_temp();
                    cb(serialize_error("unable to write file"));
                    return;
                }
            }
            ec.clear();
            target_exists = std::filesystem::exists(target, ec);
            if (ec)
            {
                cleanup_temp();
                cb(serialize_error(std::format("unable to inspect {}: {}",
                                               target.string(), ec.message())));
                return;
            }
            if (fail_if_exists && target_exists)
            {
                cleanup_temp();
                cb(serialize_error("file exists"));
                return;
            }
#if defined(_WIN32)
            auto target_w = utf8_to_wide(target.string());
            auto temp_w = temp_path.wstring();
            if (target_w.empty() || temp_w.empty())
            {
                cleanup_temp();
                cb(serialize_error("invalid path"));
                return;
            }
            DWORD move_flags =
                MOVEFILE_COPY_ALLOWED | MOVEFILE_REPLACE_EXISTING;
            if (!MoveFileExW(temp_w.c_str(), target_w.c_str(), move_flags))
            {
                auto last = GetLastError();
                std::error_code move_ec(static_cast<int>(last),
                                        std::system_category());
                cleanup_temp();
                cb(serialize_error(
                    std::format("unable to move file: {}", move_ec.message())));
                return;
            }
#else
            std::filesystem::error_code rename_ec;
            if (target_exists)
            {
                std::filesystem::remove(target, rename_ec);
            }
            std::filesystem::rename(temp_path, target);
#endif
            temp_path.clear();
            cb(serialize_fs_write_result(
                static_cast<std::uint64_t>(bytes.size())));
        }
        catch (std::filesystem::filesystem_error const &ex)
        {
            if (!temp_path.empty())
            {
                std::error_code remove_ec;
                std::filesystem::remove(temp_path, remove_ec);
            }
            cb(serialize_error(ex.what()));
        }
        catch (...)
        {
            if (!temp_path.empty())
            {
                std::error_code remove_ec;
                std::filesystem::remove(temp_path, remove_ec);
            }
            cb(serialize_error("fs-write-file failed"));
        }
    };
    if (engine)
    {
        engine->submit_io_task(std::move(work));
    }
    else
    {
        work();
    }
}

void handle_history_get(engine::Core *engine, yyjson_val *arguments,
                        ResponseCallback cb)
{
    if (!engine)
    {
        cb(serialize_error("engine unavailable"));
        return;
    }
    if (arguments == nullptr)
    {
        cb(serialize_error("arguments required"));
        return;
    }
    auto *start_value = yyjson_obj_get(arguments, "start");
    if (start_value == nullptr)
    {
        cb(serialize_error("start required"));
        return;
    }
    auto start = parse_int64_value(start_value);
    if (!start)
    {
        cb(serialize_error("invalid start"));
        return;
    }
    auto now = std::chrono::system_clock::now();
    std::int64_t end = static_cast<std::int64_t>(
        std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch())
            .count());
    if (auto *end_value = yyjson_obj_get(arguments, "end"))
    {
        if (auto parsed = parse_int64_value(end_value))
        {
            end = *parsed;
        }
        else
        {
            cb(serialize_error("invalid end"));
            return;
        }
    }
    if (end < *start)
    {
        end = *start;
    }
    auto config = engine->history_config();
    int base_interval = config.interval_seconds > 0
                            ? config.interval_seconds
                            : kDispatcherMinHistoryIntervalSeconds;
    std::int64_t step = base_interval;
    if (auto value = parse_int64_value(yyjson_obj_get(arguments, "step"));
        value && *value > 0)
    {
        step = *value;
    }
    if (step < base_interval)
    {
        step = base_interval;
    }
    if (base_interval > 0 && step % base_interval != 0)
    {
        step = ((step + base_interval - 1) / base_interval) * base_interval;
    }
    engine->history_data(
        *start, end, step,
        [cb = std::move(cb), step,
         base_interval](std::vector<engine::HistoryBucket> buckets)
        { cb(serialize_history_data(buckets, step, base_interval)); });
}

std::string handle_history_clear(engine::Core *engine, yyjson_val *arguments)
{
    if (!engine)
    {
        return serialize_error("engine unavailable");
    }
    std::optional<std::int64_t> older_than;
    if (arguments)
    {
        auto *value = yyjson_obj_get(arguments, "older-than");
        if (value != nullptr)
        {
            older_than = parse_int64_value(value);
            if (!older_than)
            {
                return serialize_error("invalid older-than");
            }
        }
    }
    if (!engine->history_clear(older_than))
    {
        return serialize_error("history clear failed");
    }
    return serialize_success();
}

void handle_system_reveal_async(engine::Core *engine, yyjson_val *arguments,
                                ResponseCallback cb)
{
    if (!engine)
    {
        cb(serialize_error("engine unavailable"));
        return;
    }
    if (!arguments)
    {
        cb(serialize_error("arguments required for system-reveal"));
        return;
    }
    auto target = parse_request_path(yyjson_obj_get(arguments, "path"));
    if (target.empty())
    {
        cb(serialize_error("path required"));
        return;
    }
#if defined(_WIN32)
    try
    {
        sta_worker().post(StaWorker::QueuedWork{
            [target = std::move(target), cb = std::move(cb)]() mutable
            {
                bool success = false;
                std::string message;
                auto const path_str = target.string();
                try
                {
                    if (!sta_worker().com_ready())
                    {
                        cb(serialize_error("native dialogs not supported"));
                        return;
                    }

                    success = reveal_in_file_manager(target);
                    if (!success)
                    {
                        message = "unable to reveal path";
                        TT_LOG_INFO(
                            "system-reveal: helper reported failure for {}",
                            path_str);
                    }
                    else
                    {
                        TT_LOG_INFO("system-reveal: succeeded for {}",
                                    path_str);
                    }
                }
                catch (std::exception const &ex)
                {
                    message = ex.what();
                    TT_LOG_INFO("system-reveal: exception for {}: {}", path_str,
                                message);
                }
                catch (...)
                {
                    message = "unknown error";
                    TT_LOG_INFO("system-reveal: unknown exception for {}",
                                path_str);
                }
                auto response =
                    serialize_system_action("system-reveal", success, message);
                cb(std::move(response));
            },
            [] {}});
    }
    catch (std::exception const &)
    {
        cb(serialize_error("system-reveal unavailable"));
    }
#else
    engine->submit_io_task(
        [target = std::move(target), cb = std::move(cb)]() mutable
        {
            bool success = false;
            std::string message;
            auto const path_str = target.string();
            try
            {
                ScopedCOM com;
                if (!com.initialized())
                {
                    TT_LOG_INFO(
                        "system-reveal: COM initialization failed for {}",
                        path_str);
                }
                success = reveal_in_file_manager(target);
                if (!success)
                {
                    message = "unable to reveal path";
                    TT_LOG_INFO("system-reveal: helper reported failure for {}",
                                path_str);
                }
                else
                {
                    TT_LOG_INFO("system-reveal: succeeded for {}", path_str);
                }
            }
            catch (std::exception const &ex)
            {
                message = ex.what();
                TT_LOG_INFO("system-reveal: exception for {}: {}", path_str,
                            message);
            }
            catch (...)
            {
                message = "unknown error";
                TT_LOG_INFO("system-reveal: unknown exception for {}",
                            path_str);
            }
            cb(serialize_system_action("system-reveal", success, message));
        });
#endif
}

void handle_system_open_async(engine::Core *engine, yyjson_val *arguments,
                              ResponseCallback cb)
{
    if (!engine)
    {
        cb(serialize_error("engine unavailable"));
        return;
    }
    if (!arguments)
    {
        cb(serialize_error("arguments required for system-open"));
        return;
    }
    auto target = parse_request_path(yyjson_obj_get(arguments, "path"));
    if (target.empty())
    {
        cb(serialize_error("path required"));
        return;
    }
#if defined(_WIN32)
    try
    {
        sta_worker().post(StaWorker::QueuedWork{
            [target = std::move(target), cb = std::move(cb)]() mutable
            {
                bool success = false;
                std::string message;
                auto const path_str = target.string();
                try
                {
                    if (!sta_worker().com_ready())
                    {
                        cb(serialize_error("native dialogs not supported"));
                        return;
                    }
                    success = open_with_default_app(target);
                    if (!success)
                    {
                        message = "unable to open path";
                        TT_LOG_INFO(
                            "system-open: helper reported failure for {}",
                            path_str);
                    }
                    else
                    {
                        TT_LOG_INFO("system-open: succeeded for {}", path_str);
                    }
                }
                catch (std::exception const &ex)
                {
                    message = ex.what();
                    TT_LOG_INFO("system-open: exception for {}: {}", path_str,
                                message);
                }
                catch (...)
                {
                    message = "unknown error";
                    TT_LOG_INFO("system-open: unknown exception for {}",
                                path_str);
                }
                auto response =
                    serialize_system_action("system-open", success, message);
                cb(std::move(response));
            },
            [] {}});
    }
    catch (std::exception const &)
    {
        cb(serialize_error("system-open unavailable"));
    }
#else
    engine->submit_io_task(
        [target = std::move(target), cb = std::move(cb)]() mutable
        {
            bool success = false;
            std::string message;
            auto const path_str = target.string();
            try
            {
                ScopedCOM com;
                if (!com.initialized())
                {
                    TT_LOG_INFO("system-open: COM initialization failed for {}",
                                path_str);
                }
                success = open_with_default_app(target);
                if (!success)
                {
                    message = "unable to open path";
                    TT_LOG_INFO("system-open: helper reported failure for {}",
                                path_str);
                }
                else
                {
                    TT_LOG_INFO("system-open: succeeded for {}", path_str);
                }
            }
            catch (std::exception const &ex)
            {
                message = ex.what();
                TT_LOG_INFO("system-open: exception for {}: {}", path_str,
                            message);
            }
            catch (...)
            {
                message = "unknown error";
                TT_LOG_INFO("system-open: unknown exception for {}", path_str);
            }
            cb(serialize_system_action("system-open", success, message));
        });
#endif
}

std::string handle_system_autorun_status(engine::Core *engine,
                                         UiPreferences const &ui_preferences)
{
    (void)engine;
#if defined(_WIN32)
    bool enabled = false;
    bool supported = true;
    bool requires_elevation = false;
    std::wstring extra_args =
        ui_preferences.hide_ui_when_autorun ? L" --start-hidden"
                                            : std::wstring{};
    auto command = compose_autorun_command(extra_args);
    if (!command.empty())
    {
        if (auto existing = read_autorun_value();
            existing && *existing == command)
        {
            enabled = true;
        }
    }
    return serialize_autorun_status(enabled, supported, requires_elevation);
#else
    return serialize_autorun_status(false, false, false);
#endif
}

std::string handle_system_autorun_enable(engine::Core *engine,
                                         yyjson_val *arguments,
                                         UiPreferences const &ui_preferences)
{
    (void)engine;
#if defined(_WIN32)
    auto scope = std::string("user");
    if (arguments)
    {
        if (auto *scope_value = yyjson_obj_get(arguments, "scope");
            scope_value && yyjson_is_str(scope_value))
        {
            scope = yyjson_get_str(scope_value);
        }
    }
    if (scope != "user")
    {
        TT_LOG_INFO("system-autorun-enable ignoring unsupported scope {}",
                    scope);
    }
    std::wstring extra_args =
        ui_preferences.hide_ui_when_autorun ? L" --start-hidden"
                                            : std::wstring{};
    auto command = compose_autorun_command(extra_args);
    if (command.empty())
    {
        return serialize_system_action("system-autorun-enable", false,
                                       "unable to determine executable path");
    }
    std::string message;
    bool success = write_autorun_value(command, message);
    return serialize_system_action("system-autorun-enable", success,
                                   success ? std::string{} : message);
#else
    return serialize_system_action("system-autorun-enable", false,
                                   "system-autorun unsupported");
#endif
}

std::string handle_system_autorun_disable(engine::Core *engine)
{
    (void)engine;
#if defined(_WIN32)
    std::string message;
    bool success = delete_autorun_value(message);
    return serialize_system_action("system-autorun-disable", success,
                                   success ? std::string{} : message);
#else
    return serialize_system_action("system-autorun-disable", false,
                                   "system-autorun unsupported");
#endif
}

std::string handle_system_handler_status(engine::Core *engine)
{
    (void)engine;
#if defined(_WIN32)
    auto status = query_handler_status();
    bool registered = status.magnet && status.torrent;
    return serialize_handler_status(registered, true, status.requires_elevation,
                                    status.magnet, status.torrent);
#else
    return serialize_handler_status(false, false, false, false, false);
#endif
}

std::string handle_system_handler_enable(engine::Core *engine)
{
    (void)engine;
#if defined(_WIN32)
    auto result = register_platform_handler();
    if (result.success)
    {
        set_handler_error_message({});
    }
    else
    {
        std::string stored = result.message.empty()
                                 ? "system handler enable failed"
                                 : result.message;
        set_handler_error_message(stored);
    }
    return serialize_system_action("system-handler-enable", result.success,
                                   result.message);
#else
    set_handler_error_message({});
    return serialize_system_action("system-handler-enable", false,
                                   "system-handler unsupported");
#endif
}

std::string handle_system_handler_disable(engine::Core *engine)
{
    (void)engine;
#if defined(_WIN32)
    auto result = unregister_windows_handler();
    if (result.success)
    {
        set_handler_error_message({});
    }
    else
    {
        std::string stored = result.message.empty()
                                 ? "system handler disable failed"
                                 : result.message;
        set_handler_error_message(stored);
    }
    return serialize_system_action("system-handler-disable", result.success,
                                   result.message);
#else
    set_handler_error_message({});
    return serialize_system_action("system-handler-disable", false,
                                   "system-handler unsupported");
#endif
}

void handle_system_install_async(engine::Core *engine, yyjson_val *arguments,
                                 ResponseCallback cb)
{
    std::vector<std::string> default_locations(
        kDefaultShortcutLocations.begin(), kDefaultShortcutLocations.end());
    std::string parse_error;
    auto request =
        parse_shortcut_request(arguments, default_locations, parse_error);
    if (!request)
    {
        cb(serialize_error(parse_error.empty() ? "invalid arguments"
                                               : parse_error));
        return;
    }
    bool register_handlers =
        bool_value(yyjson_obj_get(arguments, "registerHandlers"));
    bool install_to_program_files_flag =
        bool_value(yyjson_obj_get(arguments, "installToProgramFiles"));

#if !defined(_WIN32)
    cb(serialize_error("system-install unsupported"));
    return;
#endif

    engine->submit_io_task(
        [request = std::move(*request), register_handlers,
         install_to_program_files_flag, cb = std::move(cb)]() mutable
        {
            SystemInstallResult result;
            result.install_requested = install_to_program_files_flag;

            auto executable_path = tt::utils::executable_path();
            if (!executable_path)
            {
                result.message = "unable to determine executable path";
                cb(serialize_system_install(result));
                return;
            }

            std::filesystem::path shortcut_target = *executable_path;
            std::vector<std::string> error_messages;

            if (install_to_program_files_flag)
            {
                auto install_result =
                    install_to_program_files(*executable_path);
                result.install_success = install_result.success;
                result.permission_denied |= install_result.permission_denied;
                result.install_message = install_result.message;
                if (install_result.target_path)
                {
                    result.installed_path =
                        path_to_string(*install_result.target_path);
                    shortcut_target = *install_result.target_path;
                }
                if (!install_result.success && !install_result.message.empty())
                {
                    error_messages.push_back(install_result.message);
                }
            }

            auto shortcuts = create_shortcuts_on_sta(request, shortcut_target);
            result.shortcuts = shortcuts.created;
            if (!shortcuts.success && !shortcuts.message.empty())
            {
                error_messages.push_back(shortcuts.message);
            }

            result.success = shortcuts.success;
            if (install_to_program_files_flag && !result.install_success)
            {
                result.success = false;
            }

            if (!shortcuts.success)
            {
                result.success = false;
            }

            if (register_handlers)
            {
                auto handler_result = register_platform_handler();
                result.handlers_registered = handler_result.success;
                result.handler_message = handler_result.message;
                result.permission_denied |= handler_result.permission_denied;
                if (!handler_result.success && !handler_result.message.empty())
                {
                    error_messages.push_back(handler_result.message);
                }
                if (!handler_result.success)
                {
                    result.success = false;
                }
            }

            if (!error_messages.empty())
            {
                result.message = join_messages(error_messages);
            }

            cb(serialize_system_install(result));
        });
}

void handle_free_space_async(engine::Core *engine, yyjson_val *arguments,
                             ResponseCallback cb)
{
    if (!arguments)
    {
        cb(serialize_error("arguments missing for free-space"));
        return;
    }
    yyjson_val *path_value = yyjson_obj_get(arguments, "path");
    if (path_value == nullptr || !yyjson_is_str(path_value))
    {
        cb(serialize_error("path argument required"));
        return;
    }
    std::filesystem::path path(yyjson_get_str(path_value));
    auto work = [path = std::move(path), cb = std::move(cb)]()
    {
        try
        {
            auto info = std::filesystem::space(path);
            cb(serialize_free_space(path.string(), info.available,
                                    info.capacity));
        }
        catch (std::filesystem::filesystem_error const &ex)
        {
            TT_LOG_INFO("free-space failed for {}: {}", path.string(),
                        ex.what());
            cb(serialize_error(ex.what()));
        }
        catch (...)
        {
            cb(serialize_error("free-space failed"));
        }
    };
    if (engine)
    {
        engine->submit_io_task(std::move(work));
    }
    else
    {
        work();
    }
}

std::string handle_system_register_handler()
{
    SystemHandlerResult result = register_platform_handler();
    if (result.message.empty())
    {
        result.message = "system register handler unsupported";
    }
    return serialize_system_action("system-register-handler", result.success,
                                   result.message);
}

std::string handle_app_shutdown(engine::Core *engine)
{
    if (engine)
    {
        engine->stop();
    }
#if defined(_WIN32)
    shutdown_sta_worker();
#endif
    tt::runtime::request_shutdown();
    return serialize_success();
}

std::string handle_free_space(yyjson_val *arguments)
{
    if (!arguments)
    {
        return serialize_error("arguments missing for free-space");
    }
    yyjson_val *path_value = yyjson_obj_get(arguments, "path");
    if (path_value == nullptr || !yyjson_is_str(path_value))
    {
        return serialize_error("path argument required");
    }
    std::filesystem::path path(yyjson_get_str(path_value));
    try
    {
        auto info = std::filesystem::space(path);
        return serialize_free_space(path.string(), info.available,
                                    info.capacity);
    }
    catch (std::filesystem::filesystem_error const &ex)
    {
        TT_LOG_INFO("free-space failed for {}: {}", path.string(), ex.what());
        return serialize_error(ex.what());
    }
}

std::string handle_torrent_get(engine::Core *engine, yyjson_val *arguments)
{
    if (!engine)
    {
        return serialize_error("engine unavailable");
    }
    auto ids = parse_ids(arguments);
    yyjson_val *fields =
        arguments ? yyjson_obj_get(arguments, "fields") : nullptr;
    if (needs_detail(fields))
    {
        auto details = gather_torrent_details(engine, ids);
        return serialize_torrent_detail(details);
    }
    auto snapshots = filter_torrents(engine, ids);
    return serialize_torrent_list(snapshots);
}

std::string handle_torrent_start(engine::Core *engine, yyjson_val *arguments,
                                 bool now)
{
    auto ids = parse_ids(arguments);
    if (ids.empty())
    {
        return serialize_error("ids required");
    }
    if (!engine)
    {
        return serialize_error("engine unavailable");
    }
    engine->start_torrents(ids, now);
    return serialize_success();
}

std::string handle_torrent_stop(engine::Core *engine, yyjson_val *arguments)
{
    auto ids = parse_ids(arguments);
    if (ids.empty())
    {
        return serialize_error("ids required");
    }
    if (!engine)
    {
        return serialize_error("engine unavailable");
    }
    engine->stop_torrents(ids);
    return serialize_success();
}

std::string handle_torrent_verify(engine::Core *engine, yyjson_val *arguments)
{
    auto ids = parse_ids(arguments);
    if (ids.empty())
    {
        return serialize_error("ids required");
    }
    if (!engine)
    {
        return serialize_error("engine unavailable");
    }
    engine->verify_torrents(ids);
    return serialize_success();
}

std::string handle_torrent_remove(engine::Core *engine, yyjson_val *arguments)
{
    auto ids = parse_ids(arguments);
    if (ids.empty())
    {
        return serialize_error("ids required");
    }
    if (!engine)
    {
        return serialize_error("engine unavailable");
    }
    bool delete_data =
        bool_value(yyjson_obj_get(arguments, "delete-local-data"));
    engine->remove_torrents(ids, delete_data);
    return serialize_success();
}

std::string handle_torrent_reannounce(engine::Core *engine,
                                      yyjson_val *arguments)
{
    auto ids = parse_ids(arguments);
    if (ids.empty())
    {
        return serialize_error("ids required");
    }
    if (!engine)
    {
        return serialize_error("engine unavailable");
    }
    engine->reannounce_torrents(ids);
    return serialize_success();
}

enum class QueueMoveAction
{
    Top,
    Bottom,
    Up,
    Down
};

std::string handle_queue_move(engine::Core *engine, yyjson_val *arguments,
                              QueueMoveAction action)
{
    auto ids = parse_ids(arguments);
    if (ids.empty())
    {
        return serialize_error("ids required");
    }
    if (!engine)
    {
        return serialize_error("engine unavailable");
    }
    switch (action)
    {
    case QueueMoveAction::Top:
        engine->queue_move_top(ids);
        break;
    case QueueMoveAction::Bottom:
        engine->queue_move_bottom(ids);
        break;
    case QueueMoveAction::Up:
        engine->queue_move_up(ids);
        break;
    case QueueMoveAction::Down:
        engine->queue_move_down(ids);
        break;
    }
    return serialize_success();
}

std::string handle_torrent_set(engine::Core *engine, yyjson_val *arguments)
{
    auto ids = parse_ids(arguments);
    if (ids.empty())
    {
        return serialize_error("ids required");
    }
    if (!engine)
    {
        return serialize_error("engine unavailable");
    }
    bool handled = false;
    auto wanted = parse_int_array(arguments, "files-wanted");
    if (!wanted.empty())
    {
        engine->toggle_file_selection(ids, wanted, true);
        handled = true;
    }
    auto unwanted = parse_int_array(arguments, "files-unwanted");
    if (!unwanted.empty())
    {
        engine->toggle_file_selection(ids, unwanted, false);
        handled = true;
    }
    auto tracker_add =
        parse_tracker_entries(yyjson_obj_get(arguments, "trackerAdd"));
    if (!tracker_add.empty())
    {
        engine->add_trackers(ids, tracker_add);
        handled = true;
    }
    auto tracker_remove =
        parse_tracker_announces(yyjson_obj_get(arguments, "trackerRemove"));
    if (!tracker_remove.empty())
    {
        engine->remove_trackers(ids, tracker_remove);
        handled = true;
    }
    auto tracker_replace =
        parse_tracker_entries(yyjson_obj_get(arguments, "trackerReplace"));
    if (!tracker_replace.empty())
    {
        engine->replace_trackers(ids, tracker_replace);
        handled = true;
    }
    if (auto priority = parse_bandwidth_priority(
            yyjson_obj_get(arguments, "bandwidthPriority"));
        priority)
    {
        engine->set_torrent_bandwidth_priority(ids, *priority);
        handled = true;
    }
    auto download_limit =
        parse_int_value(yyjson_obj_get(arguments, "downloadLimit"));
    auto download_limited =
        parse_bool_flag(yyjson_obj_get(arguments, "downloadLimited"));
    auto upload_limit =
        parse_int_value(yyjson_obj_get(arguments, "uploadLimit"));
    auto upload_limited =
        parse_bool_flag(yyjson_obj_get(arguments, "uploadLimited"));
    if (download_limit || download_limited || upload_limit || upload_limited)
    {
        engine->set_torrent_bandwidth_limits(ids, download_limit,
                                             download_limited, upload_limit,
                                             upload_limited);
        handled = true;
    }
    engine::TorrentSeedLimit seed_limits;
    bool seed_limit_set = false;
    if (auto ratio_limit =
            parse_double_value(yyjson_obj_get(arguments, "seedRatioLimit")))
    {
        seed_limits.ratio_limit = *ratio_limit;
        seed_limit_set = true;
    }
    if (auto ratio_enabled =
            parse_bool_flag(yyjson_obj_get(arguments, "seedRatioLimited")))
    {
        seed_limits.ratio_enabled = *ratio_enabled;
        seed_limit_set = true;
    }
    if (auto ratio_mode =
            parse_int_value(yyjson_obj_get(arguments, "seedRatioMode")))
    {
        seed_limits.ratio_mode = *ratio_mode;
        seed_limit_set = true;
    }
    if (auto idle_limit =
            parse_int_value(yyjson_obj_get(arguments, "seedIdleLimit")))
    {
        seed_limits.idle_limit = std::max(0, *idle_limit) * 60;
        seed_limit_set = true;
    }
    if (auto idle_enabled =
            parse_bool_flag(yyjson_obj_get(arguments, "seedIdleLimited")))
    {
        seed_limits.idle_enabled = *idle_enabled;
        seed_limit_set = true;
    }
    if (auto idle_mode =
            parse_int_value(yyjson_obj_get(arguments, "seedIdleMode")))
    {
        seed_limits.idle_mode = *idle_mode;
        seed_limit_set = true;
    }
    if (seed_limit_set)
    {
        engine->set_torrent_seed_limits(ids, seed_limits);
        handled = true;
    }
    if (auto labels = parse_labels(yyjson_obj_get(arguments, "labels")))
    {
        engine->set_torrent_labels(ids, *labels);
        handled = true;
    }
    if (auto sequential =
            parse_bool_flag(yyjson_obj_get(arguments, "sequential-download")))
    {
        engine->set_sequential(ids, *sequential);
        handled = true;
    }
    if (auto super_seeding =
            parse_bool_flag(yyjson_obj_get(arguments, "super-seeding")))
    {
        engine->set_super_seeding(ids, *super_seeding);
        handled = true;
    }
    if (auto force_check =
            parse_bool_flag(yyjson_obj_get(arguments, "force-recheck")))
    {
        handled = true;
        if (*force_check)
        {
            engine->verify_torrents(ids);
        }
    }
    if (auto force_reannounce =
            parse_bool_flag(yyjson_obj_get(arguments, "force-reannounce")))
    {
        handled = true;
        if (*force_reannounce)
        {
            engine->reannounce_torrents(ids);
        }
    }
    if (!handled)
    {
        return serialize_error("unsupported torrent-set arguments");
    }
    return serialize_success();
}

std::string handle_torrent_set_location(engine::Core *engine,
                                        yyjson_val *arguments)
{
    auto ids = parse_ids(arguments);
    yyjson_val *location =
        arguments ? yyjson_obj_get(arguments, "location") : nullptr;
    if (ids.empty() || location == nullptr || !yyjson_is_str(location))
    {
        return serialize_error("location and ids required");
    }
    if (!engine)
    {
        return serialize_error("engine unavailable");
    }
    std::filesystem::path destination_path(yyjson_get_str(location));
    if (destination_path.empty())
    {
        return serialize_error("location cannot be empty");
    }
    if (auto error = ensure_directory_exists(destination_path))
    {
        return serialize_error(error->message,
                               make_string_view(error->detail),
                               error->code);
    }
    std::string destination = destination_path.string();
    bool move_data = bool_value(yyjson_obj_get(arguments, "move"), true);
    for (int id : ids)
    {
        engine->move_torrent_location(id, destination, move_data);
    }
    return serialize_success();
}

std::string handle_torrent_rename_path(engine::Core *engine,
                                       yyjson_val *arguments)
{
    auto ids = parse_ids(arguments);
    yyjson_val *path_value =
        arguments ? yyjson_obj_get(arguments, "path") : nullptr;
    yyjson_val *name_value =
        arguments ? yyjson_obj_get(arguments, "name") : nullptr;
    if (ids.empty() || path_value == nullptr || !yyjson_is_str(path_value) ||
        name_value == nullptr || !yyjson_is_str(name_value))
    {
        return serialize_error("ids, path and name required");
    }
    if (!engine)
    {
        return serialize_error("engine unavailable");
    }
    std::string path(yyjson_get_str(path_value));
    std::string name(yyjson_get_str(name_value));
    bool renamed = false;
    for (int id : ids)
    {
        if (engine->rename_torrent_path(id, path, name))
        {
            renamed = true;
            break;
        }
    }
    if (!renamed)
    {
        return serialize_error("rename failed");
    }
    return serialize_torrent_rename(ids.front(), name, path);
}

std::string handle_group_set()
{
    TT_LOG_DEBUG("group-set ignored in this implementation");
    return serialize_success();
}

} // namespace

UiPreferences Dispatcher::ui_preferences() const
{
    std::shared_lock lock(ui_preferences_mutex_);
    return ui_preferences_;
}

void Dispatcher::set_ui_preferences(UiPreferences const &preferences)
{
    if (ui_preferences_store_ && ui_preferences_store_->is_valid())
    {
        ui_preferences_store_->persist(preferences);
    }
    std::unique_lock lock(ui_preferences_mutex_);
    ui_preferences_ = preferences;
}

namespace
{
#if defined(_WIN32)
LONG set_reg_sz_value(HKEY root, wchar_t const *subkey, wchar_t const *name,
                      std::wstring const &value)
{
    HKEY key = nullptr;
    auto status =
        RegCreateKeyExW(root, subkey, 0, nullptr, REG_OPTION_NON_VOLATILE,
                        KEY_SET_VALUE, nullptr, &key, nullptr);
    if (status != ERROR_SUCCESS)
    {
        return status;
    }

    auto value_name = (name && name[0] != L'\0') ? name : nullptr;
    DWORD size = static_cast<DWORD>((value.size() + 1ull) * sizeof(wchar_t));
    status =
        RegSetValueExW(key, value_name, 0, REG_SZ,
                       reinterpret_cast<BYTE const *>(value.c_str()), size);
    RegCloseKey(key);
    return status;
}

SystemHandlerResult register_windows_handler_cli()
{
    SystemHandlerResult result;
    auto command = compose_handler_command();
    if (command.empty())
    {
        result.message = "unable to determine executable path";
        return result;
    }

    auto apply = [&](wchar_t const *subkey, wchar_t const *name,
                     std::wstring const &value) -> LONG
    { return set_reg_sz_value(HKEY_CURRENT_USER, subkey, name, value); };

    auto fail = [&](char const *prefix, LONG code) -> SystemHandlerResult
    {
        result.permission_denied = (code == ERROR_ACCESS_DENIED);
        result.message =
            std::format("{}: {}", prefix, format_win_error_message(code));
        return result;
    };

    if (auto status = apply(L"Software\\Classes\\magnet", nullptr,
                            L"URL:magnet Protocol");
        status != ERROR_SUCCESS)
    {
        return fail("magnet registration failed", status);
    }
    if (auto status = apply(L"Software\\Classes\\magnet", L"URL Protocol", L"");
        status != ERROR_SUCCESS)
    {
        return fail("magnet registration failed", status);
    }
    if (auto status = apply(L"Software\\Classes\\magnet\\shell\\open\\command",
                            nullptr, command);
        status != ERROR_SUCCESS)
    {
        return fail("magnet handler registration failed", status);
    }
    if (auto status = apply(L"Software\\Classes\\.torrent", nullptr,
                            L"TinyTorrent.torrent");
        status != ERROR_SUCCESS)
    {
        return fail("torrent extension registration failed", status);
    }
    if (auto status = apply(
            L"Software\\Classes\\TinyTorrent.torrent\\shell\\open\\command",
            nullptr, command);
        status != ERROR_SUCCESS)
    {
        return fail("torrent handler registration failed", status);
    }

    SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
    result.success = true;
    result.message = "system handler registered";
    return result;
}
#endif

} // namespace

HandlerActionRequest parse_handler_action(int argc, char *argv[])
{
    HandlerActionRequest request{};
    if (argc <= 1 || argv == nullptr)
    {
        return request;
    }

    for (int i = 1; i < argc; ++i)
    {
        if (argv[i] == nullptr)
        {
            continue;
        }
        std::string_view arg(argv[i]);
        auto lower = to_lower_copy(arg);

        if (lower == "--already-elevated" || lower == "--elevated")
        {
            request.already_elevated = true;
            continue;
        }

        if (lower == "--system-handler-enable" || lower == "--handler-enable" ||
            lower == "--register-handler" || lower == "--register-handlers")
        {
            request.action = HandlerAction::Enable;
            continue;
        }

        if (lower == "--system-handler-disable" ||
            lower == "--handler-disable" || lower == "--unregister-handler" ||
            lower == "--unregister-handlers")
        {
            request.action = HandlerAction::Disable;
            continue;
        }
    }

    return request;
}

bool run_handler_action_elevated(HandlerAction action)
{
#if !defined(_WIN32)
    (void)action;
    return false;
#else
    auto exe_path = tt::utils::executable_path();
    if (!exe_path || exe_path->empty())
    {
        return false;
    }

    std::wstring args;
    switch (action)
    {
    case HandlerAction::Enable:
        args = L"--system-handler-enable";
        break;
    case HandlerAction::Disable:
        args = L"--system-handler-disable";
        break;
    case HandlerAction::None:
    default:
        return false;
    }

    args += L" --already-elevated";

    auto rc = reinterpret_cast<std::intptr_t>(
        ShellExecuteW(nullptr, L"runas", exe_path->c_str(), args.c_str(),
                      nullptr, SW_SHOWNORMAL));
    return rc > 32;
#endif
}

SystemHandlerResult perform_handler_action_impl(HandlerAction action,
                                                bool allow_elevation,
                                                bool already_elevated)
{
    SystemHandlerResult result;
    if (action == HandlerAction::None)
    {
        result.success = true;
        return result;
    }

#if defined(_WIN32)
    if (action == HandlerAction::Enable)
    {
        result = register_windows_handler_cli();
    }
    else if (action == HandlerAction::Disable)
    {
        result = unregister_windows_handler();
    }
#else
    (void)action;
    result.message = "system-handler unsupported";
#endif

    if (result.permission_denied && allow_elevation && !already_elevated)
    {
        result.requires_elevation = true;
        if (run_handler_action_elevated(action))
        {
            result.success = true;
            if (result.message.empty())
            {
                result.message = "elevation requested";
            }
        }
    }

    return result;
}

Dispatcher::Dispatcher(engine::Core *engine, std::string rpc_bind,
                       ResponsePoster post_response,
                       std::shared_ptr<UiPreferencesStore> ui_preferences,
                       std::shared_ptr<SystemInstallService> install_service,
                       EventPublisher event_publisher,
                       UiClientChecker has_ui_client)
    : engine_(engine), rpc_bind_(std::move(rpc_bind)),
      handlers_(), post_response_(std::move(post_response)),
      ui_preferences_store_(std::move(ui_preferences)),
      install_service_(std::move(install_service)),
      broadcast_event_(std::move(event_publisher)),
      has_ui_client_(std::move(has_ui_client))
{
    if (ui_preferences_store_ && ui_preferences_store_->is_valid())
    {
        ui_preferences_ = ui_preferences_store_->load();
    }
    register_handlers();
}

void Dispatcher::register_handlers()
{
    auto add_sync = [this](std::string method, auto handler)
    {
        handlers_.emplace(std::move(method),
                          wrap_sync_handler(std::move(handler)));
    };
    auto add_async = [this](std::string method, DispatchHandler handler)
    { handlers_.emplace(std::move(method), std::move(handler)); };

    add_sync("tt-get-capabilities",
             [](yyjson_val *) { return handle_tt_get_capabilities(); });
    add_sync("session-get", [this](yyjson_val *)
             { return handle_session_get(engine_, rpc_bind_, ui_preferences()); });
    add_sync("session-store-status", [this](yyjson_val *)
             { return handle_session_store_status(engine_); });
    add_sync("session-set", [this](yyjson_val *arguments)
             {
                 auto response = handle_session_set(engine_, arguments);
                 auto prefs = ui_preferences();
                 if (update_ui_preferences_from_arguments(arguments, prefs))
                 {
                     set_ui_preferences(prefs);
                 }
                 return response;
             });
    add_sync("session-test",
             [this](yyjson_val *) { return handle_session_test(engine_); });
    add_sync("session-stats",
             [this](yyjson_val *) { return handle_session_stats(engine_); });
    add_sync("session-tray-status", [this](yyjson_val *)
             {
                 return handle_session_tray_status(engine_, ui_attached(),
                                                   ui_preferences());
             });
    add_sync("session-ui-status", [this](yyjson_val *)
             { return serialize_session_ui_status(ui_attached()); });
    add_sync("session-ui-attach", [this](yyjson_val *)
             {
                 set_ui_attached(true);
                 return serialize_success();
             });
    add_sync("session-ui-detach", [this](yyjson_val *)
             {
                 set_ui_attached(false);
                 return serialize_success();
             });
    add_sync("session-ui-focus", [this](yyjson_val *)
             { return handle_session_ui_focus(); });
    add_sync("session-ui-ready", [this](yyjson_val *)
             {
                 set_ui_attached(true);
                 return serialize_success();
             });
    add_sync("session-pause-all", [this](yyjson_val *)
             { return handle_session_pause_all(engine_); });
    add_sync("session-resume-all", [this](yyjson_val *)
             { return handle_session_resume_all(engine_); });
    add_sync("session-close",
             [this](yyjson_val *) { return handle_session_close(engine_); });
    add_sync("blocklist-update",
             [this](yyjson_val *) { return handle_blocklist_update(engine_); });
    add_sync("app-shutdown",
             [this](yyjson_val *) { return handle_app_shutdown(engine_); });
    add_async("free-space", [this](yyjson_val *arguments, ResponseCallback cb)
              { handle_free_space_async(engine_, arguments, std::move(cb)); });
    add_async("history-get", [this](yyjson_val *arguments, ResponseCallback cb)
              { handle_history_get(engine_, arguments, std::move(cb)); });
    add_sync("history-clear", [this](yyjson_val *arguments)
             { return handle_history_clear(engine_, arguments); });
    add_sync("torrent-get", [this](yyjson_val *arguments)
             { return handle_torrent_get(engine_, arguments); });
    add_sync("torrent-add", [this](yyjson_val *arguments)
             { return handle_torrent_add(engine_, arguments); });
    add_sync("torrent-start", [this](yyjson_val *arguments)
             { return handle_torrent_start(engine_, arguments, false); });
    add_sync("torrent-start-now", [this](yyjson_val *arguments)
             { return handle_torrent_start(engine_, arguments, true); });
    add_sync("torrent-stop", [this](yyjson_val *arguments)
             { return handle_torrent_stop(engine_, arguments); });
    add_sync("torrent-verify", [this](yyjson_val *arguments)
             { return handle_torrent_verify(engine_, arguments); });
    add_sync("torrent-remove", [this](yyjson_val *arguments)
             { return handle_torrent_remove(engine_, arguments); });
    add_sync("torrent-reannounce", [this](yyjson_val *arguments)
             { return handle_torrent_reannounce(engine_, arguments); });
    add_sync("queue-move-top",
             [this](yyjson_val *arguments)
             {
                 return handle_queue_move(engine_, arguments,
                                          QueueMoveAction::Top);
             });
    add_sync("queue-move-bottom",
             [this](yyjson_val *arguments)
             {
                 return handle_queue_move(engine_, arguments,
                                          QueueMoveAction::Bottom);
             });
    add_sync(
        "queue-move-up", [this](yyjson_val *arguments)
        { return handle_queue_move(engine_, arguments, QueueMoveAction::Up); });
    add_sync("queue-move-down",
             [this](yyjson_val *arguments)
             {
                 return handle_queue_move(engine_, arguments,
                                          QueueMoveAction::Down);
             });
    add_sync("torrent-set", [this](yyjson_val *arguments)
             { return handle_torrent_set(engine_, arguments); });
    add_sync("torrent-set-location", [this](yyjson_val *arguments)
             { return handle_torrent_set_location(engine_, arguments); });
    add_sync("torrent-rename-path", [this](yyjson_val *arguments)
             { return handle_torrent_rename_path(engine_, arguments); });
    add_sync("group-set", [](yyjson_val *) { return handle_group_set(); });
}

bool Dispatcher::ui_attached() const
{
    return ui_attached_.load(std::memory_order_acquire);
}

void Dispatcher::set_ui_attached(bool attached)
{
    ui_attached_.store(attached, std::memory_order_release);
}

std::string Dispatcher::handle_session_ui_focus()
{
    if (!ui_attached())
    {
        return serialize_error("UI is not attached");
    }
    if (has_ui_client_ && !has_ui_client_())
    {
        set_ui_attached(false);
        return serialize_error("UI unavailable");
    }
    if (broadcast_event_)
    {
        broadcast_event_(serialize_ws_event_ui_focus());
    }
    return serialize_success();
}

void Dispatcher::dispatch(std::string_view payload, ResponseCallback cb)
{
    auto safe_cb = [post = post_response_,
                    cb = std::move(cb)](std::string response) mutable
    {
        if (post)
        {
            auto cb_copy = cb;
            post([cb = std::move(cb_copy),
                  response = std::move(response)]() mutable
                 { cb(std::move(response)); });
            return;
        }
        cb(std::move(response));
    };

    if (payload.empty())
    {
        safe_cb(serialize_error("empty RPC payload"));
        return;
    }

    auto doc = tt::json::Document::parse(payload);
    if (!doc.is_valid())
    {
        safe_cb(serialize_error("invalid JSON"));
        return;
    }

    yyjson_val *root = doc.root();
    if (root == nullptr || !yyjson_is_obj(root))
    {
        safe_cb(serialize_error("expected JSON object"));
        return;
    }

    yyjson_val *method_value = yyjson_obj_get(root, "method");
    if (method_value == nullptr || !yyjson_is_str(method_value))
    {
        safe_cb(serialize_error("missing method"));
        return;
    }

    std::string method(yyjson_get_str(method_value));
    TT_LOG_DEBUG("Dispatching RPC method={}", method);

    yyjson_val *arguments = yyjson_obj_get(root, "arguments");
    auto handler_it = handlers_.find(method);
    if (handler_it == handlers_.end())
    {
        safe_cb(serialize_error("unsupported method"));
        return;
    }
    try
    {
        handler_it->second(arguments, std::move(safe_cb));
    }
    catch (std::exception const &ex)
    {
        TT_LOG_INFO("RPC handler failed for method {}: {}", method, ex.what());
        safe_cb(serialize_error("internal error", ex.what()));
    }
    catch (...)
    {
        TT_LOG_INFO("RPC handler failed for method {}", method);
        safe_cb(serialize_error("internal error"));
    }
}



} // namespace tt::rpc
