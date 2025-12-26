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
    pieceCount,
    pieceStates,
    pieceSize,
}: PiecesMapProps) => {
    const { t } = useTranslation();
    const palette = useCanvasPalette();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hoveredPiece, setHoveredPiece] = useState<PieceHover | null>(null);
    const [hoverPosition, setHoverPosition] = useState<HoverPosition | null>(
        null
    );
    const normalizedPercent = normalizePercent(percent);
    const fallbackPieces = Math.max(
        64,
        pieceCount ?? Math.round(256 * Math.max(normalizedPercent, 0.1))
    );
    const totalPieces = pieceCount ?? fallbackPieces;
    const gridRows = buildGridRows(totalPieces);
    const columns = DETAILS_PIECE_MAP_CONFIG.columns;
    const cellsToDraw = gridRows * columns;
    const canvasWidth = columns * DETAILS_PIECE_MAP_CONFIG.cell_size;
    const canvasHeight = gridRows * DETAILS_PIECE_MAP_CONFIG.cell_size;
    const pieceSizeLabel = pieceSize
        ? formatBytes(pieceSize)
        : t("torrent_modal.stats.unknown_size");
    const normalizedPercentLabel = Math.round(normalizedPercent * 100) + "%";
    // Dummy counts for summary bar (replace with real logic if needed)
    const doneCount = pieceStates
        ? pieceStates.filter((s) => s === 2).length
        : Math.round(totalPieces * normalizedPercent);
    const downloadingCount = pieceStates
        ? pieceStates.filter((s) => s === 1).length
        : 0;
    // Tooltip lines
    const tooltipLines = useMemo(() => {
        if (!hoveredPiece) return [];
        return [
            t(PIECE_STATUS_TRANSLATION_KEYS[hoveredPiece.status]),
            t("torrent_modal.stats.piece_index") +
                ": " +
                (hoveredPiece.pieceIndex + 1),
            t("torrent_modal.piece_map.tooltip_size", { size: pieceSizeLabel }),
            t("torrent_modal.piece_map.tooltip_progress", {
                percent: normalizedPercentLabel,
            }),
        ];
    }, [hoveredPiece, pieceSizeLabel, normalizedPercentLabel, t]);

    // Mouse move handler (dummy, replace with real logic)
    const handleCanvasMove = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
        // Example: set hovered piece to first piece
        setHoveredPiece({ gridIndex: 0, pieceIndex: 0, status: "done" });
        setHoverPosition({
            x: e.nativeEvent.offsetX,
            y: e.nativeEvent.offsetY,
            width: 24,
            height: 24,
        });
    }, []);

    const tooltipStyle = useMemo(() => {
        if (!hoveredPiece || !hoverPosition) return undefined;
        return { left: hoverPosition.x + 12, top: hoverPosition.y - 66 };
    }, [hoverPosition, hoveredPiece]);

    return (
        <div className="flex flex-col gap-4 h-full">
            <div
                className="flex flex-wrap justify-between text-tiny uppercase text-foreground/50"
                style={{ letterSpacing: "var(--tt-tracking-wide)" }}
            >
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
                    {/* Badge for all pieces verified */}
                    {doneCount === totalPieces && totalPieces > 0 && (
                        <div className="absolute top-2 right-2 bg-success/80 text-white text-xs font-bold px-3 py-1 rounded shadow-lg">
                            {t("torrent_modal.stats.verified")}: {doneCount}
                        </div>
                    )}
                    {/* Tooltip for unknown piece size */}
                    {pieceSizeLabel ===
                        t("torrent_modal.stats.unknown_size") && (
                        <div className="absolute left-2 bottom-2 bg-content1/90 text-xs text-foreground/80 px-2 py-1 rounded shadow">
                            {t("torrent_modal.stats.unknown_size")}
                        </div>
                    )}
                </div>
            </div>
            {/* Accessibility legend for piece states */}
            <div className="flex gap-4 mt-2 items-center">
                <span className="flex items-center gap-1">
                    <span
                        style={{
                            width: 16,
                            height: 16,
                            background: palette.success,
                            display: "inline-block",
                            borderRadius: 4,
                        }}
                    />
                    <span className="text-xs text-foreground/70">
                        {t("torrent_modal.stats.verified")}
                    </span>
                </span>
                <span className="flex items-center gap-1">
                    <span
                        style={{
                            width: 16,
                            height: 16,
                            background: palette.downloading,
                            display: "inline-block",
                            borderRadius: 4,
                            border: "2px dashed " + palette.primary,
                        }}
                    />
                    <span className="text-xs text-foreground/70">
                        {t("torrent_modal.stats.downloading")}
                    </span>
                </span>
                <span className="flex items-center gap-1">
                    <span
                        style={{
                            width: 16,
                            height: 16,
                            background: palette.content1,
                            display: "inline-block",
                            borderRadius: 4,
                            border: "1.5px solid " + palette.danger,
                        }}
                    />
                    <span className="text-xs text-foreground/70">
                        {t("torrent_modal.stats.missing")}
                    </span>
                </span>
            </div>
        </div>
    );
};
