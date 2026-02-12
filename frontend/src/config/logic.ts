import type { MotionProps, Transition } from "framer-motion";
import constants from "@/config/constants.json";
import { STATUS } from "@/shared/status";

// TODO: Keep `config/logic.ts` as a central “knob registry” and shared constants authority:
// TODO: - UI/UX timing constants (polling cadence, animation delays, debounce windows) should be sourced from here (or from `constants.json`) and not hardcoded in leaf components.
// TODO: - Do not encode protocol/engine concepts here. Transmission RPC is the daemon contract; `uiMode = "Full" | "Rpc"` is a UI/runtime capability derived elsewhere.
// TODO: - If you find the same numeric literal used in multiple components, do not copy it: add a named token/constant (or flag it) so edits remain safe.

// Design-system authority declaration
export const DESIGN_SYSTEM_AUTHORITY = {
    source: "index.css",
    primitives: ["--u", "--fz", "--z"],
    note: "All geometry must be derived from CSS primitives; JSON must contain intent only.",
};

// Design system: geometry is authoritative in CSS; JSON contains intent only.

const normalizeRepeat = (value?: number) => (value === -1 ? Infinity : value);

const adaptTransition = <T extends Transition>(transition: T) => ({
    ...transition,
    repeat: normalizeRepeat(transition.repeat),
});

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};

type NativeHostWindow = Window & { __TINY_TORRENT_NATIVE__?: boolean };

const readOptionalNumber = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

const readNumber = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

const DEFAULT_LAYOUT_PIECE_MAP = {
    columns: 42,
    base_rows: 6,
    max_rows: 12,
    cell_size: 10,
    cell_gap: 2,
} as const;

const DEFAULT_LAYOUT_HEATMAP = {
    sample_limit_multiplier: 6,
    zoom_levels: [1, 1.5, 2, 2.5],
    cell_size: 6,
    cell_gap: 3,
} as const;

const DEFAULT_LAYOUT_PEER_MAP = {
    drift_amplitude: 5,
    drift_duration: {
        min: 6,
        max: 10,
    },
} as const;

const DEFAULT_TABLE_LAYOUT = {
    // Geometry is CSS-driven; defaults here are CSS var references.
    row_height: "var(--tt-h-row)",
    font_size: "text-scaled",
    font_mono: "font-mono",
    overscan: 20,
} as const;

const layoutConfig = constants.layout ?? {};
const performanceConfig = asRecord(constants.performance);
const defaultsConfig = asRecord(constants.defaults);
const uiConfig = asRecord(constants.ui);
const heartbeatConfig = asRecord(constants.heartbeats);
const timerConfig = asRecord(constants.timers);
const wsReconnectConfig = asRecord(timerConfig.ws_reconnect);
const recoveryTimerConfig = asRecord(timerConfig.recovery);

const DEFAULT_DEFAULTS = {
    rpc_endpoint: "/transmission/rpc",
    magnet_protocol_prefix: "magnet:?",
} as const;

const DEFAULT_PERFORMANCE = {
    history_data_points: 60,
    max_delta_cycles: 30,
    min_immediate_tick_ms: 1000,
    read_rpc_cache_ms: 0,
    transport_cache_ttl_ms: 500,
} as const;

const DEFAULT_UI = {
    toast_display_duration_ms: 3000,
} as const;

const DEFAULT_HEARTBEATS = {
    table_refresh_interval_ms: 1500,
    detail_refresh_interval_ms: 500,
    background_refresh_interval_ms: 5000,
} as const;

const DEFAULT_TIMERS = {
    clipboard_badge_duration_ms: 1500,
    focus_restore_delay_ms: 500,
    magnet_event_dedup_window_ms: 1000,
    action_feedback_start_toast_duration_ms: 900,
    optimistic_checking_grace_ms: 5000,
    ws_reconnect: {
        initial_delay_ms: 1000,
        max_delay_ms: 10000,
    },
    ghost_timeout_ms: 30000,
    table_persist_debounce_ms: 250,
    recovery: {
        poll_interval_ms: 4000,
        retry_cooldown_ms: 15000,
        modal_resolved_auto_close_delay_ms: 3000,
        modal_resolved_countdown_tick_ms: 250,
        pick_path_success_delay_ms: 600,
        active_state_poll_interval_ms: 200,
        probe_poll_interval_ms: 500,
        probe_timeout_ms: 2000,
        verify_watch_interval_ms: 500,
    },
} as const;

export const TOAST_DISPLAY_DURATION_MS = readNumber(
    uiConfig.toast_display_duration_ms,
    DEFAULT_UI.toast_display_duration_ms,
);

export const DEFAULT_RPC_ENDPOINT =
    typeof defaultsConfig.rpc_endpoint === "string" &&
    defaultsConfig.rpc_endpoint.trim().length > 0
        ? defaultsConfig.rpc_endpoint
        : DEFAULT_DEFAULTS.rpc_endpoint;

export const MAGNET_PROTOCOL_PREFIX =
    typeof defaultsConfig.magnet_protocol_prefix === "string" &&
    defaultsConfig.magnet_protocol_prefix.trim().length > 0
        ? defaultsConfig.magnet_protocol_prefix
        : DEFAULT_DEFAULTS.magnet_protocol_prefix;

export const HISTORY_DATA_POINTS = readNumber(
    performanceConfig.history_data_points,
    DEFAULT_PERFORMANCE.history_data_points,
);

