#pragma once

#include <optional>
#include <windows.h>
#include <wrl/client.h>

#include "tray/TrayState.hpp"

RECT compute_webview_controller_bounds_from_client(HWND hwnd, RECT client);
RECT compute_webview_controller_bounds(HWND hwnd);

namespace tt::tray::input
{
bool handle_webview_mouse_input(TrayState &state, HWND hwnd, UINT msg,
                                WPARAM wparam, LPARAM lparam);
bool handle_webview_pointer_input(TrayState &state, HWND hwnd, UINT msg,
                                  WPARAM wparam, LPARAM lparam);
} // namespace tt::tray::input
