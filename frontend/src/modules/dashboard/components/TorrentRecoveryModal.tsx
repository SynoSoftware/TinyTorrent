import {
    Button,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Spinner,
    cn,
} from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    CheckCircle2,
    Download,
    FolderOpen,
    LifeBuoy,
    Play,
    Radio,
    X,
    AlertTriangle,
    ArrowRight,
    HardDrive,
    ShieldCheck,
    Search,
    Activity,
    FileWarning,
    Ban,
    Info,
    type LucideIcon,
    AlertOctagon,
    Waypoints,
} from "lucide-react";
import type { TFunction } from "i18next";

import { INTERACTION_CONFIG } from "@/config/logic";
import { GLASS_MODAL_SURFACE } from "@/shared/ui/layout/glass-surface";
import { StatusIcon } from "@/shared/ui/components/StatusIcon";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import type {
    RecoveryOutcome,
    RecoveryPlan,
} from "@/services/recovery/recovery-controller";

// --- TYPES ---

export interface TorrentRecoveryModalProps {
    isOpen: boolean;
    plan: RecoveryPlan | null;
    outcome: RecoveryOutcome | null;
    onClose: () => void;
    onPrimary: () => Promise<void>;
    onPickPath: (path: string) => Promise<void>;
    onVerify: () => Promise<void>;
    onReannounce: () => Promise<void>;
    onBrowse?: (currentPath?: string | null) => Promise<string | null>;
    isBusy?: boolean;
}

type ModalTone = "neutral" | "success" | "warning" | "danger";

// --- STYLING ---

const MODAL_CLASSES =
    "w-full max-w-modal-compact flex flex-col overflow-hidden";

const RECOVERY_ACTION_LABEL_KEY: Record<
    RecoveryPlan["primaryAction"],
    string | null
> = {
    reDownloadHere: "recovery.action.redownload_here",
    createAndDownloadHere: "recovery.action.create_and_redownload_here",
    pickPath: "recovery.action.pick_path",
    verify: "recovery.action.verify",
    resume: "recovery.action.resume",
    reannounce: "recovery.action.reannounce",
    openFolder: "recovery.action.open_folder",
    none: null,
};

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

const PRIMARY_ACTION_ICON: Partial<
    Record<RecoveryPlan["primaryAction"], LucideIcon>
> = {
    reDownloadHere: Download,
    createAndDownloadHere: Download,
    pickPath: FolderOpen,
    verify: ShieldCheck,
    resume: Play,
    reannounce: Radio,
    openFolder: FolderOpen,
};

const PRIMARY_DESC_KEY: Record<RecoveryPlan["primaryAction"], string> = {
    reDownloadHere: "recovery.modal.primary_desc.redownload_here",
    createAndDownloadHere: "recovery.modal.primary_desc.create_and_redownload",
    pickPath: "recovery.modal.primary_desc.pick_path",
    verify: "recovery.modal.primary_desc.verify",
    resume: "recovery.modal.primary_desc.resume",
    reannounce: "recovery.modal.primary_desc.reannounce",
    openFolder: "recovery.modal.primary_desc.open_folder",
    none: "recovery.modal.primary_desc.none",
};

// --- LOGIC ---

function getOutcomeTone(outcome: RecoveryOutcome | null): ModalTone {
    if (!outcome) return "neutral";
    switch (outcome.kind) {
        case "resolved":
        case "verify-started":
        case "reannounce-started":
            return "success";
        case "path-needed":
            return "warning";
        case "error":
            return "danger";
        default:
            return "neutral";
    }
}

function getToneStyles(tone: ModalTone) {
    switch (tone) {
        case "success":
            return {
                text: "text-success",
                icon: CheckCircle2,
            };
        case "warning":
            return {
                text: "text-warning",
                icon: AlertTriangle,
            };
        case "danger":
            return {
                text: "text-danger",
                icon: Ban,
            };
        default:
            return {
                text: "text-foreground",
                icon: Info,
            };
    }
}

function resolveOutcomeMessage(
    outcome: RecoveryOutcome | null,
    t: TFunction
): string | null {
    const raw = outcome?.message;
    if (!raw) return null;
    const key = RECOVERY_MESSAGE_LABEL_KEY[raw];
    return key ? t(key) : raw;
}

// --- COMPONENT ---