export const HEARTBEAT_MAX_DELTA_CYCLES = readNumber(
    performanceConfig.max_delta_cycles,
    DEFAULT_PERFORMANCE.max_delta_cycles,
);

export const HEARTBEAT_MIN_IMMEDIATE_TRIGGER_MS = readNumber(
    performanceConfig.min_immediate_tick_ms,
    DEFAULT_PERFORMANCE.min_immediate_tick_ms,
);

export const READ_RPC_CACHE_TTL_MS = readNumber(
    performanceConfig.read_rpc_cache_ms,
    DEFAULT_PERFORMANCE.read_rpc_cache_ms,
);

export const TRANSPORT_CACHE_TTL_MS = readNumber(
    performanceConfig.transport_cache_ttl_ms,
    DEFAULT_PERFORMANCE.transport_cache_ttl_ms,
);

// --- SHELL (Classic / Immersive) ---
const DEFAULT_SHELL_CLASSIC = {
    outer_radius: 12,
    panel_gap: 0,
    ring_padding: 0,
    handle_hit_area: 10,
} as const;

const DEFAULT_SHELL_IMMERSIVE = {
    // Immersive is its own shell. Keep defaults independent from classic
    // to avoid accidental cross-mode coupling.
    chrome_padding: 8,
    main_padding: 8,
    hud_card_radius: 28,
    handle_hit_area: 20,
} as const;

const shellConfig = asRecord(layoutConfig.shell);

// Back-compat: older config had layout.shell as the classic shell object.
const legacyShellLooksClassic =
    "outer_radius" in shellConfig ||
    "panel_gap" in shellConfig ||
    "ring_padding" in shellConfig;

const classicShellConfig = legacyShellLooksClassic
    ? shellConfig
    : asRecord(shellConfig.classic);

const immersiveShellConfig = asRecord(shellConfig.immersive);

// Classic shell metrics (default for shared layout)
const classicOuterRadius = readNumber(
    classicShellConfig.outer_radius,
    DEFAULT_SHELL_CLASSIC.outer_radius,
);
const classicRingPadding = readNumber(
    classicShellConfig.ring_padding,
    DEFAULT_SHELL_CLASSIC.ring_padding,
);
const classicPanelGap = readNumber(
    classicShellConfig.panel_gap,
    DEFAULT_SHELL_CLASSIC.panel_gap,
);
const classicHandleHitArea = readNumber(
    classicShellConfig.handle_hit_area,
    DEFAULT_SHELL_CLASSIC.handle_hit_area,
);
const classicInnerRadius = Math.max(0, classicOuterRadius - classicRingPadding);
const classicInsetRadius = Math.max(0, classicInnerRadius - classicPanelGap);

// Immersive shell metrics
// Prefer `outer_radius` for immersive. Keep `main_inner_radius` as a legacy fallback.
const immersiveOuterRadius =
    readOptionalNumber(immersiveShellConfig.outer_radius) ??
    readOptionalNumber(immersiveShellConfig.main_inner_radius) ??
    classicOuterRadius;
const immersiveRingPadding = readNumber(immersiveShellConfig.ring_padding, 0);
const immersivePanelGap = readNumber(immersiveShellConfig.panel_gap, 0);
// Increase immersive shell resize / handle hit-box to 20px by default
const immersiveHandleHitArea = readNumber(
    immersiveShellConfig.handle_hit_area,
    DEFAULT_SHELL_IMMERSIVE.handle_hit_area,
);
const immersiveInnerRadius = Math.max(
    0,
    immersiveOuterRadius - immersiveRingPadding,
);
const immersiveInsetRadius = Math.max(
    0,
    immersiveInnerRadius - immersivePanelGap,
);

export type ShellStyle = "classic" | "immersive";

export type ShellTokens = {
    gap: number;
    radius: number;
    ringPadding: number;
    handleHitArea: number;
    innerRadius: number;
    insetRadius: number;
    // frameStyle now carries the container-facing geometry (border radius, padding
    // and directional padding). Components may spread `...shell.frameStyle` and
    // optionally override specific corners; this centralizes the container
    // spacing so the Navbar/StatusBar can rely on consistent left/right padding.
    outerStyle: {
        borderRadius: string | number;
        padding: string | number;
        paddingLeft?: string | number;
        paddingRight?: string | number;
    };
    surfaceStyle: { borderRadius: string | number };
};

export const SHELL_TOKENS_CLASSIC: ShellTokens = {
    gap: classicPanelGap,
    radius: classicOuterRadius,
    ringPadding: classicRingPadding,
    handleHitArea: classicHandleHitArea,
    innerRadius: classicInnerRadius,
    insetRadius: classicInsetRadius,
    outerStyle: {
        // Use the *inner* radius for the frame so inner block containers
        // can be controlled from a single token (`innerRadius`).
        borderRadius: classicInnerRadius,
        padding: classicRingPadding,
        // Standard left/right padding for block containers. Use the semantic
        // panel spacing so Navbar/StatusBar and other blocks render consistently
        // without per-component hacks.
        paddingLeft: "var(--spacing-panel)",
        paddingRight: "var(--spacing-panel)",
    },
    surfaceStyle: {
        borderRadius: classicInnerRadius,
    },
};

