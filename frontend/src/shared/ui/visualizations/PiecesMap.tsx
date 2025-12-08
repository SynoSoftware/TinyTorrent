import { cn } from "@heroui/react";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "../../utils/format";
import {
    cancelScheduledFrame,
    scheduleFrame,
    useCanvasPalette,
} from "./canvasUtils";
import type { FrameHandle } from "./canvasUtils";
import {
    PIECE_CANVAS_CELL_GAP,
    PIECE_CANVAS_CELL_SIZE,
    PIECE_COLUMNS,
    PIECE_MAX_ROWS,
    PIECE_BASE_ROWS,
} from "./config";

type PieceStatus = "done" | "downloading" | "missing";

interface PiecesMapProps {
    percent: number;
    pieceCount?: number;
    pieceStates?: number[];
    pieceSize?: number;
}

type PieceCell = { pieceIndex: number; status: PieceStatus } | null;
type PieceHover = {
    gridIndex: number;
    pieceIndex: number;
    status: PieceStatus;
};

type HoverPosition = {
    x: number;
    y: number;
    width: number;
    height: number;
};

const normalizePercent = (value: number) =>
    Math.min(Math.max(value ?? 0, 0), 1);

const buildGridRows = (pieceCount: number) =>
    Math.min(
        PIECE_MAX_ROWS,
        Math.max(PIECE_BASE_ROWS, Math.ceil(pieceCount / PIECE_COLUMNS))
    );

const samplePieceIndexes = (totalPieces: number, slots: number) => {
    const count = Math.min(Math.max(0, totalPieces), slots);
    if (count <= 0) return [];
    if (count === 1) return [0];
    const step = (totalPieces - 1) / (count - 1);
    return Array.from({ length: count }, (_, index) =>
        Math.min(totalPieces - 1, Math.round(index * step))
    );
};

const PIECE_STATUS_TRANSLATION_KEYS: Record<PieceStatus, string> = {
    done: "torrent_modal.stats.verified",
    downloading: "torrent_modal.stats.downloading",
    missing: "torrent_modal.stats.missing",
};

