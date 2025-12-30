#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <Windows.h>
#include <windowsx.h>
#include <dwmapi.h>
#include <psapi.h>
#include <shellapi.h>
#include <shlobj_core.h>
#include <winhttp.h>
#pragma comment(lib, "ole32.lib")
#include <wrl/client.h>
#include <wrl/event.h>
#include <webview2.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cstddef>
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
#include <filesystem>
#include <system_error>

#include <yyjson.h>

#include "app/DaemonMain.hpp"
#include "rpc/Server.hpp"
#include "rpc/UiPreferences.hpp"
#include "tt_packed_fs_resource.h"
#include "utils/FS.hpp"
#include "utils/Log.hpp"
#include "utils/Shutdown.hpp"

#pragma comment(lib, "Dwmapi.lib")
#pragma comment(lib, "Winhttp.lib")
#pragma comment(lib, "Psapi.lib")

#ifndef DWMWA_WINDOW_CORNER_PREFERENCE
#define DWMWA_WINDOW_CORNER_PREFERENCE 33
#endif
#ifndef DWMWA_USE_IMMERSIVE_DARK_MODE
#define DWMWA_USE_IMMERSIVE_DARK_MODE 20
#endif
#ifndef DWMWA_CAPTION_COLOR
#define DWMWA_CAPTION_COLOR 35
#endif
#ifndef DWMWA_TEXT_COLOR
#define DWMWA_TEXT_COLOR 36
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
constexpr UINT_PTR kSplashAutoCloseTimerId = 1;

static std::atomic<HWND> g_splash_hwnd{nullptr};
static std::wstring g_splash_message;
static auto g_app_start_time = std::chrono::steady_clock::now();
constexpr wchar_t kWebView2InstallUrl[] =
    L"https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section";

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
    std::wstring webview_user_data_dir;

    HWND webview_window = nullptr;
    Microsoft::WRL::ComPtr<ICoreWebView2Controller> webview_controller;
    Microsoft::WRL::ComPtr<ICoreWebView2> webview;
    EventRegistrationToken web_message_token{};
    EventRegistrationToken navigation_token{};

    HINTERNET http_session = nullptr;
    HINTERNET http_connect = nullptr;
    std::mutex http_mutex;

    std::thread status_thread{};
    std::string download_dir_cache;
    std::mutex download_dir_mutex;

    bool auto_open_requested = false;
    std::atomic_bool handshake_completed{false};
    std::atomic_bool user_closed_ui{false};
    std::atomic_bool shutting_down{false};
    std::string last_error_message;
    bool start_hidden = false;
    std::wstring splash_message;
    tt::rpc::UiPreferences ui_preferences;
    std::atomic_bool ui_attached{false};
};

bool is_webview2_runtime_available()
{
    PWSTR version = nullptr;
    HRESULT hr =
        GetAvailableCoreWebView2BrowserVersionString(nullptr, &version);
    if (SUCCEEDED(hr) && version)
    {
        CoTaskMemFree(version);
        return true;
    }
    return SUCCEEDED(hr);
}

void prompt_webview2_install()
{
    constexpr wchar_t kTitle[] = L"Microsoft WebView2 required";
    constexpr wchar_t kMessage[] =
        L"TinyTorrent requires the Microsoft WebView2 Runtime. Install now?";
    int result = MessageBoxW(nullptr, kMessage, kTitle,
                             MB_ICONEXCLAMATION | MB_YESNO | MB_DEFBUTTON1);
    if (result == IDYES)
    {
        ShellExecuteW(nullptr, L"open", kWebView2InstallUrl, nullptr, nullptr,
                      SW_SHOWNORMAL);
    }
}

constexpr wchar_t kWebViewWindowClassName[] = L"TinyTorrentWebViewWindow";
static HINSTANCE g_app_instance = nullptr;

LRESULT CALLBACK WebViewWindowProc(HWND hwnd, UINT msg, WPARAM wparam,
                                   LPARAM lparam);

bool register_webview_window_class(HINSTANCE instance);
bool ensure_native_webview(TrayState &state);
void show_native_window(TrayState &state);
void reload_native_auth_token(TrayState &state);
void handle_webview_json_message(TrayState &state, std::string const &payload);
std::wstring compute_webview_user_data_dir();
void cancel_native_webview(TrayState &state);
std::string http_post_rpc(TrayState &state, std::string const &payload);

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

