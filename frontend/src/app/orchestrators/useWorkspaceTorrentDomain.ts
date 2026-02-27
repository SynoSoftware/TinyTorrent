import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { status } from "@/shared/status";
import { registry } from "@/config/logic";
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
import type { TorrentEntity as Torrent, TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { SettingsConfig } from "@/modules/settings/data/config";
import type { CapabilityStore } from "@/app/types/capabilities";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/contracts";
import type { DeleteIntent } from "@/app/types/workspace";
import {
    createTorrentDispatch,
    type TorrentDispatchOutcome,
} from "@/app/actions/torrentDispatch";
import {
    commandOutcome,
    commandReason,
    type TorrentCommandOutcome,
} from "@/app/context/AppCommandContext";
import type { OpenFolderOutcome } from "@/app/types/openFolder";
import type { LocationMode } from "@/modules/dashboard/domain/torrentRelocation";
const { timing, ui } = registry;

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
        handleSetDownloadLocation: (params: { torrent: Torrent; path: string }) => Promise<TorrentCommandOutcome>;
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
    const [isRecheckPollingBoostActive, setIsRecheckPollingBoostActive] =
        useState(false);
    const [isVerificationPollingBoostActive, setIsVerificationPollingBoostActive] =
        useState(false);
    const recheckPollingBoostTimerRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const clearRecheckPollingBoostTimer = useCallback(() => {
        if (recheckPollingBoostTimerRef.current !== undefined) {
            window.clearTimeout(recheckPollingBoostTimerRef.current);
            recheckPollingBoostTimerRef.current = undefined;
        }
    }, []);

    useEffect(() => clearRecheckPollingBoostTimer, [clearRecheckPollingBoostTimer]);

    const triggerRecheckPollingBoost = useCallback(() => {
        setIsRecheckPollingBoostActive(true);
        clearRecheckPollingBoostTimer();
        recheckPollingBoostTimerRef.current = window.setTimeout(() => {
            setIsRecheckPollingBoostActive(false);
            recheckPollingBoostTimerRef.current = undefined;
        }, timing.ui.optimisticCheckingGraceMs);
    }, [clearRecheckPollingBoostTimer]);

    const effectiveTablePollingIntervalMs =
        isRecheckPollingBoostActive || isVerificationPollingBoostActive
            ? Math.min(pollingIntervalMs, timing.heartbeat.detailMs)
            : pollingIntervalMs;
    const preferFullFetch =
        isRecheckPollingBoostActive || isVerificationPollingBoostActive;

    const {
        torrents,
        isInitialLoadFinished,
        refresh: refreshTorrents,
        runtimeSummary,
        ghostTorrents,
    } = useTorrentData({
        client: torrentClient,
        sessionReady: rpcStatus === status.connection.connected,
        pollingIntervalMs: effectiveTablePollingIntervalMs,
        preferFullFetch,
        markTransportConnected,
    });

    useEffect(() => {
        const hasVerificationInProgress = runtimeSummary.verifyingCount > 0;
        setIsVerificationPollingBoostActive((prev) =>
            prev === hasVerificationInProgress ? prev : hasVerificationInProgress,
        );
    }, [runtimeSummary.verifyingCount]);

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
    const { selectedIds, activeId, setActiveId } = useSelection();
    const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedTorrents = useMemo(
        () => torrents.filter((torrent) => selectedIdsSet.has(torrent.id)),
        [selectedIdsSet, torrents],
    );

    const openTorrentDetailsById = useCallback(
        async (torrentId: string) => {
            const target = torrents.find((torrent) => torrent.id === torrentId);
            setActiveId(torrentId);
            await loadDetail(
                torrentId,
                target
                    ? ({
                          ...target,
                          trackers: [],
                          files: [],
                          peers: [],
                      } as TorrentDetail)
                    : undefined,
            );
        },
        [loadDetail, setActiveId, torrents],
    );

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
        openTorrentDetailsById,
    });

    const { addTorrent } = orchestrator;

    const { handleFileSelectionChange, handleSequentialToggle, handleSuperSeedingToggle } = useDetailControls({
        detailData,
        mutateDetail,
        capabilities,
        dispatch,
    });

    const handleRequestDetails = useCallback(
        async (torrent: Torrent) => {
            await openTorrentDetailsById(torrent.id);
        },
        [openTorrentDetailsById],
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
            return commandOutcome.success();
        }
        if (outcome.status === "unsupported") {
            return commandOutcome.unsupported();
        }
        return commandOutcome.failed("execution_failed");
    };

    const executeSetDownloadLocationViaDispatch = async (
        torrentId: string,
        path: string,
        locationMode: LocationMode,
        resumeAfter: boolean,
    ): Promise<TorrentCommandOutcome> => {
        const outcome = await dispatch(
            TorrentIntents.ensureAtLocation(
                torrentId,
                path,
                locationMode,
                resumeAfter,
            ),
        );
        if (outcome.status === "applied") {
            return commandOutcome.success();
        }
        if (outcome.status === "unsupported") {
            return commandOutcome.unsupported();
        }
        return commandOutcome.failed("execution_failed");
    };

    const refreshAfterRecheck = useCallback(async (): Promise<RecheckRefreshOutcome> => {
        if (rpcStatus !== status.connection.connected) {
            return commandReason.refreshSkipped;
        }
        try {
            await refreshTorrents();
            return "success";
        } catch {
            return commandReason.refreshFailed;
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
            onVerificationStart: triggerRecheckPollingBoost,
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



