import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TorrentPeerEntity } from "../../../services/rpc/entities";
import { formatSpeed } from "../../utils/format";

interface PeerScatterProps {
    peers: TorrentPeerEntity[];
    height?: number;
    hoveredPeer?: string | null;
    onHover?: (address: string | null) => void;
}

const PADDING = 12;

const getColor = (peer: TorrentPeerEntity) => {
    if (peer.peerIsChoking) return "rgba(220,38,38,0.9)";
    if ((peer.progress ?? 0) >= 1) return "rgba(14,165,233,0.95)";
    return "rgba(249,115,22,0.95)";
};

export const PeerScatter = ({
    peers,
    height = 180,
    hoveredPeer,
    onHover,
}: PeerScatterProps) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [tooltip, setTooltip] = useState<{
        address: string;
        x: number;
        y: number;
        progress: number;
        down: number;
        up: number;
    } | null>(null);

    const maxSpeed = useMemo(
        () =>
            Math.max(
                ...peers.map((peer) => peer.rateToClient + peer.rateToPeer),
                1
            ),
        [peers]
    );

    const getPoint = useCallback(
        (peer: TorrentPeerEntity, width: number) => {
            const progress = Math.min(Math.max(peer.progress ?? 0, 0), 1);
            const speed = peer.rateToClient + peer.rateToPeer;
            return {
                x: PADDING + progress * (width - PADDING * 2),
                y:
                    height -
                    PADDING -
                    Math.min(speed / maxSpeed, 1) * (height - PADDING * 2),
            };
        },
        [height, maxSpeed]
    );

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const width = canvas.clientWidth;
        const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        peers.forEach((peer) => {
            const point = getPoint(peer, width);
            ctx.beginPath();
            ctx.arc(point.x, point.y, peer.address === hoveredPeer ? 6 : 4, 0, Math.PI * 2);
            ctx.fillStyle = getColor(peer);
            ctx.fill();
            if (peer.address === hoveredPeer) {
                ctx.lineWidth = 2;
                ctx.strokeStyle = "rgba(255,255,255,0.8)";
                ctx.stroke();
            }
        });
    }, [peers, getPoint, height, hoveredPeer]);

    useEffect(() => {
        draw();
    }, [draw]);

    const handleMove = useCallback(
        (event: MouseEvent<HTMLCanvasElement>) => {
            if (!canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const width = rect.width;
            let closest: TorrentPeerEntity | null = null;
            let distance = Infinity;
            for (const peer of peers) {
                const point = getPoint(peer, width);
                const dx = point.x - x;
                const dy = point.y - y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < distance && d < 24) {
                    distance = d;
                    closest = peer;
                }
            }
            if (closest) {
                const point = getPoint(closest, width);
                setTooltip({
                    address: closest.address,
                    x: point.x,
                    y: point.y,
                    progress: Math.min(Math.max(closest.progress ?? 0, 0), 1),
                    down: closest.rateToClient,
                    up: closest.rateToPeer,
                });
                onHover?.(closest.address);
            } else {
                setTooltip(null);
                onHover?.(null);
            }
        },
        [getPoint, onHover, peers]
    );

    return (
        <div className="relative w-full h-full" style={{ height }}>
            <canvas
                ref={canvasRef}
                className="w-full h-full block"
                onMouseMove={handleMove}
                onMouseLeave={() => {
                    setTooltip(null);
                    onHover?.(null);
                }}
            />
            {tooltip && (
                <div
                    className="pointer-events-none absolute z-10 rounded-xl border border-white/20 bg-foreground/95 p-2 text-[11px] text-white shadow-lg"
                    style={{
                        left: tooltip.x + 8,
                        top: tooltip.y - 8,
                        transform: "translate(-50%, -100%)",
                    }}
                >
                    <div className="font-semibold">{tooltip.address}</div>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-white/80">
                        <span>Progress {(tooltip.progress * 100).toFixed(0)}%</span>
                        <span className="text-success">
                            ↓ {formatSpeed(tooltip.down)}
                        </span>
                        <span className="text-primary">
                            ↑ {formatSpeed(tooltip.up)}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};
