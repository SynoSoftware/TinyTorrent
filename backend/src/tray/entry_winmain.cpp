#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <Windows.h>
#include <dwmapi.h>
#include <psapi.h>
#include <shellapi.h>
#include <winhttp.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cwchar>
#include <future>
#include <iomanip>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <string_view>
#include <optional>
#include <thread>

#include <yyjson.h>

#include "app/DaemonMain.hpp"
#include "rpc/Server.hpp"
#include "rpc/UiPreferences.hpp"
#include "tt_packed_fs_resource.h"
#include "utils/FS.hpp"
#include "utils/Shutdown.hpp"

#pragma comment(lib, "Dwmapi.lib")
#pragma comment(lib, "Winhttp.lib")
#pragma comment(lib, "Psapi.lib")

#ifndef DWMWA_WINDOW_CORNER_PREFERENCE
#define DWMWA_WINDOW_CORNER_PREFERENCE 33
#endif

namespace
{
// Menu IDs
constexpr UINT ID_OPEN_UI = 1001;
constexpr UINT ID_START_ALL = 1002;
constexpr UINT ID_STOP_ALL = 1003;
constexpr UINT ID_PAUSE_RESUME = 1005;
constexpr UINT ID_OPEN_DOWNLOADS = 1006;
constexpr UINT ID_EXIT = 1007;
constexpr UINT ID_STATUS_ACTIVE = 1010;
constexpr UINT ID_SHOW_SPLASH = 1015;

// Constants
constexpr UINT kTrayCallbackMessage = WM_APP + 1;
constexpr UINT kStatusUpdateMessage = WM_APP + 2;
constexpr wchar_t kRpcHost[] = L"127.0.0.1";
constexpr wchar_t kRpcEndpoint[] = L"/transmission/rpc";
constexpr wchar_t kStartHiddenArg[] = L"--start-hidden";

static std::atomic<HWND> g_splash_hwnd{nullptr};
static std::wstring g_splash_message;
static auto g_app_start_time = std::chrono::steady_clock::now();

// ===== Undocumented compositor API for Acrylic =====
enum ACCENT_STATE
{
    ACCENT_ENABLE_BLURBEHIND = 3
};
struct ACCENT_POLICY
{
    ACCENT_STATE AccentState;
    DWORD AccentFlags;
    DWORD GradientColor;
    DWORD AnimationId;
};
struct WINDOWCOMPOSITIONATTRIBDATA
{
    int Attrib;
    PVOID pvData;
    SIZE_T cbData;
};
using SetWindowCompositionAttributeFn =
    BOOL(WINAPI *)(HWND, WINDOWCOMPOSITIONATTRIBDATA *);

struct TrayStatus
{
    bool rpc_success = false;
    uint64_t down = 0, up = 0;
    size_t active = 0, seeding = 0;
    bool any_error = false;
    bool all_paused = false;
    bool ui_attached = false;
    std::string download_dir;
    std::string error_message;
    tt::rpc::UiPreferences ui_preferences;
};

struct TrayState
{
    HINSTANCE hInstance = nullptr;
    HWND hwnd = nullptr;
    NOTIFYICONDATAW nid{};
    HMENU menu = nullptr;
    HICON icon = nullptr;
    HICON large_icon = nullptr;
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

    bool auto_open_requested = false;
    std::atomic_bool handshake_completed{false};
    std::string last_error_message;
    bool start_hidden = false;
    std::wstring splash_message;
    tt::rpc::UiPreferences ui_preferences;
    std::atomic_bool ui_attached{false};
};

// --- Utilities ---

std::wstring widen(std::string const &value)
{
    if (value.empty())
        return {};
    int len = MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, nullptr, 0);
    if (len <= 0)
        return {};
    std::wstring out(len, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, out.data(), len);
    if (!out.empty() && out.back() == L'\0')
        out.pop_back();
    return out;
}

std::wstring format_rate(uint64_t bytes)
{
    constexpr uint64_t KiB = 1024;
    constexpr uint64_t MiB = 1024 * 1024;
    std::wstringstream ss;
    if (bytes >= MiB)
        ss << std::fixed << std::setprecision(1) << (bytes / static_cast<double>(MiB))
           << L" MiB/s";
    else if (bytes >= KiB)
        ss << std::fixed << std::setprecision(0) << (bytes / static_cast<double>(KiB))
           << L" KiB/s";
    else
        ss << bytes << L" B/s";
    return ss.str();
}

