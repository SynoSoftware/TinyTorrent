import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Plus,
    Activity,
    Timer,
    Users,
    X,
    Check,
    RefreshCw,
} from "lucide-react";
import { Button, Textarea, Spinner, cn } from "@heroui/react";

import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { GLASS_PANEL_SURFACE } from "@/shared/ui/layout/glass-surface";
import type { TorrentTrackerEntity } from "@/services/rpc/entities";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import { TEXT_ROLES } from "../hooks/utils/textRoles";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";

interface TrackersTabProps {
    trackers: TorrentTrackerEntity[];
    emptyMessage: string;
    serverTime?: number;
    isStandalone?: boolean;
}


const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
};

export const TrackersTab: React.FC<TrackersTabProps> = ({
    trackers,
    emptyMessage,
    serverTime,
    isStandalone = false,
}) => {
    const { t } = useTranslation();

    const [showAdd, setShowAdd] = useState(false);
    const [newTrackers, setNewTrackers] = useState("");
    // reannounce action removed from UI-level props; recovery flow handles this

    if (!trackers || trackers.length === 0) {
        const Empty = (
            <p className={`${TEXT_ROLES.primary} text-foreground/30`}>
                {emptyMessage}
            </p>
        );

        return isStandalone ? (
            <GlassPanel className="flex h-lg items-center justify-center border-default/10 text-center">
                {Empty}
            </GlassPanel>
        ) : (
            <div className="flex h-lg items-center justify-center border-default/10 text-center">
                {Empty}
            </div>
        );
    }

    const TableBody = (
        <table className="w-full border-separate border-spacing-0 text-left">
            <thead className="sticky top-0 z-sticky bg-background/80 backdrop-blur-md">
                <tr className="text-label font-bold uppercase tracking-tight text-foreground/40">
                    <th className="border-b border-default/10 py-panel pl-panel pr-tight">
                        <StatusIcon
                            Icon={Activity}
                            size="sm"
                            className="text-foreground/50"
                        />
                    </th>
                    <th className="border-b border-default/10 px-tight py-panel">
                        {t("torrent_modal.trackers.hostname")}
                    </th>
                    <th className="border-b border-default/10 px-tight py-panel">
                        {t("torrent_modal.trackers.next_announce")}
                    </th>
                    <th className="border-b border-default/10 px-tight py-panel">
                        {t("torrent_modal.trackers.peers_label")}
                    </th>
                    <th className="border-b border-default/10 py-panel pl-tight pr-panel text-right">
                        {t("torrent_modal.trackers.status")}
                    </th>
                </tr>
            </thead>

            <tbody className="font-mono text-scaled">
                {trackers.map((tracker, i) => {
                    const keyBase =
                        tracker.id ?? `${tracker.announce}-${tracker.tier}`;
                    const key = `${keyBase}-${i}`;
                    const isOnline = tracker.lastAnnounceSucceeded === true;

                    let hostname = t("labels.unknown");
                    try {
                        if (tracker.announce) {
                            hostname = new URL(tracker.announce).hostname;
                        }
                    } catch {
                        hostname = tracker.announce || hostname;
                    }

                    let nextAnnounceSecs = 0;
                    if (tracker.lastAnnounceTime) {
                        const now = serverTime ?? Date.now();
                        const elapsed =
                            Math.floor(now / 1000) - tracker.lastAnnounceTime;
                        nextAnnounceSecs = Math.max(0, 1800 - elapsed);
                    }

                    const unknown = t("labels.unknown");
                    const seeders =
                        tracker.seederCount != null
                            ? String(tracker.seederCount)
                            : unknown;
                    const leechers =
                        tracker.leecherCount != null
                            ? String(tracker.leecherCount)
                            : unknown;

                    const hasAttempt = tracker.lastAnnounceTime != null;
                    const lastSucceeded =
                        tracker.lastAnnounceSucceeded === true;

                    return (
                        <tr key={key} className="group hover:bg-primary/5">
                            <td className="border-b border-default/5 py-panel pl-panel pr-tight">
                                <div
                                    className={cn(
                                        "size-dot rounded-full shadow-dot",
                                        isOnline
                                            ? "bg-success shadow-success/50"
                                            : "bg-warning shadow-warning/50"
                                    )}
                                />
                            </td>

                            <td className="truncate border-b border-default/5 px-tight py-panel font-sans font-medium text-foreground/80">
                                {hostname}
                            </td>

                            <td className="border-b border-default/5 px-tight py-panel text-foreground/50 tabular-nums">
                                <div className="flex items-center gap-tight">
                                    <StatusIcon Icon={Timer} size="sm" />
                                    {formatCountdown(nextAnnounceSecs)}
                                </div>
                            </td>

                            <td className="border-b border-default/5 px-tight py-panel text-foreground/70">
                                <div className="flex items-center gap-tools">
                                    <StatusIcon Icon={Users} size="sm" />
                                    {seeders} / {leechers}
                                </div>
                            </td>

                            <td className="border-b border-default/5 py-panel pl-tight pr-panel text-right font-bold uppercase">
                                {!hasAttempt && (
                                    <span className="text-foreground/50">
                                        {t(
                                            "torrent_modal.trackers.status_pending"
                                        )}
                                    </span>
                                )}
                                {hasAttempt && lastSucceeded && (
                                    <span className="text-success">
                                        {t(
                                            "torrent_modal.trackers.status_online"
                                        )}
                                    </span>
                                )}
                                {hasAttempt && !lastSucceeded && (
                                    <span className="text-warning">
                                        {t(
                                            "torrent_modal.trackers.status_partial"
                                        )}
                                    </span>
                                )}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );

    return (
        <div className="flex h-full flex-col gap-panel">
            <div className="sticky top-0 z-sticky flex items-center justify-between px-tight">
                <div className="flex items-center gap-tools">
                    <StatusIcon
                        Icon={Activity}
                        size="md"
                        className="text-primary"
                    />
                    <span className="text-label uppercase tracking-tight text-foreground/60">
                        {t("torrent_modal.trackers.title")}
                    </span>
                </div>

                <div className="flex items-center gap-tools">
                    <ToolbarIconButton
                        Icon={Plus}
                        ariaLabel={t("torrent_modal.trackers.toggle_add")}
                        onPress={() => setShowAdd((v) => !v)}
                    />

                    {/* reannounce action removed from UI-level; handled by recovery controller */}
                </div>
            </div>

            <div className="relative min-h-0 flex-1">
                {isStandalone ? (
                    <GlassPanel className="min-h-0 flex-1 overflow-hidden">
                        <div className="h-full overflow-auto">{TableBody}</div>
                    </GlassPanel>
                ) : (
                    <div className="h-full overflow-auto">{TableBody}</div>
                )}

                {showAdd && (
                    <div
                        className={cn(
                            GLASS_PANEL_SURFACE,
                            "absolute inset-0 z-overlay flex flex-col bg-background/40 backdrop-blur-xl"
                        )}
                    >
                        <div className="flex items-center justify-between border-b border-default/10 px-panel py-panel">
                            <span className="font-semibold uppercase text-primary">
                                {t("torrent_modal.trackers.add")}
                            </span>
                            <ToolbarIconButton
                                Icon={X}
                                onPress={() => setShowAdd(false)}
                            />
                        </div>

                        <div className="flex-1 p-panel">
                            <Textarea
                                value={newTrackers}
                                onValueChange={setNewTrackers}
                                minRows={6}
                                placeholder={t(
                                    "torrent_modal.trackers.add_placeholder"
                                )}
                                classNames={{
                                    input: "font-mono",
                                    inputWrapper: "bg-background/40",
                                }}
                            />
                        </div>

                        <div className="flex justify-end gap-tools border-t border-default/10 p-panel">
                            <Button
                                variant="shadow"
                                onPress={() => setShowAdd(false)}
                            >
                                {t("common.cancel")}
                            </Button>
                            <Button
                                color="primary"
                                startContent={<Check />}
                                onPress={() => setShowAdd(false)}
                            >
                                {t("common.add")}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TrackersTab;
