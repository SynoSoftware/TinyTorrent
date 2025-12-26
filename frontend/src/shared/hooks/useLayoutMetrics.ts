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

    const initial = useMemo(
        () => ({
            rowHeight: baseRow,
            fileContextMenuMargin: baseMenuMargin,
            fileContextMenuWidth: baseMenuWidth,
            unit: baseUnit,
            fontBase: baseFont,
            iconSize: Math.round(baseFont * 1.25),
            zoomLevel: SCALE_BASES.zoom,
        }),
        [baseRow, baseMenuMargin, baseMenuWidth, baseUnit, baseFont]
    );

    const [metrics, setMetrics] = useState<LayoutMetrics>(initial);
    const ref = useRef<LayoutMetrics>(initial);

    const updateMetrics = useCallback(() => {
        try {
            const styles = getComputedStyle(document.documentElement);
            const next: LayoutMetrics = {
                rowHeight: readNumberVar(styles, "--tt-row-h", baseRow),
                fileContextMenuMargin: readNumberVar(
                    styles,
                    "--tt-file-context-menu-margin",
                    baseMenuMargin
                ),
                fileContextMenuWidth: readNumberVar(
                    styles,
                    "--tt-file-context-menu-width",
                    baseMenuWidth
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
            } catch {}
        };
    }, [initial, updateMetrics]);

    return metrics;
}
