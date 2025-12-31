# WinAcrylicAPI (Win32 Acrylic + Frameless + WebView2 Composition + DirectComposition)


version: 1.1.

History
version 1.0 - written by GPT 5.2
version 1.1 - updated 1.0 with Gemini 3 Pro 


This document is a practical reference for building a **frameless Win32 window** that uses:

- **Custom acrylic / blur** via the **undocumented** `SetWindowCompositionAttribute` API (`WCA_ACCENT_POLICY`), and
- A **composition-hosted WebView2** surface rendered through a **DirectComposition** visual tree,

while preserving a critical user-facing property: **interactive resize stays phase-locked** (no visible lag, jitter, inversion, or cropping during the drag).

The emphasis is not “how to write a window”, but “how to use the relevant Windows APIs correctly” and what **contracts** (message ordering + synchronization) must be preserved.

---

## 1) Glossary

- **Acrylic (custom)**: A blur/tint effect enabled through `SetWindowCompositionAttribute`, not through DWM system backdrops.
- **DWM**: Desktop Window Manager. Composes windows and applies activation/visual policies.
- **DirectComposition (DComp)**: A compositor API used to build a visual tree that targets an HWND.
- **Composition hosting (WebView2)**: WebView2 mode where the browser renders into a composition surface bound to a DComp visual.
- **Interactive resize loop**: The modal sizing loop initiated by `WM_SYSCOMMAND` `SC_SIZE` and driven by `WM_SIZING`, bounded by `WM_ENTERSIZEMOVE`/`WM_EXITSIZEMOVE`.

---

## 2) Compatibility and Safety Notes (Read First)

### 2.1 Undocumented API disclaimer

`SetWindowCompositionAttribute` and its related enums/structs are **not documented by Microsoft**. They are widely used in the field, but:

- The export may be missing on some systems.
- The behavior and accepted values can change between Windows releases.
- You must treat acrylic as “best effort” and have a clean fallback.

### 2.2 Version-dependent DWM attributes

Several DWM attributes used for “no border / no caption tint / stable activation” are version-dependent. Always:

- Check return values from `DwmSetWindowAttribute`.
- Expect `E_INVALIDARG (0x80070057)` when unsupported.

### 2.3 Why resize correctness is special with composition-hosted surfaces

When a window hosts a composition surface (WebView2 composition) and also uses DComp, three systems must stay synchronized:

1) Win32 window geometry (what the OS thinks the window rect is)
2) WebView2 controller bounds (where WebView2 renders)
3) DComp visuals/clips (what actually becomes visible)

Interactive resizing is where these systems most easily drift out of phase.

### 2.4 Accessibility: High Contrast Mode

If the user has High Contrast Mode enabled, transparency effects can make text illegible.

- **Check:** `SystemParametersInfo(SPI_GETHIGHCONTRAST, ...)`
- **Action:** If `HCF_HIGHCONTRASTON` is set, **disable** Acrylic/Blur. Fall back to a solid, opaque background color matching `GetSysColor(COLOR_WINDOW)`.

---

## 3) Custom Acrylic / Blur via `SetWindowCompositionAttribute`

### 3.1 Function definition

**DLL:** `user32.dll`  
**Export name:** `"SetWindowCompositionAttribute"`  
**Signature:**

```cpp
BOOL WINAPI SetWindowCompositionAttribute(
  HWND hwnd,
  WINDOWCOMPOSITIONATTRIBDATA* data
);
```

You typically obtain it via:

- `GetModuleHandleW(L"user32.dll")`
- `GetProcAddress(hUser32, "SetWindowCompositionAttribute")`

If it is not available, skip acrylic.

### 3.2 Structures and enums (commonly used definitions)

#### 3.2.1 `WINDOWCOMPOSITIONATTRIBDATA`

```cpp
typedef struct WINDOWCOMPOSITIONATTRIBDATA {
  int    Attrib;
  PVOID  pvData;
  SIZE_T cbData;
} WINDOWCOMPOSITIONATTRIBDATA;
```

#### 3.2.2 `WINDOWCOMPOSITIONATTRIB` (partial)

The attribute used to configure blur/acrylic is:

- `WCA_ACCENT_POLICY = 19`

#### 3.2.3 `ACCENT_POLICY`

