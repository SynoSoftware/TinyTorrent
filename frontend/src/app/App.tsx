import { useState, useEffect, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { AnimatePresence, motion } from "framer-motion";
import { FileUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@heroui/react";

import { useTransmissionSession, type RpcStatus } from "../core/hooks/useTransmissionSession";
import { usePerformanceHistory } from "../core/hooks/usePerformanceHistory";
import { useTorrentData } from "../features/dashboard/hooks/useTorrentData";
import { useTorrentClient } from "../core/client-context";
import { ModeLayout } from "../features/dashboard/components/ModeLayout";
import { type TorrentTableAction } from "../features/dashboard/components/TorrentTable";
import { AddTorrentModal } from "../features/torrent-add/components/AddTorrentModal";
import { SettingsModal } from "../features/settings/components/SettingsModal";
import type { Torrent, TorrentDetail } from "../features/dashboard/types/torrent";
import { DEFAULT_SETTINGS_CONFIG, type SettingsConfig } from "../features/settings/data/config";
import { useTorrentDetail } from "../features/dashboard/hooks/useTorrentDetail";
import { useDetailControls } from "../features/dashboard/hooks/useDetailControls";
import { useTorrentActions } from "../features/dashboard/hooks/useTorrentActions";
import constants from "../config/constants.json";
import type { TransmissionSessionSettings } from "../core/types";
import { Navbar } from "../shared/ui/layout/Navbar";
import { StatusBar } from "../shared/ui/layout/StatusBar";
import type { SessionStats } from "../core/domain/entities";
import { useWorkspaceModals } from "./workspace-modal-context";
import { useWorkspaceHeartbeat } from "./hooks/useWorkspaceHeartbeat";

const padTime = (value: number) => String(value).padStart(2, "0");

const minutesToTimeString = (time: number | undefined, fallback: string) => {
  if (time === undefined || time === null) return fallback;
  const hours = Math.floor(time / 60);
  const minutes = time % 60;
  return `${padTime(hours)}:${padTime(minutes)}`;
};

const timeStringToMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map((part) => Number(part));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return hours * 60 + minutes;
};

const USER_PREFERENCES_KEY = "tiny-torrent.user-preferences";
const MOTION_DURATION_S = constants.ui.animation_duration_ms / 1000;

type PreferencePayload = Pick<SettingsConfig, "refresh_interval_ms" | "request_timeout_ms">;

const readUserPreferences = (): Partial<PreferencePayload> => {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(USER_PREFERENCES_KEY);
    if (!stored) return {};
    return JSON.parse(stored) as Partial<PreferencePayload>;
  } catch {
    return {};
  }
};

const mergeWithUserPreferences = (config: SettingsConfig): SettingsConfig => ({
  ...config,
  ...readUserPreferences(),
});

const persistUserPreferences = (config: SettingsConfig) => {
  if (typeof window === "undefined") return;
  const payload: PreferencePayload = {
    refresh_interval_ms: config.refresh_interval_ms,
    request_timeout_ms: config.request_timeout_ms,
  };
  window.localStorage.setItem(USER_PREFERENCES_KEY, JSON.stringify(payload));
};

