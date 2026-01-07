import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import type { DetailTab } from "@/modules/dashboard/types/torrentDetail";

export const DETAIL_TABS: DetailTab[] = [
    "general",
    "content",
    "pieces",
    "trackers",
    "peers",
    "speed",
];

interface UseDetailTabsParams {
    activeTorrentId?: string;
    inspectorTabCommand?: DetailTab | null;
    onInspectorTabCommandHandled?: () => void;
}

export const useDetailTabs = ({
    activeTorrentId,
    inspectorTabCommand,
    onInspectorTabCommandHandled,
}: UseDetailTabsParams) => {
    const STORAGE_KEY = "tt.inspector.active_tab";

    const readStored = (): DetailTab | null => {
        try {
            if (typeof window === "undefined") return null;
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            if (DETAIL_TABS.includes(raw as DetailTab)) return raw as DetailTab;
            return null;
        } catch (e) {
            return null;
        }
    };

    const [active, setActiveInternal] = useState<DetailTab>(
        () => readStored() ?? "general"
    );

    const setActive = (tab: DetailTab | ((t: DetailTab) => DetailTab)) => {
        setActiveInternal((prev) => {
            const next = typeof tab === "function" ? tab(prev) : tab;
            try {
                if (typeof window !== "undefined") {
                    localStorage.setItem(STORAGE_KEY, next);
                }
            } catch (e) {
                // ignore
            }
            return next;
        });
    };

    useEffect(() => {
        if (!inspectorTabCommand) return;
        // Use functional updater to avoid depending on `active` in the
        // dependency array. This ensures the handler is called exactly once
        // in response to a new `inspectorTabCommand` prop without creating
        // an effect-driven loop.
        setActive((prev) => {
            if (prev === inspectorTabCommand) {
                onInspectorTabCommandHandled?.();
                return prev;
            }
            onInspectorTabCommandHandled?.();
            return inspectorTabCommand;
        });
    }, [inspectorTabCommand, onInspectorTabCommandHandled]);

    // When the active torrent changes (or inspector opens), restore the
    // previously-selected inspector tab so the UI feels persistent across
    // dock/undock/new-instance scenarios. If no stored tab exists, fall back
    // to "general".
    useEffect(() => {
        const stored = readStored();
        setActive(stored ?? "general");
    }, [activeTorrentId]);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            const { key } = event;
            if (key === "ArrowRight") {
                const idx = DETAIL_TABS.indexOf(active);
                setActive(DETAIL_TABS[(idx + 1) % DETAIL_TABS.length]);
                event.preventDefault();
                return;
            }
            if (key === "ArrowLeft") {
                const idx = DETAIL_TABS.indexOf(active);
                setActive(
                    DETAIL_TABS[
                        (idx - 1 + DETAIL_TABS.length) % DETAIL_TABS.length
                    ]
                );
                event.preventDefault();
                return;
            }
            if (key === "Home") {
                setActive(DETAIL_TABS[0]);
                event.preventDefault();
                return;
            }
            if (key === "End") {
                setActive(DETAIL_TABS[DETAIL_TABS.length - 1]);
                event.preventDefault();
            }
        },
        [active]
    );

    return {
        active,
        setActive,
        handleKeyDown,
    };
};