std::string narrow(std::wstring const &value)
{
    if (value.empty())
        return {};
    int len = WideCharToMultiByte(CP_UTF8, 0, value.c_str(), -1, nullptr, 0,
                                  nullptr, nullptr);
    if (len <= 0)
        return {};
    std::string out(len, '\0');
    WideCharToMultiByte(CP_UTF8, 0, value.c_str(), -1, out.data(), len,
                        nullptr, nullptr);
    if (!out.empty() && out.back() == '\0')
        out.pop_back();
    return out;
}

void post_webview_message(TrayState &state, std::wstring const &message)
{
    if (!state.webview)
    {
        return;
    }
    state.webview->PostWebMessageAsJson(message.c_str());
}

void apply_dark_titlebar(HWND hwnd)
{
    if (!hwnd)
    {
        return;
    }
    BOOL dark = TRUE;
    DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &dark,
                          sizeof(dark));
    COLORREF caption_color = 0x101010;
    DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, &caption_color,
                          sizeof(caption_color));
    COLORREF text_color = 0xFFFFFF;
    DwmSetWindowAttribute(hwnd, DWMWA_TEXT_COLOR, &text_color,
                          sizeof(text_color));
}

void extend_client_frame(HWND hwnd)
{
    if (!hwnd)
    {
        return;
    }
    MARGINS margins{1, 0, 0, 0};
    DwmExtendFrameIntoClientArea(hwnd, &margins);
}

void configure_webview_window_chrome(HWND hwnd)
{
    if (!hwnd)
    {
        return;
    }
    apply_dark_titlebar(hwnd);
    extend_client_frame(hwnd);
}

std::wstring build_host_response(std::string const &id, bool success,
                                std::string const &error = {})
{
    std::string response = "{\"type\":\"response\",\"id\":\"" + id +
                           "\",\"success\":" + (success ? "true" : "false");
    if (!success && !error.empty())
    {
        response += ",\"error\":\"" + error + "\"";
    }
    response += "}";
    return widen(response);
}

bool perform_window_command(TrayState &state, std::string const &command)
{
    if (!state.webview_window || state.shutting_down.load())
    {
        return false;
    }
    if (command == "close")
    {
        PostMessageW(state.webview_window, WM_CLOSE, 0, 0);
        return true;
    }
    if (command == "minimize")
    {
        ShowWindow(state.webview_window, SW_MINIMIZE);
        return true;
    }
    if (command == "maximize")
    {
        if (IsZoomed(state.webview_window))
        {
            ShowWindow(state.webview_window, SW_RESTORE);
        }
        else
        {
            ShowWindow(state.webview_window, SW_MAXIMIZE);
        }
        return true;
    }
    return false;
}

void cancel_native_webview(TrayState &state)
{
    if (state.webview_controller)
    {
        state.webview_controller->Close();
        state.webview_controller.Reset();
    }
    if (state.webview)
    {
        state.webview.Reset();
    }
    if (state.webview_window)
    {
        DestroyWindow(state.webview_window);
        state.webview_window = nullptr;
    }
}

std::wstring compute_webview_user_data_dir()
{
    if (auto base = tt::utils::tiny_torrent_appdata_root())
    {
        auto path = *base;
        path /= L"WebView2";
        std::error_code ec;
        std::filesystem::create_directories(path, ec);
        if (!ec || std::filesystem::exists(path))
        {
            return path.wstring();
        }
    }
    return {};
}

void handle_webview_json_message(TrayState &state, std::string const &payload)
{
    if (payload.empty())
    {
        return;
    }
    yyjson_doc *doc = yyjson_read(payload.c_str(), payload.size(), 0);
    if (!doc)
    {
        return;
    }
    yyjson_val *root = yyjson_doc_get_root(doc);
    if (!root || !yyjson_is_obj(root))
    {
        yyjson_doc_free(doc);
        return;
    }
    auto *type = yyjson_obj_get(root, "type");
    auto *id = yyjson_obj_get(root, "id");
    auto *name = yyjson_obj_get(root, "name");
    if (!type || !yyjson_is_str(type) ||
        std::string_view(yyjson_get_str(type)) != "request" || !id ||
        !yyjson_is_str(id) || !name || !yyjson_is_str(name))
    {
        yyjson_doc_free(doc);
        return;
    }
    std::string id_value{yyjson_get_str(id)};
    std::string name_value{yyjson_get_str(name)};
    bool handled = false;
    if (name_value == "window-command")
    {
        yyjson_val *payload_val = yyjson_obj_get(root, "payload");
        if (payload_val && yyjson_is_obj(payload_val))
        {
            yyjson_val *command_val = yyjson_obj_get(payload_val, "command");
            if (command_val && yyjson_is_str(command_val))
            {
                handled =
                    perform_window_command(state, yyjson_get_str(command_val));
            }
        }
    }
    post_webview_message(
        state,
        build_host_response(
            id_value, handled,
            handled ? std::string() : "native host request unhandled"));
    yyjson_doc_free(doc);
}

