import { Button, Tooltip, cn } from "@heroui/react";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ZoomIn, ZoomOut } from "lucide-react";
import { TEXT_ROLE } from "@/config/textRoles";
import {
    buildHeatmapCanvasFrameClass,
    STANDARD_SURFACE_CLASS,
    HEATMAP_VIEW_CLASS,
} from "@/shared/ui/layout/glass-surface";
import {
    getAvailabilityColor,
    useCanvasPalette,
} from "@/modules/dashboard/hooks/utils/canvasUtils";
import {
    HEATMAP_CANVAS_CELL_GAP,
    HEATMAP_CANVAS_CELL_SIZE,
    HEATMAP_SAMPLE_LIMIT,
    HEATMAP_ZOOM_LEVELS,
    PIECE_COLUMNS,
    HEATMAP_SHADOW_BLUR_MAX,
    HEATMAP_HOVER_STROKE_WIDTH,
    HEATMAP_HOVER_STROKE_INSET,
    HEATMAP_USE_UI_SAMPLING_SHIM,
} from "@/config/logic";
import { useUiClock } from "@/shared/hooks/useUiClock";
import StatusIcon from "@/shared/ui/components/StatusIcon";

// Scheduling: the shared scheduler now drives `useUiClock()` so redraw cadence is centralized and documented.

interface AvailabilityHeatmapProps {
    pieceAvailability?: number[];
    label: string;
    legendRare: string;
    legendCommon: string;
    emptyLabel: string;
    formatTooltip: (piece: number, peers: number) => string;
}

type HeatmapHover = { gridIndex: number; pieceIndex: number; peers: number };

