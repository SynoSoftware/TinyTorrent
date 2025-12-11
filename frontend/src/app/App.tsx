import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";

import { usePerformanceHistory } from "../shared/hooks/usePerformanceHistory";
import { useTransmissionSession } from "./hooks/useTransmissionSession";
import { useWorkspaceHeartbeat } from "./hooks/useWorkspaceHeartbeat";
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
import { WorkspaceShell } from "./components/WorkspaceShell";
import { useTorrentClient } from "./providers/TorrentClientProvider";
import type { Torrent, TorrentDetail } from "../modules/dashboard/types/torrent";
import type { RehashStatus } from "./types/workspace";
import { HEARTBEAT_INTERVALS } from "../config/logic";

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
        autoRefresh: false,
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

    const closeDetail = () => {
        clearDetail();
    };

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

    useWorkspaceHeartbeat({
        sessionReady: rpcStatus === "connected",
        pollingIntervalMs,
        refreshTorrents,
        refreshSessionStatsData,
        refreshDetailData,
        detailId: detailData?.id,
    });

    useEffect(() => {
        const detailId = detailData?.id;
        if (rpcStatus !== "connected" || !detailId) return;
        void refreshDetailData();
        const intervalId = window.setInterval(() => {
            void refreshDetailData();
        }, HEARTBEAT_INTERVALS.detail);
        return () => {
            window.clearInterval(intervalId);
        };
    }, [detailData?.id, refreshDetailData, rpcStatus]);

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
            closeDetail={closeDetail}
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
    );
}
