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
#include "utils/Shutdown.hpp"

namespace
{
    constexpr UINT ID_OPEN_UI = 1001;
    constexpr UINT ID_PAUSE_RESUME = 1003;
    constexpr UINT ID_OPEN_DOWNLOADS = 1004;
    constexpr UINT ID_EXIT = 1002;

    constexpr UINT kTrayCallbackMessage = WM_APP + 1;
    constexpr UINT kStatusUpdateMessage = WM_APP + 2;
    constexpr wchar_t kRpcHost[] = L"127.0.0.1";
    constexpr wchar_t kRpcEndpoint[] = L"/transmission/rpc";

    struct TrayState
    {
        HWND hwnd = nullptr;
        NOTIFYICONDATAW nid{};
        HMENU menu = nullptr;
        HICON icon_idle = nullptr;
        HICON icon_active = nullptr;
        HICON icon_error = nullptr;
        std::wstring open_url;
        std::atomic_bool running{true};
        std::atomic_bool paused_all{false};
        std::atomic<int> last_icon_state{0};
        unsigned short port = 0;
        std::string token;
        HINTERNET http_session = nullptr;
        HINTERNET http_connect = nullptr;
        std::mutex http_mutex;
        std::thread status_thread{};
        std::string download_dir_cache;
        std::mutex download_dir_mutex;
    };

    bool is_dark_mode()
    {
        DWORD value = 1;
        DWORD size = sizeof(value);
        if (RegGetValueW(HKEY_CURRENT_USER,
                         L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
                         L"AppsUseLightTheme",
                         RRF_RT_DWORD, nullptr, &value, &size) == ERROR_SUCCESS)
        {
            return value == 0;
        }
        return false;
    }

    struct IconColors
    {
        DWORD base;
        DWORD accent;
        DWORD alert;
    };

    IconColors icon_palette(bool dark)
    {
        if (dark)
        {
            return {0xFF0A84FF, 0xFF21D6FF, 0xFFFF6B6B};
        }
        return {0xFF006CFF, 0xFF00C8FF, 0xFFDA4453};
    }

    HICON make_icon(int size, DWORD fill, DWORD accent)
    {
        BITMAPV5HEADER bi{};
        bi.bV5Size = sizeof(bi);
        bi.bV5Width = size;
        bi.bV5Height = -size; // top-down
        bi.bV5Planes = 1;
        bi.bV5BitCount = 32;
        bi.bV5Compression = BI_BITFIELDS;
        bi.bV5RedMask = 0x00FF0000;
        bi.bV5GreenMask = 0x0000FF00;
        bi.bV5BlueMask = 0x000000FF;
        bi.bV5AlphaMask = 0xFF000000;

        void *bits = nullptr;
        HDC hdc = GetDC(nullptr);
        HBITMAP color = CreateDIBSection(hdc, reinterpret_cast<BITMAPINFO *>(&bi),
                                         DIB_RGB_COLORS, &bits, nullptr, 0);
        ReleaseDC(nullptr, hdc);
        if (!color || !bits)
        {
            return nullptr;
        }

        auto *dst = reinterpret_cast<DWORD *>(bits);
        int cx = size;
        int cy = size;
        int cx2 = cx / 2;
        int cy2 = cy / 2;
        int radius = (size - 2) / 2;

        for (int y = 0; y < cy; ++y)
        {
            for (int x = 0; x < cx; ++x)
            {
                int dx = x - cx2;
                int dy = y - cy2;
                int r2 = dx * dx + dy * dy;
                int idx = y * cx + x;
                if (r2 <= radius * radius)
                {
                    dst[idx] = fill;
                }
                else
                {
                    dst[idx] = 0x00000000;
                }
            }
        }

        // Simple downward arrow glyph inside the circle
        int arrow_w = size / 3;
        int arrow_h = size / 3;
        int ax0 = cx2 - arrow_w / 2;
        int ay0 = cy2 - arrow_h / 2;
        for (int y = 0; y < arrow_h; ++y)
        {
            int span = (y * arrow_w) / arrow_h;
            for (int x = -span; x <= span; ++x)
            {
                int px = cx2 + x;
                int py = ay0 + y;
                if (px >= 0 && px < cx && py >= 0 && py < cy)
                {
                    dst[py * cx + px] = accent;
                }
            }
        }
        // Arrow stem
        int stem_w = size / 8;
        for (int y = ay0 - arrow_h / 2; y < ay0 + arrow_h / 2; ++y)
        {
            for (int x = cx2 - stem_w; x <= cx2 + stem_w; ++x)
            {
                if (x >= 0 && x < cx && y >= 0 && y < cy)
                {
                    dst[y * cx + x] = accent;
                }
            }
        }

        ICONINFO ii{};
        ii.fIcon = TRUE;
        ii.hbmColor = color;
        ii.hbmMask = nullptr;
        HICON icon = CreateIconIndirect(&ii);
        DeleteObject(color);
        return icon;
    }

