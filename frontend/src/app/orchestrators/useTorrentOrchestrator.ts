import { useRef } from "react";
import type { MutableRefObject } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
// ServerClass type not needed in this orchestrator
import type { SettingsConfig } from "@/modules/settings/data/config";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import { useRequiredTorrentActions } from "@/app/context/TorrentActionsContext";
import { useRecoveryController } from "@/modules/dashboard/hooks/useRecoveryController";
import type { RecoveryControllerResult } from "@/modules/dashboard/hooks/useRecoveryController";
import { useAddTorrentController } from "@/app/orchestrators/useAddTorrentController";
import type { UseAddTorrentControllerResult } from "@/app/orchestrators/useAddTorrentController";

export interface UseTorrentOrchestratorParams {
    clientRef: MutableRefObject<EngineAdapter | null>;
    refreshTorrentsRef: MutableRefObject<() => Promise<void>>;
    refreshSessionStatsDataRef: MutableRefObject<() => Promise<void>>;
    refreshDetailData: () => Promise<void>;
    torrents: Array<Torrent | TorrentDetail>;
    detailData: TorrentDetail | null;
    settingsConfig: SettingsConfig;
    clearDetail: () => void;
}

export interface UseTorrentOrchestratorResult {
    addTorrent: UseAddTorrentControllerResult;
    recovery: RecoveryControllerResult;
}

export function useTorrentOrchestrator({
    clientRef,
    refreshTorrentsRef,
    refreshSessionStatsDataRef,
    refreshDetailData,
    torrents,
    detailData,
    settingsConfig,
    clearDetail,
}: UseTorrentOrchestratorParams): UseTorrentOrchestratorResult {
    const { dispatch } = useRequiredTorrentActions();
    const pendingDeletionHashesRef = useRef<Set<string>>(new Set());

    const addTorrent = useAddTorrentController({
        dispatch,
        settingsConfig,
        torrents,
        pendingDeletionHashesRef,
    });

    const recovery = useRecoveryController({
        services: {
            clientRef,
        },
        data: {
            torrents,
            detailData,
        },
        refresh: {
            refreshTorrentsRef,
            refreshSessionStatsDataRef,
            refreshDetailData,
            clearDetail,
            pendingDeletionHashesRef,
        },
    });

    return {
        addTorrent,
        recovery,
    };
}

export default useTorrentOrchestrator;
