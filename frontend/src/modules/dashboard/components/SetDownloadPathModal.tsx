import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { HardDrive, X } from "lucide-react";
import { useSession } from "@/app/context/SessionContext";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { scheduler } from "@/app/services/scheduler";
import { SET_LOCATION_VALIDATION_DEBOUNCE_MS } from "@/config/logic";
import {
    validateRelocationTargetPath,
    type RelocationTargetPathValidationResult,
    type RelocationPreflightFreeSpace,
} from "@/modules/dashboard/domain/torrentRelocation";
import { MODAL, FORM } from "@/shared/ui/layout/glass-surface";
import { formatBytes } from "@/shared/utils/format";
import { TEXT_ROLE } from "@/config/textRoles";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { DiskSpaceGauge } from "@/shared/ui/workspace/DiskSpaceGauge";
import type { DaemonPathStyle } from "@/services/rpc/types";

type RelocationValidationFailureReason = Extract<
    RelocationTargetPathValidationResult,
    { ok: false }
>["reason"];
type ValidationState =
    | { status: "idle" }
    | { status: "checking" }
    | { status: "valid"; freeSpace?: RelocationPreflightFreeSpace }
    | {
          status: "invalid";
          reason: RelocationValidationFailureReason;
      };

export interface SetDownloadPathModalProps {
    isOpen: boolean;
    titleKey?: string;
    initialPath: string;
    canPickDirectory: boolean;
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

const normalizePathForDaemon = (
    value: string,
    daemonPathStyle: DaemonPathStyle,
): string => {
    const trimmed = value.trim();
    if (daemonPathStyle === "windows") {
        return trimmed.replace(/\//g, "\\");
    }
    return trimmed;
};

export default function SetDownloadPathModal({
    isOpen,
    titleKey = "modals.set_download_location.title",
    initialPath,
    canPickDirectory,
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
    const validationRunIdRef = useRef(0);
    const contentRef = useRef<HTMLFormElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setPath(normalizePathForDaemon(initialPath, daemonPathStyle));
        setIsSubmitting(false);
        setSubmitError(null);
        setValidationState({ status: "idle" });
    }, [daemonPathStyle, initialPath, isOpen]);

    useEffect(() => {
        validationRunIdRef.current += 1;
        if (!isOpen) {
            return;
        }

        const normalizedPath = normalizePathForDaemon(path, daemonPathStyle).trim();
        if (!normalizedPath) {
            setValidationState({ status: "idle" });
            return;
        }
        if (daemonPathStyle === "unknown") {
            setValidationState({ status: "idle" });
            return;
        }

        const runId = validationRunIdRef.current;
        setValidationState({ status: "checking" });
        const cancelValidation = scheduler.scheduleTimeout(() => {
            void validateRelocationTargetPath(
                normalizedPath,
                daemonPathStyle,
                torrentClient,
            )
                .then((result) => {
                    if (validationRunIdRef.current !== runId) {
                        return;
                    }
                    if (result.ok) {
                        setValidationState({
                            status: "valid",
                            freeSpace: result.freeSpace,
                        });
                        return;
                    }
                    setValidationState({
                        status: "invalid",
                        reason: result.reason,
                    });
                })
                .catch(() => {
                    if (validationRunIdRef.current !== runId) {
                        return;
                    }
                    setValidationState({
                        status: "invalid",
                        reason: "root_unreachable",
                    });
                });
        }, SET_LOCATION_VALIDATION_DEBOUNCE_MS);

        return cancelValidation;
    }, [
        daemonPathStyle,
        isOpen,
        path,
        torrentClient,
    ]);

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
    const canApply =
        trimmedPath.length > 0 &&
        !isSubmitting &&
        validationState.status !== "invalid";
    const gaugeFreeSpace = useMemo(() => {
        if (validationState.status !== "valid") {
            return null;
        }
        if (
            typeof validationState.freeSpace?.sizeBytes !== "number" ||
            typeof validationState.freeSpace.totalSize !== "number"
        ) {
            return null;
        }
        return validationState.freeSpace;
    }, [validationState]);
    const shouldRenderGauge = gaugeFreeSpace !== null;
    const pathValidationFeedback = useMemo(() => {
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

        if (validationState.status === "valid") {
            if (
                typeof validationState.freeSpace?.sizeBytes === "number" &&
                !shouldRenderGauge
            ) {
                return {
                    message: t("set_location.reason.available_space", {
                        size: formatBytes(validationState.freeSpace.sizeBytes),
                    }),
                    className: FORM.locationEditorValidationHint,
                };
            }
            return {
                message: "\u00A0",
                className: FORM.locationEditorValidationHint,
            };
        }

        if (validationState.status === "checking") {
            return {
                message: t("set_location.reason.checking_path"),
                className: FORM.locationEditorValidationHint,
            };
        }

        if (validationState.status === "invalid") {
            return {
                message:
                    validationState.reason === "invalid_format"
                        ? t("set_location.reason.absolute_path_required")
                        : t("directory_browser.error"),
                className: FORM.locationEditorValidationWarning,
            };
        }

        return {
            message: t("directory_browser.path_helper"),
            className: FORM.locationEditorValidationHint,
        };
    }, [submitError, t, trimmedPath, validationState, shouldRenderGauge]);

    const handlePathChange = useCallback((value: string) => {
        setPath(value);
        if (submitError) {
            setSubmitError(null);
        }
    }, [submitError]);

    const handleBrowse = useCallback(async () => {
        if (!canPickDirectory || isSubmitting) return;
        try {
            const pickedPath = await onPickDirectory(path);
            if (!pickedPath) return;
            setPath(normalizePathForDaemon(pickedPath, daemonPathStyle));
            setSubmitError(null);
        } catch (pickError) {
            setSubmitError(
                toErrorMessage(
                    pickError,
                    t("toolbar.feedback.failed"),
                ),
            );
        }
    }, [canPickDirectory, daemonPathStyle, isSubmitting, onPickDirectory, path, t]);

    const handleApply = useCallback(async () => {
        if (isSubmitting) return;
        if (!trimmedPath) {
            setSubmitError(t("directory_browser.validation_required"));
            return;
        }
        const normalizedPath = normalizePathForDaemon(trimmedPath, daemonPathStyle);
        if (validationState.status === "invalid") {
            setSubmitError(
                validationState.reason === "invalid_format"
                    ? t("set_location.reason.absolute_path_required")
                    : t("directory_browser.error"),
            );
            return;
        }
        setPath(normalizedPath);
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            await onApply({
                path: normalizedPath,
            });
            onClose();
        } catch (applyError) {
            setSubmitError(
                toErrorMessage(
                    applyError,
                    t("toolbar.feedback.failed"),
                ),
            );
        } finally {
            setIsSubmitting(false);
        }
    }, [
        daemonPathStyle,
        isSubmitting,
        onApply,
        onClose,
        t,
        trimmedPath,
        validationState,
    ]);

