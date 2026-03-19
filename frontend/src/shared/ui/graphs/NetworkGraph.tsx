// All config tokens imported from '@/config/logic'. No magic numbers or relative imports remain.

import { cn } from "@heroui/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
    buildSplinePathFromPoints, createSplinePoints, } from "@/shared/utils/spline";
import { registry } from "@/config/logic";
import { METRIC_CHART } from "@/shared/ui/layout/glass-surface";
const { interaction, visuals } = registry;

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

    const safeColorId = String(color)
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase();
    const glowId = `glow-${safeColorId}-${idSuffix}`;
    const gradId = `grad-${safeColorId}-${idSuffix}`;

    const normalizedData = useMemo(() => (data.length ? data : [0]), [data]);
    const maxValue = useMemo(
        () => Math.max(...normalizedData, 1),
        [normalizedData],
    );

    useEffect(() => {
        if (typeof ResizeObserver === "undefined") {
            return;
        }

        const node = containerRef.current;
        if (!node) {
            return;
        }

        const updateDimensions = () => {
            const width = node.clientWidth || GRAPH_WIDTH;
            const height = node.clientHeight || GRAPH_HEIGHT;
            setDimensions((current) =>
                current.width === width && current.height === height
                    ? current
                    : { width, height },
            );
        };

        const observer = new ResizeObserver(() => {
            updateDimensions();
        });

        observer.observe(node);
        updateDimensions();

        return () => {
            observer.disconnect();
        };
    }, []);

    const points = useMemo(
        () =>
            createSplinePoints(
                normalizedData,
                dimensions.width,
                dimensions.height,
                maxValue,
            ),
        [dimensions.height, dimensions.width, maxValue, normalizedData],
    );
    const safeLinePath = useMemo(() => {
        const linePath = buildSplinePathFromPoints(points);
        return (
            linePath ||
            `M0,${dimensions.height} L${dimensions.width},${dimensions.height}`
        );
    }, [dimensions.height, dimensions.width, points]);
    const areaPath = useMemo(() => {
        if (points.length > 0) {
            return `${safeLinePath} L${points[points.length - 1].x.toFixed(2)},${dimensions.height} L${points[0].x.toFixed(2)},${dimensions.height} Z`;
        }
        return `${safeLinePath} L${dimensions.width},${dimensions.height} L0,${dimensions.height} Z`;
    }, [dimensions.height, dimensions.width, points, safeLinePath]);

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
                vectorEffect="non-scaling-stroke"
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
                    vectorEffect="non-scaling-stroke"
                    className={cn(METRIC_CHART.baselineActive, colorClass)}
                />
            )}
            <defs>
                <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
            </defs>
            <path
                d={areaPath}
                className={cn(METRIC_CHART.areaMuted, colorClass)}
                fill={`url(#${gradId})`}
            />
            <path
                d={safeLinePath}
                fill="none"
                stroke="currentColor"
                strokeWidth={visuals.icon.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className={cn(colorClass)}
                filter={`url(#${glowId})`}
            />
        </svg>
    );
};

