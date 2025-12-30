import type { MotionProps, Transition } from "framer-motion";
import constants from "./constants.json";

// Single-owner export for all config consumers
export const CONFIG = constants;

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

// --- SHELL (Classic / Immersive) ---
const DEFAULT_SHELL_CLASSIC = {
    outer_radius: 20,
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
    DEFAULT_SHELL_CLASSIC.outer_radius
);
const classicRingPadding = readNumber(
    classicShellConfig.ring_padding,
    DEFAULT_SHELL_CLASSIC.ring_padding
);
const classicPanelGap = readNumber(
    classicShellConfig.panel_gap,
    DEFAULT_SHELL_CLASSIC.panel_gap
);
const classicHandleHitArea = readNumber(
    classicShellConfig.handle_hit_area,
    DEFAULT_SHELL_CLASSIC.handle_hit_area
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
    DEFAULT_SHELL_IMMERSIVE.handle_hit_area
);
const immersiveInnerRadius = Math.max(
    0,
    immersiveOuterRadius - immersiveRingPadding
);
const immersiveInsetRadius = Math.max(
    0,
    immersiveInnerRadius - immersivePanelGap
);

export type ShellStyle = "classic" | "immersive";

export type ShellTokens = {
    gap: number;
    radius: number;
    ringPadding: number;
    handleHitArea: number;
    innerRadius: number;
    insetRadius: number;
    frameStyle: { borderRadius: string | number; padding: string | number };
    contentStyle: { borderRadius: string | number };
};

export const SHELL_TOKENS_CLASSIC: ShellTokens = {
    gap: classicPanelGap,
    radius: classicOuterRadius,
    ringPadding: classicRingPadding,
    handleHitArea: classicHandleHitArea,
    innerRadius: classicInnerRadius,
    insetRadius: classicInsetRadius,
    frameStyle: {
        borderRadius: classicOuterRadius,
        padding: classicRingPadding,
    },
    contentStyle: {
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
    frameStyle: {
        borderRadius: immersiveOuterRadius,
        padding: immersiveRingPadding,
    },
    contentStyle: {
        borderRadius: immersiveInnerRadius,
    },
};

export const getShellTokens = (style: ShellStyle): ShellTokens =>
    style === "immersive" ? SHELL_TOKENS_IMMERSIVE : SHELL_TOKENS_CLASSIC;

export const IS_NATIVE_HOST =
    import.meta.env.VITE_INTERNAL_MODE === "true" ||
    !!(window as any).__TINY_TORRENT_NATIVE__;

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
    Math.round(LAYOUT_METRICS.innerRadius / 2)
);