export const SHELL_TOKENS_IMMERSIVE: ShellTokens = {
    gap: immersivePanelGap,
    radius: immersiveOuterRadius,
    ringPadding: immersiveRingPadding,
    handleHitArea: immersiveHandleHitArea,
    innerRadius: immersiveInnerRadius,
    insetRadius: immersiveInsetRadius,
    outerStyle: {
        // Mirror classic: frame uses innerRadius so a single radius knob controls
        // all block containers in both shells.
        borderRadius: immersiveInnerRadius,
        padding: immersiveRingPadding,
        paddingLeft: "var(--spacing-panel)",
        paddingRight: "var(--spacing-panel)",
    },
    surfaceStyle: {
        borderRadius: immersiveInnerRadius,
    },
};

export const getShellTokens = (style: ShellStyle): ShellTokens =>
    style === "immersive" ? SHELL_TOKENS_IMMERSIVE : SHELL_TOKENS_CLASSIC;

// ---------------------------------------------------------------------------
// Surface ownership helpers (geometry-only)
// ---------------------------------------------------------------------------
// These helpers are small, explicit aliases to the shell's `surfaceStyle` and
// exist to document and future-proof surface ownership. They intentionally
// carry geometry only (radius propagation) and MUST NOT include visual
// recipes (background, blur, border, shadow) or change runtime styling.
//
// Usage guidance (implementation note only):
// - WORKBENCH_SURFACE applies to the docked workbench frame (the `PanelGroup`
//   wrapper). Structural children (Panels, headers, tabs, content) must NOT
//   reapply surface tokens — they are pure structural/content layers.
// - MODAL_SURFACE applies to floating/standalone surfaces (fullscreen detail
//   view and modal/dialog overlays). Modal content remains pure content.
//
// These helpers simply return the `surfaceStyle` object from the selected
// shell tokens so future visual recipes can reuse consistent geometry.
export const WORKBENCH_SURFACE = (style: ShellStyle) =>
    getShellTokens(style).surfaceStyle;

export const MODAL_SURFACE = (style: ShellStyle) =>
    getShellTokens(style).surfaceStyle;

export const IS_NATIVE_HOST =
    import.meta.env.VITE_INTERNAL_MODE === "true" ||
    !!(window as NativeHostWindow).__TINY_TORRENT_NATIVE__;

export const SHELL_RADIUS = classicOuterRadius;
export const SHELL_HANDLE_HIT_AREA = classicHandleHitArea;
export const LAYOUT_METRICS = {
    outerRadius: classicOuterRadius,
    panelGap: classicPanelGap,
    ringPadding: classicRingPadding,
    handleHitArea: classicHandleHitArea,
    innerRadius: classicInnerRadius,
    insetRadius: classicInsetRadius,
} as const;

export const STATUS_CHIP_GAP = Math.max(2, LAYOUT_METRICS.panelGap);
export const STATUS_CHIP_RADIUS = Math.max(
    2,
    Math.round(LAYOUT_METRICS.innerRadius / 2),
);

// Immersive workspace chrome tokens (owned by the immersive shell)
export const IMMERSIVE_CHROME_PADDING = readNumber(
    immersiveShellConfig.chrome_padding,
    DEFAULT_SHELL_IMMERSIVE.chrome_padding,
);
export const IMMERSIVE_MAIN_PADDING = readNumber(
    immersiveShellConfig.main_padding,
    DEFAULT_SHELL_IMMERSIVE.main_padding,
);
export const IMMERSIVE_MAIN_CONTENT_PADDING = readNumber(
    immersiveShellConfig.main_content_padding,
    immersivePanelGap,
);
export const IMMERSIVE_MAIN_INNER_RADIUS = immersiveOuterRadius;
export const IMMERSIVE_HUD_CARD_RADIUS = readNumber(
    immersiveShellConfig.hud_card_radius,
    DEFAULT_SHELL_IMMERSIVE.hud_card_radius,
);

export const IMMERSIVE_CHROME_RADIUS =
    immersiveOuterRadius + IMMERSIVE_CHROME_PADDING;
export const IMMERSIVE_MAIN_OUTER_RADIUS =
    IMMERSIVE_MAIN_INNER_RADIUS + IMMERSIVE_MAIN_PADDING;

const pieceMapLayout = layoutConfig.piece_map ?? DEFAULT_LAYOUT_PIECE_MAP;
const heatmapLayout = layoutConfig.heatmap ?? DEFAULT_LAYOUT_HEATMAP;
const peerMapLayout = layoutConfig.peer_map ?? DEFAULT_LAYOUT_PEER_MAP;
const tableLayout = {
    ...DEFAULT_TABLE_LAYOUT,
    ...(layoutConfig.table ?? {}),
};
const detailsLayout = layoutConfig.details ?? {};

export const TABLE_LAYOUT = {
    // These values are CSS-driven tokens; runtime code that needs
    // numeric pixel heights should read the computed style instead.
    rowHeight: "var(--tt-h-row)",
    fontSize: tableLayout.font_size,
    fontMono: tableLayout.font_mono,
    overscan: tableLayout.overscan,
} as const;

// --- UI Token Bases from constants.json (used to initialize CSS variables) ---
const uiLayout = asRecord(layoutConfig.ui);

