import { Button, Tooltip, cn } from "@heroui/react";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ZoomIn, ZoomOut } from "lucide-react";
import { GLASS_TOOLTIP_CLASSNAMES } from "@/modules/dashboard/hooks/utils/constants";
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
    HEATMAP_CELL_STROKE_INSET,
    HEATMAP_USE_UI_SAMPLING_SHIM,
} from "@/config/logic";
import { useUiClock } from "@/shared/hooks/useUiClock";
import { TEXT_ROLES } from "@/modules/dashboard/hooks/utils/textRoles";
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
    const [isZooming, setIsZooming] = useState(false);
    // Decoupled: visuals update only when pieceAvailability changes
    const availabilityList = useMemo(
        () => pieceAvailability ?? [],
        [pieceAvailability]
    );
    // UI clock for redraw cadence (independent of server updates)
    const { tick } = useUiClock();
    const hasAvailability = availabilityList.length > 0;

    const startZoomPulse = useCallback(() => {
        setIsZooming(true);
    }, []);

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
                startZoomPulse();
                return next;
            });
        },
        [startZoomPulse]
    );

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
            if (hoveredCell?.gridIndex === index) {
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
        hoveredCell,
        maxPeers,
        palette.highlight,
        palette.placeholder,
    ]);

    // Redraw on data or UI clock. Avoid per-component timers.
    useEffect(() => {
        drawHeatmap();
    }, [drawHeatmap, tick]);

    useEffect(() => {
        setHoveredCell(null);
    }, [heatCells]);

    // Clear zoom pulse on the next UI tick to avoid per-component timers.
    useEffect(() => {
        if (isZooming) {
            setIsZooming(false);
        }
    }, [tick]);

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

    const tooltipContent = hoveredCell
        ? formatTooltip(hoveredCell.pieceIndex + 1, hoveredCell.peers)
        : undefined;

    if (!hasAvailability) {
        return (
            <div className="rounded-2xl border border-content1/20 bg-content1/10 p-panel text-scaled text-foreground/50 text-center">
                {emptyLabel}
            </div>
        );
    }

    return (
        <motion.div layout className="flex flex-col gap-tools">
            <div className="flex items-center justify-between">
                <span
                    className={TEXT_ROLES.label}
                    style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
                >
                    {label}
                </span>
                <div className="flex items-center gap-tools text-scaled text-foreground/50">
                    <span className="flex items-center gap-tight">
                        <span
                            className="size-dot rounded-full"
                            style={{ backgroundColor: "var(--heroui-danger)" }}
                        />
                        {legendRare}
                    </span>
                    <span className="flex items-center gap-tight">
                        <span
                            className="size-dot rounded-full"
                            style={{ backgroundColor: "var(--heroui-primary)" }}
                        />
                        {legendCommon}
                    </span>
                </div>
                <div className="flex items-center gap-tight">
                    <Button
                        size="md"
                        variant="shadow"
                        color="default"
                        className="size-icon-btn rounded-full"
                        onPress={() => handleZoom("out")}
                        isDisabled={zoomIndex === 0}
                    >
                        <StatusIcon
                            Icon={ZoomOut}
                            size="sm"
                            className="text-current"
                        />
                    </Button>
                    <span className="text-scaled font-mono text-foreground/60">
                        x{zoomLevel.toFixed(1)}
                    </span>
                    <Button
                        size="md"
                        variant="shadow"
                        color="default"
                        className="size-icon-btn rounded-full"
                        onPress={() => handleZoom("in")}
                        isDisabled={
                            zoomIndex === HEATMAP_ZOOM_LEVELS.length - 1
                        }
                    >
                        <StatusIcon
                            Icon={ZoomIn}
                            size="sm"
                            className="text-current"
                        />
                    </Button>
                </div>
            </div>
            <div
                className={cn(
                    "rounded-2xl border border-content1/20 bg-content1/10 p-tight transition-all duration-200",
                    {
                        "opacity-70 shadow-availability ring-1 ring-primary/40":
                            isZooming,
                    }
                )}
            >
                <Tooltip
                    content={tooltipContent}
                    delay={0}
                    closeDelay={0}
                    classNames={GLASS_TOOLTIP_CLASSNAMES}
                    isDisabled={!hoveredCell}
                >
                    <canvas
                        ref={canvasRef}
                        width={canvasWidth}
                        height={canvasHeight}
                        className="w-full h-auto block rounded-2xl cursor-crosshair"
                        onMouseMove={handleHeatmapHover}
                        onMouseLeave={() => setHoveredCell(null)}
                    />
                </Tooltip>
            </div>
        </motion.div>
    );
};