void apply_webview_window_icons(TrayState &state)
{
    if (!state.webview_window)
    {
        return;
    }
    if (state.large_icon)
    {
        SendMessageW(state.webview_window, WM_SETICON, ICON_BIG,
                     reinterpret_cast<LPARAM>(state.large_icon));
    }
    if (state.icon)
    {
        SendMessageW(state.webview_window, WM_SETICON, ICON_SMALL,
                     reinterpret_cast<LPARAM>(state.icon));
    }
}

void close_splash_window()
{
    HWND splash = g_splash_hwnd.exchange(nullptr);
    if (splash)
    {
        DestroyWindow(splash);
    }
}

std::wstring escape_js_string(std::wstring const &value)
{
    std::wstring result;
    result.reserve(value.size());
    for (wchar_t ch : value)
    {
        switch (ch)
        {
        case L'\\':
            result += L"\\\\";
            break;
        case L'"':
            result += L"\\\"";
            break;
        case L'\n':
            result += L"\\n";
            break;
        case L'\r':
            result += L"\\r";
            break;
        default:
            result += ch;
            break;
        }
    }
    return result;
}

std::wstring build_native_bridge_script(TrayState &state)
{
    std::wstring token = escape_js_string(widen(state.token));
    std::wstring host = escape_js_string(kRpcHost);
    std::wstring port = state.port ? std::to_wstring(state.port) : L"0";
    constexpr wchar_t scheme[] = L"http";
    std::wstring script = L"window.__TINY_TORRENT_NATIVE__ = true;";
    script += L"window.__TINY_TORRENT_NATIVE_INFO__ = {";
    script += L"token: \"" + token + L"\", ";
    script += L"host: \"" + host + L"\", ";
    script += L"port: \"" + port + L"\", ";
    script += L"scheme: \"" + std::wstring(scheme) + L"\"";
    script += L"};";
    return script;
}

LRESULT CALLBACK WebViewWindowProc(HWND hwnd, UINT msg, WPARAM wparam,
                                   LPARAM lparam)
{
    auto *state =
        reinterpret_cast<TrayState *>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    switch (msg)
    {
    case WM_SIZE:
        if (state && state->webview_controller)
        {
            RECT bounds;
            GetClientRect(hwnd, &bounds);
            state->webview_controller->put_Bounds(bounds);
        }
        return 0;
    case WM_NCCALCSIZE:
        if (wparam)
        {
            return 0;
        }
        break;
    case WM_NCHITTEST:
    {
        if (IsZoomed(hwnd))
        {
            return HTCLIENT;
        }
        POINT pt{GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
        ScreenToClient(hwnd, &pt);
        RECT rc;
        GetClientRect(hwnd, &rc);
        UINT dpi = GetDpiForWindow(hwnd);
        int border_x =
            GetSystemMetricsForDpi(SM_CXSIZEFRAME, dpi) +
            GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi);
        int border_y =
            GetSystemMetricsForDpi(SM_CYSIZEFRAME, dpi) +
            GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi);
        const bool left = pt.x >= rc.left && pt.x < rc.left + border_x;
        const bool right = pt.x < rc.right && pt.x >= rc.right - border_x;
        const bool top = pt.y >= rc.top && pt.y < rc.top + border_y;
        const bool bottom = pt.y < rc.bottom && pt.y >= rc.bottom - border_y;
        if (top && left)
        {
            return HTTOPLEFT;
        }
        if (top && right)
        {
            return HTTOPRIGHT;
        }
        if (bottom && left)
        {
            return HTBOTTOMLEFT;
        }
        if (bottom && right)
        {
            return HTBOTTOMRIGHT;
        }
        if (left)
        {
            return HTLEFT;
        }
        if (right)
        {
            return HTRIGHT;
        }
        if (top)
        {
            return HTTOP;
        }
        if (bottom)
        {
            return HTBOTTOM;
        }
        return HTCLIENT;
    }
    case WM_GETMINMAXINFO:
    {
        auto *mmi = reinterpret_cast<MINMAXINFO *>(lparam);
        if (!mmi)
        {
            return 0;
        }
        HMONITOR monitor =
            MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        MONITORINFO mi{};
        mi.cbSize = sizeof(mi);
        if (GetMonitorInfoW(monitor, &mi))
        {
            RECT work = mi.rcWork;
            RECT monitor_rect = mi.rcMonitor;
            mmi->ptMaxPosition.x = work.left - monitor_rect.left;
            mmi->ptMaxPosition.y = work.top - monitor_rect.top;
            mmi->ptMaxSize.x = work.right - work.left;
            mmi->ptMaxSize.y = work.bottom - work.top;
        }
        return 0;
    }
    case WM_DPICHANGED:
        if (state && state->webview_controller)
        {
            auto *newRect = reinterpret_cast<RECT *>(lparam);
            if (newRect)
            {
                SetWindowPos(hwnd, nullptr, newRect->left, newRect->top,
                             newRect->right - newRect->left,
                             newRect->bottom - newRect->top,
                             SWP_NOZORDER | SWP_NOACTIVATE);
                RECT bounds;
                GetClientRect(hwnd, &bounds);
                state->webview_controller->put_Bounds(bounds);
            }
        }
        return 0;
    case WM_CLOSE:
        if (state)
        {
            state->user_closed_ui.store(true);
            state->ui_attached.store(false);
            http_post_rpc(*state, R"({"method":"session-ui-detach"})");
            if (state->webview_window)
            {
                ShowWindow(state->webview_window, SW_HIDE);
            }
        }
        return 0;
    }
    return DefWindowProcW(hwnd, msg, wparam, lparam);
}

