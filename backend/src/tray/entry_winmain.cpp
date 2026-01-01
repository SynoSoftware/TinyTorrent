#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>

#include <VersionHelpers.h>
#include <d3d11.h>
#include <dcomp.h>
#include <dwmapi.h>
#include <dxgi1_2.h>
#include <psapi.h>
#include <shellapi.h>
#include <shlobj_core.h>
#include <shobjidl.h>
#include <windowsx.h>
#include <winhttp.h>
#pragma comment(lib, "ole32.lib")
#include <webview2.h>
#include <wrl/client.h>
#include <wrl/event.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <cstdio>
#include <cwchar>
#include <filesystem>
#include <future>
#include <iomanip>
#include <memory>
#include <mutex>
#include <optional>
#include <sstream>
#include <string>
#include <string_view>
#include <system_error>
#include <thread>
#include <vector>

#include <yyjson.h>

#include "app/DaemonMain.hpp"
#include "rpc/Server.hpp"
#include "rpc/UiPreferences.hpp"
#include "tray/StringUtil.hpp"
#include "tray/TrayState.hpp"
#include "tray/input/WebViewInput.hpp"
#include "tray/ole/DropTarget.hpp"
#include "tray/rpc/RpcClient.hpp"
#include "tt_packed_fs_resource.h"
#include "utils/FS.hpp"
#include "utils/Log.hpp"
#include "utils/Shutdown.hpp"

using tt::tray::TrayState;

#pragma comment(lib, "Dwmapi.lib")
#pragma comment(lib, "Winhttp.lib")
#pragma comment(lib, "Psapi.lib")
#pragma comment(lib, "Dcomp.lib")
#pragma comment(lib, "D3d11.lib")
#pragma comment(lib, "Dxgi.lib")

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
#ifndef DWMWA_BORDER_COLOR
#define DWMWA_BORDER_COLOR 34
#endif
#ifndef DWMWA_VISIBLE_FRAME_BORDER_THICKNESS
#define DWMWA_VISIBLE_FRAME_BORDER_THICKNESS 37
#endif
#ifndef DWMWA_COLOR_NONE
#define DWMWA_COLOR_NONE 0xFFFFFFFE
#endif
#ifndef DWMWA_COLOR_DEFAULT
#define DWMWA_COLOR_DEFAULT 0xFFFFFFFF
#endif
#ifndef DWMWA_NCRENDERING_ENABLED
#define DWMWA_NCRENDERING_ENABLED 1
#endif
#ifndef DWMWA_NCRENDERING_POLICY
#define DWMWA_NCRENDERING_POLICY 2
#endif
#ifndef DWMWA_ALLOW_NCPAINT
#define DWMWA_ALLOW_NCPAINT 4
#endif
#ifndef WS_EX_NOREDIRECTIONBITMAP
#define WS_EX_NOREDIRECTIONBITMAP 0x00200000L
#endif
#ifndef DWMWA_SYSTEMBACKDROP_TYPE
#define DWMWA_SYSTEMBACKDROP_TYPE 38
#endif
#ifndef DWMSBT_AUTO
#define DWMSBT_AUTO 0
#endif
#ifndef DWMSBT_NONE
#define DWMSBT_NONE 1
#endif
#ifndef DWMSBT_MAINWINDOW
#define DWMSBT_MAINWINDOW 2
#endif
#ifndef DWMSBT_TRANSIENTWINDOW
#define DWMSBT_TRANSIENTWINDOW 3
#endif
#ifndef DWMSBT_TABBEDWINDOW
#define DWMSBT_TABBEDWINDOW 4
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
    L"https://developer.microsoft.com/en-us/microsoft-edge/webview2/"
    L"#download-section";
constexpr UINT_PTR kDiagSweepTimerId = 0xD1A6;
constexpr COLORREF kStableDwmRimColor = RGB(0, 0, 0);
// constexpr float kWindowCornerRadiusDip = 16.0f;

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

struct DCompInitFailure
{
    HRESULT hr = S_OK;
    wchar_t const *step = L"";
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
std::wstring build_native_bridge_script(TrayState &state);
std::wstring compute_webview_user_data_dir();
void cancel_native_webview(TrayState &state);
bool register_drop_target(TrayState &state);
void unregister_drop_target(TrayState &state);
void enable_acrylic(HWND hwnd);
void apply_rounded_corners(HWND hwnd);
//void apply_rounded_corners_for_size(HWND hwnd, int width, int height);
void apply_system_backdrop_type(HWND hwnd, DWORD type);
bool capture_window_placement(HWND hwnd, WINDOWPLACEMENT &placement);
void apply_saved_window_state(TrayState &state);
std::string build_path_payload(std::wstring const &path);
std::string build_free_space_payload(std::wstring const &path,
                                     ULARGE_INTEGER const &free_bytes,
                                     ULARGE_INTEGER const &total_bytes);
std::optional<std::wstring> open_file_dialog(HWND owner);
std::optional<std::wstring>
open_folder_dialog(HWND owner, std::wstring const &initial_path);
std::optional<std::wstring>
resolve_existing_directory(std::wstring const &candidate);

// --- Utilities ---

std::wstring hwnd_class_name(HWND hwnd)
{
    if (!hwnd)
    {
        return L"(null)";
    }
    wchar_t cls[256] = {};
    int len = GetClassNameW(hwnd, cls, static_cast<int>(std::size(cls)));
    if (len <= 0)
    {
        return L"(unknown)";
    }
    return std::wstring(cls, static_cast<size_t>(len));
}

struct ResizeBorderThickness
{
    int x = 0;
    int y = 0;
};

ResizeBorderThickness get_resize_border_thickness(HWND hwnd);

std::optional<LRESULT> resize_hit_from_client_point(HWND hwnd, POINT client_pt)
{
    if (!hwnd)
    {
        return std::nullopt;
    }
    if (IsZoomed(hwnd))
    {
        return std::nullopt;
    }
    RECT client{};
    GetClientRect(hwnd, &client);
    int w = std::max(0L, client.right - client.left);
    int h = std::max(0L, client.bottom - client.top);
    if (w <= 0 || h <= 0)
    {
        return std::nullopt;
    }
    ResizeBorderThickness const border = get_resize_border_thickness(hwnd);
    int bx = std::max(1, border.x);
    int by = std::max(1, border.y);

    bool is_top = client_pt.y >= 0 && client_pt.y < by;
    bool is_bottom = client_pt.y >= h - by && client_pt.y < h;
    bool is_left = client_pt.x >= 0 && client_pt.x < bx;
    bool is_right = client_pt.x >= w - bx && client_pt.x < w;

    if (is_top && is_left)
        return HTTOPLEFT;
    if (is_top && is_right)
        return HTTOPRIGHT;
    if (is_bottom && is_left)
        return HTBOTTOMLEFT;
    if (is_bottom && is_right)
        return HTBOTTOMRIGHT;
    if (is_left)
        return HTLEFT;
    if (is_right)
        return HTRIGHT;
    if (is_top)
        return HTTOP;
    if (is_bottom)
        return HTBOTTOM;
    return std::nullopt;
}

HCURSOR cursor_for_resize_hit(LRESULT hit)
{
    switch (hit)
    {
    case HTLEFT:
    case HTRIGHT:
        return LoadCursor(nullptr, IDC_SIZEWE);
    case HTTOP:
    case HTBOTTOM:
        return LoadCursor(nullptr, IDC_SIZENS);
    case HTTOPLEFT:
    case HTBOTTOMRIGHT:
        return LoadCursor(nullptr, IDC_SIZENWSE);
    case HTTOPRIGHT:
    case HTBOTTOMLEFT:
        return LoadCursor(nullptr, IDC_SIZENESW);
    default:
        return LoadCursor(nullptr, IDC_ARROW);
    }
}

std::optional<int> wmsz_from_resize_hit(LRESULT hit)
{
    switch (hit)
    {
    case HTLEFT:
        return WMSZ_LEFT;
    case HTRIGHT:
        return WMSZ_RIGHT;
    case HTTOP:
        return WMSZ_TOP;
    case HTBOTTOM:
        return WMSZ_BOTTOM;
    case HTTOPLEFT:
        return WMSZ_TOPLEFT;
    case HTTOPRIGHT:
        return WMSZ_TOPRIGHT;
    case HTBOTTOMLEFT:
        return WMSZ_BOTTOMLEFT;
    case HTBOTTOMRIGHT:
        return WMSZ_BOTTOMRIGHT;
    default:
        return std::nullopt;
    }
}

WPARAM syscommand_for_resize_wmsz(int wmsz_edge)
{
    return static_cast<WPARAM>(SC_SIZE + wmsz_edge);
}

int compute_inner_glass_mask_thickness_px(HWND hwnd)
{
    (void)hwnd;
    return 0;
}

ResizeBorderThickness get_resize_border_thickness(HWND hwnd)
{
    UINT dpi = GetDpiForWindow(hwnd);
    int frame_x = GetSystemMetricsForDpi(SM_CXSIZEFRAME, dpi);
    int frame_y = GetSystemMetricsForDpi(SM_CYSIZEFRAME, dpi);
    int padding = GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi);
    if (frame_x == 0)
    {
        frame_x = GetSystemMetrics(SM_CXSIZEFRAME);
    }
    if (frame_y == 0)
    {
        frame_y = GetSystemMetrics(SM_CYSIZEFRAME);
    }
    if (padding == 0)
    {
        padding = GetSystemMetrics(SM_CXPADDEDBORDER);
    }
    int border_x = frame_x + padding;
    int border_y = frame_y + padding;
    int fallback_border = MulDiv(8, dpi, 96);
    if (border_x < fallback_border)
    {
        border_x = fallback_border;
    }
    if (border_y < fallback_border)
    {
        border_y = fallback_border;
    }
    return {border_x, border_y};
}

