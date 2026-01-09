// FILE: src/modules/dashboard/torrent-detail/GeneralTab.tsx
import {
    Button,
    Switch,
    Modal,
    ModalContent,
    ModalBody,
    ModalFooter,
    ModalHeader,
} from "@heroui/react";
import {
    ArrowDownCircle,
    ArrowUpCircle,
    Copy,
    Folder,
    Hash,
    Play,
    Pause,
    CheckCircle,
    RefreshCw,
    Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import React, { useEffect, useState } from "react";
import RemoveConfirmationModal from "@/modules/torrent-remove/components/RemoveConfirmationModal";
import TorrentRecoveryModal from "@/modules/dashboard/components/TorrentRecoveryModal";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { CapabilityState } from "@/app/types/capabilities";
import { formatBytes, formatPercent, formatRatio } from "@/shared/utils/format";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { writeClipboard } from "@/shared/utils/clipboard";
import { TEXT_ROLES } from "../hooks/utils/textRoles";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { getEmphasisClassForAction } from "@/shared/utils/recoveryFormat";

interface GeneralTabProps {
    torrent: TorrentDetail;
    downloadDir: string;
    sequentialCapability: CapabilityState;
    superSeedingCapability: CapabilityState;
    onSequentialToggle?: (enabled: boolean) => Promise<void> | void;
    onSuperSeedingToggle?: (enabled: boolean) => Promise<void> | void;
    onForceTrackerReannounce?: () => Promise<string | void> | void;
    onSetLocation?: () => Promise<void> | void;
    onRedownload?: () => Promise<void> | void;
    onRetry?: () => Promise<void> | void;
    onResume?: () => Promise<void> | void;
    // Recovery integration
    recoveryPlan?:
        | import("@/services/recovery/recovery-controller").RecoveryPlan
        | null;
    recoveryCallbacks?:
        | import("@/modules/dashboard/hooks/useRecoveryController").RecoveryCallbacks
        | null;
    isRecoveryBusy?: boolean;
    lastRecoveryOutcome?:
        | import("@/services/recovery/recovery-controller").RecoveryOutcome
        | null;
    recoveryRequestBrowse?: (currentPath?: string) => Promise<string | null>;
    progressPercent: number;
    timeRemainingLabel: string;
    activePeers: number;
}

interface GeneralInfoCardProps {
    icon: LucideIcon;
    label: string;
    value: ReactNode;
    helper: string;
    accent?: string;
}

const GeneralInfoCard = ({
    icon: Icon,
    label,
    value,
    helper,
    accent,
}: GeneralInfoCardProps) => (
    <GlassPanel className="p-panel">
        <div className="flex items-start gap-tools">
            <div className="flex size-icon-btn-lg items-center justify-center rounded-xl border border-content1/20 bg-content1/30">
                <StatusIcon
                    Icon={Icon}
                    size="lg"
                    className={accent ?? "text-foreground/70"}
                    strokeWidth={ICON_STROKE_WIDTH}
                />
            </div>
            <div className="flex-1">
                <div className={TEXT_ROLES.label}>{label}</div>
                <div className={`${TEXT_ROLES.primary} font-mono`}>{value}</div>
                <div className={TEXT_ROLES.helper}>{helper}</div>
            </div>
        </div>
    </GlassPanel>
);

export const GeneralTab = ({
    torrent,
    downloadDir,
    sequentialCapability: _sequentialCapability,
    superSeedingCapability: _superSeedingCapability,
    onSequentialToggle: _onSequentialToggle,
    onSuperSeedingToggle: _onSuperSeedingToggle,
    onForceTrackerReannounce,
    onSetLocation,
    onRedownload: _onRedownload,
    onRetry,
    onResume,
    // Recovery props
    recoveryPlan,
    recoveryCallbacks,
    isRecoveryBusy,
    lastRecoveryOutcome,
    recoveryRequestBrowse,
    progressPercent: _progressPercent,
    timeRemainingLabel: _timeRemainingLabel,
    activePeers,
}: GeneralTabProps) => {
    const { t } = useTranslation();
    const [showConfirm, setShowConfirm] = useState(false);
    const handleCopyHash = () => writeClipboard(torrent.hash);

    const renderCapabilityNote = (state: CapabilityState) => {
        if (state === "supported") return null;
        const message =
            state === "unsupported"
                ? t("torrent_modal.controls.not_supported")
                : t("torrent_modal.controls.capability_probe_pending");
        return <span className="text-scaled text-warning">{message}</span>;
    };

    const peerCount = activePeers;

    // Single source of truth: derived in rpc normalizer
    const showMissingFilesError = torrent.state === "missing_files";

    const handleSetLocationAction = () => {
        if (onSetLocation) return onSetLocation();
        console.warn(
            "set-location action requires a typed onSetLocation handler; global events removed"
        );
    };

    const handleRedownloadAction = () => {
        if (_onRedownload) return _onRedownload();
        console.warn(
            "redownload action requires a typed onRedownload handler; global events removed"
        );
    };

    const handleForceRecheckAction = () => {
        if (onRetry) return onRetry();
        console.warn(
            "retry/verify action requires a typed onRetry handler; global events removed"
        );
    };

    const handleResumeAction = () => {
        if (onResume) return onResume();
        console.warn(
            "resume action requires a typed onResume handler; global events removed"
        );
    };

    // Build recovery buttons dynamically from the envelope's recoveryActions
    const buildRecoveryButtons = () => {
        const actions = torrent.errorEnvelope?.recoveryActions ?? [];
        const buttons: {
            id: string;
            color: "primary" | "danger" | "default";
            label: string;
            tooltip: string;
            onPress: () => Promise<void> | void;
        }[] = [];

        for (const a of actions) {
            if (a === "resume") {
                buttons.push({
                    id: a,
                    color: "primary",
                    label: t("toolbar.resume"),
                    tooltip: t("tooltip.resume"),
                    onPress: handleResumeAction,
                });
                continue;
            }
            if (a === "forceRecheck") {
                buttons.push({
                    id: a,
                    color: "primary",
                    label: t("torrent_modal.controls.verify"),
                    tooltip: t("tooltip.verify"),
                    onPress: handleForceRecheckAction,
                });
            } else if (a === "setLocation" || a === "changeLocation") {
                buttons.push({
                    id: a,
                    color: "primary",
                    label: t("directory_browser.select", {
                        name: t("torrent_modal.labels.save_path"),
                    }),
                    tooltip: t("tooltip.set_location"),
                    onPress: handleSetLocationAction,
                });
            } else if (a === "reDownload") {
                buttons.push({
                    id: a,
                    color: "danger",
                    label: t("modals.download"),
                    tooltip: t("tooltip.redownload"),
                    onPress: handleRedownloadAction,
                });
            } else if (a === "reannounce") {
                buttons.push({
                    id: a,
                    color: "default",
                    label: t("torrent_modal.controls.force_reannounce"),
                    tooltip: t("tooltip.reannounce"),
                    onPress: async () => {
                        if (!onForceTrackerReannounce) return;
                        await onForceTrackerReannounce();
                    },
                });
            } else {
                console.info(
                    `[tiny-torrent][general-tab] Skipping unsupported recovery action "${a}"`
                );
            }
        }

        // Ensure primaryAction is first in the resulting array
        if (torrent.errorEnvelope?.primaryAction) {
            const prim = torrent.errorEnvelope.primaryAction;
            const primIdx = buttons.findIndex((b) => b.id === prim);
            if (primIdx > 0) {
                const [p] = buttons.splice(primIdx, 1);
                buttons.unshift(p);
            }
        }

        return buttons;
    };

    const orderedRecoveryButtons = buildRecoveryButtons();
    const modalPrimaryAction = orderedRecoveryButtons[0] ?? null;
    const modalSecondaryActions = orderedRecoveryButtons
        .slice(1)
        .filter((action) => action.id !== "dismiss");
    const isEngineVerifying =
        torrent.errorEnvelope?.recoveryState === "verifying" ||
        (torrent.verificationProgress ?? 0) > 0;
    const isForceRecheckPrimary = modalPrimaryAction?.id === "forceRecheck";
    const isVerifying = isForceRecheckPrimary && isEngineVerifying;
    const verifyingLabel = t("torrent_modal.controls.verifying");
    const showPrimaryLabel = modalPrimaryAction
        ? isVerifying
            ? verifyingLabel
            : modalPrimaryAction.label
        : "";

    const needsUserConfirmation =
        torrent.errorEnvelope?.recoveryState === "needsUserConfirmation";
    useEffect(() => {
        setShowConfirm(needsUserConfirmation);
    }, [needsUserConfirmation]);

    // Local modal state for recovery flow
    const [showRecoveryModal, setShowRecoveryModal] = useState(false);

    const statusLabelKey = `table.status_${torrent.state}`;
    const statusLabel = t(statusLabelKey, {
        defaultValue: torrent.state.replace("_", " "),
    });

    const recoveryStateLabel = torrent.errorEnvelope?.errorClass
        ? t(`recovery.class.${torrent.errorEnvelope.errorClass}`)
        : statusLabel;
    const statusIconClass = showMissingFilesError
        ? "text-warning/70"
        : "text-foreground/60";

    const mainAction = modalPrimaryAction?.onPress ?? handleResumeAction;
    const mainLabel =
        modalPrimaryAction?.label ??
        t("toolbar.resume");
    const downloadRate = torrent.speed?.down ?? 0;
    const uploadRate = torrent.speed?.up ?? 0;

    const handlePauseAction = () => {
        console.warn(
            "pause action requires a typed onPause handler; global events removed"
        );
    };

    const [showRemoveModal, setShowRemoveModal] = useState(false);

    const handleRemoveAction = () => {
        setShowRemoveModal(true);
    };

    const handleRemoveConfirm = async (deleteData: boolean) => {
        try {
            window.dispatchEvent(
                new CustomEvent("tiny-torrent:remove", {
                    detail: { id: torrent.id, hash: torrent.hash, deleteData },
                })
            );
        } catch (err) {
            console.error("dispatch remove event failed", err);
        }
    };

    const getIconForAction = (id: string | null | undefined) => {
        switch (id) {
            case "resume":
                return Play;
            case "forceRecheck":
                return CheckCircle;
            case "setLocation":
            case "changeLocation":
                return Folder;
            case "reDownload":
                return ArrowDownCircle;
            case "reannounce":
                return RefreshCw;
            case "pause":
                return Pause;
            case "remove":
            case "delete":
                return Trash2;
            default:
                return null;
        }
    };

    const isActive =
        torrent.state === "downloading" || torrent.state === "seeding";
    const mainActionLabel = isActive
        ? t("toolbar.pause")
        : t("toolbar.resume");

    return (
        <div className="space-y-stage">
            <Modal isOpen={showConfirm} onOpenChange={setShowConfirm}>
                <ModalContent className="max-w-modal">
                    <ModalHeader>
                        {t("modals.missing_files.title")}
                    </ModalHeader>
                    <ModalBody className="max-h-modal-body">
                        <div className="space-y-3">
                            <div>
                                {t("modals.missing_files.body")}
                            </div>
                            {isVerifying && (
                                <div className="text-label text-foreground/60">
                                    {verifyingLabel}
                                </div>
                            )}
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <div className="flex items-center justify-end gap-tools w-full">
                            {modalPrimaryAction && (
                                <Button
                                    size="md"
                                    variant="shadow"
                                    color={modalPrimaryAction.color}
                                    title={
                                        modalPrimaryAction.tooltip || undefined
                                    }
                                    onPress={async () => {
                                        try {
                                            if (recoveryCallbacks) {
                                                const outcome =
                                                    await recoveryCallbacks.handlePrimaryRecovery();
                                                // If controller asks for a path or reports noop, show recovery modal to let user pick or see guidance
                                                if (
                                                    outcome.kind ===
                                                        "path-needed" ||
                                                    outcome.kind === "noop"
                                                ) {
                                                    setShowConfirm(false);
                                                    setShowRecoveryModal(true);
                                                    return;
                                                }
                                                if (outcome.kind === "error") {
                                                    // Surface via console and require user action
                                                    console.error(
                                                        "recovery primary action failed",
                                                        outcome.message
                                                    );
                                                    setShowConfirm(false);
                                                    return;
                                                }
                                            }
                                            // Fallback to existing action
                                            void modalPrimaryAction.onPress();
                                            if (
                                                modalPrimaryAction.id !==
                                                "forceRecheck"
                                            ) {
                                                setShowConfirm(false);
                                            }
                                        } catch (err) {
                                            console.error(
                                                "primary recovery action failed",
                                                err
                                            );
                                        }
                                    }}
                                    isDisabled={isVerifying}
                                    className={isVerifying ? "opacity-80" : ""}
                                >
                                    {(() => {
                                        const Icon = getIconForAction(
                                            modalPrimaryAction.id
                                        );
                                        return (
                                            <>
                                                {Icon && (
                                                    <Icon
                                                        size={16}
                                                        strokeWidth={
                                                            ICON_STROKE_WIDTH
                                                        }
                                                        className="mr-2"
                                                    />
                                                )}
                                                {showPrimaryLabel}
                                            </>
                                        );
                                    })()}
                                </Button>
                            )}

                            <Button
                                size="md"
                                variant="flat"
                                color="default"
                                onPress={() => {
                                    // Do not suppress engine-driven prompts. Close modal
                                    // and allow the engine to continue driving recovery.
                                    setShowConfirm(false);
                                }}
                            >
                                {t("toolbar.cancel")}
                            </Button>
                            {modalSecondaryActions.map((action) => (
                                <Button
                                    key={action.id}
                                    size="md"
                                    variant="shadow"
                                    color={action.color}
                                    title={action.tooltip}
                                    onPress={() => {
                                        void action.onPress();
                                        setShowConfirm(false);
                                    }}
                                    isDisabled={isVerifying}
                                >
                                    {(() => {
                                        const Icon = getIconForAction(
                                            action.id
                                        );
                                        return (
                                            <>
                                                {Icon && (
                                                    <Icon
                                                        size={16}
                                                        strokeWidth={
                                                            ICON_STROKE_WIDTH
                                                        }
                                                        className="mr-2"
                                                    />
                                                )}
                                                {action.label}
                                            </>
                                        );
                                    })()}
                                </Button>
                            ))}
                            <Button
                                size="md"
                                variant="flat"
                                color="default"
                                onPress={() => {
                                    // Do not suppress engine-driven prompts. Close modal
                                    // and allow the engine to continue driving recovery.
                                    setShowConfirm(false);
                                }}
                            >
                                {t("toolbar.cancel")}
                            </Button>
                        </div>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            {/* Recovery modal (controller-driven) */}
            <TorrentRecoveryModal
                isOpen={showRecoveryModal}
                plan={recoveryPlan ?? null}
                outcome={lastRecoveryOutcome ?? null}
                onClose={() => setShowRecoveryModal(false)}
                onPrimary={async () => {
                    if (!recoveryCallbacks) return;
                    await recoveryCallbacks.handlePrimaryRecovery();
                    setShowRecoveryModal(false);
                }}
                onPickPath={async (path: string) => {
                    if (!recoveryCallbacks) return;
                    await recoveryCallbacks.handlePickPath(path);
                    setShowRecoveryModal(false);
                }}
                onVerify={async () => {
                    if (!recoveryCallbacks) return;
                    await recoveryCallbacks.handleVerify();
                    setShowRecoveryModal(false);
                }}
                onBrowse={async () => {
                    // Prefer engine-native browse if available via parent prop
                    if (recoveryRequestBrowse) {
                        try {
                            const p = await recoveryRequestBrowse(
                                torrent.downloadDir ?? undefined
                            );
                            return p;
                        } catch {
                            // fallback to prompt
                        }
                    }
                    // Fallback: prompt
                    const pick = window.prompt(
                        t("recovery.prompt.enter_new_path"),
                        torrent.downloadDir ?? ""
                    );
                    if (pick === null) return null;
                    const trimmed = pick.trim();
                    if (!trimmed) return null;
                    return trimmed;
                }}
                isBusy={isRecoveryBusy ?? false}
            />

            <GlassPanel className="p-panel space-y-3 bg-content1/30 border border-content1/20">
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <div className="text-label text-foreground/60">
                            {t("torrent_modal.labels.save_path")}
                        </div>
                        <code className="font-mono text-scaled text-foreground/70 bg-content1/20 px-tight py-tight rounded wrap-break-word mt-2">
                            {downloadDir ??
                                (torrent as any).downloadDir ??
                                (torrent as any).savePath ??
                                ""}
                        </code>
                    </div>
                    <div className="w-1/3 pl-4">
                        <div className="text-label text-foreground/60">
                            {t("torrent_modal.controls.verify")}
                        </div>
                        <div className="mt-2">
                            {(() => {
                                const p = torrent.verificationProgress ?? 0;
                                const percent = p > 1 ? p : p * 100;
                                return (
                                    <SmoothProgressBar
                                        value={percent}
                                        trackClassName="h-3 bg-transparent"
                                        indicatorClassName="h-3 bg-gradient-to-r from-primary to-success"
                                    />
                                );
                            })()}
                        </div>
                    </div>
                </div>
            </GlassPanel>

            {showMissingFilesError && (
                <GlassPanel className="p-panel border border-warning/30 bg-warning/10 space-y-3">
                    <div className="flex items-start justify-between gap-panel">
                        <div className="space-y-tight">
                            <span className="text-scaled font-semibold uppercase tracking-tight text-warning">
                                {t("torrent_modal.errors.no_data_found_title")}
                            </span>
                            <p className="text-label text-warning/80">
                                {torrent.errorEnvelope?.errorMessage
                                    ? torrent.errorEnvelope.errorMessage
                                    : t(
                                          "torrent_modal.errors.no_data_found_desc"
                                      )}
                            </p>
                        </div>
                        <Button
                            size="md"
                            variant="shadow"
                            color={
                                modalPrimaryAction?.id === "resume"
                                    ? "primary"
                                    : "default"
                            }
                            onPress={() => {
                                void mainAction();
                            }}
                            isDisabled={!mainAction}
                        >
                            {(() => {
                                const Icon = getIconForAction(
                                    modalPrimaryAction?.id ??
                                        (isActive ? "pause" : "resume")
                                );
                                return (
                                    <>
                                        {Icon && (
                                            <Icon
                                                size={16}
                                                strokeWidth={ICON_STROKE_WIDTH}
                                                className="mr-2"
                                            />
                                        )}
                                        {mainLabel}
                                    </>
                                );
                            })()}
                        </Button>
                    </div>
                </GlassPanel>
            )}

            <GlassPanel className="p-panel space-y-4 bg-content1/30 border border-content1/20">
                <div className="flex items-center justify-between gap-panel">
                    <div className="flex flex-col gap-tight">
                        <span
                            className="text-scaled uppercase text-foreground/40"
                            style={{
                                letterSpacing: "var(--tt-tracking-ultra)",
                            }}
                        >
                            {t("torrent_modal.controls.title")}
                        </span>
                        <p className="text-scaled text-foreground/50">
                            {t("torrent_modal.controls.description")}
                        </p>
                    </div>
                </div>
            </GlassPanel>

            <div className="grid gap-tools sm:grid-cols-2">
                <div className="col-span-2">
                    <GlassPanel className="p-panel space-y-4 bg-content1/30 border border-content1/20">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-label text-foreground/60">
                                    {t("torrent_modal.controls.title")}
                                </div>
                                <div className="text-scaled text-foreground/50">
                                    {t("torrent_modal.controls.description")}
                                </div>
                            </div>
                            <div className="flex items-center gap-tools">
                                {/* Force reannounce moved to Trackers tab per UX decision */}
                                <Button
                                    size="md"
                                    variant="flat"
                                    color={isActive ? "default" : "primary"}
                                    onPress={() => {
                                        if (isActive) handlePauseAction();
                                        else handleResumeAction();
                                    }}
                                >
                                    {(() => {
                                        const Icon = getIconForAction(
                                            isActive ? "pause" : "resume"
                                        );
                                        return (
                                            <>
                                                {Icon && (
                                                    <Icon
                                                        size={16}
                                                        strokeWidth={
                                                            ICON_STROKE_WIDTH
                                                        }
                                                        className="mr-2"
                                                    />
                                                )}
                                                {mainActionLabel}
                                            </>
                                        );
                                    })()}
                                </Button>
                                <Button
                                    size="md"
                                    variant="flat"
                                    color="primary"
                                    onPress={() =>
                                        void handleForceRecheckAction()
                                    }
                                >
                                    <>
                                        <CheckCircle
                                            size={16}
                                            strokeWidth={ICON_STROKE_WIDTH}
                                            className="mr-2"
                                        />
                                        {t("torrent_modal.controls.verify")}
                                    </>
                                </Button>
                                <Button
                                    size="md"
                                    variant="flat"
                                    color="default"
                                    onPress={() =>
                                        void handleSetLocationAction()
                                    }
                                >
                                    <>
                                        <Folder
                                            size={16}
                                            strokeWidth={ICON_STROKE_WIDTH}
                                            className="mr-2"
                                        />
                                        {t("directory_browser.select", {
                                            name: t(
                                                "torrent_modal.labels.save_path"
                                            ),
                                        })}
                                    </>
                                </Button>
                                <Button
                                    size="md"
                                    variant="flat"
                                    color="danger"
                                    onPress={() => handleRemoveAction()}
                                >
                                    <>
                                        <Trash2
                                            size={16}
                                            strokeWidth={ICON_STROKE_WIDTH}
                                            className="mr-2"
                                        />
                                        {t("toolbar.remove")}
                                    </>
                                </Button>
                            </div>
                        </div>
                    </GlassPanel>
                </div>
            </div>
            {showRemoveModal && (
                <RemoveConfirmationModal
                    isOpen={showRemoveModal}
                    onClose={() => setShowRemoveModal(false)}
                    onConfirm={handleRemoveConfirm}
                    torrentCount={1}
                    torrentIds={[torrent.id]}
                />
            )}
        </div>
    );
};

export default GeneralTab;

// Recovery modal: keep at module bottom to avoid cluttering main render logic
