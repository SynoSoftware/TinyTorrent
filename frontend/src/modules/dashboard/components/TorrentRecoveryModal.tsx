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
    type LucideIcon,
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

const HEADER_TITLE =
    "text-label tracking-label uppercase font-semibold text-foreground";
const SUBTLE_META = "text-scaled text-foreground/60";
const FIELD_LABEL = "text-label tracking-label uppercase font-semibold";

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

const PRIMARY_ACTION_ICON: Partial<Record<RecoveryPlan["primaryAction"], LucideIcon>> =
    {
        reDownloadHere: Download,
        createAndDownloadHere: Download,
        pickPath: FolderOpen,
        verify: CheckCircle2,
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
        case "noop":
        default:
            return "neutral";
    }
}

function getToneClasses(tone: ModalTone) {
    switch (tone) {
        case "success":
            return "border-success/40 bg-success/10 text-success";
        case "warning":
            return "border-warning/40 bg-warning/10 text-warning";
        case "danger":
            return "border-danger/40 bg-danger/10 text-danger";
        default:
            return "border-default/20 bg-content1/10 text-foreground/80";
    }
}

function resolveOutcomeMessage(
    outcome: RecoveryOutcome | null,
    t: TFunction
): string | null {
    const raw = outcome?.message;
    if (!raw) return null;
    const key = RECOVERY_MESSAGE_LABEL_KEY[raw];
    if (key) return t(key);
    return raw;
}

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

    const requiresUserPath = Boolean(
        outcome?.kind === "path-needed" ||
            plan?.requiresPath ||
            plan?.primaryAction === "pickPath"
    );

    const showPathEditor = requiresUserPath;

    const outcomeMessage = useMemo(
        () => resolveOutcomeMessage(outcome, t),
        [outcome, t]
    );

    const outcomeTone = useMemo(() => getOutcomeTone(outcome), [outcome]);

    const primaryDescription = useMemo(() => {
        const key = plan ? PRIMARY_DESC_KEY[plan.primaryAction] : null;
        if (!key) return null;
        return t(key, { action: actionLabel });
    }, [actionLabel, plan, t]);

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

    const primary = useMemo(() => {
        if (!plan) {
            return {
                key: "none",
                label: t("modals.cancel"),
                onPress: onClose,
                isDisabled: busy,
                icon: undefined as LucideIcon | undefined,
            };
        }

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
                icon: CheckCircle2,
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
            size="2xl"
            motionProps={INTERACTION_CONFIG.modalBloom}
            hideCloseButton
            isDismissable={!busy}
            classNames={{
                base: cn(
                    GLASS_MODAL_SURFACE,
                    "w-full overflow-hidden flex flex-col"
                ),
                wrapper: "overflow-hidden",
            }}
            style={{
                maxWidth: "var(--tt-modal-max-width)",
                maxHeight: "var(--tt-modal-body-max-height)",
            }}
        >
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader className="border-b border-default/20 px-stage py-panel">
                            <div className="flex flex-col gap-panel w-full">
                                <div className="flex items-start justify-between gap-tools w-full">
                                    <div className="min-w-0 flex items-center gap-tools">
                                        <StatusIcon
                                            Icon={LifeBuoy}
                                            size="md"
                                            className="text-warning"
                                        />
                                        <span className={HEADER_TITLE}>
                                            {title}
                                        </span>
                                    </div>
                                    <ToolbarIconButton
                                        Icon={X}
                                        ariaLabel={t(
                                            "torrent_modal.actions.close"
                                        )}
                                        onPress={onClose}
                                        iconSize="md"
                                        className="text-foreground/40 hover:text-foreground hidden sm:flex ml-auto"
                                        isDisabled={busy}
                                    />
                                </div>
                                <div className="min-w-0 flex flex-col gap-tight">
                                    <span className={SUBTLE_META}>
                                        {actionLabel}
                                    </span>
                                    {plan?.suggestedPath ? (
                                        <span
                                            className={cn(
                                                SUBTLE_META,
                                                "truncate select-text font-mono"
                                            )}
                                            title={plan.suggestedPath}
                                        >
                                            {plan.suggestedPath}
                                        </span>
                                    ) : (
                                        <span className={SUBTLE_META}>
                                            {t(
                                                "recovery.modal.no_path_available"
                                            )}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </ModalHeader>
                        <ModalBody className="px-stage py-panel flex flex-col gap-panel">
                            <div className="flex flex-col gap-tight">
                                <div className={FIELD_LABEL}>
                                    {t("recovery.modal.problem_heading")}
                                </div>
                                <div className="text-foreground/80">
                                    {plan?.rationale
                                        ? t(plan.rationale)
                                        : t(
                                              "recovery.no_primary_recovery_for_error_class"
                                          )}
                                </div>
                            </div>

                            {primaryDescription ? (
                                <div className="flex flex-col gap-tight">
                                    <div className={FIELD_LABEL}>
                                        {t("recovery.modal.next_heading")}
                                    </div>
                                    <div className="text-foreground/80">
                                        {primaryDescription}
                                    </div>
                                </div>
                            ) : null}

                            {showPathEditor && (
                                <div className="flex flex-col gap-tight">
                                    <div className={FIELD_LABEL}>
                                        {t("recovery.modal.path_heading")}
                                    </div>
                                    <Input
                                        value={pathDraft}
                                        onChange={(event) =>
                                            setPathDraft(
                                                event.target.value ?? ""
                                            )
                                        }
                                        label={t("recovery.modal.path_label")}
                                        labelPlacement="outside"
                                        placeholder={t(
                                            "recovery.modal.path_placeholder"
                                        )}
                                        size="md"
                                        variant="bordered"
                                        isDisabled={busy}
                                        endContent={
                                            onBrowse ? (
                                                <Button
                                                    size="md"
                                                    variant="flat"
                                                    onPress={handleBrowse}
                                                    isLoading={isBrowsing}
                                                    isDisabled={busy}
                                                >
                                                    {t("settings.button.browse")}
                                                </Button>
                                            ) : null
                                        }
                                        classNames={{
                                            label: FIELD_LABEL,
                                            input: "font-mono text-scaled select-text",
                                        }}
                                    />
                                </div>
                            )}

                            {(busy || outcomeMessage) && (
                                <div
                                    className={cn(
                                        "rounded-panel border px-panel py-tight text-label",
                                        busy
                                            ? "border-default/20 bg-content1/10 text-foreground/70"
                                            : getToneClasses(outcomeTone)
                                    )}
                                >
                                    <div className="flex items-center gap-tools">
                                        {busy && <Spinner size="sm" />}
                                        <span>
                                            {busy
                                                ? t(
                                                      "recovery.modal.in_progress"
                                                  )
                                                : outcomeMessage}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </ModalBody>
                        <ModalFooter className="border-t border-default/20 px-stage py-panel flex items-center justify-end gap-tools">
                            {showSecondaryVerify &&
                                plan?.primaryAction !== "verify" && (
                                    <Button
                                        variant="flat"
                                        onPress={onVerify}
                                        isDisabled={busy}
                                        startContent={
                                            <StatusIcon
                                                Icon={CheckCircle2}
                                                size="md"
                                                className="text-current"
                                            />
                                        }
                                    >
                                        {t("recovery.action.verify")}
                                    </Button>
                                )}
                            <Button
                                variant="light"
                                onPress={onClose}
                                isDisabled={busy}
                            >
                                {t("modals.cancel")}
                            </Button>
                            <Button
                                color="primary"
                                variant="shadow"
                                onPress={primary.onPress}
                                isDisabled={primary.isDisabled}
                                startContent={
                                    primary.icon ? (
                                        <StatusIcon
                                            Icon={primary.icon}
                                            size="md"
                                            className="text-current"
                                        />
                                    ) : null
                                }
                            >
                                {primary.label}
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
