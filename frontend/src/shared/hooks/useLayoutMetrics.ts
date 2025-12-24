import { useCallback, useEffect, useRef, useState } from "react";
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
};

function parseZoom(raw: string | null | undefined, fallback: number) {
    if (!raw) return fallback;
    const n = parseFloat(String(raw).trim());
    return Number.isFinite(n) ? n : fallback;
}

export default function useLayoutMetrics(): LayoutMetrics {
    // Source of truth for base numbers comes from config/logic.ts
    const baseRow = UI_BASES.fileExplorer.rowHeight;
    const baseMenuWidth = UI_BASES.fileExplorer.contextMenuWidth;
    const baseMenuMargin = UI_BASES.fileExplorer.contextMenuMargin;
    const baseUnit = SCALE_BASES.unit;
    const baseFont = SCALE_BASES.fontBase;

    const initial: LayoutMetrics = {
        rowHeight: baseRow,
        fileContextMenuMargin: baseMenuMargin,
        fileContextMenuWidth: baseMenuWidth,
        unit: baseUnit,
        fontBase: baseFont,
        zoomLevel: SCALE_BASES.zoom,
    };

    const [metrics, setMetrics] = useState<LayoutMetrics>(initial);
    const ref = useRef<LayoutMetrics>(initial);

    const computeZoom = useCallback(() => {
        // Only read the single runtime override CSS var that JS writes:
        // `--tt-zoom-level`. Do NOT read or infer colors or other tokens here.
        try {
            const styles = getComputedStyle(document.documentElement);
            const raw = styles.getPropertyValue("--tt-zoom-level");
            const zoom = parseZoom(raw, SCALE_BASES.zoom);
            if (ref.current.zoomLevel !== zoom) {
                const updated = { ...ref.current, zoomLevel: zoom };
                ref.current = updated;
                setMetrics(updated);
            }
        } catch (e) {
            // In this product we run on a deterministic local runtime; there is
            // no design fallback here. If compute fails, leave metrics as-is.
        }
    }, []);

    useEffect(() => {
        // Initialize from config-derived values first, then read runtime zoom.
        ref.current = initial;
        setMetrics(initial);

        // Observe only style attribute changes that may contain the runtime
        // zoom-level override. This keeps observation narrow and cheap.
        const mo = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === "attributes" && m.attributeName === "style") {
                    computeZoom();
                    break;
                }
            }
        });
        mo.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["style"],
        });

        // Also check once on mount in case the runtime zoom is already set.
        computeZoom();

        return () => {
            try {
                mo.disconnect();
            } catch {}
        };
    }, [computeZoom]);

    return metrics;
}
