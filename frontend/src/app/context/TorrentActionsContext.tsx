import React, { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";

export interface TorrentActions {
    dispatch: (intent: TorrentIntentExtended) => Promise<void>;
}

const TorrentActionsContext = createContext<TorrentActions | null>(null);

interface TorrentActionsProviderProps {
    children: ReactNode;
    actions: TorrentActions;
}

export function TorrentActionsProvider({
    children,
    actions,
}: TorrentActionsProviderProps) {
    const value = useMemo(() => actions, [actions.dispatch]);

    return (
        <TorrentActionsContext.Provider value={value}>
            {children}
        </TorrentActionsContext.Provider>
    );
}

export function useTorrentActionsContext(): TorrentActions | null {
    return useContext(TorrentActionsContext);
}

export function useRequiredTorrentActions(): TorrentActions {
    const ctx = useContext(TorrentActionsContext);

    if (import.meta.env.DEV && !ctx) {
        throw new Error(
            "[Invariant violation] TorrentActionsContext used without provider"
        );
    }

    // In prod: return a safe inert object instead of crashing
    if (!ctx) {
        return {
            dispatch: async () => {},
        };
    }

    return ctx;
}

export default TorrentActionsContext;
