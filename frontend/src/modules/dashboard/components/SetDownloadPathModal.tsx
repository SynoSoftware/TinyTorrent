import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { HardDrive, type LucideIcon } from "lucide-react";
import { useDownloadPaths } from "@/app/hooks/useDownloadPaths";
import { useSession } from "@/app/context/SessionContext";
import { useTorrentCommands } from "@/app/context/AppCommandContext";
import { normalizeDestinationPathForDaemon } from "@/shared/domain/destinationPath";
import { resolveDestinationValidationDecision } from "@/shared/domain/destinationValidationPolicy";
import { registry } from "@/config/logic";
import { FORM } from "@/shared/ui/layout/glass-surface";
import { formatBytes } from "@/shared/utils/format";
import { TEXT_ROLE } from "@/config/textRoles";
import { DestinationPathEditor, type DestinationPathFeedback } from "@/shared/ui/workspace/DestinationPathEditor";
import { ModalEx } from "@/shared/ui/layout/ModalEx";
import { useDestinationPathValidation } from "@/shared/hooks/useDestinationPathValidation";
const { timing } = registry;

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
}): DestinationPathFeedback => {
    if (submitError) {
        return {
            kind: "message",
            message: submitError,
            tone: "warning",
        };
    }

    if (!hasValue) {
        return {
            kind: "message",
            message: "\u00A0",
            tone: "hint",
        };
    }

    if (
        applyDecision.blockReason === "invalid" &&
        applyDecision.blockMessageKey
    ) {
        return {
            kind: "message",
            message: t(applyDecision.blockMessageKey),
            tone: "warning",
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
            tone: "hint",
        };
    }

    return {
        kind: "message",
        message: "\u00A0",
        tone: "hint",
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
    const { history: downloadHistory } = useDownloadPaths();
    const [path, setPath] = useState(initialPath);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const formRef = useRef<HTMLFormElement | null>(null);
    const wasOpenRef = useRef(false);
    const currentPath = useMemo(
        () => normalizeDestinationPathForDaemon(initialPath, daemonPathStyle),
        [daemonPathStyle, initialPath],
    );

    useEffect(() => {
        if (!isOpen) {
            wasOpenRef.current = false;
            return;
        }
        if (wasOpenRef.current) {
            return;
        }
        wasOpenRef.current = true;
        const nextPath = normalizeDestinationPathForDaemon(
            initialPath,
            daemonPathStyle,
        );
        setPath(nextPath);
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
            if (applyDecision.blockReason === "pending") {
                return;
            }
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
    const handleFormSubmit = useCallback(
        async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            await handleApply();
        },
        [handleApply],
    );
    const requestSubmit = useCallback(() => {
        formRef.current?.requestSubmit();
    }, []);

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
                onPress: requestSubmit,
                loading: isSubmitting,
                disabled: !canApply,
            }}
        >
            <form ref={formRef} onSubmit={handleFormSubmit}>
                <div className={FORM.locationEditorRoot}>
                    <DestinationPathEditor
                        id="set-download-location-path"
                        label={t(
                            currentPath
                                ? "modals.set_download_location.new_path"
                                : "directory_browser.path_label",
                        )}
                        labelClassName={TEXT_ROLE.caption}
                        currentPathLabel={t("modals.set_download_location.current_path")}
                        currentPathValue={currentPath}
                        value={path}
                        history={downloadHistory}
                        ariaLabel={t("directory_browser.path_label")}
                        placeholder={t("directory_browser.enter_path")}
                        onValueChange={handlePathChange}
                        onEnter={requestSubmit}
                        onEscape={handleClose}
                        autoFocus
                        isDisabled={isSubmitting}
                        isInvalid={isInputInvalid}
                        manualEntryPrompt={manualEntryPrompt}
                        inputClassNames={FORM.locationEditorInputClassNames}
                        inputTextClassName={TEXT_ROLE.codeMuted}
                        feedback={pathFeedbackState}
                        browseAction={
                            canPickDirectory
                                ? {
                                      ariaLabel: t("modals.set_download_location.browse"),
                                      label: t("modals.set_download_location.browse"),
                                      onPress: () => {
                                          void handleBrowse();
                                      },
                                  }
                                : undefined
                        }
                    />
                </div>
            </form>
        </ModalEx>
    );
}

