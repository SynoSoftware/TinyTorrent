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
    <GlassPanel className="p-4">
        <div className="flex items-start gap-3">
            <div className="flex size-icon-btn-lg items-center justify-center rounded-xl border border-content1/20 bg-content1/30">
                <Icon
                    size={18}
                    strokeWidth={ICON_STROKE_WIDTH}
                    className={accent ?? "text-foreground/70"}
                />
            </div>
            <div className="flex-1">
                <div
                    className="text-scaled uppercase text-foreground/40"
                    style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
                >
                    {label}
                </div>
                <div className="text-lg font-semibold text-foreground">
                    {value}
                </div>
                <div className="text-scaled text-foreground/50">{helper}</div>
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
        <div className="space-y-6">
            {showNoDataError && (
                <GlassPanel className="p-4 border border-warning/30 bg-warning/10 flex flex-col gap-tools">
                    <div className="font-semibold text-warning text-sm">
                        {t("torrent_modal.errors.no_data_found_title", {
                            defaultValue: "No data found!",
                        })}
                    </div>
                    <div className="text-warning text-xs mb-2">
                        {t("torrent_modal.errors.no_data_found_desc", {
                            defaultValue:
                                "Ensure your drives are connected or use 'Set Location'. To re-download, remove the torrent and re-add it.",
                        })}
                    </div>
                    <div className="flex gap-tools mt-2">
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
            <GlassPanel className="space-y-3 border border-content1/20 bg-content1/30 p-4">
                <div
                    className="flex items-center justify-between gap-4 text-scaled uppercase text-foreground/50"
                    style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
                >
                    <div className="flex flex-col">
                        <span className="text-xs font-semibold text-foreground">
                            {formatPercent(progressPercent, 1)}
                        </span>
                        <span>{t("torrent_modal.stats.total_progress")}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-xs font-semibold text-foreground">
                            {timeRemainingLabel}
                        </span>
                        <span>{t("torrent_modal.stats.time_remaining")}</span>
                    </div>
                    <div className="flex flex-col items-end text-primary">
                        <span className="text-xs font-semibold font-mono">
                            {peerCount}
                        </span>
                        <span>{t("torrent_modal.stats.active")}</span>
                    </div>
                </div>
                <div className="h-2 rounded-full bg-background/30">
                    <SmoothProgressBar
                        value={progressPercent}
                        trackClassName="h-full bg-transparent"
                        indicatorClassName="h-full bg-gradient-to-r from-success/60 via-success to-primary"
                    />
                </div>
            </GlassPanel>
            <GlassPanel className="p-4 space-y-4 bg-content1/30 border border-content1/20">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
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
                        variant="shadow"
                        color="primary"
                        className="h-8"
                        onPress={onForceTrackerReannounce}
                        isDisabled={!onForceTrackerReannounce}
                    >
                        {t("torrent_modal.controls.force_reannounce")}
                    </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Switch
                        size="md"
                        color="success"
                        isDisabled={!sequentialSupported}
                        isSelected={Boolean(torrent.sequentialDownload)}
                        onValueChange={(value) =>
                            onSequentialToggle?.(Boolean(value))
                        }
                    >
                        <div className="flex flex-col items-start gap-1">
                            <span className="text-sm font-medium">
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
                        <div className="flex flex-col items-start gap-1">
                            <span className="text-sm font-medium">
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <GeneralInfoCard
                    icon={ArrowDownCircle}
                    label={t("torrent_modal.stats.downloaded")}
                    value={
                        <span className="font-mono text-sm">
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
                        <span className="font-mono text-sm text-primary">
                            {formatBytes(torrent.uploaded)}
                        </span>
                    }
                    helper={t("torrent_modal.stats.ratio", {
                        ratio: formatRatio(torrent.ratio, 2),
                    })}
                    accent="text-primary"
                />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <GlassPanel className="p-4 space-y-3">
                    <div className="flex items-center gap-tools">
                        <Folder
                            size={16}
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
                    <code className="font-mono text-xs text-foreground/70 bg-content1/20 px-2 py-1 rounded wrap-break-word">
                        {downloadDir}
                    </code>
                </GlassPanel>
                <GlassPanel className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-tools">
                        <div className="flex items-center gap-tools">
                            <Hash
                                size={16}
                                strokeWidth={ICON_STROKE_WIDTH}
                                className="text-foreground/50"
                            />
                            <span className="text-scaled uppercase tracking-[0.3em] text-foreground/40">
                                {t("torrent_modal.labels.info_hash")}
                            </span>
                        </div>
                        <Button
                            isIconOnly
                            size="md"
                            variant="shadow"
                            onPress={handleCopyHash}
                            aria-label={t("table.actions.copy_hash")}
                            className="text-foreground/50 hover:text-foreground"
                        >
                            <Copy
                                size={12}
                                strokeWidth={ICON_STROKE_WIDTH}
                                className="text-current"
                            />
                        </Button>
                    </div>
                    <code className="font-mono text-xs text-foreground/70 bg-content1/20 px-2 py-1 rounded wrap-break-word">
                        {torrent.hash}
                    </code>
                </GlassPanel>
            </div>
        </div>
    );
};
