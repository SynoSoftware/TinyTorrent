import { useTranslation } from "react-i18next";
import { TEXT_ROLE } from "@/config/textRoles";
import { formatBytes } from "@/shared/utils/format";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { METRIC_CHART } from "@/shared/ui/layout/glass-surface";

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
// TODO: Align with todo.md task 8a (remove check-free-space bridge) and task 10 (Recovery UX spec compliance).

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
    const usedBytes =
        typeof totalBytes === "number" && typeof freeBytes === "number"
            ? Math.max(totalBytes - freeBytes, 0)
            : undefined;
    const displayTotal =
        totalBytes ??
        Math.max(usedBytes ?? 0, freeBytes ?? 0, torrentSize ?? 0, 1);
    const usedPercent = usedBytes
        ? Math.min((usedBytes / displayTotal) * 100, 100)
        : 0;
    const torrentPercent = torrentSize
        ? Math.min((torrentSize / displayTotal) * 100, 100)
        : 0;
    const { t } = useTranslation();

    const indicatorClasses = METRIC_CHART.capacityGauge.builder.indicatorClass(
        Boolean(isInsufficient),
    );
    const containerClasses = METRIC_CHART.capacityGauge.builder.containerClass(
        Boolean(isInsufficient),
    );

    return (
        <div className={containerClasses}>
            <div
                className={METRIC_CHART.capacityGauge.header}
                style={METRIC_CHART.capacityGauge.headerStyle}
            >
                <span>{t("modals.disk_gauge.title")}</span>
                <span
                    style={METRIC_CHART.capacityGauge.baseTextStyle}
                    className={METRIC_CHART.capacityGauge.path}
                >
                    {path ?? t("modals.disk_gauge.path_unknown")}
                </span>
            </div>
            <div className={METRIC_CHART.capacityGauge.progressWrap}>
                <SmoothProgressBar
                    value={Math.min(usedPercent + torrentPercent, 100)}
                    trackClassName={METRIC_CHART.capacityGauge.progressTrack}
                    indicatorClassName={indicatorClasses}
                />
            </div>
            <div
                className={METRIC_CHART.capacityGauge.stats}
                style={METRIC_CHART.capacityGauge.baseTextStyle}
            >
                <span>
                    {t("modals.disk_gauge.used")}{" "}
                    {usedBytes !== undefined ? formatBytes(usedBytes) : "-"}
                </span>
                <span>
                    {t("modals.disk_gauge.torrent")}{" "}
                    {torrentSize ? formatBytes(torrentSize) : "-"}
                </span>
                <span>
                    {t("modals.disk_gauge.free")}{" "}
                    {freeBytes !== undefined ? formatBytes(freeBytes) : "-"}
                </span>
            </div>
            {isLoading && (
                <p
                    style={METRIC_CHART.capacityGauge.baseTextStyle}
                    className={METRIC_CHART.capacityGauge.hint}
                >
                    {t("modals.disk_gauge.updating")}
                </p>
            )}
            {hint && !error && (
                <p
                    style={METRIC_CHART.capacityGauge.baseTextStyle}
                    className={METRIC_CHART.capacityGauge.hint}
                >
                    {hint}
                </p>
            )}
            {error && (
                <div className={METRIC_CHART.capacityGauge.errorRow}>
                    <p
                        style={METRIC_CHART.capacityGauge.baseTextStyle}
                        className={TEXT_ROLE.statusError}
                    >
                        {error}
                    </p>
                </div>
            )}
        </div>
    );
}
