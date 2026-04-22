#include <windows.h>
#include <windowsx.h>
#include <commctrl.h>
#include <dwmapi.h>

#ifndef DWMWA_USE_IMMERSIVE_DARK_MODE
#define DWMWA_USE_IMMERSIVE_DARK_MODE 20
#endif
#ifndef DWMWA_WINDOW_CORNER_PREFERENCE
#define DWMWA_WINDOW_CORNER_PREFERENCE 33
#endif
#ifndef DWMWA_BORDER_COLOR
#define DWMWA_BORDER_COLOR 34
#endif
#ifndef DWMWA_CAPTION_COLOR
#define DWMWA_CAPTION_COLOR 35
#endif
#ifndef DWMWA_TEXT_COLOR
#define DWMWA_TEXT_COLOR 36
#endif
#ifndef DWMWA_VISIBLE_FRAME_BORDER_THICKNESS
#define DWMWA_VISIBLE_FRAME_BORDER_THICKNESS 37
#endif
#ifndef DWMWA_COLOR_NONE
#define DWMWA_COLOR_NONE 0xFFFFFFFE
#endif

enum {
    kNavCount = 4,
    kTabCount = 4,
    kCommandCount = 2,
    kSystemButtonCount = 2,
    kColumnCount = 5,
    kSparkCount = 12
};

enum {
    kColumnName = 0,
    kColumnProgress,
    kColumnSpeed,
    kColumnEta,
    kColumnRatio
};

typedef enum ACCENT_STATE {
    ACCENT_ENABLE_ACRYLICBLURBEHIND = 4
} ACCENT_STATE;

typedef struct ACCENT_POLICY {
    ACCENT_STATE AccentState;
    DWORD AccentFlags;
    DWORD GradientColor;
    DWORD AnimationId;
} ACCENT_POLICY;

typedef struct WINDOWCOMPOSITIONATTRIBDATA {
    int Attrib;
    PVOID pvData;
    SIZE_T cbData;
} WINDOWCOMPOSITIONATTRIBDATA;

typedef BOOL(WINAPI *SetWindowCompositionAttributeFn)(
    HWND hwnd,
    WINDOWCOMPOSITIONATTRIBDATA *data
);

typedef struct TorrentRow {
    const wchar_t *name;
    const wchar_t *meta;
    const wchar_t *speed;
    const wchar_t *eta;
    const wchar_t *ratio;
    int progress;
    int spark[kSparkCount];
} TorrentRow;

typedef struct UiState {
    HWND hwnd;
    HWND list;
    UINT dpi;
    HIMAGELIST row_images;
    HFONT font_title;
    HFONT font_subtitle;
    HFONT font_body;
    HFONT font_small;
    HFONT font_bold;
    RECT title_rect;
    RECT sidebar_rect;
    RECT content_rect;
    RECT search_rect;
    RECT summary_rects[3];
    RECT command_rects[kCommandCount];
    RECT system_button_rects[kSystemButtonCount];
    RECT nav_rects[kNavCount];
    RECT list_header_rect;
    RECT list_rect;
    RECT details_rect;
    RECT tab_rects[kTabCount];
    int column_widths[kColumnCount];
    int hot_nav;
    int selected_nav;
    int hot_tab;
    int selected_tab;
    int hot_system;
    int hot_command;
    BOOL tracking_mouse;
} UiState;

static const wchar_t kClassName[] = L"TinyTorrentMockup";
static UiState g_ui = {0};

static const TorrentRow kRows[] = {
    {L"Ubuntu 24.04 Desktop", L"38.2 GB  |  2,148 peers  |  healthy",
     L"18.4 MB/s", L"12 min", L"1.42", 78, {28, 34, 29, 38, 41, 44, 42, 53, 58, 55, 62, 65}},
    {L"Arch Linux ISO Mirror", L"1.1 GB  |  410 peers  |  verified",
     L"6.8 MB/s", L"3 min", L"3.08", 93, {12, 14, 18, 22, 20, 24, 27, 29, 31, 30, 32, 35}},
    {L"Blender Asset Pack", L"12.5 GB  |  821 peers  |  metadata locked",
     L"4.3 MB/s", L"28 min", L"0.84", 41, {10, 12, 9, 14, 16, 15, 17, 19, 21, 20, 22, 24}},
    {L"TinyTorrent Nightly Builds", L"4.6 GB  |  96 peers  |  queued",
     L"1.1 MB/s", L"1 h 8 m", L"0.12", 17, {2, 4, 3, 5, 6, 8, 7, 9, 8, 10, 11, 12}},
    {L"Fedora Workstation", L"2.3 GB  |  612 peers  |  seeding",
     L"0.0 MB/s", L"--", L"6.73", 100, {4, 5, 6, 5, 6, 7, 7, 6, 6, 7, 8, 8}},
    {L"Design Reference Vault", L"86.0 GB  |  53 peers  |  stalled",
     L"128 KB/s", L"5 h 11 m", L"0.37", 9, {1, 1, 2, 1, 2, 3, 2, 3, 4, 3, 4, 5}},
};

static const wchar_t *kNavLabels[kNavCount] = {
    L"Downloading", L"Seeding", L"Completed", L"Activity"
};

static const int kNavCounts[kNavCount] = {4, 12, 38, 3};

static const wchar_t *kTabLabels[kTabCount] = {
    L"Files", L"Peers", L"Trackers", L"Pieces"
};

static const wchar_t *kColumnLabels[kColumnCount] = {
    L"TORRENT", L"PROGRESS", L"SPEED", L"ETA", L"RATIO"
};

static int scale_px(int value)
{
    return MulDiv(value, (int)g_ui.dpi, 96);
}

static RECT rect_make(int left, int top, int right, int bottom)
{
    RECT rc;
    rc.left = left;
    rc.top = top;
    rc.right = right;
    rc.bottom = bottom;
    return rc;
}

static COLORREF color_rgb(BYTE r, BYTE g, BYTE b)
{
    return RGB(r, g, b);
}

static HFONT create_ui_font(int pixel_height, int weight, const wchar_t *face)
{
    return CreateFontW(-pixel_height, 0, 0, 0, weight, FALSE, FALSE, FALSE,
                       DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                       CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                       VARIABLE_PITCH, face);
}

