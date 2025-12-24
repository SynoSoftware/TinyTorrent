import {
    type MouseEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import { GlassPanel } from "../../../../../shared/ui/layout/GlassPanel";
import { formatSpeed } from "../../../../../shared/utils/format";
import type { TorrentPeerEntity } from "../../../../../services/rpc/entities";
import { PeerScatter } from "../visualizations/PeerScatter";
import { usePeerHover } from "../../../../../shared/hooks/usePeerHover";
import { useTranslation } from "react-i18next";

const DEFAULT_ROW_HEIGHT = 34;

// Row height and context-menu margins are derived from layout metrics hook

export type PeerContextAction = "add_peer" | "ban_ip" | "copy_ip";

type PeerContextMenuState = {
    peer: TorrentPeerEntity;
    x: number;
    y: number;
};

const CONTEXT_MENU_WIDTH = 200;
const DEFAULT_CONTEXT_MENU_MARGIN = 8;

// noop - metrics from hook used in component

interface PeersTabProps {
    peers: TorrentPeerEntity[];
    onPeerContextAction?: (
        action: PeerContextAction,
        peer: TorrentPeerEntity
    ) => void;
    sortBySpeed?: boolean;
}

export const PeersTab = ({
    peers,
    onPeerContextAction,
    sortBySpeed = false,
}: PeersTabProps) => {
    const { hoveredPeer, setHoveredPeer } = usePeerHover();
    const { t } = useTranslation();
    const listRef = useRef<HTMLDivElement | null>(null);
    const orderedPeers = useMemo(() => {
        if (!sortBySpeed) return peers;
        return [...peers].sort(
            (a, b) =>
                b.rateToClient + b.rateToPeer - (a.rateToClient + a.rateToPeer)
        );
    }, [peers, sortBySpeed]);
    const [peerContextMenu, setPeerContextMenu] =
        useState<PeerContextMenuState | null>(null);
    const { rowHeight, fileContextMenuMargin, fileContextMenuWidth } =
        useLayoutMetrics();
    const rowVirtualizer = useVirtualizer({
        count: orderedPeers.length,
        getScrollElement: () => listRef.current,
        estimateSize: () => rowHeight || DEFAULT_ROW_HEIGHT,
        overscan: 6,
    });
    const virtualItems = rowVirtualizer.getVirtualItems();
    useEffect(() => {
        const handlePointerDown = () => setPeerContextMenu(null);
        window.addEventListener("pointerdown", handlePointerDown);
        return () => {
            window.removeEventListener("pointerdown", handlePointerDown);
        };
    }, []);
    const clampPeerContextMenuPosition = useCallback(
        (x: number, y: number) => {
            const rect = listRef.current?.getBoundingClientRect();
            if (!rect) {
                return { x, y };
            }
            const margin = fileContextMenuMargin;
            const menuWidth = fileContextMenuWidth || CONTEXT_MENU_WIDTH;
            const maxX = Math.max(rect.width - menuWidth - margin, margin);
            const maxY = Math.max(rect.height - margin, margin);
            return {
                x: Math.min(Math.max(x, margin), maxX),
                y: Math.min(Math.max(y, margin), maxY),
            };
        },
        [fileContextMenuMargin, fileContextMenuWidth]
    );
    const handlePeerContextMenu = useCallback(
        (event: MouseEvent<HTMLDivElement>, peer: TorrentPeerEntity) => {
            event.preventDefault();
            event.stopPropagation();
            const rect = listRef.current?.getBoundingClientRect();
            const offsetX = rect ? event.clientX - rect.left : event.clientX;
            const offsetY = rect ? event.clientY - rect.top : event.clientY;
            const { x, y } = clampPeerContextMenuPosition(offsetX, offsetY);
            setPeerContextMenu({ peer, x, y });
        },
        [clampPeerContextMenuPosition]
    );
    const peerContextItems = useMemo(
        () => [
            {
                key: "add_peer" as const,
                label: t("torrent_modal.context_menu.peers.add_peer"),
            },
            {
                key: "ban_ip" as const,
                label: t("torrent_modal.context_menu.peers.ban_ip"),
            },
            {
                key: "copy_ip" as const,
                label: t("torrent_modal.context_menu.peers.copy_ip"),
            },
        ],
        [t]
    );
    const handlePeerContextAction = useCallback(
        (action: PeerContextAction) => {
            if (!peerContextMenu) return;
            if (action === "copy_ip" && typeof navigator !== "undefined") {
                navigator.clipboard
                    ?.writeText(peerContextMenu.peer.address)
                    .catch(() => null);
            }
            onPeerContextAction?.(action, peerContextMenu.peer);
            setPeerContextMenu(null);
        },
        [onPeerContextAction, peerContextMenu]
    );

    const rows = useMemo(
        () =>
            virtualItems.map((virtualRow) => {
                const peer = orderedPeers[virtualRow.index];
                return (
                    <div
                        key={virtualRow.key}
                        className={`absolute left-0 right-0 flex items-center px-3 text-[length:var(--fz-scaled)] text-foreground select-none transition-colors ${
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
                        onContextMenu={(event) =>
                            handlePeerContextMenu(event, peer)
                        }
                    >
                        <div className="w-6 text-left text-[length:var(--fz-scaled)] uppercase tracking-[0.2em]">
                            {peer.flagStr}
                        </div>
                        <div className="flex-1 min-w-0 text-[length:var(--fz-scaled)] font-mono">
                            {peer.address}
                        </div>
                        <div className="w-28 text-[length:var(--fz-scaled)] text-foreground/60 truncate">
                            {peer.clientName}
                        </div>
                        <div className="w-20 flex items-center gap-1">
                            <div className="h-1.5 flex-1 rounded-full bg-content1/20">
                                <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{
                                        width: `${(peer.progress ?? 0) * 100}%`,
                                    }}
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
        [handlePeerContextMenu, hoveredPeer, orderedPeers, virtualItems]
    );

    return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden gap-3">
            <GlassPanel className="flex-none h-[length:calc(45*var(--u)*var(--z))]">
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
                    className="flex-1 min-h-0 overflow-y-auto relative"
                >
                    <div
                        style={{
                            height: `${rowVirtualizer.getTotalSize()}px`,
                            position: "relative",
                        }}
                    >
                        {rows}
                    </div>
                    {peerContextMenu && (
                        <div
                            className="pointer-events-auto absolute z-40 rounded-2xl border border-content1/40 bg-content1/80 p-1 backdrop-blur-3xl shadow-[0_20px_45px_rgba(0,0,0,0.35)]"
                            style={{
                                top: peerContextMenu.y,
                                left: peerContextMenu.x,
                                minWidth: CONTEXT_MENU_WIDTH,
                            }}
                            onPointerDown={(event) => event.stopPropagation()}
                            onContextMenu={(event) => event.preventDefault()}
                        >
                            {peerContextItems.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground transition-colors data-[hover=true]:bg-content2/70 data-[pressed=true]:bg-content2/80 hover:text-foreground"
                                    onClick={() =>
                                        handlePeerContextAction(item.key)
                                    }
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
