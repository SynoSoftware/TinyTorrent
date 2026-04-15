import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "@heroui/react";
import { useSession } from "@/app/context/SessionContext";
import { useEngineSessionDomain } from "@/app/providers/engineDomains";
import type { AddTorrentDefaultsState } from "@/app/context/PreferencesContext";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import { useAddModalState } from "@/app/hooks/useAddModalState";
import { useDownloadPaths } from "@/app/hooks/useDownloadPaths";
import { usePreferences } from "@/app/context/PreferencesContext";
import {
    extractMagnetInfoHashCandidate,
    normalizeMagnetLink,
} from "@/app/utils/magnet";
import type { SettingsConfig } from "@/modules/settings/data/config";
import type { TorrentEntity as Torrent, TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";
import type {
    AddTorrentSelection,
    AddTorrentSource,
} from "@/modules/torrent-add/types";
import { resolveAddTorrentFileHandlingDecision } from "@/modules/torrent-add/services/addTorrentModalDecisions";
import { parseTorrentFile } from "@/modules/torrent-add/services/torrent-metainfo";
import { TorrentIntents } from "@/app/intents/torrentIntents";
// feedback tone type no longer required here; controller reads feedback hook internally
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import { infraLogger } from "@/shared/utils/infraLogger";
import { registry } from "@/config/logic";
const { timing } = registry;

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
    | {
          status: "invalid_input";
          reason:
              | "invalid_magnet_link"
              | "invalid_destination";
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
    addTorrentDefaults: AddTorrentDefaultsViewModel;
    openAddTorrentPicker: () => AddTorrentCommandOutcome;
    openAddMagnet: (magnetLink?: string) => AddTorrentCommandOutcome;
    handleTorrentWindowConfirm: (
        selection: AddTorrentSelection,
    ) => Promise<AddTorrentCommandOutcome>;
    closeAddTorrentWindow: () => void;
    setAddSource: (source: AddTorrentSource | null) => void;
}

export interface AddTorrentDefaultsViewModel {
    downloadDir: string;
    commitMode: AddTorrentDefaultsState["commitMode"];
    sequentialDownload: boolean;
    showAddDialog: boolean;
    setCommitMode: (value: AddTorrentDefaultsState["commitMode"]) => void;
    setShowAddDialog: (value: boolean) => void;
}

type AddSubmissionPayload = {
    label: string;
    sourceName: string | null;
    targetInfoHash?: string;
    execute: () => Promise<TorrentDispatchOutcome>;
    failureReason: "magnet_add_failed" | "metainfo_read_failed" | "add_file_failed";
};

type ActiveAddSubmission = {
    id: string;
    payload: AddSubmissionPayload;
    startedAtMs: number;
    knownHashesBefore: Set<string>;
    phase: "in_flight" | "unknown";
    toastKey: string | null;
};

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
    const { refreshSessionSettings } = useSession();
    const sessionDomain = useEngineSessionDomain();
    const {
        preferences: { addTorrentDefaults: addTorrentDefaultsState },
        setAddTorrentDefaults,
    } = usePreferences();
    const [addSource, setAddSource] = useState<AddTorrentSource | null>(null);
    const activeSubmissionRef = useRef<ActiveAddSubmission | null>(null);
    const submissionSeqRef = useRef(0);
    const torrentsRef = useRef<Array<Torrent | TorrentDetail>>(torrents);

    const { remember } = useDownloadPaths();
    const currentDownloadDir = settingsConfig.download_dir || "";

    const setCommitMode = useCallback(
        (value: AddTorrentDefaultsState["commitMode"]) => {
            setAddTorrentDefaults({
                ...addTorrentDefaultsState,
                commitMode: value,
            });
        },
        [addTorrentDefaultsState, setAddTorrentDefaults],
    );

    const setShowAddDialog = useCallback(
        (value: boolean) => {
            setAddTorrentDefaults({
                ...addTorrentDefaultsState,
                showAddDialog: value,
            });
        },
        [addTorrentDefaultsState, setAddTorrentDefaults],
    );

    const addTorrentDefaults = useMemo<AddTorrentDefaultsViewModel>(
        () => ({
            downloadDir: currentDownloadDir,
            commitMode: addTorrentDefaultsState.commitMode,
            sequentialDownload: settingsConfig.sequential_download,
            showAddDialog: addTorrentDefaultsState.showAddDialog,
            setCommitMode,
            setShowAddDialog,
        }),
        [
            addTorrentDefaultsState.commitMode,
            addTorrentDefaultsState.showAddDialog,
            currentDownloadDir,
            settingsConfig.sequential_download,
            setCommitMode,
            setShowAddDialog,
        ],
    );

    const persistCommittedDownloadDir = useCallback(
        async (downloadDir: string) => {
            const nextDownloadDir = downloadDir.trim();
            remember(nextDownloadDir);
            if (!nextDownloadDir || nextDownloadDir === currentDownloadDir.trim()) {
                return;
            }
            try {
                await sessionDomain.updateSessionSettings({
                    "download-dir": nextDownloadDir,
                });
                await refreshSessionSettings();
            } catch {
                // Keep the command outcome tied to the user action itself.
            }
        },
        [currentDownloadDir, refreshSessionSettings, remember, sessionDomain],
    );

    const showInFlightStatus = useCallback(() => {
        const active = activeSubmissionRef.current;
        if (!active) {
            return;
        }
        toast(
            active.phase === "unknown"
                ? t("modals.add_torrent.unknown_outcome_title")
                : t("modals.add_torrent.submission_already_running"),
            {
                description:
                    active.phase === "unknown"
                        ? t("modals.add_torrent.unknown_outcome_body")
                        : t("modals.add_torrent.background_progress"),
                variant: active.phase === "unknown" ? "warning" : "accent",
            timeout: timing.ui.toastMs,
            },
        );
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
            setAddSource({
                kind: "magnet",
                label: t("modals.add_source_magnet"),
                magnetLink: normalized ?? "",
            });
        },
        onOpenAddTorrentFromFile: async (file) => {
            if (activeSubmissionRef.current) {
                showInFlightStatus();
                return;
            }
            const decision = resolveAddTorrentFileHandlingDecision({
                showAddDialog: addTorrentDefaultsState.showAddDialog,
                hasDefaultDownloadDir: currentDownloadDir.trim().length > 0,
            });
            if (decision.action === "submit_directly") {
                void submitFileSourceDirectly(file);
                return;
            }
            try {
                const { parseTorrentFile } =
                    await import("@/shared/utils/torrent");
                const metadata = await parseTorrentFile(file);
                const nextSource = {
                    kind: "file",
                    file,
                    metadata,
                    label: metadata.name ?? file.name,
                } as const;
                setAddSource(nextSource);
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
        toast.close(submission.toastKey);
    }, []);

    const findMatchedTorrent = useCallback((submission: ActiveAddSubmission) => {
        const currentTorrents = torrentsRef.current;
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
                timing.timeouts.addSubmitTimeoutMinMs,
                settingsConfig.request_timeout_ms *
                    timing.timeouts.addSubmitTimeoutMultiplier,
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
                toastKey: toast(t("modals.add_torrent.submitting"), {
                    description: t("modals.add_torrent.background_progress"),
                    variant: "accent",
                    timeout: requestTimeoutMs,
                }),
            };
            activeSubmissionRef.current = submission;

            const retrySubmission = () => {
                if (activeSubmissionRef.current) {
                    toast.warning(t("modals.add_torrent.submission_already_running"), {
                        timeout: timing.ui.toastMs,
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
                toast.danger(failureMessage, {
                    timeout: timing.ui.toastMs,
                    actionProps: {
                        children: t("modals.add_torrent.retry"),
                        size: "sm",
                        variant: "secondary",
                        onPress: retrySubmission,
                    },
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
                toast.success(t("toolbar.feedback.added"), {
                    timeout: timing.ui.toastMs,
                    actionProps:
                        matchedTorrent && openTorrentDetailsById
                            ? {
                                  children: t("modals.add_torrent.open_details"),
                                  size: "sm",
                                  variant: "secondary",
                                  onPress: () => {
                                      void openTorrentDetailsById(
                                          String(matchedTorrent.id),
                                      );
                                  },
                              }
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
                active.toastKey = toast.warning(t("modals.add_torrent.unknown_outcome_title"), {
                    description: t("modals.add_torrent.unknown_outcome_body"),
                    timeout: timing.ui.toastMs * 3,
                    actionProps: {
                        children: t("modals.add_torrent.refresh_list"),
                        size: "sm",
                        variant: "secondary",
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
                                toast.warning(t("modals.add_torrent.unknown_retry_hint"), {
                                    timeout: timing.ui.toastMs,
                                    actionProps: {
                                        children: t("modals.add_torrent.retry"),
                                        size: "sm",
                                        variant: "secondary",
                                        onPress: retrySubmission,
                                    },
                                });
                            })();
                        },
                    },
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

    async function submitFileSourceDirectly(
        file: File,
    ): Promise<AddTorrentCommandOutcome> {
        const downloadDir = currentDownloadDir.trim();
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

        const metainfo = await parseTorrentFile(file);
        if (!metainfo.ok) {
            showFeedback(t("modals.file_tree_error"), "danger");
            return { status: "failed", reason: "metainfo_read_failed" };
        }
        const startNow = addTorrentDefaultsState.commitMode !== "paused";
        const submissionOutcome = beginSubmission({
            label: file.name,
            sourceName: file.name,
            failureReason: "add_file_failed",
            execute: () =>
                dispatch(
                    TorrentIntents.addTorrentFromFile(
                        metainfo.metainfoBase64,
                        downloadDir,
                        !startNow,
                        [],
                        [],
                        [],
                        [],
                        settingsConfig.sequential_download,
                    ),
                ),
        });

        if (submissionOutcome.status === "queued") {
            remember(downloadDir);
        }

        return submissionOutcome;
    }

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
            setAddSource({
                kind: "magnet",
                label: t("modals.add_source_magnet"),
                magnetLink: normalized ?? "",
            });
            return { status: "opened" };
        },
        [showInFlightStatus, t],
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
                            ),
                        ),
                });
                if (submissionOutcome.status === "queued") {
                    closeAddTorrentWindow();
                    await persistCommittedDownloadDir(downloadDir);
                }
                return submissionOutcome;
            }

            const normalized = normalizeMagnetLink(selection.magnetLink);
            if (!normalized) {
                showFeedback(t("modals.add_torrent.magnet_error"), "warning");
                return {
                    status: "invalid_input",
                    reason: "invalid_magnet_link",
                };
            }
            const infoHash = extractMagnetInfoHashCandidate(normalized);
            if (infoHash && pendingDeletionHashesRef.current.has(infoHash)) {
                showFeedback(t("toolbar.feedback.pending_delete"), "warning");
                return { status: "blocked_pending_delete" };
            }
            const submissionOutcome = beginSubmission({
                label: normalized,
                sourceName: null,
                targetInfoHash: infoHash ?? undefined,
                failureReason: "magnet_add_failed",
                execute: () =>
                    dispatch(
                        TorrentIntents.addMagnetTorrent(
                            normalized,
                            downloadDir,
                            !startNow,
                            selection.options.sequential,
                        ),
                    ),
            });
            if (submissionOutcome.status === "queued") {
                closeAddTorrentWindow();
                await persistCommittedDownloadDir(downloadDir);
            }
            return submissionOutcome;
        },
        [
            activeSubmissionRef,
            addSource,
            beginSubmission,
            closeAddTorrentWindow,
            dispatch,
            pendingDeletionHashesRef,
            persistCommittedDownloadDir,
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
        handleTorrentWindowConfirm,
        closeAddTorrentWindow,
        setAddSource,
    };
}


