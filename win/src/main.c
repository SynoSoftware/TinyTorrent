#include <windows.h>
#include <windowsx.h>
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
    kFilterCount = 5,
    kSummaryCount = 3,
    kTabCount = 4,
    kSystemButtonCount = 2,
    kSparkCount = 12
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
    const wchar_t *status;
    const wchar_t *speed;
    const wchar_t *eta;
    const wchar_t *ratio;
    const wchar_t *save_path;
    int progress;
    COLORREF accent;
    int spark[kSparkCount];
} TorrentRow;

typedef struct SummaryCard {
    const wchar_t *label;
    const wchar_t *value;
    const wchar_t *detail;
    COLORREF accent;
} SummaryCard;

typedef struct UiState {
    HWND hwnd;
    UINT dpi;
    HFONT font_title;
    HFONT font_subtitle;
    HFONT font_body;
    HFONT font_small;
    HFONT font_bold;
    HFONT font_metric;
    RECT title_rect;
    RECT omnibox_rect;
    RECT status_chip_rect;
    RECT system_button_rects[kSystemButtonCount];
    RECT summary_rects[kSummaryCount];
    RECT filter_rects[kFilterCount];
    RECT rows_panel_rect;
    RECT row_rects[6];
    RECT details_rect;
    RECT tab_rects[kTabCount];
    int hot_filter;
    int selected_filter;
    int hot_row;
    int selected_row;
    int hot_tab;
    int selected_tab;
    int hot_system;
    BOOL tracking_mouse;
} UiState;

static const wchar_t kClassName[] = L"TinyTorrentMockup";
static UiState g_ui = {0};

static const TorrentRow kRows[] = {
    {L"Ubuntu 24.04 Desktop",
     L"38.2 GB  |  2,148 peers  |  metadata healthy",
     L"Downloading", L"18.4 MB/s", L"12 min", L"1.42",
     L"D:\\Media\\Linux", 78, RGB(92, 175, 255),
     {28, 34, 29, 38, 41, 44, 42, 53, 58, 55, 62, 65}},
    {L"Arch Linux ISO Mirror",
     L"1.1 GB  |  410 peers  |  verification complete",
     L"Seeding", L"6.8 MB/s", L"3 min", L"3.08",
     L"D:\\Media\\ISOs", 93, RGB(84, 178, 122),
     {12, 14, 18, 22, 20, 24, 27, 29, 31, 30, 32, 35}},
    {L"Blender Asset Pack",
     L"12.5 GB  |  821 peers  |  pieces locked",
     L"Downloading", L"4.3 MB/s", L"28 min", L"0.84",
     L"D:\\Projects\\Assets", 41, RGB(226, 160, 67),
     {10, 12, 9, 14, 16, 15, 17, 19, 21, 20, 22, 24}},
    {L"TinyTorrent Nightly Builds",
     L"4.6 GB  |  96 peers  |  queue priority high",
     L"Queued", L"1.1 MB/s", L"1 h 8 m", L"0.12",
     L"D:\\Builds\\Nightly", 17, RGB(156, 129, 255),
     {2, 4, 3, 5, 6, 8, 7, 9, 8, 10, 11, 12}},
    {L"Fedora Workstation",
     L"2.3 GB  |  612 peers  |  seeding calmly",
     L"Seeding", L"0.0 MB/s", L"--", L"6.73",
     L"D:\\Media\\Linux", 100, RGB(84, 178, 122),
     {4, 5, 6, 5, 6, 7, 7, 6, 6, 7, 8, 8}},
    {L"Design Reference Vault",
     L"86.0 GB  |  53 peers  |  tracker response unstable",
     L"Stalled", L"128 KB/s", L"5 h 11 m", L"0.37",
     L"E:\\Archive\\Reference", 9, RGB(228, 98, 88),
     {1, 1, 2, 1, 2, 3, 2, 3, 4, 3, 4, 5}},
};

static const SummaryCard kSummaries[kSummaryCount] = {
    {L"ACTIVE", L"3 live transfers", L"4 more queued behind filters",
     RGB(92, 175, 255)},
    {L"THROUGHPUT", L"30.6 MB/s down", L"steady over the last minute",
     RGB(84, 178, 122)},
    {L"CAPACITY", L"2.1 TB free", L"NVMe pool selected as target",
     RGB(226, 160, 67)},
};

