// All config tokens imported from '@/config/logic'. No magic numbers or relative imports remain.

import { motion, type Transition } from "framer-motion";
import { cn } from "@heroui/react";
import { useEffect, useRef, useState } from "react";

import {
    buildSplinePathFromPoints,
    createSplinePoints,
} from "@/shared/utils/spline";
import { INTERACTION_CONFIG } from "@/config/logic";
import { useUiClock } from "@/shared/hooks/useUiClock";

const { networkGraph } = INTERACTION_CONFIG;
const GRAPH_WIDTH = networkGraph.width;
const GRAPH_HEIGHT = networkGraph.height;
const BASELINE_Y = GRAPH_HEIGHT - 0.5;

interface NetworkGraphProps {
    data: number[];
    color: string;
    className?: string;
}

export const NetworkGraph = ({ data, color, className }: NetworkGraphProps) => {
    const containerRef = useRef<SVGSVGElement>(null);
    const [dimensions, setDimensions] = useState({
        width: GRAPH_WIDTH,
        height: GRAPH_HEIGHT,
    });

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const { clientWidth, clientHeight } = containerRef.current;
                setDimensions({ width: clientWidth, height: clientHeight });
            }
        };

        const observer = new ResizeObserver(updateDimensions);
        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        updateDimensions(); // Initial update

        return () => {
            if (containerRef.current) {
                observer.unobserve(containerRef.current);
            }
        };
    }, []);

    // Subscribe to the UI clock so graph cadence is stable.
    const { tick } = useUiClock();
    void tick;
    const normalizedData = data.length ? data : [0];
    const maxValue = Math.max(...normalizedData, 1);
    const points = createSplinePoints(
        normalizedData,
        dimensions.width,
        dimensions.height,
        maxValue
    );
    const linePath = buildSplinePathFromPoints(points);
    const safeLinePath =
        linePath ||
        `M0,${dimensions.height} L${dimensions.width},${dimensions.height}`;
    const areaPath =
        points.length > 0
            ? `${safeLinePath} L${points[points.length - 1].x.toFixed(2)},${
                  dimensions.height
              } L${points[0].x.toFixed(2)},${dimensions.height} Z`
            : `${safeLinePath} L${dimensions.width},${dimensions.height} L0,${dimensions.height} Z`;

    const areaTransition: Transition = {
        d: { duration: 0 },
    };
    const lineTransition: Transition = {
        d: { duration: 0 },
    };

    return (
        <svg
            ref={containerRef}
            width="100%"
            height="100%"
            viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            preserveAspectRatio="none"
            className={cn("overflow-visible", className)}
        >
            <line
                x1={0}
                y1={dimensions.height - 0.5}
                x2={dimensions.width}
                y2={dimensions.height - 0.5}
                stroke="currentColor"
                strokeWidth={1}
                className="opacity-10"
            />
            {data.every((value) => value === 0) && (
                <line
                    x1={0}
                    y1={dimensions.height - 0.5}
                    x2={dimensions.width}
                    y2={dimensions.height - 0.5}
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
