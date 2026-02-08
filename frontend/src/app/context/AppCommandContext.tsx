import {
    createContext,
    useContext,
    useMemo,
    type ReactNode,
} from "react";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";

export type TorrentCommandOutcome =
    | { status: "success"; reason?: "queued" }
    | { status: "canceled"; reason: "no_selection" }
    | { status: "unsupported"; reason: "action_not_supported" }
    | { status: "failed"; reason: "execution_failed" };

export interface TorrentCommandAPI {
    handleTorrentAction: (
        action: TorrentTableAction,
        torrent: Torrent
    ) => Promise<TorrentCommandOutcome>;
    handleBulkAction: (
        action: TorrentTableAction
    ) => Promise<TorrentCommandOutcome>;
    openAddTorrentPicker: () => Promise<TorrentCommandOutcome>;
    openAddMagnet: (magnetLink?: string) => Promise<TorrentCommandOutcome>;
}

export interface TorrentActions {
    dispatch: (intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>;
}

export interface AppCommandContextValue {
    dispatch: (intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>;
    commandApi: TorrentCommandAPI;
}

const AppCommandContext = createContext<AppCommandContextValue | null>(null);

export function AppCommandProvider({
    value,
    children,
}: {
    value: AppCommandContextValue;
    children: ReactNode;
}) {
    const memoized = useMemo(() => value, [value.commandApi, value.dispatch]);
    return (
        <AppCommandContext.Provider value={memoized}>
            {children}
        </AppCommandContext.Provider>
    );
}

export function useAppCommandContext(): AppCommandContextValue {
    const context = useContext(AppCommandContext);
    if (!context) {
        throw new Error(
            "useAppCommandContext must be used within AppCommandProvider"
        );
    }
    return context;
}

export function useTorrentCommands(): TorrentCommandAPI {
    const { commandApi } = useAppCommandContext();
    return commandApi;
}

export function useRequiredTorrentActions(): TorrentActions {
    const { dispatch } = useAppCommandContext();
    return { dispatch };
}
