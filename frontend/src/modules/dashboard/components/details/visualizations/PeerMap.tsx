import { Tooltip, cn } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Activity, Compass } from "lucide-react";
import { GLASS_TOOLTIP_CLASSNAMES } from "./constants";
import { useCanvasPalette } from "./canvasUtils";
import { DETAILS_PEER_MAP_CONFIG, INTERACTION_CONFIG } from "@/config/logic";
import { formatSpeed } from "@/shared/utils/format";
import { useUiClock } from "@/shared/hooks/useUiClock";
import type { TorrentPeerEntity } from "@/services/rpc/entities";
import StatusIcon from "@/shared/ui/components/StatusIcon";

// SPD PHYSICS SCHEMA (Zero-Inline Policy)
const SPD_PHYSICS = {
    DECAY_MS: 5000,
    MIN_MAX_RATE: 1024,
    PROGRESS_WARP: 1.5,
    ORBIT_ARC: 1.95,
    VELOCITY_THRESHOLD: 0.8,
    WHEEL_SENSITIVITY: 0.001,
    APERTURE_LIMITS: { MIN: 0.1, MAX: 5.0 },
    VECTOR_SCALAR: 4,
    ENCRYPTION_OFFSET: 2.5,
    RELEVANCE_THRESHOLD: 0.5,
} as const;

type SwarmMode = "impression" | "instrument";

interface PeerMapProps {
    peers: TorrentPeerEntity[];
    hoveredPeerId?: string | null;
    onHover?: (id: string | null) => void;
    torrentProgress?: number;
}

/**
 * PeerMap: Swarm Polar Diagnostic (SPD) v1.3 [DEFINITIVE]
 *
 * An attention-aware instrument for swarm diagnosis.
 * Compliant with AGENTS.md | No-New-Numbers | Workbench Model
 */