```cpp
typedef struct ACCENT_POLICY {
  int   AccentState;   // ACCENT_STATE
  DWORD AccentFlags;   // commonly 0
  DWORD GradientColor; // 0xAARRGGBB (A=alpha, then RGB)
  DWORD AnimationId;   // commonly 0
} ACCENT_POLICY;
```

`GradientColor` is a packed color:

- `0xAARRGGBB`
  - `AA`: alpha (opacity of the tint layer)
  - `RR`, `GG`, `BB`: tint color channels

Example: `0xCCFFFFFF` is a translucent white overlay.

#### 3.2.4 `ACCENT_STATE` (common values)

These values are widely observed but not officially documented:

- `ACCENT_DISABLED = 0`
- `ACCENT_ENABLE_GRADIENT = 1`
- `ACCENT_ENABLE_TRANSPARENTGRADIENT = 2`
- `ACCENT_ENABLE_BLURBEHIND = 3`
- `ACCENT_ENABLE_ACRYLICBLURBEHIND = 4`
- `ACCENT_ENABLE_HOSTBACKDROP = 5` (availability varies)

### 3.3 Minimal usage pattern (illustrative)

```cpp
// Values:
// - WCA_ACCENT_POLICY = 19
// - ACCENT_ENABLE_ACRYLICBLURBEHIND = 4
// - GradientColor = 0xCCFFFFFF (AA=0xCC, RGB=white)
ACCENT_POLICY policy{};
policy.AccentState = 4;
policy.AccentFlags = 0;
policy.GradientColor = 0xCCFFFFFF;
policy.AnimationId = 0;

WINDOWCOMPOSITIONATTRIBDATA data{};
data.Attrib = 19;
data.pvData = &policy;
data.cbData = sizeof(policy);

SetWindowCompositionAttribute(hwnd, &data);
```

---

## 4) DWM Attributes for Frameless, Borderless, Stable Activation

### 4.1 `DwmSetWindowAttribute`

**Header:** `dwmapi.h`  
**Library:** `Dwmapi.lib`  
**Signature:**

```cpp
HRESULT DwmSetWindowAttribute(
  HWND    hwnd,
  DWORD   dwAttribute,
  LPCVOID pvAttribute,
  DWORD   cbAttribute
);
```

### 4.1.2 `DwmGetWindowAttribute`

**Header:** `dwmapi.h`  
**Library:** `Dwmapi.lib`  
**Signature:**

```cpp
HRESULT DwmGetWindowAttribute(
  HWND hwnd,
  DWORD dwAttribute,
  PVOID pvAttribute,
  DWORD cbAttribute
);
```

**Common use**

- Query `DWMWA_EXTENDED_FRAME_BOUNDS (9)` into a `RECT` to obtain the compositor’s notion of the window bounds (useful when dealing with frameless windows and hit-testing).

### 4.1.1 `DwmDefWindowProc`

**Header:** `dwmapi.h`  
**Library:** `Dwmapi.lib`  
**Signature:**

```cpp
BOOL DwmDefWindowProc(
  HWND hwnd,
  UINT msg,
  WPARAM wParam,
  LPARAM lParam,
  LRESULT* plResult
);
```

**What it does**

- Lets DWM handle certain non-client and hit-test behaviors in a way that stays consistent with the OS compositor.

**Typical usage**

- In your `WM_NCHITTEST (0x0084)` handler:
  - call `DwmDefWindowProc(...)`
  - if it returns `TRUE`, return `*plResult` (unless you intentionally override specific cases).

### 4.2 `DwmFlush`

**Header:** `dwmapi.h`  
**Library:** `Dwmapi.lib`  
**Signature:**

```cpp
HRESULT DwmFlush(void);
```

**What it does**

- Blocks until DWM has processed pending composition work.

**Use cases**

- Ensuring DWM attribute changes (border/caption colors) are applied before a non-client paint boundary.
- Forcing certain activation-time visuals to settle deterministically.

**Caution**

- `DwmFlush` can add latency. Overusing it inside tight loops (like per-frame sizing) can introduce jank.

### 4.4 Boolean values

When you see `BOOL` in these APIs, the canonical values are:

- `FALSE = 0`
- `TRUE = 1`

### 4.3 Attribute IDs and values (with numeric constants)

These attribute IDs are used to neutralize system visuals that can appear on frameless windows:

- `DWMWA_NCRENDERING_ENABLED = 1` (`BOOL`)
- `DWMWA_NCRENDERING_POLICY = 2` (`DWMNCRENDERINGPOLICY`)
- `DWMWA_ALLOW_NCPAINT = 4` (`BOOL`)
- `DWMWA_EXTENDED_FRAME_BOUNDS = 9` (`RECT`)
- `DWMWA_USE_IMMERSIVE_DARK_MODE = 20` (`BOOL`)
- `DWMWA_WINDOW_CORNER_PREFERENCE = 33` (`DWM_WINDOW_CORNER_PREFERENCE`)
- `DWMWA_BORDER_COLOR = 34` (`COLORREF`)
- `DWMWA_CAPTION_COLOR = 35` (`COLORREF`)
- `DWMWA_TEXT_COLOR = 36` (`COLORREF`)
- `DWMWA_VISIBLE_FRAME_BORDER_THICKNESS = 37` (`UINT`)
- `DWMWA_SYSTEMBACKDROP_TYPE = 38` (`DWORD`)

Special color payload constants:

- `DWMWA_COLOR_NONE = 0xFFFFFFFE`
- `DWMWA_COLOR_DEFAULT = 0xFFFFFFFF`

`COLORREF` encoding reminder (Win32):

- `COLORREF` is `0x00BBGGRR` (low byte is red, then green, then blue).
- Many DWM color attributes also accept the special values `DWMWA_COLOR_NONE (0xFFFFFFFE)` and `DWMWA_COLOR_DEFAULT (0xFFFFFFFF)` where applicable.

System backdrop values (`DWMWA_SYSTEMBACKDROP_TYPE` payload):

- `DWMSBT_AUTO = 0`
- `DWMSBT_NONE = 1`
- `DWMSBT_MAINWINDOW = 2` (Mica)
- `DWMSBT_TRANSIENTWINDOW = 3` (Acrylic)
- `DWMSBT_TABBEDWINDOW = 4`

Corner preference values (`DWMWA_WINDOW_CORNER_PREFERENCE` payload):

- `DWMWCP_DEFAULT = 0`
- `DWMWCP_DONOTROUND = 1`
- `DWMWCP_ROUND = 2`
- `DWMWCP_ROUNDSMALL = 3`

`DWMNCRENDERINGPOLICY` values (payload for `DWMWA_NCRENDERING_POLICY (2)`):

- `DWMNCRP_USEWINDOWSTYLE = 0`
- `DWMNCRP_DISABLED = 1`
- `DWMNCRP_ENABLED = 2`

### 4.5 Policy note: System backdrops vs custom acrylic

If you use custom acrylic (`SetWindowCompositionAttribute`), set:

- `DWMWA_SYSTEMBACKDROP_TYPE (38)` to `DWMSBT_NONE (1)`

to avoid the system-managed backdrops conflicting with your own.

---

## 5) Frameless Window Geometry and Hit-Testing (Win32 Messages)

### 5.1 `WM_NCCALCSIZE` (0x0083)

**Purpose**

- Defines how much of the window is non-client vs client.

**Frameless behavior**

- When `wParam != 0`, returning `0` generally yields an “all client area” window.

**CRITICAL: Maximized Window Fix**

- If you simply return `0` when maximized, the content will be clipped by the monitor bezel (OS expands the window to hide frame).
- You must manually inset the rectangle when `IsZoomed(hwnd)` is true.

```cpp
// Inside WM_NCCALCSIZE handler (wParam == TRUE):
// Check if window is maximized
WINDOWPLACEMENT placement = { sizeof(WINDOWPLACEMENT) };
if (GetWindowPlacement(hwnd, &placement) && placement.showCmd == SW_SHOWMAXIMIZED) {
    NCCALCSIZE_PARAMS* params = (NCCALCSIZE_PARAMS*)lParam;

    // Get border thickness
    int borderX = GetSystemMetrics(SM_CXFRAME) + GetSystemMetrics(SM_CXPADDEDBORDER);
    int borderY = GetSystemMetrics(SM_CYFRAME) + GetSystemMetrics(SM_CXPADDEDBORDER);

    // Inset client rect
    params->rgrc[0].left   += borderX;
    params->rgrc[0].top    += borderY;
    params->rgrc[0].right  -= borderX;
    params->rgrc[0].bottom -= borderY;
}
return 0;
```

### 5.2 `WM_NCHITTEST` (0x0084)

**Purpose**

- Asks your window what UI region is under the mouse.

Common `HT*` results (numeric values):