void reset_dcomp_host(TrayState &state)
{
    state.dcomp_root_clip.Reset();
    state.dcomp_webview_visual.Reset();
    state.dcomp_root_visual.Reset();
    state.dcomp_target.Reset();
    state.dcomp_device.Reset();
    state.d3d_context.Reset();
    state.d3d_device.Reset();
}

void reset_webview_objects_keep_window(TrayState &state)
{
    if (state.webview_controller)
    {
        state.webview_controller->Close();
        state.webview_controller.Reset();
    }
    state.webview_comp_controller4.Reset();
    state.webview_comp_controller.Reset();
    state.webview.Reset();
}

bool ensure_dcomp_visual_tree(TrayState &state, DCompInitFailure *failure)
{
    if (!state.webview_window)
    {
        if (failure)
        {
            failure->hr = E_INVALIDARG;
            failure->step = L"webview_window";
        }
        return false;
    }
    if (state.dcomp_device && state.dcomp_root_visual &&
        state.dcomp_webview_visual)
    {
        return true;
    }

    UINT flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;
    D3D_FEATURE_LEVEL levels[] = {
        D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_1,
        D3D_FEATURE_LEVEL_10_0};
    D3D_FEATURE_LEVEL level = D3D_FEATURE_LEVEL_11_0;
    Microsoft::WRL::ComPtr<ID3D11Device> device;
    Microsoft::WRL::ComPtr<ID3D11DeviceContext> context;

    HRESULT hr =
        D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, flags,
                          levels, static_cast<UINT>(std::size(levels)),
                          D3D11_SDK_VERSION, &device, &level, &context);
    if (FAILED(hr))
    {
        hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_WARP, nullptr, flags,
                               levels, static_cast<UINT>(std::size(levels)),
                               D3D11_SDK_VERSION, &device, &level, &context);
    }
    if (FAILED(hr) || !device)
    {
        if (failure)
        {
            failure->hr = hr;
            failure->step = L"D3D11CreateDevice";
        }
        return false;
    }

    Microsoft::WRL::ComPtr<IDCompositionDevice> dcomp;
    hr = DCompositionCreateDevice2(device.Get(), IID_PPV_ARGS(&dcomp));
    if (FAILED(hr) || !dcomp)
    {
        if (failure)
        {
            failure->hr = hr;
            failure->step = L"DCompositionCreateDevice2";
        }
        return false;
    }

    Microsoft::WRL::ComPtr<IDCompositionVisual> root;
    hr = dcomp->CreateVisual(&root);
    if (FAILED(hr) || !root)
    {
        if (failure)
        {
            failure->hr = hr;
            failure->step = L"CreateVisual(root)";
        }
        return false;
    }

    Microsoft::WRL::ComPtr<IDCompositionVisual> webview_visual;
    hr = dcomp->CreateVisual(&webview_visual);
    if (FAILED(hr) || !webview_visual)
    {
        if (failure)
        {
            failure->hr = hr;
            failure->step = L"CreateVisual(webview)";
        }
        return false;
    }

    // Clamp bitmap sampling at the edge of the DComp visuals.
    root->SetBorderMode(DCOMPOSITION_BORDER_MODE_HARD);
    webview_visual->SetBorderMode(DCOMPOSITION_BORDER_MODE_HARD);

    hr = root->AddVisual(webview_visual.Get(), FALSE, nullptr);
    if (FAILED(hr))
    {
        if (failure)
        {
            failure->hr = hr;
            failure->step = L"AddVisual(webview)";
        }
        return false;
    }

    RECT client{};
    GetClientRect(state.webview_window, &client);
    Microsoft::WRL::ComPtr<IDCompositionRectangleClip> root_clip;
    hr = dcomp->CreateRectangleClip(&root_clip);
    if (SUCCEEDED(hr) && root_clip)
    {
         float w = static_cast<float>(std::max(0L, client.right - client.left));
         float h = static_cast<float>(std::max(0L, client.bottom - client.top)); 
//         float radius =
    //         kWindowCornerRadiusDip *
    //         (static_cast<float>(GetDpiForWindow(state.webview_window))
    //         / 96.0f);
    //     float max_radius = std::max(0.0f, std::min(w, h) / 2.0f);
    //     radius = std::min(radius, max_radius);
    //
         root_clip->SetLeft(0.0f);
         root_clip->SetTop(0.0f);
         root_clip->SetRight(w);
         root_clip->SetBottom(h);
    //     root_clip->SetTopLeftRadiusX(radius);
    //     root_clip->SetTopLeftRadiusY(radius);
    //     root_clip->SetTopRightRadiusX(radius);
    //     root_clip->SetTopRightRadiusY(radius);
    //     root_clip->SetBottomLeftRadiusX(radius);
    //     root_clip->SetBottomLeftRadiusY(radius);
    //     root_clip->SetBottomRightRadiusX(radius);
    //     root_clip->SetBottomRightRadiusY(radius);
         root->SetClip(root_clip.Get());
     }

    state.d3d_device = device;
    state.d3d_context = context;
    state.dcomp_device = dcomp;
    state.dcomp_root_visual = root;
    state.dcomp_webview_visual = webview_visual;
    state.dcomp_root_clip = root_clip;
    return true;
}

bool attach_dcomp_target(TrayState &state, DCompInitFailure *failure)
{
    if (!state.webview_window || !state.dcomp_device ||
        !state.dcomp_root_visual)
    {
        if (failure)
        {
            failure->hr = E_INVALIDARG;
            failure->step = L"attach_prereq";
        }
        return false;
    }
    if (state.dcomp_target)
    {
        return true;
    }

    Microsoft::WRL::ComPtr<IDCompositionTarget> target;
    HRESULT hr = state.dcomp_device->CreateTargetForHwnd(state.webview_window,
                                                         TRUE, &target);
    if (FAILED(hr) || !target)
    {
        if (failure)
        {
            failure->hr = hr;
            failure->step = L"CreateTargetForHwnd";
        }
        return false;
    }

    hr = target->SetRoot(state.dcomp_root_visual.Get());
    if (FAILED(hr))
    {
        if (failure)
        {
            failure->hr = hr;
            failure->step = L"SetRoot";
        }
        return false;
    }

    state.dcomp_device->Commit();
    state.dcomp_target = target;
    return true;
}

