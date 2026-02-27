import { createElement, useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@heroui/react";
import { addToast, closeToast } from "@heroui/toast";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import { useAddModalState } from "@/app/hooks/useAddModalState";
import { useAddTorrentDefaults } from "@/app/hooks/useAddTorrentDefaults";
import { normalizeMagnetLink } from "@/app/utils/magnet";
import type { SettingsConfig } from "@/modules/settings/data/config";
import type { TorrentEntity as Torrent, TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";
import type {
    AddTorrentSelection, AddTorrentSource, } from "@/modules/torrent-add/types";
import { parseTorrentFile } from "@/modules/torrent-add/services/torrent-metainfo";
import { TorrentIntents } from "@/app/intents/torrentIntents";
// feedback tone type no longer required here; controller reads feedback hook internally
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import { infraLogger } from "@/shared/utils/infraLogger";
import { registry } from "@/config/logic";
const { timing, ui } = registry;

export interface UseAddTorrentControllerParams {
    dispatch: (
        intent: TorrentIntentExtended,
    ) => Promise<TorrentDispatchOutcome>;
    settingsConfig: SettingsConfig;
    torrents: Array<Torrent | TorrentDetail>;
    pendingDeletionHashesRef: MutableRefObject<Set<string>>;
    refreshTorrents: () => Promise<void>;
    openTorrentDetailsById?: (torrentId: string) => Promise<void>;
}

export type AddTorrentCommandOutcome =
    | { status: "opened" }
    | { status: "queued" }
    | { status: "added" }
    | { status: "finalized" }
    | {
          status: "invalid_input";
          reason:
              | "invalid_magnet_link"
              | "invalid_destination"
              | "missing_target";
      }
    | { status: "blocked_pending_delete" }
    | { status: "blocked_in_flight" }
    | { status: "unknown" }
    | { status: "cancelled" }
    | {
          status: "failed";
          reason:
              | "magnet_add_failed"
              | "metainfo_read_failed"
              | "add_file_failed"
              | "finalize_failed";
      };

export interface UseAddTorrentControllerResult {
    addModalState: ReturnType<typeof useAddModalState>;
    addSource: AddTorrentSource | null;
    addTorrentDefaults: ReturnType<typeof useAddTorrentDefaults>;
    openAddTorrentPicker: () => AddTorrentCommandOutcome;
    openAddMagnet: (magnetLink?: string) => AddTorrentCommandOutcome;
    handleMagnetModalClose: () => void;
    handleMagnetSubmit: (link: string) => Promise<AddTorrentCommandOutcome>;
    handleTorrentWindowConfirm: (
        selection: AddTorrentSelection,
    ) => Promise<AddTorrentCommandOutcome>;
    closeAddTorrentWindow: () => void;
    setAddSource: (source: AddTorrentSource | null) => void;
    isMagnetModalOpen: boolean;
    magnetModalInitialValue: string;
}

type AddSubmissionPayload = {
    label: string;
    sourceName: string | null;
    targetTorrentId?: string;
    targetInfoHash?: string;
    execute: () => Promise<TorrentDispatchOutcome>;
    successStatus: "added" | "finalized";
    failureReason: "magnet_add_failed" | "metainfo_read_failed" | "add_file_failed" | "finalize_failed";
};

type ActiveAddSubmission = {
    id: string;
    payload: AddSubmissionPayload;
    startedAtMs: number;
    knownHashesBefore: Set<string>;
    phase: "in_flight" | "unknown";
    toastKey: string | null;
};

const ADD_TIMEOUT_MULTIPLIER = 2;
const ADD_TIMEOUT_MIN_MS = 2000;

export function useAddTorrentController({
    dispatch,
    settingsConfig,
    torrents,
    pendingDeletionHashesRef,
    refreshTorrents,
    openTorrentDetailsById,
}: UseAddTorrentControllerParams): UseAddTorrentControllerResult {
    const { t } = useTranslation();
    const { showFeedback } = useActionFeedback();
    const [addSource, setAddSource] = useState<AddTorrentSource | null>(null);
    const [isMagnetModalOpen, setMagnetModalOpen] = useState(false);
    const [magnetModalInitialValue, setMagnetModalInitialValue] = useState("");
    const activeSubmissionRef = useRef<ActiveAddSubmission | null>(null);
    const submissionSeqRef = useRef(0);
    const torrentsRef = useRef<Array<Torrent | TorrentDetail>>(torrents);

    const fallbackCommitMode = settingsConfig.start_added_torrents
        ? "start"
        : "paused";
    const addTorrentDefaults = useAddTorrentDefaults({
        fallbackDownloadDir: settingsConfig.download_dir,
        fallbackCommitMode,
        fallbackSequentialDownload: false,
        fallbackSkipHashCheck: true,
    });
    const {
        downloadDir: addTorrentDownloadDir,
        setDownloadDir: setAddTorrentDownloadDir,
    } = addTorrentDefaults;

    const showInFlightStatus = useCallback(() => {
        const active = activeSubmissionRef.current;
        if (!active) {
            return;
        }
        addToast({
            title:
                active.phase === "unknown"
                    ? t("modals.add_torrent.unknown_outcome_title")
                    : t("modals.add_torrent.submission_already_running"),
            description:
                active.phase === "unknown"
                    ? t("modals.add_torrent.unknown_outcome_body")
                    : t("modals.add_torrent.background_progress"),
            color: active.phase === "unknown" ? "warning" : "primary",
            severity: active.phase === "unknown" ? "warning" : "primary",
            timeout: timing.ui.toastMs,
            hideCloseButton: true,
        });
    }, [t]);

    const addModalState = useAddModalState({
        onOpenAddMagnet: (magnetLink?: string) => {
            if (activeSubmissionRef.current) {
                showInFlightStatus();
                return;
            }
            const normalized =
                typeof magnetLink === "string"
                    ? normalizeMagnetLink(magnetLink)
                    : undefined;
            setMagnetModalInitialValue(normalized ?? "");
            setMagnetModalOpen(true);
        },
        onOpenAddTorrentFromFile: async (file) => {
            if (activeSubmissionRef.current) {
                showInFlightStatus();
                return;
            }
            try {
                const { parseTorrentFile } =
                    await import("@/shared/utils/torrent");
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
        },
    });

    useEffect(() => {
        torrentsRef.current = torrents;
    }, [torrents]);

    const closeSubmissionToast = useCallback((submission: ActiveAddSubmission | null) => {
        if (!submission?.toastKey) return;
        closeToast(submission.toastKey);
    }, []);

    const findMatchedTorrent = useCallback((submission: ActiveAddSubmission) => {
        const currentTorrents = torrentsRef.current;
        const targetTorrentId = submission.payload.targetTorrentId;
        if (targetTorrentId) {
            return (
                currentTorrents.find(
                    (torrent) => String(torrent.id) === targetTorrentId,
                ) ?? null
            );
        }
        const targetInfoHash = submission.payload.targetInfoHash?.toLowerCase();
        if (targetInfoHash) {
            return (
                currentTorrents.find(
                    (torrent) => torrent.hash?.toLowerCase() === targetInfoHash,
                ) ?? null
            );
        }
        const sourceName = submission.payload.sourceName?.trim().toLowerCase();
        if (!sourceName) {
            return null;
        }
        const newCandidates = currentTorrents.filter((torrent) => {
            const hash = torrent.hash?.toLowerCase();
            if (!hash) return false;
            return !submission.knownHashesBefore.has(hash);
        });
        const namedNewCandidate =
            newCandidates.find(
                (torrent) => torrent.name.trim().toLowerCase() === sourceName,
            ) ?? null;
        if (namedNewCandidate) {
            return namedNewCandidate;
        }
        return (
            currentTorrents.find(
                (torrent) => torrent.name.trim().toLowerCase() === sourceName,
            ) ?? null
        );
    }, []);

    const beginSubmission = useCallback(
        function beginSubmission(payload: AddSubmissionPayload): AddTorrentCommandOutcome {
            if (activeSubmissionRef.current) {
                return { status: "blocked_in_flight" };
            }

            const startedAtMs = Date.now();
            const requestTimeoutMs = Math.max(
                ADD_TIMEOUT_MIN_MS,
                settingsConfig.request_timeout_ms * ADD_TIMEOUT_MULTIPLIER,
            );
            const knownHashesBefore = new Set(
                torrentsRef.current
                    .map((torrent) => torrent.hash?.toLowerCase())
                    .filter((hash): hash is string => Boolean(hash)),
            );
            const submission: ActiveAddSubmission = {
                id: `${startedAtMs}:${submissionSeqRef.current++}`,
                payload,
                startedAtMs,
                knownHashesBefore,
                phase: "in_flight",
                toastKey: addToast({
                    title: t("modals.add_torrent.submitting"),
                    description: t("modals.add_torrent.background_progress"),
                    color: "primary",
                    severity: "primary",
                    timeout: requestTimeoutMs,
                    hideCloseButton: true,
                }),
            };
            activeSubmissionRef.current = submission;

            const retrySubmission = () => {
                if (activeSubmissionRef.current) {
                    addToast({
                        title: t("modals.add_torrent.submission_already_running"),
                        color: "warning",
                        severity: "warning",
                        timeout: timing.ui.toastMs,
                        hideCloseButton: true,
                    });
                    return;
                }
                beginSubmission(payload);
            };

            const showFailureToast = (reason: AddSubmissionPayload["failureReason"]) => {
                const failureMessage =
                    reason === "magnet_add_failed"
                        ? t("modals.add_torrent.magnet_error")
                        : t("modals.add_error_default");
                addToast({
                    title: failureMessage,
                    color: "danger",
                    severity: "danger",
                    timeout: timing.ui.toastMs,
                    hideCloseButton: false,
                    endContent: createElement(
                        Button,
                        {
                            size: "sm",
                            variant: "flat",
                            onPress: retrySubmission,
                        },
                        t("modals.add_torrent.retry"),
                    ),
                });
            };

            const settleSuccess = async () => {
                const active = activeSubmissionRef.current;
                if (!active || active.id !== submission.id) {
                    return;
                }
                closeSubmissionToast(active);
                activeSubmissionRef.current = null;
                const matchedTorrent = findMatchedTorrent(active);
                addToast({
                    title:
                        active.payload.successStatus === "finalized"
                            ? t("toolbar.feedback.location_updated")
                            : t("toolbar.feedback.added"),
                    color: "success",
                    severity: "success",
                    timeout: timing.ui.toastMs,
                    hideCloseButton: true,
                    endContent:
                        matchedTorrent && openTorrentDetailsById
                            ? createElement(
                                  Button,
                                  {
                                      size: "sm",
                                      variant: "flat",
                                      onPress: () => {
                                          void openTorrentDetailsById(
                                              String(matchedTorrent.id),
                                          );
                                      },
                                  },
                                  t("modals.add_torrent.open_details"),
                              )
                            : undefined,
                });
            };

            const settleFailure = () => {
                const active = activeSubmissionRef.current;
                if (!active || active.id !== submission.id) {
                    return;
                }
                closeSubmissionToast(active);
                activeSubmissionRef.current = null;
                showFailureToast(active.payload.failureReason);
            };

            const settleUnknown = () => {
                const active = activeSubmissionRef.current;
                if (!active || active.id !== submission.id) {
                    return;
                }
                active.phase = "unknown";
                closeSubmissionToast(active);
                active.toastKey = addToast({
                    title: t("modals.add_torrent.unknown_outcome_title"),
                    description: t("modals.add_torrent.unknown_outcome_body"),
                    color: "warning",
                    severity: "warning",
                    timeout: timing.ui.toastMs * 3,
                    hideCloseButton: false,
                    endContent: createElement(
                        Button,
                        {
                            size: "sm",
                            variant: "flat",
                            onPress: () => {
                                void (async () => {
                                    const current = activeSubmissionRef.current;
                                    if (!current || current.id !== submission.id) {
                                        return;
                                    }
                                    try {
                                        await refreshTorrents();
                                    } catch {
                                        showFeedback(
                                            t("toolbar.feedback.failed"),
                                            "danger",
                                        );
                                        return;
                                    }
                                    const latest = activeSubmissionRef.current;
                                    if (!latest || latest.id !== submission.id) {
                                        return;
                                    }
                                    if (findMatchedTorrent(latest)) {
                                        await settleSuccess();
                                        return;
                                    }
                                    closeSubmissionToast(latest);
                                    activeSubmissionRef.current = null;
                                    addToast({
                                        title: t("modals.add_torrent.unknown_retry_hint"),
                                        color: "warning",
                                        severity: "warning",
                                        timeout: timing.ui.toastMs,
                                        hideCloseButton: false,
                                        endContent: createElement(
                                            Button,
                                            {
                                                size: "sm",
                                                variant: "flat",
                                                onPress: retrySubmission,
                                            },
                                            t("modals.add_torrent.retry"),
                                        ),
                                    });
                                })();
                            },
                        },
                        t("modals.add_torrent.refresh_list"),
                    ),
                });
            };

            const timeoutPromise = new Promise<{ kind: "timeout" }>(
                (resolve) => {
                    window.setTimeout(() => resolve({ kind: "timeout" }), requestTimeoutMs);
                },
            );
            const executePromise = payload.execute();

            void (async () => {
                try {
                    const raceOutcome = await Promise.race([
                        executePromise.then((outcome) => ({
                            kind: "settled" as const,
                            outcome,
                        })),
                        timeoutPromise,
                    ]);

                    if (raceOutcome.kind === "timeout") {
                        settleUnknown();
                        const eventualOutcome = await executePromise;
                        const active = activeSubmissionRef.current;
                        if (!active || active.id !== submission.id) {
                            return;
                        }
                        if (eventualOutcome.status === "applied") {
                            await settleSuccess();
                            return;
                        }
                        settleFailure();
                        return;
                    }

                    if (raceOutcome.outcome.status === "applied") {
                        await settleSuccess();
                        return;
                    }
                    settleFailure();
                } catch (err) {
                    infraLogger.error(
                        {
                            scope: "add_torrent",
                            event: "background_submit_failed",
                            message: "Add submission failed while running in background",
                        },
                        err,
                    );
                    settleFailure();
                }
            })();

            return { status: "queued" };
        },
        [
            closeSubmissionToast,
            findMatchedTorrent,
            openTorrentDetailsById,
            refreshTorrents,
            settingsConfig.request_timeout_ms,
            showFeedback,
            t,
        ],
    );

    const openAddTorrentPicker = useCallback((): AddTorrentCommandOutcome => {
        if (activeSubmissionRef.current) {
            showInFlightStatus();
            return { status: "blocked_in_flight" };
        }
        addModalState.open();
        return { status: "opened" };
    }, [addModalState, showInFlightStatus]);

    const openAddMagnet = useCallback(
        (magnetLink?: string): AddTorrentCommandOutcome => {
            if (activeSubmissionRef.current) {
                showInFlightStatus();
                return { status: "blocked_in_flight" };
            }
            const normalized =
                typeof magnetLink === "string"
                    ? normalizeMagnetLink(magnetLink)
                    : undefined;
            setMagnetModalInitialValue(normalized ?? "");
            setMagnetModalOpen(true);
            return { status: "opened" };
        },
        [showInFlightStatus],
    );

    const handleMagnetModalClose = useCallback(() => {
        setMagnetModalOpen(false);
        setMagnetModalInitialValue("");
    }, []);

    const handleMagnetSubmit = useCallback(
        async (link: string): Promise<AddTorrentCommandOutcome> => {
            if (activeSubmissionRef.current) {
                showInFlightStatus();
                return { status: "blocked_in_flight" };
            }
            const normalized = normalizeMagnetLink(link);
            if (!normalized) {
                showFeedback(t("modals.add_torrent.magnet_error"), "warning");
                return {
                    status: "invalid_input",
                    reason: "invalid_magnet_link",
                };
            }
            const infoHash = normalizeInfoHashCandidate(normalized);
            if (infoHash && pendingDeletionHashesRef.current.has(infoHash)) {
                showFeedback(t("toolbar.feedback.pending_delete"), "warning");
                return { status: "blocked_pending_delete" };
            }

            const startNow = Boolean(settingsConfig.start_added_torrents);
            const defaultDir = addTorrentDownloadDir;
            const submissionOutcome = beginSubmission({
                label: normalized,
                sourceName: null,
                targetInfoHash: infoHash ?? undefined,
                successStatus: "added",
                failureReason: "magnet_add_failed",
                execute: () =>
                    dispatch(
                        TorrentIntents.addMagnetTorrent(
                            normalized,
                            defaultDir,
                            !startNow,
                        ),
                    ),
            });
            if (submissionOutcome.status === "queued") {
                handleMagnetModalClose();
            }
            return submissionOutcome;
        },
        [
            addTorrentDownloadDir,
            beginSubmission,
            dispatch,
            handleMagnetModalClose,
            showInFlightStatus,
            activeSubmissionRef,
            showFeedback,
            t,
            settingsConfig,
            pendingDeletionHashesRef,
        ],
    );

    const closeAddTorrentWindow = useCallback(() => {
        setAddSource(null);
    }, []);

    const handleTorrentWindowConfirm = useCallback(
        async (
            selection: AddTorrentSelection,
        ): Promise<AddTorrentCommandOutcome> => {
            if (activeSubmissionRef.current) {
                showInFlightStatus();
                return { status: "blocked_in_flight" };
            }
            if (!addSource) {
                return { status: "cancelled" };
            }
            const downloadDir = selection.downloadDir.trim();
            if (!downloadDir) {
                showFeedback(
                    t("modals.add_torrent.destination_prompt_invalid"),
                    "warning",
                );
                return {
                    status: "invalid_input",
                    reason: "invalid_destination",
                };
            }
            setAddTorrentDownloadDir(downloadDir);

            const startNow = selection.commitMode !== "paused";

            if (addSource.kind === "file") {
                const metainfo = await parseTorrentFile(addSource.file);
                if (!metainfo.ok) {
                    showFeedback(t("modals.file_tree_error"), "danger");
                    return { status: "failed", reason: "metainfo_read_failed" };
                }
                const submissionOutcome = beginSubmission({
                    label: addSource.label,
                    sourceName: addSource.metadata.name ?? addSource.label ?? null,
                    successStatus: "added",
                    failureReason: "add_file_failed",
                    execute: () =>
                        dispatch(
                            TorrentIntents.addTorrentFromFile(
                                metainfo.metainfoBase64,
                                downloadDir,
                                !startNow,
                                selection.filesUnwanted,
                                selection.priorityHigh,
                                selection.priorityNormal,
                                selection.priorityLow,
                                selection.options.sequential,
                                selection.options.skipHashCheck,
                            ),
                        ),
                });
                if (submissionOutcome.status === "queued") {
                    closeAddTorrentWindow();
                }
                return submissionOutcome;
            }

            const targetId = addSource.torrentId;
            if (!targetId) {
                showFeedback(t("modals.add_error_source_missing"), "warning");
                closeAddTorrentWindow();
                return { status: "invalid_input", reason: "missing_target" };
            }
            const submissionOutcome = beginSubmission({
                label: addSource.label,
                sourceName: addSource.label ?? null,
                targetTorrentId: targetId,
                successStatus: "finalized",
                failureReason: "finalize_failed",
                execute: () =>
                    dispatch(
                        TorrentIntents.finalizeExistingTorrent(
                            targetId,
                            downloadDir,
                            selection.filesUnwanted,
                            startNow,
                        ),
                    ),
            });
            if (submissionOutcome.status === "queued") {
                closeAddTorrentWindow();
            }
            return submissionOutcome;
        },
        [
            activeSubmissionRef,
            addSource,
            beginSubmission,
            closeAddTorrentWindow,
            dispatch,
            setAddTorrentDownloadDir,
            showInFlightStatus,
            showFeedback,
            t,
        ],
    );

    useEffect(() => {
        if (!torrents.length) {
            pendingDeletionHashesRef.current.clear();
            return;
        }
        const activeHashes = new Set(
            torrents
                .map((torrent) => torrent.hash?.toLowerCase())
                .filter((hash): hash is string => Boolean(hash)),
        );
        pendingDeletionHashesRef.current.forEach((hash) => {
            if (!activeHashes.has(hash)) {
                pendingDeletionHashesRef.current.delete(hash);
            }
        });
    }, [torrents, pendingDeletionHashesRef]);

    useEffect(() => {
        return () => {
            closeSubmissionToast(activeSubmissionRef.current);
            activeSubmissionRef.current = null;
        };
    }, [closeSubmissionToast]);

    return {
        addModalState,
        addSource,
        addTorrentDefaults,
        openAddTorrentPicker,
        openAddMagnet,
        handleMagnetModalClose,
        handleMagnetSubmit,
        handleTorrentWindowConfirm,
        closeAddTorrentWindow,
        setAddSource,
        isMagnetModalOpen,
        magnetModalInitialValue,
    };
}

function normalizeInfoHashCandidate(value: string): string | null {
    if (/^[0-9a-fA-F]{40}$/.test(value)) {
        return value.toLowerCase();
    }
    const decoded = base32ToHex(value);
    if (!decoded) return null;
    return decoded.toLowerCase();
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32ToHex(value: string): string | null {
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
}