export const AvailabilityHeatmap = ({
    pieceAvailability,
    label,
    legendRare,
    legendCommon,
    emptyLabel,
    formatTooltip,
}: AvailabilityHeatmapProps) => {
    const palette = useCanvasPalette();
    const [zoomIndex, setZoomIndex] = useState(0);
    const [zoomPulseUntilTick, setZoomPulseUntilTick] = useState<number | null>(
        null
    );
    // Decoupled: visuals update only when pieceAvailability changes
    const availabilityList = useMemo(
        () => pieceAvailability ?? [],
        [pieceAvailability]
    );
    // UI clock for redraw cadence (independent of server updates)
    const { tick } = useUiClock();
    const hasAvailability = availabilityList.length > 0;

    const handleZoom = useCallback(
        (direction: "in" | "out") => {
            setZoomIndex((prev) => {
                const next =
                    direction === "in"
                        ? Math.min(HEATMAP_ZOOM_LEVELS.length - 1, prev + 1)
                        : Math.max(0, prev - 1);
                if (next === prev) {
                    return prev;
                }
                setZoomPulseUntilTick(tick + 1);
                return next;
            });
        },
        [tick]
    );
    const isZooming = zoomPulseUntilTick !== null && tick <= zoomPulseUntilTick;

    const zoomLevel = HEATMAP_ZOOM_LEVELS[zoomIndex] ?? 1;
    // Compatibility shim: sampling & decimation are performed client-side
    // until the engine/adapter provides an already-windowed availability list.
    // This behavior is controlled by `HEATMAP_USE_UI_SAMPLING_SHIM` so it can
    // be explicitly disabled once the engine takes ownership.
    const sampleLimit = Math.round(HEATMAP_SAMPLE_LIMIT * zoomLevel);
    const USE_UI_SAMPLING_SHIM = HEATMAP_USE_UI_SAMPLING_SHIM;
    if (!USE_UI_SAMPLING_SHIM) {
        // When the shim is disabled we assume the adapter supplied a prepared
        // `pieceAvailability` array sized to the heatmap window; clamp sampleLimit
        // conservatively to the available length.
    }
    const sampleCount = Math.min(availabilityList.length, sampleLimit);
    const sampledCells = useMemo(() => {
        const step =
            sampleCount > 1
                ? (availabilityList.length - 1) / (sampleCount - 1)
                : 1;
        return Array.from({ length: sampleCount }, (_, index) => {
            const pieceIndex = Math.min(
                availabilityList.length - 1,
                Math.round(index * step)
            );
            return {
                pieceIndex,
                value: availabilityList[pieceIndex] ?? 0,
            };
        });
    }, [availabilityList, sampleCount]);

    const maxPeers =
        availabilityList.reduce((max, count) => Math.max(max, count ?? 0), 0) ||
        1;
    const gridRows = Math.max(
        1,
        Math.ceil(sampledCells.length / PIECE_COLUMNS)
    );
    const totalCells = gridRows * PIECE_COLUMNS;
    const heatCells = useMemo(
        () =>
            Array.from(
                { length: totalCells },
                (_, index) => sampledCells[index] ?? null
            ),
        [sampledCells, totalCells]
    );

    const canvasWidth =
        PIECE_COLUMNS * HEATMAP_CANVAS_CELL_SIZE +
        (PIECE_COLUMNS - 1) * HEATMAP_CANVAS_CELL_GAP;
    const canvasHeight =
        gridRows * HEATMAP_CANVAS_CELL_SIZE +
        (gridRows - 1) * HEATMAP_CANVAS_CELL_GAP;
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [hoveredCell, setHoveredCell] = useState<HeatmapHover | null>(null);
    const cellPitch = HEATMAP_CANVAS_CELL_SIZE + HEATMAP_CANVAS_CELL_GAP;
    const stableHoveredCell = useMemo(() => {
        if (!hoveredCell) return null;
        const cell = heatCells[hoveredCell.gridIndex];
        if (!cell) return null;
        if (
            cell.pieceIndex !== hoveredCell.pieceIndex ||
            cell.value !== hoveredCell.peers
        ) {
            return null;
        }
        return hoveredCell;
    }, [heatCells, hoveredCell]);

    const drawHeatmap = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr =
            typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        canvas.width = canvasWidth * dpr;
        canvas.height = canvasHeight * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        heatCells.forEach((cell, index) => {
            const column = index % PIECE_COLUMNS;
            const row = Math.floor(index / PIECE_COLUMNS);
            const x = column * cellPitch;
            const y = row * cellPitch;
            ctx.save();
            if (cell) {
                const color = getAvailabilityColor(cell.value, maxPeers);
                ctx.fillStyle = color;
                if (cell.value > 0) {
                    ctx.shadowColor = color;
                    ctx.shadowBlur = Math.min(
                        HEATMAP_SHADOW_BLUR_MAX,
                        (cell.value / maxPeers) * HEATMAP_SHADOW_BLUR_MAX + 1
                    );
                }
            } else {
                ctx.fillStyle = palette.placeholder;
                ctx.shadowBlur = 0;
            }
            ctx.fillRect(
                x,
                y,
                HEATMAP_CANVAS_CELL_SIZE,
                HEATMAP_CANVAS_CELL_SIZE
            );
            if (stableHoveredCell?.gridIndex === index) {
                ctx.strokeStyle = palette.highlight;
                // Use configured hover stroke width and inset tokens
                ctx.lineWidth = HEATMAP_HOVER_STROKE_WIDTH;
                const inset = HEATMAP_HOVER_STROKE_INSET;
                const w = HEATMAP_CANVAS_CELL_SIZE - inset * 2;
                ctx.strokeRect(x + inset, y + inset, w, w);
            }
            ctx.restore();
        });
    }, [
        canvasHeight,
        canvasWidth,
        cellPitch,
        heatCells,
        stableHoveredCell,
        maxPeers,
        palette.highlight,
        palette.placeholder,
    ]);

    // Redraw on data or UI clock. Avoid per-component timers.
    useEffect(() => {
        drawHeatmap();
    }, [drawHeatmap, tick]);

    const handleHeatmapHover = useCallback(
        (event: MouseEvent<HTMLCanvasElement>) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const intrinsicX =
                ((event.clientX - rect.left) / rect.width) * canvasWidth;
            const intrinsicY =
                ((event.clientY - rect.top) / rect.height) * canvasHeight;
            const column = Math.floor(intrinsicX / cellPitch);
            const row = Math.floor(intrinsicY / cellPitch);
            if (
                column < 0 ||
                column >= PIECE_COLUMNS ||
                row < 0 ||
                row >= gridRows
            ) {
                setHoveredCell(null);
                return;
            }
            const gridIndex = row * PIECE_COLUMNS + column;
            const cell = heatCells[gridIndex];
            if (!cell) {
                setHoveredCell(null);
                return;
            }
            setHoveredCell({
                gridIndex,
                pieceIndex: cell.pieceIndex,
                peers: cell.value,
            });
        },
        [canvasWidth, canvasHeight, cellPitch, gridRows, heatCells]
    );

    const tooltipContent = stableHoveredCell
        ? formatTooltip(stableHoveredCell.pieceIndex + 1, stableHoveredCell.peers)
        : undefined;

    if (!hasAvailability) {
        return (
            <div className={cn(HEATMAP_VIEW_CLASS.empty, HEATMAP_VIEW_CLASS.emptyMuted)}>
                {emptyLabel}
            </div>
        );
    }

    return (
        <motion.div layout className={HEATMAP_VIEW_CLASS.root}>
            <div className={HEATMAP_VIEW_CLASS.header}>
                <span className={TEXT_ROLE.label} style={HEATMAP_VIEW_CLASS.labelTrackingStyle}>
                    {label}
                </span>
                <div className={cn(HEATMAP_VIEW_CLASS.legend, HEATMAP_VIEW_CLASS.legendMuted)}>
                    <span className={HEATMAP_VIEW_CLASS.legendItem}>
                        <span
                            className={cn(
                                HEATMAP_VIEW_CLASS.legendDot,
                                HEATMAP_VIEW_CLASS.legendDotRare,
                            )}
                        />
                        {legendRare}
                    </span>
                    <span className={HEATMAP_VIEW_CLASS.legendItem}>
                        <span
                            className={cn(
                                HEATMAP_VIEW_CLASS.legendDot,
                                HEATMAP_VIEW_CLASS.legendDotCommon,
                            )}
                        />
                        {legendCommon}
                    </span>
                </div>
                <div className={HEATMAP_VIEW_CLASS.controls}>
                    <Button
                        size="md"
                        variant="shadow"
                        color="default"
                        className={HEATMAP_VIEW_CLASS.zoomButton}
                        onPress={() => handleZoom("out")}
                        isDisabled={zoomIndex === 0}
                    >
                        <StatusIcon
                            Icon={ZoomOut}
                            size="sm"
                            className={HEATMAP_VIEW_CLASS.zoomIcon}
                        />
                    </Button>
                    <span className={HEATMAP_VIEW_CLASS.zoomValue}>
                        x{zoomLevel.toFixed(1)}
                    </span>
                    <Button
                        size="md"
                        variant="shadow"
                        color="default"
                        className={HEATMAP_VIEW_CLASS.zoomButton}
                        onPress={() => handleZoom("in")}
                        isDisabled={
                            zoomIndex === HEATMAP_ZOOM_LEVELS.length - 1
                        }
                    >
                        <StatusIcon
                            Icon={ZoomIn}
                            size="sm"
                            className={HEATMAP_VIEW_CLASS.zoomIcon}
                        />
                    </Button>
                </div>
            </div>
            <div
                className={buildHeatmapCanvasFrameClass(isZooming)}
            >
                <Tooltip
                    content={tooltipContent}
                    delay={0}
                    closeDelay={0}
                    classNames={STANDARD_SURFACE_CLASS.tooltip}
                    isDisabled={!stableHoveredCell}
                >
                    <canvas
                        ref={canvasRef}
                        width={canvasWidth}
                        height={canvasHeight}
                        className={HEATMAP_VIEW_CLASS.canvas}
                        onMouseMove={handleHeatmapHover}
                        onMouseLeave={() => setHoveredCell(null)}
                    />
                </Tooltip>
            </div>
        </motion.div>
    );
};
