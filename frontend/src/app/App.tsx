import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Runtime from "@/app/runtime";
import { useHotkeys } from "react-hotkeys-hook";
import useWorkbenchScale from "./hooks/useWorkbenchScale";
import { useTranslation } from "react-i18next";

import { usePerformanceHistory } from "../shared/hooks/usePerformanceHistory";
import { useTransmissionSession } from "./hooks/useTransmissionSession";
import { useWorkspaceShell } from "./hooks/useWorkspaceShell";
import { useWorkspaceModals } from "./WorkspaceModalContext";
import { useAddModalState } from "./hooks/useAddModalState";
import { useAddTorrent } from "./hooks/useAddTorrent";
import { useSettingsFlow } from "./hooks/useSettingsFlow";
import { useSessionStats } from "./hooks/useSessionStats";
import { useTorrentWorkflow } from "./hooks/useTorrentWorkflow";
import { useHudCards } from "./hooks/useHudCards";
import { useTorrentData } from "../modules/dashboard/hooks/useTorrentData";
import { useTorrentDetail } from "../modules/dashboard/hooks/useTorrentDetail";
import { useDetailControls } from "../modules/dashboard/hooks/useDetailControls";
import { useTorrentActions } from "../modules/dashboard/hooks/useTorrentActions";
import { CommandPalette } from "./components/CommandPalette";
import type {
    CommandAction,
    CommandPaletteContext,
} from "./components/CommandPalette";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { RpcExtensionProvider } from "./context/RpcExtensionContext";
import { useTorrentClient } from "./providers/TorrentClientProvider";
import { FocusProvider, useFocusState } from "./context/FocusContext";
import type {
    Torrent,
    TorrentDetail,
} from "../modules/dashboard/types/torrent";
import type { RehashStatus } from "./types/workspace";
import type {
    DetailTab,
    PeerSortStrategy,
} from "../modules/dashboard/components/TorrentDetailView";

interface FocusControllerProps {
    selectedTorrents: Torrent[];
    detailData: TorrentDetail | null;
    requestDetails: (torrent: Torrent) => Promise<void>;
    closeDetail: () => void;
}

function FocusController({
    selectedTorrents,
    detailData,
    requestDetails,
    closeDetail,
}: FocusControllerProps) {
    const { setActivePart } = useFocusState();

    const toggleInspector = useCallback(async () => {
        if (detailData) {
            closeDetail();
            return;
        }

        const targetTorrent = selectedTorrents[0];
        if (!targetTorrent) return;

        await requestDetails(targetTorrent);
    }, [closeDetail, detailData, requestDetails, selectedTorrents]);

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

    useEffect(() => {
        if (detailData) {
            setActivePart("inspector");
        }
    }, [detailData, setActivePart]);

    return null;
}

