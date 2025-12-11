import { Button, Tooltip, cn } from "@heroui/react";
import type { PointerEvent, WheelEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ZoomIn, ZoomOut } from "lucide-react";
import { GLASS_TOOLTIP_CLASSNAMES } from "../../../modules/dashboard/components/details/visualizations/constants";
import { clamp, useCanvasPalette } from "../../../modules/dashboard/components/details/visualizations/canvasUtils";
import { PEER_MAP_CONFIG } from "../../../config/logic";
import { formatSpeed } from "../../utils/format";
import type { TorrentPeerEntity } from "../../../services/rpc/entities";

const PEER_DRIFT_AMPLITUDE = PEER_MAP_CONFIG.drift_amplitude;
const PEER_DRIFT_DURATION_MIN = PEER_MAP_CONFIG.drift_duration.min;
const PEER_DRIFT_DURATION_MAX = PEER_MAP_CONFIG.drift_duration.max;

interface PeerMapProps {
    peers: TorrentPeerEntity[];
}

export const PeerMap = ({ peers }: PeerMapProps) => {
    const { t } = useTranslation();
    const palette = useCanvasPalette();
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

    const nodes = useMemo(() => {
        if (!peers.length) return [];
        const radius = 70;
        const center = 90;
        return peers.map((peer, index) => {
            const angle = (index / peers.length) * Math.PI * 2;
            const speed = peer.rateToClient + peer.rateToPeer;
            const distance = 30 + (speed / maxRate) * 40;
            const x = center + Math.cos(angle) * distance;
            const y = center + Math.sin(angle) * distance;
            const size = 6 + (peer.progress ?? 0) * 12;

            // Use semantic palette
            const fill = peer.peerIsChoking ? palette.danger : palette.success;

            return {
                peer,
                x,
                y,
                size,
                fill,
                driftX: (Math.random() - 0.5) * PEER_DRIFT_AMPLITUDE,
                driftY: (Math.random() - 0.5) * PEER_DRIFT_AMPLITUDE,
                duration:
                    PEER_DRIFT_DURATION_MIN +
                    Math.random() *
                        (PEER_DRIFT_DURATION_MAX - PEER_DRIFT_DURATION_MIN),
                delay: Math.random() * 1.5,
                delayY: Math.random() * 1.5 + 0.7,
            };
        });
    }, [maxRate, peers, palette]);

    // ... Event handlers (handleZoom, handlePointerDown/Move/Up, handleWheel) remain unchanged ...
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
            className="flex flex-col flex-1 min-h-[320px] rounded-2xl border border-content1/20 bg-content1/10 p-4 space-y-3 overflow-hidden"
        >
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-tiny uppercase tracking-[0.3em] text-foreground/50">
                        {t("torrent_modal.peer_map.title")}
                    </span>
                    <span className="text-tiny font-mono text-foreground/50">
                        {t("torrent_modal.peer_map.total", {
                            count: peers.length,
                        })}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        isIconOnly
                        size="sm"
                        variant="flat"
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
                        size="sm"
                        variant="flat"
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
                        transform: `scale(${scale})`,
                        transformOrigin: "center",
                    }}
                    onWheel={handleWheel}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                >
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
                                driftX,
                                driftY,
                                duration,
                                delay,
                                delayY,
                            }) => (
                                <Tooltip
                                    key={`${peer.address}-${x}-${y}`}
                                    content={`${peer.address} • ${formatSpeed(
                                        peer.rateToClient
                                    )} DL`}
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
                                        animate={{
                                            translateX: [0, driftX, -driftX, 0],
                                            translateY: [0, driftY, -driftY, 0],
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
                            )
                        )}
                    </motion.g>
                </motion.svg>
            </div>
        </motion.div>
    );
};
