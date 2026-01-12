import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
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
import { useAddModalState } from "./hooks/useAddModalState";
import { useAddTorrent } from "./hooks/useAddTorrent";
import { useSettingsFlow } from "./hooks/useSettingsFlow";
import { useSessionStats } from "./hooks/useSessionStats";
import { useTorrentWorkflow } from "./hooks/useTorrentWorkflow";
import { useActionFeedback } from "./hooks/useActionFeedback";
import { useHudCards } from "./hooks/useHudCards";
import { useTorrentData } from "@/modules/dashboard/hooks/useTorrentData";
import { useTorrentDetail } from "@/modules/dashboard/hooks/useTorrentDetail";
import { useDetailControls } from "@/modules/dashboard/hooks/useDetailControls";
import { useRecoveryController } from "@/modules/dashboard/hooks/useRecoveryController";
import { useTorrentActions } from "@/modules/dashboard/hooks/useTorrentActions";
import {
    classifyMissingFilesState,
    runMissingFilesRecoverySequence,
} from "@/services/recovery/recovery-controller";
import { deriveMissingFilesStateKind } from "@/shared/utils/recoveryFormat";
import { interpretFsError } from "@/shared/utils/fsErrors";
import type { RecoveryOutcome } from "@/services/recovery/recovery-controller";
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
import type {
    RecoveryGateAction,
    RecoveryGateCallback,
    RecoveryGateOutcome,
} from "@/app/types/recoveryGate";
import type { RehashStatus } from "./types/workspace";
import type {
    DetailTab,
    PeerSortStrategy,
} from "@/modules/dashboard/types/torrentDetail";
import type { ServerClass } from "@/services/rpc/entities";
import {
    AddTorrentModal,
    type AddTorrentSelection,
    type AddTorrentSource,
} from "@/modules/torrent-add/components/AddTorrentModal";
import { AddMagnetModal } from "@/modules/torrent-add/components/AddMagnetModal";
import { normalizeMagnetLink } from "@/app/utils/magnet";
import { parseTorrentFile, type TorrentMetadata } from "@/shared/utils/torrent";
import { readTorrentFileAsMetainfoBase64 } from "@/modules/torrent-add/services/torrent-metainfo";

interface FocusControllerProps {
    selectedTorrents: Torrent[];
    activeTorrentId: string | null;
    detailData: TorrentDetail | null;
    requestDetails: (torrent: Torrent) => Promise<void>;
    closeDetail: () => void;
}

