import type { MotionProps, Transition } from "framer-motion";
import constants from "./constants.json";

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
    row_height: 32,
    font_size: "text-[11px]",
    font_mono: "font-mono",
    icon_size: 14,
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

// Immersive shell metrics
// Prefer `outer_radius` for immersive. Keep `main_inner_radius` as a legacy fallback.
const immersiveOuterRadius =
    readOptionalNumber(immersiveShellConfig.outer_radius) ??
    readOptionalNumber(immersiveShellConfig.main_inner_radius) ??
    classicOuterRadius;
const immersiveRingPadding = readNumber(immersiveShellConfig.ring_padding, 0);
const immersivePanelGap = readNumber(immersiveShellConfig.panel_gap, 0);
const immersiveHandleHitArea = readNumber(
    immersiveShellConfig.handle_hit_area,
    classicHandleHitArea
);

export type ShellStyle = "classic" | "immersive";

export type ShellTokens = {
    gap: number;
    radius: number;
    ringPadding: number;
    handleHitArea: number;
    innerRadius: number;
    insetRadius: number;
    frameStyle: { borderRadius: string; padding: string };
    contentStyle: { borderRadius: string };
};

export const SHELL_TOKENS_CLASSIC: ShellTokens = {
    gap: classicPanelGap,
    radius: classicOuterRadius,
    ringPadding: classicRingPadding,
    handleHitArea: classicHandleHitArea,
    innerRadius: Math.max(0, classicOuterRadius - classicRingPadding),
    insetRadius: Math.max(
        0,
        Math.max(0, classicOuterRadius - classicRingPadding) - classicPanelGap
    ),
    frameStyle: {
        borderRadius: `${classicOuterRadius}px`,
        padding: `${classicRingPadding}px`,
    },
    contentStyle: {
        borderRadius: `${Math.max(
            0,
            classicOuterRadius - classicRingPadding
        )}px`,
    },
};

export const SHELL_TOKENS_IMMERSIVE: ShellTokens = {
    gap: immersivePanelGap,
    radius: immersiveOuterRadius,
    ringPadding: immersiveRingPadding,
    handleHitArea: immersiveHandleHitArea,
    innerRadius: Math.max(0, immersiveOuterRadius - immersiveRingPadding),
    insetRadius: Math.max(
        0,
        Math.max(0, immersiveOuterRadius - immersiveRingPadding) -
            immersivePanelGap
    ),
    frameStyle: {
        borderRadius: `${immersiveOuterRadius}px`,
        padding: `${immersiveRingPadding}px`,
    },
    contentStyle: {
        borderRadius: `${Math.max(
            0,
            immersiveOuterRadius - immersiveRingPadding
        )}px`,
    },
};

export const getShellTokens = (style: ShellStyle): ShellTokens =>
    style === "immersive" ? SHELL_TOKENS_IMMERSIVE : SHELL_TOKENS_CLASSIC;

// --- Legacy exports (classic defaults) ---
// Keep older consumers working. New code should use `getShellTokens(style)`.
export const SHELL_GAP = SHELL_TOKENS_CLASSIC.gap;
export const SHELL_HANDLE_HIT_AREA = SHELL_TOKENS_CLASSIC.handleHitArea;
export const SHELL_INNER_RADIUS = SHELL_TOKENS_CLASSIC.innerRadius;
export const SHELL_INSET_RADIUS = SHELL_TOKENS_CLASSIC.insetRadius;
export const SHELL_RADIUS = SHELL_TOKENS_CLASSIC.radius;
export const SHELL_RING_PADDING = SHELL_TOKENS_CLASSIC.ringPadding;
export const SHELL_FRAME_STYLE = SHELL_TOKENS_CLASSIC.frameStyle;
export const SHELL_CONTENT_STYLE = SHELL_TOKENS_CLASSIC.contentStyle;

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

// Classic metrics remain the default shared layout metrics.
const layoutOuterRadius = classicOuterRadius;
const layoutRingPadding = classicRingPadding;
const layoutPanelGap = classicPanelGap;
const layoutHandleHitArea = classicHandleHitArea;
export const LAYOUT_METRICS = {
    outerRadius: layoutOuterRadius,
    panelGap: layoutPanelGap,
    ringPadding: layoutRingPadding,
    handleHitArea: layoutHandleHitArea,
    innerRadius: Math.max(0, layoutOuterRadius - layoutRingPadding),
} as const;
const pieceMapLayout = layoutConfig.piece_map ?? DEFAULT_LAYOUT_PIECE_MAP;
const heatmapLayout = layoutConfig.heatmap ?? DEFAULT_LAYOUT_HEATMAP;
const peerMapLayout = layoutConfig.peer_map ?? DEFAULT_LAYOUT_PEER_MAP;
const tableLayout = layoutConfig.table ?? DEFAULT_TABLE_LAYOUT;
const detailsLayout = layoutConfig.details ?? {};

export const TABLE_LAYOUT = {
    rowHeight: tableLayout.row_height,
    fontSize: tableLayout.font_size,
    fontMono: tableLayout.font_mono,
    iconSize: tableLayout.icon_size,
    overscan: tableLayout.overscan,
} as const;

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

type DetailsVisualizationsConfig = {
    piece_map: DetailsPieceMapConfig;
    peer_map: DetailsPeerMapConfig;
    scatter: DetailsScatterConfig;
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
};

const DETAILS_VISUALIZATIONS =
    (constants.visualizations?.details as DetailsVisualizationsConfig) ??
    DEFAULT_DETAILS_VISUALIZATIONS;

export const DETAILS_PIECE_MAP_CONFIG = DETAILS_VISUALIZATIONS.piece_map;
export const DETAILS_PEER_MAP_CONFIG = DETAILS_VISUALIZATIONS.peer_map;
export const DETAILS_SCATTER_CONFIG = DETAILS_VISUALIZATIONS.scatter;
export const DETAILS_TOOLTIP_ANIMATION =
    DETAILS_VISUALIZATIONS.tooltip_animation;

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
