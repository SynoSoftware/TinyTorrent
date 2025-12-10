import { type MotionProps } from "framer-motion";

export const PIECE_MAP_CONFIG = {
    cell_size: 10,
    cell_gap: 2,
    columns: 60,
    rows: {
        base: 4,
        max: 16,
    },
} as const;

export const PEER_MAP_CONFIG = {
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
} as const;

export const SCATTER_CONFIG = {
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
} as const;

export const TOOLTIP_ANIMATION: MotionProps = {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.1 },
};
