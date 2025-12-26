import { cn } from "@heroui/react";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@/shared/utils/format";
import {
    cancelScheduledFrame,
    scheduleFrame,
    useCanvasPalette,
} from "./canvasUtils";
import type { FrameHandle } from "./canvasUtils";
import { DETAILS_PIECE_MAP_CONFIG } from "@/config/logic";
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
type HoverPosition = { x: number; y: number; width: number; height: number };

const normalizePercent = (value: number) =>
    Math.min(Math.max(value ?? 0, 0), 1);
const buildGridRows = (pieceCount: number) =>
    Math.min(
        DETAILS_PIECE_MAP_CONFIG.rows.max,
        Math.max(
            DETAILS_PIECE_MAP_CONFIG.rows.base,
            Math.ceil(pieceCount / DETAILS_PIECE_MAP_CONFIG.columns)
        )
    );

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
    const cellsToDraw = gridRows * DETAILS_PIECE_MAP_CONFIG.columns;
    const sampleCount = Math.min(totalPieces, cellsToDraw);

    const sampleIndexes = useMemo(() => {
        const count = Math.min(Math.max(0, totalPieces), sampleCount);
        if (count <= 0) return [];
        if (count === 1) return [0];
        const step = (totalPieces - 1) / (count - 1);
        return Array.from({ length: count }, (_, i) =>
            Math.min(totalPieces - 1, Math.round(i * step))
        );
    }, [sampleCount, totalPieces]);

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
        DETAILS_PIECE_MAP_CONFIG.columns * DETAILS_PIECE_MAP_CONFIG.cell_size +
        (DETAILS_PIECE_MAP_CONFIG.columns - 1) *
            DETAILS_PIECE_MAP_CONFIG.cell_gap;
    const canvasHeight =
        gridRows * DETAILS_PIECE_MAP_CONFIG.cell_size +
        (gridRows - 1) * DETAILS_PIECE_MAP_CONFIG.cell_gap;
    const cellPitch =
        DETAILS_PIECE_MAP_CONFIG.cell_size + DETAILS_PIECE_MAP_CONFIG.cell_gap;
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

            const statusStyles: Record<
                PieceStatus,
                { fill: string; glow?: string; blur: number }
            > = {
                done: {
                    fill: palette.success,
                    glow: palette.glowSuccess,
                    blur: 10,
                },
                downloading: {
                    fill: palette.downloading,
                    glow: palette.glowDownloading,
                    blur: 12,
                },
                missing: {
                    fill: palette.missing,
                    blur: 0,
                },
            };

            cells.forEach((cell, index) => {
                const column = index % DETAILS_PIECE_MAP_CONFIG.columns;
                const row = Math.floor(
                    index / DETAILS_PIECE_MAP_CONFIG.columns
                );
                const x = column * cellPitch;
                const y = row * cellPitch;
                ctx.save();
                if (cell) {
                    const style = statusStyles[cell.status];
                    ctx.fillStyle = style.fill;
                    if (style.glow) {
                        ctx.shadowColor = style.glow;
                        ctx.shadowBlur = style.blur;
                    } else {
                        ctx.shadowBlur = 0;
                    }
                } else {
                    ctx.fillStyle = palette.placeholder;
                    ctx.shadowBlur = 0;
                }
                ctx.fillRect(
                    x,
                    y,
                    DETAILS_PIECE_MAP_CONFIG.cell_size,
                    DETAILS_PIECE_MAP_CONFIG.cell_size
                );
                if (hoveredPiece?.gridIndex === index) {
                    ctx.strokeStyle = palette.foreground;
                    ctx.lineWidth = 1.4;
                    ctx.strokeRect(
                        x + 0.6,
                        y + 0.6,
                        DETAILS_PIECE_MAP_CONFIG.cell_size - 1.2,
                        DETAILS_PIECE_MAP_CONFIG.cell_size - 1.2
                    );
                }
                ctx.restore();
            });
            frameRef.current = null;
        });
    }, [canvasHeight, canvasWidth, cellPitch, cells, hoveredPiece, palette]);

    useEffect(() => {
        drawPieces();
    }, [drawPieces]);
    useEffect(() => () => cancelScheduledFrame(frameRef.current), []);

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
                column >= DETAILS_PIECE_MAP_CONFIG.columns ||
                row < 0 ||
                row >= gridRows
            ) {
                setHoveredPiece(null);
                setHoverPosition(null);
                return;
            }
            const cellIndex = row * DETAILS_PIECE_MAP_CONFIG.columns + column;
            const cell = cells[cellIndex];
            if (!cell) {
                setHoveredPiece(null);
                setHoverPosition(null);
                return;
            }
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
                    : {
                          gridIndex: cellIndex,
                          pieceIndex: cell.pieceIndex,
                          status: cell.status,
                      }
            );
        },
        [canvasHeight, canvasWidth, cellPitch, cells, gridRows]
    );

    const tooltipLines = useMemo(() => {
        if (!hoveredPiece) return [];
        return [
            t("torrent_modal.piece_map.tooltip", {
                piece: hoveredPiece.pieceIndex + 1,
                status: t(PIECE_STATUS_TRANSLATION_KEYS[hoveredPiece.status]),
            }),
            t("torrent_modal.piece_map.tooltip_size", { size: pieceSizeLabel }),
            t("torrent_modal.piece_map.tooltip_progress", {
                percent: normalizedPercentLabel,
            }),
        ];
    }, [hoveredPiece, pieceSizeLabel, normalizedPercentLabel, t]);

    const tooltipStyle = useMemo(() => {
        if (!hoveredPiece || !hoverPosition) return undefined;
        return { left: hoverPosition.x + 12, top: hoverPosition.y - 66 };
    }, [hoverPosition, hoveredPiece]);

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex flex-wrap justify-between text-tiny uppercase tracking-[0.2em] text-foreground/50">
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
                    <span className="text-foreground font-mono">
                        {doneCount}
                    </span>
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
                            className="pointer-events-none absolute z-10 max-w-[230px] rounded-2xl border border-content1/30 bg-content1/90 px-3 py-2 text-tiny text-foreground/90 shadow-large backdrop-blur-xl"
                            style={tooltipStyle}
                        >
                            {tooltipLines.map((line, index) => (
                                <span
                                    key={`piece-tooltip-${index}`}
                                    className={cn(
                                        "block whitespace-normal",
                                        index === 0
                                            ? "font-semibold"
                                            : "text-tiny text-foreground/70"
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
