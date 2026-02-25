import { useCallback, useEffect, useMemo, useRef } from "react";
import { STATUS } from "@/shared/status";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { ConnectionStatus } from "@/shared/types/rpc";
import { useTorrentData } from "@/modules/dashboard/hooks/useTorrentData";
import type { TorrentRuntimeSummary } from "@/modules/dashboard/hooks/useTorrentData";
import { useTorrentDetail } from "@/modules/dashboard/hooks/useTorrentDetail";
import { useDetailControls } from "@/modules/dashboard/hooks/useDetailControls";
import { useSelection } from "@/app/context/AppShellStateContext";
import { useTorrentWorkflow } from "@/app/hooks/useTorrentWorkflow";
import type { RecheckRefreshOutcome } from "@/app/hooks/useTorrentWorkflow";
import { useOptimisticStatuses } from "@/app/hooks/useOptimisticStatuses";
import { dispatchTorrentAction, dispatchTorrentSelectionAction } from "@/app/utils/torrentActionDispatcher";
import { TorrentIntents, type TorrentIntentExtended } from "@/app/intents/torrentIntents";
import { useOpenTorrentFolder } from "@/app/hooks/useOpenTorrentFolder";
import { useTorrentOrchestrator } from "@/app/orchestrators/useTorrentOrchestrator";
import type { UseTorrentOrchestratorResult } from "@/app/orchestrators/useTorrentOrchestrator";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { SettingsConfig } from "@/modules/settings/data/config";
import type { CapabilityStore } from "@/app/types/capabilities";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";
import type { DeleteIntent } from "@/app/types/workspace";
import { createTorrentDispatch, type TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import type { OpenFolderOutcome } from "@/app/types/openFolder";

export interface UseWorkspaceTorrentDomainParams {
    torrentClient: EngineAdapter;
    settingsConfig: SettingsConfig;
    rpcStatus: ConnectionStatus;
    pollingIntervalMs: number;
    markTransportConnected: () => void;
    refreshSessionStatsData: () => Promise<void>;
    reportCommandError: (error: unknown) => void;
    capabilities: CapabilityStore;
}

export interface WorkspaceTorrentDomain {
    torrents: Torrent[];
    ghostTorrents: Torrent[];
    runtimeSummary: TorrentRuntimeSummary;
    isInitialLoadFinished: boolean;
    detailData: TorrentDetail | null;
    refreshTorrents: () => Promise<void>;
    dispatch: (intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>;
    selectedIds: string[];
    selectedTorrents: Torrent[];
    addTorrent: UseTorrentOrchestratorResult["addTorrent"];
    workflow: {
        optimisticStatuses: OptimisticStatusMap;
        pendingDelete: DeleteIntent | null;
        confirmDelete: (overrideDeleteData?: boolean) => Promise<TorrentCommandOutcome>;
        clearPendingDelete: () => void;
        handleTorrentAction: (action: TorrentTableAction, torrent: Torrent) => Promise<TorrentCommandOutcome>;
        handleBulkAction: (action: TorrentTableAction) => Promise<TorrentCommandOutcome>;
        handleSetDownloadLocation: (params: { torrent: Torrent; path: string; moveData: boolean }) => Promise<TorrentCommandOutcome>;
        removedIds: Set<string>;
    };
    handlers: {
        handleRequestDetails: (torrent: Torrent) => Promise<void>;
        handleCloseDetail: () => void;
        handleOpenFolder: (path?: string | null) => Promise<OpenFolderOutcome>;
        handleFileSelectionChange: (indexes: number[], wanted: boolean) => Promise<void>;
        handleSequentialToggle: (enabled: boolean) => Promise<void>;
        handleSuperSeedingToggle: (enabled: boolean) => Promise<void>;
    };
}

export function useWorkspaceTorrentDomain({
    torrentClient,
    settingsConfig,
    rpcStatus,
    pollingIntervalMs,
    markTransportConnected,
    refreshSessionStatsData,
    reportCommandError,
    capabilities,
}: UseWorkspaceTorrentDomainParams): WorkspaceTorrentDomain {
    const isMountedRef = useRef(false);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const {
        torrents,
        isInitialLoadFinished,
        refresh: refreshTorrents,
        runtimeSummary,
        ghostTorrents,
    } = useTorrentData({
        client: torrentClient,
        sessionReady: rpcStatus === STATUS.connection.CONNECTED,
        pollingIntervalMs,
        markTransportConnected,
    });

    const { detailData, loadDetail, refreshDetailData, clearDetail, mutateDetail } = useTorrentDetail({
        torrentClient,
        isMountedRef,
    });

    const dispatch = useMemo(
        () =>
            createTorrentDispatch({
                client: torrentClient,
                refreshTorrents,
                refreshSessionStatsData,
                refreshDetailData,
                reportCommandError,
            }),
        [torrentClient, refreshTorrents, refreshSessionStatsData, refreshDetailData, reportCommandError],
    );

    const { optimisticStatuses, updateOptimisticStatuses } = useOptimisticStatuses(torrents);

    const orchestrator = useTorrentOrchestrator({
        client: torrentClient,
        dispatch,
        refreshTorrents,
        refreshSessionStatsData,
        refreshDetailData,
        torrents,
        detailData,
        settingsConfig,
        clearDetail,
    });

    const { addTorrent } = orchestrator;

    const { selectedIds, activeId, setActiveId } = useSelection();
    const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedTorrents = useMemo(
        () => torrents.filter((torrent) => selectedIdsSet.has(torrent.id)),
        [selectedIdsSet, torrents],
    );

    const { handleFileSelectionChange, handleSequentialToggle, handleSuperSeedingToggle } = useDetailControls({
        detailData,
        mutateDetail,
        capabilities,
        dispatch,
    });

    const handleRequestDetails = useCallback(
        async (torrent: Torrent) => {
            setActiveId(torrent.id);
            await loadDetail(torrent.id, {
                ...torrent,
                trackers: [],
                files: [],
                peers: [],
            } as TorrentDetail);
        },
        [loadDetail, setActiveId],
    );

    const handleCloseDetail = useCallback(() => {
        setActiveId(null);
        clearDetail();
    }, [clearDetail, setActiveId]);

    useEffect(() => {
        if (!activeId || !detailData) return;
        if (detailData.id === activeId) return;
        const activeTorrent = selectedTorrents.find((torrent) => torrent.id === activeId) ?? null;
        void loadDetail(
            activeId,
            activeTorrent
                ? ({
                      ...activeTorrent,
                      trackers: [],
                      files: [],
                      peers: [],
                  } as TorrentDetail)
                : undefined,
        );
    }, [activeId, detailData, loadDetail, selectedTorrents]);

    useEffect(() => {
        if (!detailData) return;
        const detailKey = detailData.id ?? detailData.hash;
        if (!detailKey) return;
        const isStillPresent = torrents.some((torrent) => torrent.id === detailKey || torrent.hash === detailKey);
        if (isStillPresent) return;
        handleCloseDetail();
    }, [detailData, torrents, handleCloseDetail]);

    const handleOpenFolder = useOpenTorrentFolder();

    const executeTorrentActionViaDispatch = (
        action: TorrentTableAction,
        torrent: Torrent,
        options?: { deleteData?: boolean },
    ) => {
        return dispatchTorrentAction({
            action,
            torrent,
            options,
            dispatch,
        });
    };

    const executeBulkRemoveViaDispatch = async (ids: string[], deleteData: boolean): Promise<TorrentCommandOutcome> => {
        const outcome = await dispatch(TorrentIntents.ensureSelectionRemoved(ids, deleteData));
        if (outcome.status === "applied") {
            return { status: "success" };
        }
        if (outcome.status === "unsupported") {
            return { status: "unsupported", reason: "action_not_supported" };
        }
        return { status: "failed", reason: "execution_failed" };
    };

    const executeSetDownloadLocationViaDispatch = async (
        torrentId: string,
        path: string,
        moveData: boolean,
    ): Promise<TorrentCommandOutcome> => {
        const outcome = await dispatch(
            TorrentIntents.ensureAtLocation(torrentId, path, { moveData }),
        );
        if (outcome.status === "applied") {
            return { status: "success" };
        }
        if (outcome.status === "unsupported") {
            return { status: "unsupported", reason: "action_not_supported" };
        }
        return { status: "failed", reason: "execution_failed" };
    };

    const refreshAfterRecheck = useCallback(async (): Promise<RecheckRefreshOutcome> => {
        if (rpcStatus !== STATUS.connection.CONNECTED) {
            return "refresh_skipped";
        }
        try {
            await refreshTorrents();
            return "success";
        } catch {
            return "refresh_failed";
        }
    }, [refreshTorrents, rpcStatus]);

    const { pendingDelete, confirmDelete, clearPendingDelete, handleTorrentAction, handleBulkAction, handleSetDownloadLocation, removedIds } =
        useTorrentWorkflow({
            torrents,
            optimisticStatuses,
            updateOptimisticStatuses,
            executeTorrentAction: executeTorrentActionViaDispatch,
            executeBulkRemove: executeBulkRemoveViaDispatch,
            executeSetDownloadLocation: executeSetDownloadLocationViaDispatch,
            onRecheckComplete: refreshAfterRecheck,
            executeSelectionAction: async (action, targets) => {
                const ids = targets
                    .map((torrent) => torrent.id ?? torrent.hash)
                    .filter((id): id is string => Boolean(id));
                return dispatchTorrentSelectionAction({
                    action,
                    ids,
                    dispatch,
                });
            },
        });

    return {
        torrents,
        ghostTorrents,
        runtimeSummary,
        isInitialLoadFinished,
        detailData,
        refreshTorrents,
        dispatch,
        selectedIds,
        selectedTorrents,
        addTorrent,
        workflow: {
            optimisticStatuses,
            pendingDelete,
            confirmDelete,
            clearPendingDelete,
            handleTorrentAction,
            handleBulkAction,
            handleSetDownloadLocation,
            removedIds,
        },
        handlers: {
            handleRequestDetails,
            handleCloseDetail,
            handleOpenFolder,
            handleFileSelectionChange,
            handleSequentialToggle,
            handleSuperSeedingToggle,
        },
    };
}
