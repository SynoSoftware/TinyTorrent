// All config tokens imported from '@/config/logic'. No magic numbers or relative imports remain.

import { cn } from "@heroui/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { buildSplinePathFromPoints, createSplinePoints } from "@/shared/utils/spline";
import { registry } from "@/config/logic";
import { metricChart } from "@/shared/ui/layout/glass-surface";
const { interaction, visuals } = registry;

const { networkGraph } = interaction.config;
const GRAPH_WIDTH = networkGraph.width;
const GRAPH_HEIGHT = networkGraph.height;

interface NetworkGraphProps {
    data: number[];
    color: string;
    className?: string;
    maxValue?: number;
}

export const NetworkGraph = ({ data, color, className, maxValue }: NetworkGraphProps) => {
    const containerRef = useRef<SVGSVGElement>(null);
    const [dimensions, setDimensions] = useState({
        width: GRAPH_WIDTH,
        height: GRAPH_HEIGHT,
    });
    const idSuffix = useId();

    const colorClass = color.startsWith("text-")
        ? color
        : color === "muted"
          ? metricChart.graphToneMuted
          : `text-${color}`;

    const safeColorId = String(color)
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase();
    const glowId = `glow-${safeColorId}-${idSuffix}`;
    const gradId = `grad-${safeColorId}-${idSuffix}`;
    const fadeMaskId = `fade-mask-${safeColorId}-${idSuffix}`;
    const fadeGradientId = `fade-gradient-${safeColorId}-${idSuffix}`;

    const normalizedData = useMemo(() => (data.length ? data : [0]), [data]);
    const resolvedMaxValue = useMemo(() => Math.max(maxValue ?? 0, ...normalizedData, 1), [maxValue, normalizedData]);

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
                current.width === width && current.height === height ? current : { width, height },
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
        () => createSplinePoints(normalizedData, dimensions.width, dimensions.height, resolvedMaxValue),
        [dimensions.height, dimensions.width, normalizedData, resolvedMaxValue],
    );
    const safeLinePath = useMemo(() => {
        const linePath = buildSplinePathFromPoints(points);
        return linePath || `M0,${dimensions.height} L${dimensions.width},${dimensions.height}`;
    }, [dimensions.height, dimensions.width, points]);
    const areaPath = useMemo(() => {
        if (points.length > 0) {
            return `${safeLinePath} L${points[points.length - 1].x.toFixed(2)},${dimensions.height} L${points[0].x.toFixed(2)},${dimensions.height} Z`;
        }
        return `${safeLinePath} L${dimensions.width},${dimensions.height} L0,${dimensions.height} Z`;
    }, [dimensions.height, dimensions.width, points, safeLinePath]);
    const maskCornerRadius = useMemo(() => dimensions.height * metricChart.maskCornerRadiusRatio, [dimensions.height]);

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
                className,
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
                className={metricChart.baselineMuted}
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
                    className={cn(metricChart.baselineActive, colorClass)}
                />
            )}
            <defs>
                <filter
                    id={glowId}
                    x={metricChart.glowFilterRegion.x}
                    y={metricChart.glowFilterRegion.y}
                    width={metricChart.glowFilterRegion.width}
                    height={metricChart.glowFilterRegion.height}
                >
                    <feGaussianBlur stdDeviation={metricChart.glowBlurStdDeviation} result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    {metricChart.areaGradientStops.map((stop) => (
                        <stop
                            key={`area-stop-${stop.offset}`}
                            offset={stop.offset}
                            stopColor="currentColor"
                            stopOpacity={stop.opacity}
                        />
                    ))}
                </linearGradient>
                <linearGradient id={fadeGradientId} x1="0" y1="0" x2="1" y2="0">
                    {metricChart.fillFadeStops.map((stop) => (
                        <stop
                            key={`fade-stop-${stop.offset}`}
                            offset={stop.offset}
                            stopColor="white"
                            stopOpacity={stop.opacity}
                        />
                    ))}
                </linearGradient>
                <mask
                    id={fadeMaskId}
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                    x={0}
                    y={0}
                    width={dimensions.width}
                    height={dimensions.height}
                >
                    <rect
                        x="0"
                        y="0"
                        width={dimensions.width}
                        height={dimensions.height}
                        rx={maskCornerRadius}
                        ry={maskCornerRadius}
                        fill={`url(#${fadeGradientId})`}
                    />
                </mask>
            </defs>
            <path
                d={areaPath}
                className={cn(metricChart.areaMuted, colorClass)}
                fill={`url(#${gradId})`}
                mask={`url(#${fadeMaskId})`}
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