- `HTCLIENT = 1`
- `HTCAPTION = 2`
- `HTMAXBUTTON = 9` (Required for Windows 11 Snap Layouts)
- `HTLEFT = 10`
- `HTRIGHT = 11`
- `HTTOP = 12`
- `HTTOPLEFT = 13`
- `HTTOPRIGHT = 14`
- `HTBOTTOM = 15`
- `HTBOTTOMLEFT = 16`
- `HTBOTTOMRIGHT = 17`

**Recommended order**

1) Call `DwmDefWindowProc` (if it handles the message, honor its answer for special cases).
2) If mouse is over your custom "Maximize" button, return `HTMAXBUTTON (9)`. **This enables the Windows 11 Snap Layout flyout.**
3) Otherwise, compute your own region and return an `HT*` value.

### 5.3 `WM_SETCURSOR` (0x0020)

**Purpose**

- Lets your window set the cursor shape.

**Why it matters**

- If resizing is implemented within `HTCLIENT`, you must still provide correct resize cursors.

### 5.4 Initiating OS-managed resizing: `WM_SYSCOMMAND` / `SC_SIZE`

**Message:** `WM_SYSCOMMAND = 0x0112`  
**Command base:** `SC_SIZE = 0xF000`

To start the OS interactive size loop, send:

`WM_SYSCOMMAND` with `wParam = SC_SIZE + edge`

Edges (`WMSZ_*`) and numeric values:

- `WMSZ_LEFT = 1`
- `WMSZ_RIGHT = 2`
- `WMSZ_TOP = 3`
- `WMSZ_TOPLEFT = 4`
- `WMSZ_TOPRIGHT = 5`
- `WMSZ_BOTTOM = 6`
- `WMSZ_BOTTOMLEFT = 7`
- `WMSZ_BOTTOMRIGHT = 8`

### 5.5 Background erasure and paint (composition-hosted content)

Messages:

- `WM_ERASEBKGND = 0x0014`
- `WM_PAINT = 0x000F`

If your window’s visible content is entirely provided by a composition surface (WebView2 composition) and/or DirectComposition:

- Returning nonzero from `WM_ERASEBKGND` commonly avoids flicker (it tells Windows you handled background erase).
- In `WM_PAINT`, avoid painting an opaque background unless you intend to cover the entire client area; unnecessary painting can create transient flashes during resize/activation.

---

## 6) Interactive Resize Contract (Critical for Composition Hosting)

### 6.1 Messages involved (numeric values)

- `WM_ENTERSIZEMOVE = 0x0231`
- `WM_EXITSIZEMOVE = 0x0232`
- `WM_SIZING = 0x0214`
- `WM_SIZE = 0x0005`

### 6.2 What `WM_SIZING` actually provides

In `WM_SIZING`, `lParam` points to a `RECT` (screen coordinates) describing the **current speculative window rectangle** during the drag.

This rectangle is the only geometry that is guaranteed to reflect the *current cursor position* during interactive sizing.

### 6.3 The invariants you must preserve

When hosting a composition surface (WebView2 composition) with DComp:

1) **One authoritative geometry source during the drag**
   - During an active sizing loop, treat `WM_SIZING (0x0214)` as the authoritative input.

2) **No competing geometry from `WM_SIZE` while the sizing loop is active**
   - `WM_SIZE (0x0005)` fires during sizing too. If you apply geometry from both, you can create a “fight” between two rect sources.

3) **Apply the same speculative rect to both WebView bounds and DComp geometry**
   - If WebView bounds and DComp clip/visual rect are derived from different sources, the rendered surface can be visibly out of phase.

4) **Commit DComp updates as part of the sizing tick**
   - Each speculative update should result in a DComp `Commit()` so the new geometry becomes visible promptly.

5) **Synchronize when necessary**
   - If you observe phase lag between the window frame and the content, the common synchronization tools are:
     - `IDCompositionDevice::WaitForCommitCompletion()`
     - `DwmFlush()`
   - Use these carefully; they are correctness tools, not performance tools.

6) **Finalize once**
   - On `WM_EXITSIZEMOVE (0x0232)`, perform a final layout based on the actual client rect and then clear your “in sizing loop” flag.

### 6.4 Common failure patterns (what breaks resize)

These are the most common ways a “cleanup” breaks interactive resize with composition-hosted content:

- **Driving layout from `WM_SIZE` during the drag** (competes with `WM_SIZING`)
- **Updating WebView bounds from one rect source and DComp clip from another**
- **Deferring synchronization until the end of the drag** (content becomes visibly behind during the drag)
- **Removing commit pacing** (commits happen, but not at the points that matter for interactive feedback)

