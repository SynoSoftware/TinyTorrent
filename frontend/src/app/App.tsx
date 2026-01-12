import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { STATUS } from "@/shared/status";
import Runtime, { NativeShell } from "@/app/runtime";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { useHotkeys } from "react-hotkeys-hook";
import useWorkbenchScale from "./hooks/useWorkbenchScale";
import { useTranslation } from "react-i18next";

import { useTransmissionSession } from "./hooks/useTransmissionSession";
import { useWorkspaceShell } from "./hooks/useWorkspaceShell";
import { useWorkspaceModals } from "./WorkspaceModalContext";
import { useSettingsFlow } from "./hooks/useSettingsFlow";
import { useSessionStats } from "./hooks/useSessionStats";
import { useTorrentWorkflow } from "./hooks/useTorrentWorkflow";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import { useActionFeedback } from "./hooks/useActionFeedback";
import { useHudCards } from "./hooks/useHudCards";
import { useTorrentData } from "@/modules/dashboard/hooks/useTorrentData";
import { useTorrentDetail } from "@/modules/dashboard/hooks/useTorrentDetail";
import { useDetailControls } from "@/modules/dashboard/hooks/useDetailControls";
import { CommandPalette } from "./components/CommandPalette";
import type {
    CommandAction,
    CommandPaletteContext,
} from "./components/CommandPalette";
import { WorkspaceShell } from "./components/WorkspaceShell";
import TorrentRecoveryModal from "@/modules/dashboard/components/TorrentRecoveryModal";
import { RecoveryProvider } from "@/app/context/RecoveryContext";
import {
    TorrentActionsProvider,
    useTorrentActionsContext,
} from "@/app/context/TorrentActionsContext";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import {
    SelectionProvider,
    useSelection,
} from "@/app/context/SelectionContext";
import { useTorrentOrchestrator } from "./orchestrators/useTorrentOrchestrator";
import { LifecycleProvider } from "@/app/context/LifecycleContext";
import type { EngineDisplayType } from "./components/layout/StatusBar";
import type {
    CapabilityKey,
    CapabilityState,
    CapabilityStore,
} from "@/app/types/capabilities";
import { DEFAULT_CAPABILITY_STORE } from "@/app/types/capabilities";
import { useTorrentClient } from "./providers/TorrentClientProvider";
import { FocusProvider, useFocusState } from "./context/FocusContext";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { RehashStatus } from "./types/workspace";
import type {
    DetailTab,
    PeerSortStrategy,
} from "@/modules/dashboard/types/torrentDetail";
import { AddTorrentModal } from "@/modules/torrent-add/components/AddTorrentModal";
import { AddMagnetModal } from "@/modules/torrent-add/components/AddMagnetModal";

interface FocusControllerProps {
    torrents: Torrent[];
    detailData: TorrentDetail | null;
    requestDetails: (torrent: Torrent) => Promise<void>;
    closeDetail: () => void;
}

