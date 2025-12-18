#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>
#include <shellapi.h>
#include <winhttp.h>

#include <atomic>
#include <chrono>
#include <future>
#include <string>
#include <thread>
#include <sstream>
#include <iomanip>
#include <array>
#include <mutex>

#include <yyjson.h>

#include "app/DaemonMain.hpp"
#include "rpc/Server.hpp"
#include "tt_packed_fs_resource.h"
#include "utils/Shutdown.hpp"

namespace
{
    constexpr UINT ID_OPEN_UI = 1001;
    constexpr UINT ID_START_ALL = 1002;
    constexpr UINT ID_STOP_ALL = 1003;
    constexpr UINT ID_SPEED_STATUS = 1004;
    constexpr UINT ID_PAUSE_RESUME = 1005;
    constexpr UINT ID_OPEN_DOWNLOADS = 1006;
    constexpr UINT ID_EXIT = 1007;

    constexpr UINT kTrayCallbackMessage = WM_APP + 1;
    constexpr UINT kStatusUpdateMessage = WM_APP + 2;
    constexpr wchar_t kRpcHost[] = L"127.0.0.1";
    constexpr wchar_t kRpcEndpoint[] = L"/transmission/rpc";

    struct TrayState
    {
        HWND hwnd = nullptr;
        NOTIFYICONDATAW nid{};
        HMENU menu = nullptr;
        HICON icon = nullptr;
        std::wstring open_url;
        std::atomic_bool running{true};
        std::atomic_bool paused_all{false};
        unsigned short port = 0;
        std::string token;
        HINTERNET http_session = nullptr;
        HINTERNET http_connect = nullptr;
        std::mutex http_mutex;
        std::thread status_thread{};
        std::string download_dir_cache;
        std::mutex download_dir_mutex;
    };

    HICON load_tray_icon()
    {
        HMODULE module = GetModuleHandleW(nullptr);
        if (!module)
        {
            return nullptr;
        }
        int small_width = GetSystemMetrics(SM_CXSMICON);
        int small_height = GetSystemMetrics(SM_CYSMICON);
        auto *icon = static_cast<HICON>(
            LoadImageW(module, MAKEINTRESOURCEW(IDI_TINYTORRENT), IMAGE_ICON,
                       small_width, small_height,
                       LR_DEFAULTCOLOR | LR_CREATEDIBSECTION));
        if (!icon)
        {
            icon = LoadIconW(module, MAKEINTRESOURCEW(IDI_TINYTORRENT));
        }
        if (!icon)
        {
            icon = LoadIconW(nullptr, MAKEINTRESOURCEW(32512));
        }
        return icon;
    }

