import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Activity, Timer, Users, X, Check } from "lucide-react";
import { Button, Textarea, cn } from "@heroui/react";

import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { GLASS_PANEL_SURFACE } from "@/shared/ui/layout/glass-surface";
import type { TorrentTrackerEntity } from "@/services/rpc/entities";
import { TEXT_ROLES } from "./textRoles";
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

export const TrackersTab = ({
    trackers,
    emptyMessage,
    serverTime,
    isStandalone = false,
}: TrackersTabProps) => {
    const { t } = useTranslation();
    const [showAdd, setShowAdd] = useState(false);
    const [newTrackers, setNewTrackers] = useState("");

    if (!trackers || trackers.length === 0) {
        return isStandalone ? (
            <GlassPanel className="flex h-lg items-center justify-center border-default/10 text-center">
                <p className={`${TEXT_ROLES.primary} text-foreground/30`}>
                    {emptyMessage}
                </p>
            </GlassPanel>
        ) : (
            <div className="flex h-lg items-center justify-center border-default/10 text-center">
                <p className={`${TEXT_ROLES.primary} text-foreground/30`}>
                    {emptyMessage}
                </p>
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
                        {t("torrent_modal.trackers.hostname", {
                            defaultValue: "Host",
                        })}
                    </th>
                    <th className="border-b border-default/10 px-tight py-panel">
                        {t("torrent_modal.trackers.next_announce", {
                            defaultValue: "Next",
                        })}
                    </th>
                    <th className="border-b border-default/10 px-tight py-panel">
                        {t("torrent_modal.trackers.peers_label", {
                            defaultValue: "Peers",
                        })}
                    </th>
                    <th className="border-b border-default/10 py-panel pl-tight pr-panel text-right">
                        {t("torrent_modal.trackers.status", {
                            defaultValue: "Status",
                        })}
                    </th>
                </tr>
            </thead>
            <tbody className="font-mono text-scaled">
                {trackers.map((tracker, i) => {
                    const trackerKeyBase =
                        tracker.id ?? `${tracker.announce}-${tracker.tier}`;
                    const trackerKey = `${String(trackerKeyBase)}-${i}`;
                    const isOnline = tracker.lastAnnounceSucceeded === true;

                    let hostname = t("labels.unknown", {
                        defaultValue: "Unknown",
                    });
                    try {
                        if (tracker.announce) {
                            const u = new URL(tracker.announce);
                            hostname = u.hostname || tracker.announce;
                        } else {
                            hostname = tracker.announce || hostname;
                        }
                    } catch {
                        hostname = tracker.announce || hostname;
                    }

                    let nextAnnounceSecs = 0;
                    if (
                        typeof tracker.lastAnnounceTime === "number" &&
                        tracker.lastAnnounceTime > 0
                    ) {
                        const nowMs = serverTime ?? Date.now();
                        const interval = 1800;
                        const elapsed = Math.max(
                            0,
                            Math.floor(nowMs / 1000) - tracker.lastAnnounceTime
                        );
                        nextAnnounceSecs = Math.max(0, interval - elapsed);
                    }

                    const unknownLabel = t("labels.unknown", {
                        defaultValue: "-",
                    });
                    const seededLabel =
                        typeof tracker.seederCount === "number" &&
                        tracker.seederCount >= 0
                            ? String(tracker.seederCount)
                            : unknownLabel;
                    const leechLabel =
                        typeof tracker.leecherCount === "number" &&
                        tracker.leecherCount >= 0
                            ? String(tracker.leecherCount)
                            : unknownLabel;

                    const hasAttempt =
                        typeof tracker.lastAnnounceTime === "number" &&
                        tracker.lastAnnounceTime > 0;
                    const lastSucceeded =
                        tracker.lastAnnounceSucceeded === true;

                    return (
                        <tr
                            key={trackerKey}
                            className="group transition-colors hover:bg-primary/5"
                        >
                            <td className="border-b border-default/5 py-panel pl-panel pr-tight">
                                <div
                                    className={`size-dot rounded-full shadow-dot ${
                                        isOnline
                                            ? "bg-success shadow-success/50"
                                            : "bg-warning shadow-warning/50"
                                    }`}
                                />
                            </td>
                            <td className="max-w-tracker-name truncate border-b border-default/5 px-tight py-panel font-sans font-medium text-foreground/80">
                                {hostname}
                            </td>
                            <td className="border-b border-default/5 px-tight py-panel tabular-nums text-foreground/50">
                                <div className="flex items-center gap-tight">
                                    <StatusIcon
                                        Icon={Timer}
                                        size="sm"
                                        className="text-foreground/50"
                                    />
                                    {formatCountdown(nextAnnounceSecs)}
                                </div>
                            </td>
                            <td className="border-b border-default/5 px-tight py-panel text-foreground/70">
                                <div className="flex items-center gap-tools">
                                    <StatusIcon
                                        Icon={Users}
                                        size="sm"
                                        className="text-foreground/30"
                                    />
                                    <span>
                                        {seededLabel} seeded / {leechLabel}{" "}
                                        leeching
                                    </span>
                                </div>
                            </td>
                            <td className="border-b border-default/5 py-panel pl-tight pr-panel text-right font-sans text-label font-bold uppercase tracking-tight">
                                {(() => {
                                    if (!hasAttempt)
                                        return (
                                            <span className="text-foreground/50">
                                                {t(
                                                    "torrent_modal.trackers.status_pending",
                                                    { defaultValue: "Pending" }
                                                )}
                                            </span>
                                        );
                                    if (lastSucceeded)
                                        return (
                                            <span className="text-success">
                                                {t(
                                                    "torrent_modal.trackers.status_online",
                                                    { defaultValue: "Online" }
                                                )}
                                            </span>
                                        );
                                    return (
                                        <span className="text-warning">
                                            {t(
                                                "torrent_modal.trackers.status_partial",
                                                { defaultValue: "Warning" }
                                            )}
                                        </span>
                                    );
                                })()}
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
                        {t("torrent_modal.trackers.title", {
                            defaultValue: "Trackers",
                        })}
                    </span>
                </div>
                <ToolbarIconButton
                    Icon={Plus}
                    ariaLabel={t("torrent_modal.trackers.toggle_add")}
                    onPress={() => setShowAdd((v) => !v)}
                    iconSize="md"
                    className="text-primary hover:text-primary/80"
                />
            </div>

            <div className="relative min-h-0 flex-1">
                {isStandalone ? (
                    <GlassPanel className="min-h-0 flex-1 overflow-hidden border-default/10 ">
                        <div className="h-full overflow-auto">{TableBody}</div>
                    </GlassPanel>
                ) : (
                    <div className="min-h-0 flex-1 overflow-hidden border-default/10 ">
                        <div className="h-full overflow-auto">{TableBody}</div>
                    </div>
                )}

                {showAdd && (
                    <div
                        className={cn(
                            GLASS_PANEL_SURFACE,
                            "absolute inset-0 z-overlay flex flex-col rounded-none bg-background/40 backdrop-blur-xl"
                        )}
                    >
                        <div className="flex items-center justify-between border-b border-default/10 px-panel py-panel">
                            <span className="text-scaled font-semibold uppercase tracking-tight text-primary">
                                {t("torrent_modal.trackers.add", {
                                    defaultValue: "Add Trackers",
                                })}
                            </span>
                            <ToolbarIconButton
                                Icon={X}
                                ariaLabel={t("torrent_modal.trackers.close")}
                                onPress={() => setShowAdd(false)}
                                iconSize="md"
                                className="text-foreground/50 hover:text-foreground"
                            />
                        </div>
                        <div className="flex-1 p-panel">
                            <Textarea
                                variant="bordered"
                                placeholder={t(
                                    "torrent_modal.trackers.add_placeholder",
                                    {
                                        defaultValue:
                                            "Paste announce URLs (one per line)...",
                                    }
                                )}
                                value={newTrackers}
                                onValueChange={setNewTrackers}
                                classNames={{
                                    input: "font-mono text-scaled",
                                    inputWrapper:
                                        "border-default/20 bg-background/40",
                                }}
                                minRows={6}
                            />
                        </div>
                        <div className="flex justify-end gap-tools border-t border-default/10 p-panel bg-background/20">
                            <Button
                                size="md"
                                variant="shadow"
                                onPress={() => setShowAdd(false)}
                            >
                                {t("common.cancel", { defaultValue: "Cancel" })}
                            </Button>
                            <Button
                                size="md"
                                color="primary"
                                startContent={
                                    <StatusIcon
                                        Icon={Check}
                                        size="sm"
                                        className="text-current"
                                    />
                                }
                                onPress={() => {
                                    /* Logic here */ setShowAdd(false);
                                }}
                            >
                                {t("common.add", {
                                    defaultValue: "Add Trackers",
                                })}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