static void destroy_fonts(void)
{
    if (g_ui.font_title) {
        DeleteObject(g_ui.font_title);
        g_ui.font_title = NULL;
    }
    if (g_ui.font_subtitle) {
        DeleteObject(g_ui.font_subtitle);
        g_ui.font_subtitle = NULL;
    }
    if (g_ui.font_body) {
        DeleteObject(g_ui.font_body);
        g_ui.font_body = NULL;
    }
    if (g_ui.font_small) {
        DeleteObject(g_ui.font_small);
        g_ui.font_small = NULL;
    }
    if (g_ui.font_bold) {
        DeleteObject(g_ui.font_bold);
        g_ui.font_bold = NULL;
    }
}

static void rebuild_fonts(void)
{
    destroy_fonts();
    g_ui.font_title = create_ui_font(scale_px(24), FW_SEMIBOLD,
                                     L"Segoe UI Variable Display");
    g_ui.font_subtitle = create_ui_font(scale_px(13), FW_NORMAL,
                                        L"Segoe UI Variable Text");
    g_ui.font_body = create_ui_font(scale_px(15), FW_NORMAL,
                                    L"Segoe UI Variable Text");
    g_ui.font_small = create_ui_font(scale_px(12), FW_NORMAL,
                                     L"Segoe UI Variable Text");
    g_ui.font_bold = create_ui_font(scale_px(16), FW_SEMIBOLD,
                                    L"Segoe UI Variable Text");
}

static void rebuild_row_imagelist(void)
{
    int height = scale_px(48);
    HBITMAP bitmap;
    if (g_ui.row_images) {
        ImageList_Destroy(g_ui.row_images);
        g_ui.row_images = NULL;
    }

    g_ui.row_images = ImageList_Create(1, height, ILC_COLOR32, 1, 1);
    if (!g_ui.row_images) {
        return;
    }

    bitmap = CreateBitmap(1, height, 1, 32, NULL);
    if (!bitmap) {
        return;
    }
    ImageList_Add(g_ui.row_images, bitmap, NULL);
    DeleteObject(bitmap);

    if (g_ui.list) {
        ListView_SetImageList(g_ui.list, g_ui.row_images, LVSIL_SMALL);
    }
}

static void fill_rect_color(HDC hdc, const RECT *rc, COLORREF color)
{
    HBRUSH brush = CreateSolidBrush(color);
    FillRect(hdc, rc, brush);
    DeleteObject(brush);
}

static void fill_round_rect(HDC hdc, const RECT *rc, int radius, COLORREF color)
{
    HPEN pen = CreatePen(PS_SOLID, 1, color);
    HBRUSH brush = CreateSolidBrush(color);
    HGDIOBJ old_pen = SelectObject(hdc, pen);
    HGDIOBJ old_brush = SelectObject(hdc, brush);
    RoundRect(hdc, rc->left, rc->top, rc->right, rc->bottom, radius, radius);
    SelectObject(hdc, old_pen);
    SelectObject(hdc, old_brush);
    DeleteObject(pen);
    DeleteObject(brush);
}

static void stroke_round_rect(HDC hdc, const RECT *rc, int radius, COLORREF color)
{
    HPEN pen = CreatePen(PS_SOLID, 1, color);
    HGDIOBJ old_pen = SelectObject(hdc, pen);
    HGDIOBJ old_brush = SelectObject(hdc, GetStockObject(HOLLOW_BRUSH));
    RoundRect(hdc, rc->left, rc->top, rc->right, rc->bottom, radius, radius);
    SelectObject(hdc, old_pen);
    SelectObject(hdc, old_brush);
    DeleteObject(pen);
}

static void draw_text_block(HDC hdc, const RECT *rc, HFONT font,
                            COLORREF color, UINT format,
                            const wchar_t *text)
{
    HGDIOBJ old_font = SelectObject(hdc, font);
    COLORREF old_color = SetTextColor(hdc, color);
    int old_mode = SetBkMode(hdc, TRANSPARENT);
    RECT copy = *rc;
    DrawTextW(hdc, text, -1, &copy, format);
    SetBkMode(hdc, old_mode);
    SetTextColor(hdc, old_color);
    SelectObject(hdc, old_font);
}

static void draw_line(HDC hdc, int x1, int y1, int x2, int y2, COLORREF color)
{
    HPEN pen = CreatePen(PS_SOLID, 1, color);
    HGDIOBJ old_pen = SelectObject(hdc, pen);
    MoveToEx(hdc, x1, y1, NULL);
    LineTo(hdc, x2, y2);
    SelectObject(hdc, old_pen);
    DeleteObject(pen);
}

static void apply_visuals(HWND hwnd)
{
    BOOL dark = TRUE;
    COLORREF none = DWMWA_COLOR_NONE;
    UINT zero = 0;
    DWM_WINDOW_CORNER_PREFERENCE corners = DWMWCP_ROUND;
    HMODULE user32 = GetModuleHandleW(L"user32.dll");
    SetWindowCompositionAttributeFn set_comp =
        (SetWindowCompositionAttributeFn)GetProcAddress(
            user32, "SetWindowCompositionAttribute");

    DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &dark,
                          sizeof(dark));
    DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, &none, sizeof(none));
    DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, &none, sizeof(none));
    DwmSetWindowAttribute(hwnd, DWMWA_TEXT_COLOR, &none, sizeof(none));
    DwmSetWindowAttribute(hwnd, DWMWA_VISIBLE_FRAME_BORDER_THICKNESS, &zero,
                          sizeof(zero));
    DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &corners,
                          sizeof(corners));

    if (set_comp) {
        ACCENT_POLICY policy;
        WINDOWCOMPOSITIONATTRIBDATA data;

        policy.AccentState = ACCENT_ENABLE_ACRYLICBLURBEHIND;
        policy.AccentFlags = 2;
        policy.GradientColor = 0xD0101216;
        policy.AnimationId = 0;

        data.Attrib = 19;
        data.pvData = &policy;
        data.cbData = sizeof(policy);
        set_comp(hwnd, &data);
    }
}

static void start_tracking_mouse(HWND hwnd)
{
    TRACKMOUSEEVENT tme;
    if (g_ui.tracking_mouse) {
        return;
    }
    tme.cbSize = sizeof(tme);
    tme.dwFlags = TME_LEAVE;
    tme.hwndTrack = hwnd;
    tme.dwHoverTime = 0;
    TrackMouseEvent(&tme);
    g_ui.tracking_mouse = TRUE;
}