void update_dcomp_root_clip(TrayState *state, RECT client)
{
    if (!state || !state->dcomp_device || !state->dcomp_root_visual)
    {
        return;
    }

    if (!state->dcomp_root_clip)
    {
        state->dcomp_device->CreateRectangleClip(&state->dcomp_root_clip);
        if (state->dcomp_root_clip)
        {
            state->dcomp_root_visual->SetClip(state->dcomp_root_clip.Get());
        }
    }

    if (!state->dcomp_root_clip)
    {
        return;
    }

    float w = static_cast<float>(std::max(0L, client.right - client.left));
    float h = static_cast<float>(std::max(0L, client.bottom - client.top));
//    float radius = 0.0f;
   //if (state->webview_window && !IsZoomed(state->webview_window))
   //{
   //    radius = kWindowCornerRadiusDip *
   //             (static_cast<float>(GetDpiForWindow(state->webview_window)) /
   //              96.0f);
   //    float max_radius = std::max(0.0f, std::min(w, h) / 2.0f);
   //    radius = std::min(radius, max_radius);
   //}
    state->dcomp_root_clip->SetLeft(0.0f);
    state->dcomp_root_clip->SetTop(0.0f);
    state->dcomp_root_clip->SetRight(w);
    state->dcomp_root_clip->SetBottom(h);
 //   state->dcomp_root_clip->SetTopLeftRadiusX(radius);
 //   state->dcomp_root_clip->SetTopLeftRadiusY(radius);
 //   state->dcomp_root_clip->SetTopRightRadiusX(radius);
 //   state->dcomp_root_clip->SetTopRightRadiusY(radius);
 //   state->dcomp_root_clip->SetBottomLeftRadiusX(radius);
 //   state->dcomp_root_clip->SetBottomLeftRadiusY(radius);
 //   state->dcomp_root_clip->SetBottomRightRadiusX(radius);
 //   state->dcomp_root_clip->SetBottomRightRadiusY(radius);
}

void commit_dcomp(TrayState *state)
{
    if (!state || !state->dcomp_device)
    {
        return;
    }
    state->dcomp_device->Commit();
    if (state->webview_in_size_move)
    {
        state->dcomp_device->WaitForCommitCompletion();
        DwmFlush();
    }
}

void update_webview_controller_bounds_from_client_rect(TrayState *state,
                                                       HWND hwnd, RECT client)
{
    if (!state || !state->webview_controller)
    {
        return;
    }
    RECT bounds = compute_webview_controller_bounds_from_client(hwnd, client);
    state->webview_controller->put_Bounds(bounds);
    update_dcomp_root_clip(state, client);
    commit_dcomp(state);
}

void update_webview_controller_bounds(TrayState *state, HWND hwnd)
{
    RECT client{};
    GetClientRect(hwnd, &client);
    update_webview_controller_bounds_from_client_rect(state, hwnd, client);
}

void configure_webview_controller_pixel_mode(TrayState &state, HWND hwnd)
{
    if (!state.webview_controller || !hwnd)
    {
        return;
    }

    Microsoft::WRL::ComPtr<ICoreWebView2Controller3> controller3;
    if (SUCCEEDED(state.webview_controller.As(&controller3)) && controller3)
    {
        controller3->put_BoundsMode(COREWEBVIEW2_BOUNDS_MODE_USE_RAW_PIXELS);
        controller3->put_ShouldDetectMonitorScaleChanges(TRUE);
        controller3->put_RasterizationScale(
            static_cast<double>(GetDpiForWindow(hwnd)) / 96.0);
    }
}