export default function TorrentRecoveryModal({
    isOpen,
    plan,
    outcome,
    onClose,
    onPrimary,
    onPickPath,
    onVerify,
    onReannounce,
    onBrowse,
    isBusy,
}: TorrentRecoveryModalProps) {
    const { t } = useTranslation();
    const [pathDraft, setPathDraft] = useState("");
    const [isBrowsing, setIsBrowsing] = useState(false);

    const busy = Boolean(isBusy) || isBrowsing;

    useEffect(() => {
        if (!isOpen) return;
        setPathDraft(plan?.suggestedPath ?? "");
        setIsBrowsing(false);
    }, [isOpen, plan?.suggestedPath]);

    const actionLabel = useMemo(() => {
        const key = plan ? RECOVERY_ACTION_LABEL_KEY[plan.primaryAction] : null;
        return key ? t(key) : t("recovery.modal.title_idle");
    }, [plan, t]);

    const title = useMemo(() => t("recovery.modal.title"), [t]);

    const [isManuallyEditing, setIsManuallyEditing] = useState(false);

    const requiresUserPath = Boolean(
        outcome?.kind === "path-needed" ||
            plan?.requiresPath ||
            plan?.primaryAction === "pickPath" ||
            isManuallyEditing // <--- The override
    );
    const outcomeMessage = useMemo(
        () => resolveOutcomeMessage(outcome, t),
        [outcome, t]
    );
    const outcomeTone = useMemo(() => getOutcomeTone(outcome), [outcome]);
    const toneStyles = getToneStyles(outcomeTone);

    const primaryDescription = useMemo(() => {
        const key = plan ? PRIMARY_DESC_KEY[plan.primaryAction] : null;
        if (!key) return null;
        return t(key, { action: actionLabel });
    }, [actionLabel, plan, t]);

    // Handlers
    const handleBrowse = useCallback(async () => {
        if (!onBrowse || busy) return;
        setIsBrowsing(true);
        try {
            const picked = await onBrowse(pathDraft || plan?.suggestedPath);
            if (picked) setPathDraft(picked);
        } finally {
            setIsBrowsing(false);
        }
    }, [busy, onBrowse, pathDraft, plan?.suggestedPath]);

    const handleConfirmPickPath = useCallback(async () => {
        const trimmed = pathDraft.trim();
        if (!trimmed || busy) return;
        await onPickPath(trimmed);
    }, [busy, onPickPath, pathDraft]);

    // Primary Action Configuration
    const primary = useMemo(() => {
        if (!plan)
            return {
                key: "none",
                label: t("modals.cancel"),
                onPress: onClose,
                isDisabled: busy,
                icon: X,
            };

        if (requiresUserPath) {
            return {
                key: "pickPath",
                label: t("recovery.action.pick_path"),
                onPress: handleConfirmPickPath,
                isDisabled: busy || !pathDraft.trim(),
                icon: FolderOpen,
            };
        }

        if (plan.primaryAction === "verify") {
            return {
                key: "verify",
                label: t("recovery.action.verify"),
                onPress: onVerify,
                isDisabled: busy,
                icon: ShieldCheck,
            };
        }

        if (plan.primaryAction === "reannounce") {
            return {
                key: "reannounce",
                label: t("recovery.action.reannounce"),
                onPress: onReannounce,
                isDisabled: busy,
                icon: Radio,
            };
        }

        const labelKey = RECOVERY_ACTION_LABEL_KEY[plan.primaryAction];
        return {
            key: plan.primaryAction,
            label: labelKey ? t(labelKey) : t("recovery.action.resume"),
            onPress: onPrimary,
            isDisabled: busy,
            icon: PRIMARY_ACTION_ICON[plan.primaryAction] ?? Play,
        };
    }, [
        busy,
        handleConfirmPickPath,
        onClose,
        onPrimary,
        onReannounce,
        onVerify,
        pathDraft,
        plan,
        requiresUserPath,
        t,
    ]);

    const showSecondaryVerify =
        !requiresUserPath &&
        (plan?.primaryAction === "reDownloadHere" ||
            plan?.primaryAction === "createAndDownloadHere");

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => (!open ? onClose() : undefined)}
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
                            <div className="flex items-center gap-tools min-w-0">
                                <div className="surface-layer-1 rounded-full p-tight shrink-0">
                                    <StatusIcon
                                        Icon={LifeBuoy}
                                        size="lg"
                                        className="text-danger"
                                    />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <h2 className="text-label font-bold uppercase tracking-label text-foreground py-panel">
                                        {title}
                                    </h2>
                                    <div className="flex items-center gap-tools text-label uppercase tracking-label text-foreground">
                                        <ArrowRight className="toolbar-icon-size-md text-primary" />
                                        <span className="truncate">
                                            {actionLabel}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <ToolbarIconButton
                                Icon={X}
                                ariaLabel={t("torrent_modal.actions.close")}
                                onPress={onClose}
                                isDisabled={busy}
                            />
                        </ModalHeader>

                        <ModalBody className="relative flex flex-col gap-stage p-panel">
                            <div className="flex flex-col gap-tools">
                                <span className="text-label font-semibold uppercase tracking-label text-foreground flex items-center gap-tools">
                                    <Activity className="toolbar-icon-size-md text-danger" />
                                    {t("recovery.modal.problem_heading")}
                                </span>
                                <div className="flex items-center gap-tools">
                                    <div className="surface-layer-1 rounded-panel p-tight shrink-0">
                                        <AlertOctagon className="toolbar-icon-size-md text-danger" />
                                    </div>
                                    <div className="flex flex-col gap-tight text-scaled">
                                        <p className="text-scaled text-foreground">
                                            {plan?.rationale
                                                ? t(plan.rationale)
                                                : t(
                                                      "recovery.no_primary_recovery_for_error_class"
                                                  )}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {primaryDescription && (
                                <div className="flex flex-col gap-tools">
                                    <span className="text-label font-semibold uppercase tracking-label text-foreground flex items-center gap-tools">
                                        <Waypoints className="toolbar-icon-size-md text-primary" />
                                        {t("recovery.modal.next_heading")}
                                    </span>
                                    <div className="flex items-center  gap-tools">
                                        <div className="surface-layer-1  rounded-panel p-tight shrink-0">
                                            <StatusIcon
                                                Icon={primary.icon || Play}
                                                size="md"
                                                className="text-primary"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-tight text-scaled">
                                            <p className="text-scaled text-foreground">
                                                {primaryDescription}
                                            </p>
                                            {!requiresUserPath &&
                                                plan?.suggestedPath && (
                                                    <div className="flex items-center gap-tools">
                                                        <div className="surface-layer-1 rounded-panel px-panel py-tight flex items-center gap-tools max-w-dir-picker">
                                                            <HardDrive className="toolbar-icon-size-md text-foreground" />
                                                            <span
                                                                className="text-label font-mono truncate"
                                                                title={
                                                                    plan.suggestedPath
                                                                }
                                                            >
                                                                {
                                                                    plan.suggestedPath
                                                                }
                                                            </span>
                                                        </div>
                                                        <ToolbarIconButton
                                                            Icon={FolderOpen}
                                                            ariaLabel={t(
                                                                "recovery.action.pick_path"
                                                            )}
                                                            onPress={() =>
                                                                setIsManuallyEditing(
                                                                    true
                                                                )
                                                            }
                                                            isDisabled={busy}
                                                        />
                                                    </div>
                                                )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {requiresUserPath && (
                                <div className="flex flex-col gap-tools">
                                    <div className="flex items-start gap-tools">
                                        <div className="flex-1 min-w-0">
                                            <Input
                                                value={pathDraft}
                                                onChange={(e) =>
                                                    setPathDraft(
                                                        e.target.value ?? ""
                                                    )
                                                }
                                                placeholder={t(
                                                    "recovery.modal.path_placeholder"
                                                )}
                                                startContent={
                                                    <FolderOpen className="toolbar-icon-size-md text-foreground" />
                                                }
                                                variant="faded"
                                                isDisabled={busy}
                                                classNames={{
                                                    input: "font-mono text-label",
                                                }}
                                            />
                                        </div>
                                        {onBrowse && (
                                            <ToolbarIconButton
                                                Icon={Search}
                                                ariaLabel={t(
                                                    "recovery.action.pick_path"
                                                )}
                                                onPress={handleBrowse}
                                                isDisabled={busy}
                                                isLoading={isBrowsing}
                                            />
                                        )}
                                        {isManuallyEditing && (
                                            <Button
                                                variant="ghost"
                                                onPress={() =>
                                                    setIsManuallyEditing(false)
                                                }
                                                isDisabled={busy}
                                            >
                                                {t(
                                                    "recovery.modal.cancel_path_edit"
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {(busy || outcomeMessage) && (
                                <div className="flex items-center gap-tools p-panel rounded-panel border border-divider">
                                    {busy ? (
                                        <Spinner color="current" />
                                    ) : (
                                        <StatusIcon
                                            Icon={toneStyles.icon}
                                            size="md"
                                            className={toneStyles.text}
                                        />
                                    )}
                                    <span
                                        className={cn(
                                            "text-label font-semibold",
                                            toneStyles.text
                                        )}
                                    >
                                        {busy
                                            ? t("recovery.modal.in_progress")
                                            : outcomeMessage}
                                    </span>
                                </div>
                            )}
                        </ModalBody>

                        <ModalFooter className="flex items-center justify-between gap-tools px-panel py-panel border-t border-divider">
                            <div className="flex items-center gap-tools">
                                {showSecondaryVerify &&
                                    plan?.primaryAction !== "verify" && (
                                        <Button
                                            variant="ghost"
                                            onPress={onVerify}
                                            isDisabled={busy}
                                            startContent={
                                                <FileWarning className="toolbar-icon-size-md text-foreground" />
                                            }
                                        >
                                            {t("recovery.action.verify")}
                                        </Button>
                                    )}
                            </div>
                            <div className="flex items-center gap-tools">
                                <Button
                                    variant="light"
                                    onPress={onClose}
                                    isDisabled={busy}
                                    className="font-medium text-foreground"
                                >
                                    {t("modals.cancel")}
                                </Button>
                                <Button
                                    color={
                                        outcomeTone === "danger"
                                            ? "danger"
                                            : "primary"
                                    }
                                    variant="shadow"
                                    size="lg"
                                    onPress={primary.onPress}
                                    isDisabled={primary.isDisabled}
                                    isLoading={busy}
                                    startContent={
                                        !busy && primary.icon ? (
                                            <StatusIcon
                                                Icon={primary.icon}
                                                size="md"
                                            />
                                        ) : null
                                    }
                                    className="font-bold"
                                >
                                    {primary.label}
                                </Button>
                            </div>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
