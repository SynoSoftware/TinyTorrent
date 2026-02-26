import { Button, Input } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { HardDrive, type LucideIcon } from "lucide-react";
import { useSession } from "@/app/context/SessionContext";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { scheduler } from "@/app/services/scheduler";
import {
    probeRelocationTargetRoot,
    resolveRelocationTargetRoot,
    validateRelocationTargetPath,
    type RelocationPreflightFreeSpace,
    type RelocationRootProbeResult,
    type RelocationTargetPathValidationResult,
} from "@/modules/dashboard/domain/torrentRelocation";
import {
    SET_LOCATION_VALIDATION_DEBOUNCE_MS,
} from "@/config/logic";
import { FORM } from "@/shared/ui/layout/glass-surface";
import { formatBytes } from "@/shared/utils/format";
import { TEXT_ROLE } from "@/config/textRoles";
import { DiskSpaceGauge } from "@/shared/ui/workspace/DiskSpaceGauge";
import { ModalEx } from "@/shared/ui/layout/ModalEx";
import type { DaemonPathStyle } from "@/services/rpc/types";

type RelocationValidationFailureReason = Extract<RelocationTargetPathValidationResult, { ok: false }>["reason"];

type ValidationState =
    | { status: "idle" }
    | { status: "checking" }
    | {
          status: "valid";
          freeSpace?: RelocationPreflightFreeSpace;
          probeWarning?: "free_space_unavailable";
      }
    | {
          status: "invalid";
          reason: RelocationValidationFailureReason;
      };

type RootProbeCacheEntry =
    | {
          status: "ok";
          freeSpace?: RelocationPreflightFreeSpace;
          probeWarning?: "free_space_unavailable";
      }
    | { status: "root_unreachable" };

type ActiveRootProbe = (RootProbeCacheEntry & { root: string }) | null;

export interface SetDownloadPathModalProps {
    isOpen: boolean;
    titleKey?: string;
    titleIcon?: LucideIcon;
    initialPath: string;
    canPickDirectory: boolean;
    allowInvalidPathApply?: boolean;
    onClose: () => void;
    onPickDirectory: (currentPath: string) => Promise<string | null>;
    onApply: (params: { path: string }) => Promise<void>;
}

const toErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    if (typeof error === "string" && error.trim().length > 0) {
        return error;
    }
    return fallback;
};

