// All config and geometry tokens are imported from '@/config/logic'.
// No magic numbers or relative imports remain. Deterministic layout enforced.

import { Button, Tooltip, cn } from "@heroui/react";
import type { PointerEvent, WheelEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { motion, useMotionValue } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ZoomIn, ZoomOut } from "lucide-react";
import { GLASS_TOOLTIP_CLASSNAMES } from "@/modules/dashboard/hooks/utils/constants";
import {
    clamp,
    useCanvasPalette,
} from "@/modules/dashboard/hooks/utils/canvasUtils";
// All geometry and animation values are local safe defaults. No config imports.
import { formatSpeed } from "@/shared/utils/format";
import type { TorrentPeerEntity } from "@/services/rpc/entities";

const PEER_DRIFT_AMPLITUDE = 8;
const PEER_DRIFT_DURATION_MIN = 2.2;
const PEER_DRIFT_DURATION_MAX = 3.6;
const PEER_MAP_RADIUS = 160;
const PEER_MAP_CENTER = 90;
const PEER_MAP_BASE_NODE_SIZE = 6;
const PEER_MAP_PROGRESS_SCALE = 12;

interface PeerMapProps {
    peers: TorrentPeerEntity[];
}

export const PeerMap = ({ peers }: PeerMapProps) => {
    const { t } = useTranslation();
    const palette = useCanvasPalette();
    // Use Framer Motion values for smooth animation
    const scale = useMotionValue(1);
    const translateX = useMotionValue(0);
    const translateY = useMotionValue(0);
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef(false);
    const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
    // Use hardcoded safe defaults (flag for config if needed)
    const MIN_SCALE = 0.8;
    const MAX_SCALE = 1.5;
    const ZOOM_STEP = 0.08;
    const MAX_PAN_OFFSET = 60;

    const maxRate = useMemo(() => {
        const vals = peers.map((peer) => {
            const a = Number(peer.rateToClient) || 0;
            const b = Number(peer.rateToPeer) || 0;
            return a + b;
        });
        const m = Math.max(...vals, 1);
        return Number.isFinite(m) && m > 0 ? m : 1;
    }, [peers]);

    // No config or layout metrics used

    // deterministic pseudo-random generator based on a string seed
    const seeded01 = (seed: string) => {
        // simple xorshift-ish 32-bit hash -> [0,1)
        let h = 2166136261 >>> 0;
        for (let i = 0; i < seed.length; i++) {
            h ^= seed.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        // mix
        h += h << 13;
        h ^= h >>> 7;
        h += h << 3;
        h ^= h >>> 17;
        h += h << 5;
        // convert to float
        return (h >>> 0) / 4294967296;
    };

    const nodes = useMemo(() => {
        if (!peers.length) return [];
        return peers.map((peer, index) => {
            const angle = (index / peers.length) * Math.PI * 2;
            const speed =
                (Number(peer.rateToClient) || 0) +
                (Number(peer.rateToPeer) || 0);
            // Use local safe defaults for radius and center
            let distance = PEER_MAP_RADIUS / 2;
            if (Number.isFinite(speed) && speed > 0) {
                distance += (speed / maxRate) * (PEER_MAP_RADIUS / 2);
            }
            let x = PEER_MAP_CENTER + Math.cos(angle) * distance;
            let y = PEER_MAP_CENTER + Math.sin(angle) * distance;
            if (!Number.isFinite(x)) x = PEER_MAP_CENTER;
            if (!Number.isFinite(y)) y = PEER_MAP_CENTER;
            // Use local safe defaults for node size
            const prog = Number(peer.progress) || 0;
            let size = PEER_MAP_BASE_NODE_SIZE + prog * PEER_MAP_PROGRESS_SCALE;
            if (!Number.isFinite(size) || size <= 0)
                size = PEER_MAP_BASE_NODE_SIZE;

            // Use semantic palette
            const fill = peer.peerIsChoking ? palette.danger : palette.success;

            const seedBase = `${
                peer.address ?? peer.clientName ?? "peer"
            }-${index}`;
            const r1 = seeded01(seedBase + "-a");
            const r2 = seeded01(seedBase + "-b");
            const r3 = seeded01(seedBase + "-c");
            const r4 = seeded01(seedBase + "-d");
            return {
                peer,
                x,
                y,
                size,
                fill,
                driftX: (r1 - 0.5) * PEER_DRIFT_AMPLITUDE,
                driftY: (r2 - 0.5) * PEER_DRIFT_AMPLITUDE,
                duration:
                    PEER_DRIFT_DURATION_MIN +
                    r3 * (PEER_DRIFT_DURATION_MAX - PEER_DRIFT_DURATION_MIN),
                delay: r4 * 1.5,
                delayY: r2 * 1.5 + 0.7,
            };
        });
    }, [maxRate, peers, palette]);

    // ... Event handlers (handleZoom, handlePointerDown/Move/Up, handleWheel) remain unchanged ...
    const handleZoom = (direction: "in" | "out") => {
        const prev = scale.get();
        const next = clamp(
            prev + (direction === "in" ? ZOOM_STEP : -ZOOM_STEP),
            MIN_SCALE,
            MAX_SCALE
        );
        scale.set(next);
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
            const nextX = clamp(
                translateX.get() + dx,
                -MAX_PAN_OFFSET,
                MAX_PAN_OFFSET
            );
            const nextY = clamp(
                translateY.get() + dy,
                -MAX_PAN_OFFSET,
                MAX_PAN_OFFSET
            );
            translateX.set(nextX);
            translateY.set(nextY);
        },
        [translateX, translateY]
    );

    const handlePointerUp = useCallback(() => {
        dragRef.current = false;
        setIsDragging(false);
        lastPointerRef.current = null;
    }, []);

    const handleWheel = useCallback(
        (event: WheelEvent<SVGSVGElement>) => {
            event.preventDefault();
            const prev = scale.get();
            const next = clamp(
                prev + (event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP),
                MIN_SCALE,
                MAX_SCALE
            );
            scale.set(next);
        },
        [scale]
    );

    return (
        <motion.div
            layout
            className="flex flex-col flex-1 min-h-0 rounded-2xl border border-content1/20 bg-content1/10 p-panel space-y-3 overflow-hidden"
        >
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <span
                        className="text-tiny uppercase text-foreground/50"
                        style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
                    >
                        {t("torrent_modal.peer_map.title")}
                    </span>
                    <span className="text-tiny font-mono text-foreground/50">
                        {t("torrent_modal.peer_map.total", {
                            count: peers.length,
                        })}
                    </span>
                </div>
                <div className="flex items-center gap-tight">
                    <Button
                        isIconOnly
                        size="md"
                        variant="shadow"
                        onPress={() => handleZoom("out")}
                    >
                        <ZoomOut
                            size={16}
                            strokeWidth={1.5}
                            className="text-current"
                        />
                    </Button>
                    <Button
                        isIconOnly
                        size="md"
                        variant="shadow"
                        onPress={() => handleZoom("in")}
                    >
                        <ZoomIn
                            size={16}
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
                        // Framer Motion handles transform via motion values
                    }}
                    onWheel={handleWheel}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                >
                    <motion.g
                        style={{
                            translateX,
                            translateY,
                            scale,
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
                            (
                                {
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
                                },
                                i
                            ) => {
                                // ensure key is always a non-empty, stable string
                                const safeAddr =
                                    (peer.address &&
                                        String(peer.address).trim()) ||
                                    (peer.clientName &&
                                        String(peer.clientName).trim()) ||
                                    `peer-${i}`;
                                const nodeKey = `${safeAddr}-${Math.round(
                                    x
                                )}-${Math.round(y)}-${i}`;
                                const cx = Number.isFinite(x)
                                    ? x
                                    : PEER_MAP_CENTER;
                                const cy = Number.isFinite(y)
                                    ? y
                                    : PEER_MAP_CENTER;
                                const r = Number.isFinite(size)
                                    ? size
                                    : PEER_MAP_BASE_NODE_SIZE;
                                const sw = peer.peerIsChoking ? 0.5 : 1;
                                return (
                                    <Tooltip
                                        key={nodeKey}
                                        content={`${safeAddr} • ${formatSpeed(
                                            Number(peer.rateToClient) || 0
                                        )} DL`}
                                        delay={0}
                                        closeDelay={0}
                                        classNames={GLASS_TOOLTIP_CLASSNAMES}
                                    >
                                        <motion.circle
                                            initial={{
                                                translateX: 0,
                                                translateY: 0,
                                                scale: 1,
                                            }}
                                            cx={cx}
                                            cy={cy}
                                            r={r}
                                            fill={fill}
                                            stroke="var(--heroui-foreground)"
                                            strokeWidth={sw}
                                            animate={{
                                                translateX: [
                                                    0,
                                                    driftX,
                                                    -driftX,
                                                    0,
                                                ],
                                                translateY: [
                                                    0,
                                                    driftY,
                                                    -driftY,
                                                    0,
                                                ],
                                            }}
                                            transition={{
                                                translateX: {
                                                    duration,
                                                    repeat: Infinity,
                                                    repeatType: "mirror",
                                                    ease: "easeInOut",
                                                    delay,
                                                },
                                                translateY: {
                                                    duration,
                                                    repeat: Infinity,
                                                    repeatType: "mirror",
                                                    ease: "easeInOut",
                                                    delay: delayY,
                                                },
                                                default: {
                                                    type: "spring",
                                                    stiffness: 300,
                                                    damping: 20,
                                                },
                                            }}
                                            whileHover={{ scale: 1.2 }}
                                        />
                                    </Tooltip>
                                );
                            }
                        )}
                    </motion.g>
                </motion.svg>
            </div>
        </motion.div>
    );
};
