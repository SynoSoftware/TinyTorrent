import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { ServerClass } from "@/services/rpc/entities";
import type { SettingsConfig } from "@/modules/settings/data/config";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import { useShellAgent } from "@/app/hooks/useShellAgent";
import { useRequiredTorrentActions } from "@/app/context/TorrentActionsContext";
import { useUiModeCapabilities } from "@/app/context/UiModeContext";
import { useRecoveryController } from "@/modules/dashboard/hooks/useRecoveryController";
import type { RecoveryControllerResult } from "@/modules/dashboard/hooks/useRecoveryController";
import { useAddTorrentController } from "@/app/orchestrators/useAddTorrentController";
import type { UseAddTorrentControllerResult } from "@/app/orchestrators/useAddTorrentController";
import type { FeedbackTone } from "@/shared/types/feedback";

export interface UseTorrentOrchestratorParams {
    client: EngineAdapter | null | undefined;
    clientRef: MutableRefObject<EngineAdapter | null>;
    refreshTorrentsRef: MutableRefObject<() => Promise<void>>;
    refreshSessionStatsDataRef: MutableRefObject<() => Promise<void>>;
    refreshDetailData: () => Promise<void>;
    torrents: Array<Torrent | TorrentDetail>;
    reportCommandError?: (error: unknown) => void;
    showFeedback: (message: string, tone: FeedbackTone) => void;
    detailData: TorrentDetail | null;
    rpcStatus: string;
    settingsFlow: {
        settingsConfig: SettingsConfig;
        setSettingsConfig: Dispatch<SetStateAction<SettingsConfig>>;
    };
    t: (key: string) => string;
    clearDetail: () => void;
}

export interface UseTorrentOrchestratorResult {
    uiMode: "Full" | "Rpc";
    canOpenFolder: boolean;
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
    reportCommandError,
    showFeedback,
    detailData,
    settingsFlow,
    t,
    clearDetail,
}: UseTorrentOrchestratorParams): UseTorrentOrchestratorResult {
    const { settingsConfig, setSettingsConfig } = settingsFlow;
    const { dispatch } = useRequiredTorrentActions();
    const { shellAgent, uiMode } = useShellAgent();
    const {
        canBrowse,
        canOpenFolder: canOpenFolderCapability,
        supportsManual,
    } = useUiModeCapabilities();
    const localSetLocationCapability = useMemo(
        () => ({
            canBrowse,
            supportsManual,
        }),
        [canBrowse, supportsManual]
    );
    const pendingDeletionHashesRef = useRef<Set<string>>(new Set());

    const addTorrent = useAddTorrentController({
        dispatch,
        showFeedback,
        t,
        settingsConfig,
        setSettingsConfig,
        torrents,
        pendingDeletionHashesRef,
    });

    const recovery = useRecoveryController({
        services: {
            clientRef,
            dispatch,
            shellAgent,
            showFeedback,
            reportCommandError,
        },
        environment: {
            setLocationCapability: localSetLocationCapability,
            t,
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

    const canOpenFolder = canOpenFolderCapability;

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
        [detailData]
    );

    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleRedownloadEvent = async (ev: Event) => {
            const detail = (ev as CustomEvent).detail;
            const target = findTorrentById(detail?.id ?? detail?.hash);
            if (target) await recovery.actions.executeRedownload(target);
        };

        window.addEventListener(
            "tiny-torrent:redownload",
            handleRedownloadEvent as EventListener
        );
        return () => {
            window.removeEventListener(
                "tiny-torrent:redownload",
                handleRedownloadEvent as EventListener
            );
        };
    }, [recovery.actions.executeRedownload, findTorrentById]);

    useEffect(() => {
        if (!client) return;
        void client.notifyUiReady?.();
        const detachUi = () => {
            try {
                void client.notifyUiDetached?.();
            } catch {}
        };
        window.addEventListener("beforeunload", detachUi);
        return () => window.removeEventListener("beforeunload", detachUi);
    }, [client]);

    return {
        uiMode,
        canOpenFolder,
        addTorrent,
        recovery,
    };
}

export default useTorrentOrchestrator;