export const PeerMap = ({
    peers,
    hoveredPeerId,
    onHover,
    torrentProgress = 0,
}: PeerMapProps) => {
    const { t } = useTranslation();
    const palette = useCanvasPalette();
    const [mode, setMode] = useState<SwarmMode>("impression");
    const [radialAperture, setRadialAperture] = useState(1.0);
    const lastInteractionRef = useRef<number>(Date.now());
    const { tick } = useUiClock();

    const {
        center: C,
        radius: R_MAX,
        base_node_size: MIN_S,
        progress_scale: S_SCALE,
    } = DETAILS_PEER_MAP_CONFIG.layout;
    const VIEWBOX = C * 2;

    // 1. Attention & Decay Engine
    const registerActivity = useCallback(() => {
        lastInteractionRef.current = Date.now();
        if (mode !== "instrument") setMode("instrument");
    }, [mode]);

    // UI-clock driven: drop into impression mode once the swarm is idle.
    useEffect(() => {
        const isIdle =
            Date.now() - lastInteractionRef.current > SPD_PHYSICS.DECAY_MS;
        if (isIdle && !hoveredPeerId) {
            setMode("impression");
        }
    }, [hoveredPeerId, tick]);

    // 2. Swarm Intelligence Metrics
    const swarmStats = useMemo(() => {
        const sums = peers.map((p) => {
            const dl = Number.isFinite(Number(p.rateToClient))
                ? Number(p.rateToClient)
                : 0;
            const ul = Number.isFinite(Number(p.rateToPeer))
                ? Number(p.rateToPeer)
                : 0;
            return dl + ul;
        });
        const max = Math.max(...sums, 1, SPD_PHYSICS.MIN_MAX_RATE);
        const helping = peers.filter((p) => {
            const dl = Number.isFinite(Number(p.rateToClient))
                ? Number(p.rateToClient)
                : 0;
            return dl > 0;
        }).length;
        const hurting = peers.filter(
            (p) => p.peerIsChoking && p.clientIsInterested
        ).length;
        const healthScore =
            peers.length > 0 ? (helping - hurting) / peers.length : 0;
        return { max, healthScore };
    }, [peers]);

    const getPeerIdentitySeed = (id: string) => {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < id.length; i++) {
            h ^= id.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return (h >>> 0) / 4294967296;
    };

    // 3. Polar Projection Logic
    const nodes = useMemo(() => {
        const isInstrument = mode === "instrument";
        const effectiveMax = Math.max(1, swarmStats.max) * radialAperture;
        const isLocalIncomplete = torrentProgress < 1;

        return peers.map((peer) => {
            const dl = Number.isFinite(Number(peer.rateToClient))
                ? Number(peer.rateToClient)
                : 0;
            const ul = Number.isFinite(Number(peer.rateToPeer))
                ? Number(peer.rateToPeer)
                : 0;

            // r (Radius): Log-Inverted Normalized Speed (Centralized Relevance)
            const logNorm = Math.log(dl + ul + 1) / Math.log(effectiveMax + 1);
            const r = R_MAX * (1 - Math.min(logNorm, 1));

            // theta (Angle): Morph between Personality-Hash and Warped-Progress
            const warpedProgress = Math.pow(
                peer.progress || 0,
                SPD_PHYSICS.PROGRESS_WARP
            );
            const seedSource =
                (peer.address && String(peer.address).trim()) ||
                (peer.clientName && String(peer.clientName).trim()) ||
                "";
            const thetaImpression =
                getPeerIdentitySeed(seedSource) * Math.PI * 2;

            const thetaInstrument =
                warpedProgress * Math.PI * SPD_PHYSICS.ORBIT_ARC - Math.PI / 2;
            const theta = isInstrument ? thetaInstrument : thetaImpression;

            // Health Strategy: Priority Logic [Hostility > Flow > Status]
            let color = palette.placeholder;
            if ((peer.progress || 0) >= 1) color = palette.success; // Seeder
            if (dl > 0) color = palette.primary; // Active flow
            if (
                isLocalIncomplete &&
                peer.peerIsChoking &&
                peer.clientIsInterested
            ) {
                color = palette.danger; // Hostility Override
            }

            const netFlow = dl - ul;
            const vectorMag =
                Math.sign(netFlow) * (Math.log(Math.abs(netFlow) + 1) / 2);

            return {
                peer,
                id:
                    (peer.address && String(peer.address).trim()) ||
                    (peer.clientName && String(peer.clientName).trim()) ||
                    `peer-${Math.floor(getPeerIdentitySeed(seedSource) * 1e9)}`,
                x: C + Math.cos(theta) * r,
                y: C + Math.sin(theta) * r,
                theta,
                r_dist: r,
                size: MIN_S + (peer.progress || 0) * S_SCALE,
                color,
                vectorMag,
                isUTP:
                    (peer.flagStr || "").includes("P") ||
                    (peer.flagStr || "").includes("u"),
                isEncrypted:
                    (peer.flagStr || "").includes("E") ||
                    (peer.flagStr || "").includes("X"),
                isInstrument,
            };
        });
    }, [
        peers,
        mode,
        swarmStats.max,
        radialAperture,
        palette,
        C,
        R_MAX,
        MIN_S,
        S_SCALE,
        torrentProgress,
    ]);

    const handleWheel = (e: React.WheelEvent) => {
        registerActivity();
        setRadialAperture((prev) => {
            const next = prev + e.deltaY * SPD_PHYSICS.WHEEL_SENSITIVITY;
            return Math.min(
                Math.max(next, SPD_PHYSICS.APERTURE_LIMITS.MIN),
                SPD_PHYSICS.APERTURE_LIMITS.MAX
            );
        });
    };

    return (
        <div
            className="flex flex-col flex-1 rounded-2xl border border-content1/20 bg-content1/5 p-panel space-y-3 overflow-hidden relative"
            onPointerDown={registerActivity}
            onMouseMove={registerActivity}
        >
            <div className="flex items-center justify-between z-20 pointer-events-none">
                <div className="flex flex-col">
                    <span className="text-label font-black uppercase text-foreground/30 tracking-0-4">
                        {mode === "instrument"
                            ? t("peers.diagnostic_radar")
                            : t("peers.swarm_pulse")}
                    </span>
                    <div className="flex items-center gap-tools">
                        <StatusIcon
                            Icon={Activity}
                            size="sm"
                            className={cn(
                                "transition-opacity",
                                mode === "instrument"
                                    ? "opacity-100 text-primary"
                                    : "opacity-0"
                            )}
                        />
                        <span className="text-scaled font-mono text-foreground/40">
                            {peers.length} NODES
                        </span>
                    </div>
                </div>
                <AnimatePresence>
                    {mode === "instrument" && (
                        <motion.div
                            initial={{ opacity: 0, x: 5 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex gap-tools items-center"
                        >
                            <span className="text-label font-mono text-foreground/40 uppercase">
                                Aperture:{" "}
                                {formatSpeed(swarmStats.max * radialAperture)}
                            </span>
                            <StatusIcon
                                Icon={Compass}
                                size="sm"
                                className="text-primary/50"
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="flex-1 min-h-0 relative">
                <svg
                    viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
                    className="w-full h-full cursor-crosshair overflow-visible"
                    onWheel={handleWheel}
                >
                    <circle
                        cx={C}
                        cy={C}
                        r={R_MAX}
                        fill="none"
                        stroke={
                            swarmStats.healthScore > 0
                                ? palette.success
                                : palette.warning
                        }
                        strokeWidth={2}
                        className="opacity-03 transition-colors duration-1000"
                    />

                    <AnimatePresence>
                        {mode === "instrument" && (
                            <motion.g
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="pointer-events-none"
                            >
                                {[0.2, 0.4, 0.6, 0.8, 1.0].map((lvl) => (
                                    <circle
                                        key={lvl}
                                        cx={C}
                                        cy={C}
                                        r={R_MAX * lvl}
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={0.2}
                                        className="text-foreground/5"
                                        strokeDasharray="1 4"
                                    />
                                ))}
                                {[0, 0.25, 0.5, 0.75].map((p) => {
                                    const ang = p * Math.PI * 2 - Math.PI / 2;
                                    return (
                                        <line
                                            key={p}
                                            x1={C}
                                            y1={C}
                                            x2={C + Math.cos(ang) * R_MAX}
                                            y2={C + Math.sin(ang) * R_MAX}
                                            stroke="currentColor"
                                            strokeWidth={0.2}
                                            className="text-foreground/10"
                                        />
                                    );
                                })}
                            </motion.g>
                        )}
                    </AnimatePresence>

                    <g>
                        {nodes.map((node, i) => {
                            const isFocus = hoveredPeerId === node.id;
                            const safeId =
                                (node.id && String(node.id).trim()) ||
                                `peer-${i}`;
                            const layoutId = `peer-${safeId}`;
                            const initialCx = Number.isFinite(node.x)
                                ? node.x
                                : 0;
                            const initialCy = Number.isFinite(node.y)
                                ? node.y
                                : 0;
                            const initialR = Number.isFinite(node.size)
                                ? node.size
                                : 1;
                            const initialSw = node.isInstrument
                                ? node.isUTP
                                    ? 1.5
                                    : 0.5
                                : 0;

                            return (
                                <Tooltip
                                    key={safeId}
                                    content={`${
                                        node.peer.address
                                    } • ${formatSpeed(
                                        node.peer.rateToClient
                                    )} DL`}
                                    isDisabled={mode === "impression"}
                                    classNames={GLASS_TOOLTIP_CLASSNAMES}
                                >
                                    <g
                                        onMouseEnter={() => onHover?.(node.id)}
                                        onMouseLeave={() => onHover?.(null)}
                                    >
                                        {node.isInstrument && isFocus && (
                                            <motion.line
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 0.6 }}
                                                x1={node.x}
                                                y1={node.y}
                                                x2={
                                                    node.x +
                                                    Math.cos(node.theta) *
                                                        node.vectorMag *
                                                        SPD_PHYSICS.VECTOR_SCALAR
                                                }
                                                y2={
                                                    node.y +
                                                    Math.sin(node.theta) *
                                                        node.vectorMag *
                                                        SPD_PHYSICS.VECTOR_SCALAR
                                                }
                                                stroke={node.color}
                                                strokeWidth={1.5}
                                            />
                                        )}

                                        <motion.circle
                                            layoutId={layoutId}
                                            initial={{
                                                cx: initialCx,
                                                cy: initialCy,
                                                r: initialR,
                                                strokeWidth: initialSw,
                                            }}
                                            animate={{
                                                cx: node.x,
                                                cy: node.y,
                                                r: isFocus
                                                    ? node.size * 1.4
                                                    : node.size,
                                                fill: node.color,
                                                strokeWidth: node.isInstrument
                                                    ? node.isUTP
                                                        ? 1.5
                                                        : 0.5
                                                    : 0,
                                            }}
                                            transition={{
                                                type: "spring",
                                                stiffness: 220,
                                                damping: 24,
                                            }}
                                            stroke={palette.foreground}
                                            className={cn(
                                                "transition-all",
                                                node.isUTP &&
                                                    "drop-shadow-primary-small"
                                            )}
                                        />

                                        {node.isInstrument &&
                                            node.isEncrypted && (
                                                <circle
                                                    cx={node.x}
                                                    cy={node.y}
                                                    r={
                                                        node.size +
                                                        SPD_PHYSICS.ENCRYPTION_OFFSET
                                                    }
                                                    fill="none"
                                                    stroke={node.color}
                                                    strokeWidth={0.2}
                                                    opacity={0.4}
                                                />
                                            )}
                                    </g>
                                </Tooltip>
                            );
                        })}
                    </g>
                </svg>
            </div>
        </div>
    );
};
