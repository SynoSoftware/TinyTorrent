import { Button, Switch } from "@heroui/react";
import { ArrowDownCircle, ArrowUpCircle, Copy, Folder, Hash } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TorrentDetail } from "../../../types/torrent";
import { formatBytes } from "../../../../../shared/utils/format";
import { GlassPanel } from "../../../../../shared/ui/layout/GlassPanel";
import { SmoothProgressBar } from "../../../../../shared/ui/components/SmoothProgressBar";
import { ICON_STROKE_WIDTH } from "../../../../../config/logic";

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
    isPinned: boolean;
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-content1/20 bg-content1/30">
                <Icon
                    size={18}
                    strokeWidth={ICON_STROKE_WIDTH}
                    className={accent ?? "text-foreground/70"}
                />
            </div>
            <div className="flex-1">
                <div className="text-[10px] uppercase tracking-[0.3em] text-foreground/40">
                    {label}
                </div>
                <div className="text-lg font-semibold text-foreground">{value}</div>
                <div className="text-[11px] text-foreground/50">{helper}</div>
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
    activePeers,
    isPinned,
}: GeneralTabProps) => {
    const { t } = useTranslation();
    const handleCopyHash = () => navigator.clipboard.writeText(torrent.hash);

    return (
        <div className="space-y-6">
            {isPinned && (
                <GlassPanel className="space-y-4 border border-content1/20 bg-content1/30 p-4">
                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <div className="text-[10px] uppercase tracking-[0.3em] text-foreground/40 font-bold mb-1">
                                {t("torrent_modal.stats.total_progress")}
                            </div>
                            <div className="text-4xl font-mono font-medium tracking-tight">
                                {progressPercent.toFixed(1)}%
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] uppercase tracking-[0.3em] text-foreground/40 font-bold">
                                {t("torrent_modal.stats.time_remaining")}
                            </div>
                            <div className="font-mono text-xl">{timeRemainingLabel}</div>
                        </div>
                    </div>
                    <div className="h-3">
                        <SmoothProgressBar
                            value={progressPercent}
                            trackClassName="h-full bg-content1/20"
                            indicatorClassName="h-full bg-gradient-to-r from-success/50 to-success"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-[9px] uppercase tracking-[0.3em] font-bold text-foreground/40">
                            <span>{t("torrent_modal.stats.availability")}</span>
                            <span className="text-primary">
                                {activePeers} {t("torrent_modal.stats.active")}
                            </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-content1/20 overflow-hidden flex">
                            <div className="h-full w-full bg-primary opacity-80" />
                        </div>
                    </div>
                    <div className="space-y-2 border-t border-content1/10 pt-2">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Hash
                                    size={16}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                    className="text-foreground/60"
                                />
                                <span className="text-[10px] uppercase tracking-[0.3em] text-foreground/40">
                                    {t("torrent_modal.general.hash")}
                                </span>
                            </div>
                            <Button
                                isIconOnly
                                size="sm"
                                variant="flat"
                                color="primary"
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
                        <code className="block font-mono text-xs text-foreground/70 rounded bg-content1/20 px-2 py-1 break-words">
                            {torrent.hash}
                        </code>
                    </div>
                </GlassPanel>
            )}
            <GlassPanel className="p-4 space-y-4 bg-content1/30 border border-content1/20">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-foreground/40">
                            {t("torrent_modal.controls.title")}
                        </span>
                        <p className="text-[11px] text-foreground/50">
                            {t("torrent_modal.controls.description")}
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant="flat"
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
                        size="sm"
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
                            <span className="text-[11px] text-foreground/50">
                                {t("torrent_modal.controls.sequential_helper")}
                            </span>
                            {!sequentialSupported && (
                                <span className="text-[10px] text-warning">
                                    {t("torrent_modal.controls.not_supported")}
                                </span>
                            )}
                        </div>
                    </Switch>
                    <Switch
                        size="sm"
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
                            <span className="text-[11px] text-foreground/50">
                                {t("torrent_modal.controls.super_seeding_helper")}
                            </span>
                            {!superSeedingSupported && (
                                <span className="text-[10px] text-warning">
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
                        ratio: torrent.ratio.toFixed(2),
                    })}
                    accent="text-primary"
                />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <GlassPanel className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <Folder
                            size={16}
                            strokeWidth={ICON_STROKE_WIDTH}
                            className="text-foreground/50"
                        />
                        <span className="text-[10px] uppercase tracking-[0.3em] text-foreground/40">
                            {t("torrent_modal.labels.save_path")}
                        </span>
                    </div>
                    <code className="font-mono text-xs text-foreground/70 bg-content1/20 px-2 py-1 rounded break-words">
                        {downloadDir}
                    </code>
                </GlassPanel>
                {!isPinned && (
                    <GlassPanel className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Hash
                                    size={16}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                    className="text-foreground/50"
                                />
                                <span className="text-[10px] uppercase tracking-[0.3em] text-foreground/40">
                                    {t("torrent_modal.labels.info_hash")}
                                </span>
                            </div>
                            <Button
                                isIconOnly
                                size="sm"
                                variant="flat"
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
                        <code className="font-mono text-xs text-foreground/70 bg-content1/20 px-2 py-1 rounded break-words">
                            {torrent.hash}
                        </code>
                    </GlassPanel>
                )}
            </div>
        </div>
    );
};
