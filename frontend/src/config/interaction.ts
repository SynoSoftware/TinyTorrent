import type { Transition } from "framer-motion";

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

export const INTERACTION_CONFIG: InteractionConfig = {
    dragOverlay: {
        root: {
            initialScale: 1.05,
            activeScale: 1,
            exitScale: 1.03,
            initialBlur: 0,
            activeBlur: 18,
            exitBlur: 0,
            transition: {
                type: "spring",
                stiffness: 260,
                damping: 34,
                mass: 0.8,
            },
        },
        layers: [
            {
                id: "outer",
                className:
                    "absolute inset-0 rounded-[32px] border border-primary/40 bg-gradient-to-br from-primary/30 via-transparent to-transparent shadow-[0_25px_120px_rgba(16,185,129,0.35)]",
                initial: { scale: 0.94, opacity: 0 },
                animate: { scale: 1, opacity: 0.55 },
                exit: { opacity: 0 },
                transition: {
                    type: "spring",
                    stiffness: 280,
                    damping: 32,
                },
            },
            {
                id: "middle",
                className:
                    "absolute inset-6 rounded-[28px] border border-primary/40",
                initial: { scale: 0.9, opacity: 0 },
                animate: { scale: 1, opacity: 0.4 },
                exit: { opacity: 0 },
                transition: {
                    type: "spring",
                    stiffness: 240,
                    damping: 28,
                    repeat: Infinity,
                    repeatType: "reverse",
                },
            },
            {
                id: "inner",
                className:
                    "absolute inset-12 rounded-[26px] border border-primary/30 opacity-70",
                initial: { scale: 0.95, opacity: 0 },
                animate: { scale: 1.02, opacity: 0.35 },
                exit: { opacity: 0 },
                transition: {
                    type: "spring",
                    stiffness: 220,
                    damping: 26,
                    repeat: Infinity,
                    repeatType: "reverse",
                },
            },
        ],
        iconPulse: {
            initialScale: 0.9,
            animateScale: [1, 1.08, 1],
            transition: {
                type: "spring",
                stiffness: 260,
                damping: 22,
                repeat: Infinity,
                repeatType: "reverse",
            },
        },
    },
    modalBloom: {
        originScale: 0.62,
        fallbackScale: 0.85,
        fallbackOffsetY: 20,
        exitScale: 0.9,
        exitOffsetY: 25,
        transition: {
            type: "spring",
            stiffness: 210,
            damping: 32,
        },
    },
    speedChart: {
        width: 180,
        height: 72,
    },
    networkGraph: {
        width: 64,
        height: 24,
    },
};
