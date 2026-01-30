import {
    type MouseEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { cn, Tooltip } from "@heroui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { formatSpeed } from "@/shared/utils/format";
import type { TorrentPeerEntity } from "@/services/rpc/entities";
import { PeerMap } from "@/modules/dashboard/components/TorrentDetails_Peers_Map";
import { usePeerHover } from "@/shared/hooks/usePeerHover";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { GLASS_TOOLTIP_CLASSNAMES } from "@/modules/dashboard/hooks/utils/constants";
import { TEXT_ROLES } from "../hooks/utils/textRoles";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { ShieldCheck, Zap, Ban, Copy, UserPlus, Info } from "lucide-react";
import type { PeerContextAction } from "@/modules/dashboard/types/peerContextAction";

// TODO: Keep PeersTab presentational:
// TODO: - No RPC calls and no ShellExtensions calls here. Emit `PeerContextAction` and let a higher layer execute (command bus/view-model).
// TODO: - Avoid inventing additional global listeners/timers inside the view; centralize if needed (todo.md task 19).
// TODO: - If hover/selection state needs to be shared across peer list + peer map, define a small `PeersViewModel` contract and keep computation outside render.

type PeerContextMenuState = {
    peer: TorrentPeerEntity;
    x: number;
    y: number;
};

const FLAG_MAP: Record<string, string> = {
    D: "peers.flags.downloading",
    U: "peers.flags.uploading",
    K: "peers.flags.uninterested_remote",
    I: "peers.flags.uninterested_local",
    c: "peers.flags.choked_remote",
    X: "peers.flags.dex_discovery",
    H: "peers.flags.dht_discovery",
    E: "peers.flags.encrypted",
    P: "peers.flags.utp",
    u: "peers.flags.utp",
};

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
    const { hoveredPeer, setHoveredPeer } = usePeerHover();
    const { t } = useTranslation();
    const listRef = useRef<HTMLDivElement | null>(null);
    const [peerContextMenu, setPeerContextMenu] =
        useState<PeerContextMenuState | null>(null);

    const { rowHeight, fileContextMenuMargin, fileContextMenuWidth } =
        useLayoutMetrics();

    const safePeers = peers || [];
    const isEmpty = safePeers.length === 0;

    const orderedPeers = useMemo(() => {
        if (!sortBySpeed) return safePeers;
        return [...safePeers].sort(
            (a, b) =>
                b.rateToClient + b.rateToPeer - (a.rateToClient + a.rateToPeer)
        );
    }, [safePeers, sortBySpeed]);

    const rowVirtualizer = useVirtualizer({
        count: orderedPeers.length,
        getScrollElement: () => listRef.current,
        estimateSize: () => rowHeight || 34,
        overscan: 10,
    });

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
        if (action === "copy_ip")
            navigator.clipboard
                ?.writeText(peerContextMenu.peer.address)
                .catch(() => null);
        onPeerContextAction?.(action, peerContextMenu.peer);
        setPeerContextMenu(null);
    };

    const renderFlags = (flagStr: string) => (
        <div className="flex gap-tight">
            {flagStr.split("").map((f, i) => (
                <Tooltip
                    key={`${f}-${i}`}
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

    if (isEmpty) {
        return isStandalone ? (
            <GlassPanel className="flex h-full items-center justify-center border-default/10 text-center">
                <p className={`${TEXT_ROLES.primary} text-foreground/30`}>
                    {t("torrent_modal.peers.empty_backend")}
                </p>
            </GlassPanel>
        ) : (
            <div className="flex h-full items-center justify-center border-default/10 text-center">
                <p className={`${TEXT_ROLES.primary} text-foreground/30`}>
                    {t("torrent_modal.peers.empty_backend")}
                </p>
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
                                peers={peers}
                                hoveredPeerId={hoveredPeer}
                                onHover={setHoveredPeer}
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
                                {t("peers.columns.flags")}
                            </span>
                            <span className="flex-1">
                                {t("peers.columns.endpoint")}
                            </span>
                            <span className="w-col-client">
                                {t("peers.columns.client_identification")}
                            </span>
                            <span className="w-col-speed text-right">
                                {t("peers.columns.downstream")}
                            </span>
                            <span className="w-col-speed text-right">
                                {t("peers.columns.upstream")}
                            </span>
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
                                {rowVirtualizer
                                    .getVirtualItems()
                                    .map((virtualRow) => {
                                        const peer =
                                            orderedPeers[virtualRow.index];
                                        const safeAddr =
                                            (peer.address &&
                                                String(peer.address).trim()) ||
                                            (peer.clientName &&
                                                String(
                                                    peer.clientName
                                                ).trim()) ||
                                            `peer-${virtualRow.index}`;
                                        const isHovered =
                                            hoveredPeer === peer.address;
                                        const isUTP =
                                            peer.flagStr.includes("P") ||
                                            peer.flagStr.includes("u");
                                        const isEncrypted =
                                            peer.flagStr.includes("E");
                                        const isHostile =
                                            torrentProgress < 1 &&
                                            peer.peerIsChoking &&
                                            peer.clientIsInterested;

                                        return (
                                            <div
                                                key={`${safeAddr}-${virtualRow.index}`}
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
                                                onMouseLeave={() =>
                                                    setHoveredPeer(null)
                                                }
                                                onContextMenu={(e) =>
                                                    handlePeerContextMenu(
                                                        e,
                                                        peer
                                                    )
                                                }
                                            >
                                                <div className="w-col-id font-mono text-label text-foreground/60">
                                                    {renderFlags(peer.flagStr)}
                                                </div>
                                                <div className="flex-1 min-w-0 flex items-center gap-tools">
                                                    {isEncrypted && (
                                                        <StatusIcon
                                                            Icon={ShieldCheck}
                                                            size="sm"
                                                            className="text-success/50"
                                                        />
                                                    )}
                                                    {isUTP && (
                                                        <StatusIcon
                                                            Icon={Zap}
                                                            size="sm"
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
                                                        ? formatSpeed(
                                                              peer.rateToClient
                                                          )
                                                        : "-"}
                                                </div>
                                                <div className="w-col-speed font-mono text-scaled text-primary text-right tabular-nums">
                                                    {peer.rateToPeer > 0
                                                        ? formatSpeed(
                                                              peer.rateToPeer
                                                          )
                                                        : "-"}
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>

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
                                        <StatusIcon
                                            Icon={Info}
                                            size="sm"
                                            className="text-foreground/30"
                                        />
                                        <span
                                            className={`${TEXT_ROLES.label} text-foreground/40 truncate`}
                                        >
                                            {peerContextMenu.peer.address}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => handleAction("copy_ip")}
                                        className="w-full flex items-center gap-tools px-panel py-tight rounded-xl text-scaled font-semibold hover:bg-content1/10 transition-colors"
                                    >
                                        <StatusIcon
                                            Icon={Copy}
                                            size="sm"
                                            strokeWidth={ICON_STROKE_WIDTH}
                                        />{" "}
                                        {t("peers.action_copy_ip")}
                                    </button>
                                    <button
                                        onClick={() => handleAction("add_peer")}
                                        className="w-full flex items-center gap-tools px-panel py-tight rounded-xl text-scaled font-semibold hover:bg-content1/10 transition-colors"
                                    >
                                        <StatusIcon
                                            Icon={UserPlus}
                                            size="sm"
                                            strokeWidth={ICON_STROKE_WIDTH}
                                        />{" "}
                                        {t("peers.action_add_peer")}
                                    </button>
                                    <button
                                        onClick={() => handleAction("ban_ip")}
                                        className="w-full flex items-center gap-tools px-panel py-tight rounded-xl text-scaled font-semibold text-danger hover:bg-danger/10 transition-colors border-t border-content1/10 mt-tight"
                                    >
                                        <StatusIcon
                                            Icon={Ban}
                                            size="sm"
                                            strokeWidth={ICON_STROKE_WIDTH}
                                        />{" "}
                                        {t("peers.action_ban_ip")}
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
