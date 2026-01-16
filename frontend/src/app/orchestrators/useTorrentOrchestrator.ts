import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
    EngineAdapter,
    ServerCapabilities,
} from "@/services/rpc/engine-adapter";
import type { ServerClass } from "@/services/rpc/entities";
import type {
    AddTorrentSource,
    AddTorrentSelection,
} from "@/modules/torrent-add/components/AddTorrentModal";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import { useShellAgent } from "@/app/hooks/useShellAgent";
import { normalizeMagnetLink } from "@/app/utils/magnet";
import { useAddModalState } from "@/app/hooks/useAddModalState";
import type { SettingsConfig } from "@/modules/settings/data/config";
import type { FeedbackTone } from "@/shared/types/feedback";
import {
    classifyMissingFilesState,
    runMissingFilesRecoverySequence,
    probeMissingFiles,
    clearVerifyGuardEntry,
    pollPathAvailability,
    type RecoveryOutcome,
    type RecoverySequenceOptions,
} from "@/services/recovery/recovery-controller";
import { useRecoveryController } from "@/modules/dashboard/hooks/useRecoveryController";
import type {
    RecoveryGateAction,
    RecoveryGateCallback,
    RecoveryGateOutcome,
} from "@/app/types/recoveryGate";
import { useRequiredTorrentActions } from "@/app/context/TorrentActionsContext";
import { readTorrentFileAsMetainfoBase64 } from "@/modules/torrent-add/services/torrent-metainfo";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import {
    getProbe as getCachedProbe,
    setProbe as setCachedProbe,
    clearProbe as clearCachedProbe,
} from "@/services/recovery/missingFilesStore";
import STATUS from "@/shared/status";
import { useSelection } from "@/app/context/SelectionContext";
import type {
    ConnectionMode,
    InlineSetLocationState,
    SetLocationOutcome,
    SetLocationSurface,
} from "@/app/context/RecoveryContext";
import { resolveTorrentPath } from "@/modules/dashboard/utils/torrentPaths";
import { isLoopbackHost } from "@/app/utils/hosts";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const MAGNET_INFOHASH_REGEX = /xt=urn:btih:([0-9a-zA-Z]+)/i;

const base32ToHex = (value: string): string | null => {
    let buffer = 0;
    let bitsInBuffer = 0;
    const bytes: number[] = [];
    for (const char of value.toUpperCase()) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index === -1) {
            return null;
        }
        buffer = (buffer << 5) | index;
        bitsInBuffer += 5;
        while (bitsInBuffer >= 8) {
            bitsInBuffer -= 8;
            const byte = (buffer >> bitsInBuffer) & 0xff;
            bytes.push(byte);
        }
    }
    if (bytes.length !== 20) {
        return null;
    }
    return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const normalizeInfoHashCandidate = (value: string): string | null => {
    if (/^[0-9a-fA-F]{40}$/.test(value)) {
        return value.toLowerCase();
    }
    const decoded = base32ToHex(value);
    if (!decoded) return null;
    return decoded.toLowerCase();
};

const extractMagnetInfoHash = (magnetLink: string): string | null => {
    const match = MAGNET_INFOHASH_REGEX.exec(magnetLink);
    if (!match) return null;
    return normalizeInfoHashCandidate(match[1]);
};

const getTorrentKey = (torrent: Torrent | TorrentDetail) =>
    torrent.id?.toString() ?? torrent.hash ?? "";

// --- Types ---

export interface UseTorrentOrchestratorParams {
    client: EngineAdapter | null | undefined;
    clientRef: MutableRefObject<EngineAdapter | null>;
    refreshTorrentsRef: MutableRefObject<() => Promise<void>>;
    refreshSessionStatsDataRef: MutableRefObject<() => Promise<void>>;
    refreshDetailData: () => Promise<void>;
    torrents: Array<Torrent | TorrentDetail>;
    reportCommandError?: (error: unknown) => void;
    showFeedback: (message: string, tone: FeedbackTone) => void;
    detailData: TorrentDetail | null;
    rpcStatus: string;
    settingsFlow: {
        settingsConfig: SettingsConfig;
        setSettingsConfig: Dispatch<SetStateAction<SettingsConfig>>;
    };
    t: (key: string) => string;
    clearDetail: () => void;
    markRemoved: (key: string) => void;
    unmarkRemoved: (key: string) => void;
}
// TODO: Reduce cognitive load: `UseTorrentOrchestratorParams` is too wide and mixes unrelated responsibilities (RPC client, UI feedback, settings persistence, selection/remove state).
// TODO: Replace with a smaller, explicit contract, e.g.:
// TODO: - `deps.client`: { client, clientRef, rpcStatus }
// TODO: - `deps.data`: { torrents, detailData, refreshTorrents, refreshStats, refreshDetail }
// TODO: - `deps.ui`: { showFeedback, reportCommandError, t }
// TODO: - `deps.settings`: { settingsConfig, setSettingsConfig }
// TODO: - `deps.selection/remove`: move to a single “App view-model” owner (avoid passing markRemoved/unmarkRemoved/clearDetail into orchestrator)
// TODO: Also shrink orchestrator output: return grouped APIs (`addTorrent`, `recovery`, `setLocation`, `deleteFlow`, `uiMode`) instead of dozens of top-level fields.

// --- Helpers ---

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

const delay = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
const PICK_PATH_SUCCESS_DELAY_MS = 600;

const isRecoveryActiveState = (state?: string) => {
    if (!state) return false;
    const normalized = state.toLowerCase();
    return (
        normalized === STATUS.torrent.DOWNLOADING ||
        normalized === STATUS.torrent.SEEDING ||
        normalized === STATUS.torrent.QUEUED
    );
};

const LAST_DOWNLOAD_DIR_KEY = "tt-add-last-download-dir";
const PROBE_TTL_MS = 5000;

// --- Main Hook ---

