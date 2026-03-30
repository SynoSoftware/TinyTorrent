import { useTranslation } from "react-i18next";
import { registry } from "@/config/logic";
import { formatBytes } from "@/shared/utils/format";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { metricChart } from "@/shared/ui/layout/glass-surface";
const { visuals } = registry;

export interface DiskSpaceGaugeProps {
    freeBytes?: number;
    totalBytes?: number;
    torrentSize?: number;
    path?: string;
    isLoading?: boolean;
    error?: string | null;
    hint?: string | null;
    isInsufficient?: boolean;
}

// TODO: Clarify disk-space semantics for maintainers:
// TODO: - `freeBytes/totalBytes` must come from Transmission RPC `free-space` (daemon-side disk).
// TODO: - For remote connections, this reports *remote* disk space; UI copy must reflect that (no “your disk” language).
// TODO: - Do not probe local disk via ShellExtensions for this gauge; that would break the “daemon is king” architecture and confuse users in remote/browser mode.
// TODO: Align with todo.md task 8a (remove check-free-space bridge).

export function DiskSpaceGauge({
    freeBytes,
    totalBytes,
    torrentSize,
    path,
    isLoading,
    error,
    hint,
    isInsufficient,
}: DiskSpaceGaugeProps) {
    const { t } = useTranslation();

    const hasValidTotal = typeof totalBytes === "number" && Number.isFinite(totalBytes) && totalBytes > 0;
    const hasValidFree = typeof freeBytes === "number" && Number.isFinite(freeBytes) && freeBytes >= 0;
    const safeTotal = hasValidTotal ? totalBytes : undefined;

    const usedBytes = safeTotal !== undefined && hasValidFree ? Math.max(safeTotal - freeBytes, 0) : undefined;
    const usedPercent =
        usedBytes !== undefined && safeTotal !== undefined ? Math.min((usedBytes / safeTotal) * 100, 100) : 0;
    const gaugeValue = hasValidTotal && usedBytes !== undefined ? usedPercent : 0;

    const statusMessage = error ? error : isLoading ? t("modals.disk_gauge.updating") : hint;

    const indicatorClasses = isInsufficient
        ? metricChart.capacityGauge.indicatorInsufficient
        : metricChart.capacityGauge.indicatorNormal;
    const containerClasses = isInsufficient
        ? metricChart.capacityGauge.containerInsufficient
        : metricChart.capacityGauge.containerNormal;

    return (
        <div className={containerClasses}>
            <div className={metricChart.capacityGauge.header} style={metricChart.capacityGauge.headerStyle}>
                <span>{t("modals.disk_gauge.title")}</span>
                <span
                    style={metricChart.capacityGauge.baseTextStyle}
                    className={`${metricChart.capacityGauge.path} min-w-0 flex-1 text-right truncate`}
                >
                    {path ?? t("modals.disk_gauge.path_unknown")}
                </span>
            </div>
            <div className={metricChart.capacityGauge.progressWrap}>
                <SmoothProgressBar
                    value={gaugeValue}
                    trackClassName={metricChart.capacityGauge.progressTrack}
                    indicatorClassName={indicatorClasses}
                />
            </div>
            <div className={metricChart.capacityGauge.stats} style={metricChart.capacityGauge.baseTextStyle}>
                <span>
                    {t("modals.disk_gauge.used")} {usedBytes !== undefined ? formatBytes(usedBytes) : "-"}
                </span>
                <span>
                    {t("modals.disk_gauge.torrent")}{" "}
                    {typeof torrentSize === "number" ? formatBytes(Math.max(torrentSize, 0)) : "-"}
                </span>
                <span>
                    {t("modals.disk_gauge.free")} {freeBytes !== undefined ? formatBytes(freeBytes) : "-"}
                </span>
            </div>
            <div className={metricChart.capacityGauge.errorRow}>
                <p
                    style={metricChart.capacityGauge.baseTextStyle}
                    className={error ? visuals.typography.text.statusError : metricChart.capacityGauge.hint}
                    aria-live={error ? "assertive" : "polite"}
                >
                    {statusMessage ?? "\u00A0"}
                </p>
            </div>
        </div>
    );
}
