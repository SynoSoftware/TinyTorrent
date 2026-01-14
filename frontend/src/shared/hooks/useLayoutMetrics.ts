import { useEffect, useMemo, useState } from "react";
import { UI_BASES, SCALE_BASES } from "@/config/logic";

// Public, minimal metric surface. This hook is a reader only - it does NOT
// define design tokens, colors, or magic numbers. Those live in
// `config/constants.json` and are exposed through `config/logic.ts`.
export type LayoutMetrics = {
    rowHeight: number;
    fileContextMenuMargin: number;
    fileContextMenuWidth: number;
    unit: number;
    fontBase: number;
    zoomLevel: number;
    iconSize: number;
};

function parseZoom(raw: string | null | undefined, fallback: number) {
    if (!raw) return fallback;
    const n = parseFloat(String(raw).trim());
    return Number.isFinite(n) ? n : fallback;
}

function readNumberVar(
    styles: CSSStyleDeclaration,
    property: string,
    fallback: number
) {
    const raw = styles.getPropertyValue(property);
    if (!raw) return fallback;
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
}

export default function useLayoutMetrics(): LayoutMetrics {
    const baseRow = UI_BASES.fileExplorer.rowHeight;
    const baseMenuWidth = UI_BASES.fileExplorer.contextMenuWidth;
    const baseMenuMargin = UI_BASES.fileExplorer.contextMenuMargin;
    const baseUnit = SCALE_BASES.unit;
    const baseFont = SCALE_BASES.fontBase;

    const numericBaseRow =
        typeof baseRow === "number" ? baseRow : Math.round(baseUnit * 12);
    const numericBaseMenuWidth =
        typeof baseMenuWidth === "number"
            ? baseMenuWidth
            : Math.round(baseUnit * 55);
    const numericBaseMenuMargin =
        typeof baseMenuMargin === "number"
            ? baseMenuMargin
            : Math.round(baseUnit * 2);

    const initial = useMemo(
        () => ({
            rowHeight: numericBaseRow,
            fileContextMenuMargin: numericBaseMenuMargin,
            fileContextMenuWidth: numericBaseMenuWidth,
            unit: baseUnit,
            fontBase: baseFont,
            iconSize: Math.round(baseFont * 1.25),
            zoomLevel: SCALE_BASES.zoom,
        }),
        [
            numericBaseRow,
            numericBaseMenuMargin,
            numericBaseMenuWidth,
            baseUnit,
            baseFont,
        ]
    );

    const [metrics, setMetrics] = useState<LayoutMetrics>(initial);

    useEffect(() => {
        // Schedule reading CSS-derived metrics on the next animation frame so
        // we read values after the browser has applied the zoom CSS variable
        // and completed layout/paint. This avoids stale measurements taken in
        // the same tick that applied the CSS change.
        let raf = 0;

        // Re-usable probe element used to measure resolved CSS heights for
        // variables that may reference other variables or calc() expressions.
        let probe: HTMLElement | null = null;
        const ensureProbe = (): HTMLElement | null => {
            if (typeof document === "undefined") return null;
            if (probe && document.body.contains(probe)) return probe;
            try {
                probe = document.createElement("div");
                // Use the same utility so browser resolves the same CSS token
                // chain that real header elements use.
                probe.style.height = "var(--tt-row-h)";
                probe.style.position = "fixed";
                probe.style.visibility = "hidden";
                probe.style.pointerEvents = "none";
                probe.style.width = "1px";
                probe.style.overflow = "hidden";
                document.body.appendChild(probe);
                return probe;
            } catch {
                probe = null;
                return null;
            }
        };

        const measureRowHeight = (): number => {
            try {
                const el = ensureProbe();
                if (!el) return numericBaseRow;
                const h = el.getBoundingClientRect().height;
                if (!Number.isFinite(h) || h <= 0) return numericBaseRow;
                return Math.round(h);
            } catch {
                return numericBaseRow;
            }
        };

        const update = () => {
            try {
                const styles = getComputedStyle(document.documentElement);
                const next: LayoutMetrics = {
                    // Use a measured pixel height so zoom and calc() are resolved.
                    rowHeight: measureRowHeight(),
                    fileContextMenuMargin: readNumberVar(
                        styles,
                        "--tt-file-context-menu-margin",
                        numericBaseMenuMargin
                    ),
                    fileContextMenuWidth: readNumberVar(
                        styles,
                        "--tt-file-context-menu-width",
                        numericBaseMenuWidth
                    ),
                    unit: readNumberVar(styles, "--tt-unit", baseUnit),
                    fontBase: readNumberVar(
                        styles,
                        "--tt-font-size-base",
                        baseFont
                    ),
                    iconSize: readNumberVar(styles, "--tt-icon-size", 12),
                    zoomLevel: parseZoom(
                        styles.getPropertyValue("--tt-zoom-level"),
                        SCALE_BASES.zoom
                    ),
                };
                setMetrics(next);
            } catch {
                // Leave metrics unchanged if DOM access fails.
            }
        };

        const scheduledUpdate = () => {
            if (typeof window === "undefined") return;
            if (raf) cancelAnimationFrame(raf);
            raf = window.requestAnimationFrame(() => update());
        };

        const handleZoomChange = () => scheduledUpdate();

        scheduledUpdate();
        window.addEventListener("resize", scheduledUpdate);
        window.addEventListener("tt-zoom-change", handleZoomChange);
        return () => {
            window.removeEventListener("resize", scheduledUpdate);
            window.removeEventListener("tt-zoom-change", handleZoomChange);
            if (raf) cancelAnimationFrame(raf);
            // Clean up probe element if we created it
            try {
                if (probe && probe.parentElement)
                    probe.parentElement.removeChild(probe);
            } catch {
                /* ignore */
            }
        };
    }, [
        numericBaseRow,
        numericBaseMenuMargin,
        numericBaseMenuWidth,
        baseUnit,
        baseFont,
    ]);

    return metrics;
}