const mapSessionToConfig = (session: TransmissionSessionSettings): SettingsConfig => ({
  ...DEFAULT_SETTINGS_CONFIG,
  peer_port: session["peer-port"] ?? DEFAULT_SETTINGS_CONFIG.peer_port,
  peer_port_random_on_start: session["peer-port-random-on-start"] ?? DEFAULT_SETTINGS_CONFIG.peer_port_random_on_start,
  port_forwarding_enabled: session["port-forwarding-enabled"] ?? DEFAULT_SETTINGS_CONFIG.port_forwarding_enabled,
  encryption: session.encryption ?? DEFAULT_SETTINGS_CONFIG.encryption,
  speed_limit_down: session["speed-limit-down"] ?? DEFAULT_SETTINGS_CONFIG.speed_limit_down,
  speed_limit_down_enabled: session["speed-limit-down-enabled"] ?? DEFAULT_SETTINGS_CONFIG.speed_limit_down_enabled,
  speed_limit_up: session["speed-limit-up"] ?? DEFAULT_SETTINGS_CONFIG.speed_limit_up,
  speed_limit_up_enabled: session["speed-limit-up-enabled"] ?? DEFAULT_SETTINGS_CONFIG.speed_limit_up_enabled,
  alt_speed_down: session["alt-speed-down"] ?? DEFAULT_SETTINGS_CONFIG.alt_speed_down,
  alt_speed_up: session["alt-speed-up"] ?? DEFAULT_SETTINGS_CONFIG.alt_speed_up,
  alt_speed_time_enabled: session["alt-speed-time-enabled"] ?? DEFAULT_SETTINGS_CONFIG.alt_speed_time_enabled,
  alt_speed_begin: minutesToTimeString(session["alt-speed-begin"], DEFAULT_SETTINGS_CONFIG.alt_speed_begin),
  alt_speed_end: minutesToTimeString(session["alt-speed-end"], DEFAULT_SETTINGS_CONFIG.alt_speed_end),
  alt_speed_time_day: session["alt-speed-time-day"] ?? DEFAULT_SETTINGS_CONFIG.alt_speed_time_day,
  peer_limit_global: session["peer-limit-global"] ?? DEFAULT_SETTINGS_CONFIG.peer_limit_global,
  peer_limit_per_torrent: session["peer-limit-per-torrent"] ?? DEFAULT_SETTINGS_CONFIG.peer_limit_per_torrent,
  lpd_enabled: session["lpd-enabled"] ?? DEFAULT_SETTINGS_CONFIG.lpd_enabled,
  dht_enabled: session["dht-enabled"] ?? DEFAULT_SETTINGS_CONFIG.dht_enabled,
  pex_enabled: session["pex-enabled"] ?? DEFAULT_SETTINGS_CONFIG.pex_enabled,
  blocklist_url: session["blocklist-url"] ?? DEFAULT_SETTINGS_CONFIG.blocklist_url,
  blocklist_enabled: session["blocklist-enabled"] ?? DEFAULT_SETTINGS_CONFIG.blocklist_enabled,
  download_dir: session["download-dir"] ?? DEFAULT_SETTINGS_CONFIG.download_dir,
  incomplete_dir_enabled: session["incomplete-dir-enabled"] ?? DEFAULT_SETTINGS_CONFIG.incomplete_dir_enabled,
  incomplete_dir: session["incomplete-dir"] ?? DEFAULT_SETTINGS_CONFIG.incomplete_dir,
  rename_partial_files: session["rename-partial-files"] ?? DEFAULT_SETTINGS_CONFIG.rename_partial_files,
  start_added_torrents: session["start-added-torrents"] ?? DEFAULT_SETTINGS_CONFIG.start_added_torrents,
  seedRatioLimit: session.seedRatioLimit ?? DEFAULT_SETTINGS_CONFIG.seedRatioLimit,
  seedRatioLimited: session.seedRatioLimited ?? DEFAULT_SETTINGS_CONFIG.seedRatioLimited,
  idleSeedingLimit: session["idle-seeding-limit"] ?? DEFAULT_SETTINGS_CONFIG.idleSeedingLimit,
  idleSeedingLimited: session["idle-seeding-limit-enabled"] ?? DEFAULT_SETTINGS_CONFIG.idleSeedingLimited,
  refresh_interval_ms: DEFAULT_SETTINGS_CONFIG.refresh_interval_ms,
  request_timeout_ms: DEFAULT_SETTINGS_CONFIG.request_timeout_ms,
});

