import { useRef } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
// ServerClass type not needed in this orchestrator
import type { SettingsConfig } from "@/modules/settings/data/config";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import { useRecoveryController } from "@/modules/dashboard/hooks/useRecoveryController";
import type { RecoveryControllerResult } from "@/modules/dashboard/hooks/useRecoveryController";
import { useAddTorrentController } from "@/app/orchestrators/useAddTorrentController";
import type { UseAddTorrentControllerResult } from "@/app/orchestrators/useAddTorrentController";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import type { TorrentOperationState } from "@/shared/status";

export interface UseTorrentOrchestratorParams {
    client: EngineAdapter;
    dispatch: (intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>;
    refreshTorrents: () => Promise<void>;
    refreshSessionStatsData: () => Promise<void>;
    refreshDetailData: () => Promise<void>;
    torrents: Array<Torrent | TorrentDetail>;
    detailData: TorrentDetail | null;
    settingsConfig: SettingsConfig;
    clearDetail: () => void;
    updateOperationOverlays: (
        updates: Array<{ id: string; operation?: TorrentOperationState }>,
    ) => void;
}

export interface UseTorrentOrchestratorResult {
    addTorrent: UseAddTorrentControllerResult;
    recovery: RecoveryControllerResult;
}

export function useTorrentOrchestrator({
    client,
    dispatch,
    refreshTorrents,
    refreshSessionStatsData,
    refreshDetailData,
    torrents,
    detailData,
    settingsConfig,
    clearDetail,
    updateOperationOverlays,
}: UseTorrentOrchestratorParams): UseTorrentOrchestratorResult {
    const pendingDeletionHashesRef = useRef<Set<string>>(new Set());

    const addTorrent = useAddTorrentController({
        dispatch,
        settingsConfig,
        torrents,
        pendingDeletionHashesRef,
    });

    const recovery = useRecoveryController({
        services: {
            client,
        },
        data: {
            torrents,
            detailData,
        },
        refresh: {
            refreshTorrents,
            refreshSessionStatsData,
            refreshDetailData,
            clearDetail,
            pendingDeletionHashesRef,
        },
        dispatch,
        updateOperationOverlays,
    });

    return {
        addTorrent,
        recovery,
    };
}

export default useTorrentOrchestrator;
