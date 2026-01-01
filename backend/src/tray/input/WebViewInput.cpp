#include "tray/input/WebViewInput.hpp"

#include <algorithm>
#include <optional>

#include <webview2.h>
#include <windowsx.h>
#include <winuser.h>

namespace
{
COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS
webview_mouse_keys_from_wparam(WPARAM wparam)
{
    COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS keys =
        COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_NONE;
    if (wparam & MK_LBUTTON)
    {
        keys |= COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_LEFT_BUTTON;
    }
    if (wparam & MK_RBUTTON)
    {
        keys |= COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_RIGHT_BUTTON;
    }
    if (wparam & MK_MBUTTON)
    {
        keys |= COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_MIDDLE_BUTTON;
    }
    if (wparam & MK_XBUTTON1)
    {
        keys |= COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_X_BUTTON1;
    }
    if (wparam & MK_XBUTTON2)
    {
        keys |= COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_X_BUTTON2;
    }
    if (wparam & MK_SHIFT)
    {
        keys |= COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_SHIFT;
    }
    if (wparam & MK_CONTROL)
    {
        keys |= COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_CONTROL;
    }
    return keys;
}

std::optional<COREWEBVIEW2_POINTER_EVENT_KIND>
pointer_event_kind_from_message(UINT msg)
{
    switch (msg)
    {
    case WM_POINTERACTIVATE:
        return COREWEBVIEW2_POINTER_EVENT_KIND_ACTIVATE;
    case WM_POINTERDOWN:
        return COREWEBVIEW2_POINTER_EVENT_KIND_DOWN;
    case WM_POINTERUP:
        return COREWEBVIEW2_POINTER_EVENT_KIND_UP;
    case WM_POINTERUPDATE:
        return COREWEBVIEW2_POINTER_EVENT_KIND_UPDATE;
    case WM_POINTERENTER:
        return COREWEBVIEW2_POINTER_EVENT_KIND_ENTER;
    case WM_POINTERLEAVE:
        return COREWEBVIEW2_POINTER_EVENT_KIND_LEAVE;
    default:
        return std::nullopt;
    }
}

} // namespace

RECT compute_webview_controller_bounds_from_client(HWND hwnd, RECT client)
{
    if (client.right < client.left)
    {
        client.right = client.left;
    }
    if (client.bottom < client.top)
    {
        client.bottom = client.top;
    }
    return client;
}

RECT compute_webview_controller_bounds(HWND hwnd)
{
    RECT client{};
    GetClientRect(hwnd, &client);
    return compute_webview_controller_bounds_from_client(hwnd, client);
}