// Export canonical scale bases (single source of truth for unit/font/zoom).
// These values are derived from `constants.json` and must be imported by
// runtime readers (hooks/components) that need numeric scale tokens.
const scaleCfgTop = asRecord(uiLayout.scale);
export const SCALE_BASES = {
    unit: readNumber(scaleCfgTop.unit, 4),
    fontBase: readNumber(scaleCfgTop.font_base ?? scaleCfgTop.fontBase, 11),
    zoom: readNumber(scaleCfgTop.zoom ?? scaleCfgTop.level ?? 1, 1),
};

export const UI_BASES = {
    navbar: {
        height: "var(--height-nav)",
        padding: "var(--spacing-workbench)",
        gap: "var(--spacing-workbench)",
        brandIcon: "var(--tt-brand-icon-size)",
        tabFont: "var(--tt-navbar-tab-font-size)",
        metaFont: "var(--tt-navbar-meta-font-size)",
        searchWidth: "var(--tt-search-width)",
        searchWidthLg: "var(--tt-search-width)",
    },
    statusbar: {
        height: "var(--height-status)",
        iconSm: "var(--tt-status-icon-sm)",
        iconMd: "var(--tt-status-icon-md)",
        iconLg: "var(--tt-status-icon-lg)",
        iconXl: "var(--tt-status-icon-xl)",
        buttonH: "var(--tt-button-h)",
        buttonMinW: "var(--tt-button-min-w)",
        min100: "var(--tt-badge-min-width)",
        min120: "var(--tt-badge-min-width)",
        min80: "var(--tt-badge-min-width)",
    },
    dropOverlay: {
        paddingX: "var(--spacing-workbench)",
        paddingY: "var(--spacing-workbench)",
        iconSize: "var(--tt-brand-icon-size)",
        titleFont: "var(--fz-scaled)",
        fontSize: "var(--fz-scaled)",
    },
    fileExplorer: {
        rowHeight: "var(--tt-h-row)",
        depthIndent: "var(--tt-file-depth-indent)",
        rowPaddingLeft: "var(--tt-file-row-padding-left)",
        contextMenuWidth: "var(--tt-file-context-menu-width)",
        contextMenuMargin: "var(--tt-file-context-menu-margin)",
        priorityBadgeFontSize: "var(--tt-priority-badge-font-size)",
        priorityBadgePaddingX: "var(--tt-priority-badge-padding-x)",
        priorityBadgePaddingY: "var(--tt-priority-badge-padding-y)",
        fileIconSize: "var(--tt-file-icon-size)",
        checkboxPadding: "var(--tt-file-checkbox-padding)",
    },
};

// Semantic role names for application layer (exported so components/higher-level
// code can reference the canonical recipe rather than ad-hoc class strings).
export const DROP_OVERLAY_ROLE = "tt-drop-overlay";
export const DROP_OVERLAY_TITLE_ROLE = "tt-drop-overlay__title";

export const ICON_SIZE = {
    primary: UI_BASES.statusbar.iconMd,
    secondary: UI_BASES.statusbar.iconSm,
} as const;

export function applyCssTokenBases() {
    if (typeof document === "undefined") return;
    const root = document.documentElement.style;
    // Simplified: only export the canonical scale primitives.
    // All other UI tokens are derived in CSS from these two values.
    const uiLayout = asRecord(layoutConfig.ui);
    const scaleCfg = asRecord(uiLayout.scale);
    // Preserve CSS defaults for unit and font base to avoid FOUC.
    // Only set runtime zoom-level here (JS-driven zoom overrides).
    const zoom = readNumber(scaleCfg.zoom ?? scaleCfg.level ?? 1, 1);
    root.setProperty("--tt-zoom-level", String(zoom));
}

// Minimum visual thickness (in pixels) for panel resize handles.
export const MIN_HANDLE_VISUAL_WIDTH = 1;

export const PIECE_COLUMNS = pieceMapLayout.columns;
export const PIECE_BASE_ROWS = pieceMapLayout.base_rows;
export const PIECE_MAX_ROWS = pieceMapLayout.max_rows;
export const PIECE_CANVAS_CELL_SIZE = pieceMapLayout.cell_size;
export const PIECE_CANVAS_CELL_GAP = pieceMapLayout.cell_gap;

export const HEATMAP_SAMPLE_LIMIT =
    PIECE_COLUMNS * heatmapLayout.sample_limit_multiplier;
export const HEATMAP_ZOOM_LEVELS = heatmapLayout.zoom_levels;
export const HEATMAP_CANVAS_CELL_SIZE = heatmapLayout.cell_size;
export const HEATMAP_CANVAS_CELL_GAP = heatmapLayout.cell_gap;

export const PEER_MAP_CONFIG = peerMapLayout;

export const SPEED_WINDOW_OPTIONS = [
    { key: "1m", label: "1m", minutes: 1 },
    { key: "5m", label: "5m", minutes: 5 },
    { key: "30m", label: "30m", minutes: 30 },
    { key: "1h", label: "1h", minutes: 60 },
] as const;

const iconography = constants.iconography ?? {};
const iconographyStrokeWidth = readNumber(iconography.stroke_width, 1.5);
const iconographyStrokeWidthDense = readNumber(
    iconography.stroke_width_dense,
    1.2,
);

export const ICON_STROKE_WIDTH = `var(--tt-icon-stroke, ${iconographyStrokeWidth})`;
export const ICON_STROKE_WIDTH_DENSE = `var(--tt-icon-stroke-dense, ${iconographyStrokeWidthDense})`;

export const HANDLE_HITAREA_CLASS = "w-handle";

