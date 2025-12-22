import { useCallback, useEffect, useMemo, useState } from "react";

export type WorkspaceStyle = "classic" | "immersive";

const WORKSPACE_STYLE_KEY = "tiny-torrent.workspace-style";
const HUD_DISMISSED_KEY = "tiny-torrent.hud-dismissed";

const readWorkspaceStyle = (): WorkspaceStyle => {
    if (typeof window === "undefined") return "classic";
    const stored = window.localStorage.getItem(WORKSPACE_STYLE_KEY);
    return stored === "immersive" ? "immersive" : "classic";
};

const readDismissedCards = (): string[] => {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(HUD_DISMISSED_KEY);
        return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
        return [];
    }
};

export function useWorkspaceShell() {
    const [workspaceStyle, setWorkspaceStyle] =
        useState<WorkspaceStyle>(readWorkspaceStyle);
    const [dismissedHudCardIds, setDismissedHudCardIds] =
        useState<string[]>(readDismissedCards);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(WORKSPACE_STYLE_KEY, workspaceStyle);
    }, [workspaceStyle]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(
            HUD_DISMISSED_KEY,
            JSON.stringify(dismissedHudCardIds)
        );
    }, [dismissedHudCardIds]);

    const toggleWorkspaceStyle = useCallback(() => {
        setWorkspaceStyle((prev) =>
            prev === "immersive" ? "classic" : "immersive"
        );
    }, []);

    const dismissHudCard = useCallback((cardId: string) => {
        setDismissedHudCardIds((prev) =>
            prev.includes(cardId) ? prev : [...prev, cardId]
        );
    }, []);

    const restoreHudCards = useCallback(() => {
        setDismissedHudCardIds([]);
    }, []);

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