    struct IconSet
    {
        HICON idle = nullptr;
        HICON active = nullptr;
        HICON error = nullptr;
    };

    IconSet build_icon_set(bool dark)
    {
        IconColors c = icon_palette(dark);
        IconSet set;
        // Use slightly different accents per state to signal activity/error.
        set.idle = make_icon(24, c.base, c.accent);
        set.active = make_icon(24, c.accent, c.base);
        set.error = make_icon(24, c.base, c.alert);
        return set;
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
        AppendMenuW(state.menu, MF_SEPARATOR, 0, nullptr);
        // Pause/Resume placeholder label; updated by timer/update routine.
        AppendMenuW(state.menu, MF_STRING, ID_PAUSE_RESUME, L"Pause All");
        AppendMenuW(state.menu, MF_STRING, ID_OPEN_DOWNLOADS,
                    L"Open Downloads Folder");
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

                int icon_state = 0;
                if (s->any_error)
                    icon_state = 2;
                else if (s->down > 0 || s->up > 0 || s->active > 0)
                    icon_state = 1;
                if (icon_state != state->last_icon_state.load())
                {
                    HICON newIcon = nullptr;
                    if (icon_state == 2)
                        newIcon = state->icon_error;
                    else if (icon_state == 1)
                        newIcon = state->icon_active;
                    else
                        newIcon = state->icon_idle;
                    if (newIcon)
                    {
                        state->nid.hIcon = newIcon;
                        Shell_NotifyIconW(NIM_MODIFY, &state->nid);
                        state->last_icon_state.store(icon_state);
                    }
                }

                {
                    std::lock_guard<std::mutex> lock(state->download_dir_mutex);
                    state->download_dir_cache = s->download_dir;
                }
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

    std::wstring url = L"http://127.0.0.1:" + std::to_wstring(info.port) + L"/#tt-token=" + widen(info.token);

    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.lpszClassName = L"TinyTorrentTrayWindow";
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

    bool use_dark = is_dark_mode();
    IconSet icons = build_icon_set(use_dark);
    state.icon_idle = icons.idle;
    state.icon_active = icons.active;
    state.icon_error = icons.error;
    SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(&state));

    build_menu(state);

    state.nid.cbSize = sizeof(state.nid);
    state.nid.hWnd = hwnd;
    state.nid.uID = 1;
    state.nid.uFlags = NIF_MESSAGE | NIF_TIP | NIF_ICON;
    state.nid.uCallbackMessage = kTrayCallbackMessage;
    state.nid.hIcon = state.icon_idle ? state.icon_idle : LoadIconW(nullptr, IDI_APPLICATION);
    wcsncpy_s(state.nid.szTip, L"TinyTorrent starting...", _TRUNCATE);
    Shell_NotifyIconW(NIM_ADD, &state.nid);

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

    if (state.icon_idle)
        DestroyIcon(state.icon_idle);
    if (state.icon_active)
        DestroyIcon(state.icon_active);
    if (state.icon_error)
        DestroyIcon(state.icon_error);

    return 0;
}
#endif