// Cells should not include extra layout padding for the handle — the handle
// hit-area is provided by an absolutely-positioned element so it won't
// require reserved spacing in the layout.
export const CELL_PADDING_CLASS = `pl-tight pr-tight`;

export const CELL_BASE_CLASS =
    "flex items-center overflow-hidden h-full truncate whitespace-nowrap text-ellipsis box-border leading-none";

// Shared header visual tokens used across table headers and inspector headers.
// Components should compose layout-specific classes (grid/flex) with this
// base so color, padding and typography remain consistent.
// `HEADER_BASE` is typography-only: casing, scale, tracking and subdued text color.
// It must NOT include background, padding, grid, border, or rounding.
//
// DEPRECATED: Use TEXT_ROLE.label from @/config/textRoles instead
export const HEADER_BASE =
    "text-label font-bold uppercase tracking-label text-foreground/60";
export const SURFACE_BORDER = "border-content1/20";

// DEPRECATED: Use TEXT_ROLE from @/config/textRoles instead
export const TEXT_ROLES = {
    primary: "text-scaled font-semibold text-foreground",
    secondary: "text-scaled text-foreground/70",
    label: `${HEADER_BASE} text-label`,
    helper: "text-label text-foreground/60",
} as const;

// Re-export centralized text role system for convenience
export { TEXT_ROLE, TEXT_ROLE_EXTENDED } from "@/config/textRoles";
export const STATUS_CHIP_STYLE = {
    width: "var(--tt-status-chip-w)",
    minWidth: "var(--tt-status-chip-w)",
    maxWidth: "var(--tt-status-chip-w)",
    height: "var(--tt-status-chip-h)",
    boxSizing: "border-box",
} as const;

// `TABLE_HEADER_CLASS` composes `HEADER_BASE` with table-specific surface, padding and grid.
export const TABLE_HEADER_CLASS = `${HEADER_BASE} py-panel ${CELL_PADDING_CLASS} bg-background/40 grid grid-cols-torrent gap-tools rounded-modal border ${SURFACE_BORDER}`;

export const STATUS_VISUAL_KEYS = {
    tone: {
        PRIMARY: "tone_primary",
        SUCCESS: "tone_success",
        WARNING: "tone_warning",
        DANGER: "tone_danger",
        MUTED: "tone_muted",
        NEUTRAL: "tone_neutral",
    },
    speed: {
        DOWN: "speed_down",
        SEED: "speed_seed",
        IDLE: "speed_idle",
    },
} as const;

// Semantic status visuals used across the app (moved out of components)
export const STATUS_VISUALS: Record<
    string,
    {
        bg: string;
        border: string;
        text: string;
        shadow: string;
        glow: string;
        panel?: string;
        button?: string;
        hudSurface?: string;
        hudIconBg?: string;
    }
> = {
    [STATUS.connection.IDLE]: {
        bg: "bg-content1/5 hover:bg-content1/10",
        border: "border-default/10",
        text: "text-foreground/40",
        shadow: "shadow-none",
        glow: "bg-content1",
        hudSurface:
            "bg-gradient-to-br from-warning/15 via-background/30 to-background/5",
        hudIconBg: "bg-warning/15 text-warning",
    },
    [STATUS.connection.CONNECTED]: {
        bg: "bg-success/5 hover:bg-success/10",
        border: "border-default/20",
        text: "text-success",
        shadow: "shadow-success-glow",
        glow: "bg-success",
        hudSurface:
            "bg-gradient-to-br from-success/15 via-background/30 to-background/10",
        hudIconBg: "bg-success/15 text-success",
    },
    [STATUS.connection.ERROR]: {
        bg: "bg-danger/5 hover:bg-danger/10",
        border: "border-default/20",
        text: "text-danger",
        shadow: "shadow-danger-glow",
        glow: "bg-danger",
        hudSurface:
            "bg-gradient-to-br from-danger/20 via-background/25 to-background/5",
        hudIconBg: "bg-danger/15 text-danger",
    },
    [STATUS_VISUAL_KEYS.tone.PRIMARY]: {
        bg: "bg-primary/10",
        border: "border-primary/30",
        text: "text-primary",
        shadow: "shadow-none",
        glow: "bg-primary",
        panel: "border-primary/40 bg-primary/10 text-primary",
        button: "text-primary hover:text-primary-600 hover:bg-primary/10",
    },
    [STATUS_VISUAL_KEYS.tone.SUCCESS]: {
        bg: "bg-success/10",
        border: "border-success/30",
        text: "text-success",
        shadow: "shadow-none",
        glow: "bg-success",
        panel: "border-success/40 bg-success/10 text-success",
        button: "text-success hover:text-success-600 hover:bg-success/10",
    },
    [STATUS_VISUAL_KEYS.tone.WARNING]: {
        bg: "bg-warning/10",
        border: "border-warning/30",
        text: "text-warning",
        shadow: "shadow-none",
        glow: "bg-warning",
        panel: "border-warning/30 bg-warning/10 text-warning",
        button: "text-warning hover:text-warning-600 hover:bg-warning/10",
    },
    [STATUS_VISUAL_KEYS.tone.DANGER]: {
        bg: "bg-danger/10",
        border: "border-danger/30",
        text: "text-danger",
        shadow: "shadow-none",
        glow: "bg-danger",
        panel: "border-danger/40 bg-danger/5 text-danger",
        button: "text-danger hover:text-danger-600 hover:bg-danger/10",
    },
    [STATUS_VISUAL_KEYS.tone.MUTED]: {
        bg: "bg-content1/10",
        border: "border-default/20",
        text: "text-foreground/30",
        shadow: "shadow-none",
        glow: "bg-content1",
    },
    [STATUS_VISUAL_KEYS.tone.NEUTRAL]: {
        bg: "bg-content1/10",
        border: "border-default/20",
        text: "text-default-500",
        shadow: "shadow-none",
        glow: "bg-content1",
        button: "text-default-500 hover:text-foreground hover:bg-default-200",
    },
    [STATUS_VISUAL_KEYS.speed.DOWN]: {
        bg: "bg-success/10",
        border: "border-success/30",
        text: "text-success",
        shadow: "shadow-none",
        glow: "bg-success",
    },
    [STATUS_VISUAL_KEYS.speed.SEED]: {
        bg: "bg-primary/10",
        border: "border-primary/30",
        text: "text-primary",
        shadow: "shadow-none",
        glow: "bg-primary",
    },
    [STATUS_VISUAL_KEYS.speed.IDLE]: {
        bg: "bg-content1/10",
        border: "border-default/20",
        text: "text-foreground/60",
        shadow: "shadow-none",
        glow: "bg-content1",
    },
};

