import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
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
    client: EngineAdapter | null | undefined;
    clientRef: MutableRefObject<EngineAdapter | null>;
    refreshTorrentsRef: MutableRefObject<() => Promise<void>>;
    refreshSessionStatsDataRef: MutableRefObject<() => Promise<void>>;
    refreshDetailData: () => Promise<void>;
    torrents: Array<Torrent | TorrentDetail>;
    detailData: TorrentDetail | null;
    settingsFlow: {
        settingsConfig: SettingsConfig;
        setSettingsConfig: Dispatch<SetStateAction<SettingsConfig>>;
    };
    clearDetail: () => void;
}

export interface UseTorrentOrchestratorResult {
    addTorrent: UseAddTorrentControllerResult;
    recovery: RecoveryControllerResult;
}

export function useTorrentOrchestrator({
    client,
    clientRef,
    refreshTorrentsRef,
    refreshSessionStatsDataRef,
    refreshDetailData,
    torrents,
    detailData,
    settingsFlow,
    clearDetail,
}: UseTorrentOrchestratorParams): UseTorrentOrchestratorResult {
    const { settingsConfig, setSettingsConfig } = settingsFlow;
    const { dispatch } = useRequiredTorrentActions();
    const pendingDeletionHashesRef = useRef<Set<string>>(new Set());

    const addTorrent = useAddTorrentController({
        dispatch,
        settingsConfig,
        setSettingsConfig,
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

    const findTorrentById = useCallback(
        (idOrHash?: string | null) => {
            if (!idOrHash) return null;
            if (
                detailData &&
                (detailData.id === idOrHash || detailData.hash === idOrHash)
            ) {
                return detailData;
            }
            return null;
        },
        [detailData],
    );

    // stable alias for effect dependency (avoid depending on whole `recovery` object)
    const executeRedownload = recovery.actions.executeRedownload;

    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleRedownloadEvent = async (ev: Event) => {
            const detail = (ev as CustomEvent).detail;
            const target = findTorrentById(detail?.id ?? detail?.hash);
            if (target) await executeRedownload(target);
        };

        window.addEventListener(
            "tiny-torrent:redownload",
            handleRedownloadEvent as EventListener,
        );
        return () => {
            window.removeEventListener(
                "tiny-torrent:redownload",
                handleRedownloadEvent as EventListener,
            );
        };
    }, [executeRedownload, findTorrentById]);

    useEffect(() => {
        if (!client) return;
        void client.notifyUiReady?.();
        const detachUi = () => {
            try {
                void client.notifyUiDetached?.();
            } catch {
                // ignore detach errors
            }
        };
        window.addEventListener("beforeunload", detachUi);
        return () => window.removeEventListener("beforeunload", detachUi);
    }, [client]);

    return {
        addTorrent,
        recovery,
    };
}

export default useTorrentOrchestrator;
