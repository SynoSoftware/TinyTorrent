import { Tooltip } from "@heroui/react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ShieldCheck, Zap, Ban, Copy, UserPlus, Info } from "lucide-react";
import { useRef } from "react";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import {
    buildContextMenuPanelStyle,
    CONTEXT_MENU,
    buildSplitViewVirtualCanvasStyle,
    buildSplitViewVirtualRowStyle,
    SURFACE,
    SPLIT,
    buildSplitViewAddressClass,
    buildSplitViewRowClass,
} from "@/shared/ui/layout/glass-surface";
import { PeerMap } from "@/modules/dashboard/components/TorrentDetails_Peers_Map";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import type { TorrentPeerEntity } from "@/services/rpc/entities";
import type { PeerContextAction } from "@/modules/dashboard/types/peerContextAction";
import { useTorrentDetailsPeersViewModel } from "@/modules/dashboard/hooks/useTorrentDetailsPeersViewModel";

interface PeersTabProps {
    peers: TorrentPeerEntity[];
    onPeerContextAction?: (
        action: PeerContextAction,
        peer: TorrentPeerEntity,
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
            <p className={SPLIT.emptyText}>{viewModel.labels.emptyMessage}</p>
        );

        const emptyShell = (
            <GlassPanel className={SPLIT.emptyPanel}>{EmptyContent}</GlassPanel>
        );

        return emptyShell;
    }

    return (
        <div className={SPLIT.root}>
            <PanelGroup direction="vertical">
                <Panel defaultSize={40} minSize={0}>
                    <GlassPanel className={SPLIT.mapPanel}>
                        <div className={SPLIT.hudRow}>
                            <div className={SPLIT.hudLabel}>HUD</div>
                        </div>
                        <div className={SPLIT.mapCanvas}>
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
                    <div className={SPLIT.resizeHandle}>
                        <div className={SPLIT.resizeBar} />
                    </div>
                </PanelResizeHandle>

                <Panel defaultSize={60} minSize={10}>
                    <GlassPanel layer={1} className={SPLIT.listSurface}>
                        <div className={SPLIT.header}>
                            <span className={SPLIT.headerFlagCol}>
                                {viewModel.labels.flagsHeader}
                            </span>
                            <span className={SPLIT.headerEndpointCol}>
                                {viewModel.labels.endpointHeader}
                            </span>
                            <span className={SPLIT.headerClientCol}>
                                {viewModel.labels.clientHeader}
                            </span>
                            <span className={SPLIT.headerSpeedCol}>
                                {viewModel.labels.downstreamHeader}
                            </span>
                            <span className={SPLIT.headerSpeedCol}>
                                {viewModel.labels.upstreamHeader}
                            </span>
                        </div>

                        <div ref={listRef} className={SPLIT.listScroll}>
                            <div
                                style={buildSplitViewVirtualCanvasStyle(
                                    viewModel.metrics.totalSize,
                                )}
                            >
                                {viewModel.data.rowViewModels.map((rowView) => (
                                    <div
                                        key={rowView.key}
                                        className={buildSplitViewRowClass({
                                            hovered: rowView.isHovered,
                                            hostile: rowView.isHostile,
                                        })}
                                        style={buildSplitViewVirtualRowStyle({
                                            top: rowView.start,
                                            height: rowView.size,
                                        })}
                                        onMouseEnter={() =>
                                            viewModel.actions.setHoveredPeer(
                                                rowView.peer.address,
                                            )
                                        }
                                        onMouseLeave={
                                            viewModel.actions.clearHoveredPeer
                                        }
                                        onContextMenu={(event) =>
                                            viewModel.actions.openContextMenu(
                                                event,
                                                rowView.peer,
                                            )
                                        }
                                    >
                                        <div className={SPLIT.flagsCol}>
                                            <div className={SPLIT.flagsWrap}>
                                                {rowView.flagCodes.map(
                                                    (flag, index) => (
                                                        <Tooltip
                                                            key={`${flag}-${index}`}
                                                            content={viewModel.actions.getFlagLabel(
                                                                flag,
                                                            )}
                                                            classNames={
                                                                SURFACE.tooltip
                                                            }
                                                            delay={500}
                                                        >
                                                            <span
                                                                className={
                                                                    SPLIT.flagToken
                                                                }
                                                            >
                                                                {flag}
                                                            </span>
                                                        </Tooltip>
                                                    ),
                                                )}
                                            </div>
                                        </div>

                                        <div className={SPLIT.endpointCol}>
                                            {rowView.isEncrypted && (
                                                <StatusIcon
                                                    Icon={ShieldCheck}
                                                    size="sm"
                                                    className={
                                                        SPLIT.encryptedIcon
                                                    }
                                                />
                                            )}
                                            {rowView.isUTP && (
                                                <StatusIcon
                                                    Icon={Zap}
                                                    size="sm"
                                                    className={SPLIT.utpIcon}
                                                />
                                            )}
                                            <span
                                                className={buildSplitViewAddressClass(
                                                    rowView.isHostile,
                                                )}
                                            >
                                                {rowView.peer.address}
                                            </span>
                                        </div>

                                        <div className={SPLIT.clientCol}>
                                            {rowView.clientName}
                                        </div>
                                        <div className={SPLIT.downRateCol}>
                                            {rowView.downRateLabel}
                                        </div>
                                        <div className={SPLIT.upRateCol}>
                                            {rowView.upRateLabel}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {viewModel.state.peerContextMenu && (
                                <div
                                    className={CONTEXT_MENU.panel}
                                    style={buildContextMenuPanelStyle({
                                        x: viewModel.state.peerContextMenu.x,
                                        y: viewModel.state.peerContextMenu.y,
                                    })}
                                    onPointerDown={(event) =>
                                        event.stopPropagation()
                                    }
                                >
                                    <div className={CONTEXT_MENU.header}>
                                        <StatusIcon
                                            Icon={Info}
                                            size="sm"
                                            className={CONTEXT_MENU.headerIcon}
                                        />
                                        <span
                                            className={CONTEXT_MENU.headerText}
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
                                                "copy_ip",
                                            )
                                        }
                                        className={CONTEXT_MENU.actionButton}
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
                                                "add_peer",
                                            )
                                        }
                                        className={CONTEXT_MENU.actionButton}
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
                                                "ban_ip",
                                            )
                                        }
                                        className={
                                            CONTEXT_MENU.dangerActionButton
                                        }
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
                    </GlassPanel>
                </Panel>
            </PanelGroup>
        </div>
    );
};
