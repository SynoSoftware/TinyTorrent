import React from "react";
import { Plus, Activity, Timer, Users, X, Check } from "lucide-react";
import { Button, Textarea } from "@heroui/react";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import type { TorrentTrackerEntity } from "@/services/rpc/entities";
import { TEXT_ROLE } from "@/config/textRoles";
import {
    DETAIL_TABLE,
    SURFACE,
    buildAvailabilityDotClass,
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
            <p className={DETAIL_TABLE.emptyText}>
                {viewModel.labels.emptyMessage}
            </p>
        );

        const emptyShell = (
            <GlassPanel className={DETAIL_TABLE.emptyPanel}>
                {emptyContent}
            </GlassPanel>
        );

        return emptyShell;
    }

    const tableBody = (
        <table className={DETAIL_TABLE.table}>
            <thead className={SURFACE.chrome.sticky}>
                <tr className={DETAIL_TABLE.tableHeadRow}>
                    <th className={DETAIL_TABLE.tableHeadCellIcon}>
                        <StatusIcon
                            Icon={Activity}
                            size="sm"
                            className={DETAIL_TABLE.tableHeadIconMuted}
                        />
                    </th>
                    <th className={DETAIL_TABLE.tableHeadCell}>
                        {viewModel.labels.hostnameHeader}
                    </th>
                    <th className={DETAIL_TABLE.tableHeadCell}>
                        {viewModel.labels.nextAnnounceHeader}
                    </th>
                    <th className={DETAIL_TABLE.tableHeadCell}>
                        {viewModel.labels.peersHeader}
                    </th>
                    <th className={DETAIL_TABLE.tableHeadCellStatus}>
                        {viewModel.labels.statusHeader}
                    </th>
                </tr>
            </thead>

            <tbody className={DETAIL_TABLE.tableBody}>
                {viewModel.data.rows.map((row) => (
                    <tr key={row.key} className={DETAIL_TABLE.tableRow}>
                        <td className={DETAIL_TABLE.cellIcon}>
                            <div
                                className={buildAvailabilityDotClass(
                                    row.isOnlineIndicator,
                                )}
                            />
                        </td>

                        <td className={DETAIL_TABLE.cellHost}>
                            {row.hostname}
                        </td>

                        <td className={DETAIL_TABLE.cellAnnounce}>
                            <div className={DETAIL_TABLE.announceRow}>
                                <StatusIcon Icon={Timer} size="sm" />
                                {row.nextAnnounceLabel}
                            </div>
                        </td>

                        <td className={DETAIL_TABLE.cellPeers}>
                            <div className={DETAIL_TABLE.peerRow}>
                                <StatusIcon Icon={Users} size="sm" />
                                {row.peersLabel}
                            </div>
                        </td>

                        <td className={DETAIL_TABLE.cellStatus}>
                            {row.statusTone === "pending" && (
                                <span
                                    className={DETAIL_TABLE.statusTone.pending}
                                >
                                    {row.statusLabel}
                                </span>
                            )}
                            {row.statusTone === "online" && (
                                <span
                                    className={DETAIL_TABLE.statusTone.online}
                                >
                                    {row.statusLabel}
                                </span>
                            )}
                            {row.statusTone === "partial" && (
                                <span
                                    className={DETAIL_TABLE.statusTone.partial}
                                >
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
        <div className={DETAIL_TABLE.root}>
            <div className={DETAIL_TABLE.toolbar}>
                <div className={DETAIL_TABLE.toolbarGroup}>
                    <StatusIcon
                        Icon={Activity}
                        size="md"
                        className={DETAIL_TABLE.toolbarIconPrimary}
                    />
                    <span className={TEXT_ROLE.label}>
                        {viewModel.labels.title}
                    </span>
                </div>

                <div className={DETAIL_TABLE.toolbarGroup}>
                    <ToolbarIconButton
                        Icon={Plus}
                        ariaLabel={viewModel.labels.toggleAddAriaLabel}
                        onPress={viewModel.actions.toggleAdd}
                    />
                </div>
            </div>

            <div className={DETAIL_TABLE.body}>
                {isStandalone ? (
                    <GlassPanel className={DETAIL_TABLE.panel}>
                        <div className={DETAIL_TABLE.scroll}>{tableBody}</div>
                    </GlassPanel>
                ) : (
                    <div className={DETAIL_TABLE.scroll}>{tableBody}</div>
                )}

                {viewModel.state.showAdd && (
                    <GlassPanel layer={1} className={DETAIL_TABLE.overlay}>
                        <div className={DETAIL_TABLE.overlayHeader}>
                            <span className={DETAIL_TABLE.overlayTitle}>
                                {viewModel.labels.addTitle}
                            </span>
                            <ToolbarIconButton
                                Icon={X}
                                onPress={viewModel.actions.closeAdd}
                            />
                        </div>

                        <div className={DETAIL_TABLE.overlayBody}>
                            <Textarea
                                value={viewModel.state.newTrackers}
                                onValueChange={viewModel.actions.setNewTrackers}
                                minRows={6}
                                placeholder={viewModel.labels.addPlaceholder}
                                classNames={DETAIL_TABLE.inputClassNames}
                            />
                        </div>

                        <div className={DETAIL_TABLE.overlayFooter}>
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
