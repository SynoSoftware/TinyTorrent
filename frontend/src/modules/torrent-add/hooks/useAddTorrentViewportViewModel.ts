import { useCallback, useEffect, useState, type RefObject } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

export interface UseAddTorrentViewportViewModelResult {
    isFullscreen: boolean;
    isSettingsCollapsed: boolean;
    isPanelResizeActive: boolean;
    toggleSettingsPanel: () => void;
    handleSettingsPanelCollapse: () => void;
    handleSettingsPanelExpand: () => void;
    setIsFullscreen: (next: boolean) => void;
    setIsPanelResizeActive: (active: boolean) => void;
}

export function useAddTorrentViewportViewModel(
    settingsPanelRef: RefObject<ImperativePanelHandle | null>
): UseAddTorrentViewportViewModelResult {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);
    const [isPanelResizeActive, setIsPanelResizeActive] = useState(false);

    useEffect(() => {
        const panel = settingsPanelRef.current;
        if (!panel) return;
        if (isSettingsCollapsed) {
            panel.collapse();
        } else {
            panel.expand();
        }
    }, [isSettingsCollapsed, settingsPanelRef]);

    const toggleSettingsPanel = useCallback(() => {
        setIsSettingsCollapsed((prev) => !prev);
    }, []);

    const handleSettingsPanelCollapse = useCallback(() => {
        setIsSettingsCollapsed(true);
    }, []);

    const handleSettingsPanelExpand = useCallback(() => {
        setIsSettingsCollapsed(false);
    }, []);

    return {
        isFullscreen,
        isSettingsCollapsed,
        isPanelResizeActive,
        setIsFullscreen,
        setIsPanelResizeActive,
        toggleSettingsPanel,
        handleSettingsPanelCollapse,
        handleSettingsPanelExpand,
    };
}
