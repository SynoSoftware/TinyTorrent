import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { GlassPanel } from "../../../../../shared/ui/layout/GlassPanel";
import { formatSpeed } from "../../../../../shared/utils/format";
import type { TorrentPeerEntity } from "../../../../../services/rpc/entities";
import { PeerScatter } from "../visualizations/PeerScatter";
import { usePeerHover } from "../../../../../shared/hooks/usePeerHover";

const ROW_HEIGHT = 34;

interface PeersTabProps {
    peers: TorrentPeerEntity[];
}

export const PeersTab = ({ peers }: PeersTabProps) => {
    const { hoveredPeer, setHoveredPeer } = usePeerHover();
    const listRef = useRef<HTMLDivElement | null>(null);
    const rowVirtualizer = useVirtualizer({
        count: peers.length,
        getScrollElement: () => listRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 6,
    });
    const virtualItems = rowVirtualizer.getVirtualItems();

    const rows = useMemo(
        () =>
            virtualItems.map((virtualRow) => {
                const peer = peers[virtualRow.index];
                return (
                    <div
                        key={virtualRow.key}
                        className={`absolute left-0 right-0 flex items-center px-3 text-[11px] text-foreground select-none transition-colors ${
                            hoveredPeer === peer.address
                                ? "bg-white/5"
                                : "hover:bg-white/5"
                        }`}
                        style={{
                            top: virtualRow.start,
                            height: virtualRow.size,
                        }}
                        onMouseEnter={() => setHoveredPeer(peer.address)}
                        onMouseLeave={() => setHoveredPeer(null)}
                    >
                        <div className="w-6 text-left text-[10px] uppercase tracking-[0.2em]">
                            {peer.flagStr}
                        </div>
                        <div className="flex-1 min-w-0 text-[11px] font-mono">
                            {peer.address}
                        </div>
                        <div className="w-28 text-[10px] text-foreground/60 truncate">
                            {peer.clientName}
                        </div>
                        <div className="w-20 flex items-center gap-1">
                            <div className="h-1.5 flex-1 rounded-full bg-content1/20">
                                <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{ width: `${(peer.progress ?? 0) * 100}%` }}
                                />
                            </div>
                        </div>
                        <div className="w-20 font-mono text-success text-right">
                            {formatSpeed(peer.rateToClient)}
                        </div>
                        <div className="w-20 font-mono text-primary text-right">
                            {formatSpeed(peer.rateToPeer)}
                        </div>
                    </div>
                );
            }),
        [peers, virtualItems, hoveredPeer]
    );

    return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden gap-3">
            <GlassPanel className="flex-none h-[180px]">
                <PeerScatter
                    peers={peers}
                    height={180}
                    hoveredPeer={hoveredPeer}
                    onHover={setHoveredPeer}
                />
            </GlassPanel>
            <div className="flex-1 min-h-0 relative overflow-hidden rounded-2xl border border-content1/30 bg-content1/10">
                <div className="flex items-center gap-4 px-3 py-2 text-xs uppercase tracking-[0.2em] text-foreground/50">
                    <span className="w-6 text-left">Flag</span>
                    <span className="flex-1">IP Address</span>
                    <span className="w-28">Client</span>
                    <span className="w-20">Progress</span>
                    <span className="w-20 text-right">↓</span>
                    <span className="w-20 text-right">↑</span>
                </div>
                <div
                    ref={listRef}
                    className="flex-1 min-h-0 overflow-y-auto"
                >
                    <div
                        style={{
                            height: `${rowVirtualizer.getTotalSize()}px`,
                            position: "relative",
                        }}
                    >
                        {rows}
                    </div>
                </div>
            </div>
        </div>
    );
};
