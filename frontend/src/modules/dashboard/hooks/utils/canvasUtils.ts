import { useMemo } from "react";
import { HISTORY_DATA_POINTS } from "@/config/logic";
// Layout metrics (unit/zoom/etc.) are provided by `useLayoutMetrics` when
// needed; color tokens are a theme concern and are read directly from the
// rendered CSS (HeroUI tokens). Avoid embedding literal colors here.

export const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

export type PieceStatus = "done" | "downloading" | "missing";

export const normalizePiecePercent = (value: number) => {
    const numeric = Number.isFinite(value) ? value : 0;
    return clamp(numeric, 0, 1);
};

export const classifyPieceState = (
    value: number,
    hasBinaryPieceStates: boolean
): PieceStatus => {
    if (hasBinaryPieceStates) return value === 1 ? "done" : "missing";
    if (value === 2) return "done";
    if (value === 1) return "downloading";
    return "missing";
};

export const buildPieceGridRows = (
    pieceCount: number,
    columns: number,
    rowBounds: { base: number; max: number }
) => {
    const safeCount = Number.isFinite(pieceCount)
        ? Math.max(0, Math.round(pieceCount))
        : 0;
    const rowsFromPieces =
        safeCount > 0 ? Math.ceil(safeCount / Math.max(1, columns)) : 0;
    return Math.min(
        rowBounds.max,
        Math.max(rowBounds.base, rowsFromPieces)
    );
};

export type CanvasFitResult = {
    cssW: number;
    cssH: number;
    dpr: number;
};

export const fitCanvasToContainer = (
    canvas: HTMLCanvasElement,
    container: HTMLElement | null,
    minCssHeight = 2
): CanvasFitResult => {
    if (!container) return { cssW: canvas.width, cssH: canvas.height, dpr: 1 };

    const rect = container.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(minCssHeight, rect.height || 0);
    const dpr = window.devicePixelRatio || 1;

    const pxW = Math.max(1, Math.floor(cssW * dpr));
    const pxH = Math.max(1, Math.floor(cssH * dpr));

    if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
    }

    return { cssW, cssH, dpr };
};

export const resolveCanvasColor = (value: string): string => {
    if (!value.startsWith("var(")) return normalizeCanvasColor(value);
    const name = value.slice(4, -1).trim();
    return getCssToken(name);
};

export type PieceMapGeometry = {
    cellW: number;
    baseH: number;
    peakH: number;
    sigma: number;
    yStarts: Float32Array;
    totalH: number;
};

export type PieceMapGeometryParams = {
    cssW: number;
    cssH: number;
    columns: number;
    rows: number;
    focusRow: number;
    strength: number;
    sigma: number;
};

export const computePieceMapGeometry = ({
    cssW,
    cssH,
    columns,
    rows,
    focusRow,
    strength,
    sigma,
}: PieceMapGeometryParams): PieceMapGeometry => {
    const cellW = Math.max(2, cssW / Math.max(1, columns));
    const baseH = Math.max(2, cellW * 0.35);
    const peakH = Math.max(baseH + 1, cellW * 1.15);
    const clampedSigma = clamp(sigma, 2.5, 18);
    const clampedStrength = clamp(strength, 0.15, 2.0);

    const yStarts = new Float32Array(rows + 1);
    const desired = new Float32Array(rows);
    const clampedFocusRow = clamp(focusRow, 0, Math.max(0, rows - 1));
    const inv2s2 = 1 / (2 * clampedSigma * clampedSigma);

    let sum = 0;
    for (let r = 0; r < rows; r++) {
        const d = r - clampedFocusRow;
        const g = Math.exp(-(d * d) * inv2s2);
        const h = baseH + clampedStrength * (peakH - baseH) * g;
        desired[r] = h;
        sum += h;
    }

    const rawScale = sum > 0 ? cssH / sum : 1;
    const scale = Number.isFinite(rawScale) ? rawScale : 1;

    yStarts[0] = 0;
    for (let r = 0; r < rows; r++) {
        const scaledHeight = Math.max(4, desired[r] * scale);
        yStarts[r + 1] = yStarts[r] + scaledHeight;
    }

    return {
        cellW,
        baseH: baseH * scale,
        peakH: peakH * scale,
        sigma: clampedSigma,
        yStarts,
        totalH: yStarts[rows],
    };
};

export const findRowAtY = (
    y: number,
    yStarts: Float32Array,
    rowCount: number
): number | null => {
    if (y < 0 || y >= yStarts[yStarts.length - 1]) return null;

    let lo = 0;
    let hi = yStarts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (yStarts[mid] <= y) lo = mid + 1;
        else hi = mid;
    }

    const row = Math.max(0, lo - 1);
    return row >= 0 && row < rowCount ? row : null;
};

export type PieceHitCell = { x: number; y: number; w: number; h: number };

export type PieceHitResult = {
    index: number;
    row: number;
    col: number;
    cell: PieceHitCell;
};

export const findPieceAtPoint = (
    x: number,
    y: number,
    geometry: PieceMapGeometry,
    columns: number,
    totalPieces: number
): PieceHitResult | null => {
    const row = findRowAtY(y, geometry.yStarts, geometry.yStarts.length - 1);
    if (row == null) return null;

    const col = Math.floor(x / geometry.cellW);
    if (col < 0 || col >= columns) return null;

    const index = row * columns + col;
    if (index < 0 || index >= totalPieces) return null;

    const y0 = geometry.yStarts[row];
    const y1 = geometry.yStarts[row + 1];
    return {
        index,
        row,
        col,
        cell: { x: col * geometry.cellW, y: y0, w: geometry.cellW, h: y1 - y0 },
    };
};

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
    if (!trimmed) return "#555555";
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

        const rootStyles = getComputedStyle(document.documentElement);
        const bodyStyles = getComputedStyle(document.body);
        const read = (name: string) => {
            let v = rootStyles.getPropertyValue(name).trim();
            if (!v) v = bodyStyles.getPropertyValue(name).trim();
            return normalizeCanvasColor(v);
        };
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
        const root = getComputedStyle(document.documentElement);
        const body = getComputedStyle(document.body);
        let v = root.getPropertyValue(name).trim();
        if (!v) v = body.getPropertyValue(name).trim();
        // normalizeCanvasColor returns a safe fallback if value is empty
        return normalizeCanvasColor(v);
    } catch {
        return "#555555";
    }
};

export const getAvailabilityColor = (value: number, maxPeers: number) => {
    const ratio = Math.min(Math.max(value / maxPeers, 0), 1);
    const hue = ratio * 220;
    const lightness = value === 0 ? 58 : 48;
    return `hsl(${hue}, 75%, ${lightness}%)`;
};

export const HISTORY_POINTS = HISTORY_DATA_POINTS;

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