static const wchar_t *kFilterLabels[kFilterCount] = {
    L"All", L"Downloading", L"Seeding", L"Completed", L"Activity"
};

static const int kFilterCounts[kFilterCount] = {57, 4, 12, 38, 3};

static const wchar_t *kTabLabels[kTabCount] = {
    L"Files", L"Peers", L"Trackers", L"Pieces"
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

static int rect_width(const RECT *rc)
{
    return rc->right - rc->left;
}

static int rect_height(const RECT *rc)
{
    return rc->bottom - rc->top;
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
    if (g_ui.font_metric) {
        DeleteObject(g_ui.font_metric);
        g_ui.font_metric = NULL;
    }
}

static void rebuild_fonts(void)
{
    destroy_fonts();
    g_ui.font_title =
        create_ui_font(scale_px(30), FW_SEMIBOLD, L"Segoe UI Variable Display");
    g_ui.font_subtitle =
        create_ui_font(scale_px(13), FW_NORMAL, L"Segoe UI Variable Text");
    g_ui.font_body =
        create_ui_font(scale_px(15), FW_NORMAL, L"Segoe UI Variable Text");
    g_ui.font_small =
        create_ui_font(scale_px(12), FW_NORMAL, L"Segoe UI Variable Text");
    g_ui.font_bold =
        create_ui_font(scale_px(16), FW_SEMIBOLD, L"Segoe UI Variable Text");
    g_ui.font_metric =
        create_ui_font(scale_px(22), FW_SEMIBOLD, L"Segoe UI Variable Display");
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

static void draw_search_icon(HDC hdc, int x, int y, int size, COLORREF color)
{
    HPEN pen = CreatePen(PS_SOLID, 2, color);
    HGDIOBJ old_pen = SelectObject(hdc, pen);
    HGDIOBJ old_brush = SelectObject(hdc, GetStockObject(HOLLOW_BRUSH));
    Ellipse(hdc, x, y, x + size, y + size);
    MoveToEx(hdc, x + size - scale_px(2), y + size - scale_px(2), NULL);
    LineTo(hdc, x + size + scale_px(6), y + size + scale_px(6));
    SelectObject(hdc, old_pen);
    SelectObject(hdc, old_brush);
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
        policy.GradientColor = 0xD2141820;
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
    int hot_filter = hit_test_rects(g_ui.filter_rects, kFilterCount, pt);
    int hot_row = hit_test_rects(g_ui.row_rects,
                                 (int)(sizeof(kRows) / sizeof(kRows[0])), pt);
    int hot_tab = hit_test_rects(g_ui.tab_rects, kTabCount, pt);
    int hot_system = hit_test_rects(g_ui.system_button_rects, kSystemButtonCount, pt);

    if (hot_filter != g_ui.hot_filter || hot_row != g_ui.hot_row ||
        hot_tab != g_ui.hot_tab || hot_system != g_ui.hot_system) {
        g_ui.hot_filter = hot_filter;
        g_ui.hot_row = hot_row;
        g_ui.hot_tab = hot_tab;
        g_ui.hot_system = hot_system;
        InvalidateRect(hwnd, NULL, FALSE);
    }
}

static void clear_hover_state(HWND hwnd)
{
    if (g_ui.hot_filter != -1 || g_ui.hot_row != -1 || g_ui.hot_tab != -1 ||
        g_ui.hot_system != -1) {
        g_ui.hot_filter = -1;
        g_ui.hot_row = -1;
        g_ui.hot_tab = -1;
        g_ui.hot_system = -1;
        InvalidateRect(hwnd, NULL, FALSE);
    }
}

static void layout_ui(HWND hwnd)
{
    RECT client;
    int pad = scale_px(20);
    int gap = scale_px(14);
    int title_height = scale_px(78);
    int summary_height = scale_px(104);
    int filter_height = scale_px(36);
    int details_width = scale_px(382);
    int system_size = scale_px(34);
    int i;
    int left;
    int row_height;

    GetClientRect(hwnd, &client);

    g_ui.title_rect = rect_make(pad, pad, client.right - pad, pad + title_height);

    g_ui.system_button_rects[1] =
        rect_make(g_ui.title_rect.right - system_size,
                  g_ui.title_rect.top + (title_height - system_size) / 2,
                  g_ui.title_rect.right,
                  g_ui.title_rect.top + (title_height - system_size) / 2 +
                      system_size);
    g_ui.system_button_rects[0] =
        rect_make(g_ui.system_button_rects[1].left - system_size - scale_px(8),
                  g_ui.system_button_rects[1].top,
                  g_ui.system_button_rects[1].left - scale_px(8),
                  g_ui.system_button_rects[1].bottom);

    g_ui.omnibox_rect =
        rect_make(g_ui.title_rect.left + scale_px(340),
                  g_ui.title_rect.top + scale_px(18),
                  g_ui.system_button_rects[0].left - scale_px(22),
                  g_ui.title_rect.bottom - scale_px(18));
    g_ui.status_chip_rect =
        rect_make(g_ui.title_rect.left + scale_px(178),
                  g_ui.title_rect.top + scale_px(24),
                  g_ui.title_rect.left + scale_px(314),
                  g_ui.title_rect.bottom - scale_px(24));

    left = g_ui.title_rect.left;
    for (i = 0; i < kSummaryCount; ++i) {
        int width =
            (rect_width(&g_ui.title_rect) - gap * (kSummaryCount - 1)) / kSummaryCount;
        g_ui.summary_rects[i] =
            rect_make(left, g_ui.title_rect.bottom + gap, left + width,
                      g_ui.title_rect.bottom + gap + summary_height);
        left = g_ui.summary_rects[i].right + gap;
    }

    left = g_ui.title_rect.left;
    for (i = 0; i < kFilterCount; ++i) {
        int width = scale_px(72);
        if (i == 1 || i == 2 || i == 3) {
            width = scale_px(116);
        } else if (i == 4) {
            width = scale_px(92);
        }
        g_ui.filter_rects[i] =
            rect_make(left,
                      g_ui.summary_rects[0].bottom + gap,
                      left + width,
                      g_ui.summary_rects[0].bottom + gap + filter_height);
        left = g_ui.filter_rects[i].right + scale_px(10);
    }

    g_ui.rows_panel_rect =
        rect_make(g_ui.title_rect.left,
                  g_ui.filter_rects[0].bottom + gap,
                  g_ui.title_rect.right - details_width - gap,
                  client.bottom - pad);

    g_ui.details_rect =
        rect_make(g_ui.rows_panel_rect.right + gap,
                  g_ui.filter_rects[0].bottom + gap,
                  g_ui.title_rect.right, client.bottom - pad);

    row_height = scale_px(86);
    for (i = 0; i < (int)(sizeof(kRows) / sizeof(kRows[0])); ++i) {
        int top = g_ui.rows_panel_rect.top + scale_px(72) +
                  i * (row_height + scale_px(10));
        g_ui.row_rects[i] =
            rect_make(g_ui.rows_panel_rect.left + scale_px(16), top,
                      g_ui.rows_panel_rect.right - scale_px(16), top + row_height);
    }

    for (i = 0; i < kTabCount; ++i) {
        int width = scale_px(74);
        int top = g_ui.details_rect.top + scale_px(250);
        int item_left = g_ui.details_rect.left + scale_px(18) +
                        i * (width + scale_px(8));
        g_ui.tab_rects[i] =
            rect_make(item_left, top, item_left + width, top + scale_px(34));
    }
}

static void draw_pill(HDC hdc, const RECT *rc, HFONT font, COLORREF bg,
                      COLORREF border, COLORREF text_color,
                      const wchar_t *text)
{
    fill_round_rect(hdc, rc, scale_px(16), bg);
    stroke_round_rect(hdc, rc, scale_px(16), border);
    draw_text_block(hdc, rc, font, text_color,
                    DT_CENTER | DT_SINGLELINE | DT_VCENTER, text);
}

static void draw_badge(HDC hdc, const RECT *rc, COLORREF bg, COLORREF text_color,
                       const wchar_t *text)
{
    fill_round_rect(hdc, rc, scale_px(10), bg);
    draw_text_block(hdc, rc, g_ui.font_small, text_color,
                    DT_CENTER | DT_SINGLELINE | DT_VCENTER, text);
}

static void draw_summary_card(HDC hdc, const RECT *rc, const SummaryCard *card)
{
    RECT accent = *rc;
    RECT label = *rc;
    RECT value = *rc;
    RECT detail = *rc;

    fill_round_rect(hdc, rc, scale_px(22), color_rgb(23, 28, 34));
    stroke_round_rect(hdc, rc, scale_px(22), color_rgb(38, 45, 54));

    accent.left += scale_px(18);
    accent.top += scale_px(16);
    accent.right = accent.left + scale_px(48);
    accent.bottom = accent.top + scale_px(6);
    fill_round_rect(hdc, &accent, scale_px(6), card->accent);

    label.left += scale_px(18);
    label.top += scale_px(28);
    label.right -= scale_px(18);
    label.bottom = label.top + scale_px(16);
    draw_text_block(hdc, &label, g_ui.font_small, color_rgb(144, 154, 166),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, card->label);

    value.left += scale_px(18);
    value.top += scale_px(46);
    value.right -= scale_px(18);
    value.bottom = value.top + scale_px(24);
    draw_text_block(hdc, &value, g_ui.font_metric, color_rgb(240, 245, 249),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, card->value);

    detail.left += scale_px(18);
    detail.right -= scale_px(18);
    detail.top = rc->bottom - scale_px(28);
    detail.bottom -= scale_px(12);
    draw_text_block(hdc, &detail, g_ui.font_small, color_rgb(118, 128, 140),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, card->detail);
}

static void draw_sparkline(HDC hdc, const RECT *rc, const int *values,
                           COLORREF color)
{
    POINT pts[kSparkCount];
    int i;
    int max_value = 1;
    HPEN pen;
    HGDIOBJ old_pen;

    for (i = 0; i < kSparkCount; ++i) {
        if (values[i] > max_value) {
            max_value = values[i];
        }
    }

    for (i = 0; i < kSparkCount; ++i) {
        pts[i].x = rc->left + MulDiv(rect_width(rc), i, kSparkCount - 1);
        pts[i].y = rc->bottom - MulDiv(rect_height(rc), values[i], max_value);
    }

    pen = CreatePen(PS_SOLID, 1, color);
    old_pen = SelectObject(hdc, pen);
    Polyline(hdc, pts, kSparkCount);
    SelectObject(hdc, old_pen);
    DeleteObject(pen);
}

static void draw_progress_bar(HDC hdc, const RECT *rc, int progress,
                              COLORREF accent)
{
    RECT fill = *rc;
    fill_round_rect(hdc, rc, scale_px(8), color_rgb(44, 51, 60));
    fill.right = fill.left + MulDiv(rect_width(rc), progress, 100);
    if (fill.right < fill.left + scale_px(8)) {
        fill.right = fill.left + scale_px(8);
    }
    fill_round_rect(hdc, &fill, scale_px(8), accent);
}

static void draw_row(HDC hdc, const RECT *rc, const TorrentRow *row, BOOL selected,
                     BOOL hot)
{
    RECT title = *rc;
    RECT meta = *rc;
    RECT right = *rc;
    RECT progress = *rc;
    RECT spark = *rc;
    RECT status;
    RECT metric;
    wchar_t pct[16];
    COLORREF bg = color_rgb(21, 27, 33);
    COLORREF border = color_rgb(33, 40, 49);

    if (selected) {
        bg = color_rgb(29, 41, 53);
        border = color_rgb(79, 120, 163);
    } else if (hot) {
        bg = color_rgb(25, 31, 38);
    }

    fill_round_rect(hdc, rc, scale_px(20), bg);
    stroke_round_rect(hdc, rc, scale_px(20), border);

    title.left += scale_px(20);
    title.top += scale_px(14);
    title.right = rc->left + scale_px(330);
    title.bottom = title.top + scale_px(22);
    draw_text_block(hdc, &title, g_ui.font_bold, color_rgb(241, 245, 249),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS,
                    row->name);

    meta.left += scale_px(20);
    meta.top = title.bottom + scale_px(4);
    meta.right = rc->left + scale_px(410);
    meta.bottom = meta.top + scale_px(18);
    draw_text_block(hdc, &meta, g_ui.font_small, color_rgb(132, 142, 154),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS,
                    row->meta);

    status = rect_make(rc->right - scale_px(122), rc->top + scale_px(14),
                       rc->right - scale_px(16), rc->top + scale_px(42));
    draw_pill(hdc, &status, g_ui.font_small, color_rgb(31, 38, 46),
              color_rgb(49, 57, 68), color_rgb(220, 229, 236), row->status);

    progress = rect_make(rc->left + scale_px(20), rc->bottom - scale_px(22),
                         rc->left + scale_px(290), rc->bottom - scale_px(14));
    draw_progress_bar(hdc, &progress, row->progress, row->accent);

    wsprintfW(pct, L"%d%% complete", row->progress);
    metric = rect_make(progress.right + scale_px(12), rc->bottom - scale_px(28),
                       progress.right + scale_px(120), rc->bottom - scale_px(8));
    draw_text_block(hdc, &metric, g_ui.font_small, color_rgb(160, 170, 182),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, pct);

    right = rect_make(rc->right - scale_px(210), rc->top + scale_px(48),
                      rc->right - scale_px(18), rc->bottom - scale_px(18));
    draw_text_block(hdc, &right, g_ui.font_small, color_rgb(229, 235, 241),
                    DT_RIGHT | DT_TOP | DT_SINGLELINE, row->speed);

    right.top += scale_px(18);
    draw_text_block(hdc, &right, g_ui.font_small, color_rgb(156, 166, 177),
                    DT_RIGHT | DT_TOP | DT_SINGLELINE, row->eta);

    right.top += scale_px(18);
    draw_text_block(hdc, &right, g_ui.font_small, color_rgb(128, 139, 151),
                    DT_RIGHT | DT_TOP | DT_SINGLELINE, row->ratio);

    spark = rect_make(rc->right - scale_px(198), rc->bottom - scale_px(32),
                      rc->right - scale_px(18), rc->bottom - scale_px(16));
    draw_sparkline(hdc, &spark, row->spark, row->accent);
}

static void draw_piece_map(HDC hdc, const RECT *rc, int progress, COLORREF accent)
{
    int gap = scale_px(3);
    int segments = 28;
    int width = (rect_width(rc) - gap * (segments - 1)) / segments;
    int filled = MulDiv(segments, progress, 100);
    int i;

    for (i = 0; i < segments; ++i) {
        RECT block = rect_make(rc->left + i * (width + gap), rc->top,
                               rc->left + i * (width + gap) + width, rc->bottom);
        COLORREF color = color_rgb(48, 54, 63);
        if (i < filled) {
            color = accent;
        }
        fill_round_rect(hdc, &block, scale_px(6), color);
    }
}

static void draw_details_panel(HDC hdc, const TorrentRow *row)
{
    RECT title = g_ui.details_rect;
    RECT subtitle = g_ui.details_rect;
    RECT hero = g_ui.details_rect;
    RECT meta = g_ui.details_rect;
    RECT path = g_ui.details_rect;
    RECT section = g_ui.details_rect;
    RECT map = g_ui.details_rect;
    RECT stat1;
    RECT stat2;
    RECT stat3;
    int i;

    fill_round_rect(hdc, &g_ui.details_rect, scale_px(24), color_rgb(20, 25, 31));
    stroke_round_rect(hdc, &g_ui.details_rect, scale_px(24), color_rgb(34, 41, 49));

    title.left += scale_px(18);
    title.top += scale_px(18);
    title.right -= scale_px(18);
    title.bottom = title.top + scale_px(18);
    draw_text_block(hdc, &title, g_ui.font_small, color_rgb(140, 150, 161),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER,
                    L"Selected Torrent");

    subtitle.left += scale_px(18);
    subtitle.top += scale_px(42);
    subtitle.right -= scale_px(18);
    subtitle.bottom = subtitle.top + scale_px(30);
    draw_text_block(hdc, &subtitle, g_ui.font_title, color_rgb(243, 247, 251),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS,
                    row->name);

    hero = rect_make(g_ui.details_rect.left + scale_px(18),
                     g_ui.details_rect.top + scale_px(88),
                     g_ui.details_rect.right - scale_px(18),
                     g_ui.details_rect.top + scale_px(226));
    fill_round_rect(hdc, &hero, scale_px(22), color_rgb(24, 30, 37));
    stroke_round_rect(hdc, &hero, scale_px(22), color_rgb(39, 46, 55));

    meta = hero;
    meta.left += scale_px(18);
    meta.top += scale_px(18);
    meta.right -= scale_px(18);
    meta.bottom = meta.top + scale_px(18);
    draw_text_block(hdc, &meta, g_ui.font_small, color_rgb(145, 155, 166),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, row->status);

    meta.top += scale_px(28);
    meta.bottom = meta.top + scale_px(22);
    draw_text_block(hdc, &meta, g_ui.font_metric, color_rgb(241, 245, 250),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, row->speed);

    meta.top += scale_px(30);
    meta.bottom = meta.top + scale_px(18);
    draw_text_block(hdc, &meta, g_ui.font_small, color_rgb(158, 168, 180),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, row->meta);

    path = hero;
    path.left += scale_px(18);
    path.right -= scale_px(18);
    path.top = hero.bottom - scale_px(34);
    path.bottom = path.top + scale_px(18);
    draw_text_block(hdc, &path, g_ui.font_small, color_rgb(116, 127, 140),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS,
                    row->save_path);

    stat1 = rect_make(hero.left + scale_px(18), hero.bottom - scale_px(78),
                      hero.left + scale_px(96), hero.bottom - scale_px(40));
    stat2 = rect_make(stat1.right + scale_px(8), stat1.top,
                      stat1.right + scale_px(86), stat1.bottom);
    stat3 = rect_make(stat2.right + scale_px(8), stat1.top,
                      stat2.right + scale_px(86), stat1.bottom);
    draw_badge(hdc, &stat1, color_rgb(34, 52, 68), color_rgb(232, 239, 245),
               row->eta);
    draw_badge(hdc, &stat2, color_rgb(31, 38, 46), color_rgb(219, 227, 235),
               row->ratio);
    draw_badge(hdc, &stat3, color_rgb(31, 38, 46), color_rgb(219, 227, 235),
               L"Peers");

    for (i = 0; i < kTabCount; ++i) {
        RECT tab = g_ui.tab_rects[i];
        if (g_ui.selected_tab == i) {
            fill_round_rect(hdc, &tab, scale_px(14), color_rgb(33, 50, 68));
            draw_text_block(hdc, &tab, g_ui.font_small, color_rgb(242, 246, 251),
                            DT_CENTER | DT_SINGLELINE | DT_VCENTER, kTabLabels[i]);
        } else {
            if (g_ui.hot_tab == i) {
                fill_round_rect(hdc, &tab, scale_px(14), color_rgb(27, 33, 40));
            }
            draw_text_block(hdc, &tab, g_ui.font_small, color_rgb(145, 155, 167),
                            DT_CENTER | DT_SINGLELINE | DT_VCENTER, kTabLabels[i]);
        }
    }

    section.left += scale_px(18);
    section.top = g_ui.tab_rects[0].bottom + scale_px(18);
    section.right -= scale_px(18);
    section.bottom = section.top + scale_px(18);
    draw_text_block(hdc, &section, g_ui.font_small, color_rgb(145, 155, 166),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER,
                    L"Piece availability");

    map = rect_make(g_ui.details_rect.left + scale_px(18), section.bottom + scale_px(12),
                    g_ui.details_rect.right - scale_px(18),
                    section.bottom + scale_px(26));
    draw_piece_map(hdc, &map, row->progress, row->accent);

    section.top = map.bottom + scale_px(24);
    section.bottom = section.top + scale_px(20);
    draw_text_block(hdc, &section, g_ui.font_bold, color_rgb(238, 243, 248),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER,
                    L"Why this mockup direction works");

    section.top += scale_px(30);
    section.bottom = section.top + scale_px(110);
    draw_text_block(
        hdc, &section, g_ui.font_small, color_rgb(128, 139, 151),
        DT_LEFT | DT_WORDBREAK,
        L"Dense rows remain the strongest primary surface for torrent work. "
        L"The shell becomes modern through acrylic, spacing, typography, and "
        L"secondary cards instead of turning the whole app into oversized tiles.");
}

static void draw_shell(HDC hdc)
{
    RECT title = g_ui.title_rect;
    RECT subtitle = g_ui.title_rect;
    RECT omnibox_text = g_ui.omnibox_rect;
    RECT panel_title = g_ui.rows_panel_rect;
    RECT panel_meta = g_ui.rows_panel_rect;
    int i;
    wchar_t badge[16];

    title.left += scale_px(2);
    title.top += scale_px(4);
    title.right = title.left + scale_px(180);
    title.bottom = title.top + scale_px(34);
    draw_text_block(hdc, &title, g_ui.font_title, color_rgb(242, 246, 250),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, L"TinyTorrent");

    subtitle = title;
    subtitle.top = title.bottom - scale_px(2);
    subtitle.bottom = subtitle.top + scale_px(18);
    subtitle.right = subtitle.left + scale_px(240);
    draw_text_block(hdc, &subtitle, g_ui.font_small, color_rgb(123, 134, 147),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER,
                    L"mockup shell  |  native acrylic  |  win32 only");

    draw_pill(hdc, &g_ui.status_chip_rect, g_ui.font_small, color_rgb(25, 30, 36),
              color_rgb(40, 47, 56), color_rgb(223, 231, 238), L"Mockup Only");

    fill_round_rect(hdc, &g_ui.omnibox_rect, scale_px(18), color_rgb(21, 26, 32));
    stroke_round_rect(hdc, &g_ui.omnibox_rect, scale_px(18), color_rgb(40, 47, 56));
    draw_search_icon(hdc, g_ui.omnibox_rect.left + scale_px(16),
                     g_ui.omnibox_rect.top + scale_px(14), scale_px(14),
                     color_rgb(127, 138, 151));
    omnibox_text.left += scale_px(44);
    omnibox_text.right -= scale_px(20);
    draw_text_block(hdc, &omnibox_text, g_ui.font_body, color_rgb(130, 141, 154),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER,
                    L"Search torrents or paste a magnet link");

    for (i = 0; i < kSystemButtonCount; ++i) {
        RECT button = g_ui.system_button_rects[i];
        COLORREF bg = color_rgb(20, 24, 30);
        if (g_ui.hot_system == i) {
            bg = (i == 1) ? color_rgb(116, 41, 47) : color_rgb(35, 42, 50);
        }
        fill_round_rect(hdc, &button, scale_px(12), bg);
        draw_text_block(hdc, &button, g_ui.font_body, color_rgb(230, 236, 242),
                        DT_CENTER | DT_SINGLELINE | DT_VCENTER,
                        i == 0 ? L"–" : L"x");
    }

    for (i = 0; i < kSummaryCount; ++i) {
        draw_summary_card(hdc, &g_ui.summary_rects[i], &kSummaries[i]);
    }

    for (i = 0; i < kFilterCount; ++i) {
        RECT badge_rc;
        COLORREF bg = color_rgb(22, 27, 33);
        COLORREF border = color_rgb(37, 45, 54);
        COLORREF text = color_rgb(188, 197, 207);
        if (g_ui.selected_filter == i) {
            bg = color_rgb(33, 49, 67);
            border = color_rgb(75, 116, 160);
            text = color_rgb(241, 246, 251);
        } else if (g_ui.hot_filter == i) {
            bg = color_rgb(27, 33, 40);
        }
        draw_pill(hdc, &g_ui.filter_rects[i], g_ui.font_small, bg, border, text,
                  kFilterLabels[i]);

        badge_rc = g_ui.filter_rects[i];
        badge_rc.left = badge_rc.right - scale_px(34);
        badge_rc.right -= scale_px(8);
        badge_rc.top += scale_px(7);
        badge_rc.bottom -= scale_px(7);
        wsprintfW(badge, L"%d", kFilterCounts[i]);
        draw_badge(hdc, &badge_rc, color_rgb(43, 51, 60), color_rgb(228, 235, 241),
                   badge);
    }

    fill_round_rect(hdc, &g_ui.rows_panel_rect, scale_px(24), color_rgb(18, 23, 28));
    stroke_round_rect(hdc, &g_ui.rows_panel_rect, scale_px(24), color_rgb(33, 40, 48));

    panel_title.left += scale_px(18);
    panel_title.top += scale_px(18);
    panel_title.right -= scale_px(18);
    panel_title.bottom = panel_title.top + scale_px(24);
    draw_text_block(hdc, &panel_title, g_ui.font_bold, color_rgb(241, 245, 249),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER, L"Queue");

    panel_meta = panel_title;
    panel_meta.top = panel_title.bottom + scale_px(2);
    panel_meta.bottom = panel_meta.top + scale_px(18);
    draw_text_block(hdc, &panel_meta, g_ui.font_small, color_rgb(124, 135, 148),
                    DT_LEFT | DT_SINGLELINE | DT_VCENTER,
                    L"Compact transfer rows with richer context and calmer chrome");

    for (i = 0; i < (int)(sizeof(kRows) / sizeof(kRows[0])); ++i) {
        draw_row(hdc, &g_ui.row_rects[i], &kRows[i], g_ui.selected_row == i,
                 g_ui.hot_row == i);
    }

    draw_details_panel(hdc, &kRows[g_ui.selected_row]);
}

static void paint_window(HWND hwnd)
{
    PAINTSTRUCT ps;
    HDC hdc = BeginPaint(hwnd, &ps);
    draw_shell(hdc);
    EndPaint(hwnd, &ps);
}

static void recreate_assets(void)
{
    rebuild_fonts();
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

    if (PtInRect(&g_ui.omnibox_rect, pt) ||
        hit_test_rects(g_ui.system_button_rects, kSystemButtonCount, pt) != -1 ||
        hit_test_rects(g_ui.filter_rects, kFilterCount, pt) != -1 ||
        hit_test_rects(g_ui.tab_rects, kTabCount, pt) != -1 ||
        hit_test_rects(g_ui.row_rects, (int)(sizeof(kRows) / sizeof(kRows[0])), pt) !=
            -1) {
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
        g_ui.hwnd = hwnd;
        g_ui.dpi = GetDpiForWindow(hwnd);
        g_ui.hot_filter = -1;
        g_ui.selected_filter = 1;
        g_ui.hot_row = -1;
        g_ui.selected_row = 0;
        g_ui.hot_tab = -1;
        g_ui.selected_tab = 3;
        g_ui.hot_system = -1;
        recreate_assets();
        layout_ui(hwnd);
        apply_visuals(hwnd);
        center_window(hwnd, scale_px(1380), scale_px(900));
        return 0;
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
        mmi->ptMinTrackSize.x = scale_px(1100);
        mmi->ptMinTrackSize.y = scale_px(760);
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
        if (PtInRect(&g_ui.omnibox_rect, pt)) {
            SetCursor(LoadCursorW(NULL, IDC_IBEAM));
            return TRUE;
        }
        if (hit_test_rects(g_ui.filter_rects, kFilterCount, pt) != -1 ||
            hit_test_rects(g_ui.tab_rects, kTabCount, pt) != -1 ||
            hit_test_rects(g_ui.row_rects, (int)(sizeof(kRows) / sizeof(kRows[0])), pt) !=
                -1 ||
            hit_test_rects(g_ui.system_button_rects, kSystemButtonCount, pt) != -1) {
            SetCursor(LoadCursorW(NULL, IDC_HAND));
            return TRUE;
        }
        break;
    }
    case WM_LBUTTONUP:
    {
        POINT pt = {GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
        int sys = hit_test_rects(g_ui.system_button_rects, kSystemButtonCount, pt);
        int filter = hit_test_rects(g_ui.filter_rects, kFilterCount, pt);
        int row = hit_test_rects(g_ui.row_rects,
                                 (int)(sizeof(kRows) / sizeof(kRows[0])), pt);
        int tab = hit_test_rects(g_ui.tab_rects, kTabCount, pt);

        if (sys == 0) {
            ShowWindow(hwnd, SW_MINIMIZE);
            return 0;
        }
        if (sys == 1) {
            PostMessageW(hwnd, WM_CLOSE, 0, 0);
            return 0;
        }
        if (filter != -1) {
            g_ui.selected_filter = filter;
            InvalidateRect(hwnd, NULL, FALSE);
            return 0;
        }
        if (row != -1) {
            g_ui.selected_row = row;
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
    case WM_ERASEBKGND:
        return 1;
    case WM_PAINT:
        paint_window(hwnd);
        return 0;
    case WM_DESTROY:
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

    hwnd = CreateWindowExW(0, kClassName, L"TinyTorrent Mockup",
                           WS_POPUP | WS_VISIBLE, CW_USEDEFAULT, CW_USEDEFAULT,
                           1380, 900, NULL, NULL, instance, NULL);
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
