import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tiny-torrent.workbench.scale";
const ZOOM_EVENT_NAME = "tt-zoom-change";

export function clamp(v: number, min = 0.7, max = 1.5) {
    return Math.max(min, Math.min(max, v));
}

export default function useWorkbenchScale() {
    const [scale, setScaleRaw] = useState<number>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) return clamp(parseFloat(raw));
        } catch {
            /* ignore */
        }
        return 1;
    });

    const apply = useCallback((next: number) => {
        const clamped = clamp(next);
        try {
            document.documentElement.style.setProperty(
                "--tt-zoom-level",
                String(clamped)
            );
            localStorage.setItem(STORAGE_KEY, String(clamped));
        } catch {
            /* ignore */
        }
        setScaleRaw(clamped);
        if (typeof window !== "undefined") {
            window.dispatchEvent(
                new CustomEvent(ZOOM_EVENT_NAME, { detail: clamped })
            );
        }
    }, []);

    useEffect(() => {
        apply(scale);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setScale = useCallback((v: number) => apply(v), [apply]);
    const increase = useCallback(() => apply(scale + 0.05), [apply, scale]);
    const decrease = useCallback(() => apply(scale - 0.05), [apply, scale]);
    const reset = useCallback(() => apply(1), [apply]);

    return {
        scale,
        setScale,
        increase,
        decrease,
        reset,
    } as const;
}