static int hit_test_rects(const RECT *rects, int count, POINT pt)
{
    int i;
    for (i = 0; i < count; ++i) {
        if (PtInRect(&rects[i], pt)) {
            return i;
        }
    }
    return -1;
}

static void update_hover_state(HWND hwnd, POINT pt)
{
    int hot_nav = hit_test_rects(g_ui.nav_rects, kNavCount, pt);
    int hot_tab = hit_test_rects(g_ui.tab_rects, kTabCount, pt);
    int hot_system = hit_test_rects(g_ui.system_button_rects, kSystemButtonCount, pt);
    int hot_command = hit_test_rects(g_ui.command_rects, kCommandCount, pt);

    if (hot_nav != g_ui.hot_nav || hot_tab != g_ui.hot_tab ||
        hot_system != g_ui.hot_system || hot_command != g_ui.hot_command) {
        g_ui.hot_nav = hot_nav;
        g_ui.hot_tab = hot_tab;
        g_ui.hot_system = hot_system;
        g_ui.hot_command = hot_command;
        InvalidateRect(hwnd, NULL, FALSE);
    }
}

static void clear_hover_state(HWND hwnd)
{
    if (g_ui.hot_nav != -1 || g_ui.hot_tab != -1 || g_ui.hot_system != -1 ||
        g_ui.hot_command != -1) {
        g_ui.hot_nav = -1;
        g_ui.hot_tab = -1;
        g_ui.hot_system = -1;
        g_ui.hot_command = -1;
        InvalidateRect(hwnd, NULL, FALSE);
    }
}

static void update_columns(void)
{
    int width = g_ui.list_rect.right - g_ui.list_rect.left;
    int name_width;
    int progress_width;
    int speed_width;
    int eta_width;
    int ratio_width;

    if (!g_ui.list || width <= 0) {
        return;
    }

    name_width = MulDiv(width, 36, 100);
    progress_width = MulDiv(width, 21, 100);
    speed_width = MulDiv(width, 20, 100);
    eta_width = MulDiv(width, 11, 100);
    ratio_width = width - (name_width + progress_width + speed_width + eta_width);

    g_ui.column_widths[kColumnName] = name_width;
    g_ui.column_widths[kColumnProgress] = progress_width;
    g_ui.column_widths[kColumnSpeed] = speed_width;
    g_ui.column_widths[kColumnEta] = eta_width;
    g_ui.column_widths[kColumnRatio] = ratio_width;

    ListView_SetColumnWidth(g_ui.list, kColumnName, name_width);
    ListView_SetColumnWidth(g_ui.list, kColumnProgress, progress_width);
    ListView_SetColumnWidth(g_ui.list, kColumnSpeed, speed_width);
    ListView_SetColumnWidth(g_ui.list, kColumnEta, eta_width);
    ListView_SetColumnWidth(g_ui.list, kColumnRatio, ratio_width);
}

static void layout_ui(HWND hwnd)
{
    RECT client;
    int pad = scale_px(16);
    int gap = scale_px(12);
    int title_height = scale_px(60);
    int sidebar_width = scale_px(188);
    int summary_height = scale_px(88);
    int details_height = scale_px(176);
    int header_height = scale_px(26);
    int search_width = scale_px(250);
    int command_width = scale_px(112);
    int command_height = scale_px(34);
    int sys_size = scale_px(34);
    int x;
    int i;

    GetClientRect(hwnd, &client);

    g_ui.title_rect = rect_make(pad, pad, client.right - pad, pad + title_height);
    g_ui.sidebar_rect =
        rect_make(pad, g_ui.title_rect.bottom + gap, pad + sidebar_width,
                  client.bottom - pad);
    g_ui.content_rect =
        rect_make(g_ui.sidebar_rect.right + gap, g_ui.title_rect.bottom + gap,
                  client.right - pad, client.bottom - pad);

    g_ui.system_button_rects[1] =
        rect_make(g_ui.title_rect.right - sys_size, g_ui.title_rect.top +
                                               (title_height - sys_size) / 2,
                  g_ui.title_rect.right,
                  g_ui.title_rect.top + (title_height - sys_size) / 2 + sys_size);
    g_ui.system_button_rects[0] =
        rect_make(g_ui.system_button_rects[1].left - sys_size - scale_px(8),
                  g_ui.system_button_rects[1].top,
                  g_ui.system_button_rects[1].left - scale_px(8),
                  g_ui.system_button_rects[1].bottom);

    x = g_ui.title_rect.left + scale_px(210);
    for (i = 0; i < kCommandCount; ++i) {
        g_ui.command_rects[i] =
            rect_make(x, g_ui.title_rect.top + (title_height - command_height) / 2,
                      x + command_width,
                      g_ui.title_rect.top + (title_height - command_height) / 2 +
                          command_height);
        x = g_ui.command_rects[i].right + scale_px(8);
    }

    g_ui.search_rect =
        rect_make(g_ui.system_button_rects[0].left - search_width - scale_px(20),
                  g_ui.title_rect.top + (title_height - command_height) / 2,
                  g_ui.system_button_rects[0].left - scale_px(20),
                  g_ui.title_rect.top + (title_height - command_height) / 2 +
                      command_height);

    for (i = 0; i < kNavCount; ++i) {
        int item_height = scale_px(44);
        int top = g_ui.sidebar_rect.top + scale_px(58) + i * (item_height + scale_px(8));
        g_ui.nav_rects[i] = rect_make(g_ui.sidebar_rect.left + scale_px(12), top,
                                      g_ui.sidebar_rect.right - scale_px(12),
                                      top + item_height);
    }

    {
        int summary_gap = scale_px(10);
        int summary_width =
            (g_ui.content_rect.right - g_ui.content_rect.left - summary_gap * 2) / 3;
        for (i = 0; i < 3; ++i) {
            int left = g_ui.content_rect.left + i * (summary_width + summary_gap);
            g_ui.summary_rects[i] = rect_make(left, g_ui.content_rect.top,
                                              left + summary_width,
                                              g_ui.content_rect.top + summary_height);
        }
    }

    g_ui.details_rect =
        rect_make(g_ui.content_rect.left, g_ui.content_rect.bottom - details_height,
                  g_ui.content_rect.right, g_ui.content_rect.bottom);
    g_ui.list_header_rect =
        rect_make(g_ui.content_rect.left,
                  g_ui.summary_rects[0].bottom + gap,
                  g_ui.content_rect.right,
                  g_ui.summary_rects[0].bottom + gap + header_height);
    g_ui.list_rect =
        rect_make(g_ui.content_rect.left,
                  g_ui.list_header_rect.bottom + scale_px(6),
                  g_ui.content_rect.right,
                  g_ui.details_rect.top - gap);

    for (i = 0; i < kTabCount; ++i) {
        int tab_width = scale_px(86);
        int top = g_ui.details_rect.top + scale_px(14);
        int left = g_ui.details_rect.left + scale_px(18) + i * (tab_width + scale_px(8));
        g_ui.tab_rects[i] =
            rect_make(left, top, left + tab_width, top + scale_px(34));
    }

    if (g_ui.list) {
        MoveWindow(g_ui.list, g_ui.list_rect.left, g_ui.list_rect.top,
                   g_ui.list_rect.right - g_ui.list_rect.left,
                   g_ui.list_rect.bottom - g_ui.list_rect.top, TRUE);
        update_columns();
    }
}

