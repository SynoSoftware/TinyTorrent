import { useMemo } from "react";
import { usePreferences } from "@/app/context/PreferencesContext";

export { type WorkspaceStyle } from "@/app/context/PreferencesContext";

export function useWorkspaceShell() {
    const {
        preferences: { workspaceStyle, dismissedHudCardIds },
        toggleWorkspaceStyle,
        dismissHudCard,
        restoreHudCards,
    } = usePreferences();

    const dismissedHudCardSet = useMemo(
        () => new Set(dismissedHudCardIds),
        [dismissedHudCardIds]
    );

    return {
        workspaceStyle,
        toggleWorkspaceStyle,
        dismissedHudCardIds,
        dismissedHudCardSet,
        dismissHudCard,
        restoreHudCards,
    };
}