function FocusController({
    selectedTorrents,
    activeTorrentId,
    detailData,
    requestDetails,
    closeDetail,
}: FocusControllerProps) {
    const { setActivePart } = useFocusState();

    const toggleInspector = useCallback(async () => {
        if (detailData) {
            closeDetail();
            setActivePart("table");
            return;
        }

        const targetTorrent =
            selectedTorrents.find(
                (torrent) => torrent.id === activeTorrentId
            ) ?? selectedTorrents[0];
        if (!targetTorrent) return;

        setActivePart("inspector");
        await requestDetails(targetTorrent);
    }, [
        activeTorrentId,
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

const getRecoveryFingerprint = (torrent: Torrent | TorrentDetail) =>
    torrent.errorEnvelope?.fingerprint ??
    torrent.hash ??
    torrent.id ??
    "<no-recovery-fingerprint>";

type PathNeededReason = Extract<
    RecoveryOutcome,
    { kind: "path-needed" }
>["reason"];

const derivePathReason = (errorClass?: string | null): PathNeededReason => {
    switch (errorClass) {
        case "permissionDenied":
            return "unwritable";
        case "diskFull":
            return "disk-full";
        case "missingFiles":
            return "missing";
        default:
            return "missing";
    }
};

const LAST_DOWNLOAD_DIR_KEY = "tt-add-last-download-dir";

export default function App() {
    const { t } = useTranslation();
    const torrentClient = useTorrentClient();
    const torrentClientRef = useRef<EngineAdapter | null>(null);
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
        isReady,
    } = useTransmissionSession(torrentClient);
    const [serverClass, setServerClass] = useState<ServerClass>("unknown");
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

    useEffect(() => {
        let active = true;
        if (rpcStatus !== STATUS.connection.CONNECTED) {
            if (active) {
                setServerClass("unknown");
            }
            return () => {
                active = false;
            };
        }

        const updateServerClass = async () => {
            try {
                await torrentClient.getExtendedCapabilities?.();
            } catch {
                // Ignore capability refresh errors; fallback to existing value.
            }
            if (!active) return;
            setServerClass(torrentClient.getServerClass?.() ?? "unknown");
        };

        void updateServerClass();
        return () => {
            active = false;
        };
    }, [rpcStatus, torrentClient]);

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

    const isNativeHost = Runtime.isNativeHost;
    const isRunningNative = isNativeHost || serverClass === "tinytorrent";

    const [lastDownloadDir, setLastDownloadDir] = useState(() => {
        if (typeof window === "undefined") {
            return "";
        }
        return window.localStorage.getItem(LAST_DOWNLOAD_DIR_KEY) ?? "";
    });

    const { isSettingsOpen, openSettings, closeSettings } =
        useWorkspaceModals();

    const [addSource, setAddSource] = useState<AddTorrentSource | null>(null);
    const [isResolvingMagnet, setIsResolvingMagnet] = useState(false);
    const [isFinalizingExisting, setIsFinalizingExisting] = useState(false);
    const [isMagnetModalOpen, setMagnetModalOpen] = useState(false);
    const [magnetModalInitialValue, setMagnetModalInitialValue] = useState("");
    const torrentFilePickerRef = useRef<HTMLInputElement | null>(null);

    const openAddTorrentPicker = useCallback(() => {
        torrentFilePickerRef.current?.click();
    }, []);

    const openAddMagnet = useCallback((magnetLink?: string) => {
        const normalized = magnetLink
            ? normalizeMagnetLink(magnetLink)
            : undefined;
        const initialValue = normalized ?? magnetLink ?? "";
        setMagnetModalInitialValue(initialValue);
        setMagnetModalOpen(true);
    }, []);

    // Settings snapshot ref: allows handlers declared earlier to read current settings
    const settingsConfigRef = useRef<{
        start_added_torrents: boolean;
        download_dir: string;
    }>({
        start_added_torrents: false,
        download_dir: "",
    });

    const handleMagnetModalClose = useCallback(() => {
        setMagnetModalOpen(false);
        setMagnetModalInitialValue("");
    }, []);

    const handleMagnetSubmit = useCallback(
        async (link: string) => {
            const normalized = normalizeMagnetLink(link);
            if (!normalized) return;
            setMagnetModalOpen(false);
            setMagnetModalInitialValue("");

            // Auto-add magnet links and obey the user's "start added torrents" setting.
            const startNow = Boolean(
                settingsConfigRef.current.start_added_torrents
            );
            const defaultDir =
                lastDownloadDir || settingsConfigRef.current.download_dir;
            try {
                await torrentClient.addTorrent({
                    magnetLink: normalized,
                    paused: !startNow,
                    downloadDir: defaultDir,
                });
                // Use the ref which will be updated after `refreshTorrents` is declared
                try {
                    void refreshTorrentsRef.current?.();
                } catch {
                    // ignore refresh errors
                }
            } catch (err) {
                // Log failure; per spec we do not open the full AddTorrent modal for magnets.
                // eslint-disable-next-line no-console
                console.error("Failed to add magnet", err);
            }
        },
        [lastDownloadDir, torrentClient]
    );

    const openAddTorrentFromFile = useCallback(async (file: File) => {
        try {
            const metadata = await parseTorrentFile(file);
            setAddSource({
                kind: "file",
                file,
                metadata,
                label: metadata.name ?? file.name,
            });
        } catch {
            // Ignore parse errors; Add Torrent window cannot open without metadata.
        }
    }, []);

    const addModalState = useAddModalState({
        onOpenAddMagnet: openAddMagnet,
        onOpenAddTorrentFromFile: openAddTorrentFromFile,
    });

    const { getRootProps, getInputProps, isDragActive } = addModalState;

    const isMountedRef = useRef(false);
    const uiReadyNotifiedRef = useRef(false);

    const { sessionStats, refreshSessionStatsData, liveTransportStatus } =
        useSessionStats({
            torrentClient,
            reportReadError,
            isMountedRef,
            sessionReady: rpcStatus === STATUS.connection.CONNECTED,
        });

    // Workbench zoom: initialize global scale hook
    const { increase, decrease, reset, setScale } = useWorkbenchScale();

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

    useEffect(() => {
        // keep a snapshot ref of current settings for early-declared handlers
        settingsConfigRef.current = {
            start_added_torrents: settingsStartAdded,
            download_dir: lastDownloadDir || settingsDownloadDir,
        };
    }, [lastDownloadDir, settingsDownloadDir, settingsStartAdded]);

    useEffect(() => {
        if (lastDownloadDir || !settingsDownloadDir) return;
        setLastDownloadDir(settingsDownloadDir);
    }, [lastDownloadDir, settingsDownloadDir]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (lastDownloadDir) {
            window.localStorage.setItem(LAST_DOWNLOAD_DIR_KEY, lastDownloadDir);
            return;
        }
        window.localStorage.removeItem(LAST_DOWNLOAD_DIR_KEY);
    }, [lastDownloadDir]);

    useEffect(() => {
        if (!lastDownloadDir) return;
        settingsFlow.setSettingsConfig((prev) => {
            if (prev.download_dir === lastDownloadDir) {
                return prev;
            }
            return { ...prev, download_dir: lastDownloadDir };
        });
    }, [lastDownloadDir, settingsFlow.setSettingsConfig]);

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

    const [recoverySession, setRecoverySession] = useState<{
        torrent: Torrent | TorrentDetail;
        action: RecoveryGateAction;
        outcome?: RecoveryOutcome | null;
    } | null>(null);
    const recoveryResolverRef = useRef<
        ((result: RecoveryGateOutcome) => void) | null
    >(null);
    const recoveryFingerprintRef = useRef<string | null>(null);
    const recoveryPromiseRef = useRef<Promise<RecoveryGateOutcome> | null>(
        null
    );

    const runMissingFilesFlow = useCallback(
        async (
            torrent: Torrent | TorrentDetail,
            options?: { recreateFolder?: boolean }
        ) => {
            const client = torrentClientRef.current;
            const envelope = torrent.errorEnvelope;
            if (!client || !envelope) return null;
            const classification = classifyMissingFilesState(
                envelope,
                torrent.savePath ?? torrent.downloadDir ?? "",
                serverClass
            );
            try {
                return await runMissingFilesRecoverySequence({
                    client,
                    torrent,
                    envelope,
                    classification,
                    serverClass,
                    options,
                });
            } catch (err) {
                console.error("missing files recovery flow failed", err);
                throw err;
            }
        },
        [serverClass]
    );

    const requestRecovery: RecoveryGateCallback = useCallback(
        async ({ torrent, action, options }) => {
            const envelope = torrent.errorEnvelope;
            if (!envelope) return null;
            if (action === "setLocation") return null;

            let blockingOutcome: RecoveryOutcome | null = null;
            try {
                const flowResult = await runMissingFilesFlow(torrent, options);
                if (flowResult?.status === "resolved") {
                    console.info(
                        `[tiny-torrent][recovery] ${action} executed recovery for torrent=${torrent.id}`
                    );
                    return { status: "handled" };
                }
                if (flowResult?.status === "needsModal") {
                    blockingOutcome = flowResult.blockingOutcome ?? null;
                }
            } catch (err) {
                console.error("recovery flow failed", err);
                blockingOutcome = {
                    kind: "path-needed",
                    reason: derivePathReason(envelope.errorClass),
                };
            }

            if (!blockingOutcome) {
                return null;
            }

            if (action === "recheck") {
                return { status: "continue" };
            }

            const fingerprint = getRecoveryFingerprint(torrent);
            const activeFingerprint = recoveryFingerprintRef.current;
            if (activeFingerprint) {
                if (activeFingerprint === fingerprint) {
                    return recoveryPromiseRef.current ?? null;
                }
                return { status: "cancelled" };
            }
            if (recoveryResolverRef.current) {
                return { status: "cancelled" };
            }
            const promise = new Promise<RecoveryGateOutcome>((resolve) => {
                recoveryResolverRef.current = resolve;
                setRecoverySession({
                    torrent,
                    action,
                    outcome: blockingOutcome,
                });
            });
            recoveryFingerprintRef.current = fingerprint;
            recoveryPromiseRef.current = promise;
            return promise;
        },
        [runMissingFilesFlow]
    );

    const {
        recoveryCallbacks,
        isBusy: isRecoveryBusy,
        lastOutcome: lastRecoveryOutcome,
    } = useRecoveryController({
        client: torrentClient,
        detail: recoverySession?.torrent ?? null,
        envelope: recoverySession?.torrent?.errorEnvelope ?? null,
        requestRecovery,
    });

    const finalizeRecovery = useCallback((result: RecoveryGateOutcome) => {
        const resolver = recoveryResolverRef.current;
        recoveryResolverRef.current = null;
        recoveryFingerprintRef.current = null;
        recoveryPromiseRef.current = null;
        setRecoverySession(null);
        resolver?.(result);
    }, []);

    const interpretRecoveryOutcome = useCallback(
        (
            action: RecoveryGateAction,
            outcome: RecoveryOutcome | null | undefined
        ): RecoveryGateOutcome | null => {
            if (!outcome) return null;
            switch (outcome.kind) {
                case "resolved":
                case "noop":
                    return { status: "continue" };
                case "verify-started":
                    return action === "recheck"
                        ? { status: "handled" }
                        : { status: "continue" };
                case "reannounce-started":
                    return { status: "continue" };
                case "path-needed":
                    return null;
                case "error":
                    return { status: "cancelled" };
                default:
                    return { status: "continue" };
            }
        },
        []
    );

    const handleRecoveryOutcome = useCallback(
        (outcome: RecoveryOutcome | null | undefined) => {
            if (!recoverySession) return;
            const result = interpretRecoveryOutcome(
                recoverySession.action,
                outcome
            );
            if (result) {
                finalizeRecovery(result);
            }
        },
        [finalizeRecovery, interpretRecoveryOutcome, recoverySession]
    );

    const runRecoveryOperation = useCallback(
        async (operation?: () => Promise<RecoveryOutcome>) => {
            if (!operation) return;
            const outcome = await operation();
            handleRecoveryOutcome(outcome);
        },
        [handleRecoveryOutcome]
    );

    const handleRecoveryClose = useCallback(() => {
        if (!recoveryResolverRef.current) return;
        finalizeRecovery({ status: "cancelled" });
    }, [finalizeRecovery]);

    const isDetailRecoveryBlocked = useMemo(() => {
        if (!detailData || !recoverySession) return false;
        return (
            getRecoveryFingerprint(detailData) ===
            getRecoveryFingerprint(recoverySession.torrent)
        );
    }, [detailData, recoverySession]);

    const choosePathViaNativeShell = useCallback(
        async (initialPath?: string | null) => {
            if (!NativeShell.isAvailable) {
                return null;
            }
            try {
                return (
                    (await NativeShell.openFolderDialog(
                        initialPath ?? undefined
                    )) ?? null
                );
            } catch {
                return null;
            }
        },
        []
    );

    const recoveryRequestBrowse = useCallback(
        async (currentPath?: string | null) => {
            // Picker-only: do not fall back to free-form text input.
            const nativePath = await choosePathViaNativeShell(currentPath);
            return nativePath ?? null;
        },
        [choosePathViaNativeShell, t]
    );

    const handleRecoveryPickPath = useCallback(
        async (path: string) => {
            if (!recoveryCallbacks?.handlePickPath) return;
            await runRecoveryOperation(() =>
                recoveryCallbacks.handlePickPath(path)
            );
        },
        [recoveryCallbacks?.handlePickPath, runRecoveryOperation]
    );

    const executeRetryFetch = useCallback(
        async (target: Torrent | TorrentDetail) => {
            const client = torrentClientRef.current;
            if (!client) return;
            // Retry must be probe-only: request the recovery gate with retryOnly
            // so the controller performs availability probing without mutating
            // engine state (no verify, reannounce, resume, or set-location).
            const gateResult = await requestRecovery({
                torrent: target,
                action: "recheck",
                options: { recreateFolder: false, retryOnly: true },
            });

            // Per spec, Retry should not open the modal automatically; if the
            // gate returned a non-continue status, we simply return.
            if (gateResult && gateResult.status !== "continue") {
                return;
            }

            // Refresh UI state so any updated classification from the probe
            // is visible to the user. Do NOT perform any engine mutations here.
            try {
                await refreshTorrentsRef.current?.();
                await refreshSessionStatsDataRef.current?.();
                if (detailData?.id === target.id) {
                    await refreshDetailData();
                }
            } catch (err) {
                console.error("refresh after retry probe failed", err);
            }
        },
        [requestRecovery, refreshDetailData]
    );

    const handleRecoveryRetry = useCallback(async () => {
        if (!recoverySession?.torrent) return;
        await executeRetryFetch(recoverySession.torrent);
        handleRecoveryClose();
    }, [executeRetryFetch, recoverySession, handleRecoveryClose]);

    const { announceAction, showFeedback } = useActionFeedback();

    const { executeTorrentAction, handleOpenFolder, executeBulkRemove } =
        useTorrentActions({
            torrentClient,
            queueActions,
            refreshTorrents,
            refreshDetailData,
            refreshSessionStatsData,
            reportCommandError,
            isMountedRef,
            requestRecovery,
            showFeedback,
        });

    const { handleAddTorrent, isAddingTorrent } = useAddTorrent({
        torrentClient,
        refreshTorrents,
        refreshSessionStatsData,
        reportCommandError,
        isMountedRef,
        addGhostTorrent,
        removeGhostTorrent,
    });

    const [filter, setFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTorrents, setSelectedTorrents] = useState<Torrent[]>([]);
    const [activeTorrentId, setActiveTorrentId] = useState<string | null>(null);
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

    useHotkeys(
        "shift+=,numpadadd",
        (event) => {
            if (addSource || isMagnetModalOpen) return;
            event.preventDefault();
            openAddTorrentPicker();
        },
        {
            enableOnFormTags: false,
            enableOnContentEditable: false,
        },
        [addSource, isMagnetModalOpen, openAddTorrentPicker]
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
                onSelect: openAddTorrentPicker,
            },
            {
                id: "add-magnet",
                group: actionGroup,
                title: t("command_palette.actions.add_magnet"),
                description: t(
                    "command_palette.actions.add_magnet_description"
                ),
                onSelect: () => openAddMagnet(),
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
                onSelect: () => setFilter(STATUS.torrent.DOWNLOADING),
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
        openAddMagnet,
        openAddTorrentPicker,
        openSettings,
        refreshTorrents,
        setFilter,
        t,
    ]);

    const {
        optimisticStatuses,
        pendingDelete,
        confirmDelete,
        clearPendingDelete,
    } = useTorrentWorkflow({
        torrents,
        selectedTorrents,
        executeTorrentAction,
        executeBulkRemove,
        announceAction,
        showFeedback,
    });

    const actions = useTorrentActionsContext();

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

    const handleSelectionChange = useCallback((selection: Torrent[]) => {
        setSelectedTorrents(selection);
    }, []);

    const handleActiveRowChange = useCallback((torrent: Torrent | null) => {
        if (!torrent) return;
        setActiveTorrentId(torrent.id);
    }, []);

    const handleInspectorTabCommandHandled = useCallback(() => {
        setInspectorTabCommand(null);
    }, []);

    const handleRequestDetails = useCallback(
        async (torrent: Torrent) => {
            setActiveTorrentId(torrent.id);
            await loadDetail(torrent.id, {
                ...torrent,
                trackers: [],
                files: [],
                peers: [],
            } as TorrentDetail);
        },
        [loadDetail]
    );

    useEffect(() => {
        if (!activeTorrentId) {
            return;
        }
        if (!detailData || detailData.id === activeTorrentId) {
            return;
        }
        const activeTorrent =
            selectedTorrents.find(
                (torrent) => torrent.id === activeTorrentId
            ) ?? null;
        void loadDetail(
            activeTorrentId,
            activeTorrent
                ? ({
                      ...activeTorrent,
                      trackers: [],
                      files: [],
                      peers: [],
                  } as TorrentDetail)
                : undefined
        );
    }, [
        activeTorrentId,
        clearDetail,
        detailData,
        loadDetail,
        selectedTorrents,
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
                        onSelect: () =>
                            selectedTorrents.forEach(
                                (t) =>
                                    void actions.executeTorrentAction(
                                        "pause",
                                        t
                                    )
                            ),
                    },
                    {
                        id: "context.resume_selected",
                        group: contextGroup,
                        title: t("command_palette.actions.resume_selected"),
                        description: t(
                            "command_palette.actions.resume_selected_description"
                        ),
                        onSelect: () =>
                            selectedTorrents.forEach(
                                (t) =>
                                    void actions.executeTorrentAction(
                                        "resume",
                                        t
                                    )
                            ),
                    },
                    {
                        id: "context.recheck_selected",
                        group: contextGroup,
                        title: t("command_palette.actions.recheck_selected"),
                        description: t(
                            "command_palette.actions.recheck_selected_description"
                        ),
                        onSelect: () =>
                            selectedTorrents.forEach(
                                (t) =>
                                    void actions.executeTorrentAction(
                                        "recheck",
                                        t
                                    )
                            ),
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
        setActiveTorrentId(null);
        clearDetail();
    }, [clearDetail]);

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

        torrentClientRef.current = torrentClient;

        const detachUi = () => {
            try {
                void torrentClientRef.current?.notifyUiDetached?.();
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

    // Re-download idempotency guard per-fingerprint
    const redownloadInFlight = useRef<Set<string>>(new Set());

    const findTorrentById = useCallback(
        (idOrHash?: string | null) => {
            if (!idOrHash) return null;
            const tableMatch =
                torrents.find(
                    (t) => t.id === idOrHash || t.hash === idOrHash
                ) ?? null;
            if (tableMatch) return tableMatch;
            if (
                detailData &&
                (detailData.id === idOrHash || detailData.hash === idOrHash)
            ) {
                return detailData;
            }
            return null;
        },
        [detailData, torrents]
    );

    // set-location flow moved into TorrentActionsProvider (provider owns engine interactions)

    const refreshAfterRecovery = useCallback(
        async (target: Torrent | TorrentDetail) => {
            await refreshTorrentsRef.current?.();
            await refreshSessionStatsDataRef.current?.();
            if (detailData?.id === target.id) {
                await refreshDetailData();
            }
        },
        [detailData, refreshDetailData]
    );

    const executeRedownload = useCallback(
        async (
            target: Torrent | TorrentDetail,
            options?: { recreateFolder?: boolean }
        ) => {
            const key =
                target.errorEnvelope?.fingerprint ??
                String(target.id ?? target.hash);
            if (redownloadInFlight.current.has(key)) {
                return;
            }
            redownloadInFlight.current.add(key);
            try {
                const gateResult = await requestRecovery({
                    torrent: target,
                    action: "redownload",
                    options,
                });
                if (gateResult && gateResult.status !== "continue") {
                    if (gateResult.status === "handled") {
                        showFeedback(
                            t("recovery.feedback.download_resumed"),
                            "info"
                        );
                        await refreshAfterRecovery(target);
                    }
                    return;
                }
            } catch (err) {
                reportCommandError?.(err);
            } finally {
                redownloadInFlight.current.delete(key);
            }
        },
        [
            refreshAfterRecovery,
            reportCommandError,
            requestRecovery,
            showFeedback,
            t,
        ]
    );

    const handleRecoveryRecreateFolder = useCallback(() => {
        if (!recoverySession?.torrent) {
            return Promise.resolve();
        }
        return executeRedownload(recoverySession.torrent, {
            recreateFolder: true,
        });
    }, [executeRedownload, recoverySession]);

    useEffect(() => {
        const handleRedownload = async (ev: Event) => {
            const ce = ev as CustomEvent & { detail?: any };
            const detail = ce?.detail ?? {};
            const idOrHash = detail.id ?? detail.hash;
            const target = findTorrentById(idOrHash);
            if (!target) return;
            await executeRedownload(target);
        };

        // set-location event handler removed; set-location handled by TorrentActionsProvider

        const handleRetryFetch = async (ev: Event) => {
            const ce = ev as CustomEvent & { detail?: any };
            const detail = ce?.detail ?? {};
            const idOrHash = detail.id ?? detail.hash;
            const target = findTorrentById(idOrHash);
            if (!target) return;
            await executeRetryFetch(target);
        };

        const handleResumeEvent = async (ev: Event) => {
            const ce = ev as CustomEvent & { detail?: any };
            const detail = ce?.detail ?? {};
            const idOrHash = detail.id ?? detail.hash;
            const target = findTorrentById(idOrHash);
            if (!target) return;
            await executeTorrentAction("resume", target);
        };

        const handleDismiss = async (ev: Event) => {
            const ce = ev as CustomEvent & { detail?: any };
            const detail = ce?.detail ?? {};
            const idOrHash = detail.id ?? detail.hash;
            const target = findTorrentById(idOrHash);
            const fp = target?.errorEnvelope?.fingerprint ?? null;
            if (!fp) return;
            // Per recovery contract, UI must not suppress engine prompts.
            // Do not call any dismissal automation; simply refresh torrent list
            // so UI reflects the current engine state.
            try {
                await refreshTorrentsRef.current?.();
            } catch (err) {
                console.error("refresh after dismiss failed", err);
            }
        };

        // NOTE: Recovery-related global event handlers removed to enforce
        // typed callbacks through the recovery controller and hook.
        const handleRemoveEvent = async (ev: Event) => {
            try {
                const ce = ev as CustomEvent;
                const detail = ce?.detail ?? {};
                const idOrHash = detail.id ?? detail.hash;
                const target = findTorrentById(idOrHash);
                if (!target) return;
                const client = torrentClientRef.current;
                if (!client) return;
                try {
                    await client.remove([target.id], false);
                    await refreshTorrentsRef.current?.();
                    // If the removed torrent is currently inspected, close the detail view
                    if (activeTorrentId === target.id) {
                        handleCloseDetail();
                    }
                } catch (err) {
                    reportCommandError?.(err);
                }
            } catch (err) {
                reportCommandError?.(err);
            }
        };

        const handleRedownloadEvent = async (ev: Event) => {
            try {
                const ce = ev as CustomEvent;
                const detail = ce?.detail ?? {};
                const idOrHash = detail.id ?? detail.hash;
                const target = findTorrentById(idOrHash);
                if (!target) return;
                await executeRedownload(target);
            } catch (err) {
                console.error(
                    "tiny-torrent:redownload event handler failed",
                    err
                );
            }
        };

        window.addEventListener(
            "tiny-torrent:remove",
            handleRemoveEvent as EventListener
        );
        window.addEventListener(
            "tiny-torrent:redownload",
            handleRedownloadEvent as EventListener
        );
        return () => {
            window.removeEventListener(
                "tiny-torrent:remove",
                handleRemoveEvent as EventListener
            );
            window.removeEventListener(
                "tiny-torrent:redownload",
                handleRedownloadEvent as EventListener
            );
        };
    }, [
        executeRedownload,
        executeRetryFetch,
        findTorrentById,
        executeTorrentAction,
        handleCloseDetail,
        activeTorrentId,
    ]);

    // legacy redownload handler removed — single idempotent handler exists above

    useEffect(() => {
        if (!detailData) {
            setPeerSortStrategy("none");
        }
    }, [detailData]);

    const handleReconnect = () => {
        reconnect();
    };

    const closeAddTorrentWindow = useCallback(() => {
        setAddSource(null);
    }, []);

    const handleTorrentPickerChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            if (!file) return;
            void openAddTorrentFromFile(file);
        },
        [openAddTorrentFromFile]
    );

    const resolveMagnetToMetadata = useCallback(
        async (
            magnetLink: string
        ): Promise<{ torrentId: string; metadata: TorrentMetadata } | null> => {
            const normalized = normalizeMagnetLink(magnetLink);
            if (!normalized) {
                return null;
            }

            setIsResolvingMagnet(true);
            let addedId: string | null = null;
            try {
                const targetDownloadDir =
                    lastDownloadDir || settingsFlow.settingsConfig.download_dir;
                const added = await torrentClient.addTorrent({
                    magnetLink: normalized,
                    paused: true,
                    downloadDir: targetDownloadDir,
                });
                addedId = added.id;

                // Wait for metadata via Heartbeat (timeout 30s)
                const metadata = await new Promise<TorrentMetadata | null>(
                    (resolve) => {
                        let timeoutId: number;
                        const sub = torrentClient.subscribeToHeartbeat({
                            mode: "detail",
                            detailId: added.id,
                            onUpdate: ({ detail }) => {
                                if (detail && (detail.files?.length ?? 0) > 0) {
                                    clearTimeout(timeoutId);
                                    sub.unsubscribe();
                                    resolve({
                                        name: detail.name,
                                        files: detail.files!.map((f) => ({
                                            path: f.name,
                                            length: f.length ?? 0,
                                        })),
                                    });
                                }
                            },
                            onError: () => {
                                // Keep waiting on transient errors, or fail?
                                // Let's keep waiting until timeout.
                            },
                        });

                        timeoutId = window.setTimeout(() => {
                            sub.unsubscribe();
                            resolve(null);
                        }, 30_000);
                    }
                );

                if (metadata) {
                    return { torrentId: added.id, metadata };
                }

                if (addedId) {
                    try {
                        await torrentClient.remove([addedId], false);
                    } catch {
                        // ignore cleanup failures
                    }
                }
                return null;
            } finally {
                setIsResolvingMagnet(false);
            }
        },
        [
            lastDownloadDir,
            settingsFlow.settingsConfig.download_dir,
            torrentClient,
        ]
    );
    useEffect(() => {
        if (
            !addSource ||
            addSource.kind !== "magnet" ||
            addSource.status !== "resolving" ||
            addSource.metadata ||
            isResolvingMagnet
        ) {
            return;
        }
        let active = true;
        const performResolution = async () => {
            const result = await resolveMagnetToMetadata(addSource.magnetLink);
            if (!active) return;
            if (result) {
                setAddSource((prev) =>
                    prev && prev.kind === "magnet"
                        ? {
                              ...prev,
                              status: "ready",
                              metadata: result.metadata,
                              torrentId: result.torrentId,
                              label: result.metadata.name ?? prev.label,
                          }
                        : prev
                );
            } else {
                setAddSource((prev) =>
                    prev && prev.kind === "magnet"
                        ? { ...prev, status: "error" }
                        : prev
                );
            }
        };
        void performResolution();
        return () => {
            active = false;
        };
    }, [addSource, isResolvingMagnet, resolveMagnetToMetadata]);

    const handleTorrentWindowCancel = useCallback(async () => {
        const draft = addSource;
        setAddSource(null);
        if (draft?.kind === "magnet" && draft.torrentId) {
            try {
                await torrentClient.remove([draft.torrentId], false);
            } catch {
                // Ignore cleanup errors; torrent might already be removed.
            }
        }
    }, [addSource, torrentClient]);

    const handleTorrentWindowConfirm = useCallback(
        async (selection: AddTorrentSelection) => {
            if (!addSource) return;

            const downloadDir = selection.downloadDir.trim();
            if (downloadDir) {
                setLastDownloadDir(downloadDir);
            }

            const startNow = selection.commitMode !== "paused";

            if (addSource.kind === "file") {
                const metainfo = await readTorrentFileAsMetainfoBase64(
                    addSource.file
                );
                if (!metainfo.ok) {
                    closeAddTorrentWindow();
                    return;
                }
                try {
                    await handleAddTorrent({
                        downloadDir,
                        startNow,
                        metainfo: metainfo.metainfoBase64,
                        filesUnwanted: selection.filesUnwanted,
                        priorityHigh: selection.priorityHigh,
                        priorityNormal: selection.priorityNormal,
                        priorityLow: selection.priorityLow,
                    });
                } finally {
                    closeAddTorrentWindow();
                }
                return;
            }

            setIsFinalizingExisting(true);
            try {
                if (addSource.torrentId && torrentClient.setTorrentLocation) {
                    await torrentClient.setTorrentLocation(
                        addSource.torrentId,
                        downloadDir,
                        true
                    );
                }
                if (addSource.torrentId && selection.filesUnwanted.length) {
                    await torrentClient.updateFileSelection(
                        addSource.torrentId,
                        selection.filesUnwanted,
                        false
                    );
                }
                if (startNow && addSource.torrentId) {
                    await torrentClient.resume([addSource.torrentId]);
                }
                closeAddTorrentWindow();
            } finally {
                setIsFinalizingExisting(false);
            }
        },
        [
            addSource,
            closeAddTorrentWindow,
            handleAddTorrent,
            torrentClient,
            setLastDownloadDir,
        ]
    );

    // Torrent actions are now owned by TorrentActionsProvider; no local value.

    return (
        <FocusProvider>
            <input
                ref={torrentFilePickerRef}
                type="file"
                accept=".torrent"
                onChange={handleTorrentPickerChange}
                className="hidden"
            />
            <FocusController
                selectedTorrents={selectedTorrents}
                activeTorrentId={activeTorrentId}
                detailData={detailData}
                requestDetails={handleRequestDetails}
                closeDetail={handleCloseDetail}
            />
            <LifecycleProvider>
                <TorrentActionsProvider>
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
                            openAddMagnet={() => openAddMagnet()}
                            openSettings={openSettings}
                            selectedTorrents={selectedTorrents}
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
                            handleSelectionChange={handleSelectionChange}
                            handleActiveRowChange={handleActiveRowChange}
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
                </TorrentActionsProvider>
            </LifecycleProvider>
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
                    onCancel={() => void handleTorrentWindowCancel()}
                    onConfirm={handleTorrentWindowConfirm}
                    onResolveMagnet={undefined}
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
        </FocusProvider>
    );
}