tt::rpc::UiPreferences load_ui_preferences()
{
    tt::rpc::UiPreferences result;
    auto root = tt::utils::data_root();
    if (root.empty())
    {
        return result;
    }
    auto state_path = root / "tinytorrent.db";
    tt::rpc::UiPreferencesStore store(state_path, true);
    if (!store.is_valid())
    {
        return result;
    }
    return store.load();
}

// --- Browser Logic (Deterministic Zero-Heuristic Activation) ---

bool request_ui_focus(TrayState &state);

void focus_or_launch_ui(TrayState &state)
{
    AllowSetForegroundWindow(ASFW_ANY);
    if (state.ui_attached.load() && request_ui_focus(state))
    {
        if (!state.token.empty())
        {
            auto focus_key = std::wstring(L"TT-FOCUS-") + widen(state.token);
            for (int attempt = 0; attempt < 10; ++attempt)
            {
                struct SearchContext
                {
                    std::wstring key;
                    HWND found = nullptr;
                };
                SearchContext ctx{ focus_key, nullptr };

                EnumWindows([](HWND hwnd, LPARAM lp) -> BOOL {
                    auto* pCtx = reinterpret_cast<SearchContext*>(lp);
                    wchar_t title[512];
                    if (GetWindowTextW(hwnd, title, 512) > 0)
                    {
                        if (wcsstr(title, pCtx->key.c_str()) != nullptr)
                        {
                            pCtx->found = hwnd;
                            return FALSE;
                        }
                    }
                    return TRUE;
                },
                reinterpret_cast<LPARAM>(&ctx));

                if (ctx.found)
                {
                    if (IsIconic(ctx.found))
                    {
                        ShowWindow(ctx.found, SW_RESTORE);
                    }
                    SetForegroundWindow(ctx.found);
                    return;
                }
                Sleep(50);
            }
        }
        state.ui_attached.store(false);
    }

    if (!state.open_url.empty())
    {
        ShellExecuteW(nullptr, L"open", state.open_url.c_str(), nullptr, nullptr,
                      SW_SHOWNORMAL);
    }
}

// --- Splash Window ---

void apply_rounded_corners(HWND hwnd)
{
    const DWM_WINDOW_CORNER_PREFERENCE pref = DWMWCP_ROUND;
    DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &pref,
                          sizeof(pref));
}

void enable_acrylic(HWND hwnd)
{
    HMODULE hUser32 = GetModuleHandleW(L"user32.dll");
    auto fn = (SetWindowCompositionAttributeFn)GetProcAddress(
        hUser32, "SetWindowCompositionAttribute");
    if (!fn)
        return;
    ACCENT_POLICY policy{ACCENT_ENABLE_BLURBEHIND, 0, 0xCCFFFFFF, 0};
    WINDOWCOMPOSITIONATTRIBDATA data{19, &policy, sizeof(policy)};
    fn(hwnd, &data);
}

LRESULT CALLBACK SplashProc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam)
{
    switch (msg)
    {
    case WM_PAINT:
    {
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint(hwnd, &ps);
        HICON icon = (HICON)GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        RECT rc;
        GetClientRect(hwnd, &rc);
        UINT dpi = GetDpiForWindow(hwnd);
        int size = MulDiv(256, dpi, 96);
        if (icon)
        {
            DrawIconEx(hdc, (rc.right - size) / 2, (rc.bottom - size) / 2, icon,
                       size, size, 0, NULL, DI_NORMAL);
        }
        if (!g_splash_message.empty())
        {
            RECT text_rc = rc;
            int text_top = std::max(rc.top + size + 12, rc.bottom - 64);
            if (text_top < rc.bottom - 12)
            {
                text_rc.top = text_top;
                text_rc.bottom = rc.bottom - 12;
                SetTextColor(hdc, GetSysColor(COLOR_WINDOWTEXT));
                SetBkMode(hdc, TRANSPARENT);
                DrawTextW(hdc, g_splash_message.c_str(), -1, &text_rc,
                          DT_CENTER | DT_WORDBREAK | DT_END_ELLIPSIS);
            }
        }
        EndPaint(hwnd, &ps);
        return 0;
    }
    case WM_NCHITTEST:
        return HTCAPTION;
    case WM_DESTROY:
        g_splash_hwnd.store(nullptr);
        return 0;
    default:
        return DefWindowProcW(hwnd, msg, wparam, lparam);
    }
}