const mapConfigToSession = (config: SettingsConfig): Partial<TransmissionSessionSettings> => ({
  "peer-port": config.peer_port,
  "peer-port-random-on-start": config.peer_port_random_on_start,
  "port-forwarding-enabled": config.port_forwarding_enabled,
  encryption: config.encryption,
  "speed-limit-down": config.speed_limit_down,
  "speed-limit-down-enabled": config.speed_limit_down_enabled,
  "speed-limit-up": config.speed_limit_up,
  "speed-limit-up-enabled": config.speed_limit_up_enabled,
  "alt-speed-down": config.alt_speed_down,
  "alt-speed-up": config.alt_speed_up,
  "alt-speed-time-enabled": config.alt_speed_time_enabled,
  "alt-speed-begin": timeStringToMinutes(config.alt_speed_begin),
  "alt-speed-end": timeStringToMinutes(config.alt_speed_end),
  "alt-speed-time-day": config.alt_speed_time_day,
  "peer-limit-global": config.peer_limit_global,
  "peer-limit-per-torrent": config.peer_limit_per_torrent,
  "lpd-enabled": config.lpd_enabled,
  "dht-enabled": config.dht_enabled,
  "pex-enabled": config.pex_enabled,
  "blocklist-url": config.blocklist_url,
  "blocklist-enabled": config.blocklist_enabled,
  "download-dir": config.download_dir,
  "incomplete-dir-enabled": config.incomplete_dir_enabled,
  "incomplete-dir": config.incomplete_dir,
  "rename-partial-files": config.rename_partial_files,
  "start-added-torrents": config.start_added_torrents,
  seedRatioLimit: config.seedRatioLimit,
  seedRatioLimited: config.seedRatioLimited,
  "idle-seeding-limit": config.idleSeedingLimit,
  "idle-seeding-limit-enabled": config.idleSeedingLimited,
});

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

  const [filter, setFilter] = useState("all");
  const { isAddModalOpen, openAddModal, closeAddModal, isSettingsOpen, openSettings, closeSettings } =
    useWorkspaceModals();
  const isMountedRef = useRef(false);
  const { detailData, loadDetail, refreshDetailData, clearDetail, mutateDetail } = useTorrentDetail({
    torrentClient,
    reportRpcStatus,
    isMountedRef,
  });
  const [settingsConfig, setSettingsConfig] = useState<SettingsConfig>(() =>
    mergeWithUserPreferences({ ...DEFAULT_SETTINGS_CONFIG })
  );
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [isAddingTorrent, setIsAddingTorrent] = useState(false);
  const [pendingTorrentFile, setPendingTorrentFile] = useState<File | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);

  const sessionReady = rpcStatus === "connected";
  const pollingIntervalMs = Math.max(1000, settingsConfig.refresh_interval_ms);
  const handleRpcStatusChange = useCallback(
    (status: Exclude<RpcStatus, "idle">) => {
      reportRpcStatus(status);
    },
    [reportRpcStatus]
  );
  const { torrents, isInitialLoadFinished, refresh: refreshTorrents, queueActions } = useTorrentData({
    client: torrentClient,
    sessionReady,
    pollingIntervalMs,
    autoRefresh: false,
    onRpcStatusChange: handleRpcStatusChange,
  });

  const refreshSessionStatsData = useCallback(async () => {
    try {
      const stats = await torrentClient.getSessionStats();
      if (isMountedRef.current) {
        setSessionStats(stats);
      }
    } catch {
      if (isMountedRef.current) {
        reportRpcStatus("error");
      }
    }
  }, [reportRpcStatus, torrentClient]);

  const {
    handleFileSelectionChange,
    handleSequentialToggle,
    handleSuperSeedingToggle,
    handleForceTrackerReannounce,
  } = useDetailControls({
    detailData,
    torrentClient,
    refreshTorrents,
    refreshDetailData,
    refreshSessionStatsData,
    reportRpcStatus,
    isMountedRef,
    mutateDetail,
  });

  const sequentialMethodAvailable = Boolean(torrentClient.setSequentialDownload);
  const superSeedingMethodAvailable = Boolean(torrentClient.setSuperSeeding);
  const sequentialSupported =
    engineInfo !== null
      ? Boolean(engineInfo.capabilities.sequentialDownload) && sequentialMethodAvailable
      : sequentialMethodAvailable;
  const superSeedingSupported =
    engineInfo !== null
      ? Boolean(engineInfo.capabilities.superSeeding) && superSeedingMethodAvailable
      : superSeedingMethodAvailable;
  const sequentialToggleHandler = sequentialSupported ? handleSequentialToggle : undefined;
  const superSeedingToggleHandler = superSeedingSupported ? handleSuperSeedingToggle : undefined;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleReconnect = () => {
    reconnect();
  };

  const { handleTorrentAction: executeTorrentAction } = useTorrentActions({
    torrentClient,
    queueActions,
    refreshTorrents,
    refreshDetailData,
    refreshSessionStatsData,
    reportRpcStatus,
    isMountedRef,
  });

  const handleTorrentAction = useCallback(
    async (action: TorrentTableAction, torrent: Torrent) => {
      if (action === "remove") {
        const deleteData = window.confirm(t("table.actions.confirm_delete_data"));
        await executeTorrentAction(action, torrent, { deleteData });
        return;
      }
      await executeTorrentAction(action, torrent);
    },
    [executeTorrentAction, t]
  );

  const handleRequestDetails = useCallback(
    async (torrent: Torrent) => {
      await loadDetail(
        torrent.id,
        { ...torrent, trackers: [], files: [], peers: [] } as TorrentDetail
      );
    },
    [loadDetail]
  );

  const closeDetail = () => {
    clearDetail();
  };

  const handleAddTorrent = useCallback(
    async (payload: {
      magnetLink?: string;
      metainfo?: string;
      downloadDir: string;
      startNow: boolean;
      filesUnwanted?: number[];
    }) => {
      setIsAddingTorrent(true);
      try {
        await torrentClient.addTorrent({
          magnetLink: payload.magnetLink,
          metainfo: payload.metainfo,
          downloadDir: payload.downloadDir,
          paused: !payload.startNow,
          filesUnwanted: payload.filesUnwanted,
        });
        await refreshTorrents();
        await refreshSessionStatsData();
      } catch {
        if (isMountedRef.current) {
          reportRpcStatus("error");
        }
        throw new Error("Failed to add torrent");
      } finally {
        setIsAddingTorrent(false);
      }
    },
    [refreshSessionStatsData, torrentClient, refreshTorrents, reportRpcStatus]
  );

  const handleAddModalClose = useCallback(() => {
    closeAddModal();
    setPendingTorrentFile(null);
  }, [closeAddModal]);

  const handleSaveSettings = useCallback(
    async (config: SettingsConfig) => {
      setIsSettingsSaving(true);
      try {
        if (!torrentClient.updateSessionSettings) {
          throw new Error("Session settings not supported by this client");
        }
        await torrentClient.updateSessionSettings(mapConfigToSession(config));
        if (isMountedRef.current) {
          setSettingsConfig(config);
          persistUserPreferences(config);
          await refreshTorrents();
          await refreshSessionStatsData();
        }
      } catch {
        if (isMountedRef.current) {
          reportRpcStatus("error");
        }
        throw new Error("Unable to save settings");
      } finally {
        if (isMountedRef.current) {
          setIsSettingsSaving(false);
        }
      }
    },
    [refreshSessionStatsData, torrentClient, refreshTorrents, reportRpcStatus]
  );

  const detailId = detailData?.id;

  const handleTestPort = useCallback(async () => {
    try {
      if (!torrentClient.testPort) {
        throw new Error("Port test not supported");
      }
      await torrentClient.testPort();
    } catch {
      if (isMountedRef.current) {
        reportRpcStatus("error");
      }
    }
  }, [torrentClient, reportRpcStatus]);

  useWorkspaceHeartbeat({
    sessionReady,
    pollingIntervalMs,
    refreshTorrents,
    refreshSessionStatsData,
    refreshDetailData,
    detailId,
  });

  useEffect(() => {
    updateRequestTimeout(settingsConfig.request_timeout_ms);
  }, [settingsConfig.request_timeout_ms, updateRequestTimeout]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    let active = true;
    const loadSettings = async () => {
      try {
        const session = await refreshSessionSettings();
        if (active) {
          setSettingsConfig(mergeWithUserPreferences(mapSessionToConfig(session)));
        }
      } catch {
        if (active) {
          reportRpcStatus("error");
        }
      }
    };
    void loadSettings();
    return () => {
      active = false;
    };
  }, [isSettingsOpen, refreshSessionSettings, reportRpcStatus]);

  const isTableLoading = !isInitialLoadFinished;

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length) {
        setPendingTorrentFile(acceptedFiles[0]);
      }
      openAddModal();
    },
    [openAddModal]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <div
      {...getRootProps()}
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground font-sans selection:bg-primary/20"
    >
      <input {...getInputProps()} />

      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
        <div className="absolute top-[-10%] right-[-5%] h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-5%] h-[500px] w-[500px] rounded-full bg-success/10 blur-[120px]" />
      </div>

      <AnimatePresence>
        {isDragActive && (
          <motion.div
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(12px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 border-[6px] border-primary/40 m-4 rounded-3xl"
            transition={{ duration: MOTION_DURATION_S }}
          >
            <div className="flex flex-col items-center gap-6">
              <FileUp size={48} className="text-primary animate-bounce" />
              <h2 className="text-3xl font-bold">{t("drop_overlay.title")}</h2>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {rpcStatus === "error" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: MOTION_DURATION_S }}
            className="fixed bottom-6 right-6 z-40"
          >
            <Button size="sm" variant="flat" color="warning" onPress={handleReconnect}>
              {t("status_bar.reconnect")}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <Navbar
        filter={filter}
        setFilter={setFilter}
        onAdd={() => openAddModal()}
        onSettings={() => openSettings()}
      />

      <ModeLayout
        torrents={torrents}
        filter={filter}
        isTableLoading={isTableLoading}
        onAction={handleTorrentAction}
        onRequestDetails={handleRequestDetails}
        detailData={detailData}
        onCloseDetail={closeDetail}
        onFilesToggle={handleFileSelectionChange}
        onSequentialToggle={sequentialToggleHandler}
        onSuperSeedingToggle={superSeedingToggleHandler}
        onForceTrackerReannounce={handleForceTrackerReannounce}
        sequentialSupported={sequentialSupported}
        superSeedingSupported={superSeedingSupported}
      />

      <StatusBar
        sessionStats={sessionStats}
        downHistory={downHistory}
        upHistory={upHistory}
        rpcStatus={rpcStatus}
        engineInfo={engineInfo}
        isDetectingEngine={isDetectingEngine}
      />
      <AddTorrentModal
        isOpen={isAddModalOpen}
        onClose={handleAddModalClose}
        initialFile={pendingTorrentFile}
        onAdd={handleAddTorrent}
        isSubmitting={isAddingTorrent}
        getFreeSpace={torrentClient.checkFreeSpace}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={closeSettings}
        initialConfig={settingsConfig}
        isSaving={isSettingsSaving}
        onSave={handleSaveSettings}
        onTestPort={handleTestPort}
      />
    </div>
  );
}
