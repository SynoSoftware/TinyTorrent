import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { ServerClass } from "@/services/rpc/entities";
import type {
    AddTorrentSource,
    AddTorrentSelection,
} from "@/modules/torrent-add/components/AddTorrentModal";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import { NativeShell } from "@/app/runtime";
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
    return bytes
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
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
    const pendingDeletionHashesRef = useRef<Set<string>>(new Set());
    const recentlyRemovedKeysRef = useRef<Set<string>>(new Set());

    // --- 1. Capability & Server Class ---
    const [serverClass, setServerClass] = useState<ServerClass>("unknown");

    useEffect(() => {
        let active = true;
        if (rpcStatus !== "connected") {
            if (active) setServerClass("unknown");
            return () => {
                active = false;
            };
        }

        const updateServerClass = async () => {
            try {
                await client?.getExtendedCapabilities?.();
            } catch {
                /* ignore */
            }
            if (!active) return;
            setServerClass(client?.getServerClass?.() ?? "unknown");
        };
        void updateServerClass();
        return () => {
            active = false;
        };
    }, [rpcStatus, client]);

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
            typeof magnetLink === "string" ? normalizeMagnetLink(magnetLink) : undefined;
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
            if (
                infoHash &&
                pendingDeletionHashesRef.current.has(infoHash)
            ) {
                showFeedback(
                    t("toolbar.feedback.pending_delete"),
                    "warning"
                );
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
    const recoverySessionActiveRef = useRef(false);

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
            void dispatch(TorrentIntents.ensureRemoved(targetId, deleteData)).catch(
                () => {
                    showFeedback(t("toolbar.feedback.failed"), "danger");
                    unmarkRemoved(key);
                }
            );
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
                    if (
                        detail &&
                        isRecoveryActiveState(detail.state)
                    ) {
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
            if (!NativeShell.isAvailable) return null;
            try {
                return (
                    (await NativeShell.openFolderDialog(
                        currentPath ?? undefined
                    )) ?? null
                );
            } catch {
                return null;
            }
        },
        []
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
        setLocationAndRecover,
        handleRecoveryRecreateFolder,
        recoveryRequestBrowse,
        resumeTorrentWithRecovery,
        probeMissingFilesIfStale,
        performUIActionDelete,
    };
}

export default useTorrentOrchestrator;