static void draw_summary_card(HDC hdc, const RECT *rc, const wchar_t *label,
                              const wchar_t *value, const wchar_t *detail,
                              COLORREF accent)
{
    RECT value_rc = *rc;
    RECT label_rc = *rc;
    RECT detail_rc = *rc;
    RECT accent_rc = *rc;
    int radius = scale_px(18);

    fill_round_rect(hdc, rc, radius, color_rgb(23, 28, 34));
    stroke_round_rect(hdc, rc, radius, color_rgb(38, 45, 54));

    accent_rc.left += scale_px(18);
    accent_rc.top += scale_px(16);
    accent_rc.right = accent_rc.left + scale_px(42);
    accent_rc.bottom = accent_rc.top + scale_px(6);
    fill_round_rect(hdc, &accent_rc, scale_px(6), accent);

    label_rc.left += scale_px(18);
    label_rc.top += scale_px(26);
    label_rc.right -= scale_px(18);
    label_rc.bottom = label_rc.top + scale_px(18);
    draw_text_block(hdc, &label_rc, g_ui.font_small, color_rgb(146, 155, 168),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, label);

    value_rc.left += scale_px(18);
    value_rc.top += scale_px(42);
    value_rc.right -= scale_px(18);
    value_rc.bottom = value_rc.top + scale_px(24);
    draw_text_block(hdc, &value_rc, g_ui.font_title, color_rgb(241, 245, 249),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, value);

    detail_rc.left += scale_px(18);
    detail_rc.top = rc->bottom - scale_px(28);
    detail_rc.right -= scale_px(18);
    detail_rc.bottom -= scale_px(14);
    draw_text_block(hdc, &detail_rc, g_ui.font_small, color_rgb(112, 122, 136),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, detail);
}

static void draw_nav_item(HDC hdc, int index)
{
    RECT rc = g_ui.nav_rects[index];
    RECT text_rc = rc;
    RECT badge_rc;
    COLORREF text_color = color_rgb(208, 214, 222);
    COLORREF badge_bg = color_rgb(41, 48, 56);
    COLORREF badge_text = color_rgb(220, 229, 239);
    wchar_t badge[16];

    if (g_ui.selected_nav == index) {
        fill_round_rect(hdc, &rc, scale_px(16), color_rgb(34, 51, 68));
        stroke_round_rect(hdc, &rc, scale_px(16), color_rgb(65, 99, 134));
        text_color = color_rgb(245, 248, 252);
        badge_bg = color_rgb(67, 114, 163);
    } else if (g_ui.hot_nav == index) {
        fill_round_rect(hdc, &rc, scale_px(16), color_rgb(28, 34, 40));
    }

    text_rc.left += scale_px(16);
    text_rc.right -= scale_px(56);
    draw_text_block(hdc, &text_rc, g_ui.font_body, text_color,
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, kNavLabels[index]);

    badge_rc = rect_make(rc.right - scale_px(44), rc.top + scale_px(10),
                         rc.right - scale_px(12), rc.bottom - scale_px(10));
    fill_round_rect(hdc, &badge_rc, scale_px(12), badge_bg);
    wsprintfW(badge, L"%d", kNavCounts[index]);
    draw_text_block(hdc, &badge_rc, g_ui.font_small, badge_text,
                    DT_CENTER | DT_SINGLELINE | DT_VCENTER, badge);
}

static void draw_piece_map(HDC hdc, const RECT *rc)
{
    int gap = scale_px(3);
    int segments = 26;
    int width = (rc->right - rc->left - gap * (segments - 1)) / segments;
    int i;

    for (i = 0; i < segments; ++i) {
        RECT block = rect_make(rc->left + i * (width + gap), rc->top,
                               rc->left + i * (width + gap) + width, rc->bottom);
        COLORREF color = color_rgb(53, 60, 69);
        if (i < 19) {
            color = color_rgb(69, 140, 226);
        } else if (i < 23) {
            color = color_rgb(42, 104, 178);
        }
        fill_round_rect(hdc, &block, scale_px(6), color);
    }
}