export const TABLE_REFRESH_INTERVAL_MS = readNumber(
    heartbeatConfig.table_refresh_interval_ms,
    DEFAULT_HEARTBEATS.table_refresh_interval_ms,
);
export const DETAIL_REFRESH_INTERVAL_MS = readNumber(
    heartbeatConfig.detail_refresh_interval_ms,
    DEFAULT_HEARTBEATS.detail_refresh_interval_ms,
);
export const BACKGROUND_REFRESH_INTERVAL_MS = readNumber(
    heartbeatConfig.background_refresh_interval_ms,
    DEFAULT_HEARTBEATS.background_refresh_interval_ms,
);
export const HEARTBEAT_INTERVALS = {
    detail: DETAIL_REFRESH_INTERVAL_MS,
    table: TABLE_REFRESH_INTERVAL_MS,
    background: BACKGROUND_REFRESH_INTERVAL_MS,
};

export const CLIPBOARD_BADGE_DURATION_MS = readNumber(
    timerConfig.clipboard_badge_duration_ms,
    DEFAULT_TIMERS.clipboard_badge_duration_ms,
);

export const FOCUS_RESTORE_DELAY_MS = readNumber(
    timerConfig.focus_restore_delay_ms,
    DEFAULT_TIMERS.focus_restore_delay_ms,
);

export const MAGNET_EVENT_DEDUP_WINDOW_MS = readNumber(
    timerConfig.magnet_event_dedup_window_ms,
    DEFAULT_TIMERS.magnet_event_dedup_window_ms,
);

export const ACTION_FEEDBACK_START_TOAST_DURATION_MS = readNumber(
    timerConfig.action_feedback_start_toast_duration_ms,
    DEFAULT_TIMERS.action_feedback_start_toast_duration_ms,
);

export const OPTIMISTIC_CHECKING_GRACE_MS = readNumber(
    timerConfig.optimistic_checking_grace_ms,
    DEFAULT_TIMERS.optimistic_checking_grace_ms,
);

export const WS_RECONNECT_INITIAL_DELAY_MS = readNumber(
    wsReconnectConfig.initial_delay_ms,
    DEFAULT_TIMERS.ws_reconnect.initial_delay_ms,
);

export const WS_RECONNECT_MAX_DELAY_MS = readNumber(
    wsReconnectConfig.max_delay_ms,
    DEFAULT_TIMERS.ws_reconnect.max_delay_ms,
);

export const GHOST_TIMEOUT_MS = readNumber(
    timerConfig.ghost_timeout_ms,
    DEFAULT_TIMERS.ghost_timeout_ms,
);

export const TABLE_PERSIST_DEBOUNCE_MS = readNumber(
    timerConfig.table_persist_debounce_ms,
    DEFAULT_TIMERS.table_persist_debounce_ms,
);

const configuredRecoveryPollInterval =
    readOptionalNumber(recoveryTimerConfig.poll_interval_ms) ??
    readOptionalNumber(recoveryTimerConfig.auto_recovery_interval_ms) ??
    readOptionalNumber(recoveryTimerConfig.probe_interval_ms);

export const RECOVERY_POLL_INTERVAL_MS =
    configuredRecoveryPollInterval ?? DEFAULT_TIMERS.recovery.poll_interval_ms;

export const RECOVERY_RETRY_COOLDOWN_MS = readNumber(
    recoveryTimerConfig.retry_cooldown_ms,
    DEFAULT_TIMERS.recovery.retry_cooldown_ms,
);

export const RECOVERY_MODAL_RESOLVED_AUTO_CLOSE_DELAY_MS = readNumber(
    recoveryTimerConfig.modal_resolved_auto_close_delay_ms,
    DEFAULT_TIMERS.recovery.modal_resolved_auto_close_delay_ms,
);

export const RECOVERY_MODAL_RESOLVED_COUNTDOWN_TICK_MS = readNumber(
    recoveryTimerConfig.modal_resolved_countdown_tick_ms,
    DEFAULT_TIMERS.recovery.modal_resolved_countdown_tick_ms,
);

