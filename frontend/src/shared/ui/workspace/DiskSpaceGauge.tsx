import { Progress } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "../../utils/format";

export interface DiskSpaceGaugeProps {
    freeBytes?: number;
    totalBytes?: number;
    torrentSize?: number;
    path?: string;
    isLoading?: boolean;
    error?: string | null;
}

export function DiskSpaceGauge({
    freeBytes,
    totalBytes,
    torrentSize,
    path,
    isLoading,
    error,
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
    const freePercent = freeBytes
        ? Math.min((freeBytes / displayTotal) * 100, 100)
        : 0;
    const { t } = useTranslation();

    return (
        <div className="space-y-2 rounded-xl border border-content1/20 bg-content1/15 p-4">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.3em] text-foreground/60">
                <span>{t("modals.disk_gauge.title")}</span>
                <span className="text-[10px] font-mono text-foreground/40">
                    {path ?? t("modals.disk_gauge.path_unknown")}
                </span>
            </div>
            <Progress
                value={Math.min(usedPercent + torrentPercent, 100)}
                size="sm"
                classNames={{
                    track: "h-2 rounded-full bg-content1/20",
                    indicator:
                        "rounded-full bg-gradient-to-r from-danger/70 via-warning/70 to-success/70",
                }}
            />
            <div className="flex justify-between text-[11px] font-mono text-foreground/60">
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
                <p className="text-[10px] text-foreground/50">
                    {t("modals.disk_gauge.updating")}
                </p>
            )}
            {error && <p className="text-[10px] text-danger">{error}</p>}
        </div>
    );
}
