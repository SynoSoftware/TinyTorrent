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
import { useOptimisticStatuses } from "@/app/hooks/useOptimisticStatuses";
import { dispatchTorrentAction, dispatchTorrentSelectionAction } from "@/app/utils/torrentActionDispatcher";
import { TorrentIntents, type TorrentIntentExtended } from "@/app/intents/torrentIntents";
import { useOpenTorrentFolder } from "@/app/hooks/useOpenTorrentFolder";
import { useTorrentOrchestrator } from "@/app/orchestrators/useTorrentOrchestrator";
import { useEngineHeartbeatDomain } from "@/app/providers/engineDomains";
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
import { scheduler } from "@/app/services/scheduler";
const { timing } = registry;

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
        handleSetSequentialDownload: (
            torrent: Torrent,
            enabled: boolean,
        ) => Promise<TorrentCommandOutcome>;
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

interface PendingSequential {
    enabled: boolean;
    reqId: number;
}

const findMatchingTorrentByIdentity = <
    TTarget extends Pick<Torrent, "id" | "hash">,
>(
    torrents: Torrent[],
    target: TTarget | null,
): Torrent | null => {
    if (!target) {
        return null;
    }

    const targetId = String(target.id);
    const targetHash = target.hash;

    return (
        torrents.find(
            (torrent) =>
                String(torrent.id) === targetId || torrent.hash === targetHash,
        ) ?? null
    );
};

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
    const nextSequentialReqIdRef = useRef(0);
    const heartbeatDomain = useEngineHeartbeatDomain(torrentClient);
    const [pendingSequential, setPendingSequential] = useState<
        Record<string, PendingSequential>
    >({});

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
        sessionReady: rpcStatus === status.connection.connected,
        pollingIntervalMs,
        markTransportConnected,
    });

    const {
        detailData,
        loadDetail,
        refreshDetailData,
        clearDetail,
        mutateDetail,
    } = useTorrentDetail({
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
    const setPendingSequentialValue = useCallback(
        (torrentId: string, enabled: boolean, reqId: number) => {
            setPendingSequential((current) => {
                const existing = current[torrentId];
                if (
                    existing &&
                    existing.enabled === enabled &&
                    existing.reqId === reqId
                ) {
                    return current;
                }
                return {
                    ...current,
                    [torrentId]: {
                        enabled,
                        reqId,
                    },
                };
            });
        },
        [],
    );
    const clearPendingSequentialValue = useCallback(
        (torrentId: string, reqId?: number) => {
            setPendingSequential((current) => {
                const existing = current[torrentId];
                if (!existing) {
                    return current;
                }
                if (
                    typeof reqId === "number" &&
                    existing.reqId !== reqId
                ) {
                    return current;
                }
                const next = { ...current };
                delete next[torrentId];
                return next;
            });
        },
        [],
    );
    const displayTorrents = useMemo(() => {
        if (Object.keys(pendingSequential).length === 0) {
            return torrents;
        }
        return torrents.map((torrent) => {
            const pending = pendingSequential[String(torrent.id)];
            if (
                !pending ||
                torrent.sequentialDownload === pending.enabled
            ) {
                return torrent;
            }
            return {
                ...torrent,
                sequentialDownload: pending.enabled,
            };
        });
    }, [pendingSequential, torrents]);
    const selectedTorrents = useMemo(
        () => displayTorrents.filter((torrent) => selectedIdsSet.has(torrent.id)),
        [displayTorrents, selectedIdsSet],
    );

    const openTorrentDetailsById = useCallback(
        async (torrentId: string) => {
            const target = displayTorrents.find((torrent) => torrent.id === torrentId);
            setActiveId(torrentId);
            await loadDetail(
                torrentId,
                target ? ({ ...target } as TorrentDetail) : undefined,
            );
        },
        [displayTorrents, loadDetail, setActiveId],
    );

    const orchestrator = useTorrentOrchestrator({
        client: torrentClient,
        dispatch,
        refreshTorrents,
        refreshSessionStatsData,
        refreshDetailData,
        torrents: displayTorrents,
        detailData,
        settingsConfig,
        clearDetail,
        openTorrentDetailsById,
    });

    const { addTorrent } = orchestrator;

    const {
        handleFileSelectionChange,
        handleSuperSeedingToggle,
    } = useDetailControls({
        detailData,
        mutateDetail,
        capabilities,
        dispatch,
    });

    const resolvedDetailData = useMemo(() => {
        if (!detailData) {
            return null;
        }

        const liveTorrent = findMatchingTorrentByIdentity(
            displayTorrents,
            detailData,
        );
        if (
            !liveTorrent ||
            liveTorrent.sequentialDownload === detailData.sequentialDownload
        ) {
            const pending = pendingSequential[String(detailData.id)];
            if (
                !pending ||
                pending.enabled === detailData.sequentialDownload
            ) {
                return detailData;
            }
            return {
                ...detailData,
                sequentialDownload: pending.enabled,
            };
        }

        return {
            ...detailData,
            sequentialDownload: liveTorrent.sequentialDownload,
        };
    }, [detailData, displayTorrents, pendingSequential]);

    useEffect(() => {
        if (Object.keys(pendingSequential).length === 0) {
            return;
        }

        const torrentById = new Map(
            torrents.map((torrent) => [String(torrent.id), torrent]),
        );
        const settledIds = Object.entries(pendingSequential)
            .filter(([torrentId, pending]) => {
                const torrent = torrentById.get(torrentId);
                return !torrent || torrent.sequentialDownload === pending.enabled;
            })
            .map(([torrentId]) => torrentId);
        if (settledIds.length === 0) {
            return;
        }

        const cancelCleanup = scheduler.scheduleTimeout(() => {
            setPendingSequential((current) => {
                let changed = false;
                const next = { ...current };
                settledIds.forEach((torrentId) => {
                    if (!(torrentId in next)) {
                        return;
                    }
                    delete next[torrentId];
                    changed = true;
                });
                return changed ? next : current;
            });
        }, 0);

        return cancelCleanup;
    }, [pendingSequential, torrents]);

    const setSequentialDownloadOptimistically = useCallback(
        async (
            target: Pick<Torrent, "id" | "hash" | "sequentialDownload">,
            enabled: boolean,
        ): Promise<TorrentCommandOutcome> => {
            if (capabilities.sequentialDownload !== "supported") {
                return commandOutcome.unsupported();
            }

            const torrentId = String(target.id);
            const reqId = nextSequentialReqIdRef.current + 1;
            nextSequentialReqIdRef.current = reqId;
            setPendingSequentialValue(torrentId, enabled, reqId);

            const outcome = await dispatch(
                TorrentIntents.setSequentialDownload(target.id, enabled),
            );
            if (outcome.status === "applied") {
                return commandOutcome.success();
            }

            clearPendingSequentialValue(torrentId, reqId);
            if (outcome.status === "unsupported") {
                return commandOutcome.unsupported();
            }
            return commandOutcome.failed(commandReason.executionFailed);
        },
        [
            capabilities.sequentialDownload,
            clearPendingSequentialValue,
            dispatch,
            setPendingSequentialValue,
        ],
    );

    const handleSequentialToggle = useCallback(
        async (enabled: boolean) => {
            if (!resolvedDetailData) {
                return;
            }
            await setSequentialDownloadOptimistically(
                resolvedDetailData,
                enabled,
            );
        },
        [resolvedDetailData, setSequentialDownloadOptimistically],
    );

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
            activeTorrent ? ({ ...activeTorrent } as TorrentDetail) : undefined,
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

    const requestVerificationConvergence = useCallback(() => {
        heartbeatDomain.requestTableConvergence(
            timing.ui.optimisticCheckingGraceMs,
        );
    }, [heartbeatDomain]);

    const { pendingDelete, confirmDelete, clearPendingDelete, handleTorrentAction, handleBulkAction, handleSetDownloadLocation, removedIds } =
        useTorrentWorkflow({
            torrents,
            optimisticStatuses,
            updateOptimisticStatuses,
            executeTorrentAction: executeTorrentActionViaDispatch,
            executeBulkRemove: executeBulkRemoveViaDispatch,
            executeSetDownloadLocation: executeSetDownloadLocationViaDispatch,
            onVerificationStart: requestVerificationConvergence,
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
        torrents: displayTorrents,
        ghostTorrents,
        runtimeSummary,
        isInitialLoadFinished,
        detailData: resolvedDetailData,
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
            handleSetSequentialDownload: setSequentialDownloadOptimistically,
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



