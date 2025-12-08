import { Button, Tooltip, cn } from "@heroui/react";
import type { MouseEvent } from "react";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { motion } from "framer-motion";
import { ZoomIn, ZoomOut } from "lucide-react";
import { GLASS_TOOLTIP_CLASSNAMES } from "./constants";
import {
    cancelScheduledFrame,
    getAvailabilityColor,
    scheduleFrame,
    useCanvasPalette,
} from "./canvasUtils";
import type { FrameHandle } from "./canvasUtils";
import {
    HEATMAP_CANVAS_CELL_GAP,
    HEATMAP_CANVAS_CELL_SIZE,
    HEATMAP_SAMPLE_LIMIT,
    HEATMAP_ZOOM_LEVELS,
    PIECE_COLUMNS,
} from "./config";

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
    const zoomPulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const availabilityList = useMemo(
        () => pieceAvailability ?? [],
        [pieceAvailability]
    );
    const hasAvailability = availabilityList.length > 0;

    const startZoomPulse = useCallback(() => {
        setIsZooming(true);
        if (zoomPulseTimeoutRef.current) {
            clearTimeout(zoomPulseTimeoutRef.current);
        }
        zoomPulseTimeoutRef.current = setTimeout(() => {
            setIsZooming(false);
            zoomPulseTimeoutRef.current = null;
        }, 220);
    }, []);

    useEffect(() => {
        return () => {
            if (zoomPulseTimeoutRef.current) {
                clearTimeout(zoomPulseTimeoutRef.current);
            }
        };
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
    const sampleLimit = Math.round(HEATMAP_SAMPLE_LIMIT * zoomLevel);
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
        availabilityList.reduce(
            (max, count) => Math.max(max, count ?? 0),
            0
        ) || 1;
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
    const heatmapFrameRef = useRef<FrameHandle | null>(null);
    const cellPitch = HEATMAP_CANVAS_CELL_SIZE + HEATMAP_CANVAS_CELL_GAP;

    const drawHeatmap = useCallback(() => {
        if (heatmapFrameRef.current) {
            cancelScheduledFrame(heatmapFrameRef.current);
        }
        heatmapFrameRef.current = scheduleFrame(() => {
            const canvas = canvasRef.current;
            if (!canvas) {
                heatmapFrameRef.current = null;
                return;
            }
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                heatmapFrameRef.current = null;
                return;
            }
            const dpr =
                typeof window !== "undefined"
                    ? window.devicePixelRatio || 1
                    : 1;
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
                            16,
                            (cell.value / maxPeers) * 16 + 1
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
                    ctx.lineWidth = 1.1;
                    ctx.strokeRect(
                        x + 0.6,
                        y + 0.6,
                        HEATMAP_CANVAS_CELL_SIZE - 1.2,
                        HEATMAP_CANVAS_CELL_SIZE - 1.2
                    );
                }
                ctx.restore();
            });
            heatmapFrameRef.current = null;
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

    useEffect(() => {
        drawHeatmap();
    }, [drawHeatmap]);

    useEffect(() => {
        return () => cancelScheduledFrame(heatmapFrameRef.current);
    }, []);

    useEffect(() => {
        setHoveredCell(null);
    }, [heatCells]);

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
            <div className="rounded-2xl border border-content1/20 bg-content1/10 p-4 text-[11px] text-foreground/50 text-center">
                {emptyLabel}
            </div>
        );
    }

    return (
        <motion.div layout className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-foreground/50">
                    {label}
                </span>
                <div className="flex items-center gap-3 text-[10px] text-foreground/50">
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[hsl(0,80%,54%)]" />
                        {legendRare}
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[hsl(220,80%,54%)]" />
                        {legendCommon}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        size="sm"
                        variant="flat"
                        color="default"
                        className="h-7 w-7 rounded-full"
                        onPress={() => handleZoom("out")}
                        isDisabled={zoomIndex === 0}
                    >
                        <ZoomOut size={12} className="text-current" />
                    </Button>
                    <span className="text-[10px] font-mono text-foreground/60">
                        x{zoomLevel.toFixed(1)}
                    </span>
                    <Button
                        size="sm"
                        variant="flat"
                        color="default"
                        className="h-7 w-7 rounded-full"
                        onPress={() => handleZoom("in")}
                        isDisabled={
                            zoomIndex === HEATMAP_ZOOM_LEVELS.length - 1
                        }
                    >
                        <ZoomIn size={12} className="text-current" />
                    </Button>
                </div>
            </div>
            <div
                className={cn(
                    "rounded-2xl border border-content1/20 bg-content1/10 p-2 transition-all duration-200",
                    {
                        "opacity-70 shadow-[0_0_25px_rgba(14,165,233,0.25)] ring-1 ring-primary/40":
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
