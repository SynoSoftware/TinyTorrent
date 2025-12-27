import {
    type MouseEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { cn } from "@heroui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@heroui/react";
import { ShieldCheck, Zap, Ban, Copy, UserPlus, Info } from "lucide-react";

import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { formatSpeed } from "@/shared/utils/format";
import type { TorrentPeerEntity } from "@/services/rpc/entities";
import { PeerMap } from "@/modules/dashboard/components/details/visualizations/PeerMap";
import { usePeerHover } from "@/shared/hooks/usePeerHover";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { GLASS_TOOLTIP_CLASSNAMES } from "@/modules/dashboard/components/details/visualizations/constants";
import { TEXT_ROLES } from "./textRoles";

export type PeerContextAction = "add_peer" | "ban_ip" | "copy_ip";

type PeerContextMenuState = {
    peer: TorrentPeerEntity;
    x: number;
    y: number;
};

// Protocol Intelligence Map
const FLAG_MAP: Record<string, string> = {
    D: "peers.flags.downloading", // Currently downloading from peer
    U: "peers.flags.uploading", // Currently uploading to peer
    K: "peers.flags.uninterested_remote", // Peer un-interested in us
    I: "peers.flags.uninterested_local", // We are un-interested in peer
    c: "peers.flags.choked_remote", // Peer choked us
    X: "peers.flags.dex_discovery", // Peer from PEX
    H: "peers.flags.dht_discovery", // Peer from DHT
    E: "peers.flags.encrypted", // Encrypted connection
    P: "peers.flags.utp", // uTP (Micro Transport Protocol)
    u: "peers.flags.utp", // uTP alternative
};

interface PeersTabProps {
    peers: TorrentPeerEntity[];
    onPeerContextAction?: (
        action: PeerContextAction,
        peer: TorrentPeerEntity
    ) => void;
    sortBySpeed?: boolean;
    torrentProgress?: number;
}

/**
 * PeersTab: Swarm Intelligence Console
 * Dual-coordinated view combining the SPD (Swarm Polar Diagnostic) with a high-density data grid.
 */
export const PeersTab = ({
    peers,
    onPeerContextAction,
    sortBySpeed = false,
    torrentProgress = 0,
}: PeersTabProps) => {
    const { hoveredPeer, setHoveredPeer } = usePeerHover();
    const { t } = useTranslation();
    const listRef = useRef<HTMLDivElement | null>(null);
    const [peerContextMenu, setPeerContextMenu] =
        useState<PeerContextMenuState | null>(null);

    const { rowHeight, fileContextMenuMargin, fileContextMenuWidth } =
        useLayoutMetrics();

    const orderedPeers = useMemo(() => {
        if (!sortBySpeed) return peers;
        return [...peers].sort(
            (a, b) =>
                b.rateToClient + b.rateToPeer - (a.rateToClient + a.rateToPeer)
        );
    }, [peers, sortBySpeed]);

    const rowVirtualizer = useVirtualizer({
        count: orderedPeers.length,
        getScrollElement: () => listRef.current,
        estimateSize: () => rowHeight || 34,
        overscan: 10,
    });

    // 1. Context Menu Lifecycle
    useEffect(() => {
        const handlePointerDown = () => setPeerContextMenu(null);
        window.addEventListener("pointerdown", handlePointerDown);
        return () =>
            window.removeEventListener("pointerdown", handlePointerDown);
    }, []);

    const handlePeerContextMenu = useCallback(
        (event: MouseEvent, peer: TorrentPeerEntity) => {
            event.preventDefault();
            const rect = listRef.current?.getBoundingClientRect();
            if (!rect) return;

            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            // Clamp logic
            const margin = fileContextMenuMargin;
            const menuW = fileContextMenuWidth || 200;
            const boundedX = Math.min(
                Math.max(x, margin),
                rect.width - menuW - margin
            );
            const boundedY = Math.min(
                Math.max(y, margin),
                rect.height - margin
            );

            setPeerContextMenu({ peer, x: boundedX, y: boundedY });
        },
        [fileContextMenuMargin, fileContextMenuWidth]
    );

    const handleAction = (action: PeerContextAction) => {
        if (!peerContextMenu) return;
        if (action === "copy_ip") {
            navigator.clipboard
                ?.writeText(peerContextMenu.peer.address)
                .catch(() => null);
        }
        onPeerContextAction?.(action, peerContextMenu.peer);
        setPeerContextMenu(null);
    };

    // 2. Protocol Intelligence Helper
    const renderFlags = (flagStr: string) => {
        return (
            <div className="flex gap-tight">
                {flagStr.split("").map((f, i) => (
                    <Tooltip
                        key={i}
                        content={t(FLAG_MAP[f] || "peers.flags.unknown")}
                        classNames={GLASS_TOOLTIP_CLASSNAMES}
                        delay={500}
                    >
                        <span className="cursor-help hover:text-primary transition-colors">
                            {f}
                        </span>
                    </Tooltip>
                ))}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden gap-tools">
            {/* COORDINATED RADAR HUD */}
            <GlassPanel className="flex-none h-peers-hud">
                <PeerMap
                    peers={peers}
                    hoveredPeerId={hoveredPeer}
                    onHover={setHoveredPeer}
                    torrentProgress={torrentProgress}
                />
            </GlassPanel>

            {/* HIGH-DENSITY DATA GRID */}
            <div className="flex-1 min-h-0 relative overflow-hidden rounded-2xl border border-content1/30 bg-content1/10 flex flex-col">
                <div className="flex items-center gap-panel px-panel py-tight text-label uppercase tracking-tight text-foreground/30 border-b border-content1/10">
                    <span className="w-col-id">Flags</span>
                    <span className="flex-1">Endpoint</span>
                    <span className="w-col-client">Client Identification</span>
                    <span className="w-col-speed text-right">Downstream</span>
                    <span className="w-col-speed text-right">Upstream</span>
                </div>

                <div
                    ref={listRef}
                    className="flex-1 min-h-0 overflow-y-auto relative outline-none select-none"
                >
                    <div
                        style={{
                            height: `${rowVirtualizer.getTotalSize()}px`,
                            position: "relative",
                        }}
                    >
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const peer = orderedPeers[virtualRow.index];
                            const isHovered = hoveredPeer === peer.address;
                            const isUTP =
                                peer.flagStr.includes("P") ||
                                peer.flagStr.includes("u");
                            const isEncrypted = peer.flagStr.includes("E");
                            const isHostile =
                                torrentProgress < 1 &&
                                peer.peerIsChoking &&
                                peer.clientIsInterested;

                            return (
                                <div
                                    key={peer.address}
                                    className={cn(
                                        "absolute left-0 right-0 flex items-center px-panel transition-colors border-b border-content1/5",
                                        isHovered
                                            ? "bg-primary/10"
                                            : "hover:bg-content1/5",
                                        isHostile && "bg-danger/5"
                                    )}
                                    style={{
                                        top: virtualRow.start,
                                        height: virtualRow.size,
                                    }}
                                    onMouseEnter={() =>
                                        setHoveredPeer(peer.address)
                                    }
                                    onMouseLeave={() => setHoveredPeer(null)}
                                    onContextMenu={(e) =>
                                        handlePeerContextMenu(e, peer)
                                    }
                                >
                                    <div className="w-col-id font-mono text-label text-foreground/60">
                                        {renderFlags(peer.flagStr)}
                                    </div>

                                    <div className="flex-1 min-w-0 flex items-center gap-tools">
                                        {isEncrypted && (
                                            <ShieldCheck
                                                size={12}
                                                className="text-success/50"
                                            />
                                        )}
                                        {isUTP && (
                                            <Zap
                                                size={12}
                                                className="text-primary/50"
                                            />
                                        )}
                                        <span
                                            className={cn(
                                                "text-scaled font-mono truncate",
                                                isHostile
                                                    ? "text-danger"
                                                    : "text-foreground/90"
                                            )}
                                        >
                                            {peer.address}
                                        </span>
                                    </div>

                                    <div className="w-col-client text-label text-foreground/40 truncate">
                                        {peer.clientName || "-"}
                                    </div>

                                    <div className="w-col-speed font-mono text-scaled text-success text-right tabular-nums">
                                        {peer.rateToClient > 0
                                            ? formatSpeed(peer.rateToClient)
                                            : "-"}
                                    </div>

                                    <div className="w-col-speed font-mono text-scaled text-primary text-right tabular-nums">
                                        {peer.rateToPeer > 0
                                            ? formatSpeed(peer.rateToPeer)
                                            : "-"}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ACTION OVERLAY */}
                    {peerContextMenu && (
                        <div
                            className="pointer-events-auto absolute z-50 rounded-2xl border border-content1/40 bg-content1/90 p-tight backdrop-blur-3xl shadow-2xl"
                            style={{
                                top: peerContextMenu.y,
                                left: peerContextMenu.x,
                                minWidth: 200,
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <div className="px-panel py-tight border-b border-content1/10 mb-tight flex items-center gap-tools">
                                <Info
                                    size={14}
                                    className="text-foreground/30"
                                />
                                <span className={`${TEXT_ROLES.label} text-foreground/40 truncate`}>
                                    {peerContextMenu.peer.address}
                                </span>
                            </div>
                            <button
                                onClick={() => handleAction("copy_ip")}
                                className="w-full flex items-center gap-tools px-panel py-tight rounded-xl text-scaled font-semibold hover:bg-content1/10 transition-colors"
                            >
                                <Copy
                                    size={16}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                />{" "}
                                {t("peers.action_copy_ip")}
                            </button>
                            <button
                                onClick={() => handleAction("add_peer")}
                                className="w-full flex items-center gap-tools px-panel py-tight rounded-xl text-scaled font-semibold hover:bg-content1/10 transition-colors"
                            >
                                <UserPlus
                                    size={16}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                />{" "}
                                {t("peers.action_add_peer")}
                            </button>
                            <button
                                onClick={() => handleAction("ban_ip")}
                                className="w-full flex items-center gap-tools px-panel py-tight rounded-xl text-scaled font-semibold text-danger hover:bg-danger/10 transition-colors border-t border-content1/10 mt-tight"
                            >
                                <Ban
                                    size={16}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                />{" "}
                                {t("peers.action_ban_ip")}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
