import React from "react";
import { Plus, Activity, Timer, Users, X, Check } from "lucide-react";
import { Button, Textarea, cn } from "@heroui/react";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import type { TorrentTrackerEntity } from "@/services/rpc/entities";
import { TEXT_ROLES } from "@/modules/dashboard/hooks/utils/textRoles";
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
            <p className={`${TEXT_ROLES.primary} text-foreground/30`}>
                {viewModel.labels.emptyMessage}
            </p>
        );

        const emptyShell = (
            <GlassPanel className="flex h-lg items-center justify-center border-default/10 text-center">
                {emptyContent}
            </GlassPanel>
        );

        return emptyShell;
    }

    const tableBody = (
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
                        {viewModel.labels.hostnameHeader}
                    </th>
                    <th className="border-b border-default/10 px-tight py-panel">
                        {viewModel.labels.nextAnnounceHeader}
                    </th>
                    <th className="border-b border-default/10 px-tight py-panel">
                        {viewModel.labels.peersHeader}
                    </th>
                    <th className="border-b border-default/10 py-panel pl-tight pr-panel text-right">
                        {viewModel.labels.statusHeader}
                    </th>
                </tr>
            </thead>

            <tbody className="font-mono text-scaled">
                {viewModel.data.rows.map((row) => (
                    <tr key={row.key} className="group hover:bg-primary/5">
                        <td className="border-b border-default/5 py-panel pl-panel pr-tight">
                            <div
                                className={cn(
                                    "size-dot rounded-full shadow-dot",
                                    row.isOnlineIndicator
                                        ? "bg-success shadow-success/50"
                                        : "bg-warning shadow-warning/50",
                                )}
                            />
                        </td>

                        <td className="truncate border-b border-default/5 px-tight py-panel font-sans font-medium text-foreground/80">
                            {row.hostname}
                        </td>

                        <td className="border-b border-default/5 px-tight py-panel text-foreground/50 tabular-nums">
                            <div className="flex items-center gap-tight">
                                <StatusIcon Icon={Timer} size="sm" />
                                {row.nextAnnounceLabel}
                            </div>
                        </td>

                        <td className="border-b border-default/5 px-tight py-panel text-foreground/70">
                            <div className="flex items-center gap-tools">
                                <StatusIcon Icon={Users} size="sm" />
                                {row.peersLabel}
                            </div>
                        </td>

                        <td className="border-b border-default/5 py-panel pl-tight pr-panel text-right font-bold uppercase">
                            {row.statusTone === "pending" && (
                                <span className="text-foreground/50">
                                    {row.statusLabel}
                                </span>
                            )}
                            {row.statusTone === "online" && (
                                <span className="text-success">
                                    {row.statusLabel}
                                </span>
                            )}
                            {row.statusTone === "partial" && (
                                <span className="text-warning">
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
        <div className="flex h-full flex-col gap-panel">
            <div className="sticky top-0 z-sticky flex items-center justify-between px-tight">
                <div className="flex items-center gap-tools">
                    <StatusIcon
                        Icon={Activity}
                        size="md"
                        className="text-primary"
                    />
                    <span className="text-label uppercase tracking-tight text-foreground/60">
                        {viewModel.labels.title}
                    </span>
                </div>

                <div className="flex items-center gap-tools">
                    <ToolbarIconButton
                        Icon={Plus}
                        ariaLabel={viewModel.labels.toggleAddAriaLabel}
                        onPress={viewModel.actions.toggleAdd}
                    />
                </div>
            </div>

            <div className="relative min-h-0 flex-1">
                {isStandalone ? (
                    <GlassPanel className="min-h-0 flex-1 overflow-hidden">
                        <div className="h-full overflow-auto">{tableBody}</div>
                    </GlassPanel>
                ) : (
                    <div className="h-full overflow-auto">{tableBody}</div>
                )}

                {viewModel.state.showAdd && (
                    <GlassPanel
                        layer={1}
                        className={cn(
                            "absolute inset-0 z-overlay flex flex-col bg-background/40 backdrop-blur-xl",
                        )}
                    >
                        <div className="flex items-center justify-between border-b border-default/10 px-panel py-panel">
                            <span className="font-semibold uppercase text-primary">
                                {viewModel.labels.addTitle}
                            </span>
                            <ToolbarIconButton
                                Icon={X}
                                onPress={viewModel.actions.closeAdd}
                            />
                        </div>

                        <div className="flex-1 p-panel">
                            <Textarea
                                value={viewModel.state.newTrackers}
                                onValueChange={viewModel.actions.setNewTrackers}
                                minRows={6}
                                placeholder={viewModel.labels.addPlaceholder}
                                classNames={{
                                    input: "font-mono",
                                    inputWrapper: "bg-background/40",
                                }}
                            />
                        </div>

                        <div className="flex justify-end gap-tools border-t border-default/10 p-panel">
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