const normalizePathForDaemon = (value: string, daemonPathStyle: DaemonPathStyle): string => {
    const trimmed = value.trim();
    if (daemonPathStyle === "windows") {
        return trimmed.replace(/\//g, "\\");
    }
    return trimmed;
};

const getValidationReasonMessage = (
    reason: RelocationValidationFailureReason,
    t: ReturnType<typeof useTranslation>["t"],
): string => {
    if (reason === "invalid_format") {
        return t("set_location.reason.absolute_path_required");
    }
    if (reason === "invalid_windows_syntax") {
        return t("set_location.reason.invalid_windows_path");
    }
    return t("directory_browser.error");
};

export default function SetDownloadPathModal({
    isOpen,
    titleKey = "modals.set_download_location.title",
    titleIcon = HardDrive,
    initialPath,
    canPickDirectory,
    allowInvalidPathApply = false,
    onClose,
    onPickDirectory,
    onApply,
}: SetDownloadPathModalProps) {
    const { t } = useTranslation();
    const { daemonPathStyle } = useSession();
    const torrentClient = useTorrentClient();
    const [path, setPath] = useState(initialPath);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [validationState, setValidationState] = useState<ValidationState>({
        status: "idle",
    });
    const [validatedPath, setValidatedPath] = useState<string | null>(null);
    const [activeRootProbe, setActiveRootProbe] = useState<ActiveRootProbe>(null);
    const validationRunIdRef = useRef(0);
    const rootProbeRunIdRef = useRef(0);
    const rootProbeCacheRef = useRef<Map<string, RootProbeCacheEntry>>(new Map());
    const contentRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        setPath(normalizePathForDaemon(initialPath, daemonPathStyle));
        setIsSubmitting(false);
        setSubmitError(null);
        setValidationState({ status: "idle" });
        setValidatedPath(null);
        rootProbeCacheRef.current.clear();
        rootProbeRunIdRef.current += 1;
        setActiveRootProbe(null);
    }, [daemonPathStyle, initialPath, isOpen]);

    useEffect(() => {
        const runId = rootProbeRunIdRef.current + 1;
        rootProbeRunIdRef.current = runId;

        if (!isOpen) {
            setActiveRootProbe(null);
            return;
        }
        if (daemonPathStyle !== "windows") {
            setActiveRootProbe(null);
            return;
        }

        const normalizedPath = normalizePathForDaemon(path, daemonPathStyle).trim();
        const root = resolveRelocationTargetRoot(normalizedPath, daemonPathStyle);
        if (!root) {
            setActiveRootProbe(null);
            return;
        }

        const cached = rootProbeCacheRef.current.get(root);
        if (cached) {
            setActiveRootProbe({
                root,
                ...cached,
            });
            return;
        }

        void probeRelocationTargetRoot(root, daemonPathStyle, torrentClient)
            .then((probeResult) => {
                if (rootProbeRunIdRef.current !== runId) {
                    return;
                }
                const nextCacheEntry: RootProbeCacheEntry = probeResult.ok
                    ? {
                          status: "ok",
                          freeSpace: probeResult.freeSpace,
                          probeWarning: probeResult.probeWarning,
                      }
                    : { status: "root_unreachable" };
                rootProbeCacheRef.current.set(root, nextCacheEntry);
                setActiveRootProbe({
                    root,
                    ...nextCacheEntry,
                });
            })
            .catch(() => {
                if (rootProbeRunIdRef.current !== runId) {
                    return;
                }
                const nextCacheEntry: RootProbeCacheEntry = {
                    status: "root_unreachable",
                };
                rootProbeCacheRef.current.set(root, nextCacheEntry);
                setActiveRootProbe({
                    root,
                    ...nextCacheEntry,
                });
            });
    }, [daemonPathStyle, isOpen, path, torrentClient]);

    useEffect(() => {
        validationRunIdRef.current += 1;
        if (!isOpen) {
            return;
        }

        const normalizedPath = normalizePathForDaemon(path, daemonPathStyle).trim();
        if (!normalizedPath || daemonPathStyle === "unknown") {
            setValidationState({ status: "idle" });
            setValidatedPath(null);
            return;
        }
        setValidationState({ status: "idle" });

        const runId = validationRunIdRef.current;
        const cancelValidation = scheduler.scheduleTimeout(() => {
            setValidationState({ status: "checking" });
            const applyValidationResult = (result: RelocationTargetPathValidationResult) => {
                if (validationRunIdRef.current !== runId) {
                    return;
                }
                setValidatedPath(normalizedPath);
                if (result.ok) {
                    setValidationState({
                        status: "valid",
                        freeSpace: result.freeSpace,
                        probeWarning: result.probeWarning,
                    });
                    return;
                }
                setValidationState({
                    status: "invalid",
                    reason: result.reason,
                });
            };

            if (daemonPathStyle === "windows") {
                const root = resolveRelocationTargetRoot(normalizedPath, daemonPathStyle);
                if (!root) {
                    setValidatedPath(normalizedPath);
                    setValidationState({
                        status: "invalid",
                        reason: "invalid_format",
                    });
                    return;
                }
                if (!activeRootProbe || activeRootProbe.root !== root) {
                    setValidationState({ status: "idle" });
                    return;
                }

                const rootProbe: RelocationRootProbeResult =
                    activeRootProbe.status === "ok"
                        ? {
                              ok: true,
                              freeSpace: activeRootProbe.freeSpace,
                              probeWarning: activeRootProbe.probeWarning,
                          }
                        : { ok: false, reason: "root_unreachable" };

                void validateRelocationTargetPath(normalizedPath, daemonPathStyle, torrentClient, {
                    rootProbe,
                    rootProbeRoot: root,
                }).then(applyValidationResult);
                return;
            }

            void validateRelocationTargetPath(normalizedPath, daemonPathStyle, torrentClient)
                .then(applyValidationResult)
                .catch(() => {
                    if (validationRunIdRef.current !== runId) {
                        return;
                    }
                    setValidatedPath(normalizedPath);
                    setValidationState({
                        status: "invalid",
                        reason: "root_unreachable",
                    });
                });
        }, SET_LOCATION_VALIDATION_DEBOUNCE_MS);

        return cancelValidation;
    }, [activeRootProbe, daemonPathStyle, isOpen, path, torrentClient]);

    useEffect(() => {
        if (!isOpen) return;
        const frame = window.requestAnimationFrame(() => {
            const input = contentRef.current?.querySelector("input");
            if (!input) return;
            input.focus();
            input.select();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [isOpen]);

    const trimmedPath = useMemo(() => path.trim(), [path]);
    const manualEntryPromptKey = allowInvalidPathApply
        ? "directory_browser.manual_entry_prompt_move"
        : "directory_browser.manual_entry_prompt_locate";
    const manualEntryPrompt = t(manualEntryPromptKey);
    const normalizedPath = useMemo(
        () => normalizePathForDaemon(trimmedPath, daemonPathStyle),
        [daemonPathStyle, trimmedPath],
    );
    const hasFreshValidValidation =
        validationState.status === "valid" && validatedPath === normalizedPath;
    const canApply =
        trimmedPath.length > 0 &&
        !isSubmitting &&
        (allowInvalidPathApply || hasFreshValidValidation);

    const handlePathChange = useCallback(
        (value: string) => {
            setPath(value);
            if (submitError) {
                setSubmitError(null);
            }
        },
        [submitError],
    );

    const handleBrowse = useCallback(async () => {
        if (!canPickDirectory || isSubmitting) return;
        try {
            const pickedPath = await onPickDirectory(path);
            if (!pickedPath) return;
            setPath(normalizePathForDaemon(pickedPath, daemonPathStyle));
            setSubmitError(null);
        } catch (pickError) {
            setSubmitError(toErrorMessage(pickError, t("toolbar.feedback.failed")));
        }
    }, [canPickDirectory, daemonPathStyle, isSubmitting, onPickDirectory, path, t]);

    const gaugeFreeSpace = useMemo(() => {
        const freeSpaceCandidate =
            daemonPathStyle === "windows"
                ? activeRootProbe?.status === "ok"
                    ? activeRootProbe.freeSpace
                    : undefined
                : validationState.status === "valid"
                  ? validationState.freeSpace
                  : undefined;

        if (typeof freeSpaceCandidate?.sizeBytes !== "number" || typeof freeSpaceCandidate.totalSize !== "number") {
            return null;
        }
        return freeSpaceCandidate;
    }, [activeRootProbe, daemonPathStyle, validationState]);
    const shouldRenderGauge = gaugeFreeSpace !== null && validationState.status === "valid";

    const pathValidationFeedback = useMemo(() => {
        const knownFreeSpaceBytes =
            validationState.status === "valid" && typeof validationState.freeSpace?.sizeBytes === "number"
                ? validationState.freeSpace.sizeBytes
                : activeRootProbe?.status === "ok" && typeof activeRootProbe.freeSpace?.sizeBytes === "number"
                  ? activeRootProbe.freeSpace.sizeBytes
                  : undefined;

        if (submitError) {
            return {
                message: submitError,
                className: FORM.locationEditorValidationWarning,
            };
        }

        if (!trimmedPath) {
            return {
                message: "\u00A0",
                className: FORM.locationEditorValidationHint,
            };
        }

        if (validationState.status === "invalid") {
            return {
                message: getValidationReasonMessage(validationState.reason, t),
                className: FORM.locationEditorValidationWarning,
            };
        }

        if (daemonPathStyle === "windows" && activeRootProbe?.status === "root_unreachable") {
            return {
                message: t("directory_browser.error"),
                className: FORM.locationEditorValidationWarning,
            };
        }

        if (!shouldRenderGauge && typeof knownFreeSpaceBytes === "number") {
            return {
                message: t("set_location.reason.available_space", {
                    size: formatBytes(knownFreeSpaceBytes),
                }),
                className: FORM.locationEditorValidationHint,
            };
        }

        return {
            message: "\u00A0",
            className: FORM.locationEditorValidationHint,
        };
    }, [activeRootProbe, daemonPathStyle, submitError, t, trimmedPath, validationState, shouldRenderGauge]);

    const handleApply = useCallback(async () => {
        if (isSubmitting) return;
        if (!trimmedPath) {
            setSubmitError(t("directory_browser.validation_required"));
            return;
        }
        if (!allowInvalidPathApply) {
            if (validationState.status === "invalid") {
                setSubmitError(getValidationReasonMessage(validationState.reason, t));
                return;
            }
            if (!hasFreshValidValidation) {
                setSubmitError(t("set_location.reason.validation_pending"));
                return;
            }
        }
        const normalizedPath = normalizePathForDaemon(trimmedPath, daemonPathStyle);
        setPath(normalizedPath);
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            await onApply({
                path: normalizedPath,
            });
            onClose();
        } catch (applyError) {
            setSubmitError(toErrorMessage(applyError, t("toolbar.feedback.failed")));
        } finally {
            setIsSubmitting(false);
        }
    }, [
        allowInvalidPathApply,
        daemonPathStyle,
        hasFreshValidValidation,
        isSubmitting,
        onApply,
        onClose,
        t,
        trimmedPath,
        validatedPath,
        validationState,
    ]);

    const handleClose = useCallback(() => {
        if (isSubmitting) return;
        onClose();
    }, [isSubmitting, onClose]);
    const handlePathInputKeyDown = useCallback(
        (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void handleApply();
        },
        [handleApply],
    );

    if (!isOpen) {
        return null;
    }

    return (
        <ModalEx
            open={isOpen}
            onClose={handleClose}
            title={t(titleKey)}
            icon={titleIcon}
            size="sm"
            disableClose={isSubmitting}
            secondaryAction={{
                label: t("modals.cancel"),
                onPress: handleClose,
                disabled: isSubmitting,
            }}
            primaryAction={{
                label: t("modals.set_download_location.apply"),
                onPress: () => {
                    void handleApply();
                },
                loading: isSubmitting,
                disabled: !canApply,
            }}
        >
            <div ref={contentRef} className={FORM.locationEditorRoot}>
                <div className={FORM.locationEditorRow}>
                    <div className={FORM.locationEditorField}>
                        <div className={FORM.locationEditorPathRow}>
                            <div className={FORM.locationEditorHeader}>
                                <label htmlFor="set-download-location-path" className={TEXT_ROLE.caption}>
                                    {t("directory_browser.path_label")}
                                </label>
                            </div>
                            <div className={FORM.locationEditorInputWrap}>
                                <Input
                                    id="set-download-location-path"
                                    className={TEXT_ROLE.codeMuted}
                                    classNames={FORM.locationEditorInputClassNames}
                                    value={path}
                                    onValueChange={handlePathChange}
                                    isDisabled={isSubmitting}
                                    isInvalid={Boolean(submitError) || validationState.status === "invalid"}
                                    variant="flat"
                                    placeholder={t("directory_browser.enter_path")}
                                    spellCheck="false"
                                    autoComplete="off"
                                    aria-label={t("directory_browser.path_label")}
                                    title={manualEntryPrompt}
                                    onKeyDown={handlePathInputKeyDown}
                                />
                            </div>
                            {canPickDirectory ? (
                                <div className={FORM.locationEditorBrowseWrap}>
                                    <Button
                                        variant="flat"
                                        onPress={() => {
                                            void handleBrowse();
                                        }}
                                        isDisabled={isSubmitting}
                                    >
                                        {t("modals.set_download_location.browse")}
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                        <div className={FORM.locationEditorFeedbackSlot}>
                            {shouldRenderGauge ? (
                                <DiskSpaceGauge
                                    path={gaugeFreeSpace.path}
                                    freeBytes={gaugeFreeSpace.sizeBytes}
                                    totalBytes={gaugeFreeSpace.totalSize}
                                />
                            ) : (
                                <div className={FORM.locationEditorValidationRow}>
                                    <span className={pathValidationFeedback.className}>
                                        {pathValidationFeedback.message}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </ModalEx>
    );
}
