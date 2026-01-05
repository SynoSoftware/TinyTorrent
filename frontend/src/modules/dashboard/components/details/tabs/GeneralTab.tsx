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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { CapabilityState } from "@/app/types/capabilities";
import { formatBytes, formatPercent, formatRatio } from "@/shared/utils/format";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { writeClipboard } from "@/shared/utils/clipboard";
import { TEXT_ROLES } from "./textRoles";
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
    onForceTrackerReannounce?: () => Promise<void> | void;
    onSetLocation?: () => Promise<void> | void;
    onRedownload?: () => Promise<void> | void;
    onRetry?: () => Promise<void> | void;
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
    sequentialCapability,
    superSeedingCapability,
    onSequentialToggle,
    onSuperSeedingToggle,
    onForceTrackerReannounce,
    onSetLocation,
    onRedownload,
    onRetry,
    progressPercent,
    timeRemainingLabel,
}: GeneralTabProps) => {
    const { t } = useTranslation();
    const shownFingerprintsRef = useRef<Set<string>>(new Set());
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

    // Compute peer count (no .isActive property in TorrentPeerEntity)
    const peerCount = Array.isArray(torrent.peers) ? torrent.peers.length : 0;

    // Single source of truth: derived in rpc normalizer
    const showMissingFilesError = torrent.state === "missing_files";

    // Show focused confirmation dialog on first render of the
    // needsUserConfirmation recovery state (engine-truth-driven).
    useEffect(() => {
        const fp = torrent.errorEnvelope?.fingerprint ?? null;
        const isConfirm =
            torrent.errorEnvelope?.recoveryState === "needsUserConfirmation";
        if (isConfirm && fp && !shownFingerprintsRef.current.has(fp)) {
            shownFingerprintsRef.current.add(fp);
            setShowConfirm(true);
            return;
        }
        if (!isConfirm) setShowConfirm(false);
    }, [
        torrent.errorEnvelope?.recoveryState,
        torrent.errorEnvelope?.fingerprint,
    ]);

    return (
        <div className="space-y-stage">
            {showMissingFilesError && (
                <GlassPanel className="p-panel border border-warning/30 bg-warning/10 flex flex-col gap-tools">
                    <div className="text-scaled font-semibold uppercase tracking-tight text-warning">
                        {t("torrent_modal.errors.no_data_found_title", {
                            defaultValue: "No data found!",
                        })}
                    </div>
                    <div className="text-label text-warning/80 mb-tight">
                        {torrent.errorEnvelope?.errorMessage
                            ? torrent.errorEnvelope.errorMessage
                            : t("torrent_modal.errors.no_data_found_desc", {
                                  defaultValue:
                                      "Ensure your drives are connected or use 'Set Location'. To re-download, remove the torrent and re-add it.",
                              })}
                    </div>
                    <div className="flex gap-tools mt-tight">
                        {(() => {
                            const emphasis = getEmphasisClassForAction(
                                torrent.errorEnvelope?.primaryAction
                            );
                            return (
                                <Button
                                    size="md"
                                    variant="shadow"
                                    color="primary"
                                    onPress={() => {
                                        if (onSetLocation)
                                            return onSetLocation();
                                        try {
                                            window.dispatchEvent(
                                                new CustomEvent(
                                                    "tiny-torrent:set-location",
                                                    {
                                                        detail: {
                                                            id: torrent.hash,
                                                        },
                                                    }
                                                )
                                            );
                                        } catch (error) {
                                            console.error(
                                                "Failed to set location:",
                                                error
                                            );
                                        }
                                    }}
                                    isDisabled={false}
                                    title={t("tooltip.set_location", {
                                        defaultValue:
                                            "Choose a new directory for the torrent's files.",
                                    })}
                                    className={emphasis}
                                >
                                    {t("directory_browser.select", {
                                        name: t(
                                            "torrent_modal.labels.save_path"
                                        ),
                                        defaultValue: "Set Location",
                                    })}
                                </Button>
                            );
                        })()}

                        {(() => {
                            const emphasis = getEmphasisClassForAction(
                                torrent.errorEnvelope?.primaryAction
                            );
                            return (
                                <Button
                                    size="md"
                                    variant="shadow"
                                    color="danger"
                                    onPress={() => {
                                        if (onRedownload) return onRedownload();
                                        try {
                                            window.dispatchEvent(
                                                new CustomEvent(
                                                    "tiny-torrent:redownload",
                                                    {
                                                        detail: {
                                                            id: torrent.hash,
                                                        },
                                                    }
                                                )
                                            );
                                        } catch (error) {
                                            console.error(
                                                "Failed to re-download torrent:",
                                                error
                                            );
                                        }
                                    }}
                                    isDisabled={false}
                                    title={t("tooltip.redownload", {
                                        defaultValue:
                                            "Re-download the torrent's data. This will overwrite existing files.",
                                    })}
                                    className={emphasis}
                                >
                                    {t("modals.download", {
                                        defaultValue: "Re-download",
                                    })}
                                </Button>
                            );
                        })()}

                        {(() => {
                            const emphasis = getEmphasisClassForAction(
                                torrent.errorEnvelope?.primaryAction
                            );
                            return (
                                <Button
                                    size="md"
                                    variant="shadow"
                                    color="default"
                                    onPress={() => {
                                        if (onRetry) return onRetry();
                                        try {
                                            window.dispatchEvent(
                                                new CustomEvent(
                                                    "tiny-torrent:retry-fetch",
                                                    {
                                                        detail: {
                                                            id: torrent.hash,
                                                        },
                                                    }
                                                )
                                            );
                                        } catch (error) {
                                            console.error(
                                                "Failed to retry torrent fetch:",
                                                error
                                            );
                                        }
                                    }}
                                    isDisabled={false}
                                    title={t("tooltip.retry", {
                                        defaultValue:
                                            "Retry fetching the torrent's metadata or state.",
                                    })}
                                    className={emphasis}
                                >
                                    {t("toolbar.feedback.refresh", {
                                        defaultValue: "Retry",
                                    })}
                                </Button>
                            );
                        })()}

                        {(() => {
                            const emphasis = getEmphasisClassForAction(
                                torrent.errorEnvelope?.primaryAction
                            );
                            return (
                                <Button
                                    size="md"
                                    variant="shadow"
                                    color="primary"
                                    onPress={() => {
                                        window.open(
                                            "https://help.tinytorrent.com/no-data-error",
                                            "_blank"
                                        );
                                    }}
                                    title={t("tooltip.help", {
                                        defaultValue:
                                            "Open the troubleshooting guide for resolving this error.",
                                    })}
                                    className={emphasis}
                                >
                                    {t("toolbar.help", {
                                        defaultValue: "Help",
                                    })}
                                </Button>
                            );
                        })()}
                    </div>
                </GlassPanel>
            )}

            <Modal isOpen={showConfirm} onOpenChange={setShowConfirm}>
                <ModalContent className="max-w-modal">
                    <ModalHeader>
                        {t("modals.missing_files.title", {
                            defaultValue: "Files Missing — Re-download?",
                        })}
                    </ModalHeader>
                    <ModalBody className="max-h-modal-body">
                        <div className="space-y-3">
                            <div>
                                {t("modals.missing_files.body", {
                                    defaultValue:
                                        "The files for this completed torrent are missing from disk. You can re-download them or locate existing files manually.",
                                })}
                            </div>
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <div className="flex items-center justify-end gap-tools w-full">
                            <Button
                                size="md"
                                variant="shadow"
                                color="default"
                                onPress={() => {
                                    // Set Location
                                    if (onSetLocation) {
                                        void onSetLocation();
                                    } else {
                                        try {
                                            window.dispatchEvent(
                                                new CustomEvent(
                                                    "tiny-torrent:set-location",
                                                    {
                                                        detail: {
                                                            id: torrent.id,
                                                            hash: torrent.hash,
                                                        },
                                                    }
                                                )
                                            );
                                        } catch (err) {
                                            console.error(err);
                                        }
                                    }
                                    setShowConfirm(false);
                                }}
                            >
                                {t("directory_browser.select", {
                                    name: t("torrent_modal.labels.save_path"),
                                    defaultValue: "Set Location",
                                })}
                            </Button>

                            <Button
                                size="md"
                                variant="shadow"
                                color="danger"
                                onPress={() => {
                                    if (onRedownload) {
                                        void onRedownload();
                                    } else {
                                        try {
                                            window.dispatchEvent(
                                                new CustomEvent(
                                                    "tiny-torrent:redownload",
                                                    {
                                                        detail: {
                                                            id: torrent.id,
                                                            hash: torrent.hash,
                                                        },
                                                    }
                                                )
                                            );
                                        } catch (err) {
                                            console.error(err);
                                        }
                                    }
                                    setShowConfirm(false);
                                }}
                            >
                                {t("modals.download", {
                                    defaultValue: "Re-download",
                                })}
                            </Button>

                            <Button
                                size="md"
                                variant="flat"
                                color="default"
                                onPress={() => {
                                    // Dismiss
                                    try {
                                        window.dispatchEvent(
                                            new CustomEvent(
                                                "tiny-torrent:dismiss-missing-files",
                                                {
                                                    detail: {
                                                        id: torrent.id,
                                                        hash: torrent.hash,
                                                    },
                                                }
                                            )
                                        );
                                    } catch (err) {
                                        console.error(err);
                                    }
                                    setShowConfirm(false);
                                }}
                            >
                                {t("toolbar.cancel", {
                                    defaultValue: "Cancel",
                                })}
                            </Button>
                        </div>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <GlassPanel className="space-y-3 border border-content1/20 bg-content1/30 p-panel">
                <div className="flex items-center justify-between gap-panel">
                    <div className="flex flex-col">
                        <span className="text-scaled font-semibold text-foreground">
                            {formatPercent(progressPercent, 1)}
                        </span>
                        <span className="text-label text-foreground/60 uppercase tracking-tight">
                            {t("torrent_modal.stats.total_progress")}
                        </span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-scaled font-semibold text-foreground">
                            {timeRemainingLabel}
                        </span>
                        <span className="text-label text-foreground/60 uppercase tracking-tight">
                            {t("torrent_modal.stats.time_remaining")}
                        </span>
                    </div>
                    <div className="flex flex-col items-end text-primary">
                        <span className="text-scaled font-semibold font-mono">
                            {peerCount}
                        </span>
                        <span className="text-label text-primary/80 uppercase tracking-tight">
                            {t("torrent_modal.stats.active")}
                        </span>
                    </div>
                </div>
                <div className="h-sep rounded-full bg-background/30">
                    <SmoothProgressBar
                        value={progressPercent}
                        trackClassName="h-full bg-transparent"
                        indicatorClassName="h-full bg-gradient-to-r from-success/60 via-success to-primary"
                    />
                </div>
            </GlassPanel>

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
                    <Button
                        size="md"
                        variant="flat"
                        color="primary"
                        className={
                            "h-button text-scaled font-semibold tracking-tight " +
                            getEmphasisClassForAction(
                                torrent.errorEnvelope?.primaryAction
                            )
                        }
                        onPress={onForceTrackerReannounce}
                        isDisabled={!onForceTrackerReannounce}
                    >
                        {t("torrent_modal.controls.force_reannounce")}
                    </Button>
                </div>

                <div className="grid gap-tools sm:grid-cols-2">
                    <Switch
                        size="md"
                        color="success"
                        isDisabled={sequentialCapability === "unsupported"}
                        isSelected={Boolean(torrent.sequentialDownload)}
                        onValueChange={(value) =>
                            onSequentialToggle?.(Boolean(value))
                        }
                    >
                        <div className="flex flex-col items-start gap-tight">
                            <span className="text-scaled font-semibold tracking-tight">
                                {t("torrent_modal.controls.sequential")}
                            </span>
                            <span className="text-scaled text-foreground/50">
                                {t("torrent_modal.controls.sequential_helper")}
                            </span>
                            {renderCapabilityNote(sequentialCapability)}
                        </div>
                    </Switch>

                    <Switch
                        size="md"
                        color="primary"
                        isDisabled={superSeedingCapability === "unsupported"}
                        isSelected={Boolean(torrent.superSeeding)}
                        onValueChange={(value) =>
                            onSuperSeedingToggle?.(Boolean(value))
                        }
                    >
                        <div className="flex flex-col items-start gap-tight">
                            <span className="text-scaled font-semibold tracking-tight">
                                {t("torrent_modal.controls.super_seeding")}
                            </span>
                            <span className="text-scaled text-foreground/50">
                                {t(
                                    "torrent_modal.controls.super_seeding_helper"
                                )}
                            </span>
                            {renderCapabilityNote(superSeedingCapability)}
                        </div>
                    </Switch>
                </div>
            </GlassPanel>

            <div className="grid grid-cols-1 gap-panel sm:grid-cols-2">
                <GeneralInfoCard
                    icon={ArrowDownCircle}
                    label={t("torrent_modal.stats.downloaded")}
                    value={
                        <span className="font-mono text-scaled">
                            {formatBytes(torrent.downloaded)}
                        </span>
                    }
                    helper={t("torrent_modal.stats.downloaded_helper")}
                    accent="text-success"
                />
                <GeneralInfoCard
                    icon={ArrowUpCircle}
                    label={t("torrent_modal.stats.uploaded")}
                    value={
                        <span className="font-mono text-scaled text-primary">
                            {formatBytes(torrent.uploaded)}
                        </span>
                    }
                    helper={t("torrent_modal.stats.ratio", {
                        ratio: formatRatio(torrent.ratio, 2),
                    })}
                    accent="text-primary"
                />
            </div>

            <div className="grid grid-cols-1 gap-panel sm:grid-cols-2">
                <GlassPanel className="p-panel space-y-3">
                    <div className="flex items-center gap-tools">
                        <StatusIcon
                            Icon={Folder}
                            size="sm"
                            strokeWidth={ICON_STROKE_WIDTH}
                            className="text-foreground/50"
                        />
                        <span
                            className="text-scaled uppercase text-foreground/40"
                            style={{
                                letterSpacing: "var(--tt-tracking-ultra)",
                            }}
                        >
                            {t("torrent_modal.labels.save_path")}
                        </span>
                    </div>
                    <code className="font-mono text-scaled text-foreground/70 bg-content1/20 px-tight py-tight rounded wrap-break-word">
                        {downloadDir}
                    </code>
                </GlassPanel>

                <GlassPanel className="p-panel space-y-3">
                    <div className="flex items-center justify-between gap-tools">
                        <div className="flex items-center gap-tools">
                            <StatusIcon
                                Icon={Hash}
                                size="sm"
                                strokeWidth={ICON_STROKE_WIDTH}
                                className="text-foreground/50"
                            />
                            <span className="text-scaled uppercase tracking-label text-foreground/40">
                                {t("torrent_modal.labels.info_hash")}
                            </span>
                        </div>
                        <ToolbarIconButton
                            Icon={Copy}
                            ariaLabel={t("table.actions.copy_hash")}
                            onPress={handleCopyHash}
                            iconSize="md"
                            className="text-foreground/50 hover:text-foreground"
                        />
                    </div>
                    <code className="font-mono text-scaled text-foreground/70 bg-content1/20 px-tight py-tight rounded wrap-break-word">
                        {torrent.hash}
                    </code>
                </GlassPanel>
            </div>
        </div>
    );
};
