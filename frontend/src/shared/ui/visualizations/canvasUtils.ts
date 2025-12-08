import { useMemo } from "react";
import constants from "../../../config/constants.json";

export const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

export type FrameHandle = number | ReturnType<typeof setTimeout>;

export const scheduleFrame = (callback: FrameRequestCallback): FrameHandle =>
    typeof window !== "undefined"
        ? window.requestAnimationFrame(callback)
        : setTimeout(() => callback(Date.now()), 16);

export const cancelScheduledFrame = (handle: FrameHandle | null) => {
    if (handle == null) return;
    if (typeof window !== "undefined") {
        window.cancelAnimationFrame?.(handle as number);
    } else {
        clearTimeout(handle);
    }
};

type CanvasPalette = {
    primary: string;
    warning: string;
    missing: string;
    highlight: string;
    glowPrimary: string;
    glowWarning: string;
    placeholder: string;
};

const buildCanvasPalette = (): CanvasPalette => {
    const computedStyles =
        typeof window !== "undefined"
            ? window.getComputedStyle(document.documentElement)
            : null;
    const readVar = (name: string, fallback: string) => {
        const value = computedStyles?.getPropertyValue(name)?.trim();
        return value || fallback;
    };
    return {
        primary: readVar("--heroui-primary", "#06b6d4"),
        warning: readVar("--heroui-warning", "#f97316"),
        missing: readVar("--heroui-content1", "rgba(15,23,42,0.3)"),
        highlight: "rgba(255,255,255,0.65)",
        glowPrimary: "rgba(14,165,233,0.45)",
        glowWarning: "rgba(245,158,11,0.55)",
        placeholder: "rgba(255,255,255,0.08)",
    };
};

export const useCanvasPalette = () => useMemo(buildCanvasPalette, []);

export const getAvailabilityColor = (value: number, maxPeers: number) => {
    const ratio = Math.min(Math.max(value / maxPeers, 0), 1);
    const hue = ratio * 220;
    const lightness = value === 0 ? 58 : 48;
    return `hsl(${hue}, 75%, ${lightness}%)`;
};

export const HISTORY_POINTS = constants.performance.history_data_points;
