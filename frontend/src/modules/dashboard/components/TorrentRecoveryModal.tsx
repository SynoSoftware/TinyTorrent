import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    cn,
} from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, HardDrive, X } from "lucide-react";

import { INTERACTION_CONFIG } from "@/config/logic";
import { GLASS_MODAL_SURFACE } from "@/shared/ui/layout/glass-surface";
import { classifyMissingFilesState } from "@/services/recovery/recovery-controller";
import type { RecoveryOutcome } from "@/services/recovery/recovery-controller";
import type { TorrentEntity } from "@/services/rpc/entities";
import { useRecoveryContext } from "@/app/context/RecoveryContext";

const MODAL_CLASSES =
    "w-full max-w-modal-compact flex flex-col overflow-hidden";

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

export interface TorrentRecoveryModalProps {
    isOpen: boolean;
    torrent?: TorrentEntity | null;
    outcome: RecoveryOutcome | null;
    onClose: () => void;
    onPickPath: (path: string) => Promise<void>;
    onBrowse?: (currentPath?: string | null) => Promise<string | null>;
    onRecreate?: () => Promise<void>;
    onAutoRetry?: () => Promise<void>;
    isBusy?: boolean;
}

const resolveOutcomeMessage = (
    outcome: RecoveryOutcome | null,
    t: (key: string) => string
): string | null => {
    if (!outcome?.message) return null;
    const key = RECOVERY_MESSAGE_LABEL_KEY[outcome.message];
    return key ? t(key) : outcome.message;
};