namespace tt::tray::input
{
bool handle_webview_mouse_input(TrayState &state, HWND hwnd, UINT msg,
                                WPARAM wparam, LPARAM lparam)
{
    if (!state.webview_comp_controller.Get() || !state.webview_controller.Get())
    {
        return false;
    }

    COREWEBVIEW2_MOUSE_EVENT_KIND kind{};
    UINT32 mouse_data = 0;
    POINT pt{GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
    bool screen_point = false;

    switch (msg)
    {
    case WM_MOUSEMOVE:
        kind = COREWEBVIEW2_MOUSE_EVENT_KIND_MOVE;
        break;
    case WM_LBUTTONDOWN:
        kind = COREWEBVIEW2_MOUSE_EVENT_KIND_LEFT_BUTTON_DOWN;
        break;
    case WM_LBUTTONUP:
        kind = COREWEBVIEW2_MOUSE_EVENT_KIND_LEFT_BUTTON_UP;
        break;
    case WM_LBUTTONDBLCLK:
        kind = COREWEBVIEW2_MOUSE_EVENT_KIND_LEFT_BUTTON_DOUBLE_CLICK;
        break;
    case WM_RBUTTONDOWN:
        kind = COREWEBVIEW2_MOUSE_EVENT_KIND_RIGHT_BUTTON_DOWN;
        break;
    case WM_RBUTTONUP:
        kind = COREWEBVIEW2_MOUSE_EVENT_KIND_RIGHT_BUTTON_UP;
        break;
    case WM_RBUTTONDBLCLK:
        kind = COREWEBVIEW2_MOUSE_EVENT_KIND_RIGHT_BUTTON_DOUBLE_CLICK;
        break;
    case WM_MBUTTONDOWN:
        kind = COREWEBVIEW2_MOUSE_EVENT_KIND_MIDDLE_BUTTON_DOWN;
        break;
    case WM_MBUTTONUP:
        kind = COREWEBVIEW2_MOUSE_EVENT_KIND_MIDDLE_BUTTON_UP;
        break;
    case WM_MBUTTONDBLCLK:
        kind = COREWEBVIEW2_MOUSE_EVENT_KIND_MIDDLE_BUTTON_DOUBLE_CLICK;
        break;
    case WM_XBUTTONDOWN:
        kind = COREWEBVIEW2_MOUSE_EVENT_KIND_X_BUTTON_DOWN;
        mouse_data = static_cast<UINT32>(GET_XBUTTON_WPARAM(wparam));
        break;
    case WM_XBUTTONUP:
        kind = COREWEBVIEW2_MOUSE_EVENT_KIND_X_BUTTON_UP;
        mouse_data = static_cast<UINT32>(GET_XBUTTON_WPARAM(wparam));
        break;
    case WM_XBUTTONDBLCLK:
        kind = COREWEBVIEW2_MOUSE_EVENT_KIND_X_BUTTON_DOUBLE_CLICK;
        mouse_data = static_cast<UINT32>(GET_XBUTTON_WPARAM(wparam));
        break;
    case WM_MOUSEWHEEL:
        kind = COREWEBVIEW2_MOUSE_EVENT_KIND_WHEEL;
        mouse_data = static_cast<UINT32>(
            static_cast<SHORT>(HIWORD(static_cast<DWORD>(wparam))));
        screen_point = true;
        break;
    case WM_MOUSEHWHEEL:
        kind = COREWEBVIEW2_MOUSE_EVENT_KIND_HORIZONTAL_WHEEL;
        mouse_data = static_cast<UINT32>(
            static_cast<SHORT>(HIWORD(static_cast<DWORD>(wparam))));
        screen_point = true;
        break;
    default:
        return false;
    }

    if (screen_point && !ScreenToClient(hwnd, &pt))
    {
        return false;
    }

    RECT bounds = compute_webview_controller_bounds(hwnd);
    if (bounds.left >= bounds.right || bounds.top >= bounds.bottom)
    {
        return false;
    }
    bool outside =
        pt.x < bounds.left || pt.x >= bounds.right || pt.y < bounds.top ||
        pt.y >= bounds.bottom;
    if (outside)
    {
        if (GetCapture() == hwnd)
        {
            LONG max_x = bounds.right > bounds.left ? bounds.right - 1 : bounds.left;
            LONG max_y =
                bounds.bottom > bounds.top ? bounds.bottom - 1 : bounds.top;
            pt.x = std::clamp(pt.x, bounds.left, max_x);
            pt.y = std::clamp(pt.y, bounds.top, max_y);
        }
        else
        {
            return false;
        }
    }

    auto keys = webview_mouse_keys_from_wparam(wparam);
    HRESULT hr = state.webview_comp_controller->SendMouseInput(kind, keys,
                                                               mouse_data, pt);
    return SUCCEEDED(hr);
}

bool handle_webview_pointer_input(TrayState &state, HWND hwnd, UINT msg,
                                  WPARAM wparam, LPARAM)
{
    if (!state.webview_comp_controller.Get() || !state.webview_environment3.Get())
    {
        return false;
    }
    auto kind_opt = pointer_event_kind_from_message(msg);
    if (!kind_opt)
    {
        return false;
    }

    UINT32 pointerId = GET_POINTERID_WPARAM(wparam);
    POINTER_INFO pointerInfo{};
    if (!GetPointerInfo(pointerId, &pointerInfo))
    {
        return false;
    }
    if (pointerInfo.pointerType == PT_MOUSE)
    {
        return false;
    }

    Microsoft::WRL::ComPtr<ICoreWebView2PointerInfo> pointer;
    if (FAILED(state.webview_environment3->CreateCoreWebView2PointerInfo(
            &pointer)) ||
        !pointer)
    {
        return false;
    }

    if (FAILED(pointer->put_PointerKind(static_cast<DWORD>(pointerInfo.pointerType))))
    {
        return false;
    }
    pointer->put_PointerId(pointerInfo.pointerId);
    pointer->put_FrameId(pointerInfo.frameId);
    pointer->put_PointerFlags(pointerInfo.pointerFlags);
    pointer->put_Time(pointerInfo.dwTime);
    pointer->put_HistoryCount(pointerInfo.historyCount);
    pointer->put_InputData(pointerInfo.InputData);
    pointer->put_KeyStates(pointerInfo.dwKeyStates);
    pointer->put_PerformanceCount(pointerInfo.PerformanceCount);

    POINT pixel = pointerInfo.ptPixelLocation;
    if (!ScreenToClient(hwnd, &pixel))
    {
        return false;
    }
    pointer->put_PixelLocation(pixel);

    RECT contact_rect{pixel.x, pixel.y, pixel.x + 1, pixel.y + 1};
    pointer->put_PointerDeviceRect(contact_rect);
    pointer->put_DisplayRect(contact_rect);

    POINT pixel_raw = pointerInfo.ptPixelLocationRaw;
    if (!ScreenToClient(hwnd, &pixel_raw))
    {
        return false;
    }
    pointer->put_PixelLocationRaw(pixel_raw);

    pointer->put_ButtonChangeKind(0);

    HRESULT hr = state.webview_comp_controller->SendPointerInput(*kind_opt,
                                                                  pointer.Get());
    return SUCCEEDED(hr);
}
} // namespace tt::tray::input
