import { useMemo } from "react";
import constants from "../../../../../config/constants.json";

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
    success: string;
    warning: string;
    downloading: string;
    missing: string;
    foreground: string;
    content1: string;
    highlight: string;
    glowSuccess: string;
    glowDownloading: string;
    glowWarning: string;
    placeholder: string;
    danger: string;
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
    const primary = readVar("--heroui-primary", "#06b6d4");
    const success = readVar("--heroui-success", "#22c55e");
    const downloading = readVar("--heroui-primary", "#06b6d4");
    const warning = readVar("--heroui-warning", "#f97316");
    const missing = readVar("--heroui-content1", "rgba(255,255,255,0.12)");
    return {
        primary,
        success,
        warning,
        downloading,
        missing,
        foreground: readVar("--heroui-foreground", "#f8fafc"),
        content1: readVar("--heroui-content1", "#111827"),
        highlight: "rgba(255,255,255,0.65)",
        glowSuccess: "rgba(34,197,94,0.45)",
        glowDownloading: "rgba(6,182,212,0.45)",
        glowWarning: "rgba(245,158,11,0.55)",
        placeholder: "rgba(255,255,255,0.08)",
        danger: readVar("--heroui-danger", "#ef4444"),
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