bool register_webview_window_class(HINSTANCE instance)
{
    static bool registered = false;
    if (registered)
    {
        return true;
    }
    WNDCLASSEXW wc{sizeof(wc)};
    wc.lpfnWndProc = WebViewWindowProc;
    wc.hInstance = instance;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
    wc.lpszClassName = kWebViewWindowClassName;
    wc.style = CS_HREDRAW | CS_VREDRAW;
    if (!RegisterClassExW(&wc))
    {
        return false;
    }
    registered = true;
    return true;
}

void reload_native_auth_token(TrayState &state)
{
    if (state.token.empty() || !state.webview)
    {
        return;
    }
    std::wstring host = kRpcHost;
    std::wstring port = state.port ? std::to_wstring(state.port) : L"0";
    std::wstring scheme = L"http";
    std::wstring message =
        L"{\"type\":\"event\",\"name\":\"auth-token\",\"payload\":{\"token\":\"" +
        widen(state.token) + L"\",\"host\":\"" + host + L"\",\"port\":\"" + port +
        L"\",\"scheme\":\"" + scheme + L"\"}}";
    post_webview_message(state, message);
}

bool ensure_native_webview(TrayState &state)
{
    if (state.open_url.empty())
    {
        return false;
    }
    if (!state.webview_window)
    {
        if (!register_webview_window_class(g_app_instance))
        {
            return false;
        }
        constexpr DWORD kWebViewWindowStyle =
            WS_POPUP | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX |
            WS_SYSMENU;
        state.webview_window = CreateWindowExW(
            0, kWebViewWindowClassName, L"TinyTorrent", kWebViewWindowStyle,
            CW_USEDEFAULT, CW_USEDEFAULT, 1280, 768, nullptr, nullptr,
            g_app_instance, nullptr);
        if (!state.webview_window)
        {
            return false;
        }
        SetWindowLongPtrW(state.webview_window, GWLP_USERDATA,
                          reinterpret_cast<LONG_PTR>(&state));
        apply_webview_window_icons(state);
        configure_webview_window_chrome(state.webview_window);
        ShowWindow(state.webview_window, SW_HIDE);
    }
    if (state.webview_controller)
    {
        return true;
    }
    if (state.webview_user_data_dir.empty())
    {
        state.webview_user_data_dir = compute_webview_user_data_dir();
        if (state.webview_user_data_dir.empty())
        {
            return false;
        }
    }
    HRESULT hr = CreateCoreWebView2EnvironmentWithOptions(
        nullptr, state.webview_user_data_dir.c_str(), nullptr,
        Microsoft::WRL::Callback<
            ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [&state](HRESULT res, ICoreWebView2Environment *env) -> HRESULT {
                if (state.shutting_down.load())
                {
                    return E_ABORT;
                }
                if (FAILED(res) || !env || !state.webview_window)
                {
                    return res;
                }
                return env->CreateCoreWebView2Controller(
                    state.webview_window,
                    Microsoft::WRL::Callback<
                        ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                        [&state](HRESULT ctrl_res, ICoreWebView2Controller *controller)
                            -> HRESULT {
                            if (state.shutting_down.load())
                            {
                                return E_ABORT;
                            }
                            if (FAILED(ctrl_res) || !controller)
                            {
                                return ctrl_res;
                            }
                            state.webview_controller = controller;
                            controller->get_CoreWebView2(&state.webview);
                            RECT bounds;
                            GetClientRect(state.webview_window, &bounds);
                            state.webview_controller->put_Bounds(bounds);
                            state.webview_controller->put_IsVisible(TRUE);
                            auto script = build_native_bridge_script(state);
                            state.webview->AddScriptToExecuteOnDocumentCreated(
                                script.c_str(), nullptr);
                            state.webview->add_WebMessageReceived(
                                Microsoft::WRL::Callback<
                                    ICoreWebView2WebMessageReceivedEventHandler>(
                                    [&state](ICoreWebView2 *,
                                             ICoreWebView2WebMessageReceivedEventArgs
                                                 *args) -> HRESULT {
                                        if (state.shutting_down.load())
                                        {
                                            return S_OK;
                                        }
                                        PWSTR text = nullptr;
                                        args->get_WebMessageAsJson(&text);
                                        if (text)
                                        {
                                            std::wstring wide(text);
                                            CoTaskMemFree(text);
                                            handle_webview_json_message(state,
                                                                        narrow(wide));
                                        }
                                        return S_OK;
                                    }).Get(),
                                &state.web_message_token);
                            state.webview->add_NavigationCompleted(
                                Microsoft::WRL::Callback<
                                    ICoreWebView2NavigationCompletedEventHandler>(
                                    [&state](ICoreWebView2 *,
                                             ICoreWebView2NavigationCompletedEventArgs
                                                 *) -> HRESULT {
                                        if (state.shutting_down.load())
                                        {
                                            return S_OK;
                                        }
                                        reload_native_auth_token(state);
                                        if (state.webview_window)
                                        {
                                            ShowWindow(state.webview_window, SW_SHOW);
                                            SetForegroundWindow(state.webview_window);
                                        }
                                        return S_OK;
                                    }).Get(),
                                &state.navigation_token);
                            state.webview->Navigate(state.open_url.c_str());
                            return S_OK;
                        }).Get());
            }).Get());
    if (FAILED(hr))
    {
        TT_LOG_INFO("WebView2 initialization failed ({:#X}); UI will remain hidden",
                    static_cast<uint32_t>(hr));
    }
    return SUCCEEDED(hr);
}

