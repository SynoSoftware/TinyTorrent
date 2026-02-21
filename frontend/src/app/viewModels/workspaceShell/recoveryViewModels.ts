import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UiMode } from "@/app/utils/uiMode";
import type { RecoveryControllerResult } from "@/modules/dashboard/hooks/useRecoveryController";
import type { RecoveryModalViewModel } from "@/modules/dashboard/components/TorrentRecoveryModal";
import type { SetLocationOutcome } from "@/app/context/RecoveryContext";
import { scheduler } from "@/app/services/scheduler";
import {
    RECOVERY_MODAL_RESOLVED_COUNTDOWN_TICK_MS,
    RECOVERY_POLL_INTERVAL_MS,
} from "@/config/logic";
import { getSurfaceCaptionKey } from "@/app/utils/setLocation";
import type {
    RecoveryOutcome,
    RecoveryRecommendedAction,
} from "@/services/recovery/recovery-controller";
import { getRecoveryFingerprint } from "@/app/domain/recoveryUtils";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";

export interface SetLocationEditorControls {
    state: RecoveryControllerResult["locationEditor"]["state"];
    cancel: RecoveryControllerResult["locationEditor"]["cancel"];
    release: RecoveryControllerResult["locationEditor"]["release"];
    confirm: RecoveryControllerResult["locationEditor"]["confirm"];
    change: RecoveryControllerResult["locationEditor"]["change"];
}

export interface RecoveryContextSnapshot {
    uiMode: UiMode;
    canOpenFolder: boolean;
    setLocationState: SetLocationEditorControls["state"];
    cancelSetLocation: SetLocationEditorControls["cancel"];
    releaseSetLocation: SetLocationEditorControls["release"];
    confirmSetLocation: SetLocationEditorControls["confirm"];
    handleLocationChange: SetLocationEditorControls["change"];
    recoverySession: RecoveryControllerResult["state"]["session"];
    setLocationCapability: RecoveryControllerResult["setLocation"]["capability"];
    getRecoverySessionForKey: RecoveryControllerResult["actions"]["getRecoverySessionForKey"];
}

export interface RecoveryContextModelParams {
    uiMode: UiMode;
    canOpenFolder: boolean;
    locationEditor: SetLocationEditorControls;
    recoverySession: RecoveryControllerResult["state"]["session"];
    setLocationCapability: RecoveryControllerResult["setLocation"]["capability"];
    getRecoverySessionForKey: RecoveryControllerResult["actions"]["getRecoverySessionForKey"];
}

export function useRecoveryContextModel({
    uiMode,
    canOpenFolder,
    locationEditor,
    recoverySession,
    setLocationCapability,
    getRecoverySessionForKey,
}: RecoveryContextModelParams): RecoveryContextSnapshot {
    return useMemo(
        () => ({
            uiMode,
            canOpenFolder,
            setLocationState: locationEditor.state,
            cancelSetLocation: locationEditor.cancel,
            releaseSetLocation: locationEditor.release,
            confirmSetLocation: locationEditor.confirm,
            handleLocationChange: locationEditor.change,
            recoverySession,
            setLocationCapability,
            getRecoverySessionForKey,
        }),
        [
            uiMode,
            canOpenFolder,
            locationEditor.state,
            locationEditor.cancel,
            locationEditor.release,
            locationEditor.confirm,
            locationEditor.change,
            recoverySession,
            setLocationCapability,
            getRecoverySessionForKey,
        ],
    );
}

export interface RecoveryModalPropsDeps {
    t: (key: string, options?: Record<string, unknown>) => string;
    recoverySession: RecoveryControllerResult["state"]["session"];
    isBusy: boolean;
    onClose: RecoveryControllerResult["modal"]["close"];
    onRecreate: RecoveryControllerResult["modal"]["recreateFolder"];
    onAutoRetry: RecoveryControllerResult["modal"]["autoRetry"];
    locationEditor: SetLocationEditorControls;
    setLocationCapability: RecoveryControllerResult["setLocation"]["capability"];
    handleSetLocation: (
        torrent: Torrent | TorrentDetail,
        options?: {
            mode?: "browse" | "manual";
            surface?: "recovery-modal" | "general-tab" | "context-menu";
        },
    ) => Promise<SetLocationOutcome>;
    handleDownloadMissing: (
        torrent: Torrent,
        options?: { recreateFolder?: boolean },
    ) => Promise<void>;
    queuedCount: RecoveryControllerResult["state"]["queuedCount"];
    queuedItems: RecoveryControllerResult["state"]["queuedItems"];
}

