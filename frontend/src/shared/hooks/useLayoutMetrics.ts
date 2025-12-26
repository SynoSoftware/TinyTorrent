import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UI_BASES, SCALE_BASES } from "@/config/logic";

// Public, minimal metric surface. This hook is a reader only — it does NOT
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
    // Source of truth for base numbers comes from config/logic.ts
    const baseRow = UI_BASES.fileExplorer.rowHeight;
    const baseMenuWidth = UI_BASES.fileExplorer.contextMenuWidth;
    const baseMenuMargin = UI_BASES.fileExplorer.contextMenuMargin;
    const baseUnit = SCALE_BASES.unit;
    const baseFont = SCALE_BASES.fontBase;

    // If UI_BASES provides a CSS token string (e.g. "var(--tt-h-md)"),
    // derive a conservative numeric fallback based on the unit scale.
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
        [numericBaseRow, baseMenuMargin, baseMenuWidth, baseUnit, baseFont]
    );

    const [metrics, setMetrics] = useState<LayoutMetrics>(initial);
    const ref = useRef<LayoutMetrics>(initial);

    // Throttle updateMetrics to avoid excessive reflows
    const rafRef = useRef<number | null>(null);
    const updateMetrics = useCallback(() => {
        if (rafRef.current !== null) return;
        rafRef.current = window.requestAnimationFrame(() => {
            rafRef.current = null;
            try {
                const styles = getComputedStyle(document.documentElement);
                const next: LayoutMetrics = {
                    rowHeight: readNumberVar(
                        styles,
                        "--tt-row-h",
                        numericBaseRow
                    ),
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
                if (
                    ref.current.rowHeight !== next.rowHeight ||
                    ref.current.fileContextMenuMargin !==
                        next.fileContextMenuMargin ||
                    ref.current.fileContextMenuWidth !==
                        next.fileContextMenuWidth ||
                    ref.current.unit !== next.unit ||
                    ref.current.fontBase !== next.fontBase ||
                    ref.current.zoomLevel !== next.zoomLevel
                ) {
                    ref.current = next;
                    setMetrics(next);
                }
            } catch {
                // Leave metrics unchanged if DOM access fails.
            }
        });
    }, [baseFont, baseMenuMargin, baseMenuWidth, baseRow, baseUnit]);

    useEffect(() => {
        ref.current = initial;
        setMetrics(initial);

        const mo = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (
                    mutation.type === "attributes" &&
                    mutation.attributeName === "style"
                ) {
                    updateMetrics();
                    break;
                }
            }
        });
        mo.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["style"],
        });

        updateMetrics();

        return () => {
            try {
                mo.disconnect();
            } catch {
                // ignore
            }
        };
    }, [initial, updateMetrics]);

    return metrics;
}