### 6.5 A minimal message-driven recipe (implementation outline)

This is a high-level outline of how the APIs are typically composed; it is intentionally message-driven because interactive resize correctness depends on message boundaries.

1) Create a frameless window:
   - handle `WM_NCCALCSIZE (0x0083)` to remove the standard frame (with maximised inset fix).
2) Implement edge hit-testing:
   - handle `WM_NCHITTEST (0x0084)` and return `HTLEFT (10)`, `HTTOP (12)`, etc. for edges.
3) Initiate sizing via the system loop:
   - on mouse down in an edge zone, send `WM_SYSCOMMAND (0x0112)` with `SC_SIZE (0xF000) + WMSZ_*`.
4) Gate your sizing state:
   - set a boolean on `WM_ENTERSIZEMOVE (0x0231)`
   - clear it after final layout on `WM_EXITSIZEMOVE (0x0232)`
5) Drive geometry from `WM_SIZING (0x0214)` while the gate is set:
   - derive a client-like `RECT` (commonly `{0,0,width,height}` from the speculative window rect size)
   - update WebView bounds and DComp clip from the same derived rect
   - `Commit()` and synchronize if required (`WaitForCommitCompletion()` / `DwmFlush()`)
6) Suppress competing updates:
   - while the sizing gate is set, do not apply layout in `WM_SIZE (0x0005)`

---

## 7) DPI Changes (`WM_DPICHANGED`) and Pixel Models

### 7.1 Message definition

**Message:** `WM_DPICHANGED = 0x02E0`

### 7.2 Manifest Requirement (Crucial)

You MUST declare **PerMonitorV2** DPI awareness in your application manifest. Without this, the OS may virtualize coordinates, making high-precision frameless resizing blurry or inaccurate.

```xml
<application xmlns="urn:schemas-microsoft-com:asm.v3">
  <windowsSettings>
    <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness>
  </windowsSettings>
</application>
```

### 7.3 Parameters

- `wParam`: new DPI packed as:
  - `LOWORD(wParam)` = X DPI
  - `HIWORD(wParam)` = Y DPI
  - Example: `144` DPI corresponds to 150% scaling (`144 / 96 = 1.5`)
- `lParam`: pointer to a suggested `RECT` (screen coords) for the new window size/position.

### 7.4 Required actions (recommended)

1) Apply the suggested window rectangle via `SetWindowPos`.
2) Update your content’s DPI scaling policy.
3) Recompute and apply layout for the new client size.

### 7.5 Win32 constants commonly used with DPI sizing

System metric indices (for `GetSystemMetricsForDpi`):

- `SM_CXSIZEFRAME = 32`
- `SM_CYSIZEFRAME = 33`
- `SM_CXPADDEDBORDER = 92`

---

## 8) DirectComposition (DComp) Integration

### 8.1 Creating a D3D device (D3D11)

**API:** `D3D11CreateDevice`  
**Flag:** `D3D11_CREATE_DEVICE_BGRA_SUPPORT = 0x20`

BGRA support is required for compatibility with DirectComposition.

### 8.2 Creating the DComp device

**API:** `DCompositionCreateDevice2(ID3D11Device*, REFIID, void**)`

This produces an `IDCompositionDevice` used to create visuals, clips, and the target for an HWND.

### 8.3 Targeting an HWND

**API:** `IDCompositionDevice::CreateTargetForHwnd(HWND hwnd, BOOL topmost, IDCompositionTarget** out)`

You then call:

- `IDCompositionTarget::SetRoot(IDCompositionVisual* root)`

### 8.4 Visual border sampling

**API:** `IDCompositionVisual::SetBorderMode(DCOMPOSITION_BORDER_MODE mode)`

Common values:

- `DCOMPOSITION_BORDER_MODE_SOFT = 0`
- `DCOMPOSITION_BORDER_MODE_HARD = 1`

`HARD (1)` clamps sampling at visual edges and can reduce edge artifacts during fast interactive updates.

### 8.5 Commit and synchronization

- `IDCompositionDevice::Commit()` submits changes.
- `IDCompositionDevice::WaitForCommitCompletion()` blocks until commits complete.

Use `WaitForCommitCompletion` as a correctness tool when interactive sizing must remain phase-locked.

