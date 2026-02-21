import React from "react";
import { Plus, Activity, Timer, Users, X, Check } from "lucide-react";
import { Button, Textarea } from "@heroui/react";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import type { TorrentTrackerEntity } from "@/services/rpc/entities";
import { TEXT_ROLE } from "@/config/textRoles";
import {
    DETAILS,
    SURFACE,
} from "@/shared/ui/layout/glass-surface";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { useTorrentDetailsTrackersViewModel } from "@/modules/dashboard/hooks";

interface TrackersTabProps {
    torrentId: string | number;
    torrentIds?: Array<string | number>;
    trackers: TorrentTrackerEntity[];
    emptyMessage: string;
    serverTime?: number;
    isStandalone?: boolean;
}

export const TrackersTab: React.FC<TrackersTabProps> = ({
    torrentId,
    torrentIds,
    trackers,
    emptyMessage,
    serverTime,
    isStandalone = false,
}) => {
    const viewModel = useTorrentDetailsTrackersViewModel({
        torrentId,
        torrentIds,
        trackers,
        emptyMessage,
        serverTime,
    });

    if (viewModel.state.isEmpty) {
        const emptyContent = (
            <p className={DETAILS.table.emptyText}>
                {viewModel.labels.emptyMessage}
            </p>
        );

        const emptyShell = (
            <GlassPanel className={DETAILS.table.emptyPanel}>
                {emptyContent}
            </GlassPanel>
        );

        return emptyShell;
    }

    const tableBody = (
        <table className={DETAILS.table.table}>
            <thead className={SURFACE.chrome.sticky}>
                <tr className={DETAILS.table.tableHeadRow}>
                    <th className={DETAILS.table.tableHeadCellIcon}>
                        <StatusIcon
                            Icon={Activity}
                            size="sm"
                            className={DETAILS.table.tableHeadIconMuted}
                        />
                    </th>
                    <th className={DETAILS.table.tableHeadCell}>
                        {viewModel.labels.hostnameHeader}
                    </th>
                    <th className={DETAILS.table.tableHeadCell}>
                        {viewModel.labels.nextAnnounceHeader}
                    </th>
                    <th className={DETAILS.table.tableHeadCell}>
                        {viewModel.labels.peersHeader}
                    </th>
                    <th className={DETAILS.table.tableHeadCellStatus}>
                        {viewModel.labels.statusHeader}
                    </th>
                    <th className={DETAILS.table.tableHeadCellIcon} />
                </tr>
            </thead>

            <tbody className={DETAILS.table.tableBody}>
                {viewModel.data.rows.map((row) => (
                    <tr key={row.key} className={DETAILS.table.tableRow}>
                        <td className={DETAILS.table.cellIcon}>
                            <div
                                className={DETAILS.table.builder.availabilityDotClass(
                                    row.isOnlineIndicator,
                                )}
                            />
                        </td>

                        <td className={DETAILS.table.cellHost}>
                            {row.hostname}
                        </td>

                        <td className={DETAILS.table.cellAnnounce}>
                            <div className={DETAILS.table.announceRow}>
                                <StatusIcon Icon={Timer} size="sm" />
                                {row.nextAnnounceLabel}
                            </div>
                        </td>

                        <td className={DETAILS.table.cellPeers}>
                            <div className={DETAILS.table.peerRow}>
                                <StatusIcon Icon={Users} size="sm" />
                                {row.peersLabel}
                            </div>
                        </td>

                        <td className={DETAILS.table.cellStatus}>
                            {row.statusTone === "pending" && (
                                <span
                                    className={DETAILS.table.statusTone.pending}
                                >
                                    {row.statusLabel}
                                </span>
                            )}
                            {row.statusTone === "online" && (
                                <span
                                    className={DETAILS.table.statusTone.online}
                                >
                                    {row.statusLabel}
                                </span>
                            )}
                            {row.statusTone === "partial" && (
                                <span
                                    className={DETAILS.table.statusTone.partial}
                                >
                                    {row.statusLabel}
                                </span>
                            )}
                        </td>
                        <td className={DETAILS.table.cellIcon}>
                            <ToolbarIconButton
                                Icon={X}
                                ariaLabel={viewModel.labels.removeLabel}
                                onPress={() => viewModel.actions.removeTracker(row)}
                                isDisabled={
                                    viewModel.state.isMutating ||
                                    row.trackerId == null ||
                                    row.trackerId < 0
                                }
                            />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    return (
        <div className={DETAILS.table.root}>
            <div className={DETAILS.table.toolbar}>
                <div className={DETAILS.table.toolbarGroup}>
                    <StatusIcon
                        Icon={Activity}
                        size="md"
                        className={DETAILS.table.toolbarIconPrimary}
                    />
                    <span className={TEXT_ROLE.label}>
                        {viewModel.labels.title}
                    </span>
                </div>

                <div className={DETAILS.table.toolbarGroup}>
                    <ToolbarIconButton
                        Icon={Plus}
                        ariaLabel={viewModel.labels.toggleAddAriaLabel}
                        onPress={viewModel.actions.toggleAdd}
                    />
                </div>
            </div>

            <div className={DETAILS.table.body}>
                {isStandalone ? (
                    <GlassPanel className={DETAILS.table.panel}>
                        <div className={DETAILS.table.scroll}>{tableBody}</div>
                    </GlassPanel>
                ) : (
                    <div className={DETAILS.table.scroll}>{tableBody}</div>
                )}

                {viewModel.state.showAdd && (
                    <GlassPanel layer={1} className={DETAILS.table.overlay}>
                        <div className={DETAILS.table.overlayHeader}>
                            <span className={DETAILS.table.overlayTitle}>
                                {viewModel.labels.addTitle}
                            </span>
                            <ToolbarIconButton
                                Icon={X}
                                onPress={viewModel.actions.closeAdd}
                            />
                        </div>

                        <div className={DETAILS.table.overlayBody}>
                            <Textarea
                                value={viewModel.state.newTrackers}
                                onValueChange={viewModel.actions.setNewTrackers}
                                minRows={6}
                                placeholder={viewModel.labels.addPlaceholder}
                                classNames={DETAILS.table.inputClassNames}
                            />
                        </div>

                        <div className={DETAILS.table.overlayFooter}>
                            <Button
                                variant="shadow"
                                onPress={viewModel.actions.closeAdd}
                                isDisabled={viewModel.state.isMutating}
                            >
                                {viewModel.labels.cancelLabel}
                            </Button>
                            <Button
                                color="primary"
                                startContent={<Check />}
                                onPress={viewModel.actions.submitAdd}
                                isLoading={viewModel.state.isMutating}
                                isDisabled={viewModel.state.isMutating}
                            >
                                {viewModel.labels.addLabel}
                            </Button>
                            <Button
                                color="secondary"
                                onPress={viewModel.actions.submitReplace}
                                isLoading={viewModel.state.isMutating}
                                isDisabled={viewModel.state.isMutating}
                            >
                                {viewModel.labels.replaceLabel}
                            </Button>
                        </div>
                    </GlassPanel>
                )}
            </div>
        </div>
    );
};

export default TrackersTab;
