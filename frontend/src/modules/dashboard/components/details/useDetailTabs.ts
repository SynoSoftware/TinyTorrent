import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import type { DetailTab } from "@/modules/dashboard/types/torrentDetail";

const DETAIL_TABS: DetailTab[] = [
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
    const [active, setActive] = useState<DetailTab>("general");

    useEffect(() => {
        if (!inspectorTabCommand) return;
        if (inspectorTabCommand !== active) {
            setActive(inspectorTabCommand);
            onInspectorTabCommandHandled?.();
            return;
        }
        onInspectorTabCommandHandled?.();
    }, [active, inspectorTabCommand, onInspectorTabCommandHandled]);

    useEffect(() => {
        setActive("general");
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