const RECOVERY_MESSAGE_LABEL_KEY: Record<string, string> = {
    insufficient_free_space: "recovery.message.insufficient_free_space",
    path_ready: "recovery.message.path_ready",
    path_check_unknown: "recovery.message.path_check_unknown",
    directory_created: "recovery.message.directory_created",
    directory_creation_denied: "recovery.message.directory_creation_denied",
    directory_creation_failed: "recovery.message.directory_creation_failed",
    directory_creation_not_supported:
        "recovery.message.directory_creation_not_supported",
    path_access_denied: "recovery.message.path_access_denied",
    disk_full: "recovery.message.disk_full",
    path_check_failed: "recovery.message.path_check_failed",
    permission_denied: "recovery.message.permission_denied",
    no_download_path_known: "recovery.message.no_download_path_known",
    free_space_check_not_supported:
        "recovery.message.free_space_check_not_supported",
    free_space_check_failed: "recovery.message.free_space_check_failed",
    verify_not_supported: "recovery.message.verify_not_supported",
    verify_started: "recovery.message.verify_started",
    verify_failed: "recovery.message.verify_failed",
    reannounce_not_supported: "recovery.message.reannounce_not_supported",
    reannounce_started: "recovery.message.reannounce_started",
    reannounce_failed: "recovery.message.reannounce_failed",
    location_updated: "recovery.message.location_updated",
    filesystem_probing_not_supported:
        "recovery.message.filesystem_probing_not_supported",
};

const resolveOutcomeMessage = (
    outcome: RecoveryOutcome | null,
    t: (key: string, options?: Record<string, unknown>) => string,
): string | null => {
    if (!outcome?.message) return null;
    const key = RECOVERY_MESSAGE_LABEL_KEY[outcome.message];
    return key ? t(key) : outcome.message;
};