HRESULT finish_webview_controller_setup(TrayState &state)
{
    if (!state.webview_controller || !state.webview_window)
    {
        return E_INVALIDARG;
    }

    configure_webview_controller_pixel_mode(state, state.webview_window);

    state.webview_controller->get_CoreWebView2(&state.webview);
    update_webview_controller_bounds(&state, state.webview_window);
    state.webview_controller->put_IsVisible(TRUE);

    if (state.webview)
    {
        Microsoft::WRL::ComPtr<ICoreWebView2Settings> settings;
        if (SUCCEEDED(state.webview->get_Settings(&settings)) && settings)
        {
            Microsoft::WRL::ComPtr<ICoreWebView2Settings9> settings9;
            if (SUCCEEDED(settings.As(&settings9)) && settings9)
            {
                settings9->put_IsNonClientRegionSupportEnabled(TRUE);
            }
        }
    }

    if (state.webview_controller)
    {
        Microsoft::WRL::ComPtr<ICoreWebView2Controller2> controller2;
        if (SUCCEEDED(state.webview_controller.As(&controller2)) && controller2)
        {
            COREWEBVIEW2_COLOR transparent{0, 0, 0, 0};
            controller2->put_DefaultBackgroundColor(transparent);
        }
    }

    if (!state.webview)
    {
        return E_FAIL;
    }

    if (state.cursor_token_set && state.webview_comp_controller)
    {
        state.webview_comp_controller->remove_CursorChanged(state.cursor_token);
        state.cursor_token_set = false;
        state.cursor_token = {};
    }
    state.webview_cursor = nullptr;
    if (state.webview_comp_controller)
    {
        HCURSOR cursor = nullptr;
        if (SUCCEEDED(state.webview_comp_controller->get_Cursor(&cursor)))
        {
            state.webview_cursor = cursor;
        }

        HRESULT cursor_hr = state.webview_comp_controller->add_CursorChanged(
            Microsoft::WRL::Callback<ICoreWebView2CursorChangedEventHandler>(
                [&state](ICoreWebView2CompositionController *,
                         IUnknown *) -> HRESULT
                {
                    if (!state.webview_comp_controller)
                    {
                        state.webview_cursor = nullptr;
                        return S_OK;
                    }
                    HCURSOR cursor = nullptr;
                    if (SUCCEEDED(
                            state.webview_comp_controller->get_Cursor(&cursor)))
                    {
                        state.webview_cursor = cursor;
                        if (state.webview_window)
                        {
                            POINT screen_pt{};
                            if (GetCursorPos(&screen_pt))
                            {
                                HWND under = WindowFromPoint(screen_pt);
                                if (under == state.webview_window)
                                {
                                    POINT client_pt = screen_pt;
                                    if (ScreenToClient(state.webview_window,
                                                       &client_pt))
                                    {
                                        if (!resize_hit_from_client_point(
                                                state.webview_window,
                                                client_pt))
                                        {
                                            SetCursor(cursor);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    return S_OK;
                })
                .Get(),
            &state.cursor_token);
        state.cursor_token_set = SUCCEEDED(cursor_hr);
    }

    auto script = build_native_bridge_script(state);
    state.webview->AddScriptToExecuteOnDocumentCreated(script.c_str(), nullptr);
    state.webview->add_WebMessageReceived(
        Microsoft::WRL::Callback<ICoreWebView2WebMessageReceivedEventHandler>(
            [&state](ICoreWebView2 *,
                     ICoreWebView2WebMessageReceivedEventArgs *args) -> HRESULT
            {
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
                    handle_webview_json_message(state, narrow(wide));
                }
                return S_OK;
            })
            .Get(),
        &state.web_message_token);
    state.webview->add_NavigationCompleted(
        Microsoft::WRL::Callback<ICoreWebView2NavigationCompletedEventHandler>(
            [&state](ICoreWebView2 *,
                     ICoreWebView2NavigationCompletedEventArgs *) -> HRESULT
            {
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
            })
            .Get(),
        &state.navigation_token);

    state.webview->Navigate(state.open_url.c_str());
    return S_OK;
}

void post_webview_message(TrayState &state, std::wstring const &message)
{
    if (!state.webview)
    {
        return;
    }
    state.webview->PostWebMessageAsJson(message.c_str());
}

HRESULT safe_dwm_set_window_attribute(HWND hwnd, DWORD attr, void const *value,
                                      DWORD size)
{
    return DwmSetWindowAttribute(hwnd, attr, value, size);
}

void apply_dark_titlebar(HWND hwnd)
{
    if (!hwnd)
    {
        return;
    }

    BOOL dark = TRUE;
    safe_dwm_set_window_attribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &dark,
                                  sizeof(dark));
    COLORREF caption_color = DWMWA_COLOR_NONE;
    safe_dwm_set_window_attribute(hwnd, DWMWA_CAPTION_COLOR, &caption_color,
                                  sizeof(caption_color));
    COLORREF text_color = DWMWA_COLOR_NONE;
    safe_dwm_set_window_attribute(hwnd, DWMWA_TEXT_COLOR, &text_color,
                                  sizeof(text_color));
}

void apply_frameless_window_style(HWND hwnd)
{
    if (!hwnd)
    {
        return;
    }
    COLORREF border = kStableDwmRimColor;
    safe_dwm_set_window_attribute(hwnd, DWMWA_BORDER_COLOR, &border,
                                  sizeof(border));
    UINT frame_thickness = 0;
    safe_dwm_set_window_attribute(hwnd, DWMWA_VISIBLE_FRAME_BORDER_THICKNESS,
                                  &frame_thickness, sizeof(frame_thickness));
}

void apply_stable_activation_rim(HWND hwnd, bool flush)
{
    if (!hwnd)
    {
        return;
    }
    // Force our desired DWM attributes through before any non-client paint that
    // might occur during activation/focus transitions.
    apply_dark_titlebar(hwnd);
    apply_frameless_window_style(hwnd);
    if (flush)
    {
        DwmFlush();
    }
}

bool set_no_redirection_bitmap(HWND hwnd, bool enable)
{
    if (!hwnd)
    {
        return false;
    }
    LONG_PTR ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    LONG_PTR desired =
        enable ? (ex | WS_EX_NOREDIRECTIONBITMAP)
               : (ex & ~static_cast<LONG_PTR>(WS_EX_NOREDIRECTIONBITMAP));
    if (desired == ex)
    {
        return ((ex & WS_EX_NOREDIRECTIONBITMAP) != 0) == enable;
    }
    SetLastError(ERROR_SUCCESS);
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, desired);
    SetWindowPos(hwnd, nullptr, 0, 0, 0, 0,
                 SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER |
                     SWP_NOACTIVATE);
    LONG_PTR applied = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    return ((applied & WS_EX_NOREDIRECTIONBITMAP) != 0) == enable;
}

void configure_webview_window_chrome(HWND hwnd)
{
    if (!hwnd)
    {
        return;
    }
    apply_dark_titlebar(hwnd);
    apply_frameless_window_style(hwnd);
    enable_acrylic(hwnd);
    apply_rounded_corners(hwnd);
    apply_system_backdrop_type(hwnd, DWMSBT_NONE);
}

std::wstring build_host_response(std::string const &id, bool success,
                                 std::string const &error = {},
                                 std::string const &payload_json = {})
{
    std::string response = "{\"type\":\"response\",\"id\":\"" +
                           escape_json_string(id) +
                           "\",\"success\":" + (success ? "true" : "false");
    if (success && !payload_json.empty())
    {
        response += ",\"payload\":" + payload_json;
    }
    if (!success && !error.empty())
    {
        response += ",\"error\":\"" + escape_json_string(error) + "\"";
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
    if (state.cursor_token_set && state.webview_comp_controller)
    {
        state.webview_comp_controller->remove_CursorChanged(state.cursor_token);
        state.cursor_token_set = false;
        state.cursor_token = {};
    }
    state.webview_cursor = nullptr;
    if (state.webview_controller)
    {
        state.webview_controller->Close();
        state.webview_controller.Reset();
    }
    state.webview_comp_controller4.Reset();
    state.webview_comp_controller.Reset();
    if (state.webview)
    {
        state.webview.Reset();
    }
    state.webview_environment3.Reset();
    state.dcomp_webview_visual.Reset();
    state.dcomp_root_visual.Reset();
    state.dcomp_target.Reset();
    state.dcomp_device.Reset();
    state.d3d_context.Reset();
    state.d3d_device.Reset();
    if (state.webview_window)
    {
        unregister_drop_target(state);
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
    auto *payload_val = yyjson_obj_get(root, "payload");
    if (!type || !yyjson_is_str(type) ||
        std::string_view(yyjson_get_str(type)) != "request" || !id ||
        !yyjson_is_str(id) || !name || !yyjson_is_str(name))
    {
        yyjson_doc_free(doc);
        return;
    }
    std::string id_value{yyjson_get_str(id)};
    std::string name_value{yyjson_get_str(name)};
    bool success = false;
    std::string error;
    std::string response_payload;
    if (name_value == "window-command")
    {
        if (payload_val && yyjson_is_obj(payload_val))
        {
            yyjson_val *command_val = yyjson_obj_get(payload_val, "command");
            if (command_val && yyjson_is_str(command_val))
            {
                success =
                    perform_window_command(state, yyjson_get_str(command_val));
            }
        }
        if (!success)
        {
            error = "native host window command failed";
        }
    }
    else if (name_value == "open-file-dialog")
    {
        success = true;
        if (auto selected = open_file_dialog(state.webview_window))
        {
            response_payload = build_path_payload(*selected);
        }
    }
    else if (name_value == "browse-directory")
    {
        success = true;
        std::wstring initial_path;
        if (payload_val && yyjson_is_obj(payload_val))
        {
            yyjson_val *path_val = yyjson_obj_get(payload_val, "path");
            if (path_val && yyjson_is_str(path_val))
            {
                initial_path = widen(yyjson_get_str(path_val));
            }
        }
        if (auto selected =
                open_folder_dialog(state.webview_window, initial_path))
        {
            response_payload = build_path_payload(*selected);
        }
    }
    else if (name_value == "check-free-space")
    {
        if (!payload_val || !yyjson_is_obj(payload_val))
        {
            error = "native host free-space request missing payload";
        }
        else
        {
            yyjson_val *path_val = yyjson_obj_get(payload_val, "path");
            if (!path_val || !yyjson_is_str(path_val))
            {
                error = "native host free-space request missing path";
            }
            else
            {
                std::wstring path = widen(yyjson_get_str(path_val));
                if (path.empty())
                {
                    error = "native host free-space request empty path";
                }
                else
                {
                    auto directory = resolve_existing_directory(path);
                    if (!directory)
                    {
                        error = "native host free-space path unavailable";
                    }
                    else
                    {
                        ULARGE_INTEGER free_bytes{};
                        ULARGE_INTEGER total_bytes{};
                        if (!GetDiskFreeSpaceExW(directory->c_str(),
                                                 &free_bytes, &total_bytes,
                                                 nullptr))
                        {
                            error = "native host free-space query failed";
                        }
                        else
                        {
                            success = true;
                            response_payload = build_free_space_payload(
                                *directory, free_bytes, total_bytes);
                        }
                    }
                }
            }
        }
    }
    else if (name_value == "open-path")
    {
        if (!payload_val || !yyjson_is_obj(payload_val))
        {
            error = "native host open-path request missing payload";
        }
        else
        {
            yyjson_val *path_val = yyjson_obj_get(payload_val, "path");
            if (!path_val || !yyjson_is_str(path_val))
            {
                error = "native host open-path request missing path";
            }
            else
            {
                std::wstring path = widen(yyjson_get_str(path_val));
                if (path.empty())
                {
                    error = "native host open-path request empty path";
                }
                else
                {
                    auto result = ShellExecuteW(state.webview_window, L"open",
                                                path.c_str(), nullptr, nullptr,
                                                SW_SHOWNORMAL);
                    if (reinterpret_cast<INT_PTR>(result) <= 32)
                    {
                        error = "native host open-path failed";
                    }
                    else
                    {
                        success = true;
                    }
                }
            }
        }
    }
    else if (name_value == "get-system-integration-status")
    {
        success = true;
        response_payload = "{\"autorun\":false,\"associations\":false}";
    }
    else if (name_value == "set-system-integration")
    {
        success = true;
        response_payload = "{\"autorun\":false,\"associations\":false}";
    }
    else if (name_value == "persist-window-state")
    {
        if (!state.webview_window)
        {
            error = "native window unavailable";
        }
        else
        {
            WINDOWPLACEMENT placement{};
            if (capture_window_placement(state.webview_window, placement))
            {
                state.saved_window_placement = placement;
                success = true;
            }
            else
            {
                error = "native host window state capture failed";
            }
        }
    }
    else
    {
        error = "native host request unhandled";
    }
    post_webview_message(
        state, build_host_response(id_value, success, error, response_payload));
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

bool capture_window_placement(HWND hwnd, WINDOWPLACEMENT &placement)
{
    if (!hwnd)
    {
        return false;
    }
    placement.length = sizeof(WINDOWPLACEMENT);
    return GetWindowPlacement(hwnd, &placement) == TRUE;
}

void apply_saved_window_state(TrayState &state)
{
    if (!state.webview_window || !state.saved_window_placement)
    {
        return;
    }
    WINDOWPLACEMENT placement = *state.saved_window_placement;
    placement.length = sizeof(WINDOWPLACEMENT);
    SetWindowPlacement(state.webview_window, &placement);
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

std::string build_path_payload(std::wstring const &path)
{
    std::string escaped = escape_json_string(narrow(path));
    return "{\"path\":\"" + escaped + "\"}";
}

std::string build_free_space_payload(std::wstring const &path,
                                     ULARGE_INTEGER const &free_bytes,
                                     ULARGE_INTEGER const &total_bytes)
{
    std::string escaped = escape_json_string(narrow(path));
    return "{\"path\":\"" + escaped +
           "\",\"sizeBytes\":" + std::to_string(free_bytes.QuadPart) +
           ",\"totalSize\":" + std::to_string(total_bytes.QuadPart) + "}";
}

std::optional<std::wstring> open_file_dialog(HWND owner)
{
    Microsoft::WRL::ComPtr<IFileOpenDialog> dialog;
    HRESULT hr = CoCreateInstance(CLSID_FileOpenDialog, nullptr,
                                  CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&dialog));
    if (FAILED(hr) || !dialog)
    {
        return std::nullopt;
    }
    DWORD options = 0;
    dialog->GetOptions(&options);
    dialog->SetOptions(options | FOS_FORCEFILESYSTEM | FOS_FILEMUSTEXIST |
                       FOS_PATHMUSTEXIST | FOS_NOCHANGEDIR);
    constexpr COMDLG_FILTERSPEC filters[] = {
        {L"Torrent Files (*.torrent)", L"*.torrent"},
        {L"All Files (*.*)", L"*.*"},
    };
    dialog->SetFileTypes(static_cast<UINT>(std::size(filters)), filters);
    dialog->SetDefaultExtension(L"torrent");
    hr = dialog->Show(owner);
    if (hr == HRESULT_FROM_WIN32(ERROR_CANCELLED))
    {
        return std::nullopt;
    }
    if (FAILED(hr))
    {
        return std::nullopt;
    }
    Microsoft::WRL::ComPtr<IShellItem> item;
    hr = dialog->GetResult(&item);
    if (FAILED(hr) || !item)
    {
        return std::nullopt;
    }
    PWSTR path = nullptr;
    hr = item->GetDisplayName(SIGDN_FILESYSPATH, &path);
    if (FAILED(hr) || !path)
    {
        return std::nullopt;
    }
    std::wstring result(path);
    CoTaskMemFree(path);
    if (result.empty())
    {
        return std::nullopt;
    }
    return result;
}

std::optional<std::wstring> open_folder_dialog(HWND owner,
                                               std::wstring const &initial_path)
{
    Microsoft::WRL::ComPtr<IFileOpenDialog> dialog;
    HRESULT hr = CoCreateInstance(CLSID_FileOpenDialog, nullptr,
                                  CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&dialog));
    if (FAILED(hr) || !dialog)
    {
        return std::nullopt;
    }
    DWORD options = 0;
    dialog->GetOptions(&options);
    dialog->SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM |
                       FOS_PATHMUSTEXIST | FOS_NOCHANGEDIR);
    if (!initial_path.empty())
    {
        Microsoft::WRL::ComPtr<IShellItem> folder;
        if (SUCCEEDED(SHCreateItemFromParsingName(initial_path.c_str(), nullptr,
                                                  IID_PPV_ARGS(&folder))) &&
            folder)
        {
            dialog->SetFolder(folder.Get());
        }
    }
    hr = dialog->Show(owner);
    if (hr == HRESULT_FROM_WIN32(ERROR_CANCELLED))
    {
        return std::nullopt;
    }
    if (FAILED(hr))
    {
        return std::nullopt;
    }
    Microsoft::WRL::ComPtr<IShellItem> item;
    hr = dialog->GetResult(&item);
    if (FAILED(hr) || !item)
    {
        return std::nullopt;
    }
    PWSTR path = nullptr;
    hr = item->GetDisplayName(SIGDN_FILESYSPATH, &path);
    if (FAILED(hr) || !path)
    {
        return std::nullopt;
    }
    std::wstring result(path);
    CoTaskMemFree(path);
    if (result.empty())
    {
        return std::nullopt;
    }
    return result;
}

std::optional<std::wstring>
resolve_existing_directory(std::wstring const &candidate)
{
    if (candidate.empty())
    {
        return std::nullopt;
    }
    std::error_code ec;
    std::filesystem::path dir(candidate);
    if (dir.empty())
    {
        return std::nullopt;
    }
    while (!dir.empty() && !std::filesystem::exists(dir, ec))
    {
        auto parent = dir.parent_path();
        if (parent == dir)
        {
            break;
        }
        dir = parent;
    }
    if (dir.empty() || !std::filesystem::exists(dir, ec))
    {
        return std::nullopt;
    }
    if (!std::filesystem::is_directory(dir, ec))
    {
        auto parent = dir.parent_path();
        if (parent.empty())
        {
            return std::nullopt;
        }
        dir = parent;
    }
    if (dir.empty())
    {
        return std::nullopt;
    }
    return dir.wstring();
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
    script += L"try{";
    script += L"if(\"" + token + L"\".length){";
    script += L"sessionStorage.setItem(\"tt-auth-token\",\"" + token + L"\");";
    script += L"}else{";
    script += L"sessionStorage.removeItem(\"tt-auth-token\");";
    script += L"}";
    script += L"}catch(e){}";
    return script;
}

LRESULT CALLBACK WebViewWindowProc(HWND hwnd, UINT msg, WPARAM wparam,
                                   LPARAM lparam)
{
    auto *state =
        reinterpret_cast<TrayState *>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    switch (msg)
    {
    case WM_NCCREATE:
        apply_stable_activation_rim(hwnd, true);
        break;
    case WM_CREATE:
        apply_stable_activation_rim(hwnd, true);
        break;
    case WM_ENTERSIZEMOVE:
        if (state)
        {
            state->webview_in_size_move = true;
        }
        return 0;
    case WM_EXITSIZEMOVE:
        if (state)
        {
            update_webview_controller_bounds(state, hwnd);
            state->webview_in_size_move = false;
            apply_rounded_corners(hwnd);
        }
        return 0;
    case WM_SIZING:
    {
        if (!state || !state->webview_controller)
        {
            return 0;
        }
        auto *window_rect = reinterpret_cast<RECT *>(lparam);
        if (!window_rect)
        {
            return 0;
        }
        int window_w = std::max(0L, window_rect->right - window_rect->left);
        int window_h = std::max(0L, window_rect->bottom - window_rect->top);
        RECT client{0, 0, window_w, window_h};
        update_webview_controller_bounds_from_client_rect(state, hwnd, client);
        //apply_rounded_corners_for_size(hwnd, window_w, window_h);
        return 0;
    }
    case WM_SIZE:
        if (state && state->webview_in_size_move)
        {
            return 0;
        }
        update_webview_controller_bounds(state, hwnd);
        apply_rounded_corners(hwnd);
        return 0;
    case WM_SETFOCUS:
        if (state && state->webview_controller)
        {
            state->webview_controller->MoveFocus(
                COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
        }
        break;
    case WM_MOUSEMOVE:
    case WM_LBUTTONDOWN:
    case WM_LBUTTONUP:
    case WM_LBUTTONDBLCLK:
    case WM_RBUTTONDOWN:
    case WM_RBUTTONUP:
    case WM_RBUTTONDBLCLK:
    case WM_MBUTTONDOWN:
    case WM_MBUTTONUP:
    case WM_MBUTTONDBLCLK:
    case WM_XBUTTONDOWN:
    case WM_XBUTTONUP:
    case WM_XBUTTONDBLCLK:
    case WM_MOUSEWHEEL:
    case WM_MOUSEHWHEEL:
        if (msg == WM_LBUTTONDOWN)
        {
            POINT client_pt{GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
            if (auto hit = resize_hit_from_client_point(hwnd, client_pt); hit)
            {
                SetFocus(hwnd);
                POINT screen_pt = client_pt;
                ClientToScreen(hwnd, &screen_pt);
                LPARAM sc_lp = MAKELPARAM(screen_pt.x, screen_pt.y);
                auto wmsz = wmsz_from_resize_hit(*hit);
                if (!wmsz)
                {
                    break;
                }
                ReleaseCapture();
                if (state)
                {
                    state->webview_in_size_move = true;
                }
                SendMessageW(hwnd, WM_SYSCOMMAND,
                             syscommand_for_resize_wmsz(*wmsz), sc_lp);
                return 0;
            }
        }
        if (msg == WM_LBUTTONDOWN || msg == WM_RBUTTONDOWN ||
            msg == WM_MBUTTONDOWN || msg == WM_XBUTTONDOWN)
        {
            SetFocus(hwnd);
            SetCapture(hwnd);
        }
        else if (msg == WM_LBUTTONUP || msg == WM_RBUTTONUP ||
                 msg == WM_MBUTTONUP || msg == WM_XBUTTONUP)
        {
            if (GetCapture() == hwnd)
            {
                ReleaseCapture();
            }
        }

        if (state && tt::tray::input::handle_webview_mouse_input(
                         *state, hwnd, msg, wparam, lparam))
        {
            return 0;
        }
        break;
    case WM_NCCALCSIZE:
        if (wparam)
        {
            return 0;
        }
        break;
    case WM_ERASEBKGND:
        return 1;
    case WM_PAINT:
    {
        PAINTSTRUCT ps{};
        BeginPaint(hwnd, &ps);
        EndPaint(hwnd, &ps);
        return 0;
    }
    case WM_NCACTIVATE:
    {
        apply_stable_activation_rim(hwnd, true);
        LRESULT result = DefWindowProcW(hwnd, msg, wparam, lparam);
        apply_stable_activation_rim(hwnd, true);
        return result;
    }
    case WM_ACTIVATE:
    {
        apply_stable_activation_rim(hwnd, true);
        LRESULT result = DefWindowProcW(hwnd, msg, wparam, lparam);
        apply_stable_activation_rim(hwnd, true);
        return result;
    }
    case WM_NCPAINT:
    {
        bool flush = true;
        if (state && state->webview_in_size_move)
        {
            flush = false;
        }
        apply_stable_activation_rim(hwnd, flush);
        LRESULT result = DefWindowProcW(hwnd, msg, wparam, lparam);
        apply_stable_activation_rim(hwnd, flush);
        return result;
    }
    case WM_DWMCOMPOSITIONCHANGED:
        apply_stable_activation_rim(hwnd, true);
        break;
    case WM_SETCURSOR:
        if (LOWORD(lparam) == HTCLIENT)
        {
            POINT screen_pt{};
            if (GetCursorPos(&screen_pt))
            {
                POINT client_pt = screen_pt;
                if (ScreenToClient(hwnd, &client_pt))
                {
                    if (auto hit =
                            resize_hit_from_client_point(hwnd, client_pt);
                        hit)
                    {
                        SetCursor(cursor_for_resize_hit(*hit));
                        return TRUE;
                    }
                }
            }
            if (state && state->webview_comp_controller &&
                state->webview_cursor)
            {
                SetCursor(state->webview_cursor);
                return TRUE;
            }
        }
        break;
    case WM_MOVE:
    case WM_WINDOWPOSCHANGED:
        if (state && state->webview_controller)
        {
            state->webview_controller->NotifyParentWindowPositionChanged();
        }
        break;
    case WM_POINTERACTIVATE:
    case WM_POINTERDOWN:
    case WM_POINTERUP:
    case WM_POINTERUPDATE:
    case WM_POINTERENTER:
    case WM_POINTERLEAVE:
        if (state && tt::tray::input::handle_webview_pointer_input(
                         *state, hwnd, msg, wparam, lparam))
        {
            return 0;
        }
        break;
    case WM_THEMECHANGED:
        apply_stable_activation_rim(hwnd, true);
        break;
    case WM_SETTINGCHANGE:
        apply_stable_activation_rim(hwnd, true);
        break;
    case WM_ACTIVATEAPP:
        apply_stable_activation_rim(hwnd, true);
        break;
    case WM_NCHITTEST:
    {
        POINT pt{GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};

        if (IsZoomed(hwnd))
        {
            return HTCLIENT;
        }

        LRESULT dwm_hit = 0;
        if (DwmDefWindowProc(hwnd, msg, wparam, lparam, &dwm_hit))
        {
            if (dwm_hit != HTCLIENT && dwm_hit != HTCAPTION)
            {
                return dwm_hit;
            }
        }

        RECT rw{};
        if (FAILED(DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, &rw,
                                         sizeof(rw))))
        {
            GetWindowRect(hwnd, &rw);
        }

        LRESULT result = HTCLIENT;
        if (result == HTCLIENT && state)
        {
            POINT client_pt{pt.x, pt.y};
            if (ScreenToClient(hwnd, &client_pt))
            {
                RECT bounds = compute_webview_controller_bounds(hwnd);
                if (client_pt.x < bounds.left || client_pt.x >= bounds.right ||
                    client_pt.y < bounds.top || client_pt.y >= bounds.bottom)
                {
                    return HTCLIENT;
                }

                COREWEBVIEW2_NON_CLIENT_REGION_KIND kind =
                    COREWEBVIEW2_NON_CLIENT_REGION_KIND_CLIENT;
                HRESULT hr = E_NOINTERFACE;
                if (state->webview_comp_controller4)
                {
                    hr = state->webview_comp_controller4
                             ->GetNonClientRegionAtPoint(client_pt, &kind);
                }
                if (SUCCEEDED(hr) &&
                    kind == COREWEBVIEW2_NON_CLIENT_REGION_KIND_CAPTION)
                {
                    return HTCAPTION;
                }
            }
        }
        return result;
    }
    case WM_GETMINMAXINFO:
    {
        auto *mmi = reinterpret_cast<MINMAXINFO *>(lparam);
        if (!mmi)
        {
            return 0;
        }
        HMONITOR monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
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
                configure_webview_controller_pixel_mode(*state, hwnd);
                update_webview_controller_bounds(state, hwnd);
                apply_rounded_corners(hwnd);
            }
        }
        return 0;
    case WM_TIMER:
        break;
    case WM_CLOSE:
        if (state)
        {
            state->user_closed_ui.store(true);
            state->ui_attached.store(false);
            tt::tray::rpc::post_rpc_request(
                *state, R"({"method":"session-ui-detach"})");
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
    wc.hbrBackground = nullptr;
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
    std::wstring message = L"{\"type\":\"event\",\"name\":\"auth-token\","
                           L"\"payload\":{\"token\":\"" +
                           widen(state.token) + L"\",\"host\":\"" + host +
                           L"\",\"port\":\"" + port + L"\",\"scheme\":\"" +
                           scheme + L"\"}}";
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
        DWORD kWebViewWindowStyle = WS_POPUP | WS_THICKFRAME | WS_MINIMIZEBOX |
                                    WS_MAXIMIZEBOX | WS_SYSMENU;
        // No WS_THICKFRAME: we initiate sizing via SC_SIZE so DWM never paints
        // a standard resize frame (which also avoids the intermittent rim).
        kWebViewWindowStyle &= ~(WS_THICKFRAME | WS_SIZEBOX);
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
        set_no_redirection_bitmap(state.webview_window, true);
        ShowWindow(state.webview_window, SW_HIDE);
        register_drop_target(state);
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
            [&state](HRESULT res, ICoreWebView2Environment *env) -> HRESULT
            {
                if (state.shutting_down.load())
                {
                    return E_ABORT;
                }
                if (FAILED(res) || !env || !state.webview_window)
                {
                    if (FAILED(res))
                    {
                        TT_LOG_INFO(
                            "WebView2 environment initialization failed "
                            "({:#X}); UI will remain hidden",
                            static_cast<uint32_t>(res));
                    }
                    return res;
                }

                auto start_hwnd_host = [env,
                                        &state](std::string const &reason,
                                                HRESULT reason_hr) -> HRESULT
                {
                    TT_LOG_INFO("WebView2 hosting mode: HWND (reason: {}, "
                                "hr={:#X})",
                                reason, static_cast<uint32_t>(reason_hr));

                    reset_webview_objects_keep_window(state);
                    reset_dcomp_host(state);
                    set_no_redirection_bitmap(state.webview_window, false);

                    return env->CreateCoreWebView2Controller(
                        state.webview_window,
                        Microsoft::WRL::Callback<
                            ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                            [&state](
                                HRESULT ctrl_res,
                                ICoreWebView2Controller *controller) -> HRESULT
                            {
                                if (state.shutting_down.load())
                                {
                                    return E_ABORT;
                                }
                                if (FAILED(ctrl_res) || !controller)
                                {
                                    TT_LOG_INFO(
                                        "WebView2 HWND controller "
                                        "initialization "
                                        "failed ({:#X}); UI will remain hidden",
                                        static_cast<uint32_t>(ctrl_res));
                                    return ctrl_res;
                                }
                                state.webview_controller = controller;
                                return finish_webview_controller_setup(state);
                            })
                            .Get());
                };

                Microsoft::WRL::ComPtr<ICoreWebView2Environment3> env3;
                HRESULT qi_hr = env->QueryInterface(IID_PPV_ARGS(&env3));
                if (FAILED(qi_hr) || !env3)
                {
                    return start_hwnd_host("ICoreWebView2Environment3 missing",
                                           qi_hr);
                }

                state.webview_environment3 = env3;
                return env3->CreateCoreWebView2CompositionController(
                    state.webview_window,
                    Microsoft::WRL::Callback<
                        ICoreWebView2CreateCoreWebView2CompositionControllerCompletedHandler>(
                        [&state, start_hwnd_host](
                            HRESULT ctrl_res,
                            ICoreWebView2CompositionController *controller)
                            -> HRESULT
                        {
                            if (state.shutting_down.load())
                            {
                                return E_ABORT;
                            }
                            if (FAILED(ctrl_res) || !controller)
                            {
                                return start_hwnd_host(
                                    "CreateCoreWebView2CompositionController "
                                    "failed",
                                    ctrl_res);
                            }

                            state.webview_comp_controller = controller;
                            state.webview_comp_controller.As(
                                &state.webview_comp_controller4);

                            Microsoft::WRL::ComPtr<ICoreWebView2Controller>
                                controller_base;
                            HRESULT base_hr = controller->QueryInterface(
                                IID_PPV_ARGS(&controller_base));
                            if (FAILED(base_hr) || !controller_base)
                            {
                                return start_hwnd_host(
                                    "composition controller QI to "
                                    "ICoreWebView2Controller failed",
                                    base_hr);
                            }
                            state.webview_controller = controller_base;

                            DCompInitFailure dcomp_failure{};
                            if (!ensure_dcomp_visual_tree(state,
                                                          &dcomp_failure))
                            {
                                std::string reason =
                                    "composition host unavailable at ";
                                reason +=
                                    narrow(std::wstring(dcomp_failure.step));
                                return start_hwnd_host(reason,
                                                       dcomp_failure.hr);
                            }

                            set_no_redirection_bitmap(state.webview_window,
                                                      true);

                            HRESULT visual_hr =
                                state.webview_comp_controller
                                    ->put_RootVisualTarget(
                                        state.dcomp_webview_visual.Get());
                            if (FAILED(visual_hr))
                            {
                                return start_hwnd_host(
                                    "put_RootVisualTarget failed", visual_hr);
                            }

                            if (!attach_dcomp_target(state, &dcomp_failure))
                            {
                                std::string reason =
                                    "composition host unavailable at ";
                                reason +=
                                    narrow(std::wstring(dcomp_failure.step));
                                return start_hwnd_host(reason,
                                                       dcomp_failure.hr);
                            }

                            DWORD ex = static_cast<DWORD>(GetWindowLongPtrW(
                                state.webview_window, GWL_EXSTYLE));
                            TT_LOG_INFO(
                                "WebView2 hosting mode: composition ex=0x{:#X}",
                                static_cast<uint32_t>(ex));
                            return finish_webview_controller_setup(state);
                        })
                        .Get());
            })
            .Get());
    if (FAILED(hr))
    {
        TT_LOG_INFO(
            "WebView2 initialization failed ({:#X}); UI will remain hidden",
            static_cast<uint32_t>(hr));
    }
    return SUCCEEDED(hr);
}

void show_native_window(TrayState &state)
{
    state.user_closed_ui.store(false);
    if (!state.webview2_available)
    {
        prompt_webview2_install();
        return;
    }
    if (!ensure_native_webview(state))
    {
        return;
    }
    if (!state.webview_window)
    {
        return;
    }
    apply_webview_window_icons(state);
    apply_saved_window_state(state);
    ShowWindow(state.webview_window, SW_SHOW);
    set_no_redirection_bitmap(state.webview_window, true);
    SetForegroundWindow(state.webview_window);
    close_splash_window();
}

std::wstring format_rate(uint64_t bytes)
{
    constexpr uint64_t KiB = 1024;
    constexpr uint64_t MiB = 1024 * 1024;
    std::wstringstream ss;
    if (bytes >= MiB)
        ss << std::fixed << std::setprecision(1)
           << (bytes / static_cast<double>(MiB)) << L" MiB/s";
    else if (bytes >= KiB)
        ss << std::fixed << std::setprecision(0)
           << (bytes / static_cast<double>(KiB)) << L" KiB/s";
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

void focus_or_launch_ui(TrayState &state)
{
    AllowSetForegroundWindow(ASFW_ANY);
    if (state.ui_attached.load() && tt::tray::rpc::request_ui_focus(state))
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
                SearchContext ctx{focus_key, nullptr};

                EnumWindows(
                    [](HWND hwnd, LPARAM lp) -> BOOL
                    {
                        auto *pCtx = reinterpret_cast<SearchContext *>(lp);
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
    if (!hwnd)
        return;

    const DWM_WINDOW_CORNER_PREFERENCE pref = DWMWCP_ROUND;
    DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &pref,
                          sizeof(pref));
}

/*
void apply_rounded_corners_for_size(HWND hwnd, int width, int height)
{
    if (!hwnd)
    {
        return;
    }

    struct RegionCacheEntry
    {
        HWND hwnd = nullptr;
        int w = -1;
        int h = -1;
        int radius = -1;
        bool zoomed = false;
    };

    static std::array<RegionCacheEntry, 4> g_region_cache{};
    auto find_cache = [&](HWND key) -> RegionCacheEntry *
    {
        for (auto &entry : g_region_cache)
        {
            if (entry.hwnd == key)
            {
                return &entry;
            }
        }
        for (auto &entry : g_region_cache)
        {
            if (entry.hwnd == nullptr)
            {
                entry.hwnd = key;
                return &entry;
            }
        }
        g_region_cache[0].hwnd = key;
        return &g_region_cache[0];
    };

    if (IsZoomed(hwnd))
    {
        if (auto *entry = find_cache(hwnd);
            entry && entry->zoomed && entry->w == width && entry->h == height)
        {
            return;
        }
        SetWindowRgn(hwnd, nullptr, TRUE);
        if (auto *entry = find_cache(hwnd))
        {
            entry->w = width;
            entry->h = height;
            entry->radius = 0;
            entry->zoomed = true;
        }
        return;
    }

    int w = std::max(0, width);
    int h = std::max(0, height);
    if (w <= 0 || h <= 0)
    {
        return;
    }

    float radius_f = kWindowCornerRadiusDip *
                     (static_cast<float>(GetDpiForWindow(hwnd)) / 96.0f);
    float max_radius = std::max(
        0.0f, std::min(static_cast<float>(w), static_cast<float>(h)) / 2.0f);
    radius_f = std::min(radius_f, max_radius);
    int radius = std::max(0, static_cast<int>(std::lround(radius_f)));

    if (auto *entry = find_cache(hwnd); entry && !entry->zoomed &&
                                        entry->w == w && entry->h == h &&
                                        entry->radius == radius)
    {
        return;
    }

    // CreateRoundRectRgn takes the ellipse width/height, not the radius.
    HRGN rgn = CreateRoundRectRgn(0, 0, w + 1, h + 1, radius * 2, radius * 2);
    if (!rgn)
    {
        return;
    }
    if (SetWindowRgn(hwnd, rgn, TRUE) == 0)
    {
        DeleteObject(rgn);
        return;
    }

    if (auto *entry = find_cache(hwnd))
    {
        entry->w = w;
        entry->h = h;
        entry->radius = radius;
        entry->zoomed = false;
    }
}
    */

void apply_system_backdrop_type(HWND hwnd, DWORD type)
{
    if (!hwnd)
    {
        return;
    }
    safe_dwm_set_window_attribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, &type,
                                  sizeof(type));
}

void enable_acrylic(HWND hwnd)
{
    HMODULE hUser32 = GetModuleHandleW(L"user32.dll");
    auto fn = (SetWindowCompositionAttributeFn)GetProcAddress(
        hUser32, "SetWindowCompositionAttribute");
    if (!fn)
    {
        return;
    }
    ACCENT_POLICY policy{ACCENT_ENABLE_BLURBEHIND, 0, 0xCCFFFFFF, 0};
    WINDOWCOMPOSITIONATTRIBDATA data{19, &policy, sizeof(policy)};
    SetLastError(ERROR_SUCCESS);
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
    case WM_SIZE:
    {
        // RECT rc{};
        //  GetClientRect(hwnd, &rc);
        apply_rounded_corners(hwnd);
        // apply_rounded_corners_for_size(hwnd, rc.right, rc.bottom);
        return 0;
    }
    case WM_DPICHANGED:
    {
        RECT *suggested = (RECT *)lparam;
        SetWindowPos(hwnd, nullptr, suggested->left, suggested->top,
                     suggested->right - suggested->left,
                     suggested->bottom - suggested->top,
                     SWP_NOZORDER | SWP_NOACTIVATE);

        // RECT rc{};
        //  GetClientRect(hwnd, &rc);
        apply_rounded_corners(hwnd);
        // apply_rounded_corners_for_size(hwnd, rc.right, rc.bottom);
        return 0;
    }

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
static void enable_dwm_frame(HWND hwnd)
{
    MARGINS m = {-1};
    DwmExtendFrameIntoClientArea(hwnd, &m);
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
      //  enable_dwm_frame(hwnd);
        apply_rounded_corners(hwnd);
        apply_system_backdrop_type(hwnd, DWMSBT_NONE);
        enable_acrylic(hwnd);
        SetTimer(hwnd, kSplashAutoCloseTimerId, 10000, nullptr);
        g_splash_hwnd.store(hwnd);
    }
}

// --- RPC Handlers ---

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
    if (auto *value = yyjson_obj_get(ui_root, "autoOpen");
        value && yyjson_is_bool(value))
    {
        result.auto_open_ui = yyjson_get_bool(value);
    }
    if (auto *value = yyjson_obj_get(ui_root, "autorunHidden");
        value && yyjson_is_bool(value))
    {
        result.hide_ui_when_autorun = yyjson_get_bool(value);
    }
    if (auto *value = yyjson_obj_get(ui_root, "showSplash");
        value && yyjson_is_bool(value))
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

bool register_drop_target(TrayState &state)
{
    if (!state.webview_window)
    {
        return false;
    }
    if (state.drop_target)
    {
        return true;
    }
    auto handler = [&state](std::wstring const &path)
    { tt::tray::rpc::handle_dropped_torrent(state, path); };
    auto drop_target = Microsoft::WRL::Make<TrayDropTarget>(handler);
    if (!drop_target)
    {
        return false;
    }
    HRESULT hr = RegisterDragDrop(state.webview_window, drop_target.Get());
    if (FAILED(hr))
    {
        TT_LOG_WARN("tray drop: RegisterDragDrop failed ({:#X})",
                    static_cast<uint32_t>(hr));
        return false;
    }
    state.drop_target = drop_target;
    return true;
}

void unregister_drop_target(TrayState &state)
{
    if (state.webview_window && state.drop_target)
    {
        RevokeDragDrop(state.webview_window);
        state.drop_target.Reset();
    }
}

TrayStatus rpc_get_tray_status(TrayState &state)
{
    TrayStatus s;
    s.rpc_success = false;
    auto body = tt::tray::rpc::post_rpc_request(
        state, R"({"method":"session-tray-status"})");
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
            if (state->auto_open_requested && !state->user_closed_ui.load())
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
            tt::tray::rpc::post_rpc_request(
                *state, target ? "{\"method\":\"session-pause-all\"}"
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
    bool com_initialized =
        SUCCEEDED(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED));
    bool webview2_available =
        com_initialized && is_webview2_runtime_available();

    int argc_w = 0;
    LPWSTR *argv_w = CommandLineToArgvW(GetCommandLineW(), &argc_w);
    bool start_hidden = false;
    bool has_run_seconds = false;
    if (wcsstr(GetCommandLineW(), L"--run-seconds") != nullptr)
    {
        has_run_seconds = true;
        start_hidden = true;
    }
    bool has_data_root_override =
        GetEnvironmentVariableW(L"TT_DATA_ROOT", nullptr, 0) > 0;
    std::vector<std::string> argv_storage;
    std::vector<char *> argv_ptrs;
    if (argv_w && argc_w > 0)
    {
        argv_storage.reserve(static_cast<size_t>(argc_w));
        argv_ptrs.reserve(static_cast<size_t>(argc_w));
        for (int i = 0; i < argc_w; ++i)
        {
            std::wstring wide_arg(argv_w[i] ? argv_w[i] : L"");
            if (wide_arg == kStartHiddenArg)
            {
                start_hidden = true;
            }
            if (wide_arg.rfind(L"--run-seconds", 0) == 0)
            {
                has_run_seconds = true;
                start_hidden = true;
            }
            argv_storage.emplace_back(narrow(wide_arg));
        }
        for (auto &arg : argv_storage)
        {
            argv_ptrs.push_back(const_cast<char *>(arg.c_str()));
        }
        LocalFree(argv_w);
        argv_w = nullptr;
    }
    else
    {
        if (argv_w)
        {
            LocalFree(argv_w);
            argv_w = nullptr;
        }
        argv_storage.emplace_back("TinyTorrent");
        argv_ptrs.push_back(argv_storage.back().data());
    }

    // Single instance mutex
    HANDLE hMutex = nullptr;
    if (!has_run_seconds || !has_data_root_override)
    {
        hMutex =
            CreateMutexW(nullptr, TRUE, L"TinyTorrent_SingleInstance_Mutex");
        if (GetLastError() == ERROR_ALREADY_EXISTS)
        {
            HWND ex = FindWindowW(L"TinyTorrentTrayWindow", nullptr);
            if (ex)
                PostMessageW(ex, kTrayCallbackMessage, 0, WM_LBUTTONDBLCLK);
            if (hMutex)
                CloseHandle(hMutex);
            if (com_initialized)
            {
                CoUninitialize();
            }
            return 0;
        }
    }

    HICON icon_large =
        (HICON)LoadImageW(hInstance, MAKEINTRESOURCEW(IDI_TINYTORRENT),
                          IMAGE_ICON, 256, 256, LR_DEFAULTCOLOR);
    HICON icon_small =
        (HICON)LoadImageW(hInstance, MAKEINTRESOURCEW(IDI_TINYTORRENT),
                          IMAGE_ICON, GetSystemMetrics(SM_CXSMICON),
                          GetSystemMetrics(SM_CYSMICON), LR_DEFAULTCOLOR);

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
    state->webview2_available = webview2_available;
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
            tt::app::daemon_main(static_cast<int>(argv_ptrs.size()),
                                 argv_ptrs.data(), &ready_p);
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
