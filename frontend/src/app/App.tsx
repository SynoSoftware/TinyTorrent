import { useState, useEffect, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
} from "@heroui/react";

import { useTransmissionSession } from "./hooks/useTransmissionSession";
import type { RpcStatus } from "../shared/types/rpc";
import { usePerformanceHistory } from "../shared/hooks/usePerformanceHistory";
import { useTorrentData } from "../modules/dashboard/hooks/useTorrentData";
import { useTorrentClient } from "./providers/TorrentClientProvider";
import { ModeLayout } from "../modules/dashboard/components/ModeLayout";
import { type TorrentTableAction } from "../modules/dashboard/components/TorrentTable";
import { AddTorrentModal } from "../modules/torrent-add/components/AddTorrentModal";
import { SettingsModal } from "../modules/settings/components/SettingsModal";
import type {
    Torrent,
    TorrentDetail,
} from "../modules/dashboard/types/torrent";
import {
    DEFAULT_SETTINGS_CONFIG,
    type SettingsConfig,
} from "../modules/settings/data/config";
import constants from "../config/constants.json";
import { ICON_STROKE_WIDTH } from "../config/iconography";
import { INTERACTION_CONFIG } from "../config/interaction";
import { DETAIL_REFRESH_INTERVAL_MS } from "../config/detail";
import { useTorrentDetail } from "../modules/dashboard/hooks/useTorrentDetail";
import { useDetailControls } from "../modules/dashboard/hooks/useDetailControls";
import { useTorrentActions } from "../modules/dashboard/hooks/useTorrentActions";
import type { TransmissionSessionSettings } from "../services/rpc/types";
import { Navbar } from "../shared/ui/layout/Navbar";
import { StatusBar } from "../shared/ui/layout/StatusBar";
import type { SessionStats, TorrentStatus } from "../services/rpc/entities";
import { useWorkspaceModals } from "./WorkspaceModalContext";
import { useWorkspaceHeartbeat } from "./hooks/useWorkspaceHeartbeat";
import type {
    FeedbackMessage,
    FeedbackTone,
} from "../shared/types/feedback";

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
const MODAL_SPRING_TRANSITION = INTERACTION_CONFIG.modalBloom.transition;
const TOAST_SPRING_TRANSITION: Transition = {
    type: "spring",
    stiffness: 300,
    damping: 28,
};

type PreferencePayload = Pick<
    SettingsConfig,
    "refresh_interval_ms" | "request_timeout_ms"
>;

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

// --- DEEP LINK HELPERS ---
const MAGNET_SCHEME = "magnet:";
const MAGNET_QUERY_KEYS = ["magnet", "magnetLink", "url", "link"];

const safeDecode = (value: string) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

const normalizeMagnetLink = (value?: string | null) => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.toLowerCase().startsWith(MAGNET_SCHEME)) {
        return trimmed;
    }
    const decoded = safeDecode(trimmed);
    if (decoded.toLowerCase().startsWith(MAGNET_SCHEME)) {
        return decoded;
    }
    return undefined;
};

const findMagnetInString = (value: string) => {
    const lower = value.toLowerCase();
    const index = lower.indexOf(MAGNET_SCHEME);
    if (index === -1) return undefined;
    let candidate = value.slice(index);
    const separators = ["&", "#"];
    separators.forEach((separator) => {
        const separatorIndex = candidate.indexOf(separator);
        if (separatorIndex > 0) {
            candidate = candidate.slice(0, separatorIndex);
        }
    });
    return candidate;
};

const tryExtractMagnetFromSearch = () => {
    if (typeof window === "undefined") return undefined;
    const params = new URLSearchParams(window.location.search);
    for (const key of MAGNET_QUERY_KEYS) {
        const normalized = normalizeMagnetLink(params.get(key));
        if (normalized) {
            return normalized;
        }
    }
    const looseMatch = findMagnetInString(window.location.search);
    return normalizeMagnetLink(looseMatch);
};