export const RECOVERY_PICK_PATH_SUCCESS_DELAY_MS = readNumber(
    recoveryTimerConfig.pick_path_success_delay_ms,
    DEFAULT_TIMERS.recovery.pick_path_success_delay_ms,
);

export const RECOVERY_ACTIVE_STATE_POLL_INTERVAL_MS = readNumber(
    recoveryTimerConfig.active_state_poll_interval_ms,
    DEFAULT_TIMERS.recovery.active_state_poll_interval_ms,
);

export const RECOVERY_PROBE_POLL_INTERVAL_MS = readNumber(
    recoveryTimerConfig.probe_poll_interval_ms,
    DEFAULT_TIMERS.recovery.probe_poll_interval_ms,
);

export const RECOVERY_PROBE_TIMEOUT_MS = readNumber(
    recoveryTimerConfig.probe_timeout_ms,
    DEFAULT_TIMERS.recovery.probe_timeout_ms,
);

export const RECOVERY_VERIFY_WATCH_INTERVAL_MS = readNumber(
    recoveryTimerConfig.verify_watch_interval_ms,
    DEFAULT_TIMERS.recovery.verify_watch_interval_ms,
);

export interface DragOverlayRootConfig {
    initialScale: number;
    activeScale: number;
    exitScale: number;
    initialBlur: number;
    activeBlur: number;
    exitBlur: number;
    transition: {
        type: "spring";
        stiffness: number;
        damping: number;
        mass: number;
    };
}

export interface DragOverlayLayerConfig {
    id: string;
    className: string;
    initial: Record<string, number>;
    animate: Record<string, number>;
    exit: Record<string, number>;
    transition: Transition;
}

export interface DragOverlayIconConfig {
    initialScale: number;
    animateScale: number[];
    transition: Transition;
}

export interface DragOverlayConfig {
    root: DragOverlayRootConfig;
    layers: DragOverlayLayerConfig[];
    iconPulse: DragOverlayIconConfig;
}

export interface ModalBloomConfig {
    originScale: number;
    fallbackScale: number;
    fallbackOffsetY: number;
    exitScale: number;
    exitOffsetY: number;
    transition: {
        type: "spring";
        stiffness: number;
        damping: number;
    };
}

export interface ChartConfig {
    width: number;
    height: number;
}

export interface InteractionConfig {
    dragOverlay: DragOverlayConfig;
    modalBloom: ModalBloomConfig;
    speedChart: ChartConfig;
    networkGraph: ChartConfig;
}

const normalizeDragOverlay = (
    dragOverlay: DragOverlayConfig,
): DragOverlayConfig => ({
    ...dragOverlay,
    layers: dragOverlay.layers.map((layer) => ({
        ...layer,
        transition: adaptTransition(layer.transition),
    })),
    iconPulse: {
        ...dragOverlay.iconPulse,
        transition: adaptTransition(dragOverlay.iconPulse.transition),
    },
});

const rawInteraction = constants.interaction as InteractionConfig;
export const INTERACTION_CONFIG: InteractionConfig = {
    ...rawInteraction,
    dragOverlay: normalizeDragOverlay(rawInteraction.dragOverlay),
};

const SPEED_CHART = INTERACTION_CONFIG.speedChart;
export const CHART_WIDTH = SPEED_CHART.width;
export const CHART_HEIGHT = SPEED_CHART.height;

export const DETAILS_TAB_CONTENT_MAX_HEIGHT =
    detailsLayout.tab_content_max_height ?? 360;

type DetailsPieceMapConfig = {
    cell_size: number;
    cell_gap: number;
    columns: number;
    rows: {
        base: number;
        max: number;
    };
};

type DetailsPeerMapConfig = {
    drift_amplitude: number;
    drift_duration: {
        min: number;
        max: number;
    };
    layout: {
        center: number;
        radius: number;
        base_node_size: number;
        progress_scale: number;
    };
};

type DetailsScatterConfig = {
    padding: {
        top: number;
        bottom: number;
        x: number;
    };
    radius: {
        normal: number;
        hover: number;
        hit: number;
    };
};

type DetailsAvailabilityHeatmapConfig = {
    shadow_blur_max: number;
    hover_stroke_width: number;
    hover_stroke_inset: number;
    cell_stroke_inset: number;
    use_ui_sampling_shim?: boolean;
};

type DetailsSpeedChartConfig = {
    line_width: number;
    fill_alpha: number;
    down_stroke_token: string;
    up_stroke_token: string;
};

type DetailsVisualizationsConfig = {
    piece_map: DetailsPieceMapConfig;
    peer_map: DetailsPeerMapConfig;
    scatter: DetailsScatterConfig;
    availability_heatmap: DetailsAvailabilityHeatmapConfig;
    speed_chart: DetailsSpeedChartConfig;
    tooltip_animation: MotionProps;
};