function FocusController({
    torrents,
    detailData,
    requestDetails,
    closeDetail,
}: FocusControllerProps) {
    const { setActivePart } = useFocusState();
    const { selectedIds, activeId } = useSelection();
    const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedTorrents = useMemo(
        () => torrents.filter((torrent) => selectedIdsSet.has(torrent.id)),
        [selectedIdsSet, torrents]
    );

    const toggleInspector = useCallback(async () => {
        if (detailData) {
            closeDetail();
            setActivePart("table");
            return;
        }

        const targetTorrent =
            selectedTorrents.find((torrent) => torrent.id === activeId) ??
            selectedTorrents[0];
        if (!targetTorrent) return;

        setActivePart("inspector");
        await requestDetails(targetTorrent);
    }, [
        activeId,
        closeDetail,
        detailData,
        requestDetails,
        selectedTorrents,
        setActivePart,
    ]);

    useHotkeys(
        "cmd+i,ctrl+i",
        (event) => {
            event.preventDefault();
            void toggleInspector();
        },
        {
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [toggleInspector]
    );

    // FocusController does not register app-global hotkeys.
    return null;
}

export default function App() {
    const { t } = useTranslation();
    const { isSettingsOpen, openSettings, closeSettings } =
        useWorkspaceModals();
    const { announceAction, showFeedback } = useActionFeedback();
    const torrentClient = useTorrentClient();
    const torrentClientRef = useRef<EngineAdapter | null>(null);
    torrentClientRef.current = torrentClient;
    const {
        rpcStatus,
        reconnect,
        refreshSessionSettings,
        markTransportConnected,
        reportCommandError,
        reportReadError,
        updateRequestTimeout,
        engineInfo,
        isDetectingEngine,
    } = useTransmissionSession(torrentClient);
    const [capabilities, setCapabilities] = useState<CapabilityStore>(
        DEFAULT_CAPABILITY_STORE
    );

    const updateCapabilityState = useCallback(
        (capability: CapabilityKey, state: CapabilityState) => {
            setCapabilities((prev) => {
                if (prev[capability] === state) return prev;
                return { ...prev, [capability]: state };
            });
        },
        []
    );

    useEffect(() => {
        if (!torrentClient.setSequentialDownload) {
            updateCapabilityState("sequentialDownload", "unsupported");
            return;
        }
        if (capabilities.sequentialDownload === "unsupported") {
            updateCapabilityState("sequentialDownload", "unknown");
        }
    }, [
        torrentClient.setSequentialDownload,
        capabilities.sequentialDownload,
        updateCapabilityState,
    ]);

    useEffect(() => {
        if (!torrentClient.setSuperSeeding) {
            updateCapabilityState("superSeeding", "unsupported");
            return;
        }
        if (capabilities.superSeeding === "unsupported") {
            updateCapabilityState("superSeeding", "unknown");
        }
    }, [
        torrentClient.setSuperSeeding,
        capabilities.superSeeding,
        updateCapabilityState,
    ]);

    const isMountedRef = useRef(false);
    const { sessionStats, refreshSessionStatsData, liveTransportStatus } =
        useSessionStats({
            torrentClient,
            reportReadError,
            isMountedRef,
            sessionReady: rpcStatus === STATUS.connection.CONNECTED,
        });

    // Workbench zoom: initialize global scale hook
    const { increase, decrease, reset } = useWorkbenchScale();

    useEffect(() => {
        if (Runtime.isNativeHost && typeof document !== "undefined") {
            document.documentElement.dataset.nativeHost = "true";
        }
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            // Zoom IN
            if (
                e.altKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.shiftKey &&
                (e.code === "Equal" || e.code === "NumpadAdd")
            ) {
                e.preventDefault();
                increase();
                return;
            }

            // Zoom OUT
            if (
                e.altKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.shiftKey &&
                (e.code === "Minus" || e.code === "NumpadSubtract")
            ) {
                e.preventDefault();
                decrease();
                return;
            }

            // Reset zoom
            if (
                ((e.ctrlKey || e.metaKey) && e.code === "Digit0") ||
                (e.altKey &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    !e.shiftKey &&
                    e.code === "NumpadMultiply")
            ) {
                if (Runtime.suppressBrowserZoomDefaults()) {
                    e.preventDefault();
                }
                reset();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [increase, decrease, reset]);

    const refreshSessionStatsDataRef = useRef<() => Promise<void>>(
        async () => {}
    );
    const refreshTorrentsRef = useRef<() => Promise<void>>(async () => {});

    useEffect(() => {
        refreshSessionStatsDataRef.current = refreshSessionStatsData;
    }, [refreshSessionStatsData]);

    const settingsFlow = useSettingsFlow({
        torrentClient,
        refreshTorrentsRef,
        refreshSessionStatsDataRef,
        refreshSessionSettings,
        reportCommandError,
        rpcStatus,
        isSettingsOpen,
        isMountedRef,
        updateRequestTimeout,
    });

    const {
        download_dir: settingsDownloadDir,
        start_added_torrents: settingsStartAdded,
    } = settingsFlow.settingsConfig;

    const pollingIntervalMs = Math.max(
        1000,
        settingsFlow.settingsConfig.refresh_interval_ms
    );

    const {
        torrents,
        isInitialLoadFinished,
        refresh: refreshTorrents,
        ghostTorrents,
    } = useTorrentData({
        client: torrentClient,
        sessionReady: rpcStatus === STATUS.connection.CONNECTED,
        pollingIntervalMs,
        markTransportConnected,
        reportReadError,
    });

    useEffect(() => {
        refreshTorrentsRef.current = refreshTorrents;
    }, [refreshTorrents]);

    const {
        detailData,
        loadDetail,
        refreshDetailData,
        clearDetail,
        mutateDetail,
    } = useTorrentDetail({
        torrentClient,
        reportReadError,
        isMountedRef,
        sessionReady: rpcStatus === STATUS.connection.CONNECTED,
    });
    const {
        handleFileSelectionChange,
        handleSequentialToggle,
        handleSuperSeedingToggle,
        handleForceTrackerReannounce,
    } = useDetailControls({
        detailData,
        torrentClient,
        mutateDetail,
        reportCommandError,
        isMountedRef,
        refreshTorrents,
        refreshDetailData,
        refreshSessionStatsData,
        updateCapabilityState,
    });

    const [filter, setFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [peerSortStrategy, setPeerSortStrategy] =
        useState<PeerSortStrategy>("none");
    const [inspectorTabCommand, setInspectorTabCommand] =
        useState<DetailTab | null>(null);
    const focusSearchInput = useCallback(() => {
        if (typeof document === "undefined") return;
        const searchInput = document.querySelector(
            'input[data-command-search="true"]'
        ) as HTMLInputElement | null;
        if (!searchInput) return;
        searchInput.focus();
        searchInput.select();
    }, []);

    useHotkeys(
        "cmd+k,ctrl+k",
        (event) => {
            event.preventDefault();
            setCommandPaletteOpen((prev) => !prev);
        },
        { enableOnFormTags: true, enableOnContentEditable: true },
        [setCommandPaletteOpen]
    );

    const handleInspectorTabCommandHandled = useCallback(() => {
        setInspectorTabCommand(null);
    }, []);


    const rehashStatus: RehashStatus | undefined = useMemo(() => {
        const verifyingTorrents = torrents.filter(
            (torrent: Torrent) => torrent.state === "checking"
        );
        if (!verifyingTorrents.length) return undefined;
        const value =
            (verifyingTorrents.reduce(
                (acc: number, torrent: Torrent) =>
                    acc +
                    (torrent.verificationProgress ?? torrent.progress ?? 0),
                0
            ) /
                verifyingTorrents.length) *
            100;
        const label =
            verifyingTorrents.length === 1
                ? t("toolbar.rehash_progress.single", {
                      name: verifyingTorrents[0].name,
                  })
                : t("toolbar.rehash_progress.multiple", {
                      count: verifyingTorrents.length,
                  });
        return {
            active: true,
            value: Math.min(Math.max(value, 0), 100),
            label,
        };
    }, [t, torrents]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Re-download idempotency guard per-fingerprint has moved into the orchestrator.
    useEffect(() => {
        if (!detailData) {
            setPeerSortStrategy("none");
        }
    }, [detailData]);

    const handleReconnect = () => {
        reconnect();
    };

    const AppInner = () => {
        const orchestrator = useTorrentOrchestrator({
            client: torrentClient,
            clientRef: torrentClientRef,
            refreshTorrentsRef,
            refreshSessionStatsDataRef,
            refreshDetailData,
            detailData,
            rpcStatus,
            settingsFlow,
            showFeedback,
            reportCommandError,
            t,
        });

        const {
            serverClass,
            addModalState,
            openAddTorrentPicker,
            openAddMagnet,
            isMagnetModalOpen,
            magnetModalInitialValue,
            handleMagnetModalClose,
            handleMagnetSubmit,
            addSource,
            lastDownloadDir,
            isResolvingMagnet,
            isFinalizingExisting,
            isAddingTorrent,
            closeAddTorrentWindow,
            handleTorrentWindowConfirm,
            recoverySession,
            isRecoveryBusy,
            lastRecoveryOutcome,
            isDetailRecoveryBlocked,
            handleRecoveryClose,
            handleRecoveryPickPath,
            handleRecoveryRecreateFolder,
            recoveryRequestBrowse,
            handleRecoveryRetry,
        } = orchestrator;

        const { getRootProps, getInputProps, isDragActive } = addModalState;
        const {
            selectedIds,
            activeId,
            setActiveId,
        } = useSelection();
        const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);
        const selectedTorrents = useMemo(
            () => torrents.filter((torrent) => selectedIdsSet.has(torrent.id)),
            [selectedIdsSet, torrents]
        );

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
            [loadDetail, setActiveId]
        );

        const handleCloseDetail = useCallback(() => {
            setActiveId(null);
            clearDetail();
        }, [clearDetail, setActiveId]);

        useEffect(() => {
            if (!activeId) {
                return;
            }
            if (detailData && detailData.id === activeId) {
                return;
            }
            const activeTorrent =
                selectedTorrents.find((torrent) => torrent.id === activeId) ??
                null;
            void loadDetail(
                activeId,
                activeTorrent
                    ? ({
                          ...activeTorrent,
                          trackers: [],
                          files: [],
                          peers: [],
                      } as TorrentDetail)
                    : undefined
            );
        }, [activeId, detailData, loadDetail, selectedTorrents]);

        const engineType = useMemo<EngineDisplayType>(() => {
            if (serverClass === "tinytorrent") {
                return "tinytorrent";
            }
            if (serverClass === "transmission") {
                return "transmission";
            }
            if (engineInfo?.type === "libtorrent") {
                return "tinytorrent";
            }
            if (engineInfo?.type === "transmission") {
                return "transmission";
            }
            return "unknown";
        }, [engineInfo, serverClass]);

        const actionsContext = useTorrentActionsContext();

        const executeTorrentActionViaDispatch = async (
            action: TorrentTableAction,
            torrent: Torrent,
            options?: { deleteData?: boolean }
        ) => {
            const dispatch = actionsContext.dispatch;
            if (!dispatch)
                throw new Error("Torrent actions dispatch unavailable");
            switch (action) {
                case "pause":
                    return dispatch(
                        TorrentIntents.ensurePaused(torrent.id ?? torrent.hash)
                    );
                case "resume":
                    return dispatch(
                        TorrentIntents.ensureActive(torrent.id ?? torrent.hash)
                    );
                case "recheck":
                    return dispatch(
                        TorrentIntents.ensureValid(torrent.id ?? torrent.hash)
                    );
                case "remove":
                    return dispatch(
                        TorrentIntents.ensureRemoved(
                            torrent.id ?? torrent.hash,
                            Boolean(options?.deleteData)
                        )
                    );
                case "remove-with-data":
                    return dispatch(
                        TorrentIntents.ensureRemoved(
                            torrent.id ?? torrent.hash,
                            true
                        )
                    );
                case "queue-move-top":
                    return dispatch(
                        TorrentIntents.queueMove(
                            torrent.id ?? torrent.hash,
                            "top",
                            1
                        )
                    );
                case "queue-move-bottom":
                    return dispatch(
                        TorrentIntents.queueMove(
                            torrent.id ?? torrent.hash,
                            "bottom",
                            1
                        )
                    );
                case "queue-move-up":
                    return dispatch(
                        TorrentIntents.queueMove(
                            torrent.id ?? torrent.hash,
                            "up",
                            1
                        )
                    );
                case "queue-move-down":
                    return dispatch(
                        TorrentIntents.queueMove(
                            torrent.id ?? torrent.hash,
                            "down",
                            1
                        )
                    );
            }
        };

        const executeBulkRemoveViaDispatch = async (
            ids: string[],
            deleteData: boolean
        ) => {
            const dispatch = actionsContext.dispatch;
            if (!dispatch)
                throw new Error("Torrent actions dispatch unavailable");
            return dispatch(
                TorrentIntents.ensureSelectionRemoved(ids, deleteData)
            );
        };

        const {
            optimisticStatuses,
            pendingDelete,
            confirmDelete,
            clearPendingDelete,
        } = useTorrentWorkflow({
            torrents,
            selectedTorrentIds: selectedIds,
            executeTorrentAction: executeTorrentActionViaDispatch,
            executeBulkRemove: executeBulkRemoveViaDispatch,
            executeSelectionAction: async (action, ids) => {
                const dispatch = actionsContext.dispatch;
                if (!dispatch)
                    throw new Error("Torrent actions dispatch unavailable");
                switch (action) {
                    case "pause":
                        return dispatch(
                            TorrentIntents.ensureSelectionPaused(ids)
                        );
                    case "resume":
                        return dispatch(
                            TorrentIntents.ensureSelectionActive(ids)
                        );
                    case "recheck":
                        return dispatch(
                            TorrentIntents.ensureSelectionValid(ids)
                        );
                    default:
                        throw new Error(
                            "Unsupported selection action: " + action
                        );
                }
            },
            announceAction,
            showFeedback,
        });

        const {
            workspaceStyle,
            toggleWorkspaceStyle,
            dismissedHudCardSet,
            dismissHudCard,
            restoreHudCards,
        } = useWorkspaceShell();
        const hasDismissedInsights = Boolean(dismissedHudCardSet.size);

        const wrappedToggleWorkspaceStyle = useCallback(() => {
            toggleWorkspaceStyle();
        }, [toggleWorkspaceStyle]);

        const hudCards = useHudCards({
            rpcStatus,
            engineInfo,
            isDetectingEngine,
            isDragActive,
            dismissedHudCardSet,
        });
        const visibleHudCards = hudCards.visibleHudCards;

        const commandActions = useMemo(() => {
            const actionGroup = t("command_palette.group.actions");
            const filterGroup = t("command_palette.group.filters");
            const searchGroup = t("command_palette.group.search");
            return [
                {
                    id: "add-torrent",
                    group: actionGroup,
                    title: t("command_palette.actions.add_torrent"),
                    description: t(
                        "command_palette.actions.add_torrent_description"
                    ),
                    onSelect: openAddTorrentPicker,
                },
                {
                    id: "add-magnet",
                    group: actionGroup,
                    title: t("command_palette.actions.add_magnet"),
                    description: t(
                        "command_palette.actions.add_magnet_description"
                    ),
                    onSelect: openAddMagnet,
                },
                {
                    id: "open-settings",
                    group: actionGroup,
                    title: t("command_palette.actions.open_settings"),
                    description: t(
                        "command_palette.actions.open_settings_description"
                    ),
                    onSelect: openSettings,
                },
                {
                    id: "refresh-torrents",
                    group: actionGroup,
                    title: t("command_palette.actions.refresh"),
                    description: t(
                        "command_palette.actions.refresh_description"
                    ),
                    onSelect: refreshTorrents,
                },
                {
                    id: "focus-search",
                    group: searchGroup,
                    title: t("command_palette.actions.focus_search"),
                    description: t(
                        "command_palette.actions.focus_search_description"
                    ),
                    onSelect: focusSearchInput,
                },
                {
                    id: "filter-all",
                    group: filterGroup,
                    title: t("nav.filter_all"),
                    description: t("command_palette.filters.all_description"),
                    onSelect: () => setFilter("all"),
                },
                {
                    id: "filter-downloading",
                    group: filterGroup,
                    title: t("nav.filter_downloading"),
                    description: t(
                        "command_palette.filters.downloading_description"
                    ),
                    onSelect: () =>
                        setFilter(STATUS.torrent.DOWNLOADING),
                },
                {
                    id: "filter-seeding",
                    group: filterGroup,
                    title: t("nav.filter_seeding"),
                    description: t("command_palette.filters.seeding_description"),
                    onSelect: () => setFilter(STATUS.torrent.SEEDING),
                },
            ];
        }, [
            focusSearchInput,
            openAddTorrentPicker,
            openAddMagnet,
            openSettings,
            refreshTorrents,
            setFilter,
            t,
        ]);

        const getContextActions = useCallback(
            ({ activePart }: CommandPaletteContext) => {
                const contextGroup = t("command_palette.group.context");
                const entries: CommandAction[] = [];

                if (activePart === "table" && selectedTorrents.length) {
                    entries.push(
                        {
                            id: "context.pause_selected",
                            group: contextGroup,
                            title: t("command_palette.actions.pause_selected"),
                            description: t(
                                "command_palette.actions.pause_selected_description"
                            ),
                            onSelect: () => {
                                const dispatch =
                                    actionsContext?.dispatch ?? null;
                                if (!dispatch) return;
                                selectedTorrents.forEach((t) =>
                                    void dispatch(
                                        TorrentIntents.ensurePaused(
                                            t.id ?? t.hash
                                        )
                                    )
                                );
                            },
                        },
                        {
                            id: "context.resume_selected",
                            group: contextGroup,
                            title: t("command_palette.actions.resume_selected"),
                            description: t(
                                "command_palette.actions.resume_selected_description"
                            ),
                            onSelect: () => {
                                const dispatch =
                                    actionsContext?.dispatch ?? null;
                                if (!dispatch) return;
                                selectedTorrents.forEach((t) =>
                                    void dispatch(
                                        TorrentIntents.ensureActive(
                                            t.id ?? t.hash
                                        )
                                    )
                                );
                            },
                        },
                        {
                            id: "context.recheck_selected",
                            group: contextGroup,
                            title: t("command_palette.actions.recheck_selected"),
                            description: t(
                                "command_palette.actions.recheck_selected_description"
                            ),
                            onSelect: () => {
                                const dispatch =
                                    actionsContext?.dispatch ?? null;
                                if (!dispatch) return;
                                selectedTorrents.forEach((t) =>
                                    void dispatch(
                                        TorrentIntents.ensureValid(
                                            t.id ?? t.hash
                                        )
                                    )
                                );
                            },
                        }
                    );
                    const targetTorrent = selectedTorrents[0];
                    if (targetTorrent) {
                        entries.push({
                            id: "context.open_inspector",
                            group: contextGroup,
                            title: t("command_palette.actions.open_inspector"),
                            description: t(
                                "command_palette.actions.open_inspector_description"
                            ),
                            onSelect: () => handleRequestDetails(targetTorrent),
                        });
                    }
                }

                if (activePart === "inspector" && detailData) {
                    const fileIndexes =
                        detailData.files?.map((file) => file.index) ?? [];
                    if (fileIndexes.length) {
                        entries.push({
                            id: "context.select_all_files",
                            group: contextGroup,
                            title: t("command_palette.actions.select_all_files"),
                            description: t(
                                "command_palette.actions.select_all_files_description"
                            ),
                            onSelect: () => {
                                setInspectorTabCommand("content");
                                return handleFileSelectionChange(
                                    fileIndexes,
                                    true
                                );
                            },
                        });
                    }

                    const hasPeers = Boolean(detailData.peers?.length);
                    if (hasPeers) {
                        const isSpeedSorted = peerSortStrategy === "speed";
                        entries.push({
                            id: isSpeedSorted
                                ? "context.inspector.reset_peer_sort"
                                : "context.inspector.sort_peers_by_speed",
                            group: contextGroup,
                            title: t(
                                isSpeedSorted
                                    ? "command_palette.actions.reset_peer_sort"
                                    : "command_palette.actions.sort_peers_by_speed"
                            ),
                            description: t(
                                isSpeedSorted
                                    ? "command_palette.actions.reset_peer_sort_description"
                                    : "command_palette.actions.sort_peers_by_speed_description"
                            ),
                            onSelect: () => {
                                setInspectorTabCommand("peers");
                                setPeerSortStrategy(
                                    isSpeedSorted ? "none" : "speed"
                                );
                            },
                        });
                    }
                }

                return entries;
            },
            [
                detailData,
                handleFileSelectionChange,
                handleRequestDetails,
                peerSortStrategy,
                selectedTorrents,
                setInspectorTabCommand,
                setPeerSortStrategy,
                t,
                actionsContext,
            ]
        );

        return (
            <>
                {/* Add-torrent file input handled via orchestrator's dropzone props */}
                <FocusController
                    torrents={torrents}
                    detailData={detailData}
                    requestDetails={handleRequestDetails}
                    closeDetail={handleCloseDetail}
                />
                <RecoveryProvider
                    value={{
                        serverClass,
                        handleRetry: handleRecoveryRetry,
                    }}
                >
                    <WorkspaceShell
                        getRootProps={getRootProps}
                        getInputProps={getInputProps}
                        isDragActive={isDragActive}
                        filter={filter}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        setFilter={setFilter}
                        openAddTorrent={openAddTorrentPicker}
                        openAddMagnet={openAddMagnet}
                        openSettings={openSettings}
                        rehashStatus={rehashStatus}
                        workspaceStyle={workspaceStyle}
                        toggleWorkspaceStyle={wrappedToggleWorkspaceStyle}
                        torrents={torrents}
                        ghostTorrents={ghostTorrents}
                        isTableLoading={!isInitialLoadFinished}
                        handleRequestDetails={handleRequestDetails}
                        detailData={detailData}
                        closeDetail={handleCloseDetail}
                        handleFileSelectionChange={
                            handleFileSelectionChange
                        }
                        sequentialToggleHandler={handleSequentialToggle}
                        superSeedingToggleHandler={handleSuperSeedingToggle}
                        /* onSetLocation removed: use TorrentActionsContext.setLocation */
                        capabilities={capabilities}
                        optimisticStatuses={optimisticStatuses}
                        /* handleOpenFolder removed; leaf components use TorrentActionsContext */
                        peerSortStrategy={peerSortStrategy}
                        inspectorTabCommand={inspectorTabCommand}
                        onInspectorTabCommandHandled={
                            handleInspectorTabCommandHandled
                        }
                        sessionStats={sessionStats}
                        liveTransportStatus={liveTransportStatus}
                        engineType={engineType}
                        handleReconnect={handleReconnect}
                        pendingDelete={pendingDelete}
                        clearPendingDelete={clearPendingDelete}
                        confirmDelete={confirmDelete}
                        visibleHudCards={visibleHudCards}
                        dismissHudCard={dismissHudCard}
                        hasDismissedInsights={hasDismissedInsights}
                        isSettingsOpen={isSettingsOpen}
                        closeSettings={closeSettings}
                        settingsConfig={settingsFlow.settingsConfig}
                        isSettingsSaving={settingsFlow.isSettingsSaving}
                        settingsLoadError={settingsFlow.settingsLoadError}
                        handleSaveSettings={settingsFlow.handleSaveSettings}
                        handleTestPort={settingsFlow.handleTestPort}
                        restoreHudCards={restoreHudCards}
                        applyUserPreferencesPatch={
                            settingsFlow.applyUserPreferencesPatch
                        }
                        tableWatermarkEnabled={
                            settingsFlow.settingsConfig
                                .table_watermark_enabled
                        }
                        isDetailRecoveryBlocked={isDetailRecoveryBlocked}
                    />
                    <TorrentRecoveryModal
                        isOpen={Boolean(recoverySession)}
                        torrent={recoverySession?.torrent ?? null}
                        outcome={
                            lastRecoveryOutcome ??
                            recoverySession?.outcome ??
                            null
                        }
                        onClose={handleRecoveryClose}
                        onPickPath={handleRecoveryPickPath}
                        onBrowse={
                            NativeShell.isAvailable
                                ? recoveryRequestBrowse
                                : undefined
                        }
                        onRecreate={handleRecoveryRecreateFolder}
                        isBusy={isRecoveryBusy}
                    />
                </RecoveryProvider>
                <CommandPalette
                    isOpen={isCommandPaletteOpen}
                    onOpenChange={setCommandPaletteOpen}
                    actions={commandActions}
                    getContextActions={getContextActions}
                />
                <AddMagnetModal
                    isOpen={isMagnetModalOpen}
                    initialValue={magnetModalInitialValue}
                    onClose={handleMagnetModalClose}
                    onSubmit={handleMagnetSubmit}
                />
                {addSource && addSource.kind === "file" && (
                    <AddTorrentModal
                        isOpen={true}
                        source={addSource}
                        initialDownloadDir={
                            lastDownloadDir ||
                            settingsFlow.settingsConfig.download_dir
                        }
                        isSubmitting={isAddingTorrent || isFinalizingExisting}
                        isResolvingSource={isResolvingMagnet}
                        onCancel={closeAddTorrentWindow}
                        onConfirm={handleTorrentWindowConfirm}
                        checkFreeSpace={torrentClient.checkFreeSpace}
                        onBrowseDirectory={
                            NativeShell.isAvailable
                                ? async (currentPath: string) => {
                                      try {
                                          return await NativeShell.browseDirectory(
                                              currentPath
                                          );
                                      } catch {
                                          return null;
                                      }
                                  }
                                : undefined
                        }
                    />
                )}
            </>
        );
    };

    return (
        <FocusProvider>
            <LifecycleProvider>
                <TorrentActionsProvider>
                    <SelectionProvider>
                        <AppInner />
                    </SelectionProvider>
                </TorrentActionsProvider>
            </LifecycleProvider>
        </FocusProvider>
    );
}
