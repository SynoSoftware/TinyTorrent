import { motion, type Transition } from "framer-motion";
import { cn } from "@heroui/react";

import {
    buildSplinePathFromPoints,
    createSplinePoints,
} from "../../utils/spline";
import { INTERACTION_CONFIG } from "../../../config/interaction";

const { networkGraph } = INTERACTION_CONFIG;
const GRAPH_WIDTH = networkGraph.width;
const GRAPH_HEIGHT = networkGraph.height;
const BASELINE_Y = GRAPH_HEIGHT - 0.5;

interface NetworkGraphProps {
    data: number[];
    color: string;
    className?: string;
}

export const NetworkGraph = ({
    data,
    color,
    className,
}: NetworkGraphProps) => {
    const normalizedData = data.length ? data : [0];
    const maxValue = Math.max(...normalizedData, 1);
    const points = createSplinePoints(
        normalizedData,
        GRAPH_WIDTH,
        GRAPH_HEIGHT,
        maxValue
    );
    const linePath = buildSplinePathFromPoints(points);
    const safeLinePath =
        linePath || `M0,${GRAPH_HEIGHT} L${GRAPH_WIDTH},${GRAPH_HEIGHT}`;
    const areaPath =
        points.length > 0
            ? `${safeLinePath} L${points[points.length - 1].x.toFixed(2)},${GRAPH_HEIGHT} L${points[0].x.toFixed(2)},${GRAPH_HEIGHT} Z`
            : `${safeLinePath} L${GRAPH_WIDTH},${GRAPH_HEIGHT} L0,${GRAPH_HEIGHT} Z`;

    const areaTransition: Transition = {
        type: "spring",
        stiffness: 160,
        damping: 30,
    };
    const lineTransition: Transition = {
        type: "spring",
        stiffness: 190,
        damping: 26,
    };

    return (
        <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
            preserveAspectRatio="none"
            className={cn("overflow-visible", className)}
        >
            <line
                x1={0}
                y1={BASELINE_Y}
                x2={GRAPH_WIDTH}
                y2={BASELINE_Y}
                stroke="currentColor"
                strokeWidth={1}
                className="opacity-10"
            />
            {data.every((value) => value === 0) && (
                <line
                    x1={0}
                    y1={BASELINE_Y}
                    x2={GRAPH_WIDTH}
                    y2={BASELINE_Y}
                    stroke="currentColor"
                    strokeWidth={2}
                    className={cn(
                        "opacity-60",
                        color === "success" ? "text-success" : "text-primary"
                    )}
                />
            )}
            <defs>
                <filter
                    id={`glow-${color}`}
                    x="-20%"
                    y="-20%"
                    width="140%"
                    height="140%"
                >
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite
                        in="SourceGraphic"
                        in2="blur"
                        operator="over"
                    />
                </filter>
                <linearGradient
                    id={`grad-${color}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                >
                    <stop
                        offset="0%"
                        stopColor="currentColor"
                        stopOpacity="0.5"
                    />
                    <stop
                        offset="100%"
                        stopColor="currentColor"
                        stopOpacity="0"
                    />
                </linearGradient>
            </defs>
            <motion.path
                d={areaPath}
                className={cn(
                    "opacity-20",
                    color === "success" ? "text-success" : "text-primary"
                )}
                fill={`url(#grad-${color})`}
                animate={{ d: areaPath }}
                transition={areaTransition}
            />
            <motion.path
                d={safeLinePath}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                    color === "success" ? "text-success" : "text-primary"
                )}
                filter={`url(#glow-${color})`}
                animate={{ d: safeLinePath }}
                transition={lineTransition}
            />
        </svg>
    );
};
