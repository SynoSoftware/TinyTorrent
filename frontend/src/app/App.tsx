import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { AnimatePresence, motion } from "framer-motion";
import { FileUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@heroui/react";

import { TransmissionClient } from "../core/rpc-client";
import constants from "../config/constants.json";
import type { TransmissionSessionSettings } from "../core/types";
import { DEFAULT_SETTINGS_CONFIG, type SettingsConfig } from "../features/settings/data/config";
import { TorrentDetailModal } from "../features/dashboard/components/TorrentDetailModal";
import { normalizeTorrent, normalizeTorrentDetail } from "../features/dashboard/types/torrent";
import type { Torrent, TorrentDetail } from "../features/dashboard/types/torrent";

// Components
import { Navbar } from "../shared/ui/layout/Navbar";
import { StatusBar } from "../shared/ui/layout/StatusBar";
import { TorrentTable } from "../features/dashboard/components/TorrentTable";
import type { TorrentTableAction } from "../features/dashboard/components/TorrentTable";
import { AddTorrentModal } from "../features/torrent-add/components/AddTorrentModal";
import { SettingsModal } from "../features/settings/components/SettingsModal";

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

const HISTORY_DATA_POINTS = constants.performance.history_data_points;
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

  const client = useMemo(
    () =>
      new TransmissionClient({
        username: import.meta.env.VITE_RPC_USERNAME ?? "",
        password: import.meta.env.VITE_RPC_PASSWORD ?? "",
      }),
    []
  );
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [filter, setFilter] = useState("all");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [rpcStatus, setRpcStatus] = useState<"idle" | "connected" | "error">("idle");
  const [hasInitialLoadFinished, setHasInitialLoadFinished] = useState(false);
  const [downHistory, setDownHistory] = useState(new Array(HISTORY_DATA_POINTS).fill(0));
  const [upHistory, setUpHistory] = useState(new Array(HISTORY_DATA_POINTS).fill(0));

  const [detailData, setDetailData] = useState<TorrentDetail | null>(null);
  const detailRequestRef = useRef(0);
  const [settingsConfig, setSettingsConfig] = useState<SettingsConfig>(() =>
    mergeWithUserPreferences({ ...DEFAULT_SETTINGS_CONFIG })
  );
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [isAddingTorrent, setIsAddingTorrent] = useState(false);
  const isMountedRef = useRef(false);
  const [pendingTorrentFile, setPendingTorrentFile] = useState<File | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshTorrents = useCallback(async () => {
    try {
      const data = await client.fetchTorrents();
      if (!isMountedRef.current) return;
      const normalized = data.map(normalizeTorrent);
      setTorrents(normalized);
      const totalDown = normalized.reduce((acc, torrent) => acc + (torrent.status === "downloading" ? torrent.rateDownload : 0), 0);
      const totalUp = normalized.reduce((acc, torrent) => acc + torrent.rateUpload, 0);
      setDownHistory((prev) => [...prev.slice(1), totalDown]);
      setUpHistory((prev) => [...prev.slice(1), totalUp]);
      setRpcStatus("connected");
    } catch {
      if (!isMountedRef.current) return;
      setRpcStatus("error");
    }
  }, [client]);

  const clearPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      window.clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const initializeConnection = useCallback(async () => {
    if (!isMountedRef.current) return;
    clearPolling();
    setHasInitialLoadFinished(false);
    try {
      await client.handshake();
      await refreshTorrents();
      if (!isMountedRef.current) return;
      const intervalMs = Math.max(1000, settingsConfig.refresh_interval_ms);
      pollingIntervalRef.current = window.setInterval(refreshTorrents, intervalMs);
    } catch {
      if (isMountedRef.current) {
        setRpcStatus("error");
      }
    } finally {
      if (isMountedRef.current) {
        setHasInitialLoadFinished(true);
      }
    }
  }, [client, refreshTorrents, settingsConfig.refresh_interval_ms, clearPolling]);

  useEffect(() => {
    void initializeConnection();
    return () => {
      clearPolling();
    };
  }, [initializeConnection, clearPolling]);

  const handleReconnect = () => {
    void initializeConnection();
  };

  const handleTorrentAction = useCallback(
    async (action: TorrentTableAction, torrent: Torrent) => {
      try {
        if (action === "pause") {
          await client.stopTorrents([torrent.id]);
        } else if (action === "resume") {
          await client.startTorrents([torrent.id]);
        } else if (action === "recheck") {
          await client.verifyTorrents([torrent.id]);
        } else if (action === "remove") {
          const deleteData = window.confirm(t("table.actions.confirm_delete_data"));
          await client.removeTorrents([torrent.id], deleteData);
        } else if (action === "remove-with-data") {
          await client.removeTorrents([torrent.id], true);
        }
        await refreshTorrents();
      } catch {
        if (isMountedRef.current) {
          setRpcStatus("error");
        }
      }
    },
    [client, refreshTorrents]
  );

  const handleRequestDetails = useCallback(
    async (torrent: Torrent) => {
      const requestId = ++detailRequestRef.current;
      setDetailData({ ...torrent, trackers: [], files: [], peers: [] } as TorrentDetail);
      try {
      const detail = normalizeTorrentDetail(await client.fetchTorrentDetails(torrent.id));
      if (detailRequestRef.current !== requestId) return;
      setDetailData(detail);
      } catch {
        if (detailRequestRef.current !== requestId) return;
        if (isMountedRef.current) {
          setRpcStatus("error");
        }
      }
    },
    [client]
  );

  const closeDetail = () => {
    detailRequestRef.current += 1;
    setDetailData(null);
  };

  const handleAddTorrent = useCallback(
    async (payload: { magnetLink?: string; metainfo?: string; downloadDir: string; startNow: boolean }) => {
      setIsAddingTorrent(true);
      try {
        await client.addTorrent({
          magnetLink: payload.magnetLink,
          metainfo: payload.metainfo,
          downloadDir: payload.downloadDir,
          paused: !payload.startNow,
        });
        await refreshTorrents();
      } catch {
        if (isMountedRef.current) {
          setRpcStatus("error");
        }
        throw new Error("Failed to add torrent");
      } finally {
        setIsAddingTorrent(false);
      }
    },
    [client, refreshTorrents]
  );

  const handleAddModalClose = useCallback(() => {
    setIsAddModalOpen(false);
    setPendingTorrentFile(null);
  }, []);

  const handleSaveSettings = useCallback(
    async (config: SettingsConfig) => {
      setIsSettingsSaving(true);
      try {
        await client.updateSessionSettings(mapConfigToSession(config));
        if (isMountedRef.current) {
          setSettingsConfig(config);
          persistUserPreferences(config);
          await refreshTorrents();
        }
      } catch {
        if (isMountedRef.current) {
          setRpcStatus("error");
        }
        throw new Error("Unable to save settings");
      } finally {
        if (isMountedRef.current) {
          setIsSettingsSaving(false);
        }
      }
    },
    [client, refreshTorrents]
  );

const handleTestPort = useCallback(async () => {
  try {
    await client.testPort();
  } catch {
    if (isMountedRef.current) {
      setRpcStatus("error");
    }
  }
}, [client]);

useEffect(() => {
  client.updateRequestTimeout(settingsConfig.request_timeout_ms);
}, [client, settingsConfig.request_timeout_ms]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    let active = true;
    client
      .fetchSessionSettings()
      .then((session) => {
        if (active) {
          setSettingsConfig(mergeWithUserPreferences(mapSessionToConfig(session)));
        }
      })
      .catch(() => {
        if (active) {
          setRpcStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [client, isSettingsOpen]);

  const globalDown = downHistory[downHistory.length - 1];
  const globalUp = upHistory[upHistory.length - 1];
  const isTableLoading = !hasInitialLoadFinished;

  // --- Logic: Drag & Drop ---
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length) {
      setPendingTorrentFile(acceptedFiles[0]);
    }
    setIsAddModalOpen(true);
  }, []);

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

      {/* 1. AMBIENT BACKGROUND LAYER */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
        <div className="absolute top-[-10%] right-[-5%] h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-5%] h-[500px] w-[500px] rounded-full bg-success/10 blur-[120px]" />
      </div>

      {/* 2. OVERLAY LAYER */}
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

      {/* 3. LAYOUT: Header */}
      <Navbar
        filter={filter}
        setFilter={setFilter}
        onAdd={() => setIsAddModalOpen(true)}
        onSettings={() => setIsSettingsOpen(true)}
      />

      {/* 4. LAYOUT: Main Content */}
      <main className="flex-1 relative overflow-hidden flex flex-col z-10">
        <TorrentTable
          torrents={torrents}
          filter={filter}
          isLoading={isTableLoading}
          onAction={handleTorrentAction}
          onRequestDetails={handleRequestDetails}
        />
      </main>

      {/* 5. LAYOUT: Footer */}
      <StatusBar
        downSpeed={globalDown}
        upSpeed={globalUp}
        downHistory={downHistory}
        upHistory={upHistory}
        rpcStatus={rpcStatus}
      />

      {/* 6. MODALS */}
      <TorrentDetailModal torrent={detailData} isOpen={Boolean(detailData)} onClose={closeDetail} />
      <AddTorrentModal
        isOpen={isAddModalOpen}
        onClose={handleAddModalClose}
        initialFile={pendingTorrentFile}
        onAdd={handleAddTorrent}
        isSubmitting={isAddingTorrent}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialConfig={settingsConfig}
        isSaving={isSettingsSaving}
        onSave={handleSaveSettings}
        onTestPort={handleTestPort}
      />
    </div>
  );
}