static void draw_details_panel(HDC hdc)
{
    RECT frame = g_ui.details_rect;
    RECT title_rc;
    RECT text_rc;
    RECT map_rc;
    RECT metrics[3];
    int i;

    fill_round_rect(hdc, &frame, scale_px(20), color_rgb(21, 26, 32));
    stroke_round_rect(hdc, &frame, scale_px(20), color_rgb(36, 43, 51));

    for (i = 0; i < kTabCount; ++i) {
        RECT tab = g_ui.tab_rects[i];
        if (g_ui.selected_tab == i) {
            fill_round_rect(hdc, &tab, scale_px(14), color_rgb(34, 51, 68));
            draw_text_block(hdc, &tab, g_ui.font_small, color_rgb(241, 245, 249),
                            DT_CENTER | DT_SINGLELINE | DT_VCENTER,
                            kTabLabels[i]);
            draw_line(hdc, tab.left + scale_px(16), tab.bottom - scale_px(4),
                      tab.right - scale_px(16), tab.bottom - scale_px(4),
                      color_rgb(92, 175, 255));
        } else {
            if (g_ui.hot_tab == i) {
                fill_round_rect(hdc, &tab, scale_px(14), color_rgb(28, 34, 40));
            }
            draw_text_block(hdc, &tab, g_ui.font_small, color_rgb(146, 155, 168),
                            DT_CENTER | DT_SINGLELINE | DT_VCENTER,
                            kTabLabels[i]);
        }
    }

    title_rc = rect_make(frame.left + scale_px(18), frame.top + scale_px(62),
                         frame.left + scale_px(320), frame.top + scale_px(86));
    draw_text_block(hdc, &title_rc, g_ui.font_bold, color_rgb(237, 242, 247),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER,
                    L"Peers settle here while the transfer view stays clean");

    text_rc = rect_make(frame.left + scale_px(18), frame.top + scale_px(92),
                        frame.left + scale_px(360), frame.top + scale_px(128));
    draw_text_block(hdc, &text_rc, g_ui.font_small, color_rgb(133, 143, 156),
                    DT_LEFT | DT_WORDBREAK,
                    L"Use the lower pane for drill-down only: files, tracker health, "
                    L"piece availability, and per-peer diagnostics.");

    metrics[0] = rect_make(frame.right - scale_px(306), frame.top + scale_px(64),
                           frame.right - scale_px(210), frame.top + scale_px(120));
    metrics[1] = rect_make(frame.right - scale_px(202), frame.top + scale_px(64),
                           frame.right - scale_px(106), frame.top + scale_px(120));
    metrics[2] = rect_make(frame.right - scale_px(98), frame.top + scale_px(64),
                           frame.right - scale_px(18), frame.top + scale_px(120));

    draw_summary_card(hdc, &metrics[0], L"AVAILABILITY", L"92%", L"healthy spread",
                      color_rgb(84, 178, 122));
    draw_summary_card(hdc, &metrics[1], L"TRACKERS", L"7", L"all online",
                      color_rgb(226, 160, 67));
    draw_summary_card(hdc, &metrics[2], L"PIECES", L"19/26", L"cached view",
                      color_rgb(92, 175, 255));

    map_rc = rect_make(frame.left + scale_px(18), frame.bottom - scale_px(42),
                       frame.right - scale_px(18), frame.bottom - scale_px(18));
    draw_piece_map(hdc, &map_rc);
}

static void draw_shell(HDC hdc, const RECT *paint_rc)
{
    RECT client;
    RECT title_brand_rc;
    RECT subtitle_rc;
    RECT section_rc;
    RECT search_text_rc;
    RECT footer_rc;
    int i;
    (void)paint_rc;

    GetClientRect(g_ui.hwnd, &client);
    fill_rect_color(hdc, &client, color_rgb(11, 15, 19));

    fill_round_rect(hdc, &g_ui.sidebar_rect, scale_px(22), color_rgb(20, 24, 29));
    stroke_round_rect(hdc, &g_ui.sidebar_rect, scale_px(22), color_rgb(34, 39, 47));

    title_brand_rc = rect_make(g_ui.title_rect.left, g_ui.title_rect.top + scale_px(4),
                               g_ui.title_rect.left + scale_px(180),
                               g_ui.title_rect.top + scale_px(34));
    subtitle_rc = rect_make(g_ui.title_rect.left, g_ui.title_rect.top + scale_px(30),
                            g_ui.title_rect.left + scale_px(220),
                            g_ui.title_rect.bottom);

    draw_text_block(hdc, &title_brand_rc, g_ui.font_title,
                    color_rgb(242, 246, 250), DT_LEFT | DT_SINGLELINE | DT_VCENTER,
                    L"TinyTorrent");
    draw_text_block(hdc, &subtitle_rc, g_ui.font_small, color_rgb(122, 133, 147),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER,
                    L"native acrylic shell  |  win32 mockup");

    for (i = 0; i < kCommandCount; ++i) {
        RECT button = g_ui.command_rects[i];
        COLORREF bg = color_rgb(27, 33, 39);
        if (i == 0) {
            bg = color_rgb(34, 64, 94);
        } else if (g_ui.hot_command == i) {
            bg = color_rgb(34, 41, 49);
        }
        fill_round_rect(hdc, &button, scale_px(16), bg);
        stroke_round_rect(hdc, &button, scale_px(16), color_rgb(49, 57, 66));
        draw_text_block(hdc, &button, g_ui.font_small,
                        i == 0 ? color_rgb(241, 246, 252) : color_rgb(216, 223, 230),
                        DT_CENTER | DT_SINGLELINE | DT_VCENTER,
                        i == 0 ? L"+ Add Torrent" : L"Pause All");
    }

    fill_round_rect(hdc, &g_ui.search_rect, scale_px(16), color_rgb(21, 26, 31));
    stroke_round_rect(hdc, &g_ui.search_rect, scale_px(16), color_rgb(38, 45, 54));
    search_text_rc = g_ui.search_rect;
    search_text_rc.left += scale_px(16);
    draw_text_block(hdc, &search_text_rc, g_ui.font_small,
                    color_rgb(116, 126, 138),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER,
                    L"Search torrents, peers, or save paths");

    for (i = 0; i < kSystemButtonCount; ++i) {
        RECT button = g_ui.system_button_rects[i];
        COLORREF bg = color_rgb(20, 24, 29);
        if (g_ui.hot_system == i) {
            bg = (i == 1) ? color_rgb(112, 39, 45) : color_rgb(36, 43, 51);
        }
        fill_round_rect(hdc, &button, scale_px(12), bg);
        draw_text_block(hdc, &button, g_ui.font_body, color_rgb(227, 233, 239),
                        DT_CENTER | DT_SINGLELINE | DT_VCENTER,
                        i == 0 ? L"–" : L"×");
    }

    section_rc = rect_make(g_ui.sidebar_rect.left + scale_px(18),
                           g_ui.sidebar_rect.top + scale_px(18),
                           g_ui.sidebar_rect.right - scale_px(18),
                           g_ui.sidebar_rect.top + scale_px(36));
    draw_text_block(hdc, &section_rc, g_ui.font_small, color_rgb(132, 141, 154),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, L"FILTERS");

    for (i = 0; i < kNavCount; ++i) {
        draw_nav_item(hdc, i);
    }

    footer_rc = rect_make(g_ui.sidebar_rect.left + scale_px(18),
                          g_ui.sidebar_rect.bottom - scale_px(92),
                          g_ui.sidebar_rect.right - scale_px(18),
                          g_ui.sidebar_rect.bottom - scale_px(18));
    fill_round_rect(hdc, &footer_rc, scale_px(18), color_rgb(24, 30, 36));
    draw_text_block(hdc, &footer_rc, g_ui.font_small, color_rgb(155, 165, 176),
                    DT_LEFT | DT_TOP | DT_WORDBREAK,
                    L"Portable native shell\n"
                    L"0 web runtime\n"
                    L"acrylic host, custom draw");

    draw_summary_card(hdc, &g_ui.summary_rects[0], L"ACTIVE", L"3 downloads",
                      L"4 queued across filters", color_rgb(92, 175, 255));
    draw_summary_card(hdc, &g_ui.summary_rects[1], L"DOWN", L"30.6 MB/s",
                      L"steady over last minute", color_rgb(84, 178, 122));
    draw_summary_card(hdc, &g_ui.summary_rects[2], L"DISK", L"2.1 TB free",
                      L"downloads on NVMe pool", color_rgb(226, 160, 67));

    fill_round_rect(hdc, &g_ui.list_header_rect, scale_px(14), color_rgb(18, 22, 27));
    stroke_round_rect(hdc, &g_ui.list_header_rect, scale_px(14), color_rgb(33, 39, 47));
    {
        RECT label = g_ui.list_header_rect;
        int left = label.left + scale_px(18);
        for (i = 0; i < kColumnCount; ++i) {
            RECT cell = rect_make(left, label.top, left + g_ui.column_widths[i], label.bottom);
            draw_text_block(hdc, &cell, g_ui.font_small, color_rgb(120, 131, 145),
                            DT_LEFT | DT_SINGLELINE | DT_VCENTER,
                            kColumnLabels[i]);
            left += g_ui.column_widths[i];
        }
    }

    draw_details_panel(hdc);
}