export default function TorrentRecoveryModal({
    isOpen,
    torrent,
    outcome,
    onClose,
    onPickPath,
    onBrowse,
    onRecreate,
    onAutoRetry,
    isBusy,
}: TorrentRecoveryModalProps) {
    const { t } = useTranslation();
    const busy = Boolean(isBusy);
    const { serverClass } = useRecoveryContext();

    const downloadDir =
        torrent?.downloadDir ?? torrent?.savePath ?? torrent?.downloadDir ?? "";

    const classification = useMemo(() => {
        if (!torrent) return null;
        return classifyMissingFilesState(
            torrent.errorEnvelope ?? null,
            downloadDir,
            serverClass,
            { torrentId: torrent.id ?? torrent.hash }
        );
    }, [torrent, downloadDir, serverClass]);

    const shouldRender =
        Boolean(classification) && classification?.kind !== "dataGap" && isOpen;
    if (!shouldRender) {
        return null;
    }

    const isUnknownConfidence = classification?.confidence === "unknown";
    const isPathLoss = classification?.kind === "pathLoss";
    const isVolumeLoss = classification?.kind === "volumeLoss";
    const isAccessDenied = classification?.kind === "accessDenied";

    const title = (() => {
        if (isUnknownConfidence) {
            return t("recovery.modal_title_fallback");
        }
        if (isPathLoss) return t("recovery.modal_title_folder");
        if (isVolumeLoss) return t("recovery.modal_title_drive");
        if (isAccessDenied) return t("recovery.modal_title_access");
        return t("recovery.modal_title_fallback");
    })();

    const bodyText = (() => {
        if (isUnknownConfidence) {
            return t("recovery.modal_body_fallback");
        }
        if (isPathLoss) return t("recovery.modal_body_folder");
        if (isVolumeLoss) return t("recovery.modal_body_drive");
        if (isAccessDenied) return t("recovery.modal_body_access");
        return t("recovery.modal_body_fallback");
    })();

    const statusText = (() => {
        if (isUnknownConfidence) {
            return t("recovery.inline_fallback");
        }
        if (isPathLoss) {
            return t("recovery.status.folder_not_found", {
                path:
                    (classification?.path ?? downloadDir) ||
                    t("labels.unknown"),
            });
        }
        if (isVolumeLoss) {
            return t("recovery.status.drive_disconnected", {
                drive: classification.root ?? t("labels.unknown"),
            });
        }
        if (isAccessDenied) {
            return t("recovery.status.access_denied");
        }
        return t("recovery.generic_header");
    })();

    const locationLabel =
        ((isVolumeLoss ? classification?.root : classification?.path) ??
            downloadDir) ||
        t("labels.unknown");

    const outcomeMessage = useMemo(
        () => resolveOutcomeMessage(outcome, t),
        [outcome, t]
    );

    const autoRetryRef = useRef(false);
    useEffect(() => {
        if (!isOpen || !isVolumeLoss || !onAutoRetry || busy) return;
        const interval = setInterval(() => {
            if (autoRetryRef.current) return;
            autoRetryRef.current = true;
            void onAutoRetry().finally(() => {
                autoRetryRef.current = false;
            });
        }, 2000);
        return () => {
            clearInterval(interval);
            autoRetryRef.current = false;
        };
    }, [isOpen, isVolumeLoss, onAutoRetry, busy]);

    const handleBrowse = useCallback(async () => {
        if (!onBrowse || busy) return;
        const current = (classification?.path ?? downloadDir) || undefined;
        const picked = await onBrowse(current ?? null);
        if (!picked) return;
        await onPickPath(picked);
    }, [busy, classification?.path, downloadDir, onBrowse, onPickPath]);

    const primaryLabel = isAccessDenied
        ? t("recovery.action.choose_location")
        : t("recovery.action_locate");
    const primaryDisabled = busy || !onBrowse;
    const primaryAction = handleBrowse;

    const showRecreate = isPathLoss && Boolean(onRecreate);

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
            backdrop="blur"
            placement="center"
            motionProps={INTERACTION_CONFIG.modalBloom}
            hideCloseButton
            isDismissable={!busy}
            classNames={{
                base: cn(GLASS_MODAL_SURFACE, MODAL_CLASSES),
            }}
        >
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader className="flex items-center justify-between gap-tools px-panel py-panel border-b border-divider">
                            <div className="flex items-center gap-tools">
                                <div className="surface-layer-1 rounded-full p-tight">
                                    <AlertTriangle className="toolbar-icon-size-md text-warning" />
                                </div>
                                <h2 className="text-scaled font-bold uppercase tracking-label text-foreground">
                                    {title}
                                </h2>
                            </div>
                            <Button
                                variant="ghost"
                                color="default"
                                size="md"
                                onPress={onClose}
                                isDisabled={busy}
                            >
                                <X />
                            </Button>
                        </ModalHeader>

                        <ModalBody className="flex flex-col gap-stage p-panel">
                            <div className="flex flex-col gap-tight">
                                <p className="text-scaled font-semibold text-foreground">
                                    {statusText}
                                </p>
                                <p className="text-label text-foreground/70">
                                    {bodyText}
                                </p>
                            </div>
                            <div className="flex items-center gap-tools surface-layer-1 rounded-panel p-tight">
                                <HardDrive className="toolbar-icon-size-md text-foreground" />
                                <span
                                    className="font-mono text-label text-foreground truncate"
                                    title={locationLabel}
                                >
                                    {locationLabel}
                                </span>
                            </div>
                            {isVolumeLoss && (
                                <div className="text-label text-foreground/60">
                                    {t("recovery.status.waiting_for_drive")}
                                </div>
                            )}
                            {outcomeMessage && (
                                <div className="surface-layer-1 rounded-panel p-tight text-label text-foreground/70">
                                    {outcomeMessage}
                                </div>
                            )}
                        </ModalBody>

                        <ModalFooter className="flex items-center justify-between gap-tools px-panel py-panel border-t border-divider">
                            <div className="flex items-center gap-tools">
                                {showRecreate && (
                                    <Button
                                        variant="light"
                                        size="md"
                                        onPress={onRecreate}
                                        isDisabled={busy}
                                        className="font-medium text-foreground"
                                    >
                                        {t("recovery.action_recreate")}
                                    </Button>
                                )}
                            </div>
                            <div className="flex items-center gap-tools">
                                <Button
                                    variant="light"
                                    size="md"
                                    onPress={onClose}
                                    isDisabled={busy}
                                    className="font-medium text-foreground"
                                >
                                    {t("modals.cancel")}
                                </Button>
                                <Button
                                    variant="shadow"
                                    color="primary"
                                    size="lg"
                                    onPress={primaryAction}
                                    isDisabled={primaryDisabled}
                                    className="font-bold"
                                >
                                    {primaryLabel}
                                </Button>
                            </div>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