// Immersive workspace chrome tokens (owned by the immersive shell)
export const IMMERSIVE_CHROME_PADDING = readNumber(
    immersiveShellConfig.chrome_padding,
    DEFAULT_SHELL_IMMERSIVE.chrome_padding
);
export const IMMERSIVE_MAIN_PADDING = readNumber(
    immersiveShellConfig.main_padding,
    DEFAULT_SHELL_IMMERSIVE.main_padding
);
export const IMMERSIVE_MAIN_CONTENT_PADDING = readNumber(
    immersiveShellConfig.main_content_padding,
    immersivePanelGap
);
export const IMMERSIVE_MAIN_INNER_RADIUS = immersiveOuterRadius;
export const IMMERSIVE_HUD_CARD_RADIUS = readNumber(
    immersiveShellConfig.hud_card_radius,
    DEFAULT_SHELL_IMMERSIVE.hud_card_radius
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
const uiLayout = (layoutConfig.ui ?? {}) as Record<string, any>;

// Export canonical scale bases (single source of truth for unit/font/zoom).
// These values are derived from `constants.json` and must be imported by
// runtime readers (hooks/components) that need numeric scale tokens.
const scaleCfgTop = uiLayout.scale ?? {};
export const SCALE_BASES = {
    unit: readNumber((scaleCfgTop as any).unit, 4),
    fontBase: readNumber(
        (scaleCfgTop as any).font_base ?? (scaleCfgTop as any).fontBase,
        11
    ),
    zoom: readNumber(
        (scaleCfgTop as any).zoom ?? (scaleCfgTop as any).level ?? 1,
        1
    ),
};

const navbarConfig = uiLayout.navbar ?? {};
const statusbarConfig = uiLayout.statusbar ?? {};
const dropOverlayConfig = uiLayout.drop_overlay ?? {};

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

export const ICON_SIZE = {
    primary: UI_BASES.statusbar.iconMd,
    secondary: UI_BASES.statusbar.iconSm,
} as const;

export function applyCssTokenBases() {
    if (typeof document === "undefined") return;
    const root = document.documentElement.style;
    // Simplified: only export the canonical scale primitives.
    // All other UI tokens are derived in CSS from these two values.
    const uiLayout = (layoutConfig.ui ?? {}) as Record<string, any>;
    const scaleCfg = uiLayout.scale ?? {};
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

export const ICON_STROKE_WIDTH = constants.iconography.stroke_width;
export const ICON_STROKE_WIDTH_DENSE = constants.iconography.stroke_width_dense;

// Semantic status visuals used across the app (moved out of components)
export const STATUS_VISUALS: Record<
    "idle" | "connected" | "error",
    {
        bg: string;
        border: string;
        text: string;
        shadow: string;
        glow: string;
    }
> = {
    idle: {
        bg: "bg-content1/5 hover:bg-content1/10",
        border: "border-default/10",
        text: "text-foreground/40",
        shadow: "shadow-none",
        glow: "bg-content1",
    },
    connected: {
        bg: "bg-success/5 hover:bg-success/10",
        border: "border-default/20",
        text: "text-success",
        shadow: "shadow-success-glow",
        glow: "bg-success",
    },
    error: {
        bg: "bg-danger/5 hover:bg-danger/10",
        border: "border-default/20",
        text: "text-danger",
        shadow: "shadow-danger-glow",
        glow: "bg-danger",
    },
};

export const TABLE_REFRESH_INTERVAL_MS =
    constants.heartbeats.table_refresh_interval_ms;
export const DETAIL_REFRESH_INTERVAL_MS =
    constants.heartbeats.detail_refresh_interval_ms;
export const BACKGROUND_REFRESH_INTERVAL_MS =
    constants.heartbeats.background_refresh_interval_ms;
export const HEARTBEAT_INTERVALS = {
    detail: DETAIL_REFRESH_INTERVAL_MS,
    table: TABLE_REFRESH_INTERVAL_MS,
    background: BACKGROUND_REFRESH_INTERVAL_MS,
};

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
    dragOverlay: DragOverlayConfig
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
        up_stroke_token: "--heroui-primary",
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
    DETAILS_AVAILABILITY_HEATMAP.use_ui_sampling_shim
);

export const DETAILS_SPEED_CHART = DETAILS_VISUALIZATIONS.speed_chart;
export const SPEED_CHART_LINE_WIDTH = DETAILS_SPEED_CHART.line_width;
export const SPEED_CHART_FILL_ALPHA = DETAILS_SPEED_CHART.fill_alpha;
export const SPEED_CHART_DOWN_STROKE_TOKEN =
    DETAILS_SPEED_CHART.down_stroke_token;
export const SPEED_CHART_UP_STROKE_TOKEN = DETAILS_SPEED_CHART.up_stroke_token;

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
};

export const ShortcutIntent = constants.shortcuts.intents as ShortcutIntentMap;

export type ShortcutIntent =
    (typeof ShortcutIntent)[keyof typeof ShortcutIntent];

export const KEY_SCOPE = constants.shortcuts.keyScope as ShortcutKeyScopeMap;

export const KEYMAP: Record<ShortcutIntent, string | string[]> = constants
    .shortcuts.keymap as Record<ShortcutIntent, string | string[]>;
