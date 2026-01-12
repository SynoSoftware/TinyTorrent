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
    type RecoveryOutcome,
} from "@/services/recovery/recovery-controller";
import { useRecoveryController } from "@/modules/dashboard/hooks/useRecoveryController";
import type {
    RecoveryGateAction,
    RecoveryGateCallback,
    RecoveryGateOutcome,
} from "@/app/types/recoveryGate";
import type {
    TorrentIntentExtended,
    QueueMoveIntent,
} from "@/app/intents/torrentIntents";
import { readTorrentFileAsMetainfoBase64 } from "@/modules/torrent-add/services/torrent-metainfo";

// --- Types ---

export interface UseTorrentOrchestratorParams {
    client: EngineAdapter | null | undefined;
    clientRef: MutableRefObject<EngineAdapter | null>;
    refreshTorrentsRef: MutableRefObject<() => Promise<void>>;
    refreshSessionStatsDataRef: MutableRefObject<() => Promise<void>>;
    refreshDetailData: () => Promise<void>;
    reportCommandError?: (error: unknown) => void;
    showFeedback: (message: string, tone: FeedbackTone) => void;
    detailData: TorrentDetail | null;
    rpcStatus: string;
    settingsFlow: {
        settingsConfig: SettingsConfig;
        setSettingsConfig: Dispatch<SetStateAction<SettingsConfig>>;
    };
    t: (key: string) => string;
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

const LAST_DOWNLOAD_DIR_KEY = "tt-add-last-download-dir";

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
        showFeedback,
        reportCommandError,
        t,
    } = params;
    const { settingsConfig, setSettingsConfig } = settingsFlow;

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

    const torrentFilePickerRef = useRef<HTMLInputElement | null>(null);
    const isMountedRef = useRef(false);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const openAddTorrentPicker = useCallback(() => {
        torrentFilePickerRef.current?.click();
    }, []);

    const openAddMagnet = useCallback((magnetLink?: string) => {
        const normalized = magnetLink
            ? normalizeMagnetLink(magnetLink)
            : undefined;
        setMagnetModalInitialValue(normalized ?? magnetLink ?? "");
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

            const startNow = Boolean(
                settingsConfigRef.current.start_added_torrents
            );
            const defaultDir =
                lastDownloadDir || settingsConfigRef.current.download_dir;

            try {
                await client?.addTorrent({
                    magnetLink: normalized,
                    paused: !startNow,
                    downloadDir: defaultDir,
                });
                void refreshTorrentsRef.current?.();
            } catch (err) {
                console.error("Failed to add magnet", err);
            }
        },
        [client, lastDownloadDir, refreshTorrentsRef]
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
                    await client?.addTorrent({
                        metainfo: metainfo.metainfoBase64,
                        downloadDir,
                        paused: !startNow,
                        filesUnwanted: selection.filesUnwanted,
                        priorityHigh: selection.priorityHigh,
                        priorityNormal: selection.priorityNormal,
                        priorityLow: selection.priorityLow,
                    });
                    void refreshTorrentsRef.current?.();
                } finally {
                    closeAddTorrentWindow();
                }
                return;
            }

            // Magnet / Existing Finalization
            setIsFinalizingExisting(true);
            try {
                if (addSource.torrentId && client?.setTorrentLocation) {
                    await client.setTorrentLocation(
                        addSource.torrentId,
                        downloadDir,
                        true
                    );
                }
                if (addSource.torrentId && selection.filesUnwanted.length) {
                    await client?.updateFileSelection?.(
                        addSource.torrentId,
                        selection.filesUnwanted,
                        false
                    );
                }
                if (startNow && addSource.torrentId) {
                    await client?.resume([addSource.torrentId]);
                }
                closeAddTorrentWindow();
            } finally {
                setIsFinalizingExisting(false);
            }
        },
        [addSource, client, closeAddTorrentWindow, refreshTorrentsRef]
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

    const runMissingFilesFlow = useCallback(
        async (
            torrent: Torrent | TorrentDetail,
            options?: { recreateFolder?: boolean }
        ) => {
            const activeClient = clientRef.current;
            const envelope = torrent.errorEnvelope;
            if (!activeClient || !envelope) return null;

            const classification = classifyMissingFilesState(
                envelope,
                torrent.savePath ?? torrent.downloadDir ?? "",
                serverClass
            );

            try {
                return await runMissingFilesRecoverySequence({
                    client: activeClient,
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
        [clientRef, serverClass]
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
                    return { status: "handled" };
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
            if (action === "recheck") return { status: "continue" };

            const fingerprint = getRecoveryFingerprint(torrent);
            if (recoveryFingerprintRef.current) {
                if (recoveryFingerprintRef.current === fingerprint) {
                    return recoveryPromiseRef.current ?? null;
                }
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

    const finalizeRecovery = useCallback((result: RecoveryGateOutcome) => {
        const resolver = recoveryResolverRef.current;
        recoveryResolverRef.current = null;
        recoveryFingerprintRef.current = null;
        recoveryPromiseRef.current = null;
        setRecoverySession(null);
        resolver?.(result);
    }, []);

    const {
        recoveryCallbacks,
        isBusy: isRecoveryBusy,
        lastOutcome: lastRecoveryOutcome,
    } = useRecoveryController({
        client: client ?? null,
        detail: recoverySession?.torrent ?? null,
        envelope: recoverySession?.torrent?.errorEnvelope ?? null,
        requestRecovery,
    });

    const handleRecoveryClose = useCallback(() => {
        if (!recoveryResolverRef.current) return;
        finalizeRecovery({ status: "cancelled" });
    }, [finalizeRecovery]);

    // --- 5. Retry / Redownload / Dedupe ---
    const redownloadInFlight = useRef<Set<string>>(new Set());

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

            const gateResult = await requestRecovery({
                torrent: target,
                action: "recheck",
                options: { recreateFolder: false, retryOnly: true },
            });

            if (gateResult && gateResult.status !== "continue") return;

            try {
                await refreshAfterRecovery(target);
            } catch (err) {
                console.error("refresh after retry probe failed", err);
            }
        },
        [clientRef, requestRecovery, refreshAfterRecovery]
    );

    const handleRecoveryRetry = useCallback(async () => {
        if (!recoverySession?.torrent) return;
        await executeRetryFetch(recoverySession.torrent);
        handleRecoveryClose();
    }, [executeRetryFetch, recoverySession, handleRecoveryClose]);

    const handleRecoveryRecreateFolder = useCallback(() => {
        if (!recoverySession?.torrent) return Promise.resolve();
        return executeRedownload(recoverySession.torrent, {
            recreateFolder: true,
        });
    }, [executeRedownload, recoverySession]);

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
            await recoveryCallbacks.handlePickPath(path);
        },
        [recoveryCallbacks]
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

    // --- 7. Intent Dispatcher ---
    const dispatch = useCallback(
        async (intent: TorrentIntentExtended) => {
            const activeClient = clientRef.current || client;
            if (!activeClient) return;

            switch (intent.type) {
                case "ENSURE_TORRENT_ACTIVE":
                    await activeClient.resume([String(intent.torrentId)]);
                    break;
                case "ENSURE_TORRENT_PAUSED":
                    await activeClient.pause([String(intent.torrentId)]);
                    break;
                case "ENSURE_TORRENT_REMOVED":
                    await activeClient.remove(
                        [String(intent.torrentId)],
                        Boolean(intent.deleteData)
                    );
                    break;
                case "ENSURE_TORRENT_VALID":
                    await activeClient.verify([String(intent.torrentId)]);
                    break;
                case "ENSURE_SELECTION_ACTIVE":
                    await activeClient.resume(
                        (intent.torrentIds || []).map(String)
                    );
                    break;
                case "ENSURE_SELECTION_PAUSED":
                    await activeClient.pause(
                        (intent.torrentIds || []).map(String)
                    );
                    break;
                case "ENSURE_SELECTION_REMOVED":
                    await activeClient.remove(
                        (intent.torrentIds || []).map(String),
                        Boolean(intent.deleteData)
                    );
                    break;
                case "ENSURE_SELECTION_VALID":
                    await activeClient.verify(
                        (intent.torrentIds || []).map(String)
                    );
                    break;
                case "QUEUE_MOVE":
                    const q = intent as QueueMoveIntent;
                    const tid = String(q.torrentId);
                    const steps = Math.max(1, Number(q.steps ?? 1));
                    for (let i = 0; i < steps; i++) {
                        if (q.direction === "up")
                            await activeClient.moveUp([tid]);
                        else if (q.direction === "down")
                            await activeClient.moveDown([tid]);
                        else if (q.direction === "top")
                            await activeClient.moveToTop([tid]);
                        else if (q.direction === "bottom")
                            await activeClient.moveToBottom([tid]);
                    }
                    break;
            }
        },
        [client, clientRef]
    );

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
        torrentFilePickerRef,
        isFinalizingExisting,
        isAddingTorrent: isFinalizingExisting, // Align with App consumers

        recoverySession,
        isRecoveryBusy,
        lastRecoveryOutcome,
        isDetailRecoveryBlocked,
        dispatch,
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
        handleRecoveryClose,
        handleRecoveryPickPath,
        handleRecoveryRecreateFolder,
        recoveryRequestBrowse,
    };
}

export default useTorrentOrchestrator;
