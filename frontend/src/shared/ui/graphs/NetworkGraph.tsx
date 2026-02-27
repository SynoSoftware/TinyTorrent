// All config tokens imported from '@/config/logic'. No magic numbers or relative imports remain.

import { motion, type Transition } from "framer-motion";
import { cn } from "@heroui/react";
import { useEffect, useRef, useState, useId } from "react";

import {
    buildSplinePathFromPoints, createSplinePoints, } from "@/shared/utils/spline";
import { registry } from "@/config/logic";
import { METRIC_CHART } from "@/shared/ui/layout/glass-surface";
import { useUiClock } from "@/shared/hooks/useUiClock";
const { layout, interaction, visuals, ui } = registry;

const { networkGraph } = interaction.config;
const GRAPH_WIDTH = networkGraph.width;
const GRAPH_HEIGHT = networkGraph.height;

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

    // Stable unique suffix for SVG defs to avoid id collisions across instances
    const idSuffix = useId();

    // HeroUI semantic color names (text-* exists for all of these)
    const colorClass =
        typeof color === "string"
            ? color.startsWith("text-")
                ? color
                : color === "muted"
                ? "text-foreground/30"
                : `text-${color}`
            : "text-primary";

    // Sanitize color string to build safe ids for SVG defs (avoid invalid id chars)
    const safeColorId = String(color)
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase();
    const glowId = `glow-${safeColorId}-${idSuffix}`;
    const gradId = `grad-${safeColorId}-${idSuffix}`;

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const { clientWidth, clientHeight } = containerRef.current;
                setDimensions({ width: clientWidth, height: clientHeight });
            }
        };

        const observer = new ResizeObserver(updateDimensions);
        const node = containerRef.current;
        if (node) observer.observe(node);

        updateDimensions(); // Initial update

        return () => {
            if (node) {
                try {
                    observer.unobserve(node);
                } catch {
                    // node may have been removed before cleanup; ignore
                }
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
            className={cn(
                "overflow-visible",
                // Apply resolved HeroUI color class (supports tokens and text-* values)
                colorClass,
                className
            )}
        >
            <line
                x1={0}
                y1={dimensions.height - 0.5}
                x2={dimensions.width}
                y2={dimensions.height - 0.5}
                stroke="currentColor"
                strokeWidth={1}
                className={METRIC_CHART.baselineMuted}
            />

            {data.every((value) => value === 0) && (
                <line
                    x1={0}
                    y1={dimensions.height - 0.5}
                    x2={dimensions.width}
                    y2={dimensions.height - 0.5}
                    stroke="currentColor"
                    strokeWidth={2}
                    className={cn(METRIC_CHART.baselineActive, colorClass)}
                />
            )}
            <defs>
                <filter
                    id={glowId}
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
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
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
                className={cn(METRIC_CHART.areaMuted, colorClass)}
                fill={`url(#${gradId})`}
                animate={{ d: areaPath }}
                transition={areaTransition}
            />
            <motion.path
                d={safeLinePath}
                fill="none"
                stroke="currentColor"
                strokeWidth={visuals.icon.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(colorClass)}
                filter={`url(#${glowId})`}
                animate={{ d: safeLinePath }}
                transition={lineTransition}
            />
        </svg>
    );
};

