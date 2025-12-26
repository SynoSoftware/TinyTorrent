import { Button, Tooltip, cn } from "@heroui/react";
import type { PointerEvent, WheelEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ZoomIn, ZoomOut } from "lucide-react";
import { GLASS_TOOLTIP_CLASSNAMES } from "./constants";
import {
    clamp,
    useCanvasPalette,
} from "@/modules/dashboard/components/details/visualizations/canvasUtils";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import { PEER_MAP_CONFIG } from "@/config/logic";
import { formatSpeed } from "@/shared/utils/format";
import type { TorrentPeerEntity } from "@/services/rpc/entities";

const PEER_DRIFT_AMPLITUDE = PEER_MAP_CONFIG.drift_amplitude;
const PEER_DRIFT_DURATION_MIN = PEER_MAP_CONFIG.drift_duration.min;
const PEER_DRIFT_DURATION_MAX = PEER_MAP_CONFIG.drift_duration.max;

interface PeerMapProps {
    peers: TorrentPeerEntity[];
}

export const PeerMap = ({ peers }: PeerMapProps) => {
    const { t } = useTranslation();
    const [scale, setScale] = useState(1);
    const [translate, setTranslate] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef(false);
    const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
    const MIN_SCALE = 0.8;
    const MAX_SCALE = 1.5;
    const ZOOM_STEP = 0.08;
    const MAX_PAN_OFFSET = 60;

    const maxRate = useMemo(
        () =>
            Math.max(
                ...peers.map((peer) => peer.rateToClient + peer.rateToPeer),
                1
            ),
        [peers]
    );
    const { unit } = useLayoutMetrics();
    const palette = useCanvasPalette();

    const nodes = useMemo(() => {
        if (!peers.length) return [];
        const cfgLayout = (PEER_MAP_CONFIG as any).layout ?? PEER_MAP_CONFIG;
        const layout = {
            center: (cfgLayout && cfgLayout.center) ?? 90,
            radius: (cfgLayout && cfgLayout.radius) ?? 70,
            base_node_size: (cfgLayout && cfgLayout.base_node_size) ?? 6,
            progress_scale: (cfgLayout && cfgLayout.progress_scale) ?? 12,
        };
        const radius = layout.radius;
        const center = layout.center;
        const baseNode = layout.base_node_size;
        const progressScale = layout.progress_scale;

        // Deterministic hash helper to derive consistent offsets from peer identity
        const hashString = (s: string) => {
            let h = 2166136261 >>> 0;
            for (let i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i) & 0xff;
                h = Math.imul(h, 16777619) >>> 0;
            }
            return h >>> 0;
        };

        return peers.map((peer, index) => {
            const angle = (index / peers.length) * Math.PI * 2;
            const speed = peer.rateToClient + peer.rateToPeer;
            const distance = radius * 0.3 + (speed / maxRate) * (radius * 0.6);
            const x = center + Math.cos(angle) * distance;
            const y = center + Math.sin(angle) * distance;
            const unitPx = unit || 4;
            const size = baseNode + (peer.progress ?? 0) * progressScale;
            const isChoking = peer.peerIsChoking;
            const fill = isChoking ? palette.danger : palette.success;

            // Deterministic offsets derived from peer address (no randomness)
            const seed = hashString(
                peer.address || (peer as any).id || String(index)
            );
            const frac = (seed % 1000) / 1000;
            const driftX = (frac - 0.5) * PEER_DRIFT_AMPLITUDE;
            const driftY = ((seed >>> 10) % 1000) / 1000 - 0.5;
            const duration =
                PEER_DRIFT_DURATION_MIN +
                (((seed >>> 5) % 1000) / 1000) *
                    (PEER_DRIFT_DURATION_MAX - PEER_DRIFT_DURATION_MIN);
            const delay = (((seed >>> 15) % 1000) / 1000) * 1.5;
            const delayY = delay + (((seed >>> 20) % 1000) / 1000) * 0.7;

            return {
                peer,
                x,
                y,
                size,
                fill,
                driftX,
                driftY,
                duration,
                delay,
                delayY,
            };
        });
    }, [maxRate, peers, unit, palette]);

    const handleZoom = (direction: "in" | "out") => {
        setScale((prev) =>
            clamp(
                prev + (direction === "in" ? ZOOM_STEP : -ZOOM_STEP),
                MIN_SCALE,
                MAX_SCALE
            )
        );
    };

    const handlePointerDown = useCallback(
        (event: PointerEvent<SVGSVGElement>) => {
            event.preventDefault();
            dragRef.current = true;
            setIsDragging(true);
            lastPointerRef.current = { x: event.clientX, y: event.clientY };
        },
        []
    );

    const handlePointerMove = useCallback(
        (event: PointerEvent<SVGSVGElement>) => {
            if (!dragRef.current || !lastPointerRef.current) return;
            const dx = event.clientX - lastPointerRef.current.x;
            const dy = event.clientY - lastPointerRef.current.y;
            lastPointerRef.current = { x: event.clientX, y: event.clientY };
            setTranslate((prev) => ({
                x: clamp(prev.x + dx, -MAX_PAN_OFFSET, MAX_PAN_OFFSET),
                y: clamp(prev.y + dy, -MAX_PAN_OFFSET, MAX_PAN_OFFSET),
            }));
        },
        []
    );

    const handlePointerUp = useCallback(() => {
        dragRef.current = false;
        setIsDragging(false);
        lastPointerRef.current = null;
    }, []);

    const handleWheel = useCallback((event: WheelEvent<SVGSVGElement>) => {
        event.preventDefault();
        setScale((prev) =>
            clamp(
                prev + (event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP),
                MIN_SCALE,
                MAX_SCALE
            )
        );
    }, []);

    return (
        <motion.div
            layout
            className="flex flex-col flex-1 rounded-2xl border border-content1/20 bg-content1/15 p-4 space-y-3 overflow-hidden"
        >
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-scaled uppercase tracking-[0.3em] text-foreground/50">
                        {t("torrent_modal.peer_map.title")}
                    </span>
                    <span className="text-scaled font-mono text-foreground/50">
                        {t("torrent_modal.peer_map.total", {
                            count: peers.length,
                        })}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        size="sm"
                        variant="flat"
                        color="default"
                        className="h-[var(--button-h)] w-[var(--button-h)]"
                        onPress={() => handleZoom("out")}
                    >
                        <ZoomOut
                            size={12}
                            strokeWidth={1.5}
                            className="text-current"
                        />
                    </Button>
                    <Button
                        size="sm"
                        variant="flat"
                        color="default"
                        className="h-[var(--button-h)] w-[var(--button-h)]"
                        onPress={() => handleZoom("in")}
                    >
                        <ZoomIn
                            size={12}
                            strokeWidth={1.5}
                            className="text-current"
                        />
                    </Button>
                </div>
            </div>

            <div className="flex-1 min-h-0">
                <motion.svg
                    viewBox="0 0 180 180"
                    preserveAspectRatio="xMidYMid meet"
                    className={cn(
                        "rounded-2xl bg-content1/10 border border-content1/20",
                        "w-full h-full",
                        isDragging ? "cursor-grabbing" : "cursor-grab"
                    )}
                    style={{
                        touchAction: "none",
                        transform: `scale(${scale})`,
                        transformOrigin: "center",
                    }}
                    onWheel={handleWheel}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                >
                    <defs>
                        <linearGradient
                            id="peer-map-radar"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="0"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--heroui-primary)"
                                stopOpacity="0.35"
                            />
                            <stop
                                offset="20%"
                                stopColor="var(--heroui-primary)"
                                stopOpacity="0.25"
                            />
                            <stop
                                offset="70%"
                                stopColor="var(--heroui-primary)"
                                stopOpacity="0.05"
                            />
                            <stop
                                offset="100%"
                                stopColor="transparent"
                                stopOpacity="0"
                            />
                        </linearGradient>
                    </defs>
                    <motion.g
                        style={{
                            transform: `translate(${translate.x}px, ${translate.y}px)`,
                        }}
                    >
                        <motion.circle
                            cx={90}
                            cy={90}
                            r={80}
                            stroke="var(--heroui-content1)"
                            strokeWidth={1}
                            fill="transparent"
                            className="opacity-25"
                        />
                        {nodes.map(
                            ({
                                peer,
                                x,
                                y,
                                size,
                                fill,
                                driftX: _driftX,
                                driftY: _driftY,
                                duration: _duration,
                                delay: _delay,
                                delayY: _delayY,
                            }) => (
                                <Tooltip
                                    key={`${peer.address}-${x}-${y}`}
                                    content={t(
                                        "torrent_modal.peer_map.tooltip",
                                        {
                                            address: peer.address,
                                            dl: formatSpeed(peer.rateToClient),
                                            ul: formatSpeed(peer.rateToPeer),
                                            download: t("peers.download"),
                                            upload: t("peers.upload"),
                                        }
                                    )}
                                    delay={0}
                                    closeDelay={0}
                                    classNames={GLASS_TOOLTIP_CLASSNAMES}
                                >
                                    <motion.circle
                                        cx={x}
                                        cy={y}
                                        r={size}
                                        fill={fill}
                                        stroke="var(--heroui-foreground)"
                                        strokeWidth={
                                            peer.peerIsChoking ? 0.5 : 1
                                        }
                                    />
                                </Tooltip>
                            )
                        )}
                    </motion.g>
                </motion.svg>
            </div>
        </motion.div>
    );
};
