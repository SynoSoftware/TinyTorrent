import { cn } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@/shared/utils/format";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";

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

    const indicatorClasses = cn(
        "h-full rounded-full",
        isInsufficient
            ? "bg-gradient-to-r from-danger/70 via-warning/70 to-success/70"
            : "bg-gradient-to-r from-success/50 to-success"
    );
    const containerClasses = cn(
        "space-y-tight rounded-xl border bg-content1/15 p-panel",
        {
            "border-danger/40 bg-danger/5": isInsufficient,
            "border-content1/20": !isInsufficient,
        }
    );

    return (
        <div className={containerClasses}>
            <div
                className="flex items-center justify-between font-semibold uppercase text-foreground/60"
                style={{
                    fontSize: "var(--tt-font-size-base)",
                    letterSpacing: "var(--tt-tracking-ultra)",
                }}
            >
                <span>{t("modals.disk_gauge.title")}</span>
                <span
                    style={{ fontSize: "var(--tt-font-size-base)" }}
                    className="font-mono text-foreground/40"
                >
                    {path ?? t("modals.disk_gauge.path_unknown")}
                </span>
            </div>
            <div className="h-sep">
                <SmoothProgressBar
                    value={Math.min(usedPercent + torrentPercent, 100)}
                    trackClassName="h-full bg-content1/20"
                    indicatorClassName={indicatorClasses}
                />
            </div>
            <div
                className="flex justify-between font-mono text-foreground/60"
                style={{ fontSize: "var(--tt-font-size-base)" }}
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
                    style={{ fontSize: "var(--tt-font-size-base)" }}
                    className="text-foreground/50"
                >
                    {t("modals.disk_gauge.updating")}
                </p>
            )}
            {hint && !error && (
                <p
                    style={{ fontSize: "var(--tt-font-size-base)" }}
                    className="text-foreground/50"
                >
                    {hint}
                </p>
            )}
            {error && (
                <div className="flex items-center justify-between gap-tools">
                    <p
                        style={{ fontSize: "var(--tt-font-size-base)" }}
                        className="text-danger"
                    >
                        {error}
                    </p>
                </div>
            )}
        </div>
    );
}