const DEFAULT_DETAILS_VISUALIZATIONS: DetailsVisualizationsConfig = {
    piece_map: {
        cell_size: 10,
        cell_gap: 2,
        columns: 60,
        rows: {
            base: 4,
            max: 16,
        },
    },
    peer_map: {
        drift_amplitude: 8,
        drift_duration: {
            min: 4,
            max: 8,
        },
        layout: {
            center: 90,
            radius: 70,
            base_node_size: 6,
            progress_scale: 12,
        },
    },
    scatter: {
        padding: {
            top: 24,
            bottom: 20,
            x: 16,
        },
        radius: {
            normal: 4,
            hover: 7,
            hit: 20,
        },
    },
    tooltip_animation: {
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.95 },
        transition: { duration: 0.1 },
    },
    availability_heatmap: {
        shadow_blur_max: 16,
        hover_stroke_width: 1.1,
        hover_stroke_inset: 0.6,
        cell_stroke_inset: 0.6,
    },
    speed_chart: {
        line_width: 3,
        fill_alpha: 0.35,
        down_stroke_token: "--heroui-success",
        up_stroke_token: "--heroui-secondary",
    },
};

const DETAILS_VISUALIZATIONS =
    (constants.visualizations?.details as DetailsVisualizationsConfig) ??
    DEFAULT_DETAILS_VISUALIZATIONS;

export const DETAILS_PIECE_MAP_CONFIG = DETAILS_VISUALIZATIONS.piece_map;
export const DETAILS_PEER_MAP_CONFIG = DETAILS_VISUALIZATIONS.peer_map;
export const DETAILS_SCATTER_CONFIG = DETAILS_VISUALIZATIONS.scatter;
export const DETAILS_TOOLTIP_ANIMATION =
    DETAILS_VISUALIZATIONS.tooltip_animation;
const readOpacity = (value: unknown, fallback: number) => {
    if (
        value &&
        typeof value === "object" &&
        "opacity" in (value as Record<string, unknown>)
    ) {
        const candidate = (value as { opacity?: unknown }).opacity;
        if (typeof candidate === "number") return candidate;
    }
    return fallback;
};
export type TooltipOpacityAnimation = {
    initial: { opacity: number };
    animate: { opacity: number };
    exit: { opacity: number };
};
export const DETAILS_TOOLTIP_OPACITY_ANIMATION: TooltipOpacityAnimation = {
    initial: {
        opacity: readOpacity(DETAILS_TOOLTIP_ANIMATION?.initial, 0),
    },
    animate: {
        opacity: readOpacity(DETAILS_TOOLTIP_ANIMATION?.animate, 1),
    },
    exit: { opacity: readOpacity(DETAILS_TOOLTIP_ANIMATION?.exit, 0) },
};

// Availability heatmap visual tokens (moved from hard-coded literals)
export const DETAILS_AVAILABILITY_HEATMAP =
    DETAILS_VISUALIZATIONS.availability_heatmap;
export const HEATMAP_SHADOW_BLUR_MAX =
    DETAILS_AVAILABILITY_HEATMAP.shadow_blur_max;
export const HEATMAP_HOVER_STROKE_WIDTH =
    DETAILS_AVAILABILITY_HEATMAP.hover_stroke_width;
export const HEATMAP_HOVER_STROKE_INSET =
    DETAILS_AVAILABILITY_HEATMAP.hover_stroke_inset;
export const HEATMAP_CELL_STROKE_INSET =
    DETAILS_AVAILABILITY_HEATMAP.cell_stroke_inset;
export const HEATMAP_USE_UI_SAMPLING_SHIM = Boolean(
    DETAILS_AVAILABILITY_HEATMAP.use_ui_sampling_shim,
);

export const DETAILS_SPEED_CHART = DETAILS_VISUALIZATIONS.speed_chart;
export const SPEED_CHART_LINE_WIDTH = DETAILS_SPEED_CHART.line_width;
export const SPEED_CHART_FILL_ALPHA = DETAILS_SPEED_CHART.fill_alpha;
export const SPEED_CHART_DOWN_STROKE_TOKEN =
    DETAILS_SPEED_CHART.down_stroke_token;
export const SPEED_CHART_UP_STROKE_TOKEN = DETAILS_SPEED_CHART.up_stroke_token;

// Chart geometry & behavior tokens (centralized so layout/behavior can be tuned)
export const SPEED_CANVAS_DENOM_FLOOR = 1024; // baseline denominator for scaling
export const SPEED_SMOOTH_DECAY = 0.98; // decay applied to maxRef smoothing
export const SPEED_RETENTION_MS = 15 * 60_000; // fallback retention for history

// Bucket thresholds used by visualizations to choose sampling resolution
export const SPEED_BUCKET_WIDTH_SMALL = 240;
export const SPEED_BUCKET_WIDTH_MED = 520;
export const SPEED_BUCKET_COUNT_SMALL = 48;
export const SPEED_BUCKET_COUNT_MED = 96;

// Typography / tracking roles (semantic tokens)
export const TRACKING_LABEL = "tracking-label";

type ShortcutIntentMap = {
    SelectAll: "action.select_all";
    Delete: "action.delete";
    ShowDetails: "action.show_details";
    TogglePause: "action.toggle_pause";
    Recheck: "action.recheck";
    RemoveWithData: "action.remove_with_data";
};

type ShortcutKeyScopeMap = {
    Dashboard: "dashboard";
    Modal: "modal";
    Settings: "settings";
    App: "app";
};

export const ShortcutIntent = constants.shortcuts.intents as ShortcutIntentMap;

export type ShortcutIntent =
    (typeof ShortcutIntent)[keyof typeof ShortcutIntent];

export const KEY_SCOPE = constants.shortcuts.keyScope as ShortcutKeyScopeMap;

export const KEYMAP: Record<ShortcutIntent, string | string[]> = constants
    .shortcuts.keymap as Record<ShortcutIntent, string | string[]>;