    std::wstring widen(std::string const &value)
    {
        if (value.empty())
        {
            return {};
        }
        int len = MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, nullptr, 0);
        if (len <= 0)
        {
            return {};
        }
        std::wstring out;
        out.resize(static_cast<size_t>(len));
        MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, out.data(), len);
        out.resize(static_cast<size_t>(len - 1));
        return out;
    }

    void open_browser(std::wstring const &url)
    {
        if (url.empty())
        {
            return;
        }
        ShellExecuteW(nullptr, L"open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
    }

    void build_menu(TrayState &state)
    {
        state.menu = CreatePopupMenu();
        AppendMenuW(state.menu, MF_STRING, ID_OPEN_UI, L"Open UI");
        AppendMenuW(state.menu, MF_STRING, ID_OPEN_DOWNLOADS,
                    L"Open Downloads Folder");
        AppendMenuW(state.menu, MF_SEPARATOR, 0, nullptr);
        AppendMenuW(state.menu, MF_STRING, ID_START_ALL, L"Start All");
        AppendMenuW(state.menu, MF_STRING, ID_STOP_ALL, L"Stop All");
        AppendMenuW(state.menu, MF_SEPARATOR, 0, nullptr);
        AppendMenuW(state.menu, MF_STRING | MF_DISABLED | MF_GRAYED,
                    ID_SPEED_STATUS, L"Download: 0 B/s   Upload: 0 B/s");
        AppendMenuW(state.menu, MF_SEPARATOR, 0, nullptr);
        AppendMenuW(state.menu, MF_STRING, ID_PAUSE_RESUME, L"Pause All");
        AppendMenuW(state.menu, MF_SEPARATOR, 0, nullptr);
        AppendMenuW(state.menu, MF_STRING, ID_EXIT, L"Exit");
    }

    void show_menu(TrayState &state)
    {
        if (!state.menu)
        {
            return;
        }
        POINT pt;
        GetCursorPos(&pt);
        SetForegroundWindow(state.hwnd);
        TrackPopupMenu(state.menu, TPM_RIGHTBUTTON | TPM_BOTTOMALIGN, pt.x, pt.y, 0, state.hwnd, nullptr);
        PostMessageW(state.hwnd, WM_NULL, 0, 0);
    }

    void set_tooltip(TrayState &state, wchar_t const *text)
    {
        if (!text)
        {
            return;
        }
        wcsncpy_s(state.nid.szTip, text, _TRUNCATE);
        Shell_NotifyIconW(NIM_MODIFY, &state.nid);
    }

    void show_running_notification(TrayState &state)
    {
        if (!state.hwnd)
        {
            return;
        }
        NOTIFYICONDATAW info = {};
        info.cbSize = sizeof(info);
        info.hWnd = state.hwnd;
        info.uID = state.nid.uID;
        info.uFlags = NIF_INFO;
        info.dwInfoFlags = NIIF_INFO;
        info.uTimeout = 4500;
        wcsncpy_s(info.szInfoTitle, L"TinyTorrent running", _TRUNCATE);
        wcsncpy_s(info.szInfo,
                   L"TinyTorrent (Mica-aware glass UI) is ready. Use the tray icon to open the HUD.",
                   _TRUNCATE);
        Shell_NotifyIconW(NIM_MODIFY, &info);
        set_tooltip(state, L"TinyTorrent (Mica-aware glass UI) is ready");
    }

    void set_menu_item_text(HMENU menu, UINT id, wchar_t const *text)
    {
        if (!menu || !text)
            return;
        MENUITEMINFOW mii{};
        mii.cbSize = sizeof(mii);
        mii.fMask = MIIM_STRING;
        mii.dwTypeData = const_cast<wchar_t *>(text);
        SetMenuItemInfoW(menu, id, FALSE, &mii);
    }

    bool ensure_http_handles(TrayState &state)
    {
        if (state.port == 0)
            return false;
        if (state.http_session && state.http_connect)
            return true;
        if (state.http_connect)
        {
            WinHttpCloseHandle(state.http_connect);
            state.http_connect = nullptr;
        }
        if (state.http_session)
        {
            WinHttpCloseHandle(state.http_session);
            state.http_session = nullptr;
        }

        state.http_session = WinHttpOpen(L"TinyTorrentTray/1.0",
                                         WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                         WINHTTP_NO_PROXY_NAME,
                                         WINHTTP_NO_PROXY_BYPASS, 0);
        if (!state.http_session)
            return false;

        state.http_connect = WinHttpConnect(
            state.http_session, kRpcHost,
            static_cast<INTERNET_PORT>(state.port), 0);
        if (!state.http_connect)
        {
            WinHttpCloseHandle(state.http_session);
            state.http_session = nullptr;
            return false;
        }
        return true;
    }

    void cleanup_http_handles(TrayState &state, bool lock = true)
    {
        if (lock)
        {
            std::lock_guard<std::mutex> guard(state.http_mutex);
            if (state.http_connect)
            {
                WinHttpCloseHandle(state.http_connect);
                state.http_connect = nullptr;
            }
            if (state.http_session)
            {
                WinHttpCloseHandle(state.http_session);
                state.http_session = nullptr;
            }
        }
        else
        {
            if (state.http_connect)
            {
                WinHttpCloseHandle(state.http_connect);
                state.http_connect = nullptr;
            }
            if (state.http_session)
            {
                WinHttpCloseHandle(state.http_session);
                state.http_session = nullptr;
            }
        }
    }

    std::string http_post_rpc(TrayState &state, std::string const &payload)
    {
        std::lock_guard<std::mutex> guard(state.http_mutex);
        if (!ensure_http_handles(state))
            return {};

        std::string result;
        HINTERNET hRequest = WinHttpOpenRequest(
            state.http_connect, L"POST", kRpcEndpoint, nullptr,
            WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES,
            WINHTTP_FLAG_BYPASS_PROXY_CACHE);
        if (!hRequest)
        {
            cleanup_http_handles(state, false);
            return {};
        }

        std::wstring headers = L"Content-Type: application/json\r\n";
        if (!state.token.empty())
        {
            headers += L"X-TT-Auth: ";
            int need = MultiByteToWideChar(CP_UTF8, 0, state.token.data(),
                                           static_cast<int>(state.token.size()),
                                           nullptr, 0);
            if (need > 0)
            {
                std::wstring wtoken;
                wtoken.resize(need);
                MultiByteToWideChar(CP_UTF8, 0, state.token.data(),
                                    static_cast<int>(state.token.size()),
                                    wtoken.data(), need);
                headers += wtoken;
            }
            headers += L"\r\n";
        }

        BOOL ok = WinHttpSendRequest(hRequest, headers.c_str(),
                                     static_cast<DWORD>(headers.size()),
                                     (LPVOID)payload.data(),
                                     static_cast<DWORD>(payload.size()),
                                     static_cast<DWORD>(payload.size()), 0);
        if (!ok)
        {
            WinHttpCloseHandle(hRequest);
            cleanup_http_handles(state, false);
            return {};
        }
        ok = WinHttpReceiveResponse(hRequest, nullptr);
        if (!ok)
        {
            WinHttpCloseHandle(hRequest);
            cleanup_http_handles(state, false);
            return {};
        }

        DWORD dwSize = 0;
        do
        {
            dwSize = 0;
            if (!WinHttpQueryDataAvailable(hRequest, &dwSize))
                break;
            if (dwSize == 0)
                break;
            std::string buffer;
            buffer.resize(dwSize);
            DWORD dwRead = 0;
            if (!WinHttpReadData(hRequest, buffer.data(), dwSize, &dwRead))
                break;
            result.append(buffer.data(), dwRead);
        } while (dwSize > 0);

        WinHttpCloseHandle(hRequest);
        return result;
    }

    struct TrayStatus
    {
        uint64_t down = 0, up = 0;
        size_t active = 0, seeding = 0;
        bool any_error = false;
        bool all_paused = false;
        std::string download_dir;
    };

    // Query the compact tray status pushed by the backend (session-tray-status)
    TrayStatus rpc_get_tray_status(TrayState &state)
    {
        TrayStatus s;
        const std::string payload = R"({"method":"session-tray-status"})";
        auto body = http_post_rpc(state, payload);
        if (body.empty())
            return s;
        yyjson_read_err err;
        yyjson_doc *doc = yyjson_read(body.c_str(), body.size(),
                                      static_cast<yyjson_read_flag>(0));
        if (!doc)
            return s;
        yyjson_val *root = yyjson_doc_get_root(doc);
        if (!root)
        {
            yyjson_doc_free(doc);
            return s;
        }
        yyjson_val *args = yyjson_obj_get(root, "arguments");
        if (!args)
        {
            yyjson_doc_free(doc);
            return s;
        }
        yyjson_val *v = yyjson_obj_get(args, "downloadSpeed");
        if (v && yyjson_is_uint(v))
            s.down = yyjson_get_uint(v);
        v = yyjson_obj_get(args, "uploadSpeed");
        if (v && yyjson_is_uint(v))
            s.up = yyjson_get_uint(v);
        v = yyjson_obj_get(args, "activeTorrentCount");
        if (v && yyjson_is_uint(v))
            s.active = static_cast<size_t>(yyjson_get_uint(v));
        v = yyjson_obj_get(args, "seedingCount");
        if (v && yyjson_is_uint(v))
            s.seeding = static_cast<size_t>(yyjson_get_uint(v));
        v = yyjson_obj_get(args, "anyError");
        if (v && yyjson_is_bool(v))
            s.any_error = yyjson_get_bool(v);
        v = yyjson_obj_get(args, "allPaused");
        if (v && yyjson_is_bool(v))
            s.all_paused = yyjson_get_bool(v);
        v = yyjson_obj_get(args, "downloadDir");
        if (v && yyjson_is_str(v))
            s.download_dir = yyjson_get_str(v);
        yyjson_doc_free(doc);
        return s;
    }

    bool rpc_set_all_paused(TrayState &state, bool pause)
    {
        const char *method = pause ? "session-pause-all" : "session-resume-all";
        std::string payload = "{\"method\":\"";
        payload += method;
        payload += "\"}";
        auto body = http_post_rpc(state, payload);
        return !body.empty();
    }

    // Format bytes/sec to human readable string like "1.2 MB/s"
    std::wstring format_rate(uint64_t bytes)
    {
        std::wstringstream ss;
        if (bytes >= 1000 * 1000)
        {
            ss << std::fixed << std::setprecision(1) << (bytes / 1000.0 / 1000.0) << L" MB/s";
        }
        else if (bytes >= 1000)
        {
            ss << std::fixed << std::setprecision(0) << (bytes / 1000.0) << L" kB/s";
        }
        else
        {
            ss << bytes << L" B/s";
        }
        return ss.str();
    }

    LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam)
    {
        auto *state = reinterpret_cast<TrayState *>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
        switch (msg)
        {
        case WM_CREATE:
            return 0;
        case kTrayCallbackMessage:
            if (lparam == WM_RBUTTONUP)
            {
                if (state)
                {
                    show_menu(*state);
                }
                return 0;
            }
            if (lparam == WM_LBUTTONDBLCLK)
            {
                if (state)
                {
                    open_browser(state->open_url);
                }
                return 0;
            }
            return 0;
        case WM_COMMAND:
            if (!state)
            {
                return 0;
            }
        switch (LOWORD(wparam))
        {
        case ID_OPEN_UI:
            open_browser(state->open_url);
            return 0;
        case ID_START_ALL:
            if (rpc_set_all_paused(*state, false))
            {
                state->paused_all.store(false);
                set_menu_item_text(state->menu, ID_PAUSE_RESUME, L"Pause All");
            }
            return 0;
        case ID_STOP_ALL:
            if (rpc_set_all_paused(*state, true))
            {
                state->paused_all.store(true);
                set_menu_item_text(state->menu, ID_PAUSE_RESUME, L"Resume All");
            }
            return 0;
        case ID_PAUSE_RESUME:
        {
            // Toggle pause/resume.
            bool should_pause = !state->paused_all.load();
            if (rpc_set_all_paused(*state, should_pause))
            {
                state->paused_all.store(should_pause);
                set_menu_item_text(state->menu, ID_PAUSE_RESUME,
                                   should_pause ? L"Resume All" : L"Pause All");
            }
            return 0;
        }
        case ID_OPEN_DOWNLOADS:
        {
            std::string download_dir;
            {
                std::lock_guard<std::mutex> lock(state->download_dir_mutex);
                download_dir = state->download_dir_cache;
            }
            if (!download_dir.empty())
            {
                int need = MultiByteToWideChar(CP_UTF8, 0, download_dir.c_str(), -1, nullptr, 0);
                if (need > 0)
                {
                    std::wstring wpath;
                    wpath.resize(static_cast<size_t>(need - 1));
                    MultiByteToWideChar(CP_UTF8, 0, download_dir.c_str(), -1, wpath.data(), need);
                    ShellExecuteW(nullptr, L"open", wpath.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
                }
            }
            return 0;
        }
        case ID_EXIT:
            tt::runtime::request_shutdown();
            DestroyWindow(hwnd);
            return 0;
        default:
            return 0;
        }
        case kStatusUpdateMessage:
            if (!state)
            {
                if (wparam)
                {
                    delete reinterpret_cast<TrayStatus *>(wparam);
                }
                return 0;
            }
            {
                auto *s = reinterpret_cast<TrayStatus *>(wparam);
                if (!s)
                {
                    return 0;
                }

                std::wstring down = format_rate(s->down);
                std::wstring up = format_rate(s->up);
                std::wostringstream tip;
                tip << L"TinyTorrent\n";
                tip << L"↓ " << down << L"  ↑ " << up << L"\n";
                tip << s->active << L" active • " << s->seeding << L" seeding";

                std::wstring tipstr = tip.str();
                set_tooltip(*state, tipstr.c_str());

                state->paused_all.store(s->all_paused);
                {
                    std::lock_guard<std::mutex> lock(state->download_dir_mutex);
                    state->download_dir_cache = s->download_dir;
                }
                set_menu_item_text(state->menu, ID_PAUSE_RESUME,
                                   s->all_paused ? L"Resume All" : L"Pause All");
                std::wstring speed_label = L"Download: " + down + L" | Upload: " + up;
                set_menu_item_text(state->menu, ID_SPEED_STATUS,
                                   speed_label.c_str());
                delete s;
            }
            return 0;
        case WM_DESTROY:
            if (state)
            {
                state->running.store(false);
                Shell_NotifyIconW(NIM_DELETE, &state->nid);
                if (state->menu)
                {
                    DestroyMenu(state->menu);
                    state->menu = nullptr;
                }
            }
            PostQuitMessage(0);
            return 0;
        default:
            return DefWindowProcW(hwnd, msg, wparam, lparam);
        }
    }

} // namespace

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE, PWSTR, int)
{
    std::promise<tt::rpc::ConnectionInfo> ready;
    auto future = ready.get_future();

    std::thread daemon_thread([&]()
                              {
        // No CLI args for now in WinMain entry; future enhancement: parse GetCommandLineW
        char *argv[] = {const_cast<char *>("TinyTorrent")};
        (void)tt::app::daemon_main(1, argv, &ready); });

    // Wait briefly for connection info so Open UI works.
    tt::rpc::ConnectionInfo info{};
    if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready)
    {
        info = future.get();
    }

    std::wstring url =
        L"http://127.0.0.1:" + std::to_wstring(info.port) +
        L"/index.html#tt-token=" + widen(info.token);

    HICON tray_icon = load_tray_icon();

    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.lpszClassName = L"TinyTorrentTrayWindow";
    wc.hIcon = tray_icon;
    wc.hIconSm = tray_icon;
    RegisterClassExW(&wc);

    HWND hwnd = CreateWindowExW(0, wc.lpszClassName, L"TinyTorrent", 0,
                                0, 0, 0, 0, HWND_MESSAGE, nullptr, hInstance, nullptr);
    if (!hwnd)
    {
        tt::runtime::request_shutdown();
        if (daemon_thread.joinable())
        {
            daemon_thread.join();
        }
        return 1;
    }

    TrayState state;
    state.hwnd = hwnd;
    state.open_url = std::move(url);
    state.port = static_cast<unsigned short>(info.port);
    state.token = info.token;

    state.icon = tray_icon;
    SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(&state));

    build_menu(state);

    state.nid.cbSize = sizeof(state.nid);
    state.nid.hWnd = hwnd;
    state.nid.uID = 1;
    state.nid.uFlags = NIF_MESSAGE | NIF_TIP | NIF_ICON;
    state.nid.uCallbackMessage = kTrayCallbackMessage;
    state.nid.hIcon = state.icon ? state.icon : LoadIconW(nullptr, MAKEINTRESOURCEW(32512));
    wcsncpy_s(state.nid.szTip, L"TinyTorrent starting...", _TRUNCATE);
    Shell_NotifyIconW(NIM_ADD, &state.nid);
    show_running_notification(state);

    state.running.store(true);
    state.status_thread = std::thread([state_ptr = &state]()
                                      {
        while (state_ptr->running.load())
        {
            TrayStatus s = rpc_get_tray_status(*state_ptr);
            if (!state_ptr->running.load())
            {
                break;
            }
            auto *payload = new TrayStatus(std::move(s));
            if (!PostMessageW(state_ptr->hwnd, kStatusUpdateMessage,
                              reinterpret_cast<WPARAM>(payload), 0))
            {
                delete payload;
                break;
            }
            for (int i = 0; i < 10 && state_ptr->running.load(); ++i)
            {
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
            }
        } });

    MSG message;
    while (GetMessageW(&message, nullptr, 0, 0) > 0)
    {
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }

    state.running.store(false);
    if (state.status_thread.joinable())
    {
        state.status_thread.join();
    }
    cleanup_http_handles(state);
    tt::runtime::request_shutdown();
    if (daemon_thread.joinable())
    {
        daemon_thread.join();
    }

    if (state.icon)
        DestroyIcon(state.icon);

    return 0;
}
#endif
