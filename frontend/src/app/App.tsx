import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";
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
import { WorkspaceShell } from "./components/WorkspaceShell";
import { useTorrentClient } from "./providers/TorrentClientProvider";
import { FocusProvider, useFocusState } from "./context/FocusContext";
import type { Torrent, TorrentDetail } from "../modules/dashboard/types/torrent";
import type { RehashStatus } from "./types/workspace";

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

    const {
        sessionStats,
        refreshSessionStatsData,
    } = useSessionStats({
        torrentClient,
        reportRpcStatus,
        isMountedRef,
        sessionReady: rpcStatus === "connected",
    });

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

    const { handleTorrentAction: executeTorrentAction } = useTorrentActions({
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
    });

    const [filter, setFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTorrents, setSelectedTorrents] = useState<Torrent[]>([]);
    const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
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
                description: t("command_palette.filters.downloading_description"),
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
        globalActionFeedback,
        optimisticStatuses,
        pendingDelete,
        handleBulkAction,
        handleTorrentAction,
        confirmDelete,
        clearPendingDelete,
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
    const superSeedingMethodAvailable = Boolean(
        torrentClient.setSuperSeeding
    );
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

    const handleReconnect = () => {
        reconnect();
    };

    return (
        <FocusProvider>
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
            globalActionFeedback={globalActionFeedback}
            rehashStatus={rehashStatus}
            workspaceStyle={workspaceStyle}
            toggleWorkspaceStyle={toggleWorkspaceStyle}
            torrents={torrents}
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
                superSeedingSupported ? handleSuperSeedingToggle : undefined
            }
            handleForceTrackerReannounce={handleForceTrackerReannounce}
            sequentialSupported={sequentialSupported}
            superSeedingSupported={superSeedingSupported}
            optimisticStatuses={optimisticStatuses}
            handleSelectionChange={handleSelectionChange}
            sessionStats={sessionStats}
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
            handleSaveSettings={settingsFlow.handleSaveSettings}
            handleTestPort={settingsFlow.handleTestPort}
            restoreHudCards={restoreHudCards}
            torrentClient={torrentClient}
            />
            <CommandPalette
                isOpen={isCommandPaletteOpen}
                onOpenChange={setCommandPaletteOpen}
                actions={commandActions}
            />
        </FocusProvider>
    );
}