export const PiecesMap = ({
    percent,
    pieceStates,
    pieceCount,
    pieceSize,
}: PiecesMapProps) => {
    const { t } = useTranslation();
    const palette = useCanvasPalette();
    const normalizedPercent = normalizePercent(percent);
    const fallbackPieces = Math.max(
        64,
        pieceCount ?? Math.round(256 * Math.max(normalizedPercent, 0.1))
    );
    const totalPieces = pieceCount ?? fallbackPieces;
    const gridRows = buildGridRows(totalPieces);
    const cellsToDraw = gridRows * PIECE_COLUMNS;
    const sampleCount = Math.min(totalPieces, cellsToDraw);
    const sampleIndexes = useMemo(
        () => samplePieceIndexes(totalPieces, sampleCount),
        [sampleCount, totalPieces]
    );

    const determineStatus = useCallback(
        (pieceIndex: number): PieceStatus => {
            const state = pieceStates?.[pieceIndex];
            if (typeof state === "number") {
                if (state & 0x1) return "done";
                if (state & 0x2) return "downloading";
            }
            const doneThreshold = Math.floor(totalPieces * normalizedPercent);
            if (pieceIndex < doneThreshold) return "done";
            if (pieceIndex === doneThreshold && normalizedPercent < 1)
                return "downloading";
            return "missing";
        },
        [normalizedPercent, pieceStates, totalPieces]
    );

    const cells = useMemo<PieceCell[]>(() => {
        const filled = sampleIndexes.map((pieceIndex) => ({
            pieceIndex,
            status: determineStatus(pieceIndex),
        }));
        const placeholders = new Array<PieceCell>(
            Math.max(0, cellsToDraw - filled.length)
        ).fill(null);
        return [...filled, ...placeholders];
    }, [cellsToDraw, determineStatus, sampleIndexes]);

    const { done: doneCount, downloading: downloadingCount } = useMemo(
        () =>
            cells.reduce(
                (acc, cell) => {
                    if (cell?.status === "done") acc.done += 1;
                    if (cell?.status === "downloading") acc.downloading += 1;
                    return acc;
                },
                { done: 0, downloading: 0 }
            ),
        [cells]
    );
    const pieceSizeLabel = pieceSize
        ? formatBytes(pieceSize)
        : t("torrent_modal.labels.unknown");
    const canvasWidth =
        PIECE_COLUMNS * PIECE_CANVAS_CELL_SIZE +
        (PIECE_COLUMNS - 1) * PIECE_CANVAS_CELL_GAP;
    const canvasHeight =
        gridRows * PIECE_CANVAS_CELL_SIZE +
        (gridRows - 1) * PIECE_CANVAS_CELL_GAP;
    const cellPitch = PIECE_CANVAS_CELL_SIZE + PIECE_CANVAS_CELL_GAP;
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [hoveredPiece, setHoveredPiece] = useState<PieceHover | null>(null);
    const [hoverPosition, setHoverPosition] = useState<HoverPosition | null>(
        null
    );
    const frameRef = useRef<FrameHandle | null>(null);
    const normalizedPercentLabel = useMemo(
        () => (normalizedPercent * 100).toFixed(1),
        [normalizedPercent]
    );

    const drawPieces = useCallback(() => {
        if (frameRef.current) cancelScheduledFrame(frameRef.current);
        frameRef.current = scheduleFrame(() => {
            const canvas = canvasRef.current;
            if (!canvas) {
                frameRef.current = null;
                return;
            }
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                frameRef.current = null;
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

            cells.forEach((cell, index) => {
                const column = index % PIECE_COLUMNS;
                const row = Math.floor(index / PIECE_COLUMNS);
                const x = column * cellPitch;
                const y = row * cellPitch;
                ctx.save();
                if (cell) {
                    const statusColor =
                        cell.status === "done"
                            ? palette.primary
                            : cell.status === "downloading"
                            ? palette.warning
                            : palette.missing;
                    ctx.fillStyle = statusColor;
                    if (cell.status === "downloading") {
                        ctx.shadowColor = palette.glowWarning;
                        ctx.shadowBlur = 12;
                    } else if (cell.status === "done") {
                        ctx.shadowColor = palette.glowPrimary;
                        ctx.shadowBlur = 6;
                    }
                } else {
                    ctx.fillStyle = palette.missing;
                    ctx.shadowBlur = 0;
                }
                ctx.fillRect(
                    x,
                    y,
                    PIECE_CANVAS_CELL_SIZE,
                    PIECE_CANVAS_CELL_SIZE
                );
                if (hoveredPiece?.gridIndex === index) {
                    ctx.strokeStyle = palette.highlight;
                    ctx.lineWidth = 1.4;
                    ctx.strokeRect(
                        x + 0.6,
                        y + 0.6,
                        PIECE_CANVAS_CELL_SIZE - 1.2,
                        PIECE_CANVAS_CELL_SIZE - 1.2
                    );
                }
                ctx.restore();
            });
            frameRef.current = null;
        });
    }, [
        canvasHeight,
        canvasWidth,
        cellPitch,
        cells,
        hoveredPiece,
        palette,
    ]);

    useEffect(() => {
        drawPieces();
    }, [drawPieces]);

    useEffect(() => {
        setHoveredPiece(null);
        setHoverPosition(null);
    }, [cells]);

    useEffect(() => {
        return () => cancelScheduledFrame(frameRef.current);
    }, []);

    const handleCanvasMove = useCallback(
        (event: MouseEvent<HTMLCanvasElement>) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) {
                setHoveredPiece(null);
                setHoverPosition(null);
                return;
            }
            const pointerX = Math.min(
                Math.max(0, event.clientX - rect.left),
                rect.width
            );
            const pointerY = Math.min(
                Math.max(0, event.clientY - rect.top),
                rect.height
            );
            const intrinsicX = (pointerX / rect.width) * canvasWidth;
            const intrinsicY = (pointerY / rect.height) * canvasHeight;
            const column = Math.floor(intrinsicX / cellPitch);
            const row = Math.floor(intrinsicY / cellPitch);
            if (
                column < 0 ||
                column >= PIECE_COLUMNS ||
                row < 0 ||
                row >= gridRows
            ) {
                setHoveredPiece(null);
                setHoverPosition(null);
                return;
            }
            const cellIndex = row * PIECE_COLUMNS + column;
            const cell = cells[cellIndex];
            if (!cell) {
                setHoveredPiece(null);
                setHoverPosition(null);
                return;
            }
            const nextHover: PieceHover = {
                gridIndex: cellIndex,
                pieceIndex: cell.pieceIndex,
                status: cell.status,
            };
            setHoverPosition({
                x: pointerX,
                y: pointerY,
                width: rect.width,
                height: rect.height,
            });
            setHoveredPiece((prev) =>
                prev &&
                prev.gridIndex === cellIndex &&
                prev.status === cell.status
                    ? prev
                    : nextHover
            );
        },
        [canvasHeight, canvasWidth, cellPitch, cells, gridRows]
    );

    const tooltipLines = useMemo(() => {
        if (!hoveredPiece) return [];
        return [
            t("torrent_modal.piece_map.tooltip", {
                piece: hoveredPiece.pieceIndex + 1,
                status: t(
                    PIECE_STATUS_TRANSLATION_KEYS[hoveredPiece.status]
                ),
            }),
            t("torrent_modal.piece_map.tooltip_size", {
                size: pieceSizeLabel,
            }),
            t("torrent_modal.piece_map.tooltip_progress", {
                percent: normalizedPercentLabel,
            }),
        ];
    }, [
        hoveredPiece,
        pieceSizeLabel,
        normalizedPercentLabel,
        t,
    ]);

    const tooltipStyle = useMemo(() => {
        if (!hoveredPiece || !hoverPosition) return undefined;
        const tooltipWidth = 210;
        const tooltipHeight = 66;
        const offsetX = 12;
        const offsetY = 8;
        const horizontalLimit = Math.max(
            hoverPosition.width - tooltipWidth - 12,
            12
        );
        const left = Math.min(
            Math.max(hoverPosition.x + offsetX, 12),
            horizontalLimit
        );
        const verticalLimit = Math.max(
            hoverPosition.height - tooltipHeight - 12,
            12
        );
        const top = Math.min(
            Math.max(hoverPosition.y - tooltipHeight - offsetY, 12),
            verticalLimit
        );
        return { left, top };
    }, [hoverPosition, hoveredPiece]);

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex flex-wrap justify-between text-[10px] uppercase tracking-[0.2em] text-foreground/50">
                <span>
                    {t("torrent_modal.stats.pieces")}:{" "}
                    <span className="text-foreground font-mono">
                        {pieceCount ?? fallbackPieces}
                    </span>
                </span>
                <span>
                    {t("torrent_modal.stats.piece_size")}:{" "}
                    <span className="text-foreground font-mono">
                        {pieceSizeLabel}
                    </span>
                </span>
                <span>
                    {t("torrent_modal.stats.verified")}:{" "}
                    <span className="text-foreground font-mono">{doneCount}</span>
                </span>
                <span>
                    {t("torrent_modal.stats.downloading")}:{" "}
                    <span className="text-warning font-mono">
                        {downloadingCount}
                    </span>
                </span>
            </div>
            <div className="rounded-2xl border border-content1/20 bg-content1/10 p-4">
                <div className="relative">
                    <canvas
                        ref={canvasRef}
                        width={canvasWidth}
                        height={canvasHeight}
                        className="w-full h-auto block rounded-2xl"
                        onMouseMove={handleCanvasMove}
                        onMouseLeave={() => {
                            setHoveredPiece(null);
                            setHoverPosition(null);
                        }}
                    />
                    {tooltipLines.length > 0 && tooltipStyle && (
                        <div
                            className="pointer-events-none absolute z-10 max-w-[230px] rounded-2xl border border-content1/30 bg-content1/90 px-3 py-2 text-[11px] text-foreground/90 shadow-[0_20px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl"
                            style={tooltipStyle}
                        >
                            {tooltipLines.map((line, index) => (
                                <span
                                    key={`piece-tooltip-${index}`}
                                    className={cn(
                                        "block whitespace-normal",
                                        index === 0
                                            ? "font-semibold"
                                            : "text-[10px] text-foreground/70"
                                    )}
                                >
                                    {line}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
