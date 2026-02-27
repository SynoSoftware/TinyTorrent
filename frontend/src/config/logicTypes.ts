import type { MotionProps, Transition } from "framer-motion";
import type { ConnectionStatus } from "@/shared/status";

export type NativeHostWindow = Window & { __TINY_TORRENT_NATIVE__?: boolean };
export type ShellStyle = "classic" | "immersive";

export type ShellTokens = {
    gap: number;
    radius: number;
    ringPadding: number;
    handleHitArea: number;
    innerRadius: number;
    insetRadius: number;
    outerStyle: {
        borderRadius: string | number;
        padding: string | number;
        paddingLeft?: string | number;
        paddingRight?: string | number;
    };
    surfaceStyle: { borderRadius: string | number };
};

export type NumberDomainDefaults = Record<string, number>;
export type NumberDomainKeyMap<T extends NumberDomainDefaults> = {
    [K in keyof T]: string;
};
export type Writable<T> = { -readonly [K in keyof T]: T[K] };

export type Values<T> = T[keyof T];
export type StatusVisualKeyFromKeys<
    TKeys extends {
        tone: Record<string, string>;
        speed: Record<string, string>;
    },
> = ConnectionStatus | Values<TKeys["tone"]> | Values<TKeys["speed"]>;

export type StatusVisualRecipe = {
    bg: string;
    border: string;
    text: string;
    shadow: string;
    glow: string;
    panel?: string;
    button?: string;
    hudSurface?: string;
    hudIconBg?: string;
};

export type DetailsPieceMapConfig = {
    cell_size: number;
    cell_gap: number;
    columns: number;
    rows: {
        base: number;
        max: number;
    };
};

export type DetailsPeerMapConfig = {
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

export type DetailsScatterConfig = {
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

export type DetailsAvailabilityHeatmapConfig = {
    shadow_blur_max: number;
    hover_stroke_width: number;
    hover_stroke_inset: number;
    cell_stroke_inset: number;
    use_ui_sampling_shim?: boolean;
};

export type DetailsSpeedChartConfig = {
    line_width: number;
    fill_alpha: number;
    down_stroke_token: string;
    up_stroke_token: string;
};

export type DetailsVisualizationsConfig = {
    piece_map: DetailsPieceMapConfig;
    peer_map: DetailsPeerMapConfig;
    scatter: DetailsScatterConfig;
    availability_heatmap: DetailsAvailabilityHeatmapConfig;
    speed_chart: DetailsSpeedChartConfig;
    tooltip_animation: MotionProps;
};

export type TooltipOpacityAnimation = {
    initial: { opacity: number };
    animate: { opacity: number };
    exit: { opacity: number };
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