### 8.6 `WS_EX_NOREDIRECTIONBITMAP` (0x00200000)

**What it is**

- An extended window style that disables the legacy “redirection bitmap” surface for the window.

**Why it is commonly used with composition**

- It can reduce intermediate buffering paths and is frequently used for windows that are primarily composed via DComp and other GPU surfaces.

**Caution**

- It can change how certain fallback rendering paths behave. Test carefully if you rely on GDI painting or legacy child HWND content.

---

## 9) WebView2 Composition Hosting (DirectComposition Targeting)

### 9.1 Core calls

In composition hosting, you create a composition controller and direct it to a DComp visual:

- `CreateCoreWebView2CompositionController(HWND parent, ...)`
- `ICoreWebView2CompositionController::put_RootVisualTarget(IDCompositionVisual*)`

This binds the WebView2 rendered output into your DComp visual tree.

### 9.2 Bounds control

- `ICoreWebView2Controller::put_Bounds(RECT bounds)`

### 9.3 Enable Transparency (Crucial for Acrylic)

By default, WebView2 renders an opaque background (usually white), which blocks your custom acrylic. You must explicitly set the background color to transparent.

**Interface:** `ICoreWebView2Controller2` (or higher)

```cpp
// 0x00000000 = Fully transparent
COREWEBVIEW2_COLOR transparentColor = { 0, 0, 0, 0 };
webviewController2->put_DefaultBackgroundColor(transparentColor);
```

### 9.4 Popups and Window Movement

WebView2 is out-of-process and does not automatically know when the parent window moves. This causes HTML dropdowns/popups to detach and float in the wrong position during drags.

**Fix:** Call `NotifyParentWindowPositionChanged` on move messages.

```cpp
// In WndProc:
case WM_MOVE:
case WM_MOVING:
    if (g_webviewController) {
        g_webviewController->NotifyParentWindowPositionChanged();
    }
    break;
```

### 9.5 DPI / pixel model control

If available, the controller supports:

- `ICoreWebView2Controller3::put_BoundsMode(COREWEBVIEW2_BOUNDS_MODE_USE_RAW_PIXELS)`
  - Value: `COREWEBVIEW2_BOUNDS_MODE_USE_RAW_PIXELS = 0`
- Alternate value (scales bounds by rasterization scale):
  - `COREWEBVIEW2_BOUNDS_MODE_USE_RASTERIZATION_SCALE = 1`
- `ICoreWebView2Controller3::put_ShouldDetectMonitorScaleChanges(BOOL)`
- `ICoreWebView2Controller3::put_RasterizationScale(double)`
  - Commonly `dpi / 96.0`

### 9.6 Optional: Non-client region mapping

If available:

- `ICoreWebView2CompositionController4::GetNonClientRegionAtPoint(...)`

This can be used to map HTML-defined draggable regions to `HTCAPTION (2)` for a frameless window.

---

## Appendix A) Frequently Used Win32 Constants (Numeric Values)

Window styles:

- `WS_POPUP = 0x80000000`
- `WS_SYSMENU = 0x00080000`
- `WS_MINIMIZEBOX = 0x00020000`
- `WS_MAXIMIZEBOX = 0x00010000`
- `WS_THICKFRAME = 0x00040000`
- `WS_SIZEBOX = 0x00040000` (alias of `WS_THICKFRAME`)

Extended styles:

- `WS_EX_NOREDIRECTIONBITMAP = 0x00200000`

SetWindowPos flags (subset):

- `SWP_NOSIZE = 0x0001`
- `SWP_NOMOVE = 0x0002`
- `SWP_NOZORDER = 0x0004`
- `SWP_NOACTIVATE = 0x0010`
- `SWP_FRAMECHANGED = 0x0020`

Messages (subset):

- `WM_SIZE = 0x0005`
- `WM_PAINT = 0x000F`
- `WM_ERASEBKGND = 0x0014`
- `WM_SETCURSOR = 0x0020`
- `WM_WINDOWPOSCHANGED = 0x0047`
- `WM_NCCALCSIZE = 0x0083`
- `WM_NCHITTEST = 0x0084`
- `WM_SYSCOMMAND = 0x0112`
- `WM_SIZING = 0x0214`
- `WM_ENTERSIZEMOVE = 0x0231`
- `WM_EXITSIZEMOVE = 0x0232`
- `WM_DPICHANGED = 0x02E0`

System commands:

- `SC_SIZE = 0xF000`