static void draw_sparkline(HDC hdc, const RECT *rc, const int *values)
{
    POINT pts[kSparkCount];
    int i;
    int width = rc->right - rc->left;
    int height = rc->bottom - rc->top;
    int max_value = 1;
    HPEN pen;
    HGDIOBJ old_pen;

    for (i = 0; i < kSparkCount; ++i) {
        if (values[i] > max_value) {
            max_value = values[i];
        }
    }

    for (i = 0; i < kSparkCount; ++i) {
        pts[i].x = rc->left + MulDiv(width, i, kSparkCount - 1);
        pts[i].y = rc->bottom - MulDiv(height, values[i], max_value);
    }

    pen = CreatePen(PS_SOLID, 1, color_rgb(92, 175, 255));
    old_pen = SelectObject(hdc, pen);
    Polyline(hdc, pts, kSparkCount);
    SelectObject(hdc, old_pen);
    DeleteObject(pen);
}

static void draw_row_background(HDC hdc, int item_index)
{
    RECT row;
    COLORREF bg = color_rgb(18, 23, 28);
    COLORREF border = color_rgb(31, 38, 46);
    UINT state = ListView_GetItemState(g_ui.list, item_index, LVIS_SELECTED);

    ListView_GetItemRect(g_ui.list, item_index, &row, LVIR_BOUNDS);
    row.left += scale_px(2);
    row.right -= scale_px(2);
    row.top += scale_px(2);
    row.bottom -= scale_px(2);

    if (state & LVIS_SELECTED) {
        bg = color_rgb(31, 47, 63);
        border = color_rgb(69, 115, 161);
    }

    fill_round_rect(hdc, &row, scale_px(14), bg);
    stroke_round_rect(hdc, &row, scale_px(14), border);
}

static void draw_name_cell(HDC hdc, const RECT *cell, const TorrentRow *row)
{
    RECT name_rc = *cell;
    RECT meta_rc = *cell;
    name_rc.left += scale_px(18);
    name_rc.right -= scale_px(12);
    name_rc.top += scale_px(6);
    name_rc.bottom = name_rc.top + scale_px(18);
    meta_rc.left += scale_px(18);
    meta_rc.right -= scale_px(12);
    meta_rc.top = name_rc.bottom + scale_px(2);
    meta_rc.bottom -= scale_px(8);

    draw_text_block(hdc, &name_rc, g_ui.font_bold, color_rgb(240, 245, 250),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, row->name);
    draw_text_block(hdc, &meta_rc, g_ui.font_small, color_rgb(131, 141, 154),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, row->meta);
}

static void draw_progress_cell(HDC hdc, const RECT *cell, const TorrentRow *row)
{
    RECT text_rc = *cell;
    RECT track_rc;
    RECT fill_rc;
    wchar_t pct[16];
    int radius = scale_px(8);
    int fill_width;

    wsprintfW(pct, L"%d%%", row->progress);

    text_rc.left += scale_px(12);
    text_rc.right -= scale_px(12);
    text_rc.top += scale_px(6);
    text_rc.bottom = text_rc.top + scale_px(16);
    draw_text_block(hdc, &text_rc, g_ui.font_small, color_rgb(216, 224, 232),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, pct);

    track_rc = *cell;
    track_rc.left += scale_px(12);
    track_rc.right -= scale_px(18);
    track_rc.top += scale_px(28);
    track_rc.bottom = track_rc.top + scale_px(8);
    fill_round_rect(hdc, &track_rc, radius, color_rgb(43, 49, 56));

    fill_width = MulDiv(track_rc.right - track_rc.left, row->progress, 100);
    fill_rc = track_rc;
    fill_rc.right = fill_rc.left + fill_width;
    if (fill_rc.right < fill_rc.left + radius) {
        fill_rc.right = fill_rc.left + radius;
    }
    fill_round_rect(hdc, &fill_rc, radius, color_rgb(92, 175, 255));
}

static void draw_speed_cell(HDC hdc, const RECT *cell, const TorrentRow *row)
{
    RECT text_rc = *cell;
    RECT spark_rc = *cell;

    text_rc.left += scale_px(12);
    text_rc.right -= scale_px(10);
    text_rc.top += scale_px(6);
    text_rc.bottom = text_rc.top + scale_px(16);
    draw_text_block(hdc, &text_rc, g_ui.font_small, color_rgb(219, 226, 233),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, row->speed);

    spark_rc.left += scale_px(12);
    spark_rc.right -= scale_px(10);
    spark_rc.top += scale_px(28);
    spark_rc.bottom -= scale_px(10);
    draw_sparkline(hdc, &spark_rc, row->spark);
}

static void draw_simple_cell(HDC hdc, const RECT *cell, const wchar_t *text)
{
    RECT text_rc = *cell;
    text_rc.left += scale_px(12);
    text_rc.right -= scale_px(12);
    draw_text_block(hdc, &text_rc, g_ui.font_small, color_rgb(211, 219, 227),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, text);
}

