import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useCallback,
} from "react";
import type { ReactNode } from "react";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { useTorrentOrchestrator } from "@/app/orchestrators/useTorrentOrchestrator";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import TorrentRecoveryModal from "@/modules/dashboard/components/TorrentRecoveryModal";

export interface TorrentActions {
    dispatch: (intent: TorrentIntentExtended) => Promise<void>;
}

const TorrentActionsContext = createContext<TorrentActions | null>(null);

export function TorrentActionsProvider({ children }: { children: ReactNode }) {
    const client = useTorrentClient();
    const { dispatch, recoveryState } = useTorrentOrchestrator({ client });

    const value: TorrentActions = useMemo(() => ({ dispatch }), [dispatch]);

    return (
        <TorrentActionsContext.Provider value={value}>
            {children}
            <TorrentRecoveryModal
                isOpen={Boolean(recoveryState)}
                torrent={null}
                outcome={null}
                onClose={() => {}}
                onPickPath={async () => {}}
                onBrowse={undefined}
                onRecreate={async () => {}}
                isBusy={false}
            />
        </TorrentActionsContext.Provider>
    );
}

export function useTorrentActionsContext(): TorrentActions {
    const ctx = useContext(TorrentActionsContext);
    if (!ctx) {
        throw new Error(
            "useTorrentActionsContext must be used within TorrentActionsProvider"
        );
    }
    return ctx;
}

export default TorrentActionsContext;
