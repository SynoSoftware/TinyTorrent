import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Activity, Timer, Users, X, Check } from "lucide-react";
import { Button, Textarea, cn } from "@heroui/react";

import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { GLASS_PANEL_SURFACE } from "@/shared/ui/layout/glass-surface";
import type { TorrentTrackerEntity } from "@/services/rpc/entities";
import { TEXT_ROLES } from "./textRoles";

interface TrackersTabProps {
    trackers: TorrentTrackerEntity[];
    emptyMessage: string;
    serverTime?: number; // From global state/context
}

/**
 * Format countdown seconds into MM:SS
 */
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
}: TrackersTabProps) => {
    const { t } = useTranslation();
    const [showAdd, setShowAdd] = useState(false);
    const [newTrackers, setNewTrackers] = useState("");

    if (!trackers.length) {
        return (
            <GlassPanel className="flex h-lg items-center justify-center border-default/10 text-center">
                <p className={`${TEXT_ROLES.primary} text-foreground/30`}>
                    {emptyMessage}
                </p>
            </GlassPanel>
        );
    }

    return (
        <div className="flex h-full flex-col gap-panel">
            {/* Workbench Toolbar */}
            <div className="flex items-center justify-between px-tight">
                <div className="flex items-center gap-tools">
                    <Activity size={14} className="text-primary" />
                    <span className="text-label uppercase tracking-tight text-foreground/60">
                        {t("torrent_modal.trackers.title", {
                            defaultValue: "Trackers",
                        })}
                    </span>
                </div>
                <Button
                    isIconOnly
                    size="md"
                    variant="shadow"
                    onPress={() => setShowAdd((v) => !v)}
                    className="hover:bg-primary/10 hover:text-primary"
                >
                    <Plus size={18} />
                </Button>
            </div>

            {/* Cinematic Table */}
            <GlassPanel className="relative min-h-0 flex-1 overflow-hidden border-default/10 ">
                <div className="h-full overflow-auto">
                    <table className="w-full border-separate border-spacing-0 text-left">
                        <thead className="sticky top-0 z-20 bg-background/80 backdrop-blur-md">
                            <tr className="text-label font-bold uppercase tracking-tight text-foreground/40">
                                <th className="border-b border-default/10 py-panel pl-panel pr-tight">
                                    <Activity size={12} />
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
                            {trackers.map((tracker) => {
                                const trackerKey =
                                    tracker.id ??
                                    `${tracker.announce}-${tracker.tier}`;
                                const isOnline = tracker.lastAnnounceSucceeded;

                                let hostname = "Unknown";
                                try {
                                    hostname = new URL(tracker.announce)
                                        .hostname;
                                } catch {
                                    hostname = tracker.announce;
                                }

                                // Calculate countdown based on server heartbeat
                                let nextAnnounceSecs = 0;
                                if (
                                    serverTime &&
                                    tracker.lastAnnounceTime &&
                                    tracker.lastAnnounceTime > 0
                                ) {
                                    const interval = 1800; // Standard announce interval
                                    const elapsed = Math.max(
                                        0,
                                        Math.floor(serverTime / 1000) -
                                            tracker.lastAnnounceTime
                                    );
                                    nextAnnounceSecs = Math.max(
                                        0,
                                        interval - elapsed
                                    );
                                }

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
                                                <Timer size={10} />
                                                {formatCountdown(
                                                    nextAnnounceSecs
                                                )}
                                            </div>
                                        </td>
                                        <td className="border-b border-default/5 px-tight py-panel text-foreground/70">
                                            <div className="flex items-center gap-tools">
                                                <Users
                                                    size={10}
                                                    className="text-foreground/30"
                                                />
                                                {t(
                                                    "torrent_modal.trackers.peer_summary",
                                                    {
                                                        seeded: tracker.seederCount,
                                                        leeching:
                                                            tracker.leecherCount,
                                                    }
                                                )}
                                            </div>
                                        </td>
                                        <td className="border-b border-default/5 py-panel pl-tight pr-panel text-right font-sans text-label font-bold uppercase tracking-tight">
                                            <span
                                                className={
                                                    isOnline
                                                        ? "text-success"
                                                        : "text-warning"
                                                }
                                            >
                                                {isOnline
                                                    ? t(
                                                          "torrent_modal.trackers.status_online",
                                                          {
                                                              defaultValue:
                                                                  "Online",
                                                          }
                                                      )
                                                    : t(
                                                          "torrent_modal.trackers.status_partial",
                                                          {
                                                              defaultValue:
                                                                  "Warning",
                                                          }
                                                      )}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Layer 2 Add Trackers Panel (IDE-style Drawer) */}
                {showAdd && (
                <div
                    className={cn(
                        GLASS_PANEL_SURFACE,
                        "absolute inset-0 z-30 flex flex-col rounded-none bg-background/40 backdrop-blur-xl"
                    )}
                >
                        <div className="flex items-center justify-between border-b border-default/10 px-panel py-panel">
                            <span className="text-scaled font-semibold uppercase tracking-tight text-primary">
                                {t("torrent_modal.trackers.add", {
                                    defaultValue: "Add Trackers",
                                })}
                            </span>
                            <Button
                                isIconOnly
                                size="md"
                                variant="shadow"
                                onPress={() => setShowAdd(false)}
                            >
                                <X size={16} />
                            </Button>
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
                                startContent={<Check size={14} />}
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
            </GlassPanel>
        </div>
    );
};