static LRESULT handle_list_custom_draw(LPARAM lparam)
{
    LPNMLVCUSTOMDRAW custom = (LPNMLVCUSTOMDRAW)lparam;
    int item = (int)custom->nmcd.dwItemSpec;
    int subitem = custom->iSubItem;
    RECT cell;
    const TorrentRow *row;

    switch (custom->nmcd.dwDrawStage) {
    case CDDS_PREPAINT:
        return CDRF_NOTIFYITEMDRAW;
    case CDDS_ITEMPREPAINT:
        return CDRF_NOTIFYSUBITEMDRAW;
    case CDDS_ITEMPREPAINT | CDDS_SUBITEM:
        if (item < 0 || item >= (int)(sizeof(kRows) / sizeof(kRows[0]))) {
            return CDRF_DODEFAULT;
        }

        row = &kRows[item];
        ListView_GetSubItemRect(g_ui.list, item, subitem, LVIR_BOUNDS, &cell);
        if (subitem == 0) {
            draw_row_background(custom->nmcd.hdc, item);
        }

        switch (subitem) {
        case kColumnName:
            draw_name_cell(custom->nmcd.hdc, &cell, row);
            break;
        case kColumnProgress:
            draw_progress_cell(custom->nmcd.hdc, &cell, row);
            break;
        case kColumnSpeed:
            draw_speed_cell(custom->nmcd.hdc, &cell, row);
            break;
        case kColumnEta:
            draw_simple_cell(custom->nmcd.hdc, &cell, row->eta);
            break;
        case kColumnRatio:
            draw_simple_cell(custom->nmcd.hdc, &cell, row->ratio);
            break;
        }
        return CDRF_SKIPDEFAULT;
    default:
        return CDRF_DODEFAULT;
    }
}

static void init_listview(void)
{
    static const wchar_t *dummy = L"";
    int i;

    for (i = 0; i < kColumnCount; ++i) {
        LVCOLUMNW column;
        ZeroMemory(&column, sizeof(column));
        column.mask = LVCF_FMT | LVCF_WIDTH | LVCF_TEXT | LVCF_SUBITEM;
        column.fmt = LVCFMT_LEFT;
        column.cx = 100;
        column.iSubItem = i;
        column.pszText = (LPWSTR)dummy;
        ListView_InsertColumn(g_ui.list, i, &column);
    }

    for (i = 0; i < (int)(sizeof(kRows) / sizeof(kRows[0])); ++i) {
        LVITEMW item;
        ZeroMemory(&item, sizeof(item));
        item.mask = LVIF_TEXT | LVIF_IMAGE | LVIF_PARAM;
        item.iItem = i;
        item.pszText = (LPWSTR)dummy;
        item.iImage = 0;
        item.lParam = i;
        ListView_InsertItem(g_ui.list, &item);
    }

    ListView_SetExtendedListViewStyle(g_ui.list,
                                      LVS_EX_DOUBLEBUFFER | LVS_EX_FULLROWSELECT);
    ListView_SetBkColor(g_ui.list, color_rgb(11, 15, 19));
    ListView_SetTextBkColor(g_ui.list, color_rgb(11, 15, 19));
    ListView_SetTextColor(g_ui.list, color_rgb(11, 15, 19));
    ListView_SetSelectionMark(g_ui.list, 0);
    ListView_SetItemState(g_ui.list, 0, LVIS_SELECTED, LVIS_SELECTED);
}

static void paint_window(HWND hwnd)
{
    PAINTSTRUCT ps;
    RECT client;
    HDC hdc = BeginPaint(hwnd, &ps);
    HDC memdc = CreateCompatibleDC(hdc);
    HBITMAP bmp;
    HBITMAP old_bmp;

    GetClientRect(hwnd, &client);
    bmp = CreateCompatibleBitmap(hdc, client.right - client.left,
                                 client.bottom - client.top);
    old_bmp = SelectObject(memdc, bmp);

    draw_shell(memdc, &ps.rcPaint);
    BitBlt(hdc, 0, 0, client.right - client.left, client.bottom - client.top,
           memdc, 0, 0, SRCCOPY);

    SelectObject(memdc, old_bmp);
    DeleteObject(bmp);
    DeleteDC(memdc);
    EndPaint(hwnd, &ps);
}

static void recreate_assets(void)
{
    rebuild_fonts();
    rebuild_row_imagelist();
    if (g_ui.list) {
        SendMessageW(g_ui.list, WM_SETFONT, (WPARAM)g_ui.font_body, TRUE);
    }
}

