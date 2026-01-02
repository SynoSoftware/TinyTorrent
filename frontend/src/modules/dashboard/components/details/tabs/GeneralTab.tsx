import { Button, Switch } from "@heroui/react";
import {
    ArrowDownCircle,
    ArrowUpCircle,
    Copy,
    Folder,
    Hash,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import { formatBytes, formatPercent, formatRatio } from "@/shared/utils/format";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { writeClipboard } from "@/shared/utils/clipboard";
import { TEXT_ROLES } from "./textRoles";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";

interface GeneralTabProps {
    torrent: TorrentDetail;
    downloadDir: string;
    sequentialSupported?: boolean;
    superSeedingSupported?: boolean;
    onSequentialToggle?: (enabled: boolean) => Promise<void> | void;
    onSuperSeedingToggle?: (enabled: boolean) => Promise<void> | void;
    onForceTrackerReannounce?: () => Promise<void> | void;
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
    sequentialSupported,
    superSeedingSupported,
    onSequentialToggle,
    onSuperSeedingToggle,
    onForceTrackerReannounce,
    progressPercent,
    timeRemainingLabel,
}: GeneralTabProps) => {
    const { t } = useTranslation();
    const handleCopyHash = () => writeClipboard(torrent.hash);

    // Compute peer count (no .isActive property in TorrentPeerEntity)
    const peerCount = Array.isArray(torrent.peers) ? torrent.peers.length : 0;

    const showNoDataError =
        typeof torrent.errorString === "string" &&
        torrent.errorString.includes("No data found");

    return (
        <div className="space-y-stage">
            {showNoDataError && (
                <GlassPanel className="p-panel border border-warning/30 bg-warning/10 flex flex-col gap-tools">
                    <div className="text-scaled font-semibold uppercase tracking-tight text-warning">
                        {t("torrent_modal.errors.no_data_found_title", {
                            defaultValue: "No data found!",
                        })}
                    </div>
                    <div className="text-label text-warning/80 mb-tight">
                        {t("torrent_modal.errors.no_data_found_desc", {
                            defaultValue:
                                "Ensure your drives are connected or use 'Set Location'. To re-download, remove the torrent and re-add it.",
                        })}
                    </div>
                    <div className="flex gap-tools mt-tight">
                        <Button
                            size="md"
                            variant="shadow"
                            color="primary"
                            onPress={() => {
                                /* TODO: trigger folder picker */
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
                                /* TODO: remove and re-add torrent */
                            }}
                        >
                            {t("modals.download", {
                                defaultValue: "Re-download",
                            })}
                        </Button>
                        <Button
                            size="md"
                            variant="shadow"
                            color="default"
                            onPress={() => {
                                /* TODO: retry fetch */
                            }}
                        >
                            {t("toolbar.feedback.refresh", {
                                defaultValue: "Retry",
                            })}
                        </Button>
                    </div>
                </GlassPanel>
            )}
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
                        className="h-button text-scaled font-semibold tracking-tight"
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
                        isDisabled={!sequentialSupported}
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
                            {!sequentialSupported && (
                                <span className="text-scaled text-warning">
                                    {t("torrent_modal.controls.not_supported")}
                                </span>
                            )}
                        </div>
                    </Switch>
                    <Switch
                        size="md"
                        color="primary"
                        isDisabled={!superSeedingSupported}
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
                            {!superSeedingSupported && (
                                <span className="text-scaled text-warning">
                                    {t("torrent_modal.controls.not_supported")}
                                </span>
                            )}
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
