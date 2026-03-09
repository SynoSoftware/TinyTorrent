import type {
    CSSProperties,
    MouseEvent as ReactMouseEvent,
    RefObject,
    WheelEvent as ReactWheelEvent,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { scheduler } from "@/app/services/scheduler";
import { registry } from "@/config/logic";
import { formatBytes } from "@/shared/utils/format";
import {
    cancelScheduledFrame,
    clamp,
    fitCanvasToContainer,
    normalizePiecePercent,
    resolveCanvasColor,
    scheduleFrame,
    useCanvasPalette,
    type FrameHandle,
    type PieceStatus,
} from "@/modules/dashboard/hooks/utils/canvasUtils";

const { layout, visualizations } = registry;

const MIN_VISIBLE_ZOOM = 1e-4;
const MIN_DRAW_DIMENSION = 2;
const MIN_MINIMAP_SCALE = 0.08;
const MINIMAP_THRESHOLD = 1.5;
const HELP_HINT_VISIBLE_MS = 10_000;
const HUD_HELP_DELAY_MS = 1_000;
const HUD_MINIMAP_IDLE_MS = 2_000;
const NAVIGATION_EPSILON = 0.5;
const TOOLTIP_GAP = 8;
const TOOLTIP_EDGE_PADDING = 10;

type SwarmTone = "verified" | "common" | "rare" | "dead" | "missing";
type DragMode = "canvas" | "minimap" | null;
type Offset = { x: number; y: number };
type Axis = { starts: number[]; total: number };
type DrawState = {
    fitZoom: number;
    zoom: number;
    offset: Offset;
    viewportWidth: number;
    viewportHeight: number;
};
type HoveredPiece = {
    pieceIndex: number;
    row: number;
    col: number;
    peers: number;
    tone: SwarmTone;
};
type ScheduledCancel = (() => void) | null;
type ViewportBounds = { width: number; height: number };

const readViewportBounds = (element: HTMLElement | null): ViewportBounds | null => {
    if (!element) {
        return null;
    }
    const rect = element.getBoundingClientRect();
    return {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
    };
};

const estimateAxisTotal = (
    count: number,
    cellSize: number,
    gap: number,
    chunkInterval: number,
    chunkGap: number,
) => {
    if (count <= 0) {
        return 0;
    }

    const gaps = Math.max(0, count - 1);
    const chunkBreaks = Math.floor(gaps / chunkInterval);
    return count * cellSize + gaps * gap + chunkBreaks * chunkGap;
};

const buildAxis = (
    count: number,
    cellSize: number,
    gap: number,
    chunkInterval: number,
    chunkGap: number,
): Axis => {
    const starts = Array.from({ length: count }, () => 0);
    let cursor = 0;
    for (let index = 0; index < count; index += 1) {
        starts[index] = cursor;
        cursor += cellSize;
        if (index < count - 1) {
            cursor += gap;
            if ((index + 1) % chunkInterval === 0) {
                cursor += chunkGap;
            }
        }
    }
    return { starts, total: cursor };
};

const fitIndex = (value: number, starts: number[], cellSize: number) => {
    let low = 0;
    let high = starts.length - 1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const start = starts[mid] ?? 0;
        if (value < start) {
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }

    const index = high;
    if (index < 0) {
        return null;
    }
    const start = starts[index] ?? 0;
    return value <= start + cellSize ? index : null;
};

const resolveColumnCount = (
    viewportWidth: number | null,
    viewportHeight: number | null,
    totalCells: number,
    cellSize: number,
    gap: number,
    chunkInterval: number,
    chunkGap: number,
    fallbackColumns: number,
) => {
    if (
        viewportWidth == null ||
        viewportWidth <= 0 ||
        viewportHeight == null ||
        viewportHeight <= 0 ||
        totalCells <= 0
    ) {
        return fallbackColumns;
    }

    const fitsViewport = (columns: number) => {
        const safeColumns = Math.max(1, Math.min(totalCells, columns));
        const rows = Math.max(1, Math.ceil(totalCells / safeColumns));
        const colTotal = estimateAxisTotal(
            safeColumns,
            cellSize,
            gap,
            chunkInterval,
            chunkGap,
        );
        const rowTotal = estimateAxisTotal(
            rows,
            cellSize,
            gap,
            chunkInterval,
            chunkGap,
        );
        const fitZoom = viewportWidth / Math.max(colTotal, 1);
        return rowTotal * fitZoom <= viewportHeight;
    };

    const aspectRatio = viewportWidth / Math.max(viewportHeight, 1);
    let columns = clamp(
        Math.round(Math.sqrt(totalCells * Math.max(aspectRatio, 0.1))),
        1,
        totalCells,
    );

    while (columns < totalCells && !fitsViewport(columns)) {
        columns += 1;
    }
    while (columns > 1 && fitsViewport(columns - 1)) {
        columns -= 1;
    }

    return columns;
};

const clampOffset = (
    offset: Offset,
    viewportWidth: number,
    viewportHeight: number,
    contentWidth: number,
    contentHeight: number,
    zoom: number,
): Offset => {
    const safeZoom = Math.max(zoom, MIN_VISIBLE_ZOOM);
    const visibleWidth = viewportWidth / safeZoom;
    const visibleHeight = viewportHeight / safeZoom;
    const clampAxis = (value: number, visible: number, content: number) => {
        if (content <= visible) {
            return 0;
        }
        return clamp(value, 0, content - visible);
    };
    return {
        x: clampAxis(offset.x, visibleWidth, contentWidth),
        y: clampAxis(offset.y, visibleHeight, contentHeight),
    };
};

const resolveStatus = (value: number, binary: boolean): PieceStatus => {
    if (binary) {
        return value === 1 ? "done" : "missing";
    }
    if (value === 2) {
        return "done";
    }
    if (value === 1) {
        return "downloading";
    }
    return "missing";
};

export interface PiecesMapProps {
    percent: number;
    pieceCount?: number;
    pieceStates?: number[];
    pieceSize?: number;
    pieceAvailability?: number[];
}

export interface PiecesMapViewModel {
    refs: {
        rootRef: RefObject<HTMLDivElement | null>;
        canvasRef: RefObject<HTMLCanvasElement | null>;
        overlayRef: RefObject<HTMLCanvasElement | null>;
        minimapRef: RefObject<HTMLCanvasElement | null>;
        tooltipRef: RefObject<HTMLDivElement | null>;
    };
    palette: ReturnType<typeof useCanvasPalette>;
    totalPieces: number;
    pieceSizeLabel: string;
    verifiedCount: number;
    verifiedPercent: number;
    missingCount: number;
    commonCount: number;
    rareCount: number;
    deadCount: number;
    availabilityMissing: boolean;
    hasBinaryPieceStates: boolean;
    zoomLabel: string;
    showMinimap: boolean;
    showHelpHint: boolean;
    isDragging: boolean;
    tooltipLines: string[];
    tooltipStyle?: CSSProperties;
    controls: {
        canZoomIn: boolean;
        canZoomOut: boolean;
        zoomIn: () => void;
        zoomOut: () => void;
        reset: () => void;
    };
    handlers: {
        onMouseMove: (event: ReactMouseEvent<HTMLCanvasElement>) => void;
        onMouseLeave: () => void;
        onMouseDown: (event: ReactMouseEvent<HTMLCanvasElement>) => void;
        onWheel: (event: ReactWheelEvent<HTMLCanvasElement>) => void;
        onMinimapMouseDown: (event: ReactMouseEvent<HTMLCanvasElement>) => void;
    };
}

export function usePiecesMapViewModel({
    percent,
    pieceCount,
    pieceStates,
    pieceSize,
    pieceAvailability,
}: PiecesMapProps): PiecesMapViewModel {
    const { t } = useTranslation();
    const palette = useCanvasPalette();
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const minimapRef = useRef<HTMLCanvasElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const drawStateRef = useRef<DrawState | null>(null);
    const dragModeRef = useRef<DragMode>(null);
    const dragStartRef = useRef({ x: 0, y: 0, offset: { x: 0, y: 0 } });
    const frameRef = useRef<FrameHandle | null>(null);
    const overlayFrameRef = useRef<FrameHandle | null>(null);
    const minimapFrameRef = useRef<FrameHandle | null>(null);
    const helpTimerRef = useRef<ScheduledCancel>(null);
    const helpDismissTimerRef = useRef<ScheduledCancel>(null);
    const minimapDismissTimerRef = useRef<ScheduledCancel>(null);
    const scheduleDrawRef = useRef<() => void>(() => {});
    const restartHelpHintRef = useRef<() => void>(() => {});
    const refreshMinimapHudRef = useRef<(showMinimap?: boolean) => void>(() => {});
    const [viewportBounds, setViewportBounds] = useState<ViewportBounds | null>(null);

    const normalizedPercent = normalizePiecePercent(percent);
    const totalPieces =
        typeof pieceCount === "number" && Number.isFinite(pieceCount) && pieceCount > 0
            ? Math.round(pieceCount)
            : Math.max(64, Math.round(256 * Math.max(normalizedPercent, 0.1)));
    const cellSize = Math.max(1, visualizations.details.pieceMap.cell_size);
    const cellGap = Math.max(0, visualizations.details.pieceMap.cell_gap);
    const fallbackColumns = Math.max(1, visualizations.details.pieceMap.columns);
    const chunkInterval = Math.max(
        2,
        Math.round(visualizations.details.pieceMap.chunk_interval ?? 10),
    );
    const chunkGap = Math.max(cellGap, Math.round(cellGap * 1.5));
    const columns = useMemo(
        () =>
            resolveColumnCount(
                viewportBounds?.width ?? null,
                viewportBounds?.height ?? null,
                totalPieces,
                cellSize,
                cellGap,
                chunkInterval,
                chunkGap,
                fallbackColumns,
            ),
        [
            cellGap,
            cellSize,
            chunkGap,
            chunkInterval,
            fallbackColumns,
            totalPieces,
            viewportBounds,
        ],
    );
    const zoomLevels = layout.heatmap.zoomLevels;
    const indexOfOne = zoomLevels.indexOf(1);
    const firstLevelAtOrAboveOne =
        indexOfOne >= 0 ? indexOfOne : zoomLevels.findIndex((level) => level > 1);
    const initialZoomIndex = Math.max(0, firstLevelAtOrAboveOne);
    const [zoomIndex, setZoomIndex] = useState(initialZoomIndex);
    const pieceStatesLength = pieceStates?.length ?? 0;
    const availabilityLength = pieceAvailability?.length ?? 0;
    const rows = Math.max(1, Math.ceil(totalPieces / columns));
    const colAxis = useMemo(
        () => buildAxis(columns, cellSize, cellGap, chunkInterval, chunkGap),
        [cellGap, cellSize, chunkGap, chunkInterval, columns],
    );
    const rowAxis = useMemo(
        () => buildAxis(rows, cellSize, cellGap, chunkInterval, chunkGap),
        [cellGap, cellSize, chunkGap, chunkInterval, rows],
    );

    const hasBinaryPieceStates =
        pieceStatesLength >= totalPieces &&
        (pieceStates?.every((value) => value === 0 || value === 1) ?? false);
    const resolvedStates = useMemo(() => {
        if (pieceStates && pieceStates.length >= totalPieces) {
            return pieceStates
                .slice(0, totalPieces)
                .map((value) => resolveStatus(value, hasBinaryPieceStates));
        }
        const doneUntil = Math.round(totalPieces * normalizedPercent);
        return Array.from({ length: totalPieces }, (_, index) =>
            index < doneUntil ? "done" : "missing",
        );
    }, [hasBinaryPieceStates, normalizedPercent, pieceStates, totalPieces]);

    const availabilityMissing = availabilityLength === 0;
    const availability = useMemo(
        () =>
            Array.from({ length: totalPieces }, (_, index) => {
                const raw = pieceAvailability?.[index];
                if (typeof raw !== "number" || Number.isNaN(raw) || raw < 0) {
                    return 0;
                }
                return Math.floor(raw);
            }),
        [pieceAvailability, totalPieces],
    );
    const maxPeers = availability.reduce((max, value) => Math.max(max, value), 0) || 1;
    const rareThreshold = Math.max(1, Math.ceil(maxPeers * 0.15));
    const resolveTone = (pieceIndex: number): SwarmTone => {
        if ((resolvedStates[pieceIndex] ?? "missing") === "done") {
            return "verified";
        }
        if (availabilityMissing) {
            return "missing";
        }
        const peers = availability[pieceIndex] ?? 0;
        if (peers <= 0) {
            return "dead";
        }
        if (peers <= rareThreshold) {
            return "rare";
        }
        return "common";
    };

    let commonCount = 0;
    let rareCount = 0;
    let deadCount = 0;
    let verifiedCount = 0;
    for (let index = 0; index < totalPieces; index += 1) {
        const tone = resolveTone(index);
        if (tone === "verified") {
            verifiedCount += 1;
        } else if (tone === "common") {
            commonCount += 1;
        } else if (tone === "rare") {
            rareCount += 1;
        } else if (tone === "dead") {
            deadCount += 1;
        }
    }

    const missingCount = totalPieces - verifiedCount;
    const verifiedPercent =
        totalPieces > 0 ? Math.round((verifiedCount / totalPieces) * 100) : 0;
    const pieceSizeLabel = pieceSize
        ? formatBytes(pieceSize)
        : t("torrent_modal.stats.unknown_size");

    const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
    const [hoveredPiece, setHoveredPiece] = useState<HoveredPiece | null>(null);
    const [showHelpHint, setShowHelpHint] = useState(false);
    const [showMinimapHud, setShowMinimapHud] = useState(false);
    const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>();
    const [dragMode, setDragMode] = useState<DragMode>(null);

    const clearHelpHintTimers = () => {
        if (helpTimerRef.current) {
            helpTimerRef.current();
            helpTimerRef.current = null;
        }
        if (helpDismissTimerRef.current) {
            helpDismissTimerRef.current();
            helpDismissTimerRef.current = null;
        }
    };

    const clearMinimapTimer = () => {
        if (minimapDismissTimerRef.current) {
            minimapDismissTimerRef.current();
            minimapDismissTimerRef.current = null;
        }
    };

    const hasNavigated =
        (zoomLevels[zoomIndex] ?? 1) > MINIMAP_THRESHOLD ||
        Math.abs(offset.x) > NAVIGATION_EPSILON ||
        Math.abs(offset.y) > NAVIGATION_EPSILON ||
        dragModeRef.current !== null;
    const shouldShowMinimap =
        showMinimapHud &&
        ((zoomLevels[zoomIndex] ?? 1) > MINIMAP_THRESHOLD ||
            Math.abs(offset.x) > NAVIGATION_EPSILON ||
            Math.abs(offset.y) > NAVIGATION_EPSILON ||
            dragMode !== null);

    const restartHelpHintTimers = () => {
        clearHelpHintTimers();
        setShowHelpHint(false);
        helpTimerRef.current = scheduler.scheduleTimeout(() => {
            if (dragModeRef.current === null) {
                setShowHelpHint(true);
            }
        }, HUD_HELP_DELAY_MS);
        helpDismissTimerRef.current = scheduler.scheduleTimeout(() => {
            setShowHelpHint(false);
        }, HELP_HINT_VISIBLE_MS);
    };

    const refreshMinimapHud = (showMinimap = false) => {
        clearMinimapTimer();
        const minimapUseful = showMinimap || hasNavigated;
        setShowMinimapHud(minimapUseful);
        if (minimapUseful) {
            minimapDismissTimerRef.current = scheduler.scheduleTimeout(() => {
                setShowMinimapHud(false);
            }, HUD_MINIMAP_IDLE_MS);
        }
    };
    restartHelpHintRef.current = restartHelpHintTimers;
    refreshMinimapHudRef.current = refreshMinimapHud;

    const readCell = (clientX: number, clientY: number) => {
        const drawState = drawStateRef.current;
        const root = rootRef.current;
        if (!drawState || !root) {
            return null;
        }
        const rect = root.getBoundingClientRect();
        const worldX = drawState.offset.x + (clientX - rect.left) / drawState.zoom;
        const worldY = drawState.offset.y + (clientY - rect.top) / drawState.zoom;
        const col = fitIndex(worldX, colAxis.starts, cellSize);
        const row = fitIndex(worldY, rowAxis.starts, cellSize);
        if (col == null || row == null) {
            return null;
        }
        const pieceIndex = row * columns + col;
        if (pieceIndex < 0 || pieceIndex >= totalPieces) {
            return null;
        }
        return {
            pieceIndex,
            row,
            col,
            peers: availability[pieceIndex] ?? 0,
            tone: resolveTone(pieceIndex),
            cellX: colAxis.starts[col] ?? 0,
            cellY: rowAxis.starts[row] ?? 0,
            zoom: drawState.zoom,
            offset: drawState.offset,
        };
    };

    const applyZoom = (nextIndex: number, clientX: number, clientY: number) => {
        const drawState = drawStateRef.current;
        const root = rootRef.current;
        if (!drawState || !root) {
            setZoomIndex(nextIndex);
            return;
        }
        const rect = root.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const worldX = drawState.offset.x + localX / drawState.zoom;
        const worldY = drawState.offset.y + localY / drawState.zoom;
        const nextZoom = drawState.fitZoom * (zoomLevels[nextIndex] ?? 1);
        setZoomIndex(nextIndex);
        setOffset(
            clampOffset(
                {
                    x: worldX - localX / nextZoom,
                    y: worldY - localY / nextZoom,
                },
                drawState.viewportWidth,
                drawState.viewportHeight,
                colAxis.total,
                rowAxis.total,
                nextZoom,
            ),
        );
    };

    const scheduleDraw = () => {
        if (frameRef.current) {
            cancelScheduledFrame(frameRef.current);
        }
        frameRef.current = scheduleFrame(() => {
            const canvas = canvasRef.current;
            if (!canvas) {
                return;
            }
            const measuredViewportBounds = readViewportBounds(rootRef.current);
            if (
                measuredViewportBounds != null &&
                (measuredViewportBounds.width !== viewportBounds?.width ||
                    measuredViewportBounds.height !== viewportBounds?.height)
            ) {
                setViewportBounds(measuredViewportBounds);
                return;
            }
            const { cssW, cssH } = fitCanvasToContainer(
                canvas,
                rootRef.current,
                MIN_DRAW_DIMENSION,
            );
            if (cssW < MIN_DRAW_DIMENSION || cssH < MIN_DRAW_DIMENSION) {
                return;
            }
            const totalWidth = Math.max(colAxis.total, 1);
            const fitZoom = Math.max(MIN_VISIBLE_ZOOM, cssW / totalWidth);
            const zoom = fitZoom * (zoomLevels[zoomIndex] ?? 1);
            const nextOffset = clampOffset(
                offset,
                cssW,
                cssH,
                colAxis.total,
                rowAxis.total,
                zoom,
            );
            drawStateRef.current = {
                fitZoom,
                zoom,
                offset: nextOffset,
                viewportWidth: cssW,
                viewportHeight: cssH,
            };
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                return;
            }
            ctx.clearRect(0, 0, cssW, cssH);

            const worldLeft = nextOffset.x;
            const worldRight = nextOffset.x + cssW / zoom;
            const worldTop = nextOffset.y;
            const worldBottom = nextOffset.y + cssH / zoom;
            const rowStart = Math.max(0, fitIndex(worldTop, rowAxis.starts, cellSize) ?? 0);
            const rowEnd = Math.min(
                rows - 1,
                (fitIndex(worldBottom, rowAxis.starts, cellSize) ?? rows - 1) + 1,
            );
            const colStart = Math.max(0, fitIndex(worldLeft, colAxis.starts, cellSize) ?? 0);
            const colEnd = Math.min(
                columns - 1,
                (fitIndex(worldRight, colAxis.starts, cellSize) ?? columns - 1) + 1,
            );

            for (let row = rowStart; row <= rowEnd; row += 1) {
                const y = ((rowAxis.starts[row] ?? 0) - nextOffset.y) * zoom;
                for (let col = colStart; col <= colEnd; col += 1) {
                    const pieceIndex = row * columns + col;
                    if (pieceIndex >= totalPieces) {
                        break;
                    }
                    const x = ((colAxis.starts[col] ?? 0) - nextOffset.x) * zoom;
                    const size = cellSize * zoom;
                    const tone = resolveTone(pieceIndex);
                    if (tone === "verified") {
                        ctx.fillStyle = resolveCanvasColor(palette.success);
                        ctx.fillRect(x, y, size, size);
                        if (size >= 4) {
                            ctx.strokeStyle = palette.highlight;
                            ctx.globalAlpha = 0.35;
                            ctx.beginPath();
                            ctx.moveTo(x + 0.5, y + size - 0.5);
                            ctx.lineTo(x + 0.5, y + 0.5);
                            ctx.lineTo(x + size - 0.5, y + 0.5);
                            ctx.stroke();
                            ctx.strokeStyle = resolveCanvasColor(palette.foreground);
                            ctx.globalAlpha = 0.2;
                            ctx.beginPath();
                            ctx.moveTo(x + size - 0.5, y);
                            ctx.lineTo(x + size - 0.5, y + size - 0.5);
                            ctx.lineTo(x, y + size - 0.5);
                            ctx.stroke();
                            ctx.globalAlpha = 1;
                        }
                        continue;
                    }
                    if (tone === "common") {
                        ctx.fillStyle = resolveCanvasColor(palette.primary);
                        ctx.globalAlpha = 0.35;
                        ctx.fillRect(x, y, size, size);
                        ctx.globalAlpha = 1;
                    } else if (tone === "rare") {
                        ctx.fillStyle = resolveCanvasColor(palette.warning);
                        ctx.globalAlpha = 0.75;
                        ctx.fillRect(x, y, size, size);
                        ctx.globalAlpha = 1;
                    } else if (tone === "dead") {
                        ctx.fillStyle = resolveCanvasColor(palette.foreground);
                        ctx.globalAlpha = 0.12;
                        ctx.fillRect(x, y, size, size);
                        ctx.globalAlpha = 1;
                        ctx.strokeStyle = resolveCanvasColor(palette.danger);
                        ctx.lineWidth = Math.max(1, zoom * 0.15);
                        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, size - 1), Math.max(0, size - 1));
                    } else {
                        ctx.fillStyle = resolveCanvasColor(palette.foreground);
                        ctx.globalAlpha = 0.2;
                        ctx.fillRect(x, y, size, size);
                        ctx.globalAlpha = 1;
                    }
                    if (tone === "rare" && size >= 5) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(x, y, size, size);
                        ctx.clip();
                        ctx.strokeStyle = resolveCanvasColor(palette.foreground);
                        ctx.globalAlpha = 0.24;
                        ctx.lineWidth = Math.max(1, zoom * 0.14);
                        const stripeGap = Math.max(4, size * 0.4);
                        for (let stripe = -size; stripe < size * 2; stripe += stripeGap) {
                            ctx.beginPath();
                            ctx.moveTo(x + stripe, y + size);
                            ctx.lineTo(x + stripe + size, y);
                            ctx.stroke();
                        }
                        ctx.restore();
                        ctx.globalAlpha = 1;
                    }
                }
            }
        });
        if (overlayFrameRef.current) {
            cancelScheduledFrame(overlayFrameRef.current);
        }
        overlayFrameRef.current = scheduleFrame(() => {
            const overlay = overlayRef.current;
            const drawState = drawStateRef.current;
            if (!overlay || !drawState) {
                return;
            }
            fitCanvasToContainer(overlay, rootRef.current, MIN_DRAW_DIMENSION);
            const ctx = overlay.getContext("2d");
            if (!ctx) {
                return;
            }
            ctx.clearRect(0, 0, drawState.viewportWidth, drawState.viewportHeight);
            ctx.strokeStyle = resolveCanvasColor(palette.foreground);
            ctx.globalAlpha = 0.12;
            ctx.lineWidth = 1;
            for (let col = chunkInterval; col < columns; col += chunkInterval) {
                const x = ((colAxis.starts[col] ?? 0) - drawState.offset.x) * drawState.zoom;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, drawState.viewportHeight);
                ctx.stroke();
            }
            for (let row = chunkInterval; row < rows; row += chunkInterval) {
                const y = ((rowAxis.starts[row] ?? 0) - drawState.offset.y) * drawState.zoom;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(drawState.viewportWidth, y);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
            if (!hoveredPiece) {
                return;
            }
            const x = ((colAxis.starts[hoveredPiece.col] ?? 0) - drawState.offset.x) * drawState.zoom;
            const y = ((rowAxis.starts[hoveredPiece.row] ?? 0) - drawState.offset.y) * drawState.zoom;
            const size = cellSize * drawState.zoom;
            ctx.strokeStyle = resolveCanvasColor(palette.foreground);
            ctx.globalAlpha = 0.85;
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, size - 1), Math.max(0, size - 1));
            ctx.strokeStyle = resolveCanvasColor(palette.primary);
            ctx.globalAlpha = 0.9;
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 2, y + 2, Math.max(0, size - 4), Math.max(0, size - 4));
            ctx.globalAlpha = 1;
        });
        if (minimapFrameRef.current) {
            cancelScheduledFrame(minimapFrameRef.current);
        }
        minimapFrameRef.current = scheduleFrame(() => {
            const minimap = minimapRef.current;
            const drawState = drawStateRef.current;
            if (!minimap || !drawState || !shouldShowMinimap) {
                return;
            }
            const { cssW, cssH } = fitCanvasToContainer(minimap, minimap, 2);
            const ctx = minimap.getContext("2d");
            if (!ctx) {
                return;
            }
            ctx.clearRect(0, 0, cssW, cssH);
            const scale = Math.min(cssW / colAxis.total, cssH / rowAxis.total);
            const offsetX = (cssW - colAxis.total * scale) / 2;
            const offsetY = (cssH - rowAxis.total * scale) / 2;
            for (let pieceIndex = 0; pieceIndex < totalPieces; pieceIndex += 1) {
                const row = Math.floor(pieceIndex / columns);
                const col = pieceIndex % columns;
                const x = offsetX + (colAxis.starts[col] ?? 0) * scale;
                const y = offsetY + (rowAxis.starts[row] ?? 0) * scale;
                const size = Math.max(1, cellSize * scale);
                const tone = resolveTone(pieceIndex);
                ctx.fillStyle =
                    tone === "verified"
                        ? resolveCanvasColor(palette.success)
                        : tone === "common"
                            ? resolveCanvasColor(palette.primary)
                            : tone === "rare"
                                ? resolveCanvasColor(palette.warning)
                                : tone === "dead"
                                    ? resolveCanvasColor(palette.danger)
                                    : resolveCanvasColor(palette.foreground);
                if (tone === "common" || tone === "missing") {
                    ctx.globalAlpha = tone === "common" ? 0.35 : 0.2;
                }
                ctx.fillRect(x, y, size, size);
                ctx.globalAlpha = 1;
            }
            ctx.strokeStyle = palette.highlight;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(
                offsetX + drawState.offset.x * scale,
                offsetY + drawState.offset.y * scale,
                (drawState.viewportWidth / drawState.zoom) * scale,
                (drawState.viewportHeight / drawState.zoom) * scale,
            );
        });
    };
    scheduleDrawRef.current = scheduleDraw;

    useEffect(() => {
        scheduleDraw();
    }, [availability, colAxis, hoveredPiece, offset, palette, resolvedStates, rowAxis, zoomIndex]);

    useEffect(() => {
        if (!hoveredPiece || dragModeRef.current !== null) {
            setTooltipStyle(undefined);
            return;
        }

        const root = rootRef.current;
        const tooltip = tooltipRef.current;
        const drawState = drawStateRef.current;
        if (!root || !tooltip || !drawState) {
            return;
        }

        const cellLeft =
            ((colAxis.starts[hoveredPiece.col] ?? 0) - drawState.offset.x) * drawState.zoom;
        const cellTop =
            ((rowAxis.starts[hoveredPiece.row] ?? 0) - drawState.offset.y) * drawState.zoom;
        const cellExtent = cellSize * drawState.zoom;
        const tooltipRect = tooltip.getBoundingClientRect();
        const maxLeft = Math.max(
            TOOLTIP_EDGE_PADDING,
            drawState.viewportWidth - tooltipRect.width - TOOLTIP_EDGE_PADDING,
        );
        const maxTop = Math.max(
            TOOLTIP_EDGE_PADDING,
            drawState.viewportHeight - tooltipRect.height - TOOLTIP_EDGE_PADDING,
        );
        const left = clamp(
            cellLeft + cellExtent / 2 - tooltipRect.width / 2,
            TOOLTIP_EDGE_PADDING,
            maxLeft,
        );
        const aboveTop = cellTop - tooltipRect.height - TOOLTIP_GAP;
        const belowTop = cellTop + cellExtent + TOOLTIP_GAP;
        const fitsAbove = aboveTop >= TOOLTIP_EDGE_PADDING;
        const fitsBelow = belowTop <= maxTop;
        const preferredTop = fitsAbove || !fitsBelow ? aboveTop : belowTop;
        const top = clamp(preferredTop, TOOLTIP_EDGE_PADDING, maxTop);

        setTooltipStyle({ left, top, visibility: "visible" });
    }, [
        availabilityMissing,
        cellSize,
        colAxis,
        hoveredPiece,
        offset,
        pieceSizeLabel,
        rowAxis,
        zoomIndex,
    ]);

    useEffect(() => {
        const syncViewportBounds = () => {
            const nextBounds = readViewportBounds(rootRef.current);
            if (nextBounds == null) {
                return;
            }
            setViewportBounds((currentBounds) =>
                currentBounds?.width === nextBounds.width &&
                currentBounds?.height === nextBounds.height
                    ? currentBounds
                    : nextBounds,
            );
        };

        syncViewportBounds();
        const observer = new ResizeObserver(() => {
            syncViewportBounds();
            scheduleDrawRef.current();
        });
        if (rootRef.current) {
            observer.observe(rootRef.current);
        }
        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        const onMouseMove = (event: MouseEvent) => {
            const drawState = drawStateRef.current;
            if (!drawState) {
                return;
            }
            if (dragModeRef.current === "canvas") {
                refreshMinimapHudRef.current(true);
                setOffset(
                    clampOffset(
                        {
                            x:
                                dragStartRef.current.offset.x -
                                (event.clientX - dragStartRef.current.x) / drawState.zoom,
                            y:
                                dragStartRef.current.offset.y -
                                (event.clientY - dragStartRef.current.y) / drawState.zoom,
                        },
                        drawState.viewportWidth,
                        drawState.viewportHeight,
                        colAxis.total,
                        rowAxis.total,
                        drawState.zoom,
                    ),
                );
                return;
            }
            if (dragModeRef.current === "minimap") {
                const minimap = minimapRef.current;
                if (!minimap) {
                    return;
                }
                refreshMinimapHudRef.current(true);
                const rect = minimap.getBoundingClientRect();
                const scale = Math.min(rect.width / colAxis.total, rect.height / rowAxis.total);
                const originX = (rect.width - colAxis.total * scale) / 2;
                const originY = (rect.height - rowAxis.total * scale) / 2;
                setOffset(
                    clampOffset(
                        {
                            x:
                                (clamp(event.clientX - rect.left, 0, rect.width) - originX) /
                                Math.max(scale, MIN_MINIMAP_SCALE) -
                                drawState.viewportWidth / drawState.zoom / 2,
                            y:
                                (clamp(event.clientY - rect.top, 0, rect.height) - originY) /
                                Math.max(scale, MIN_MINIMAP_SCALE) -
                                drawState.viewportHeight / drawState.zoom / 2,
                        },
                        drawState.viewportWidth,
                        drawState.viewportHeight,
                        colAxis.total,
                        rowAxis.total,
                        drawState.zoom,
                    ),
                );
            }
        };
        const onMouseUp = () => {
            dragModeRef.current = null;
            setDragMode(null);
            restartHelpHintRef.current();
            refreshMinimapHudRef.current();
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [colAxis.total, rowAxis.total]);

    useEffect(
        () => () => {
            cancelScheduledFrame(frameRef.current);
            cancelScheduledFrame(overlayFrameRef.current);
            cancelScheduledFrame(minimapFrameRef.current);
            clearHelpHintTimers();
            clearMinimapTimer();
        },
        [],
    );

    const tooltipLines = useMemo(() => {
        if (!hoveredPiece) {
            return [];
        }
        const pieceLabel = t("torrent_modal.piece_map.tooltip_piece", {
            piece: hoveredPiece.pieceIndex + 1,
        });
        if (hoveredPiece.tone === "verified") {
            return [pieceLabel, `${pieceSizeLabel} • ${t("torrent_modal.stats.verified")}`];
        }
        return [
            pieceLabel,
            `${pieceSizeLabel} • ${t("torrent_modal.stats.missing")}`,
            availabilityMissing
                ? t("torrent_modal.piece_map.tooltip_availability_unknown")
                : t("torrent_modal.piece_map.tooltip_peers", {
                      peers: hoveredPiece.peers,
                  }),
        ];
    }, [availabilityMissing, hoveredPiece, pieceSizeLabel, t]);

    return {
        refs: {
            rootRef,
            canvasRef,
            overlayRef,
            minimapRef,
            tooltipRef,
        },
        palette,
        totalPieces,
        pieceSizeLabel,
        verifiedCount,
        verifiedPercent,
        missingCount,
        commonCount,
        rareCount,
        deadCount,
        availabilityMissing,
        hasBinaryPieceStates,
        zoomLabel: `x${(zoomLevels[zoomIndex] ?? 1).toFixed(1)}`,
        showMinimap: shouldShowMinimap,
        showHelpHint,
        isDragging: dragMode === "canvas",
        tooltipLines,
        tooltipStyle,
        controls: {
            canZoomIn: zoomIndex < zoomLevels.length - 1,
            canZoomOut: zoomIndex > 0,
            zoomIn: () => {
                const drawState = drawStateRef.current;
                if (!drawState || zoomIndex >= zoomLevels.length - 1) {
                    return;
                }
                restartHelpHintTimers();
                refreshMinimapHud(true);
                applyZoom(zoomIndex + 1, drawState.viewportWidth / 2, drawState.viewportHeight / 2);
            },
            zoomOut: () => {
                const drawState = drawStateRef.current;
                if (!drawState || zoomIndex <= 0) {
                    return;
                }
                restartHelpHintTimers();
                refreshMinimapHud(true);
                applyZoom(zoomIndex - 1, drawState.viewportWidth / 2, drawState.viewportHeight / 2);
            },
            reset: () => {
                setZoomIndex(initialZoomIndex);
                setOffset({ x: 0, y: 0 });
                restartHelpHintTimers();
                refreshMinimapHud(false);
            },
        },
        handlers: {
            onMouseMove: (event) => {
                if (dragModeRef.current !== null) {
                    return;
                }
                restartHelpHintTimers();
                const cell = readCell(event.clientX, event.clientY);
                if (!cell) {
                    setHoveredPiece(null);
                    setTooltipStyle(undefined);
                    return;
                }
                setHoveredPiece({
                    pieceIndex: cell.pieceIndex,
                    row: cell.row,
                    col: cell.col,
                    peers: cell.peers,
                    tone: cell.tone,
                });
            },
            onMouseLeave: () => {
                if (dragModeRef.current !== null) {
                    return;
                }
                setHoveredPiece(null);
                setTooltipStyle(undefined);
                setShowHelpHint(false);
            },
            onMouseDown: (event) => {
                const drawState = drawStateRef.current;
                if (!drawState) {
                    return;
                }
                setHoveredPiece(null);
                setTooltipStyle(undefined);
                dragModeRef.current = "canvas";
                restartHelpHintTimers();
                refreshMinimapHud(true);
                dragStartRef.current = {
                    x: event.clientX,
                    y: event.clientY,
                    offset: drawState.offset,
                };
                setDragMode("canvas");
            },
            onWheel: (event) => {
                event.preventDefault();
                if (event.deltaY === 0) return;
                const direction = event.deltaY < 0 ? 1 : -1;
                const wheelStep = clamp(
                    Math.ceil(Math.abs(event.deltaY) / 120),
                    1,
                    3,
                );
                const nextIndex = clamp(
                    zoomIndex + direction * wheelStep,
                    0,
                    zoomLevels.length - 1,
                );
                if (nextIndex === zoomIndex) return;
                restartHelpHintTimers();
                refreshMinimapHud(true);
                applyZoom(nextIndex, event.clientX, event.clientY);
            },
            onMinimapMouseDown: (event) => {
                dragModeRef.current = "minimap";
                setDragMode("minimap");
                setHoveredPiece(null);
                setTooltipStyle(undefined);
                restartHelpHintTimers();
                refreshMinimapHud(true);
                const drawState = drawStateRef.current;
                if (!drawState) {
                    return;
                }
                const rect = event.currentTarget.getBoundingClientRect();
                const scale = Math.min(rect.width / colAxis.total, rect.height / rowAxis.total);
                const originX = (rect.width - colAxis.total * scale) / 2;
                const originY = (rect.height - rowAxis.total * scale) / 2;
                setOffset(
                    clampOffset(
                        {
                            x:
                                (event.clientX - rect.left - originX) /
                                Math.max(scale, MIN_MINIMAP_SCALE) -
                                drawState.viewportWidth / drawState.zoom / 2,
                            y:
                                (event.clientY - rect.top - originY) /
                                Math.max(scale, MIN_MINIMAP_SCALE) -
                                drawState.viewportHeight / drawState.zoom / 2,
                        },
                        drawState.viewportWidth,
                        drawState.viewportHeight,
                        colAxis.total,
                        rowAxis.total,
                        drawState.zoom,
                    ),
                );
            },
        },
    };
}