export default function App() {
    const { t } = useTranslation();
    const torrentClient = useTorrentClient();
    const {
        rpcStatus,
        reconnect,
        refreshSessionSettings,
        reportRpcStatus,
        updateRequestTimeout,
        engineInfo,
        isDetectingEngine,
        isReady,
    } = useTransmissionSession(torrentClient);
    const { downHistory, upHistory } = usePerformanceHistory();

    const {
        isAddModalOpen,
        openAddModal,
        closeAddModal,
        isSettingsOpen,
        openSettings,
        closeSettings,
    } = useWorkspaceModals();

    const addModalState = useAddModalState({
        openAddModal,
        isAddModalOpen,
    });

    const {
        getRootProps,
        getInputProps,
        isDragActive,
        pendingTorrentFile,
        incomingMagnetLink,
        clearPendingTorrentFile,
        clearIncomingMagnetLink,
    } = addModalState;

    const isMountedRef = useRef(false);
    const extensionNoticeShownRef = useRef(false);
    const uiReadyNotifiedRef = useRef(false);

    const { sessionStats, refreshSessionStatsData, liveTransportStatus } =
        useSessionStats({
            torrentClient,
            reportRpcStatus,
            isMountedRef,
            sessionReady: rpcStatus === "connected",
        });

    // Workbench zoom: initialize global scale hook
    const { scale, increase, decrease, reset } = useWorkbenchScale();

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
            if ((e.ctrlKey || e.metaKey) && e.code === "Digit0") {
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
        reportRpcStatus,
        rpcStatus,
        isSettingsOpen,
        isMountedRef,
        updateRequestTimeout,
    });

    const pollingIntervalMs = Math.max(
        1000,
        settingsFlow.settingsConfig.refresh_interval_ms
    );

    const {
        torrents,
        isInitialLoadFinished,
        refresh: refreshTorrents,
        queueActions,
        ghostTorrents,
        addGhostTorrent,
        removeGhostTorrent,
    } = useTorrentData({
        client: torrentClient,
        sessionReady: rpcStatus === "connected",
        pollingIntervalMs,
        onRpcStatusChange: reportRpcStatus,
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
        reportRpcStatus,
        isMountedRef,
        sessionReady: rpcStatus === "connected",
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
        reportRpcStatus,
        isMountedRef,
        refreshTorrents,
        refreshDetailData,
        refreshSessionStatsData,
    });

    const { handleTorrentAction: executeTorrentAction, handleOpenFolder } =
        useTorrentActions({
            torrentClient,
            queueActions,
            refreshTorrents,
            refreshDetailData,
            refreshSessionStatsData,
            reportRpcStatus,
            isMountedRef,
        });

    const { handleAddTorrent, isAddingTorrent } = useAddTorrent({
        torrentClient,
        refreshTorrents,
        refreshSessionStatsData,
        reportRpcStatus,
        isMountedRef,
        addGhostTorrent,
        removeGhostTorrent,
    });

    const [filter, setFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTorrents, setSelectedTorrents] = useState<Torrent[]>([]);
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
                onSelect: openAddModal,
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
                description: t("command_palette.actions.refresh_description"),
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
                onSelect: () => setFilter("downloading"),
            },
            {
                id: "filter-seeding",
                group: filterGroup,
                title: t("nav.filter_seeding"),
                description: t("command_palette.filters.seeding_description"),
                onSelect: () => setFilter("seeding"),
            },
        ];
    }, [
        focusSearchInput,
        openAddModal,
        openSettings,
        refreshTorrents,
        setFilter,
        t,
    ]);

    const {
        optimisticStatuses,
        pendingDelete,
        handleBulkAction,
        handleTorrentAction,
        confirmDelete,
        clearPendingDelete,
        showFeedback,
    } = useTorrentWorkflow({
        torrents,
        selectedTorrents,
        executeTorrentAction,
    });

    const {
        workspaceStyle,
        toggleWorkspaceStyle,
        dismissedHudCardSet,
        dismissHudCard,
        restoreHudCards,
    } = useWorkspaceShell();

    const hudCards = useHudCards({
        rpcStatus,
        engineInfo,
        isDetectingEngine,
        isDragActive,
        pendingTorrentFile,
        incomingMagnetLink,
        dismissedHudCardSet,
    });
    const visibleHudCards = hudCards.visibleHudCards;

    const handleSelectionChange = useCallback((selection: Torrent[]) => {
        setSelectedTorrents(selection);
    }, []);

    const handleInspectorTabCommandHandled = useCallback(() => {
        setInspectorTabCommand(null);
    }, []);

    const handleRequestDetails = useCallback(
        async (torrent: Torrent) => {
            await loadDetail(torrent.id, {
                ...torrent,
                trackers: [],
                files: [],
                peers: [],
            } as TorrentDetail);
        },
        [loadDetail]
    );

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
                        onSelect: () => handleBulkAction("pause"),
                    },
                    {
                        id: "context.resume_selected",
                        group: contextGroup,
                        title: t("command_palette.actions.resume_selected"),
                        description: t(
                            "command_palette.actions.resume_selected_description"
                        ),
                        onSelect: () => handleBulkAction("resume"),
                    },
                    {
                        id: "context.recheck_selected",
                        group: contextGroup,
                        title: t("command_palette.actions.recheck_selected"),
                        description: t(
                            "command_palette.actions.recheck_selected_description"
                        ),
                        onSelect: () => handleBulkAction("recheck"),
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
                            return handleFileSelectionChange(fileIndexes, true);
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
            handleBulkAction,
            handleFileSelectionChange,
            handleRequestDetails,
            peerSortStrategy,
            selectedTorrents,
            setInspectorTabCommand,
            setPeerSortStrategy,
            t,
        ]
    );

    const handleCloseDetail = useCallback(() => {
        clearDetail();
    }, [clearDetail]);

    const handleAddModalClose = useCallback(() => {
        closeAddModal();
        clearPendingTorrentFile();
        clearIncomingMagnetLink();
    }, [clearIncomingMagnetLink, clearPendingTorrentFile, closeAddModal]);

    const sequentialMethodAvailable = Boolean(
        torrentClient.setSequentialDownload
    );
    const superSeedingMethodAvailable = Boolean(torrentClient.setSuperSeeding);
    const sequentialSupported =
        engineInfo !== null
            ? Boolean(engineInfo.capabilities.sequentialDownload) &&
              sequentialMethodAvailable
            : sequentialMethodAvailable;
    const superSeedingSupported =
        engineInfo !== null
            ? Boolean(engineInfo.capabilities.superSeeding) &&
              superSeedingMethodAvailable
            : superSeedingMethodAvailable;

    const rehashStatus: RehashStatus | undefined = useMemo(() => {
        const verifyingTorrents = torrents.filter(
            (torrent) => torrent.state === "checking"
        );
        if (!verifyingTorrents.length) return undefined;
        const value =
            (verifyingTorrents.reduce(
                (acc, torrent) =>
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

    useEffect(() => {
        if (!isReady) {
            uiReadyNotifiedRef.current = false;
            return;
        }
        if (!uiReadyNotifiedRef.current) {
            void torrentClient.notifyUiReady?.();
            uiReadyNotifiedRef.current = true;
        }
    }, [isReady, torrentClient]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        // Use a stable ref to always point to the latest torrentClient without
        // recreating a ref object inside the effect on every render.
        const torrentClientRef = (App as any)._torrentClientRef as
            | { current: typeof torrentClient }
            | undefined;
        if (!torrentClientRef) {
            // attach a module-scoped ref to the App function object so we can
            // reuse it across re-renders without re-allocating inside the effect.
            (App as any)._torrentClientRef = { current: torrentClient };
        } else {
            torrentClientRef.current = torrentClient;
        }

        const detachUi = () => {
            const ref = (App as any)._torrentClientRef as {
                current: typeof torrentClient;
            } | null;
            try {
                void ref?.current?.notifyUiDetached?.();
            } catch {
                // swallow errors during unload
            }
        };

        window.addEventListener("beforeunload", detachUi);
        // Do not call detachUi on component unmount (avoid firing when profiles change)
        return () => {
            window.removeEventListener("beforeunload", detachUi);
        };
    }, [torrentClient]);

    useEffect(() => {
        if (!detailData) {
            setPeerSortStrategy("none");
        }
    }, [detailData]);

    const handleReconnect = () => {
        reconnect();
    };

    const notifyExtensionUnavailable = useCallback(() => {
        if (extensionNoticeShownRef.current) return;
        extensionNoticeShownRef.current = true;
        showFeedback(t("settings.connection.extended_mock_notice"), "warning");
    }, [showFeedback, t]);

    return (
        <FocusProvider>
            <RpcExtensionProvider
                client={torrentClient}
                rpcStatus={rpcStatus}
                onUnavailable={notifyExtensionUnavailable}
            >
                <FocusController
                    selectedTorrents={selectedTorrents}
                    detailData={detailData}
                    requestDetails={handleRequestDetails}
                    closeDetail={handleCloseDetail}
                />
                <WorkspaceShell
                    getRootProps={getRootProps}
                    getInputProps={getInputProps}
                    isDragActive={isDragActive}
                    filter={filter}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    setFilter={setFilter}
                    openAddModal={openAddModal}
                    openSettings={openSettings}
                    selectedTorrents={selectedTorrents}
                    handleBulkAction={handleBulkAction}
                    rehashStatus={rehashStatus}
                    workspaceStyle={workspaceStyle}
                    toggleWorkspaceStyle={toggleWorkspaceStyle}
                    torrents={torrents}
                    ghostTorrents={ghostTorrents}
                    isTableLoading={!isInitialLoadFinished}
                    handleTorrentAction={handleTorrentAction}
                    handleRequestDetails={handleRequestDetails}
                    detailData={detailData}
                    closeDetail={handleCloseDetail}
                    handleFileSelectionChange={handleFileSelectionChange}
                    sequentialToggleHandler={
                        sequentialSupported ? handleSequentialToggle : undefined
                    }
                    superSeedingToggleHandler={
                        superSeedingSupported
                            ? handleSuperSeedingToggle
                            : undefined
                    }
                    handleForceTrackerReannounce={handleForceTrackerReannounce}
                    sequentialSupported={sequentialSupported}
                    superSeedingSupported={superSeedingSupported}
                    optimisticStatuses={optimisticStatuses}
                    handleSelectionChange={handleSelectionChange}
                    handleOpenFolder={handleOpenFolder}
                    peerSortStrategy={peerSortStrategy}
                    inspectorTabCommand={inspectorTabCommand}
                    onInspectorTabCommandHandled={
                        handleInspectorTabCommandHandled
                    }
                    sessionStats={sessionStats}
                    liveTransportStatus={liveTransportStatus}
                    downHistory={downHistory}
                    upHistory={upHistory}
                    rpcStatus={rpcStatus}
                    handleReconnect={handleReconnect}
                    pendingDelete={pendingDelete}
                    clearPendingDelete={clearPendingDelete}
                    confirmDelete={confirmDelete}
                    visibleHudCards={visibleHudCards}
                    dismissHudCard={dismissHudCard}
                    isAddModalOpen={isAddModalOpen}
                    handleAddModalClose={handleAddModalClose}
                    pendingTorrentFile={pendingTorrentFile}
                    incomingMagnetLink={incomingMagnetLink}
                    handleAddTorrent={handleAddTorrent}
                    isAddingTorrent={isAddingTorrent}
                    isSettingsOpen={isSettingsOpen}
                    closeSettings={closeSettings}
                    settingsConfig={settingsFlow.settingsConfig}
                    isSettingsSaving={settingsFlow.isSettingsSaving}
                    settingsLoadError={settingsFlow.settingsLoadError}
                    handleSaveSettings={settingsFlow.handleSaveSettings}
                    handleTestPort={settingsFlow.handleTestPort}
                    restoreHudCards={restoreHudCards}
                    tableWatermarkEnabled={
                        settingsFlow.settingsConfig.table_watermark_enabled
                    }
                    torrentClient={torrentClient}
                />
                <CommandPalette
                    isOpen={isCommandPaletteOpen}
                    onOpenChange={setCommandPaletteOpen}
                    actions={commandActions}
                    getContextActions={getContextActions}
                />
            </RpcExtensionProvider>
        </FocusProvider>
    );
}
