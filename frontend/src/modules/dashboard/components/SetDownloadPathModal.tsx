import { Button, Input } from "@heroui/react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { HardDrive, type LucideIcon } from "lucide-react";
import { useSession } from "@/app/context/SessionContext";
import { useTorrentCommands } from "@/app/context/AppCommandContext";
import { normalizeDestinationPathForDaemon } from "@/shared/domain/destinationPath";
import { resolveDestinationValidationDecision } from "@/shared/domain/destinationValidationPolicy";
import { registry } from "@/config/logic";
import { FORM } from "@/shared/ui/layout/glass-surface";
import { formatBytes } from "@/shared/utils/format";
import { TEXT_ROLE } from "@/config/textRoles";
import { DiskSpaceGauge } from "@/shared/ui/workspace/DiskSpaceGauge";
import { ModalEx } from "@/shared/ui/layout/ModalEx";
import { useDestinationPathValidation } from "@/shared/hooks/useDestinationPathValidation";
const { timing, layout, ui } = registry;

export interface SetDownloadPathModalProps {
    isOpen: boolean;
    titleKey?: string;
    titleIcon?: LucideIcon;
    initialPath: string;
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

const resolvePathFeedbackState = ({
    submitError,
    hasValue,
    applyDecision,
    t,
}: {
    submitError: string | null;
    hasValue: boolean;
    applyDecision: ReturnType<typeof resolveDestinationValidationDecision>;
    t: ReturnType<typeof useTranslation>["t"];
}): PathFeedbackState => {
    if (submitError) {
        return {
            kind: "message",
            message: submitError,
            className: FORM.locationEditorValidationWarning,
        };
    }

    if (!hasValue) {
        return {
            kind: "message",
            message: "\u00A0",
            className: FORM.locationEditorValidationHint,
        };
    }

    if (
        applyDecision.blockReason === "invalid" &&
        applyDecision.blockMessageKey
    ) {
        return {
            kind: "message",
            message: t(applyDecision.blockMessageKey),
            className: FORM.locationEditorValidationWarning,
        };
    }

    if (applyDecision.gauge) {
        return {
            kind: "gauge",
            freeSpace: applyDecision.gauge,
        };
    }

    if (typeof applyDecision.availableSpaceBytes === "number") {
        return {
            kind: "message",
            message: t("set_location.reason.available_space", {
                size: formatBytes(applyDecision.availableSpaceBytes),
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
    canPickDirectory,
    allowCreatePath = true,
    onClose,
    onPickDirectory,
    onApply,
}: SetDownloadPathModalProps) {
    const { t } = useTranslation();
    const { daemonPathStyle } = useSession();
    const { checkFreeSpace } = useTorrentCommands();
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
        debounceMs: timing.debounce.setLocationValidationMs,
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

    const manualEntryPromptKey = allowCreatePath
        ? "directory_browser.manual_entry_prompt_move"
        : "directory_browser.manual_entry_prompt_locate";
    const manualEntryPrompt = t(manualEntryPromptKey);
    const applyDecision = resolveDestinationValidationDecision({
        mode: "strict",
        snapshot: destinationValidation,
    });
    const canApply = !isSubmitting && applyDecision.canProceed;

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

    const pathFeedbackState = resolvePathFeedbackState({
        submitError,
        hasValue: destinationValidation.hasValue,
        applyDecision,
        t,
    });
    const isInputInvalid =
        Boolean(submitError) || applyDecision.blockReason === "invalid";

    const handleApply = useCallback(async () => {
        if (isSubmitting) return;
        if (!applyDecision.canProceed) {
            setSubmitError(
                applyDecision.blockMessageKey
                    ? t(applyDecision.blockMessageKey)
                    : t("directory_browser.error"),
            );
            return;
        }
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            await onApply({
                path: applyDecision.normalizedPath,
            });
            onClose();
        } catch (applyError) {
            setSubmitError(toErrorMessage(applyError, t("toolbar.feedback.failed")));
        } finally {
            setIsSubmitting(false);
        }
    }, [
        applyDecision,
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

