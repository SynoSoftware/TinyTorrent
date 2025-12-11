import type { MotionProps, Transition } from "framer-motion";
import constants from "./constants.json";

const normalizeRepeat = (value?: number) =>
    value === -1 ? Infinity : value;

const adaptTransition = <T extends Transition>(transition: T) => ({
    ...transition,
    repeat: normalizeRepeat(transition.repeat),
});

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
const pieceMapLayout = layoutConfig.piece_map ?? DEFAULT_LAYOUT_PIECE_MAP;
const heatmapLayout = layoutConfig.heatmap ?? DEFAULT_LAYOUT_HEATMAP;
const peerMapLayout = layoutConfig.peer_map ?? DEFAULT_LAYOUT_PEER_MAP;
const tableLayout = layoutConfig.table ?? DEFAULT_TABLE_LAYOUT;

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
export const ICON_STROKE_WIDTH_DENSE =
    constants.iconography.stroke_width_dense;

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

const normalizeDragOverlay = (dragOverlay: DragOverlayConfig): DragOverlayConfig => ({
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

export const ShortcutIntent = constants.shortcuts
    .intents as ShortcutIntentMap;

export type ShortcutIntent =
    (typeof ShortcutIntent)[keyof typeof ShortcutIntent];

export const KEY_SCOPE = constants.shortcuts.keyScope as ShortcutKeyScopeMap;

export const KEYMAP: Record<ShortcutIntent, string | string[]> =
    constants.shortcuts.keymap as Record<ShortcutIntent, string | string[]>;
