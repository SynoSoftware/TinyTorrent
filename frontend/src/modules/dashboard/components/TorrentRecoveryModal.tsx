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
    Divider,
    Chip,
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
    "w-full max-w-xl overflow-hidden flex flex-col shadow-2xl border border-white/10";
const SECTION_TITLE =
    "text-xs font-bold tracking-widest text-foreground/40 uppercase mb-3 flex items-center gap-2";

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
                bg: "bg-success/10",
                border: "border-success/20",
                icon: CheckCircle2,
                text: "text-success",
            };
        case "warning":
            return {
                bg: "bg-warning/10",
                border: "border-warning/20",
                icon: AlertTriangle,
                text: "text-warning",
            };
        case "danger":
            return {
                bg: "bg-danger/10",
                border: "border-danger/20",
                icon: Ban,
                text: "text-danger",
            };
        default:
            return {
                bg: "bg-content1/20",
                border: "border-white/5",
                icon: Info,
                text: "text-foreground/70",
            };
    }
}

function resolveOutcomeMessage(
    outcome: RecoveryOutcome | null,
    t: TFunction
): string | null {
    const raw = outcome?.message;
    if (!raw) return null;
    return RECOVERY_MESSAGE_LABEL_KEY[raw]
        ? t(RECOVERY_MESSAGE_LABEL_KEY[raw])
        : raw;
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
                body: "p-0",
                header: "border-b border-white/5 bg-black/40 px-6 py-5",
                footer: "border-t border-white/5 bg-black/40 px-6 py-5",
            }}
        >
            <ModalContent>
                {() => (
                    <>
                        {/* --- HEADER --- */}
                        <ModalHeader className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4 min-w-0">
                                <div className="p-3 rounded-full bg-danger/10 border border-danger/20 shrink-0">
                                    <StatusIcon
                                        Icon={LifeBuoy}
                                        size="lg"
                                        className="text-danger animate-pulse-slow"
                                    />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <h2 className="text-base font-bold tracking-wide uppercase text-foreground">
                                        {title}
                                    </h2>
                                    {/* Action Label Context */}
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-foreground/50 font-medium">
                                        <ArrowRight
                                            size={12}
                                            className="text-primary"
                                        />
                                        <span>{actionLabel}</span>
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

                        {/* --- BODY --- */}
                        <ModalBody className="p-8 flex flex-col gap-8 bg-content1/5">
                            {/* SECTION 1: THE DIAGNOSIS (Problem) */}
                            <div className="relative">
                                {/* Vertical Line connecting Diagnosis to Solution */}
                                <div className="absolute left-[19px] top-8 bottom-[-40px] w-[2px] bg-gradient-to-b from-danger/20 to-primary/20" />

                                <span className={SECTION_TITLE}>
                                    <Activity
                                        size={12}
                                        className="text-danger"
                                    />{" "}
                                    {t("recovery.modal.problem_heading")}
                                </span>

                                <div className="flex items-start gap-4">
                                    <div className="shrink-0 mt-1 size-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center z-10">
                                        <AlertOctagon
                                            size={20}
                                            className="text-danger"
                                        />
                                    </div>
                                    <div className="pt-1">
                                        <p className="text-lg font-light text-foreground/90 leading-relaxed">
                                            {plan?.rationale
                                                ? t(plan.rationale)
                                                : t(
                                                      "recovery.no_primary_recovery_for_error_class"
                                                  )}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* SECTION 2: THE TREATMENT (Solution) */}
                            {primaryDescription && (
                                <div className="relative z-10">
                                    <span className={SECTION_TITLE}>
                                        <Waypoints
                                            size={12}
                                            className="text-primary"
                                        />{" "}
                                        {t("recovery.modal.next_heading")}
                                    </span>

                                    <div className="flex items-start gap-4">
                                        <div className="shrink-0 mt-1 size-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center">
                                            <StatusIcon
                                                Icon={primary.icon || Play}
                                                size="md"
                                                className="text-primary"
                                            />
                                        </div>
                                        <div className="pt-1 flex-1">
                                            <p className="text-base text-foreground/70 leading-relaxed mb-4">
                                                {primaryDescription}
                                            </p>
                                            {/* Path Context */}
                                            {!requiresUserPath &&
                                                plan?.suggestedPath && (
                                                    <div className="flex items-center gap-2 mt-4">
                                                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/20 border border-white/5 w-fit max-w-full">
                                                            <HardDrive
                                                                size={14}
                                                                className="text-foreground/40 shrink-0"
                                                            />
                                                            <span
                                                                className="font-mono text-xs text-foreground/60 truncate max-w-[200px]"
                                                                title={
                                                                    plan.suggestedPath
                                                                }
                                                            >
                                                                {
                                                                    plan.suggestedPath
                                                                }
                                                            </span>
                                                        </div>
                                                        {/* The "Let me choose" button */}
                                                        <Button
                                                            size="sm"
                                                            variant="light"
                                                            isIconOnly
                                                            onPress={() =>
                                                                setIsManuallyEditing(
                                                                    true
                                                                )
                                                            }
                                                            className="text-foreground/40 hover:text-primary"
                                                        >
                                                            <FolderOpen
                                                                size={16}
                                                            />
                                                        </Button>
                                                    </div>
                                                )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* SECTION 3: INTERVENTION (Input) */}
                            {requiresUserPath && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 pl-[56px]">
                                    <div className="flex gap-3">
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
                                                <FolderOpen
                                                    size={18}
                                                    className="text-foreground/40 mr-1"
                                                />
                                            }
                                            size="lg"
                                            variant="faded"
                                            isDisabled={busy}
                                            classNames={{
                                                input: "font-mono text-sm",
                                                inputWrapper:
                                                    "bg-black/20 hover:bg-black/30 border-white/10 active:border-primary/50",
                                            }}
                                            className="shadow-lg"
                                        />
                                        {onBrowse && (
                                            <Button
                                                isIconOnly
                                                size="lg"
                                                variant="flat"
                                                onPress={handleBrowse}
                                                isLoading={isBrowsing}
                                                isDisabled={busy}
                                                className="bg-white/5 border border-white/10 shrink-0"
                                            >
                                                <Search
                                                    size={20}
                                                    className="text-foreground/60"
                                                />
                                            </Button>
                                        )}
                                        {isManuallyEditing && (
                                            <Button
                                                size="lg"
                                                variant="flat"
                                                className="bg-white/5 border border-white/10 shrink-0"
                                                onPress={() =>
                                                    setIsManuallyEditing(false)
                                                }
                                            >
                                                Cancel path edit
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* SECTION 4: LIVE STATUS */}
                            {(busy || outcomeMessage) && (
                                <div
                                    className={cn(
                                        "ml-[56px] rounded-lg border p-4 flex items-center gap-4 transition-all duration-300",
                                        toneStyles.bg,
                                        toneStyles.border
                                    )}
                                >
                                    {busy ? (
                                        <Spinner size="md" color="current" />
                                    ) : (
                                        <StatusIcon
                                            Icon={toneStyles.icon}
                                            size="md"
                                            className={toneStyles.text}
                                        />
                                    )}
                                    <span
                                        className={cn(
                                            "text-sm font-medium",
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

                        {/* --- FOOTER --- */}
                        <ModalFooter className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                {showSecondaryVerify &&
                                    plan?.primaryAction !== "verify" && (
                                        <Button
                                            variant="ghost"
                                            size="md"
                                            onPress={onVerify}
                                            isDisabled={busy}
                                            startContent={
                                                <FileWarning size={18} />
                                            }
                                            className="text-foreground/50 hover:text-foreground"
                                        >
                                            {t("recovery.action.verify")}
                                        </Button>
                                    )}
                            </div>

                            <div className="flex items-center gap-4">
                                <Button
                                    variant="light"
                                    onPress={onClose}
                                    isDisabled={busy}
                                    className="font-medium text-foreground/60"
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
                                    className="font-bold px-8 shadow-xl shadow-primary/10"
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
