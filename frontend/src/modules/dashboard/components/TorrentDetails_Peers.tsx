import { cn, Tooltip } from "@heroui/react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ShieldCheck, Zap, Ban, Copy, UserPlus, Info } from "lucide-react";
import { useRef } from "react";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { PeerMap } from "@/modules/dashboard/components/TorrentDetails_Peers_Map";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { GLASS_TOOLTIP_CLASSNAMES } from "@/modules/dashboard/hooks/utils/constants";
import { TEXT_ROLES } from "@/modules/dashboard/hooks/utils/textRoles";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import type { TorrentPeerEntity } from "@/services/rpc/entities";
import type { PeerContextAction } from "@/modules/dashboard/types/peerContextAction";
import { useTorrentDetailsPeersViewModel } from "@/modules/dashboard/hooks/useTorrentDetailsPeersViewModel";

interface PeersTabProps {
    peers: TorrentPeerEntity[];
    onPeerContextAction?: (
        action: PeerContextAction,
        peer: TorrentPeerEntity
    ) => void;
    sortBySpeed?: boolean;
    torrentProgress?: number;
    isStandalone?: boolean;
}

export const PeersTab = ({
    peers,
    onPeerContextAction,
    sortBySpeed = false,
    torrentProgress = 0,
    isStandalone = false,
}: PeersTabProps) => {
    const listRef = useRef<HTMLDivElement | null>(null);
    const viewModel = useTorrentDetailsPeersViewModel({
        peers,
        listRef,
        onPeerContextAction,
        sortBySpeed,
        torrentProgress,
    });

    if (viewModel.state.isEmpty) {
        const EmptyContent = (
            <p className={`${TEXT_ROLES.primary} text-foreground/30`}>
                {viewModel.labels.emptyMessage}
            </p>
        );

        return isStandalone ? (
            <GlassPanel className="flex h-full items-center justify-center border-default/10 text-center">
                {EmptyContent}
            </GlassPanel>
        ) : (
            <div className="flex h-full items-center justify-center border-default/10 text-center">
                {EmptyContent}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden gap-tools">
            <PanelGroup direction="vertical">
                <Panel defaultSize={40} minSize={0}>
                    <GlassPanel className="flex flex-col h-full w-full">
                        <div className="flex items-center justify-end gap-tools px-panel">
                            <div className="text-label text-foreground/40 mr-2">
                                HUD
                            </div>
                        </div>
                        <div className="h-full w-full">
                            <PeerMap
                                peers={viewModel.data.peers}
                                hoveredPeerId={viewModel.state.hoveredPeer}
                                onHover={viewModel.actions.setHoveredPeer}
                                torrentProgress={torrentProgress}
                            />
                        </div>
                    </GlassPanel>
                </Panel>

                <PanelResizeHandle>
                    <div className="h-sep cursor-row-resize flex items-center justify-center">
                        <div className="w-24 h-0.5 rounded bg-content1/50 hover:bg-primary/50 transition-colors" />
                    </div>
                </PanelResizeHandle>

                <Panel defaultSize={60} minSize={10}>
                    <div className="flex-1 min-h-0 relative overflow-hidden rounded-2xl border border-content1/30 bg-content1/10 flex flex-col">
                        <div className="flex items-center gap-panel px-panel py-tight text-label uppercase tracking-tight text-foreground/30 border-b border-content1/10">
                            <span className="w-col-id">
                                {viewModel.labels.flagsHeader}
                            </span>
                            <span className="flex-1">
                                {viewModel.labels.endpointHeader}
                            </span>
                            <span className="w-col-client">
                                {viewModel.labels.clientHeader}
                            </span>
                            <span className="w-col-speed text-right">
                                {viewModel.labels.downstreamHeader}
                            </span>
                            <span className="w-col-speed text-right">
                                {viewModel.labels.upstreamHeader}
                            </span>
                        </div>

                        <div
                            ref={listRef}
                            className="flex-1 min-h-0 overflow-y-auto relative outline-none select-none"
                        >
                            <div
                                style={{
                                    height: `${viewModel.metrics.totalSize}px`,
                                    position: "relative",
                                }}
                            >
                                {viewModel.data.rowViewModels.map((rowView) => (
                                    <div
                                        key={rowView.key}
                                        className={cn(
                                            "absolute left-0 right-0 flex items-center px-panel transition-colors border-b border-content1/5",
                                            rowView.isHovered
                                                ? "bg-primary/10"
                                                : "hover:bg-content1/5",
                                            rowView.isHostile && "bg-danger/5"
                                        )}
                                        style={{
                                            top: rowView.start,
                                            height: rowView.size,
                                        }}
                                        onMouseEnter={() =>
                                            viewModel.actions.setHoveredPeer(
                                                rowView.peer.address
                                            )
                                        }
                                        onMouseLeave={
                                            viewModel.actions.clearHoveredPeer
                                        }
                                        onContextMenu={(event) =>
                                            viewModel.actions.openContextMenu(
                                                event,
                                                rowView.peer
                                            )
                                        }
                                    >
                                        <div className="w-col-id font-mono text-label text-foreground/60">
                                            <div className="flex gap-tight">
                                                {rowView.flagCodes.map(
                                                    (flag, index) => (
                                                        <Tooltip
                                                            key={`${flag}-${index}`}
                                                            content={viewModel.actions.getFlagLabel(
                                                                flag
                                                            )}
                                                            classNames={
                                                                GLASS_TOOLTIP_CLASSNAMES
                                                            }
                                                            delay={500}
                                                        >
                                                            <span className="cursor-help hover:text-primary transition-colors">
                                                                {flag}
                                                            </span>
                                                        </Tooltip>
                                                    )
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex-1 min-w-0 flex items-center gap-tools">
                                            {rowView.isEncrypted && (
                                                <StatusIcon
                                                    Icon={ShieldCheck}
                                                    size="sm"
                                                    className="text-success/50"
                                                />
                                            )}
                                            {rowView.isUTP && (
                                                <StatusIcon
                                                    Icon={Zap}
                                                    size="sm"
                                                    className="text-primary/50"
                                                />
                                            )}
                                            <span
                                                className={cn(
                                                    "text-scaled font-mono truncate",
                                                    rowView.isHostile
                                                        ? "text-danger"
                                                        : "text-foreground/90"
                                                )}
                                            >
                                                {rowView.peer.address}
                                            </span>
                                        </div>

                                        <div className="w-col-client text-label text-foreground/40 truncate">
                                            {rowView.clientName}
                                        </div>
                                        <div className="w-col-speed font-mono text-scaled text-success text-right tabular-nums">
                                            {rowView.downRateLabel}
                                        </div>
                                        <div className="w-col-speed font-mono text-scaled text-primary text-right tabular-nums">
                                            {rowView.upRateLabel}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {viewModel.state.peerContextMenu && (
                                <div
                                    className="pointer-events-auto absolute z-50 rounded-2xl border border-content1/40 bg-content1/90 p-tight backdrop-blur-3xl shadow-2xl"
                                    style={{
                                        top: viewModel.state.peerContextMenu.y,
                                        left: viewModel.state.peerContextMenu.x,
                                        minWidth: 200,
                                    }}
                                    onPointerDown={(event) =>
                                        event.stopPropagation()
                                    }
                                >
                                    <div className="px-panel py-tight border-b border-content1/10 mb-tight flex items-center gap-tools">
                                        <StatusIcon
                                            Icon={Info}
                                            size="sm"
                                            className="text-foreground/30"
                                        />
                                        <span
                                            className={`${TEXT_ROLES.label} text-foreground/40 truncate`}
                                        >
                                            {
                                                viewModel.state.peerContextMenu
                                                    .peer.address
                                            }
                                        </span>
                                    </div>
                                    <button
                                        onClick={() =>
                                            viewModel.actions.runContextAction(
                                                "copy_ip"
                                            )
                                        }
                                        className="w-full flex items-center gap-tools px-panel py-tight rounded-xl text-scaled font-semibold hover:bg-content1/10 transition-colors"
                                    >
                                        <StatusIcon
                                            Icon={Copy}
                                            size="sm"
                                            strokeWidth={ICON_STROKE_WIDTH}
                                        />
                                        {viewModel.labels.copyIpAction}
                                    </button>
                                    <button
                                        onClick={() =>
                                            viewModel.actions.runContextAction(
                                                "add_peer"
                                            )
                                        }
                                        className="w-full flex items-center gap-tools px-panel py-tight rounded-xl text-scaled font-semibold hover:bg-content1/10 transition-colors"
                                    >
                                        <StatusIcon
                                            Icon={UserPlus}
                                            size="sm"
                                            strokeWidth={ICON_STROKE_WIDTH}
                                        />
                                        {viewModel.labels.addPeerAction}
                                    </button>
                                    <button
                                        onClick={() =>
                                            viewModel.actions.runContextAction(
                                                "ban_ip"
                                            )
                                        }
                                        className="w-full flex items-center gap-tools px-panel py-tight rounded-xl text-scaled font-semibold text-danger hover:bg-danger/10 transition-colors border-t border-content1/10 mt-tight"
                                    >
                                        <StatusIcon
                                            Icon={Ban}
                                            size="sm"
                                            strokeWidth={ICON_STROKE_WIDTH}
                                        />
                                        {viewModel.labels.banIpAction}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </Panel>
            </PanelGroup>
        </div>
    );
};