void create_splash_window(HINSTANCE instance, HICON icon,
                          std::wstring const &message)
{
    if (g_splash_hwnd.load())
        return;

    g_splash_message = message;

    WNDCLASSEXW wc{sizeof(wc)};
    wc.lpfnWndProc = SplashProc;
    wc.hInstance = instance;
    wc.lpszClassName = L"TinyTorrentSplash";
    // Fixed: Explicitly use MAKEINTRESOURCEW(32512) for IDC_ARROW to avoid
    // LPSTR/LPCWSTR mismatch
    wc.hCursor = LoadCursorW(nullptr, (LPCWSTR)MAKEINTRESOURCE(32512));

    if (!GetClassInfoExW(instance, wc.lpszClassName, &wc))
    {
        RegisterClassExW(&wc);
    }

    int width = 320, height = 320;
    int x = (GetSystemMetrics(SM_CXSCREEN) - width) / 2;
    int y = (GetSystemMetrics(SM_CYSCREEN) - height) / 2;

    HWND hwnd =
        CreateWindowExW(WS_EX_APPWINDOW, wc.lpszClassName, L"TinyTorrent",
                        WS_POPUP | WS_VISIBLE, x, y, width, height, nullptr,
                        nullptr, instance, nullptr);
    if (hwnd)
    {
        SetWindowLongPtrW(hwnd, GWLP_USERDATA,
                          reinterpret_cast<LONG_PTR>(icon));
        apply_rounded_corners(hwnd);
        enable_acrylic(hwnd);
        g_splash_hwnd.store(hwnd);
    }
}

// --- RPC Handlers ---