static LRESULT hit_test_nc(HWND hwnd, LPARAM lparam)
{
    POINT pt = {GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
    RECT client;
    int border = scale_px(8);

    ScreenToClient(hwnd, &pt);
    GetClientRect(hwnd, &client);

    if (!IsZoomed(hwnd)) {
        BOOL left = pt.x < border;
        BOOL right = pt.x >= client.right - border;
        BOOL top = pt.y < border;
        BOOL bottom = pt.y >= client.bottom - border;

        if (top && left) {
            return HTTOPLEFT;
        }
        if (top && right) {
            return HTTOPRIGHT;
        }
        if (bottom && left) {
            return HTBOTTOMLEFT;
        }
        if (bottom && right) {
            return HTBOTTOMRIGHT;
        }
        if (left) {
            return HTLEFT;
        }
        if (right) {
            return HTRIGHT;
        }
        if (top) {
            return HTTOP;
        }
        if (bottom) {
            return HTBOTTOM;
        }
    }

    if (PtInRect(&g_ui.system_button_rects[0], pt) ||
        PtInRect(&g_ui.system_button_rects[1], pt) ||
        PtInRect(&g_ui.command_rects[0], pt) ||
        PtInRect(&g_ui.command_rects[1], pt)) {
        return HTCLIENT;
    }

    if (PtInRect(&g_ui.title_rect, pt)) {
        return HTCAPTION;
    }
    return HTCLIENT;
}

static void center_window(HWND hwnd, int width, int height)
{
    RECT rc;
    int x;
    int y;

    rc.left = 0;
    rc.top = 0;
    rc.right = GetSystemMetrics(SM_CXSCREEN);
    rc.bottom = GetSystemMetrics(SM_CYSCREEN);
    x = rc.left + (rc.right - width) / 2;
    y = rc.top + (rc.bottom - height) / 2;
    SetWindowPos(hwnd, NULL, x, y, width, height, SWP_NOZORDER | SWP_NOACTIVATE);
}

static LRESULT CALLBACK wndproc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam)
{
    switch (msg) {
    case WM_CREATE:
    {
        INITCOMMONCONTROLSEX icc;
        g_ui.hwnd = hwnd;
        g_ui.dpi = GetDpiForWindow(hwnd);
        g_ui.hot_nav = -1;
        g_ui.selected_nav = 0;
        g_ui.hot_tab = -1;
        g_ui.selected_tab = 3;
        g_ui.hot_system = -1;
        g_ui.hot_command = -1;

        icc.dwSize = sizeof(icc);
        icc.dwICC = ICC_LISTVIEW_CLASSES;
        InitCommonControlsEx(&icc);

        recreate_assets();

        g_ui.list = CreateWindowExW(
            0, WC_LISTVIEWW, L"",
            WS_CHILD | WS_VISIBLE | LVS_REPORT | LVS_SINGLESEL | LVS_SHOWSELALWAYS |
                LVS_NOCOLUMNHEADER,
            0, 0, 0, 0, hwnd, NULL, ((LPCREATESTRUCTW)lparam)->hInstance, NULL);
        if (!g_ui.list) {
            return -1;
        }

        SendMessageW(g_ui.list, WM_SETFONT, (WPARAM)g_ui.font_body, TRUE);
        rebuild_row_imagelist();
        init_listview();
        layout_ui(hwnd);
        apply_visuals(hwnd);
        center_window(hwnd, scale_px(1360), scale_px(860));
        return 0;
    }
    case WM_DPICHANGED:
    {
        RECT *suggested = (RECT *)lparam;
        g_ui.dpi = HIWORD(wparam);
        recreate_assets();
        SetWindowPos(hwnd, NULL, suggested->left, suggested->top,
                     suggested->right - suggested->left,
                     suggested->bottom - suggested->top,
                     SWP_NOZORDER | SWP_NOACTIVATE);
        layout_ui(hwnd);
        apply_visuals(hwnd);
        InvalidateRect(hwnd, NULL, TRUE);
        return 0;
    }
    case WM_NCHITTEST:
        return hit_test_nc(hwnd, lparam);
    case WM_ACTIVATE:
    case WM_NCACTIVATE:
        apply_visuals(hwnd);
        return 0;
    case WM_GETMINMAXINFO:
    {
        MINMAXINFO *mmi = (MINMAXINFO *)lparam;
        mmi->ptMinTrackSize.x = scale_px(980);
        mmi->ptMinTrackSize.y = scale_px(680);
        return 0;
    }
    case WM_SIZE:
        layout_ui(hwnd);
        InvalidateRect(hwnd, NULL, TRUE);
        return 0;
    case WM_MOUSEMOVE:
    {
        POINT pt = {GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
        start_tracking_mouse(hwnd);
        update_hover_state(hwnd, pt);
        return 0;
    }
    case WM_MOUSELEAVE:
        g_ui.tracking_mouse = FALSE;
        clear_hover_state(hwnd);
        return 0;
    case WM_SETCURSOR:
    {
        POINT pt;
        GetCursorPos(&pt);
        ScreenToClient(hwnd, &pt);
        if (hit_test_rects(g_ui.nav_rects, kNavCount, pt) != -1 ||
            hit_test_rects(g_ui.tab_rects, kTabCount, pt) != -1 ||
            hit_test_rects(g_ui.command_rects, kCommandCount, pt) != -1 ||
            hit_test_rects(g_ui.system_button_rects, kSystemButtonCount, pt) != -1) {
            SetCursor(LoadCursorW(NULL, IDC_HAND));
            return TRUE;
        }
        break;
    }
    case WM_LBUTTONUP:
    {
        POINT pt = {GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
        int nav = hit_test_rects(g_ui.nav_rects, kNavCount, pt);
        int tab = hit_test_rects(g_ui.tab_rects, kTabCount, pt);
        int sys = hit_test_rects(g_ui.system_button_rects, kSystemButtonCount, pt);

        if (sys == 0) {
            ShowWindow(hwnd, SW_MINIMIZE);
            return 0;
        }
        if (sys == 1) {
            PostMessageW(hwnd, WM_CLOSE, 0, 0);
            return 0;
        }
        if (nav != -1) {
            g_ui.selected_nav = nav;
            InvalidateRect(hwnd, NULL, FALSE);
            return 0;
        }
        if (tab != -1) {
            g_ui.selected_tab = tab;
            InvalidateRect(hwnd, NULL, FALSE);
            return 0;
        }
        return 0;
    }
    case WM_NOTIFY:
    {
        NMHDR *hdr = (NMHDR *)lparam;
        if (hdr->hwndFrom == g_ui.list && hdr->code == NM_CUSTOMDRAW) {
            return handle_list_custom_draw(lparam);
        }
        break;
    }
    case WM_ERASEBKGND:
        return 1;
    case WM_PAINT:
        paint_window(hwnd);
        return 0;
    case WM_DESTROY:
        if (g_ui.row_images) {
            ImageList_Destroy(g_ui.row_images);
            g_ui.row_images = NULL;
        }
        destroy_fonts();
        PostQuitMessage(0);
        return 0;
    default:
        break;
    }

    return DefWindowProcW(hwnd, msg, wparam, lparam);
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE prev, PWSTR cmd, int show)
{
    WNDCLASSEXW wc;
    HWND hwnd;
    MSG msg;

    (void)prev;
    (void)cmd;

    ZeroMemory(&wc, sizeof(wc));
    wc.cbSize = sizeof(wc);
    wc.hInstance = instance;
    wc.lpfnWndProc = wndproc;
    wc.lpszClassName = kClassName;
    wc.hCursor = LoadCursorW(NULL, IDC_ARROW);
    wc.hbrBackground = NULL;

    RegisterClassExW(&wc);

    hwnd = CreateWindowExW(0, kClassName, L"TinyTorrent Mockup", WS_POPUP | WS_VISIBLE,
                           CW_USEDEFAULT, CW_USEDEFAULT, 1360, 860, NULL, NULL,
                           instance, NULL);
    if (!hwnd) {
        return 1;
    }

    ShowWindow(hwnd, show ? show : SW_SHOWNORMAL);
    UpdateWindow(hwnd);

    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    return (int)msg.wParam;
}
