import React from "react";
import { Plus, Activity, Timer, Users, X, Check } from "lucide-react";
import { Button, Textarea } from "@heroui/react";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import type { TorrentTrackerEntity } from "@/services/rpc/entities";
import { TEXT_ROLE } from "@/config/textRoles";
import {
    STICKY_HEADER,
    TRACKER_TABLE_CLASS,
    buildTrackerAvailabilityDotClass,
} from "@/shared/ui/layout/glass-surface";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { useTorrentDetailsTrackersViewModel } from "@/modules/dashboard/hooks/useTorrentDetailsTrackersViewModel";

interface TrackersTabProps {
    trackers: TorrentTrackerEntity[];
    emptyMessage: string;
    serverTime?: number;
    isStandalone?: boolean;
}

export const TrackersTab: React.FC<TrackersTabProps> = ({
    trackers,
    emptyMessage,
    serverTime,
    isStandalone = false,
}) => {
    const viewModel = useTorrentDetailsTrackersViewModel({
        trackers,
        emptyMessage,
        serverTime,
    });

    if (viewModel.state.isEmpty) {
        const emptyContent = (
            <p className={TRACKER_TABLE_CLASS.emptyText}>
                {viewModel.labels.emptyMessage}
            </p>
        );

        const emptyShell = (
            <GlassPanel className={TRACKER_TABLE_CLASS.emptyPanel}>
                {emptyContent}
            </GlassPanel>
        );

        return emptyShell;
    }

    const tableBody = (
        <table className={TRACKER_TABLE_CLASS.table}>
            <thead className={STICKY_HEADER}>
                <tr className={TRACKER_TABLE_CLASS.tableHeadRow}>
                    <th className={TRACKER_TABLE_CLASS.tableHeadCellIcon}>
                        <StatusIcon
                            Icon={Activity}
                            size="sm"
                            className="text-foreground/50"
                        />
                    </th>
                    <th className={TRACKER_TABLE_CLASS.tableHeadCell}>
                        {viewModel.labels.hostnameHeader}
                    </th>
                    <th className={TRACKER_TABLE_CLASS.tableHeadCell}>
                        {viewModel.labels.nextAnnounceHeader}
                    </th>
                    <th className={TRACKER_TABLE_CLASS.tableHeadCell}>
                        {viewModel.labels.peersHeader}
                    </th>
                    <th className={TRACKER_TABLE_CLASS.tableHeadCellStatus}>
                        {viewModel.labels.statusHeader}
                    </th>
                </tr>
            </thead>

            <tbody className={TRACKER_TABLE_CLASS.tableBody}>
                {viewModel.data.rows.map((row) => (
                    <tr key={row.key} className={TRACKER_TABLE_CLASS.tableRow}>
                        <td className={TRACKER_TABLE_CLASS.cellIcon}>
                            <div
                                className={buildTrackerAvailabilityDotClass(
                                    row.isOnlineIndicator,
                                )}
                            />
                        </td>

                        <td className={TRACKER_TABLE_CLASS.cellHost}>
                            {row.hostname}
                        </td>

                        <td className={TRACKER_TABLE_CLASS.cellAnnounce}>
                            <div className={TRACKER_TABLE_CLASS.announceRow}>
                                <StatusIcon Icon={Timer} size="sm" />
                                {row.nextAnnounceLabel}
                            </div>
                        </td>

                        <td className={TRACKER_TABLE_CLASS.cellPeers}>
                            <div className={TRACKER_TABLE_CLASS.peerRow}>
                                <StatusIcon Icon={Users} size="sm" />
                                {row.peersLabel}
                            </div>
                        </td>

                        <td className={TRACKER_TABLE_CLASS.cellStatus}>
                            {row.statusTone === "pending" && (
                                <span className={TRACKER_TABLE_CLASS.statusTone.pending}>
                                    {row.statusLabel}
                                </span>
                            )}
                            {row.statusTone === "online" && (
                                <span className={TRACKER_TABLE_CLASS.statusTone.online}>
                                    {row.statusLabel}
                                </span>
                            )}
                            {row.statusTone === "partial" && (
                                <span className={TRACKER_TABLE_CLASS.statusTone.partial}>
                                    {row.statusLabel}
                                </span>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    return (
        <div className={TRACKER_TABLE_CLASS.root}>
            <div className={TRACKER_TABLE_CLASS.toolbar}>
                <div className={TRACKER_TABLE_CLASS.toolbarGroup}>
                    <StatusIcon
                        Icon={Activity}
                        size="md"
                        className="text-primary"
                    />
                    <span className={TEXT_ROLE.label}>
                        {viewModel.labels.title}
                    </span>
                </div>

                <div className={TRACKER_TABLE_CLASS.toolbarGroup}>
                    <ToolbarIconButton
                        Icon={Plus}
                        ariaLabel={viewModel.labels.toggleAddAriaLabel}
                        onPress={viewModel.actions.toggleAdd}
                    />
                </div>
            </div>

            <div className={TRACKER_TABLE_CLASS.body}>
                {isStandalone ? (
                    <GlassPanel className={TRACKER_TABLE_CLASS.panel}>
                        <div className={TRACKER_TABLE_CLASS.scroll}>{tableBody}</div>
                    </GlassPanel>
                ) : (
                    <div className={TRACKER_TABLE_CLASS.scroll}>{tableBody}</div>
                )}

                {viewModel.state.showAdd && (
                    <GlassPanel
                        layer={1}
                        className={TRACKER_TABLE_CLASS.overlay}
                    >
                        <div className={TRACKER_TABLE_CLASS.overlayHeader}>
                            <span className={TRACKER_TABLE_CLASS.overlayTitle}>
                                {viewModel.labels.addTitle}
                            </span>
                            <ToolbarIconButton
                                Icon={X}
                                onPress={viewModel.actions.closeAdd}
                            />
                        </div>

                        <div className={TRACKER_TABLE_CLASS.overlayBody}>
                            <Textarea
                                value={viewModel.state.newTrackers}
                                onValueChange={viewModel.actions.setNewTrackers}
                                minRows={6}
                                placeholder={viewModel.labels.addPlaceholder}
                                classNames={TRACKER_TABLE_CLASS.inputClassNames}
                            />
                        </div>

                        <div className={TRACKER_TABLE_CLASS.overlayFooter}>
                            <Button
                                variant="shadow"
                                onPress={viewModel.actions.closeAdd}
                            >
                                {viewModel.labels.cancelLabel}
                            </Button>
                            <Button
                                color="primary"
                                startContent={<Check />}
                                onPress={viewModel.actions.submitAdd}
                            >
                                {viewModel.labels.addLabel}
                            </Button>
                        </div>
                    </GlassPanel>
                )}
            </div>
        </div>
    );
};

export default TrackersTab;