    const handleOpenChange = useCallback(
        (open: boolean) => {
            if (!open && !isSubmitting) {
                onClose();
            }
        },
        [isSubmitting, onClose],
    );

    const handleSubmit = useCallback(
        (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void handleApply();
        },
        [handleApply],
    );

    if (!isOpen) {
        return null;
    }

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={handleOpenChange}
            backdrop="blur"
            classNames={MODAL.compactClassNames}
            isDismissable={!isSubmitting}
            hideCloseButton
        >
            <ModalContent>
                <form ref={contentRef} onSubmit={handleSubmit}>
                    <ModalHeader className={MODAL.dialogHeader}>
                        <span>{t(titleKey)}</span>
                        <ToolbarIconButton
                            Icon={X}
                            ariaLabel={t("torrent_modal.actions.close")}
                            onPress={onClose}
                            isDisabled={isSubmitting}
                        />
                    </ModalHeader>
                    <ModalBody className={MODAL.dialogBody}>
                        <div className={FORM.locationEditorRoot}>
                            <div className={FORM.locationEditorRow}>
                                <div className={FORM.locationEditorIconWrap}>
                                    <HardDrive className={FORM.locationEditorIcon} />
                                </div>
                                <div className={FORM.locationEditorField}>
                                    <label htmlFor="set-download-location-path" className={TEXT_ROLE.caption}>
                                        {t("directory_browser.path_label")}
                                    </label>
                                    <Input
                                        id="set-download-location-path"
                                        className={TEXT_ROLE.codeMuted}
                                        value={path}
                                        onValueChange={handlePathChange}
                                        isDisabled={isSubmitting}
                                        isInvalid={
                                            Boolean(submitError) ||
                                            validationState.status === "invalid"
                                        }
                                        variant="flat"
                                        placeholder={t("directory_browser.enter_path")}
                                        spellCheck="false"
                                        autoComplete="off"
                                        aria-label={t("directory_browser.path_label")}
                                    />
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

                            {canPickDirectory ? (
                                <div className={FORM.buttonRow}>
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

                            <p className={TEXT_ROLE.bodySmall}>
                                {t("directory_browser.manual_entry_prompt")}
                            </p>
                        </div>
                    </ModalBody>
                    <ModalFooter className={MODAL.dialogFooter}>
                        <Button
                            variant="light"
                            onPress={onClose}
                            isDisabled={isSubmitting}
                        >
                            {t("modals.cancel")}
                        </Button>
                        <Button
                            variant="shadow"
                            color="primary"
                            type="submit"
                            isLoading={isSubmitting}
                            isDisabled={!canApply}
                        >
                            {t("modals.set_download_location.apply")}
                        </Button>
                    </ModalFooter>
                </form>
            </ModalContent>
        </Modal>
    );
}
