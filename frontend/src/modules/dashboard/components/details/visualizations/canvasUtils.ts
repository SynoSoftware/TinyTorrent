import { useMemo } from "react";
import { CONFIG } from "@/config/logic";
// Layout metrics (unit/zoom/etc.) are provided by `useLayoutMetrics` when
// needed; color tokens are a theme concern and are read directly from the
// rendered CSS (HeroUI tokens). Avoid embedding literal colors here.

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

export type CanvasPalette = {
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

export const normalizeCanvasColor = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    const lower = trimmed.toLowerCase();
    if (
        lower.startsWith("var(") ||
        lower.startsWith("#") ||
        lower.startsWith("rgb") ||
        lower.startsWith("hsl") ||
        lower.startsWith("oklch") ||
        lower.startsWith("oklab") ||
        lower.startsWith("color(")
    ) {
        return trimmed;
    }
    return `hsl(${trimmed})`;
};

export const useCanvasPalette = (): CanvasPalette => {
    return useMemo(() => {
        if (typeof window === "undefined") {
            // SSR-safe: return CSS var placeholders so server render doesn't access DOM.
            // These values will be replaced on the client when the hook runs again.
            return {
                primary: "var(--heroui-primary)",
                success: "var(--heroui-success)",
                warning: "var(--heroui-warning)",
                downloading: "var(--heroui-primary)",
                missing: "var(--heroui-content1)",
                foreground: "var(--heroui-foreground)",
                content1: "var(--heroui-content1)",
                highlight: "rgba(255,255,255,0.65)",
                glowSuccess: "rgba(34,197,94,0.45)",
                glowDownloading: "rgba(6,182,212,0.45)",
                glowWarning: "rgba(245,158,11,0.55)",
                placeholder: "rgba(255,255,255,0.08)",
                danger: "var(--heroui-danger)",
            } as CanvasPalette;
        }

        const styles = getComputedStyle(document.documentElement);
        const read = (name: string) =>
            normalizeCanvasColor(styles.getPropertyValue(name));
        return {
            primary: read("--heroui-primary"),
            success: read("--heroui-success"),
            warning: read("--heroui-warning"),
            downloading: read("--heroui-primary"),
            missing: read("--heroui-content1"),
            foreground: read("--heroui-foreground"),
            content1: read("--heroui-content1"),
            highlight: "rgba(255,255,255,0.65)",
            glowSuccess: "rgba(34,197,94,0.45)",
            glowDownloading: "rgba(6,182,212,0.45)",
            glowWarning: "rgba(245,158,11,0.55)",
            placeholder: "rgba(255,255,255,0.08)",
            danger: read("--heroui-danger"),
        } as CanvasPalette;
    }, []);
};

// Expose a small helper to read arbitrary CSS tokens from a centralized location
// so consumer components do not call getComputedStyle(document.documentElement)
// directly in render paths. This keeps the DOM access centralized and memoized.
export const getCssToken = (name: string): string => {
    if (typeof window === "undefined") return "";
    try {
        const styles = getComputedStyle(document.documentElement);
        const v = styles.getPropertyValue(name);
        return v ? normalizeCanvasColor(v) : "";
    } catch {
        return "";
    }
};

export const getAvailabilityColor = (value: number, maxPeers: number) => {
    const ratio = Math.min(Math.max(value / maxPeers, 0), 1);
    const hue = ratio * 220;
    const lightness = value === 0 ? 58 : 48;
    return `hsl(${hue}, 75%, ${lightness}%)`;
};

export const HISTORY_POINTS = CONFIG.performance.history_data_points;

export const computeCanvasBackingScale = (zoomLevel = 1) => {
    const dpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    return dpr * (Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1);
};

export const setupCanvasBackingStore = (
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    zoomLevel = 1
) => {
    const scale = computeCanvasBackingScale(zoomLevel);
    const pixelWidth = Math.max(1, Math.floor(width * scale));
    const pixelHeight = Math.max(1, Math.floor(height * scale));
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }
    return ctx;
};
