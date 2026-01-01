#pragma once

#include <atomic>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>

#include <Windows.h>
#include <d3d11.h>
#include <dcomp.h>
#include <shellapi.h>
#include <webview2.h>
#include <winhttp.h>
#include <wrl/client.h>

#include "rpc/UiPreferences.hpp"

class TrayDropTarget;

namespace tt::tray
{
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
    Microsoft::WRL::ComPtr<ID3D11Device> d3d_device;
    Microsoft::WRL::ComPtr<ID3D11DeviceContext> d3d_context;
    Microsoft::WRL::ComPtr<IDCompositionDevice> dcomp_device;
    Microsoft::WRL::ComPtr<IDCompositionTarget> dcomp_target;
    Microsoft::WRL::ComPtr<IDCompositionVisual> dcomp_root_visual;
    Microsoft::WRL::ComPtr<IDCompositionVisual> dcomp_webview_visual;
    Microsoft::WRL::ComPtr<IDCompositionRectangleClip> dcomp_root_clip;
    bool webview_in_size_move = false;

    Microsoft::WRL::ComPtr<ICoreWebView2Controller> webview_controller;
    Microsoft::WRL::ComPtr<ICoreWebView2CompositionController>
        webview_comp_controller;
    Microsoft::WRL::ComPtr<ICoreWebView2CompositionController4>
        webview_comp_controller4;
    Microsoft::WRL::ComPtr<ICoreWebView2Environment3> webview_environment3;
    Microsoft::WRL::ComPtr<ICoreWebView2> webview;
    EventRegistrationToken web_message_token{};
    EventRegistrationToken navigation_token{};
    EventRegistrationToken cursor_token{};
    bool cursor_token_set = false;
    HCURSOR webview_cursor = nullptr;

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
    bool webview2_available = true;
    std::string last_error_message;
    bool start_hidden = false;
    std::wstring splash_message;
    tt::rpc::UiPreferences ui_preferences;
    std::atomic_bool ui_attached{false};
    std::optional<WINDOWPLACEMENT> saved_window_placement;
    Microsoft::WRL::ComPtr<TrayDropTarget> drop_target;
};
} // namespace tt::tray
