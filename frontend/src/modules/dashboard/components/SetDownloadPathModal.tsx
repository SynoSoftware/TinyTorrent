import { Button, Input } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { HardDrive, type LucideIcon } from "lucide-react";
import type { DaemonPathStyle } from "@/services/rpc/types";
import { type DestinationValidationReason, normalizeDestinationPathForDaemon } from "@/shared/domain/destinationPath";
import { SET_LOCATION_VALIDATION_DEBOUNCE_MS } from "@/config/logic";
import { FORM } from "@/shared/ui/layout/glass-surface";
import { formatBytes } from "@/shared/utils/format";
import { TEXT_ROLE } from "@/config/textRoles";
import { DiskSpaceGauge } from "@/shared/ui/workspace/DiskSpaceGauge";
import { ModalEx } from "@/shared/ui/layout/ModalEx";
import { useDestinationPathValidation, type DestinationPathValidationResult } from "@/shared/hooks/useDestinationPathValidation";
import { getDestinationValidationReasonMessage } from "@/shared/utils/destinationPathValidationMessage";

export interface SetDownloadPathModalProps {
    isOpen: boolean;
    titleKey?: string;
    titleIcon?: LucideIcon;
    initialPath: string;
    daemonPathStyle: DaemonPathStyle;
    checkFreeSpace?: (path: string) => Promise<unknown>;
    canPickDirectory: boolean;
    allowCreatePath?: boolean;
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

type ApplyState =
    | {
          canApply: true;
          normalizedPath: string;
          blockReason: null;
          validationReason: null;
      }
    | {
          canApply: false;
          normalizedPath: string;
          blockReason: "empty" | "invalid" | "pending";
          validationReason: DestinationValidationReason | null;
      };

type PathFeedbackState =
    | {
          kind: "gauge";
          freeSpace: { path: string; sizeBytes: number; totalSize: number };
      }
    | {
          kind: "message";
          message: string;
          className: string;
      };

const resolveApplyState = ({
    trimmedPath,
    validation,
}: {
    trimmedPath: string;
    validation: DestinationPathValidationResult;
}): ApplyState => {
    if (!trimmedPath) {
        return {
            canApply: false,
            normalizedPath: validation.normalizedPath,
            blockReason: "empty",
            validationReason: null,
        };
    }

    if (validation.status === "invalid") {
        return {
            canApply: false,
            normalizedPath: validation.normalizedPath,
            blockReason: "invalid",
            validationReason: validation.reason,
        };
    }

    if (validation.status !== "valid") {
        return {
            canApply: false,
            normalizedPath: validation.normalizedPath,
            blockReason: "pending",
            validationReason: null,
        };
    }

    return {
        canApply: true,
        normalizedPath: validation.normalizedPath,
        blockReason: null,
        validationReason: null,
    };
};

const resolveApplyBlockMessage = (
    applyState: ApplyState,
    t: ReturnType<typeof useTranslation>["t"],
): string => {
    if (applyState.blockReason === "empty") {
        return t("directory_browser.validation_required");
    }
    if (applyState.blockReason === "invalid") {
        if (applyState.validationReason) {
            return getDestinationValidationReasonMessage(applyState.validationReason, t);
        }
        return t("directory_browser.error");
    }
    return t("set_location.reason.validation_pending");
};

const resolvePathFeedbackState = ({
    submitError,
    trimmedPath,
    validation,
    applyState,
    t,
}: {
    submitError: string | null;
    trimmedPath: string;
    validation: DestinationPathValidationResult;
    applyState: ApplyState;
    t: ReturnType<typeof useTranslation>["t"];
}): PathFeedbackState => {
    if (submitError) {
        return {
            kind: "message",
            message: submitError,
            className: FORM.locationEditorValidationWarning,
        };
    }

    if (!trimmedPath) {
        return {
            kind: "message",
            message: "\u00A0",
            className: FORM.locationEditorValidationHint,
        };
    }

    if (applyState.blockReason === "invalid" && applyState.validationReason) {
        return {
            kind: "message",
            message: getDestinationValidationReasonMessage(applyState.validationReason, t),
            className: FORM.locationEditorValidationWarning,
        };
    }

    if (
        validation.status === "valid" &&
        typeof validation.freeSpace?.sizeBytes === "number" &&
        typeof validation.freeSpace.totalSize === "number"
    ) {
        const { path, sizeBytes, totalSize } = validation.freeSpace;
        return {
            kind: "gauge",
            freeSpace: {
                path,
                sizeBytes,
                totalSize,
            },
        };
    }

    if (
        validation.status === "valid" &&
        typeof validation.freeSpace?.sizeBytes === "number"
    ) {
        return {
            kind: "message",
            message: t("set_location.reason.available_space", {
                size: formatBytes(validation.freeSpace.sizeBytes),
            }),
            className: FORM.locationEditorValidationHint,
        };
    }

    return {
        kind: "message",
        message: "\u00A0",
        className: FORM.locationEditorValidationHint,
    };
};

export default function SetDownloadPathModal({
    isOpen,
    titleKey = "modals.set_download_location.title",
    titleIcon = HardDrive,
    initialPath,
    daemonPathStyle,
    checkFreeSpace,
    canPickDirectory,
    allowCreatePath = true,
    onClose,
    onPickDirectory,
    onApply,
}: SetDownloadPathModalProps) {
    const { t } = useTranslation();
    const [path, setPath] = useState(initialPath);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        setPath(normalizeDestinationPathForDaemon(initialPath, daemonPathStyle));
        setIsSubmitting(false);
        setSubmitError(null);
    }, [daemonPathStyle, initialPath, isOpen]);

    const destinationValidation = useDestinationPathValidation({
        isOpen,
        candidatePath: path,
        daemonPathStyle,
        checkFreeSpace,
        debounceMs: SET_LOCATION_VALIDATION_DEBOUNCE_MS,
    });

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

    const trimmedPath = path.trim();
    const manualEntryPromptKey = allowCreatePath
        ? "directory_browser.manual_entry_prompt_move"
        : "directory_browser.manual_entry_prompt_locate";
    const manualEntryPrompt = t(manualEntryPromptKey);
    const applyState = useMemo(
        () =>
            resolveApplyState({
                trimmedPath,
                validation: destinationValidation,
            }),
        [destinationValidation, trimmedPath],
    );
    const canApply = !isSubmitting && applyState.canApply;

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
            setPath(normalizeDestinationPathForDaemon(pickedPath, daemonPathStyle));
            setSubmitError(null);
        } catch (pickError) {
            setSubmitError(toErrorMessage(pickError, t("toolbar.feedback.failed")));
        }
    }, [canPickDirectory, daemonPathStyle, isSubmitting, onPickDirectory, path, t]);

    const pathFeedbackState = useMemo(
        () =>
            resolvePathFeedbackState({
                submitError,
                trimmedPath,
                validation: destinationValidation,
                applyState,
                t,
            }),
        [applyState, destinationValidation, submitError, t, trimmedPath],
    );
    const isInputInvalid =
        Boolean(submitError) || applyState.blockReason === "invalid";

    const handleApply = useCallback(async () => {
        if (isSubmitting) return;
        if (!applyState.canApply) {
            setSubmitError(resolveApplyBlockMessage(applyState, t));
            return;
        }
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            await onApply({
                path: applyState.normalizedPath,
            });
            onClose();
        } catch (applyError) {
            setSubmitError(toErrorMessage(applyError, t("toolbar.feedback.failed")));
        } finally {
            setIsSubmitting(false);
        }
    }, [
        applyState,
        isSubmitting,
        onApply,
        onClose,
        t,
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
                                    isInvalid={isInputInvalid}
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
                            {pathFeedbackState.kind === "gauge" ? (
                                <DiskSpaceGauge
                                    path={pathFeedbackState.freeSpace.path}
                                    freeBytes={pathFeedbackState.freeSpace.sizeBytes}
                                    totalBytes={pathFeedbackState.freeSpace.totalSize}
                                />
                            ) : (
                                <div className={FORM.locationEditorValidationRow}>
                                    <span className={pathFeedbackState.className}>
                                        {pathFeedbackState.message}
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