const tryExtractMagnetFromHash = () => {
    if (typeof window === "undefined") return undefined;
    const hashBody = window.location.hash.replace(/^#\/?/, "");
    const match = findMagnetInString(hashBody);
    return normalizeMagnetLink(match ?? hashBody);
};

const tryExtractMagnetFromPath = () => {
    if (typeof window === "undefined") return undefined;
    const match = findMagnetInString(window.location.pathname);
    return normalizeMagnetLink(match ?? window.location.pathname);
};

const tryExtractMagnetFromProtocol = () => {
    if (typeof window === "undefined") return undefined;
    if (window.location.protocol === "magnet:") {
        return window.location.href;
    }
    return undefined;
};

const tryExtractMagnetFromArgs = () => {
    const nodeProcess = (globalThis as typeof globalThis & {
        process?: { argv?: string[] };
    }).process;
    const args = nodeProcess?.argv;
    if (!args?.length) return undefined;
    for (const arg of args) {
        const direct = normalizeMagnetLink(arg);
        if (direct) {
            return direct;
        }
        const loose = findMagnetInString(arg);
        const normalized = normalizeMagnetLink(loose);
        if (normalized) {
            return normalized;
        }
    }
    return undefined;
};

const resolveDeepLinkMagnet = () =>
    tryExtractMagnetFromProtocol() ??
    tryExtractMagnetFromSearch() ??
    tryExtractMagnetFromHash() ??
    tryExtractMagnetFromPath() ??
    tryExtractMagnetFromArgs();

const mapSessionToConfig = (
    session: TransmissionSessionSettings
): SettingsConfig => ({
    ...DEFAULT_SETTINGS_CONFIG,
    peer_port: session["peer-port"] ?? DEFAULT_SETTINGS_CONFIG.peer_port,
    peer_port_random_on_start:
        session["peer-port-random-on-start"] ??
        DEFAULT_SETTINGS_CONFIG.peer_port_random_on_start,
    port_forwarding_enabled:
        session["port-forwarding-enabled"] ??
        DEFAULT_SETTINGS_CONFIG.port_forwarding_enabled,
    encryption: session.encryption ?? DEFAULT_SETTINGS_CONFIG.encryption,
    speed_limit_down:
        session["speed-limit-down"] ?? DEFAULT_SETTINGS_CONFIG.speed_limit_down,
    speed_limit_down_enabled:
        session["speed-limit-down-enabled"] ??
        DEFAULT_SETTINGS_CONFIG.speed_limit_down_enabled,
    speed_limit_up:
        session["speed-limit-up"] ?? DEFAULT_SETTINGS_CONFIG.speed_limit_up,
    speed_limit_up_enabled:
        session["speed-limit-up-enabled"] ??
        DEFAULT_SETTINGS_CONFIG.speed_limit_up_enabled,
    alt_speed_down:
        session["alt-speed-down"] ?? DEFAULT_SETTINGS_CONFIG.alt_speed_down,
    alt_speed_up:
        session["alt-speed-up"] ?? DEFAULT_SETTINGS_CONFIG.alt_speed_up,
    alt_speed_time_enabled:
        session["alt-speed-time-enabled"] ??
        DEFAULT_SETTINGS_CONFIG.alt_speed_time_enabled,
    alt_speed_begin: minutesToTimeString(
        session["alt-speed-begin"],
        DEFAULT_SETTINGS_CONFIG.alt_speed_begin
    ),
    alt_speed_end: minutesToTimeString(
        session["alt-speed-end"],
        DEFAULT_SETTINGS_CONFIG.alt_speed_end
    ),
    alt_speed_time_day:
        session["alt-speed-time-day"] ??
        DEFAULT_SETTINGS_CONFIG.alt_speed_time_day,
    peer_limit_global:
        session["peer-limit-global"] ??
        DEFAULT_SETTINGS_CONFIG.peer_limit_global,
    peer_limit_per_torrent:
        session["peer-limit-per-torrent"] ??
        DEFAULT_SETTINGS_CONFIG.peer_limit_per_torrent,
    lpd_enabled: session["lpd-enabled"] ?? DEFAULT_SETTINGS_CONFIG.lpd_enabled,
    dht_enabled: session["dht-enabled"] ?? DEFAULT_SETTINGS_CONFIG.dht_enabled,
    pex_enabled: session["pex-enabled"] ?? DEFAULT_SETTINGS_CONFIG.pex_enabled,
    blocklist_url:
        session["blocklist-url"] ?? DEFAULT_SETTINGS_CONFIG.blocklist_url,
    blocklist_enabled:
        session["blocklist-enabled"] ??
        DEFAULT_SETTINGS_CONFIG.blocklist_enabled,
    download_dir:
        session["download-dir"] ?? DEFAULT_SETTINGS_CONFIG.download_dir,
    incomplete_dir_enabled:
        session["incomplete-dir-enabled"] ??
        DEFAULT_SETTINGS_CONFIG.incomplete_dir_enabled,
    incomplete_dir:
        session["incomplete-dir"] ?? DEFAULT_SETTINGS_CONFIG.incomplete_dir,
    rename_partial_files:
        session["rename-partial-files"] ??
        DEFAULT_SETTINGS_CONFIG.rename_partial_files,
    start_added_torrents:
        session["start-added-torrents"] ??
        DEFAULT_SETTINGS_CONFIG.start_added_torrents,
    seedRatioLimit:
        session.seedRatioLimit ?? DEFAULT_SETTINGS_CONFIG.seedRatioLimit,
    seedRatioLimited:
        session.seedRatioLimited ?? DEFAULT_SETTINGS_CONFIG.seedRatioLimited,
    idleSeedingLimit:
        session["idle-seeding-limit"] ??
        DEFAULT_SETTINGS_CONFIG.idleSeedingLimit,
    idleSeedingLimited:
        session["idle-seeding-limit-enabled"] ??
        DEFAULT_SETTINGS_CONFIG.idleSeedingLimited,
    refresh_interval_ms: DEFAULT_SETTINGS_CONFIG.refresh_interval_ms,
    request_timeout_ms: DEFAULT_SETTINGS_CONFIG.request_timeout_ms,
});

type GlobalActionFeedback = FeedbackMessage;

type RehashStatus = {
    active: boolean;
    value: number;
    label: string;
};

type DeleteAction = Extract<
    TorrentTableAction,
    "remove" | "remove-with-data"
>;

type DeleteIntent = {
    torrents: Torrent[];
    action: DeleteAction;
    deleteData: boolean;
};

const GLOBAL_ACTION_FEEDBACK_CONFIG = {
    resume: {
        start: { key: "toolbar.feedback.resuming", tone: "info" },
        done: { key: "toolbar.feedback.resumed", tone: "success" },
    },
    pause: {
        start: { key: "toolbar.feedback.pausing", tone: "warning" },
        done: { key: "toolbar.feedback.paused", tone: "warning" },
    },
    recheck: {
        start: { key: "toolbar.feedback.rehashing", tone: "info" },
        done: { key: "toolbar.feedback.rehashed", tone: "success" },
    },
    remove: {
        start: { key: "toolbar.feedback.removing", tone: "danger" },
        done: { key: "toolbar.feedback.removed", tone: "danger" },
    },
    "remove-with-data": {
        start: { key: "toolbar.feedback.removing", tone: "danger" },
        done: { key: "toolbar.feedback.removed", tone: "danger" },
    },
} as const;

type FeedbackAction = keyof typeof GLOBAL_ACTION_FEEDBACK_CONFIG;
type FeedbackStage = "start" | "done";

const mapConfigToSession = (
    config: SettingsConfig
): Partial<TransmissionSessionSettings> => ({
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
    const {
        isAddModalOpen,
        openAddModal,
        closeAddModal,
        isSettingsOpen,
        openSettings,
        closeSettings,
    } = useWorkspaceModals();
    const isMountedRef = useRef(false);
    const deepLinkHandledRef = useRef(false);
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
    const [settingsConfig, setSettingsConfig] = useState<SettingsConfig>(() =>
        mergeWithUserPreferences({ ...DEFAULT_SETTINGS_CONFIG })
    );
    const [isSettingsSaving, setIsSettingsSaving] = useState(false);
    const [isAddingTorrent, setIsAddingTorrent] = useState(false);
    const [pendingTorrentFile, setPendingTorrentFile] = useState<File | null>(
        null
    );
    const [incomingMagnetLink, setIncomingMagnetLink] = useState<string | null>(
        null
    );
    const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
    const [selectedTorrents, setSelectedTorrents] = useState<Torrent[]>([]);
    const [globalActionFeedback, setGlobalActionFeedback] =
        useState<GlobalActionFeedback | null>(null);
    const feedbackTimerRef = useRef<number | null>(null);
    const [pendingDelete, setPendingDelete] = useState<DeleteIntent | null>(
        null
    );
const [optimisticStatuses, setOptimisticStatuses] = useState<
        Record<string, { state: TorrentStatus; expiresAt: number }>
    >({});

    const handleSelectionChange = useCallback(
        (selection: Torrent[]) => {
            setSelectedTorrents(selection);
        },
        []
    );

    const showFeedback = useCallback(
        (message: string, tone: FeedbackTone) => {
            setGlobalActionFeedback({ message, tone });
            if (feedbackTimerRef.current) {
                window.clearTimeout(feedbackTimerRef.current);
            }
            feedbackTimerRef.current = window.setTimeout(() => {
                setGlobalActionFeedback(null);
                feedbackTimerRef.current = null;
            }, 3000);
        },
        []
    );

    const updateOptimisticStatuses = useCallback(
        (updates: Array<{ id: string; state?: TorrentStatus }>) => {
            setOptimisticStatuses((prev) => {
                const next = { ...prev };
                updates.forEach(({ id, state }) => {
                    if (state) {
                        next[id] = {
                            state,
                            expiresAt: Date.now() + 3000,
                        };
                    } else {
                        delete next[id];
                    }
                });
                return next;
            });
        },
        []
    );

    useEffect(() => {
        const interval = window.setInterval(() => {
            setOptimisticStatuses((prev) => {
                const next = { ...prev };
                const now = Date.now();
                Object.entries(prev).forEach(([id, entry]) => {
                    if (entry.expiresAt <= now) {
                        delete next[id];
                    }
                });
                return next;
            });
        }, 500);
        return () => window.clearInterval(interval);
    }, []);

    const announceAction = useCallback(
        (action: FeedbackAction, stage: FeedbackStage, count: number) => {
            const descriptor =
                GLOBAL_ACTION_FEEDBACK_CONFIG[action][stage];
            showFeedback(t(descriptor.key, { count }), descriptor.tone);
        },
        [showFeedback, t]
    );

    const requestDelete = useCallback(
        (
            torrentsToDelete: Torrent[],
            action: DeleteIntent["action"],
            deleteData: boolean
        ) => {
            if (!torrentsToDelete.length) return;
            setPendingDelete({
                torrents: torrentsToDelete.map((torrent) => torrent),
                action,
                deleteData,
            });
        },
        []
    );

    useEffect(() => {
        return () => {
            if (feedbackTimerRef.current) {
                window.clearTimeout(feedbackTimerRef.current);
            }
        };
    }, []);

    const sessionReady = rpcStatus === "connected";
    const pollingIntervalMs = Math.max(
        1000,
        settingsConfig.refresh_interval_ms
    );
    const handleRpcStatusChange = useCallback(
        (status: Exclude<RpcStatus, "idle">) => {
            reportRpcStatus(status);
        },
        [reportRpcStatus]
    );
    const {
        torrents,
        isInitialLoadFinished,
        refresh: refreshTorrents,
        queueActions,
    } = useTorrentData({
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
    const sequentialToggleHandler = sequentialSupported
        ? handleSequentialToggle
        : undefined;
    const superSeedingToggleHandler = superSeedingSupported
        ? handleSuperSeedingToggle
        : undefined;

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (deepLinkHandledRef.current) return;
        const magnet = resolveDeepLinkMagnet();
        if (!magnet) return;
        deepLinkHandledRef.current = true;
        setPendingTorrentFile(null);
        setIncomingMagnetLink(magnet);
        openAddModal();
    }, [openAddModal, setPendingTorrentFile, setIncomingMagnetLink]);

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

    const getOptimisticStateForAction = useCallback(
        (action: TorrentTableAction, torrent: Torrent): TorrentStatus | undefined => {
            if (action === "pause") {
                return "paused";
            }
            if (action === "resume") {
                return torrent.state === "seeding" ? "seeding" : "downloading";
            }
            if (action === "recheck") {
                return "checking";
            }
            return undefined;
        },
        []
    );

    const runActionsWithOptimism = useCallback(
        async (action: TorrentTableAction, torrentsToUpdate: Torrent[]) => {
            const optimisticTargets = torrentsToUpdate
                .map((torrent) => {
                    const state = getOptimisticStateForAction(
                        action,
                        torrent
                    );
                    return state
                        ? ({ id: torrent.id, state } as const)
                        : null;
                })
                .filter((update): update is { id: string; state: TorrentStatus } =>
                    Boolean(update)
                );
            if (optimisticTargets.length) {
                updateOptimisticStatuses(optimisticTargets);
            }

            let succeeded = false;
            try {
                for (const torrent of torrentsToUpdate) {
                    await executeTorrentAction(action, torrent);
                }
                succeeded = true;
            } catch {
                showFeedback(t("toolbar.feedback.failed"), "danger");
                if (optimisticTargets.length) {
                    updateOptimisticStatuses(
                        optimisticTargets.map(({ id }) => ({ id }))
                    );
                }
            } finally {
            }

            return succeeded;
        },
        [
            executeTorrentAction,
            getOptimisticStateForAction,
            showFeedback,
            t,
            updateOptimisticStatuses,
        ]
    );

    const confirmDelete = useCallback(async () => {
        if (!pendingDelete) return;
        const { torrents: toDelete, action, deleteData } = pendingDelete;
        setPendingDelete(null);
        const count = toDelete.length;
        const hasFeedback =
            action in GLOBAL_ACTION_FEEDBACK_CONFIG;
        const actionKey = action as FeedbackAction;
        if (hasFeedback) {
            announceAction(actionKey, "start", count);
        }
        for (const torrent of toDelete) {
            const options =
                action === "remove"
                    ? { deleteData }
                    : undefined;
            await executeTorrentAction(action, torrent, options);
        }
        if (hasFeedback) {
            announceAction(actionKey, "done", count);
        }
    }, [announceAction, executeTorrentAction, pendingDelete]);

    const handleTorrentAction = useCallback(
        async (action: TorrentTableAction, torrent: Torrent) => {
            if (action === "remove" || action === "remove-with-data") {
                requestDelete(
                    [torrent],
                    action,
                    action === "remove-with-data"
                );
                return;
            }
            const hasFeedback = action in GLOBAL_ACTION_FEEDBACK_CONFIG;
            const actionKey = action as FeedbackAction;
            if (hasFeedback) {
                announceAction(actionKey, "start", 1);
            }
            const success = await runActionsWithOptimism(action, [torrent]);
            if (hasFeedback && success) {
                announceAction(actionKey, "done", 1);
            }
        },
        [announceAction, requestDelete, runActionsWithOptimism]
    );

    const handleBulkAction = useCallback(
        async (action: TorrentTableAction) => {
            if (!selectedTorrents.length) return;
            const targets = [...selectedTorrents];
            if (action === "remove" || action === "remove-with-data") {
                requestDelete(
                    targets,
                    action,
                    action === "remove-with-data"
                );
                return;
            }
            const hasFeedback = action in GLOBAL_ACTION_FEEDBACK_CONFIG;
            const actionKey = action as FeedbackAction;
            if (hasFeedback) {
                announceAction(actionKey, "start", targets.length);
            }
            const success = await runActionsWithOptimism(action, targets);
            if (hasFeedback && success) {
                announceAction(actionKey, "done", targets.length);
            }
        },
        [announceAction, requestDelete, runActionsWithOptimism, selectedTorrents]
    );

    const verifyingTorrents = torrents.filter(
        (torrent) => torrent.state === "checking"
    );
    const rehashStatus: RehashStatus | undefined =
        verifyingTorrents.length > 0
            ? {
                  active: true,
                  value:
                      Math.min(
                          Math.max(
                              verifyingTorrents.reduce(
                                  (acc, torrent) =>
                                      acc + (torrent.progress ?? 0),
                                  0
                              ) / verifyingTorrents.length,
                              0
                          ),
                          1
                      ) * 100,
                  label:
                      verifyingTorrents.length === 1
                          ? t("toolbar.rehash_progress.single", {
                                name: verifyingTorrents[0].name,
                            })
                          : t("toolbar.rehash_progress.multiple", {
                                count: verifyingTorrents.length,
                            }),
              }
            : undefined;

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
        [
            refreshSessionStatsData,
            torrentClient,
            refreshTorrents,
            reportRpcStatus,
        ]
    );

    const handleAddModalClose = useCallback(() => {
        closeAddModal();
        setPendingTorrentFile(null);
        setIncomingMagnetLink(null);
    }, [closeAddModal, setPendingTorrentFile, setIncomingMagnetLink]);

    const handleSaveSettings = useCallback(
        async (config: SettingsConfig) => {
            setIsSettingsSaving(true);
            try {
                if (!torrentClient.updateSessionSettings) {
                    throw new Error(
                        "Session settings not supported by this client"
                    );
                }
                await torrentClient.updateSessionSettings(
                    mapConfigToSession(config)
                );
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
        [
            refreshSessionStatsData,
            torrentClient,
            refreshTorrents,
            reportRpcStatus,
        ]
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
        if (!sessionReady || !detailId) return;
        void refreshDetailData();
        const intervalId = window.setInterval(() => {
            void refreshDetailData();
        }, DETAIL_REFRESH_INTERVAL_MS);
        return () => {
            window.clearInterval(intervalId);
        };
    }, [detailId, refreshDetailData, sessionReady]);

    useEffect(() => {
        setOptimisticStatuses((prev) => {
            const next = { ...prev };
            torrents.forEach((torrent) => {
                const optimisticState = prev[torrent.id];
                if (!optimisticState) return;
                if (torrent.state === optimisticState.state) {
                    delete next[torrent.id];
                }
            });
            return next;
        });
    }, [torrents]);

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
                    setSettingsConfig(
                        mergeWithUserPreferences(mapSessionToConfig(session))
                    );
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
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-fixed opacity-20" />
                <div className="absolute top-[-10%] right-[-5%] h-[500px] w-[500px] rounded-full bg-foreground/15 blur-[120px] opacity-80" />
                <div className="absolute bottom-[-10%] left-[-5%] h-[500px] w-[500px] rounded-full bg-foreground/10 blur-[120px] opacity-60" />
            </div>

            <AnimatePresence>
                {rpcStatus === "error" && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={TOAST_SPRING_TRANSITION}
                        className="fixed bottom-6 right-6 z-40"
                    >
                        <Button
                            size="sm"
                            variant="flat"
                            color="warning"
                            onPress={handleReconnect}
                        >
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
                hasSelection={selectedTorrents.length > 0}
                onResumeSelection={() => {
                    void handleBulkAction("resume");
                }}
                onPauseSelection={() => {
                    void handleBulkAction("pause");
                }}
                onRecheckSelection={() => {
                    void handleBulkAction("recheck");
                }}
                onRemoveSelection={() => {
                    void handleBulkAction("remove");
                }}
                actionFeedback={globalActionFeedback}
                rehashStatus={rehashStatus}
            />

            <Modal
                isOpen={Boolean(pendingDelete)}
                onOpenChange={(open) => {
                    if (!open) setPendingDelete(null);
                }}
                size="sm"
                backdrop="blur"
                motionProps={{
                    initial: { opacity: 0, scale: 0.96, y: 8 },
                    animate: { opacity: 1, scale: 1, y: 0 },
                    exit: { opacity: 0, scale: 0.96, y: 8 },
                    transition: MODAL_SPRING_TRANSITION,
                }}
                classNames={{
                    base: "glass-panel bg-content1/80 backdrop-blur-2xl border border-content1/20 shadow-xl rounded-2xl",
                }}
            >
                <ModalContent>
                    {() => (
                        <>
                            <ModalHeader>
                                {t("toolbar.delete_confirm.title")}
                            </ModalHeader>
                            <ModalBody className="text-sm text-foreground/70">
                                {t(
                                    pendingDelete?.deleteData
                                        ? "toolbar.delete_confirm.description_with_data"
                                        : "toolbar.delete_confirm.description",
                                    { count: pendingDelete?.torrents.length ?? 0 }
                                )}
                            </ModalBody>
                            <ModalFooter className="flex justify-end gap-3">
                                <Button
                                    variant="light"
                                    onPress={() => setPendingDelete(null)}
                                >
                                    {t("modals.cancel")}
                                </Button>
                                <Button
                                    color="danger"
                                    onPress={confirmDelete}
                                    className="shadow-danger/30"
                                >
                                    {pendingDelete?.deleteData
                                        ? t("table.actions.remove_with_data")
                                        : t("table.actions.remove")}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            <main className="flex-1 min-h-0 flex flex-col">
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
                optimisticStatuses={optimisticStatuses}
                isDropActive={isDragActive}
                onSelectionChange={handleSelectionChange}
            />
            <StatusBar
                sessionStats={sessionStats}
                downHistory={downHistory}
                upHistory={upHistory}
                rpcStatus={rpcStatus}
                selectedTorrent={detailData ?? undefined}
                actionFeedback={globalActionFeedback}
            />
            </main>
            <AddTorrentModal
                isOpen={isAddModalOpen}
                onClose={handleAddModalClose}
                initialFile={pendingTorrentFile}
                initialMagnetLink={incomingMagnetLink ?? undefined}
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