export function useRecoveryModalViewModel({
    t,
    recoverySession,
    isBusy,
    onClose,
    onRecreate,
    onAutoRetry,
    locationEditor,
    setLocationCapability,
    handleSetLocation,
    handleDownloadMissing,
    queuedCount,
    queuedItems,
}: RecoveryModalPropsDeps): RecoveryModalViewModel {
    const autoRetryRef = useRef(false);
    const [countdownNowMs, setCountdownNowMs] = useState(() => Date.now());
    const torrent = recoverySession?.torrent ?? null;
    const classification = recoverySession?.classification ?? null;
    const outcome = recoverySession?.outcome ?? null;
    const autoCloseAtMs = recoverySession?.autoCloseAtMs ?? null;
    const busy = Boolean(isBusy);
    const isOpen = Boolean(recoverySession);
    const currentTorrentKey = getRecoveryFingerprint(torrent);
    const downloadDir =
        torrent?.downloadDir ?? torrent?.savePath ?? torrent?.downloadDir ?? "";
    const locationEditorState = locationEditor.state;
    const locationEditorStateKey = locationEditorState?.torrentKey ?? "";
    const isUnknownConfidence = classification?.confidence === "unknown";
    const isPathLoss = classification?.kind === "pathLoss";
    const isVolumeLoss = classification?.kind === "volumeLoss";
    const isAccessDenied = classification?.kind === "accessDenied";
    const locationEditorVisible = Boolean(
        locationEditorState?.surface === "recovery-modal" &&
            locationEditorStateKey &&
            locationEditorStateKey === currentTorrentKey,
    );
    const isAutoClosePending = Boolean(autoCloseAtMs && outcome?.kind === "resolved");
    const resolvedCountdownSeconds = isAutoClosePending
        ? Math.max(
              1,
              Math.ceil(((autoCloseAtMs ?? countdownNowMs) - countdownNowMs) / 1000),
          )
        : null;
    const canSetLocation =
        setLocationCapability.canBrowse || setLocationCapability.supportsManual;

    const handleClose = useCallback(() => {
        locationEditor.release();
        onClose();
    }, [locationEditor, onClose]);

    useEffect(() => {
        if (!isAutoClosePending || !autoCloseAtMs) return;
        const tick = () => setCountdownNowMs(Date.now());
        tick();
        const task = scheduler.scheduleRecurringTask(
            tick,
            RECOVERY_MODAL_RESOLVED_COUNTDOWN_TICK_MS,
        );
        return () => {
            task.cancel();
        };
    }, [isAutoClosePending, autoCloseAtMs]);

    useEffect(() => {
        if (
            !isOpen ||
            !onAutoRetry ||
            busy ||
            locationEditorVisible ||
            isAutoClosePending
        ) {
            return;
        }
        const task = scheduler.scheduleRecurringTask(async () => {
            if (autoRetryRef.current) return;
            autoRetryRef.current = true;
            void onAutoRetry().finally(() => {
                autoRetryRef.current = false;
            });
        }, RECOVERY_POLL_INTERVAL_MS);
        return () => {
            task.cancel();
            autoRetryRef.current = false;
        };
    }, [
        busy,
        isAutoClosePending,
        isOpen,
        locationEditorVisible,
        onAutoRetry,
    ]);

    return useMemo(() => {
        const title = (() => {
            if (isUnknownConfidence) return t("recovery.modal_title_fallback");
            if (isPathLoss) return t("recovery.modal_title_folder");
            if (isVolumeLoss) return t("recovery.modal_title_drive");
            if (isAccessDenied) return t("recovery.modal_title_access");
            return t("recovery.modal_title_fallback");
        })();
        const bodyText = (() => {
            if (isUnknownConfidence) return t("recovery.modal_body_fallback");
            if (isPathLoss) return t("recovery.modal_body_folder");
            if (isVolumeLoss) return t("recovery.modal_body_drive");
            if (isAccessDenied) return t("recovery.modal_body_access");
            return t("recovery.modal_body_fallback");
        })();
        const statusText = (() => {
            if (isUnknownConfidence) return t("recovery.inline_fallback");
            if (isPathLoss) {
                return t("recovery.status.folder_not_found", {
                    path: (classification?.path ?? downloadDir) || t("labels.unknown"),
                });
            }
            if (isVolumeLoss) {
                return t("recovery.status.drive_disconnected", {
                    drive: classification?.root ?? t("labels.unknown"),
                });
            }
            if (isAccessDenied) return t("recovery.status.access_denied");
            return t("recovery.generic_header");
        })();
        const locationLabel =
            ((isVolumeLoss ? classification?.root : classification?.path) ??
                downloadDir) ||
            t("labels.unknown");
        const locationEditorBusy = locationEditorState?.status !== "idle";
        const locationEditorVerifying = locationEditorState?.status === "verifying";
        const locationEditorStatusMessage = locationEditorVerifying
            ? t("recovery.status.applying_location")
            : isUnknownConfidence
              ? t("recovery.inline_fallback")
              : undefined;
        const outcomeMessage =
            isAutoClosePending && resolvedCountdownSeconds
                ? t("recovery.status.resolved_auto_close", {
                      seconds: resolvedCountdownSeconds,
                  })
                : resolveOutcomeMessage(outcome, t);
        const resolveKindLabel = (kind: string) => {
            if (kind === "volumeLoss") return t("recovery.inbox.kind.volume_loss");
            if (kind === "pathLoss") return t("recovery.inbox.kind.path_loss");
            if (kind === "accessDenied") {
                return t("recovery.inbox.kind.access_denied");
            }
            return t("recovery.inbox.kind.data_gap");
        };
        const groupedInboxItems = new Map<
            string,
            {
                key: string;
                kind: string;
                locationLabel: string;
                sampleTorrentName: string;
                count: number;
            }
        >();
        queuedItems.forEach((item) => {
            const location = item.locationLabel || "";
            const groupKey = `${item.kind}|${location}`;
            const existing = groupedInboxItems.get(groupKey);
            if (existing) {
                existing.count += 1;
                return;
            }
            groupedInboxItems.set(groupKey, {
                key: groupKey,
                kind: item.kind,
                locationLabel: location,
                sampleTorrentName: item.torrentName,
                count: 1,
            });
        });
        const inboxItems = Array.from(groupedInboxItems.values())
            .slice(0, 3)
            .map((group) => {
                const kindLabel = resolveKindLabel(group.kind);
                const label =
                    group.count > 1
                        ? t("recovery.inbox.group_label", {
                              count: group.count,
                              kind: kindLabel,
                          })
                        : group.sampleTorrentName;
                const description = group.locationLabel
                    ? t("recovery.inbox.item_with_location", {
                          kind: kindLabel,
                          location: group.locationLabel,
                      })
                    : kindLabel;
                return {
                    id: group.key,
                    label,
                    description,
                };
            });
        const inboxVisible = queuedCount > 0;
        const cancelLabel = inboxVisible
            ? t("recovery.inbox.dismiss_all")
            : t("modals.cancel");
        const buildRecoveryAction = (
            action?: RecoveryRecommendedAction,
        ): { label: string; onPress: () => void; isDisabled: boolean } | null => {
            if (!action || !torrent) return null;
            const base = {
                isDisabled: busy || locationEditorVisible || isAutoClosePending,
            };
            if (action === "downloadMissing") {
                return {
                    ...base,
                    label: t("recovery.action_download"),
                    onPress: () => {
                        void handleDownloadMissing(torrent);
                    },
                };
            }
            if (action === "locate") {
                if (!canSetLocation) return null;
                return {
                    ...base,
                    label: t("recovery.action_locate"),
                    onPress: () => {
                        void handleSetLocation(torrent, {
                            surface: "recovery-modal",
                            mode: "browse",
                        });
                    },
                };
            }
            if (action === "chooseLocation") {
                if (!canSetLocation) return null;
                return {
                    ...base,
                    label: t("recovery.action.choose_location"),
                    onPress: () => {
                        void handleSetLocation(torrent, {
                            surface: "recovery-modal",
                            mode: "manual",
                        });
                    },
                };
            }
            if (action === "retry") {
                if (!onAutoRetry) return null;
                return {
                    ...base,
                    label: t("recovery.action_retry"),
                    onPress: () => {
                        void onAutoRetry();
                    },
                };
            }
            return null;
        };
        const recommendedActions = classification?.recommendedActions ?? [];
        const resolvedPrimaryAction = (() => {
            for (const action of recommendedActions) {
                const candidate = buildRecoveryAction(action);
                if (candidate) {
                    return candidate;
                }
            }
            return null;
        })();
        const primaryAction = resolvedPrimaryAction ?? {
            label: t("recovery.action_locate"),
            onPress: () => {},
            isDisabled: true,
        };
        return {
            isOpen,
            busy,
            title,
            bodyText,
            statusText,
            locationLabel,
            locationEditor: {
                visible: locationEditorVisible,
                value: locationEditorState?.inputPath ?? "",
                error: locationEditorState?.error,
                caption: t(getSurfaceCaptionKey("recovery-modal")),
                statusMessage: locationEditorStatusMessage,
                isBusy: locationEditorBusy,
                onChange: locationEditor.change,
                onSubmit: () => {
                    void locationEditor.confirm();
                },
                onCancel: locationEditor.cancel,
                disableCancel: locationEditorBusy,
            },
            showWaitingForDrive: isVolumeLoss && !isAutoClosePending,
            recoveryOutcomeMessage: outcomeMessage,
            inbox: {
                visible: inboxVisible,
                title: t("recovery.inbox.title", { count: queuedCount }),
                subtitle: t("recovery.inbox.subtitle"),
                items: inboxItems,
                moreCount: Math.max(0, queuedCount - inboxItems.length),
            },
            showRecreate:
                isPathLoss &&
                classification?.confidence === "certain" &&
                Boolean(onRecreate),
            onRecreate: onRecreate ? () => void onRecreate() : undefined,
            onClose: handleClose,
            cancelLabel,
            primaryAction,
        };
    }, [
        busy,
        canSetLocation,
        classification,
        downloadDir,
        handleClose,
        handleDownloadMissing,
        handleSetLocation,
        isAutoClosePending,
        locationEditor,
        locationEditorState,
        locationEditorVisible,
        isAccessDenied,
        isOpen,
        isPathLoss,
        isUnknownConfidence,
        isVolumeLoss,
        onAutoRetry,
        onRecreate,
        outcome,
        queuedCount,
        queuedItems,
        resolvedCountdownSeconds,
        t,
        torrent,
    ]);
}
