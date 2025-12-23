import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatSpeed } from "../../../../../shared/utils/format";
import { useCanvasPalette } from "./canvasUtils";
import type { TorrentPeerEntity } from "../../../../../services/rpc/entities";
import { DETAILS_SCATTER_CONFIG } from "../../../../../config/logic";

interface PeerScatterProps {
    peers: TorrentPeerEntity[];
    height?: number;
    hoveredPeer?: string | null;
    onHover?: (address: string | null) => void;
    className?: string;
}

export const PeerScatter = ({
    peers,
    height = 200,
    hoveredPeer,
    onHover,
    className = "",
}: PeerScatterProps) => {
    const { t } = useTranslation();
    const palette = useCanvasPalette();
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: height });

    const [tooltip, setTooltip] = useState<{
        data: TorrentPeerEntity;
        x: number;
        y: number;
        alignX: "left" | "right" | "center";
        alignY: "top" | "bottom";
    } | null>(null);

    const maxSpeed = useMemo(() => {
        const max = Math.max(
            ...peers.map((p) => p.rateToClient + p.rateToPeer),
            0
        );
        return max === 0 ? 1 : max;
    }, [peers]);

    const getPoint = useCallback(
        (peer: TorrentPeerEntity, w: number, h: number) => {
            const progress = Math.min(Math.max(peer.progress ?? 0, 0), 1);
            const speed = peer.rateToClient + peer.rateToPeer;
            const usableWidth = w - DETAILS_SCATTER_CONFIG.padding.x * 2;
            const usableHeight =
                h -
                DETAILS_SCATTER_CONFIG.padding.top -
                DETAILS_SCATTER_CONFIG.padding.bottom;

            return {
                x: DETAILS_SCATTER_CONFIG.padding.x + progress * usableWidth,
                y:
                    h -
                    DETAILS_SCATTER_CONFIG.padding.bottom -
                    Math.min(speed / maxSpeed, 1) * usableHeight,
            };
        },
        [maxSpeed]
    );

    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setDimensions({
                    width: entry.contentRect.width,
                    height: height,
                });
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, [height]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || dimensions.width === 0) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const { width, height } = dimensions;
        const dpr =
            typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        // --- Grid & Axes ---
        // Using palette colors derived from CSS variables instead of hardcoded RGBA
        ctx.lineWidth = 1;
        ctx.strokeStyle = palette.content1; // Used as subtle grid
        ctx.fillStyle = palette.foreground;
        ctx.globalAlpha = 0.4; // Valid to use global alpha with semantic colors
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";

        const usableHeight =
            height -
            DETAILS_SCATTER_CONFIG.padding.top -
            DETAILS_SCATTER_CONFIG.padding.bottom;
        const usableWidth = width - DETAILS_SCATTER_CONFIG.padding.x * 2;
        const bottomY = height - DETAILS_SCATTER_CONFIG.padding.bottom;

        // Draw Lines
        ctx.globalAlpha = 0.1;
        [0, 0.5, 1].forEach((ratio) => {
            const y = bottomY - ratio * usableHeight;
            ctx.beginPath();
            ctx.moveTo(DETAILS_SCATTER_CONFIG.padding.x, y);
            ctx.lineTo(width - DETAILS_SCATTER_CONFIG.padding.x, y);
            ctx.stroke();
        });

        // Draw Ticks & Text
        ctx.globalAlpha = 0.4;
        [0, 0.5, 1].forEach((ratio) => {
            const x = DETAILS_SCATTER_CONFIG.padding.x + ratio * usableWidth;
            ctx.beginPath();
            ctx.moveTo(x, bottomY);
            ctx.lineTo(x, bottomY + 4);
            ctx.stroke();
            ctx.fillText(`${ratio * 100}%`, x, bottomY + 14);
        });

        ctx.textAlign = "left";
        ctx.fillText(
            `${formatSpeed(maxSpeed)}`,
            DETAILS_SCATTER_CONFIG.padding.x,
            DETAILS_SCATTER_CONFIG.padding.top - 6
        );

        ctx.globalAlpha = 1.0; // Reset alpha for dots

        // --- Peers with simple damping ---
        // Maintain a persistent map of displayed positions to smoother movement.
        const sortedPeers = [...peers].sort(
            (a, b) =>
                (a.address === hoveredPeer ? 1 : 0) -
                (b.address === hoveredPeer ? 1 : 0)
        );

        // Update positions with damping
        const damping = 0.14; // smaller = smoother/slower
        for (const peer of sortedPeers) {
            const target = getPoint(peer, width, height);
            const existing = positionsRef.current.get(peer.address);
            if (!existing) {
                positionsRef.current.set(peer.address, {
                    x: target.x,
                    y: target.y,
                });
            } else {
                existing.x += (target.x - existing.x) * damping;
                existing.y += (target.y - existing.y) * damping;
                positionsRef.current.set(peer.address, existing);
            }
        }

        // Remove stale positions for peers no longer present
        const currentAddresses = new Set(peers.map((p) => p.address));
        for (const addr of positionsRef.current.keys()) {
            if (!currentAddresses.has(addr)) {
                positionsRef.current.delete(addr);
            }
        }

        for (const peer of sortedPeers) {
            const pos = positionsRef.current.get(peer.address);
            if (!pos) continue;
            const isHovered = peer.address === hoveredPeer;

            ctx.beginPath();
            ctx.arc(
                pos.x,
                pos.y,
                isHovered
                    ? DETAILS_SCATTER_CONFIG.radius.hover
                    : DETAILS_SCATTER_CONFIG.radius.normal,
                0,
                Math.PI * 2
            );

            // Strict semantic coloring
            if (peer.peerIsChoking) {
                ctx.fillStyle = palette.danger;
            } else if ((peer.progress ?? 0) >= 1) {
                ctx.fillStyle = palette.success; // Seeding = Success
            } else {
                ctx.fillStyle = palette.primary; // Leeching = Primary
            }
            ctx.fill();

            if (isHovered) {
                ctx.lineWidth = 2;
                ctx.strokeStyle = palette.foreground;
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y + DETAILS_SCATTER_CONFIG.radius.hover);
                ctx.lineTo(pos.x, bottomY);
                ctx.lineWidth = 1;
                ctx.strokeStyle = palette.foreground;
                ctx.globalAlpha = 0.2;
                ctx.setLineDash([2, 2]);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1.0;
            }
        }
    }, [peers, dimensions, hoveredPeer, getPoint, maxSpeed, palette]);

    // positionsRef holds last-rendered positions for damping/animation
    const positionsRef = useRef(new Map<string, { x: number; y: number }>());
    const animationRef = useRef<number | null>(null);

    // animation loop to keep damping smooth
    useEffect(() => {
        const loop = () => {
            draw();
            animationRef.current = requestAnimationFrame(loop);
        };
        animationRef.current = requestAnimationFrame(loop);
        return () => {
            if (animationRef.current)
                cancelAnimationFrame(animationRef.current);
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext("2d");
                if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            positionsRef.current.clear();
        };
    }, [draw]);

    useEffect(() => {
        draw();
    }, [draw]);

    const handleMove = useCallback(
        (event: MouseEvent<HTMLCanvasElement>) => {
            if (!canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const { width, height } = dimensions;

            let closest: TorrentPeerEntity | null = null;
            let minDistance = Infinity;

            for (const peer of peers) {
                const point = getPoint(peer, width, height);
                const dist = Math.sqrt(
                    Math.pow(point.x - x, 2) + Math.pow(point.y - y, 2)
                );
                if (
                    dist < minDistance &&
                    dist < DETAILS_SCATTER_CONFIG.radius.hit
                ) {
                    minDistance = dist;
                    closest = peer;
                }
            }

            if (closest) {
                const point = getPoint(closest, width, height);
                const alignX =
                    point.x > width * 0.7
                        ? "right"
                        : point.x < width * 0.3
                        ? "left"
                        : "center";
                const alignY = point.y < 60 ? "bottom" : "top";

                setTooltip({
                    data: closest,
                    x: point.x,
                    y: point.y,
                    alignX,
                    alignY,
                });

                if (closest.address !== hoveredPeer) {
                    onHover?.(closest.address);
                }
            } else {
                setTooltip(null);
                if (hoveredPeer !== null) {
                    onHover?.(null);
                }
            }
        },
        [dimensions, peers, getPoint, hoveredPeer, onHover]
    );

    return (
        <div
            ref={containerRef}
            className={`relative w-full select-none ${className}`}
            style={{ height }}
            role="img"
            aria-label={t("torrent_modal.peer_scatter.aria_label", {
                count: peers.length,
            })}
        >
            <canvas
                ref={canvasRef}
                className="block w-full h-full cursor-crosshair"
                style={{ width: "100%", height: "100%" }}
                onMouseMove={handleMove}
                onMouseLeave={() => {
                    setTooltip(null);
                    onHover?.(null);
                }}
            />
            <div className="sr-only">
                {t("torrent_modal.peer_scatter.screen_reader_desc")}
            </div>

            {tooltip && (
                <div
                    className="pointer-events-none absolute z-20 flex flex-col gap-1 rounded-lg border border-content1/50 bg-background/95 p-3 text-tiny text-foreground shadow-medium backdrop-blur-sm transition-all duration-75"
                    style={{
                        left: tooltip.x,
                        top:
                            tooltip.y +
                            (tooltip.alignY === "bottom" ? 12 : -12),
                        transform: `translate(${
                            tooltip.alignX === "right"
                                ? "-100%"
                                : tooltip.alignX === "left"
                                ? "0%"
                                : "-50%"
                        }, ${tooltip.alignY === "bottom" ? "0%" : "-100%"})`,
                    }}
                >
                    <div className="font-mono font-bold text-foreground border-b border-content1/20 pb-1 mb-1">
                        {tooltip.data.address}
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <span className="text-foreground/50">
                            {t("torrent_modal.peer_scatter.progress")}
                        </span>
                        <span className="text-right font-medium">
                            {(
                                Math.min(tooltip.data.progress ?? 0, 1) * 100
                            ).toFixed(1)}
                            %
                        </span>

                        <span className="text-foreground/50">
                            {t("torrent_modal.peer_scatter.client")}
                        </span>
                        <span className="text-right text-foreground/80 truncate max-w-[100px]">
                            {tooltip.data.clientName || t("general.unknown")}
                        </span>

                        <span className="text-success">
                            {t("torrent_modal.peer_scatter.download")}
                        </span>
                        <span className="text-right font-mono text-success">
                            {formatSpeed(tooltip.data.rateToClient)}
                        </span>

                        <span className="text-primary">
                            {t("torrent_modal.peer_scatter.upload")}
                        </span>
                        <span className="text-right font-mono text-primary">
                            {formatSpeed(tooltip.data.rateToPeer)}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};