void show_native_window(TrayState &state)
{
    state.user_closed_ui.store(false);
    if (!ensure_native_webview(state))
    {
        return;
    }
    if (!state.webview_window)
    {
        return;
    }
    apply_webview_window_icons(state);
    ShowWindow(state.webview_window, SW_SHOW);
    SetForegroundWindow(state.webview_window);
    close_splash_window();
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
                    state.user_closed_ui.store(false);
                    return;
                }
                Sleep(50);
            }
        }
        state.ui_attached.store(false);
    }

    if (!state.open_url.empty())
    {
        show_native_window(state);
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
    case WM_LBUTTONDOWN:
        ReleaseCapture();
        SendMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        return 0;
    case WM_TIMER:
        if (wparam == kSplashAutoCloseTimerId)
        {
            KillTimer(hwnd, kSplashAutoCloseTimerId);
            DestroyWindow(hwnd);
        }
        return 0;
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
    case WM_DESTROY:
        KillTimer(hwnd, kSplashAutoCloseTimerId);
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
        SetTimer(hwnd, kSplashAutoCloseTimerId, 10000, nullptr);
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
            if (state->auto_open_requested &&
                !state->user_closed_ui.load())
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
        if (state)
        {
            state->shutting_down.store(true);
            cancel_native_webview(*state);
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
    g_app_instance = hInstance;
    bool com_initialized = SUCCEEDED(
        CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED));
    if (!com_initialized || !is_webview2_runtime_available())
    {
        prompt_webview2_install();
        if (com_initialized)
        {
            CoUninitialize();
        }
        return 0;
    }

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

    if (!state->start_hidden)
        show_native_window(*state);

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

    if (com_initialized)
    {
        CoUninitialize();
    }

    return 0;
}
#endif