export function useTorrentOrchestrator(params: UseTorrentOrchestratorParams) {
    // TODO: Architectural ownership (ViewModel):
    // TODO: - Treat this hook as a domain ViewModel/controller for torrents (add/remove/recovery/set-location), not a dumping ground for unrelated app wiring.
    // TODO: - Split into small internal modules/services with explicit ownership: `addTorrentController`, `recoveryController`, `setLocationController`, `deleteController`, `capabilityController`.
    // TODO: - Return a small, grouped API (objects) rather than dozens of top-level fields; AppContent should consume a single `useAppViewModel()` instead of destructuring everything here.
    const {
        client,
        clientRef,
        rpcStatus,
        settingsFlow,
        refreshTorrentsRef,
        refreshSessionStatsDataRef,
        refreshDetailData,
        detailData,
        torrents,
        showFeedback,
        reportCommandError,
        t,
        clearDetail,
        markRemoved,
        unmarkRemoved,
    } = params;
    const { settingsConfig, setSettingsConfig } = settingsFlow;
    const { dispatch } = useRequiredTorrentActions();
    const { setSelectedIds, setActiveId } = useSelection();
    const transportCapabilities =
        typeof client?.getServerCapabilities === "function"
            ? client.getServerCapabilities()
            : null;
    const { shellAgent, uiMode } = useShellAgent();
    const transportHost = transportCapabilities?.host ?? "";
    const serverClass = client?.getServerClass?.() ?? "unknown";
    // TODO: Deprecate `serverClass` for UX decisions. With “RPC extensions: NONE”, the daemon is Transmission RPC; UX must hinge on `uiMode` (Full|Rpc), not on daemon identity strings.
    const isLoopbackTransport = useMemo(
        () => isLoopbackHost(transportHost),
        [transportHost]
    );
    const shellAvailable = shellAgent.isAvailable;
    const hasNativeHostShell = useMemo(
        () => uiMode === "Full" && shellAvailable && isLoopbackTransport,
        [uiMode, shellAvailable, isLoopbackTransport]
    );
    // TODO: Replace `hasNativeHostShell/serverClass/connectionMode` with `uiMode = "Full" | "Rpc"` derived from:
    // TODO: - endpoint is loopback (localhost) AND ShellAgent/ShellExtensions bridge available => Full
    // TODO: - otherwise => Rpc
    // TODO: This removes “tinytorrent-*” string branching that confuses maintainers and AI.
    const setLocationCapability = useMemo(
        () => ({
            canBrowse: hasNativeHostShell,
            supportsManual: true,
        }),
        [hasNativeHostShell]
    );
    // TODO: Extract capability derivation (browse/manual/open folder) into a shared helper driven by adapter caps + host (Transmission-first, no serverClass branching); keep UI hooks oblivious to transport logic.
    const canOpenFolder = hasNativeHostShell;
    const pendingDeletionHashesRef = useRef<Set<string>>(new Set());
    const recentlyRemovedKeysRef = useRef<Set<string>>(new Set());
    const inlineOwnerRef = useRef<{ surface: SetLocationSurface; torrentKey: string } | null>(
        null
    );

    const connectionMode = useMemo<ConnectionMode>(() => {
        if (hasNativeHostShell) {
            return "tinytorrent-local-shell";
        }
        if (serverClass === "tinytorrent") {
            return "tinytorrent-remote";
        }
        return "transmission-remote";
    }, [hasNativeHostShell, serverClass]);

    // --- 2. Settings & Add Torrent Persistence ---
    const [lastDownloadDir, setLastDownloadDir] = useState(() => {
        if (typeof window === "undefined") return "";
        return window.localStorage.getItem(LAST_DOWNLOAD_DIR_KEY) ?? "";
    });

    const settingsConfigRef = useRef({
        start_added_torrents: false,
        download_dir: "",
    });

    useEffect(() => {
        settingsConfigRef.current = {
            start_added_torrents: settingsConfig.start_added_torrents,
            download_dir: lastDownloadDir || settingsConfig.download_dir,
        };
    }, [
        lastDownloadDir,
        settingsConfig.download_dir,
        settingsConfig.start_added_torrents,
    ]);

    useEffect(() => {
        if (lastDownloadDir || !settingsConfig.download_dir) return;
        setLastDownloadDir(settingsConfig.download_dir);
    }, [lastDownloadDir, settingsConfig.download_dir]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (lastDownloadDir) {
            window.localStorage.setItem(LAST_DOWNLOAD_DIR_KEY, lastDownloadDir);
        } else {
            window.localStorage.removeItem(LAST_DOWNLOAD_DIR_KEY);
        }
    }, [lastDownloadDir]);

    useEffect(() => {
        if (!lastDownloadDir) return;
        setSettingsConfig((prev) => {
            if (prev.download_dir === lastDownloadDir) return prev;
            return { ...prev, download_dir: lastDownloadDir };
        });
    }, [lastDownloadDir, setSettingsConfig]);

    // --- 3. Add Torrent / Magnet Logic ---
    const [addSource, setAddSource] = useState<AddTorrentSource | null>(null);
    const [isResolvingMagnet, setIsResolvingMagnet] = useState(false);
    const [isMagnetModalOpen, setMagnetModalOpen] = useState(false);
    const [magnetModalInitialValue, setMagnetModalInitialValue] = useState("");
    const [isFinalizingExisting, setIsFinalizingExisting] = useState(false); // needed for loading state

    const isMountedRef = useRef(false);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const openAddMagnet = useCallback((magnetLink?: string) => {
        const normalized =
            typeof magnetLink === "string"
                ? normalizeMagnetLink(magnetLink)
                : undefined;
        setMagnetModalInitialValue(normalized ?? "");
        setMagnetModalOpen(true);
    }, []);

    const openAddTorrentFromFile = useCallback(async (file: File) => {
        try {
            const { parseTorrentFile } = await import("@/shared/utils/torrent");
            const metadata = await parseTorrentFile(file);
            setAddSource({
                kind: "file",
                file,
                metadata,
                label: metadata.name ?? file.name,
            });
        } catch {
            // ignore
        }
    }, []);

    const addModalState = useAddModalState({
        onOpenAddMagnet: openAddMagnet,
        onOpenAddTorrentFromFile: openAddTorrentFromFile,
    });
    const { open: openDropzone } = addModalState;
    const openAddTorrentPicker = useCallback(() => {
        openDropzone();
    }, [openDropzone]);

    const handleMagnetModalClose = useCallback(() => {
        setMagnetModalOpen(false);
        setMagnetModalInitialValue("");
    }, []);

    const handleMagnetSubmit = useCallback(
        async (link: string) => {
            const normalized = normalizeMagnetLink(link);
            if (!normalized) return;
            const infoHash = extractMagnetInfoHash(normalized);
            if (infoHash && pendingDeletionHashesRef.current.has(infoHash)) {
                showFeedback(t("toolbar.feedback.pending_delete"), "warning");
                return;
            }
            setMagnetModalOpen(false);
            setMagnetModalInitialValue("");

            const startNow = Boolean(
                settingsConfigRef.current.start_added_torrents
            );
            const defaultDir =
                lastDownloadDir || settingsConfigRef.current.download_dir;

            try {
                await dispatch(
                    TorrentIntents.addMagnetTorrent(
                        normalized,
                        defaultDir,
                        !startNow
                    )
                );
            } catch (err) {
                console.error("Failed to add magnet", err);
            }
        },
        [dispatch, lastDownloadDir, showFeedback, t]
    );

    const closeAddTorrentWindow = useCallback(() => {
        setAddSource(null);
    }, []);

    const handleTorrentWindowConfirm = useCallback(
        async (selection: AddTorrentSelection) => {
            if (!addSource) return;
            const downloadDir = selection.downloadDir.trim();
            if (downloadDir) setLastDownloadDir(downloadDir);

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
                    await dispatch(
                        TorrentIntents.addTorrentFromFile(
                            metainfo.metainfoBase64,
                            downloadDir,
                            !startNow,
                            selection.filesUnwanted,
                            selection.priorityHigh,
                            selection.priorityNormal,
                            selection.priorityLow
                        )
                    );
                } finally {
                    closeAddTorrentWindow();
                }
                return;
            }

            // Magnet / Existing Finalization
            const targetId = addSource.torrentId;
            if (!targetId) {
                closeAddTorrentWindow();
                return;
            }
            setIsFinalizingExisting(true);
            try {
                await dispatch(
                    TorrentIntents.finalizeExistingTorrent(
                        targetId,
                        downloadDir,
                        selection.filesUnwanted,
                        startNow
                    )
                );
                closeAddTorrentWindow();
            } finally {
                setIsFinalizingExisting(false);
            }
        },
        [addSource, closeAddTorrentWindow, dispatch]
    );

    // --- 4. Recovery Orchestration ---
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
    const recoveryAbortControllerRef = useRef<AbortController | null>(null);
    const pendingRecoveryQueueRef = useRef<
        Array<{
            torrent: Torrent | TorrentDetail;
            action: RecoveryGateAction;
            outcome: RecoveryOutcome;
            fingerprint: string;
            promise: Promise<RecoveryGateOutcome>;
            resolve: (result: RecoveryGateOutcome) => void;
        }>
    >([]);
    // TODO: Move recovery queue + abort/cancel handling into the recovery controller layer so UI consumers just request recovery and observe state; avoid queue refs in UI hooks.
    const recoverySessionActiveRef = useRef(false);

    // TODO: Align recovery controller with the Recovery UX spec: single authoritative gate, deterministic state/confidence outputs (S1–S4 with certain/likely/unknown), and enforce Retry semantics = probe-only.
    const runMissingFilesFlow = useCallback(
        async (
            torrent: Torrent | TorrentDetail,
            options?: RecoverySequenceOptions,
            signal?: AbortSignal
        ) => {
            const activeClient = clientRef.current;
            const envelope = torrent.errorEnvelope;
            if (!activeClient || !envelope) return null;

            const classification = classifyMissingFilesState(
                envelope,
                torrent.savePath ?? torrent.downloadDir ?? "",
                serverClass,
                { torrentId: torrent.id ?? torrent.hash }
            );

            try {
                const missingBytes =
                    typeof torrent.leftUntilDone === "number"
                        ? torrent.leftUntilDone
                        : null;
                const id = torrent.id ?? torrent.hash;
                const cachedProbe = id ? getCachedProbe(id) : undefined;
                const isLocalEmpty =
                    serverClass === "tinytorrent" &&
                    cachedProbe?.kind === "data_missing" &&
                    cachedProbe.expectedBytes > 0 &&
                    cachedProbe.onDiskBytes === 0;
                const sequenceOptions: RecoverySequenceOptions = {
                    ...options,
                    missingBytes,
                    skipVerifyIfEmpty:
                        options?.skipVerifyIfEmpty ?? isLocalEmpty,
                    autoCreateMissingFolder:
                        options?.autoCreateMissingFolder ??
                        serverClass === "tinytorrent",
                };
                if (signal) {
                    sequenceOptions.signal = signal;
                }
                return await runMissingFilesRecoverySequence({
                    client: activeClient,
                    torrent,
                    envelope,
                    classification,
                    serverClass,
                    options: sequenceOptions,
                });
            } catch (err) {
                console.error("missing files recovery flow failed", err);
                throw err;
            }
        },
        [clientRef, serverClass]
    );

    const probeMissingFilesIfStale = useCallback(
        async (torrent: Torrent | TorrentDetail) => {
            const activeClient = clientRef.current;
            if (!activeClient) return;
            if (!torrent.errorEnvelope) return;
            const id = torrent.id ?? torrent.hash;
            if (!id) return;

            const cached = getCachedProbe(id);
            if (cached && Date.now() - cached.ts < PROBE_TTL_MS) {
                return;
            }

            try {
                const probe = await probeMissingFiles(
                    torrent,
                    activeClient,
                    serverClass
                );
                setCachedProbe(id, probe);
            } catch (err) {
                console.error("probeMissingFiles failed", err);
            }
        },
        [clientRef, serverClass]
    );

    // Lifecycle-driven probe scheduling: run probes for errored torrents when the list changes.
    const torrentsRef = useRef(torrents);

    useEffect(() => {
        torrentsRef.current = torrents;
    }, [torrents]);

    const volumeLossPollingRef = useRef(new Set<string>());

    useEffect(() => {
        const runProbe = () => {
            const errored = torrentsRef.current.filter(
                (torrent) =>
                    torrent.errorEnvelope !== undefined &&
                    torrent.errorEnvelope !== null
            );
            errored.forEach((torrent) => {
                void probeMissingFilesIfStale(torrent);
            });
        };
        runProbe();
        const interval = setInterval(runProbe, 5000);
        return () => clearInterval(interval);
    }, [probeMissingFilesIfStale]);

    useEffect(() => {
        torrents.forEach((torrent) => {
            if (torrent.state !== STATUS.torrent.CHECKING) {
                clearVerifyGuardEntry(getRecoveryFingerprint(torrent));
            }
        });
    }, [torrents]);

    useEffect(() => {
        if (!torrents.length) {
            pendingDeletionHashesRef.current.clear();
            return;
        }
        const activeHashes = new Set(
            torrents
                .map((torrent) => torrent.hash?.toLowerCase())
                .filter((hash): hash is string => Boolean(hash))
        );
        pendingDeletionHashesRef.current.forEach((hash) => {
            if (!activeHashes.has(hash)) {
                pendingDeletionHashesRef.current.delete(hash);
            }
        });
    }, [torrents]);

    useEffect(() => {
        if (!recentlyRemovedKeysRef.current.size) return;
        const activeKeys = new Set(
            torrents
                .map((torrent) => getTorrentKey(torrent))
                .filter((key): key is string => Boolean(key))
        );
        recentlyRemovedKeysRef.current.forEach((key) => {
            if (activeKeys.has(key)) {
                unmarkRemoved(key);
                recentlyRemovedKeysRef.current.delete(key);
            }
        });
    }, [torrents, unmarkRemoved]);

    const startRecoverySession = useCallback(
        (entry: {
            torrent: Torrent | TorrentDetail;
            action: RecoveryGateAction;
            outcome: RecoveryOutcome;
            fingerprint: string;
            promise: Promise<RecoveryGateOutcome>;
            resolve: (result: RecoveryGateOutcome) => void;
        }) => {
            recoveryAbortControllerRef.current?.abort();
            recoveryAbortControllerRef.current = new AbortController();
            setRecoverySession({
                torrent: entry.torrent,
                action: entry.action,
                outcome: entry.outcome,
            });
            recoveryResolverRef.current = entry.resolve;
            recoveryFingerprintRef.current = entry.fingerprint;
            recoveryPromiseRef.current = entry.promise;
        },
        []
    );
    // TODO: Model recovery flows as a simple state machine (idle -> awaiting-action -> resolving -> done) and expose via a small service to reduce scattered refs/queues that confuse implementers.

    const processNextRecoveryQueueEntry = useCallback(() => {
        if (recoverySession) return;
        const next = pendingRecoveryQueueRef.current.shift();
        if (!next) return;
        startRecoverySession(next);
    }, [recoverySession, startRecoverySession]);

    const createRecoveryQueueEntry = useCallback(
        (
            torrent: Torrent | TorrentDetail,
            action: RecoveryGateAction,
            outcome: RecoveryOutcome,
            fingerprint: string
        ) => {
            let resolver: (result: RecoveryGateOutcome) => void = () => {};
            const promise = new Promise<RecoveryGateOutcome>((resolve) => {
                resolver = resolve;
            });
            return {
                torrent,
                action,
                outcome,
                fingerprint,
                promise,
                resolve: resolver,
            };
        },
        []
    );

    const enqueueRecoveryEntry = useCallback(
        (entry: ReturnType<typeof createRecoveryQueueEntry>) => {
            if (!recoverySession) {
                startRecoverySession(entry);
                return entry.promise;
            }
            const duplicate = pendingRecoveryQueueRef.current.find(
                (pending) => pending.fingerprint === entry.fingerprint
            );
            if (duplicate) {
                return duplicate.promise;
            }
            pendingRecoveryQueueRef.current.push(entry);
            return entry.promise;
        },
        [recoverySession, startRecoverySession]
    );

    const requestRecovery: RecoveryGateCallback = useCallback(
        async ({ torrent, action, options }) => {
            const envelope = torrent.errorEnvelope;
            if (!envelope) return null;
            if (action === "setLocation") return null;

            let blockingOutcome: RecoveryOutcome | null = null;
            try {
                const flowResult = await runMissingFilesFlow(
                    torrent,
                    options,
                    recoveryAbortControllerRef.current?.signal
                );
                if (flowResult?.status === "resolved") {
                    clearVerifyGuardEntry(getRecoveryFingerprint(torrent));
                    if (torrent.id ?? torrent.hash) {
                        clearCachedProbe(torrent.id ?? torrent.hash);
                    }
                    return { status: "handled", log: flowResult.log };
                }
                if (flowResult?.status === "needsModal") {
                    blockingOutcome = flowResult.blockingOutcome ?? null;
                }
            } catch (err) {
                blockingOutcome = {
                    kind: "path-needed",
                    reason: derivePathReason(envelope.errorClass),
                };
            }

            if (!blockingOutcome) return null;
            if (action === "recheck") {
                return {
                    status: "handled",
                    blockingOutcome,
                };
            }

            const fingerprint = getRecoveryFingerprint(torrent);
            if (recoveryFingerprintRef.current === fingerprint) {
                return recoveryPromiseRef.current ?? null;
            }
            const entry = createRecoveryQueueEntry(
                torrent,
                action,
                blockingOutcome,
                fingerprint
            );
            return enqueueRecoveryEntry(entry);
        },
        [runMissingFilesFlow, createRecoveryQueueEntry, enqueueRecoveryEntry]
    );
    // TODO: Ensure gate deduplication/in-flight locking matches spec (one gate, one promise per torrent), and that confidence messaging for blockingOutcome drives user-friendly UI text.

    const finalizeRecovery = useCallback(
        (result: RecoveryGateOutcome) => {
            recoveryAbortControllerRef.current?.abort();
            recoveryAbortControllerRef.current = null;
            const resolver = recoveryResolverRef.current;
            recoveryResolverRef.current = null;
            recoveryFingerprintRef.current = null;
            recoveryPromiseRef.current = null;
            setRecoverySession(null);
            resolver?.(result);
            processNextRecoveryQueueEntry();
        },
        [processNextRecoveryQueueEntry]
    );

    const performUIActionDelete = useCallback(
        (torrent: Torrent, deleteData = false) => {
            const targetId = torrent.id ?? torrent.hash;
            const key = getTorrentKey(torrent);
            if (!targetId || !key) return;
            const normalizedHash = torrent.hash?.toLowerCase();
            if (normalizedHash) {
                pendingDeletionHashesRef.current.add(normalizedHash);
            }
            markRemoved(key);
            recentlyRemovedKeysRef.current.add(key);
            setSelectedIds([]);
            setActiveId(null);
            if (detailData && getTorrentKey(detailData) === key) {
                clearDetail();
            }
            const fingerprint = getRecoveryFingerprint(torrent);
            clearVerifyGuardEntry(fingerprint);
            clearCachedProbe(key);
            const pollKey = targetId;
            if (pollKey) {
                volumeLossPollingRef.current.delete(pollKey);
            }
            pendingRecoveryQueueRef.current =
                pendingRecoveryQueueRef.current.filter(
                    (entry) => entry.fingerprint !== fingerprint
                );
            if (
                recoverySession &&
                getRecoveryFingerprint(recoverySession.torrent) === fingerprint
            ) {
                finalizeRecovery({ status: "cancelled" });
            }
            void dispatch(
                TorrentIntents.ensureRemoved(targetId, deleteData)
            ).catch(() => {
                showFeedback(t("toolbar.feedback.failed"), "danger");
                unmarkRemoved(key);
            });
        },
        [
            clearDetail,
            detailData,
            dispatch,
            finalizeRecovery,
            recoverySession,
            setActiveId,
            setSelectedIds,
            showFeedback,
            t,
            markRemoved,
            unmarkRemoved,
        ]
    );

    const {
        recoveryCallbacks,
        isBusy: isRecoveryBusy,
        lastOutcome: lastRecoveryOutcome,
    } = useRecoveryController({
        client: client ?? null,
        detail: recoverySession?.torrent ?? null,
        envelope: recoverySession?.torrent?.errorEnvelope ?? null,
        requestRecovery,
        dispatch,
    });

    const refreshAfterRecovery = useCallback(
        async (target: Torrent | TorrentDetail) => {
            await refreshTorrentsRef.current?.();
            await refreshSessionStatsDataRef.current?.();
            if (detailData?.id === target.id) {
                await refreshDetailData();
            }
        },
        [
            detailData,
            refreshDetailData,
            refreshSessionStatsDataRef,
            refreshTorrentsRef,
        ]
    );

    type ResolveRecoverySessionOptions = RecoverySequenceOptions & {
        delayAfterSuccessMs?: number;
        notifyDriveDetected?: boolean;
    };

    const resolveRecoverySession = useCallback(
        async (
            torrent: Torrent | TorrentDetail,
            options?: ResolveRecoverySessionOptions
        ) => {
            try {
                const {
                    delayAfterSuccessMs,
                    notifyDriveDetected,
                    ...sequenceOptions
                } = options ?? {};
                const flowResult = await runMissingFilesFlow(
                    torrent,
                    sequenceOptions,
                    recoveryAbortControllerRef.current?.signal
                );
                if (!flowResult) return false;
                if (flowResult.status === "resolved") {
                    const targetKey = torrent.id ?? torrent.hash ?? "";
                    clearVerifyGuardEntry(getRecoveryFingerprint(torrent));
                    if (targetKey) {
                        clearCachedProbe(targetKey);
                    }
                    try {
                        await refreshAfterRecovery(torrent);
                    } catch (err) {
                        console.error("refresh after recovery failed", err);
                    }
                    if (notifyDriveDetected) {
                        showFeedback(
                            t("recovery.toast_drive_detected"),
                            "info"
                        );
                    }
                    const feedbackKey =
                        flowResult.log === "all_verified_resuming"
                            ? "recovery.feedback.all_verified_resuming"
                            : "recovery.feedback.download_resumed";
                    showFeedback(t(feedbackKey), "info");
                    if (delayAfterSuccessMs && delayAfterSuccessMs > 0) {
                        await delay(delayAfterSuccessMs);
                    }
                    finalizeRecovery({ status: "handled" });
                    return true;
                }
                if (flowResult.status === "needsModal") {
                    if (flowResult.blockingOutcome) {
                        setRecoverySession((prev) =>
                            prev
                                ? {
                                      ...prev,
                                      outcome: flowResult.blockingOutcome,
                                  }
                                : prev
                        );
                    }
                }
                return false;
            } catch (err) {
                console.error(
                    "recovery resolution failed for recreate/pick-path",
                    err
                );
                return false;
            }
        },
        [
            runMissingFilesFlow,
            refreshAfterRecovery,
            showFeedback,
            t,
            finalizeRecovery,
        ]
    );

    useEffect(() => {
        if (serverClass !== "tinytorrent") return;
        const checkInterval = 2000;
        const interval = setInterval(() => {
            const client = clientRef.current;
            const currentTorrents = torrentsRef.current;
            if (!client || !client.checkFreeSpace || !currentTorrents.length)
                return;
            currentTorrents.forEach((torrent) => {
                const id = torrent.id ?? torrent.hash;
                if (!id) return;
                if (volumeLossPollingRef.current.has(id)) return;
                if (
                    recoverySession &&
                    getRecoveryFingerprint(recoverySession.torrent) ===
                        getRecoveryFingerprint(torrent)
                ) {
                    return;
                }
                const downloadDir =
                    torrent.savePath ?? torrent.downloadDir ?? torrent.savePath;
                const classification = classifyMissingFilesState(
                    torrent.errorEnvelope ?? null,
                    downloadDir,
                    serverClass,
                    { torrentId: id }
                );
                if (classification.kind !== "volumeLoss") return;
                if (!downloadDir) return;
                volumeLossPollingRef.current.add(id);
                void pollPathAvailability(client, downloadDir).then((probe) => {
                    volumeLossPollingRef.current.delete(id);
                    if (probe.success && torrent.errorEnvelope) {
                        void resolveRecoverySession(torrent, {
                            notifyDriveDetected: true,
                        });
                    }
                });
            });
        }, checkInterval);
        return () => clearInterval(interval);
    }, [clientRef, recoverySession, resolveRecoverySession, serverClass]);

    const waitForActiveState = useCallback(
        async (torrentId: string, timeoutMs = 1000) => {
            const client = clientRef.current;
            if (!client || !client.getTorrentDetails) {
                return true;
            }
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                try {
                    const detail = await client.getTorrentDetails(torrentId);
                    if (detail && isRecoveryActiveState(detail.state)) {
                        return true;
                    }
                } catch {
                    // best-effort; keep polling
                }
                await delay(200);
            }
            return false;
        },
        [clientRef]
    );

    const resumeTorrentWithRecovery = useCallback(
        async (torrent: Torrent | TorrentDetail) => {
            const id = torrent.id ?? torrent.hash;
            if (!id) return;
            if (torrent.errorEnvelope) {
                const gateResult = await requestRecovery({
                    torrent,
                    action: "resume",
                });
                if (gateResult?.status === "handled") {
                    try {
                        await refreshAfterRecovery(torrent);
                    } catch (err) {
                        console.error("refresh after recovery failed", err);
                    }
                    const resumed = await waitForActiveState(id);
                    const isAllVerified =
                        gateResult.log === "all_verified_resuming";
                    const toastKey = isAllVerified
                        ? "recovery.feedback.all_verified_resuming"
                        : resumed
                        ? "recovery.feedback.download_resumed"
                        : "recovery.feedback.resume_queued";
                    const tone: FeedbackTone =
                        isAllVerified || resumed ? "info" : "warning";
                    showFeedback(t(toastKey), tone);
                    return;
                }
                if (gateResult?.status === "continue") {
                    await dispatch(TorrentIntents.ensureActive(id));
                    return;
                }
                if (!gateResult) {
                    await dispatch(TorrentIntents.ensureActive(id));
                    return;
                }
                return;
            }
            await dispatch(TorrentIntents.ensureActive(id));
        },
        [dispatch, requestRecovery, refreshAfterRecovery, showFeedback, t]
    );

    const handleRecoveryClose = useCallback(() => {
        if (!recoveryResolverRef.current) return;
        recoveryAbortControllerRef.current?.abort();
        finalizeRecovery({ status: "cancelled" });
    }, [finalizeRecovery]);

    // --- 5. Retry / Redownload / Dedupe ---
    const redownloadInFlight = useRef<Set<string>>(new Set());

    const executeRedownload = useCallback(
        async (
            target: Torrent | TorrentDetail,
            options?: { recreateFolder?: boolean }
        ) => {
            const key = getRecoveryFingerprint(target);
            if (redownloadInFlight.current.has(key)) return;

            redownloadInFlight.current.add(key);
            try {
                const gateResult = await requestRecovery({
                    torrent: target,
                    action: "redownload",
                    options,
                });
                if (gateResult && gateResult.status !== "continue") {
                    if (gateResult.status === "handled") {
                        clearCachedProbe(target.id ?? target.hash ?? "");
                        await refreshAfterRecovery(target);
                        showFeedback(
                            t("recovery.feedback.download_resumed"),
                            "info"
                        );
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
            requestRecovery,
            showFeedback,
            refreshAfterRecovery,
            reportCommandError,
            t,
        ]
    );

    const executeRetryFetch = useCallback(
        async (target: Torrent | TorrentDetail) => {
            const activeClient = clientRef.current;
            if (!activeClient) return;
            clearVerifyGuardEntry(getRecoveryFingerprint(target));

            const gateResult = await requestRecovery({
                torrent: target,
                action: "recheck",
                options: { recreateFolder: false, retryOnly: true },
            });
            clearCachedProbe(target.id ?? target.hash ?? "");

            try {
                await refreshAfterRecovery(target);
            } catch (err) {
                console.error("refresh after retry probe failed", err);
            }
            const targetId = target.id ?? target.hash;
            const shouldResume =
                !gateResult || gateResult.status === "continue";
            if (shouldResume && targetId) {
                try {
                    await dispatch(TorrentIntents.ensureActive(targetId));
                } catch (err) {
                    console.error("retry resume failed", err);
                }
            }
            if (!shouldResume) {
                showFeedback(t("recovery.feedback.retry_failed"), "warning");
                return;
            }
        },
        [clientRef, requestRecovery, refreshAfterRecovery, dispatch]
    );

    const handleRecoveryRetry = useCallback(async () => {
        if (!recoverySession?.torrent) return;
        await executeRetryFetch(recoverySession.torrent);
        handleRecoveryClose();
    }, [executeRetryFetch, recoverySession, handleRecoveryClose]);

    const handleRecoveryAutoRetry = useCallback(async () => {
        if (!recoverySession?.torrent) return;
        await resolveRecoverySession(recoverySession.torrent, {
            notifyDriveDetected: true,
        });
    }, [recoverySession, resolveRecoverySession]);

    const handleRecoveryRecreateFolder = useCallback(async () => {
        if (!recoverySession?.torrent) return;
        await resolveRecoverySession(recoverySession.torrent, {
            recreateFolder: true,
        });
    }, [recoverySession, resolveRecoverySession]);

    const recoveryRequestBrowse = useCallback(
        async (currentPath?: string | null) => {
            if (!setLocationCapability.canBrowse) return null;
            // TODO: Replace direct `NativeShell.openFolderDialog` usage with the ShellAgent adapter.
            // TODO: Gating: browsing is allowed only in `uiMode="Full"` (loopback + ShellAgent bridge). In `uiMode="Rpc"`, this must return `null`/unsupported deterministically.
            // TODO: Do not derive browse capability from daemon/server identity; the daemon is Transmission in both modes.
            try {
                return (
                    (await shellAgent.browseDirectory(
                        currentPath ?? undefined
                    )) ?? null
                );
            } catch {
                return null;
            }
        },
        [setLocationCapability.canBrowse, shellAgent]
    );

    const handleRecoveryPickPath = useCallback(
        async (path: string) => {
            if (!recoveryCallbacks?.handlePickPath) return;
            if (!recoverySession?.torrent) return;
            const outcome = await recoveryCallbacks.handlePickPath(path);
            if (outcome?.kind !== "resolved") return;
            const updatedTorrent: Torrent | TorrentDetail = {
                ...recoverySession.torrent,
                downloadDir: path,
                savePath: path,
            };
            await resolveRecoverySession(updatedTorrent, {
                delayAfterSuccessMs: PICK_PATH_SUCCESS_DELAY_MS,
            });
        },
        [recoveryCallbacks, recoverySession, resolveRecoverySession]
    );

    const setLocationAndRecover = useCallback(
        async (torrent: Torrent | TorrentDetail, path: string) => {
            const updatedTorrent: Torrent | TorrentDetail = {
                ...torrent,
                downloadDir: path,
                savePath: path,
            };
            await resumeTorrentWithRecovery(updatedTorrent);
        },
        [resumeTorrentWithRecovery]
    );

    const inlineSetLocationStateRef = useRef<InlineSetLocationState | null>(
        null
    );
    const [inlineSetLocationState, setInlineSetLocationState] =
        useState<InlineSetLocationState | null>(null);
    const inlineIntentCounterRef = useRef(0);
    const inlineDraftsRef = useRef<Map<string, string>>(new Map());
    const [setLocationOutcomes, setSetLocationOutcomes] = useState<
        Record<string, SetLocationOutcome>
    >({});
    // TODO: Simplify inline set-location: track a single editingLocationId + drafts, derive conflicts instead of persisting outcome/owner maps; clear drafts/outcomes on removal/success.

    const getDraftPathForTorrent = useCallback(
        (key: string | null, fallback: string): string => {
            if (!key) return fallback;
            return inlineDraftsRef.current.get(key) ?? fallback;
        },
        []
    );

    const saveDraftForTorrent = useCallback(
        (key: string | null, path: string) => {
            if (!key) return;
            inlineDraftsRef.current.set(key, path);
        },
        []
    );

    const clearDraftForTorrent = useCallback((key: string | null) => {
        if (!key) return;
        inlineDraftsRef.current.delete(key);
    }, []);

    const getTorrentByKey = useCallback(
        (key: string | null) => {
            if (!key) return null;
            const found =
                torrents.find((torrent) => getTorrentKey(torrent) === key) ??
                null;
            if (found) return found;
            if (detailData && getTorrentKey(detailData) === key) {
                return detailData;
            }
            return null;
        },
        [detailData, torrents]
    );

    useEffect(() => {
        const validKeys = new Set<string>();
        torrents.forEach((torrent) => {
            const key = getTorrentKey(torrent);
            if (key) validKeys.add(key);
        });
        if (detailData) {
            const detailKey = getTorrentKey(detailData);
            if (detailKey) validKeys.add(detailKey);
        }
        inlineDraftsRef.current.forEach((_, key) => {
            if (!validKeys.has(key)) {
                inlineDraftsRef.current.delete(key);
            }
        });
    }, [detailData, torrents]);

    const openInlineSetLocationState = useCallback(
        (state: Omit<InlineSetLocationState, "intentId">) => {
            const torrentKey = state.torrentKey || null;
            const resolvedPath = getDraftPathForTorrent(
                torrentKey,
                state.inputPath
            );
            inlineIntentCounterRef.current += 1;
            const next = {
                ...state,
                inputPath: resolvedPath,
                initialPath: state.initialPath ?? state.inputPath,
                intentId: inlineIntentCounterRef.current,
                awaitingRecoveryFingerprint: null,
            };
            if (torrentKey) {
                inlineDraftsRef.current.set(torrentKey, resolvedPath);
            }
            inlineSetLocationStateRef.current = next;
            setInlineSetLocationState(next);
            return next;
        },
        [getDraftPathForTorrent]
    );
    const patchInlineSetLocationState = useCallback(
        (patch: Partial<Omit<InlineSetLocationState, "intentId">>) => {
            const current = inlineSetLocationStateRef.current;
            if (!current) return;
            const next = { ...current, ...patch };
            inlineSetLocationStateRef.current = next;
            setInlineSetLocationState(next);
            return next;
        },
        []
    );
    const cancelInlineSetLocation = useCallback(() => {
        inlineSetLocationStateRef.current = null;
        setInlineSetLocationState(null);
    }, []);
    const confirmInlineSetLocation = useCallback(async (): Promise<boolean> => {
        const current = inlineSetLocationStateRef.current;
        if (!current) return false;
        const intentId = current.intentId;
        const trimmed = current.inputPath.trim();
        if (!trimmed) {
            patchInlineSetLocationState({
                error: t("directory_browser.validation_required"),
            });
            return false;
        }
        const torrentKey = current.torrentKey || null;
        const targetTorrent = getTorrentByKey(torrentKey);
        if (!targetTorrent) {
            patchInlineSetLocationState({
                error: t("recovery.errors.missing_client_or_detail"),
            });
            return false;
        }
        patchInlineSetLocationState({
            status: "submitting",
            error: undefined,
            inputPath: trimmed,
        });
        saveDraftForTorrent(torrentKey, trimmed);
        if (inlineSetLocationStateRef.current?.intentId !== intentId) {
            return false;
        }
        try {
            await setLocationAndRecover(targetTorrent, trimmed);
            clearDraftForTorrent(torrentKey);
            if (inlineSetLocationStateRef.current?.intentId !== intentId) {
                return true;
            }
            const fingerprint = getRecoveryFingerprint(targetTorrent);
            patchInlineSetLocationState({
                status: "verifying",
                awaitingRecoveryFingerprint: fingerprint,
                error: undefined,
            });
            return true;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unknown error";
            if (inlineSetLocationStateRef.current?.intentId === intentId) {
                patchInlineSetLocationState({
                    status: "idle",
                    error: message,
                    awaitingRecoveryFingerprint: null,
                });
            }
            return false;
        }
    }, [
        patchInlineSetLocationState,
        saveDraftForTorrent,
        setLocationAndRecover,
        t,
        getTorrentByKey,
    ]);
    const handleInlineLocationChange = useCallback(
        (value: string) => {
            const currentKey = inlineSetLocationStateRef.current?.torrentKey;
            if (currentKey) {
                saveDraftForTorrent(currentKey, value);
            }
            patchInlineSetLocationState({
                inputPath: value,
                error: undefined,
            });
        },
        [patchInlineSetLocationState, saveDraftForTorrent]
    );
    const buildOutcomeKey = useCallback(
        (surface: SetLocationSurface, torrentKey: string | null) =>
            `${surface}:${torrentKey ?? ""}`,
        []
    );
    const recordSetLocationOutcome = useCallback(
        (
            outcome: SetLocationOutcome,
            surface: SetLocationSurface,
            torrentKey: string | null
        ) => {
            const key = buildOutcomeKey(surface, torrentKey);
            setSetLocationOutcomes((prev) => ({
                ...prev,
                [key]: outcome,
            }));
            return outcome;
        },
        [buildOutcomeKey]
    );
    const clearLocationOutcome = useCallback(
        (surface: SetLocationSurface, torrentKey: string | null) => {
            const key = buildOutcomeKey(surface, torrentKey);
            setSetLocationOutcomes((prev) => {
                if (!prev[key]) return prev;
                const { [key]: _removed, ...rest } = prev;
                return rest;
            });
        },
        [buildOutcomeKey]
    );
    const releaseInlineSetLocation = useCallback(() => {
        inlineOwnerRef.current = null;
        const current = inlineSetLocationStateRef.current;
        inlineSetLocationStateRef.current = null;
        setInlineSetLocationState(null);
        if (current) {
            clearDraftForTorrent(current.torrentKey);
            clearLocationOutcome(current.surface, current.torrentKey);
        }
    }, [clearDraftForTorrent, clearLocationOutcome]);
    const isInlineOwner = useCallback(
        (surface: SetLocationSurface, torrentKey: string) => {
            const owner = inlineOwnerRef.current;
            if (!owner) return false;
            return owner.surface === surface && owner.torrentKey === torrentKey;
        },
        []
    );
    const tryAcquireInlineOwner = useCallback(
        (surface: SetLocationSurface, torrentKey: string) => {
            const owner = inlineOwnerRef.current;
            if (!owner) {
                inlineOwnerRef.current = { surface, torrentKey };
                return "acquired" as const;
            }
            if (isInlineOwner(surface, torrentKey)) {
                return "already-owned" as const;
            }
            return "conflict" as const;
        },
        [isInlineOwner]
    );
    const releaseInlineOwner = useCallback(() => {
        inlineOwnerRef.current = null;
    }, []);

    useEffect(() => {
        const current = inlineSetLocationStateRef.current;
        if (!current) return;
        clearDraftForTorrent(current.torrentKey);
        releaseInlineSetLocation();
    }, [hasNativeHostShell, clearDraftForTorrent, releaseInlineSetLocation]);
    const getLocationOutcome = useCallback(
        (surface: SetLocationSurface, torrentKey: string | null) => {
            const owner = inlineOwnerRef.current;
            if (
                owner &&
                (owner.surface !== surface ||
                    (torrentKey && owner.torrentKey !== torrentKey))
            ) {
                return {
                    kind: "conflict",
                    reason: "inline-conflict",
                    surface,
                } as const;
            }
            const key = buildOutcomeKey(surface, torrentKey);
            return setLocationOutcomes[key] ?? null;
        },
        [buildOutcomeKey, setLocationOutcomes]
    );

    const handleSetLocation = useCallback(
        async (
            torrent: Torrent | TorrentDetail,
            options?: { surface?: SetLocationSurface }
        ): Promise<SetLocationOutcome> => {
            const surface = options?.surface ?? "general-tab";
            const basePath = resolveTorrentPath(torrent);
            const torrentKey = getTorrentKey(torrent);
            if (setLocationCapability.canBrowse) {
                if (!recoveryRequestBrowse) {
                    return recordSetLocationOutcome(
                        {
                            kind: "unsupported",
                            reason: "browse-unavailable",
                            surface,
                        },
                        surface,
                        torrentKey
                    );
                }
                const pickedPath = await recoveryRequestBrowse(
                    basePath || undefined
                );
                if (pickedPath) {
                    await setLocationAndRecover(torrent, pickedPath);
                    return recordSetLocationOutcome(
                        { kind: "browsed" },
                        surface,
                        torrentKey
                    );
                }
                return recordSetLocationOutcome(
                    { kind: "canceled" },
                    surface,
                    torrentKey
                );
            }
            if (!setLocationCapability.supportsManual) {
                return recordSetLocationOutcome(
                    {
                        kind: "unsupported",
                        reason: "manual-disabled",
                        surface,
                    },
                    surface,
                    torrentKey
                );
            }
            const acquisition = tryAcquireInlineOwner(surface, torrentKey);
            if (acquisition === "conflict") {
                return { kind: "conflict", reason: "inline-conflict", surface };
            }
            if (acquisition === "already-owned") {
                return recordSetLocationOutcome(
                    { kind: "manual", surface },
                    surface,
                    torrentKey
                );
            }
            releaseInlineSetLocation();
            openInlineSetLocationState({
                surface,
                torrentKey,
                initialPath: basePath,
                inputPath: basePath,
                status: "idle",
            });
            return recordSetLocationOutcome(
                { kind: "manual", surface },
                surface,
                torrentKey
            );
        },
        [
            releaseInlineSetLocation,
            tryAcquireInlineOwner,
            openInlineSetLocationState,
            recoveryRequestBrowse,
            setLocationAndRecover,
            setLocationCapability,
            recordSetLocationOutcome,
        ]
    );
    // TODO: Split set-location into two clear paths: (a) browse flow (if allowed) with minimal steps, (b) inline/manual flow with a tiny reducer managing draft/status/errors; avoid interleaving recovery/resume logic in UI handler.

    useEffect(() => {
        const current = inlineSetLocationState;
        if (!current || current.status !== "verifying") return;
        const torrentKey = current.torrentKey;
        if (!recoverySession) {
            clearDraftForTorrent(torrentKey);
            cancelInlineSetLocation();
            return;
        }
        const sessionKey = getTorrentKey(recoverySession.torrent);
        if (sessionKey !== torrentKey) {
            return;
        }
        // Keep editor open until recovery session clears.
    }, [
        cancelInlineSetLocation,
        clearDraftForTorrent,
        inlineSetLocationState,
        recoverySession,
    ]);

    const isDetailRecoveryBlocked = useMemo(() => {
        if (!detailData || !recoverySession) return false;
        return (
            getRecoveryFingerprint(detailData) ===
            getRecoveryFingerprint(recoverySession.torrent)
        );
    }, [detailData, recoverySession]);

    // --- 6. Event Listeners ---
    const findTorrentById = useCallback(
        (idOrHash?: string | null) => {
            if (!idOrHash) return null;
            if (
                detailData &&
                (detailData.id === idOrHash || detailData.hash === idOrHash)
            ) {
                return detailData;
            }
            return null;
        },
        [detailData]
    );

    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleRedownloadEvent = async (ev: Event) => {
            const detail = (ev as CustomEvent).detail;
            const target = findTorrentById(detail?.id ?? detail?.hash);
            if (target) await executeRedownload(target);
        };

        window.addEventListener(
            "tiny-torrent:redownload",
            handleRedownloadEvent as EventListener
        );
        return () => {
            window.removeEventListener(
                "tiny-torrent:redownload",
                handleRedownloadEvent as EventListener
            );
        };
    }, [executeRedownload, findTorrentById]);

    // --- 8. UI Lifecycle ---
    useEffect(() => {
        if (!client) return;
        // TODO: Remove UI lifecycle calls (`notifyUiReady/notifyUiDetached`) once RPC extensions are deleted.
        // TODO: Rationale: the daemon must be stateless toward UI (see `docs/EXE architecutre.md`). “UI attach/detach” was part of the deprecated RPC-extended path.
        void client.notifyUiReady?.();
        const detachUi = () => {
            try {
                void client.notifyUiDetached?.();
            } catch {}
        };
        window.addEventListener("beforeunload", detachUi);
        return () => window.removeEventListener("beforeunload", detachUi);
    }, [client]);

    return {
        serverClass,
        connectionMode,
        uiMode,
        canOpenFolder,
        lastDownloadDir,
        addSource,
        isResolvingMagnet,
        isMagnetModalOpen,
        magnetModalInitialValue,
        addModalState,
        isFinalizingExisting,
        isAddingTorrent: isFinalizingExisting, // Align with App consumers

        recoverySession,
        isRecoveryBusy,
        lastRecoveryOutcome,
        isDetailRecoveryBlocked,
        openAddTorrentPicker,
        openAddMagnet,
        openAddTorrentFromFile,
        handleMagnetSubmit,
        handleMagnetModalClose,
        closeAddTorrentWindow,
        handleTorrentWindowConfirm,
        setAddSource,
        setLastDownloadDir,
        requestRecovery,
        executeRedownload,
        executeRetryFetch,
        handleRecoveryRetry,
        handleRecoveryAutoRetry,
        handleRecoveryClose,
        handleRecoveryPickPath,
        handleSetLocation,
        setLocationCapability,
        inlineSetLocationState,
        cancelInlineSetLocation,
        releaseInlineSetLocation,
        confirmInlineSetLocation,
        handleInlineLocationChange,
        getLocationOutcome,
        handleRecoveryRecreateFolder,
        resumeTorrentWithRecovery,
        probeMissingFilesIfStale,
        performUIActionDelete,
    };
}

export default useTorrentOrchestrator;
