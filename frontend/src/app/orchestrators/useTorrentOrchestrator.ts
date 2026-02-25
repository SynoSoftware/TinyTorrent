import { useRef } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
// ServerClass type not needed in this orchestrator
import type { SettingsConfig } from "@/modules/settings/data/config";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import { useAddTorrentController } from "@/app/orchestrators/useAddTorrentController";
import type { UseAddTorrentControllerResult } from "@/app/orchestrators/useAddTorrentController";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";

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
}

export interface UseTorrentOrchestratorResult {
    addTorrent: UseAddTorrentControllerResult;
}

export function useTorrentOrchestrator({
    dispatch,
    torrents,
    settingsConfig,
    client,
    refreshTorrents,
    refreshSessionStatsData,
    refreshDetailData,
    detailData,
    clearDetail,
}: UseTorrentOrchestratorParams): UseTorrentOrchestratorResult {
    void client;
    void refreshTorrents;
    void refreshSessionStatsData;
    void refreshDetailData;
    void detailData;
    void clearDetail;

    const pendingDeletionHashesRef = useRef<Set<string>>(new Set());

    const addTorrent = useAddTorrentController({
        dispatch,
        settingsConfig,
        torrents,
        pendingDeletionHashesRef,
    });

    return {
        addTorrent,
    };
}

export default useTorrentOrchestrator;
