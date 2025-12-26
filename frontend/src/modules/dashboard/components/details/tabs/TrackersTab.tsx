import { useTranslation } from "react-i18next";

import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import type { TorrentTrackerEntity } from "@/services/rpc/entities";

interface TrackersTabProps {
    trackers: TorrentTrackerEntity[];
    emptyMessage: string;
}

export const TrackersTab = ({ trackers, emptyMessage }: TrackersTabProps) => {
    const { t } = useTranslation();

    if (!trackers.length) {
        return (
            <GlassPanel className="p-4 text-xs uppercase tracking-[0.35em] text-foreground/50">
                {emptyMessage}
            </GlassPanel>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {trackers.map((tracker) => {
                const trackerKey =
                    tracker.id ?? `${tracker.announce}-${tracker.tier}`;
                const statusLabel = tracker.lastAnnounceSucceeded
                    ? t("torrent_modal.trackers.status_online")
                    : t("torrent_modal.trackers.status_partial");

                return (
                    <GlassPanel
                        key={trackerKey}
                        className="space-y-3 p-4 border border-default/15"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                                <span
                                    className={`h-2.5 w-2.5 rounded-full shadow ${
                                        tracker.lastAnnounceSucceeded
                                            ? "bg-success"
                                            : "bg-warning"
                                    }`}
                                />
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground truncate">
                                        {tracker.announce}
                                    </p>
                                    <p className="text-xs uppercase tracking-[0.35em] text-foreground/60">
                                        {t("torrent_modal.trackers.tier")}{" "}
                                        {tracker.tier}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-foreground/60">
                                    {t("torrent_modal.trackers.peers_label")}
                                </p>
                                <p className="font-mono text-xs text-foreground/70">
                                    {t("torrent_modal.trackers.peer_summary", {
                                        seeded: tracker.seederCount,
                                        leeching: tracker.leecherCount,
                                    })}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-foreground/60">
                            <span className="truncate">
                                {tracker.lastAnnounceResult || "-"}
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-[0.35em] text-foreground/80">
                                {statusLabel}
                            </span>
                        </div>
                    </GlassPanel>
                );
            })}
        </div>
    );
};