bool ensure_http_handles(TrayState &state)
{
    if (state.port == 0)
        return false;
    if (state.http_session && state.http_connect)
        return true;

    state.http_session =
        WinHttpOpen(L"TinyTorrentTray/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                    NULL, NULL, 0);
    if (!state.http_session)
        return false;

    state.http_connect =
        WinHttpConnect(state.http_session, kRpcHost, state.port, 0);
    return state.http_connect != nullptr;
}

std::string http_post_rpc(TrayState &state, std::string const &payload)
{
    std::lock_guard<std::mutex> guard(state.http_mutex);
    if (!ensure_http_handles(state))
        return {};

    HINTERNET hRequest =
        WinHttpOpenRequest(state.http_connect, L"POST", kRpcEndpoint, nullptr,
                           nullptr, nullptr, WINHTTP_FLAG_BYPASS_PROXY_CACHE);
    if (!hRequest)
        return {};

    std::wstring headers = L"Content-Type: application/json\r\nX-TT-Auth: " +
                           widen(state.token) + L"\r\n";
    std::string result;

    // Fixed: Passed -1 for header length (null-terminated)
    if (WinHttpSendRequest(hRequest, headers.c_str(), (DWORD)-1,
                           (LPVOID)payload.data(), (DWORD)payload.size(),
                           (DWORD)payload.size(), 0))
    {
        if (WinHttpReceiveResponse(hRequest, nullptr))
        {
            DWORD dwSize = 0;
            do
            {
                if (!WinHttpQueryDataAvailable(hRequest, &dwSize) ||
                    dwSize == 0)
                    break;
                std::string buffer;
                buffer.resize(dwSize);
                DWORD dwRead = 0;
                if (WinHttpReadData(hRequest, buffer.data(), dwSize, &dwRead))
                    result.append(buffer.data(), dwRead);
            } while (dwSize > 0);
        }
    }
    WinHttpCloseHandle(hRequest);
    return result;
}

bool rpc_response_success(std::string const &body)
{
    if (body.empty())
        return false;
    yyjson_doc *doc = yyjson_read(body.c_str(), body.size(), 0);
    if (!doc)
        return false;
    bool success = false;
    if (auto *root = yyjson_doc_get_root(doc); root && yyjson_is_obj(root))
    {
        if (auto *result = yyjson_obj_get(root, "result"); result &&
            yyjson_is_str(result))
        {
            success = std::string_view(yyjson_get_str(result)) ==
                      std::string_view("success");
        }
    }
    yyjson_doc_free(doc);
    return success;
}

bool request_ui_focus(TrayState &state)
{
    auto body = http_post_rpc(state, R"({"method":"session-ui-focus"})");
    if (body.empty() || !rpc_response_success(body))
    {
        http_post_rpc(state, R"({"method":"session-ui-detach"})");
        state.ui_attached.store(false);
        return false;
    }
    return true;
}

tt::rpc::UiPreferences parse_tray_ui_preferences(yyjson_val *arguments)
{
    tt::rpc::UiPreferences result;
    if (arguments == nullptr)
    {
        return result;
    }
    auto *ui_root = yyjson_obj_get(arguments, "ui");
    if (ui_root == nullptr || !yyjson_is_obj(ui_root))
    {
        return result;
    }
    if (auto *value = yyjson_obj_get(ui_root, "autoOpen"); value &&
        yyjson_is_bool(value))
    {
        result.auto_open_ui = yyjson_get_bool(value);
    }
    if (auto *value = yyjson_obj_get(ui_root, "autorunHidden"); value &&
        yyjson_is_bool(value))
    {
        result.hide_ui_when_autorun = yyjson_get_bool(value);
    }
    if (auto *value = yyjson_obj_get(ui_root, "showSplash"); value &&
        yyjson_is_bool(value))
    {
        result.show_splash = yyjson_get_bool(value);
    }
    if (auto *value = yyjson_obj_get(ui_root, "splashMessage");
        value && yyjson_is_str(value))
    {
        result.splash_message = yyjson_get_str(value);
    }
    return result;
}

TrayStatus rpc_get_tray_status(TrayState &state)
{
    TrayStatus s;
    s.rpc_success = false;
    auto body = http_post_rpc(state, R"({"method":"session-tray-status"})");
    if (body.empty())
        return s;

    yyjson_doc *doc = yyjson_read(body.c_str(), body.size(), 0);
    if (doc)
    {
        s.rpc_success = true;
        yyjson_val *args =
            yyjson_obj_get(yyjson_doc_get_root(doc), "arguments");
        if (args)
        {
            // Hardened: Check key existence before extraction
            yyjson_val *v;
            if ((v = yyjson_obj_get(args, "downloadSpeed")))
                s.down = yyjson_get_uint(v);
            if ((v = yyjson_obj_get(args, "uploadSpeed")))
                s.up = yyjson_get_uint(v);
            if ((v = yyjson_obj_get(args, "activeTorrentCount")))
                s.active = (size_t)yyjson_get_uint(v);
            if ((v = yyjson_obj_get(args, "seedingCount")))
                s.seeding = (size_t)yyjson_get_uint(v);
            if ((v = yyjson_obj_get(args, "allPaused")))
                s.all_paused = yyjson_get_bool(v);
            if ((v = yyjson_obj_get(args, "uiAttached")))
                s.ui_attached = yyjson_get_bool(v);
            if ((v = yyjson_obj_get(args, "downloadDir")))
                s.download_dir = yyjson_get_str(v);
            if ((v = yyjson_obj_get(args, "errorMessage")))
                s.error_message = yyjson_get_str(v);
            s.ui_preferences = parse_tray_ui_preferences(args);
        }
        yyjson_doc_free(doc);
    }
    return s;
}

// --- Main Window Proc ---

LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam)
{
    auto *state =
        reinterpret_cast<TrayState *>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    switch (msg)
    {
    case kTrayCallbackMessage:
        if (lparam == WM_RBUTTONUP)
        {
            POINT pt;
            GetCursorPos(&pt);
            SetForegroundWindow(hwnd);
            TrackPopupMenu(state->menu, TPM_RIGHTBUTTON | TPM_BOTTOMALIGN, pt.x,
                           pt.y, 0, hwnd, nullptr);
        }
        else if (lparam == WM_LBUTTONDBLCLK)
        {
            focus_or_launch_ui(*state);
        }
        return 0;

    case kStatusUpdateMessage:
    {
        auto *s = reinterpret_cast<TrayStatus *>(wparam);
        if (!s || !state)
            return 0;

        if (s->rpc_success)
        {
            state->ui_preferences = s->ui_preferences;
            std::wstring next_message =
                widen(state->ui_preferences.splash_message);
            if (next_message != state->splash_message)
            {
                state->splash_message = next_message;
                auto splash = g_splash_hwnd.load();
                if (splash)
                {
                    g_splash_message = next_message;
                    InvalidateRect(splash, nullptr, TRUE);
                }
            }
            state->ui_attached.store(s->ui_attached);
            if (!state->start_hidden)
            {
                state->auto_open_requested = state->ui_preferences.auto_open_ui;
            }
        }
        else
        {
            state->ui_attached.store(false);
        }

        // Policy: Close splash and/or auto-open UI when backend signals ready
        // or 15s watchdog hits
        bool watchdog_expired =
            std::chrono::steady_clock::now() - g_app_start_time >
            std::chrono::seconds(15);
        bool handshake_ready = s->ui_attached || watchdog_expired;
        if (handshake_ready && !state->handshake_completed.exchange(true))
        {
            HWND splash = g_splash_hwnd.exchange(nullptr);
            if (splash)
                DestroyWindow(splash);

            // If the watchdog expired, we still try to open browser to avoid a
            // dead-end
            if (state->auto_open_requested)
            {
                focus_or_launch_ui(*state);
            }
        }

        // Update Menu & Tooltip
        state->paused_all.store(s->all_paused);
        std::wstring status_line = L"● " + std::to_wstring(s->active) +
                                   L"   ↓ " + format_rate(s->down) + L"   ↑ " +
                                   format_rate(s->up);

        MENUITEMINFOW mii{sizeof(mii), MIIM_STRING};
        mii.dwTypeData = const_cast<wchar_t *>(status_line.c_str());
        SetMenuItemInfoW(state->menu, ID_STATUS_ACTIVE, FALSE, &mii);

        mii.dwTypeData =
            const_cast<wchar_t *>(s->all_paused ? L"Resume" : L"Pause");
        SetMenuItemInfoW(state->menu, ID_PAUSE_RESUME, FALSE, &mii);

        std::wostringstream tip;
        tip << L"TinyTorrent\n↓ " << format_rate(s->down) << L"  ↑ "
            << format_rate(s->up) << L"\n"
            << s->active << L" active • " << s->seeding << L" seeding";
        wcsncpy_s(state->nid.szTip, tip.str().c_str(), _TRUNCATE);
        Shell_NotifyIconW(NIM_MODIFY, &state->nid);

        {
            std::lock_guard<std::mutex> l(state->download_dir_mutex);
            state->download_dir_cache = s->download_dir;
        }
        delete s;
        return 0;
    }

    case WM_COMMAND:
        if (!state)
            return 0;
        switch (LOWORD(wparam))
        {
        case ID_SHOW_SPLASH:
            create_splash_window(state->hInstance, state->large_icon,
                                 state->splash_message);
            break;
        case ID_OPEN_UI:
            focus_or_launch_ui(*state);
            break;
        case ID_PAUSE_RESUME:
        {
            bool target = !state->paused_all.load();
            http_post_rpc(*state, target
                                      ? "{\"method\":\"session-pause-all\"}"
                                      : "{\"method\":\"session-resume-all\"}");
        }
        break;
        case ID_OPEN_DOWNLOADS:
        {
            std::wstring path;
            {
                std::lock_guard<std::mutex> l(state->download_dir_mutex);
                path = widen(state->download_dir_cache);
            }
            if (!path.empty())
                ShellExecuteW(nullptr, L"open", path.c_str(), nullptr, nullptr,
                              SW_SHOWNORMAL);
        }
        break;
        case ID_EXIT:
            tt::runtime::request_shutdown();
            DestroyWindow(hwnd);
            break;
        }
        return 0;

    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    default:
        return DefWindowProcW(hwnd, msg, wparam, lparam);
    }
}

} // namespace

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE, PWSTR, int)
{
    // Single instance mutex
    HANDLE hMutex =
        CreateMutexW(nullptr, TRUE, L"TinyTorrent_SingleInstance_Mutex");
    if (GetLastError() == ERROR_ALREADY_EXISTS)
    {
        HWND ex = FindWindowW(L"TinyTorrentTrayWindow", nullptr);
        if (ex)
            PostMessageW(ex, kTrayCallbackMessage, 0, WM_LBUTTONDBLCLK);
        if (hMutex)
            CloseHandle(hMutex);
        return 0;
    }

    HICON icon_large =
        (HICON)LoadImageW(hInstance, MAKEINTRESOURCEW(IDI_TINYTORRENT),
                          IMAGE_ICON, 256, 256, LR_DEFAULTCOLOR);
    HICON icon_small =
        (HICON)LoadImageW(hInstance, MAKEINTRESOURCEW(IDI_TINYTORRENT),
                          IMAGE_ICON, GetSystemMetrics(SM_CXSMICON),
                          GetSystemMetrics(SM_CYSMICON), LR_DEFAULTCOLOR);

    bool start_hidden = wcsstr(GetCommandLineW(), kStartHiddenArg) != nullptr;

    auto startup_ui_prefs = load_ui_preferences();
    std::wstring startup_splash_message =
        widen(startup_ui_prefs.splash_message);

    WNDCLASSEXW wc{sizeof(wc),
                   0,
                   WndProc,
                   0,
                   0,
                   hInstance,
                   icon_small,
                   nullptr,
                   nullptr,
                   nullptr,
                   L"TinyTorrentTrayWindow",
                   icon_small};
    RegisterClassExW(&wc);

    auto state = std::make_unique<TrayState>();
    state->hInstance = hInstance;
    state->icon = icon_small;
    state->large_icon = icon_large;
    state->start_hidden = start_hidden;
    state->ui_preferences = startup_ui_prefs;
    state->splash_message = startup_splash_message;
    state->auto_open_requested =
        !start_hidden && state->ui_preferences.auto_open_ui;
    state->hwnd =
        CreateWindowExW(0, wc.lpszClassName, L"TinyTorrent", 0, 0, 0, 0, 0,
                        HWND_MESSAGE, nullptr, hInstance, nullptr);
    SetWindowLongPtrW(state->hwnd, GWLP_USERDATA, (LONG_PTR)state.get());

    if (!start_hidden && startup_ui_prefs.show_splash)
        create_splash_window(hInstance, icon_large, startup_splash_message);

    std::promise<tt::rpc::ConnectionInfo> ready_p;
    auto ready_f = ready_p.get_future();
    std::thread daemon(
        [&]()
        {
            char *argv[] = {(char *)"TinyTorrent"};
            tt::app::daemon_main(1, argv, &ready_p);
        });

    // Pumping messages while waiting for daemon connection info
    while (ready_f.wait_for(std::chrono::milliseconds(10)) !=
           std::future_status::ready)
    {
        MSG msg;
        while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE))
        {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
    auto info = ready_f.get();

    state->port = (unsigned short)info.port;
    state->token = info.token;
    state->open_url = L"http://127.0.0.1:" + std::to_wstring(info.port) +
                      L"/index.html?token=" + widen(info.token);

    state->menu = CreatePopupMenu();
    AppendMenuW(state->menu, MF_STRING, ID_SHOW_SPLASH, L"TinyTorrent");
    AppendMenuW(state->menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(state->menu, MF_STRING, ID_OPEN_UI, L"Open UI");
    AppendMenuW(state->menu, MF_STRING, ID_OPEN_DOWNLOADS, L"Open Downloads");
    AppendMenuW(state->menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(state->menu, MF_STRING, ID_PAUSE_RESUME, L"Pause");
    AppendMenuW(state->menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(state->menu, MF_STRING | MF_DISABLED, ID_STATUS_ACTIVE,
                L"● 0   ↓ 0   ↑ 0");
    AppendMenuW(state->menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(state->menu, MF_STRING, ID_EXIT, L"Exit");

    state->nid.cbSize = sizeof(state->nid);
    state->nid.hWnd = state->hwnd;
    state->nid.uID = 1;
    state->nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    state->nid.hIcon = icon_small;
    state->nid.uCallbackMessage = kTrayCallbackMessage;
    wcsncpy_s(state->nid.szTip, L"TinyTorrent starting...", _TRUNCATE);
    Shell_NotifyIconW(NIM_ADD, &state->nid);

    state->status_thread = std::thread(
        [s_ptr = state.get()]()
        {
            while (s_ptr->running)
            {
                TrayStatus s = rpc_get_tray_status(*s_ptr);
                if (!s_ptr->running)
                    break;
                PostMessageW(s_ptr->hwnd, kStatusUpdateMessage,
                             (WPARAM) new TrayStatus(s), 0);
                std::this_thread::sleep_for(std::chrono::seconds(1));
            }
        });

    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0))
    {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    // Shutdown Procedure
    state->running = false;
    if (state->status_thread.joinable())
        state->status_thread.join();

    Shell_NotifyIconW(NIM_DELETE, &state->nid);
    tt::runtime::request_shutdown();
    if (daemon.joinable())
        daemon.join();

    if (state->http_connect)
        WinHttpCloseHandle(state->http_connect);
    if (state->http_session)
        WinHttpCloseHandle(state->http_session);
    if (icon_small)
        DestroyIcon(icon_small);
    if (icon_large)
        DestroyIcon(icon_large);
    if (hMutex)
        CloseHandle(hMutex);

    return 0;
}
#endif
