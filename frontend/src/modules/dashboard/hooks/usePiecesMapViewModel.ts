import type { CSSProperties, MouseEvent as ReactMouseEvent, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { registry } from "@/config/logic";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
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

const { visualizations } = registry;

const MIN_DRAW_DIMENSION = 2;
const TOOLTIP_GAP = 8;
const TOOLTIP_EDGE_PADDING = 10;
const FIXED_CELL_UNITS = 4;
const SEPARATOR_BLOCKS = 8;
const SEPARATOR_GUTTER_MULTIPLIER = 1.5;

type SwarmTone = "verified" | "common" | "rare" | "dead" | "missing";
type Axis = { starts: number[]; total: number };
type ViewportBounds = { width: number; height: number };
type DrawState = {
    fitZoom: number;
    viewportWidth: number;
    viewportHeight: number;
    contentOriginX: number;
    contentOriginY: number;
};
type DisplayTopology = {
    piecesPerBlock: number;
    blockCount: number;
    columns: number;
    rows: number;
    fitZoom: number;
};
type DisplayBlock = {
    blockIndex: number;
    row: number;
    col: number;
    startPieceIndex: number;
    endPieceIndex: number;
    pieceCount: number;
    totalSizeLabel: string;
    verifiedCount: number;
    missingCount: number;
    commonCount: number;
    rareCount: number;
    deadCount: number;
    isMixed: boolean;
    tone: SwarmTone;
    peerMin: number | null;
    peerMax: number | null;
};
type PointerState = {
    clientX: number;
    clientY: number;
    isInside: boolean;
};
type TooltipDetailSwatch = {
    tone: SwarmTone;
};
type TooltipDetail = {
    title: string;
    summary: string;
    availabilityLine: string | null;
    swatches: TooltipDetailSwatch[];
    swatchSize: number;
    swatchGap: number;
};
type CellBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
};
type TopologyMetrics = {
    topology: DisplayTopology;
    contentWidth: number;
    contentHeight: number;
    fitsHeight: boolean;
    coverageScore: number;
};

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
    separatorEvery = 0,
    separatorExtraGap = 0,
) => {
    if (count <= 0) {
        return 0;
    }

    const boundaries = Math.max(0, count - 1);
    const separatorCount =
        separatorEvery > 0 ? Math.floor(boundaries / separatorEvery) : 0;
    return (
        count * cellSize +
        boundaries * gap +
        separatorCount * Math.max(0, separatorExtraGap)
    );
};

const resolveSeparatorExtraGap = (baseGap: number) =>
    Math.max(2, Math.round(baseGap * SEPARATOR_GUTTER_MULTIPLIER));

const resolveAlignedColumns = (columns: number, totalCells: number) => {
    const safeColumns = clamp(columns, 1, Math.max(1, totalCells));
    if (safeColumns < SEPARATOR_BLOCKS || totalCells < SEPARATOR_BLOCKS) {
        return safeColumns;
    }
    const aligned = Math.floor(safeColumns / SEPARATOR_BLOCKS) * SEPARATOR_BLOCKS;
    return clamp(aligned, SEPARATOR_BLOCKS, Math.max(SEPARATOR_BLOCKS, totalCells));
};

const resolveContentOrigin = (
    viewportWidth: number,
    viewportHeight: number,
    contentWidth: number,
    contentHeight: number,
) => ({
    x: Math.max(0, (viewportWidth - contentWidth) / 2),
    y: Math.max(0, (viewportHeight - contentHeight) / 2),
});

const buildAxis = (
    count: number,
    cellSize: number,
    gap: number,
    separatorEvery: number,
    separatorExtraGap: number,
): Axis => {
    const starts = Array.from({ length: count }, () => 0);
    let cursor = 0;
    for (let index = 0; index < count; index += 1) {
        starts[index] = cursor;
        cursor += cellSize;
        if (index < count - 1) {
            cursor += gap;
            const nextCellBoundary = index + 1;
            if (
                separatorEvery > 0 &&
                nextCellBoundary % separatorEvery === 0
            ) {
                cursor += separatorExtraGap;
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
    return value < start + cellSize ? index : null;
};

const resolveColumnCount = (params: {
    viewportWidth: number | null;
    totalCells: number;
    cellSize: number;
    gap: number;
    fallbackColumns: number;
    maxColumns: number;
    separatorEvery: number;
    separatorExtraGap: number;
}) => {
    if (
        params.viewportWidth == null ||
        params.viewportWidth <= 0 ||
        params.totalCells <= 0
    ) {
        return resolveAlignedColumns(
            params.fallbackColumns,
            Math.max(1, params.totalCells),
        );
    }

    const maxColumns = clamp(params.maxColumns, 1, params.totalCells);
    let low = 1;
    let high = maxColumns;
    let best = 1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const contentWidth = estimateAxisTotal(
            mid,
            params.cellSize,
            params.gap,
            params.separatorEvery,
            params.separatorExtraGap,
        );
        if (contentWidth <= params.viewportWidth) {
            best = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return resolveAlignedColumns(best, params.totalCells);
};

const computeOverviewTopology = (params: {
    viewportWidth: number | null;
    viewportHeight: number | null;
    totalPieces: number;
    columns: number;
    piecesPerBlock: number;
    cellSize: number;
    gap: number;
}): DisplayTopology => {
    const blockCount = Math.max(1, Math.ceil(params.totalPieces / params.piecesPerBlock));
    const columns = Math.max(1, Math.min(params.columns, blockCount));
    const rows = Math.max(1, Math.ceil(blockCount / columns));

    return {
        piecesPerBlock: params.piecesPerBlock,
        blockCount,
        columns,
        rows,
        fitZoom: 1,
    };
};

const resolveTopologyMetrics = (params: {
    viewportWidth: number | null;
    viewportHeight: number | null;
    totalPieces: number;
    piecesPerBlock: number;
    cellSize: number;
    gap: number;
    fallbackColumns: number;
}): TopologyMetrics => {
    const blockCount = Math.max(1, Math.ceil(params.totalPieces / params.piecesPerBlock));
    const separatorExtraGap = resolveSeparatorExtraGap(params.gap);
    const maxColumns =
        params.viewportWidth != null && params.viewportWidth > 0
            ? blockCount
            : Math.min(params.fallbackColumns, blockCount);
    const columns = resolveColumnCount({
        viewportWidth: params.viewportWidth,
        totalCells: blockCount,
        cellSize: params.cellSize,
        gap: params.gap,
        fallbackColumns: Math.min(params.fallbackColumns, blockCount),
        maxColumns,
        separatorEvery: SEPARATOR_BLOCKS,
        separatorExtraGap,
    });
    const topology = computeOverviewTopology({
        viewportWidth: params.viewportWidth,
        viewportHeight: params.viewportHeight,
        totalPieces: params.totalPieces,
        columns,
        piecesPerBlock: params.piecesPerBlock,
        cellSize: params.cellSize,
        gap: params.gap,
    });
    const contentWidth = estimateAxisTotal(
        topology.columns,
        params.cellSize,
        params.gap,
        SEPARATOR_BLOCKS,
        separatorExtraGap,
    );
    const contentHeight = estimateAxisTotal(
        topology.rows,
        params.cellSize,
        params.gap,
        SEPARATOR_BLOCKS,
        separatorExtraGap,
    );
    const fitsHeight =
        params.viewportHeight == null ||
        params.viewportHeight <= 0 ||
        contentHeight <= params.viewportHeight;
    const coverageX =
        params.viewportWidth != null && params.viewportWidth > 0
            ? clamp(contentWidth / params.viewportWidth, 0, 1)
            : 1;
    const coverageY =
        params.viewportHeight != null && params.viewportHeight > 0
            ? clamp(contentHeight / params.viewportHeight, 0, 1)
            : 1;

    return {
        topology,
        contentWidth,
        contentHeight,
        fitsHeight,
        coverageScore: coverageX * coverageY,
    };
};

const resolvePiecesPerBlockCandidates = (params: {
    viewportWidth: number;
    viewportHeight: number;
    totalPieces: number;
    cellSize: number;
    gap: number;
}) => {
    const approxColumns = Math.max(
        1,
        Math.floor((params.viewportWidth + params.gap) / Math.max(1, params.cellSize + params.gap)),
    );
    const approxRows = Math.max(
        1,
        Math.floor((params.viewportHeight + params.gap) / Math.max(1, params.cellSize + params.gap)),
    );
    const maxRenderableBlocks = Math.max(1, approxColumns * approxRows);
    const maxBlockCountToInspect = Math.max(1, Math.min(params.totalPieces, maxRenderableBlocks));
    const candidates = new Set<number>();
    candidates.add(1);
    candidates.add(Math.max(1, params.totalPieces));

    let blockCount = 1;
    while (blockCount <= maxBlockCountToInspect) {
        const piecesPerBlock = Math.max(1, Math.ceil(params.totalPieces / blockCount));
        candidates.add(piecesPerBlock);
        if (piecesPerBlock <= 1) {
            break;
        }
        const nextBlockCount =
            Math.floor((params.totalPieces - 1) / Math.max(1, piecesPerBlock - 1)) + 1;
        blockCount = Math.max(blockCount + 1, nextBlockCount);
    }

    return Array.from(candidates).sort((left, right) => left - right);
};

const resolveOverviewTopology = (params: {
    viewportWidth: number | null;
    viewportHeight: number | null;
    totalPieces: number;
    cellSize: number;
    gap: number;
    fallbackColumns: number;
}): DisplayTopology => {
    if (params.totalPieces <= 0) {
        return computeOverviewTopology({
            viewportWidth: params.viewportWidth,
            viewportHeight: params.viewportHeight,
            totalPieces: 1,
            columns: 1,
            piecesPerBlock: 1,
            cellSize: params.cellSize,
            gap: params.gap,
        });
    }

    if (
        params.viewportWidth == null ||
        params.viewportWidth <= 0 ||
        params.viewportHeight == null ||
        params.viewportHeight <= 0
    ) {
        return computeOverviewTopology({
            viewportWidth: params.viewportWidth,
            viewportHeight: params.viewportHeight,
            totalPieces: params.totalPieces,
            columns: Math.min(params.fallbackColumns, params.totalPieces),
            piecesPerBlock: 1,
            cellSize: params.cellSize,
            gap: params.gap,
        });
    }

    const candidates = resolvePiecesPerBlockCandidates({
        viewportWidth: params.viewportWidth,
        viewportHeight: params.viewportHeight,
        totalPieces: params.totalPieces,
        cellSize: params.cellSize,
        gap: params.gap,
    });

    let best: TopologyMetrics | null = null;
    let fallback: TopologyMetrics | null = null;

    for (const piecesPerBlock of candidates) {
        const metrics = resolveTopologyMetrics({
            viewportWidth: params.viewportWidth,
            viewportHeight: params.viewportHeight,
            totalPieces: params.totalPieces,
            piecesPerBlock,
            cellSize: params.cellSize,
            gap: params.gap,
            fallbackColumns: params.fallbackColumns,
        });

        if (!fallback || metrics.coverageScore > fallback.coverageScore + 1e-6) {
            fallback = metrics;
        }

        if (!metrics.fitsHeight) {
            continue;
        }
        if (!best) {
            best = metrics;
            continue;
        }
        if (metrics.coverageScore > best.coverageScore + 1e-6) {
            best = metrics;
            continue;
        }
        if (Math.abs(metrics.coverageScore - best.coverageScore) > 1e-6) {
            continue;
        }
        const metricsHeightCoverage =
            params.viewportHeight > 0 ? metrics.contentHeight / params.viewportHeight : 1;
        const bestHeightCoverage =
            params.viewportHeight > 0 ? best.contentHeight / params.viewportHeight : 1;
        if (metricsHeightCoverage > bestHeightCoverage + 1e-6) {
            best = metrics;
            continue;
        }
        if (
            Math.abs(metricsHeightCoverage - bestHeightCoverage) <= 1e-6 &&
            metrics.topology.piecesPerBlock < best.topology.piecesPerBlock
        ) {
            best = metrics;
        }
    }

    return best?.topology ?? fallback?.topology ?? computeOverviewTopology({
        viewportWidth: params.viewportWidth,
        viewportHeight: params.viewportHeight,
        totalPieces: params.totalPieces,
        columns: Math.min(params.fallbackColumns, params.totalPieces),
        piecesPerBlock: 1,
        cellSize: params.cellSize,
        gap: params.gap,
    });
};

const resolveCellPieceRange = (params: {
    row: number;
    col: number;
    topology: DisplayTopology;
    totalPieces: number;
}) => {
    if (
        params.row < 0 ||
        params.col < 0 ||
        params.row >= params.topology.rows ||
        params.col >= params.topology.columns
    ) {
        return null;
    }

    const blockIndex = params.row * params.topology.columns + params.col;
    if (blockIndex >= params.topology.blockCount) {
        return null;
    }

    const startPieceIndex = blockIndex * params.topology.piecesPerBlock;
    if (startPieceIndex >= params.totalPieces) {
        return null;
    }

    return {
        startPieceIndex,
        endPieceIndex: Math.min(
            params.totalPieces - 1,
            startPieceIndex + params.topology.piecesPerBlock - 1,
        ),
    };
};

const resolveRenderedCellBounds = (params: {
    x: number;
    y: number;
    size: number;
}): CellBounds => {
    return {
        x: params.x,
        y: params.y,
        width: Math.max(1, params.size),
        height: Math.max(1, params.size),
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

export const piecesMapTopologyInternals = {
    computeOverviewTopology,
    resolveOverviewTopology,
    resolveCellPieceRange,
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
        tooltipRef: RefObject<HTMLDivElement | null>;
    };
    palette: ReturnType<typeof useCanvasPalette>;
    totalPieces: number;
    pieceSizeLabel: string;
    verifiedCount: number;
    verifiedPercent: number;
    missingCount: number;
    rareCount: number;
    deadCount: number;
    availabilityMissing: boolean;
    tooltipDetail: TooltipDetail | null;
    tooltipStyle?: CSSProperties;
    handlers: {
        onMouseMove: (event: ReactMouseEvent<HTMLCanvasElement>) => void;
        onMouseLeave: () => void;
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
    const { unit } = useLayoutMetrics();
    const palette = useCanvasPalette();
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const drawStateRef = useRef<DrawState | null>(null);
    const frameRef = useRef<FrameHandle | null>(null);
    const overlayFrameRef = useRef<FrameHandle | null>(null);
    const pointerRef = useRef<PointerState>({
        clientX: 0,
        clientY: 0,
        isInside: false,
    });
    const scheduleDrawRef = useRef<() => void>(() => {});
    const [viewportBounds, setViewportBounds] = useState<ViewportBounds | null>(null);
    const normalizedPercent = normalizePiecePercent(percent);
    const totalPieces =
        typeof pieceCount === "number" && Number.isFinite(pieceCount) && pieceCount > 0
            ? Math.round(pieceCount)
            : Math.max(64, Math.round(256 * Math.max(normalizedPercent, 0.1)));
    const cellSize = Math.max(1, Math.round(unit * FIXED_CELL_UNITS));
    const cellGap = Math.max(1, Math.round(unit));
    const fallbackColumns = Math.max(1, visualizations.details.pieceMap.columns);

    const displayTopology = useMemo(
        () =>
            resolveOverviewTopology({
                viewportWidth: viewportBounds?.width ?? null,
                viewportHeight: viewportBounds?.height ?? null,
                totalPieces,
                cellSize,
                gap: cellGap,
                fallbackColumns,
            }),
        [cellGap, cellSize, fallbackColumns, totalPieces, viewportBounds],
    );
    const columns = displayTopology.columns;
    const rows = displayTopology.rows;
    const displayCellCount = columns * rows;
    const separatorExtraGap = useMemo(
        () => resolveSeparatorExtraGap(cellGap),
        [cellGap],
    );
    const colAxis = useMemo(
        () =>
            buildAxis(
                columns,
                cellSize,
                cellGap,
                SEPARATOR_BLOCKS,
                separatorExtraGap,
            ),
        [cellGap, cellSize, columns, separatorExtraGap],
    );
    const rowAxis = useMemo(
        () =>
            buildAxis(
                rows,
                cellSize,
                cellGap,
                SEPARATOR_BLOCKS,
                separatorExtraGap,
            ),
        [cellGap, cellSize, rows, separatorExtraGap],
    );

    const pieceStatesLength = pieceStates?.length ?? 0;
    const availabilityLength = pieceAvailability?.length ?? 0;
    const hasBinaryPieceStates =
        pieceStatesLength >= totalPieces && (pieceStates?.every((value) => value === 0 || value === 1) ?? false);
    const resolvedStates = useMemo(() => {
        if (pieceStates && pieceStates.length >= totalPieces) {
            return pieceStates.slice(0, totalPieces).map((value) => resolveStatus(value, hasBinaryPieceStates));
        }
        const doneUntil = Math.round(totalPieces * normalizedPercent);
        return Array.from({ length: totalPieces }, (_, index) => (index < doneUntil ? "done" : "missing"));
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

    const displayBlocks = useMemo<Array<DisplayBlock | null>>(
        () =>
            Array.from({ length: displayCellCount }, (_, blockIndex) => {
                const row = Math.floor(blockIndex / columns);
                const col = blockIndex % columns;
                const pieceRange = resolveCellPieceRange({
                    row,
                    col,
                    topology: displayTopology,
                    totalPieces,
                });
                if (!pieceRange) {
                    return null;
                }

                let verifiedInBlock = 0;
                let commonInBlock = 0;
                let deadInBlock = 0;
                let rareInBlock = 0;
                let peerMin: number | null = null;
                let peerMax: number | null = null;

                for (
                    let pieceIndex = pieceRange.startPieceIndex;
                    pieceIndex <= pieceRange.endPieceIndex;
                    pieceIndex += 1
                ) {
                    const state = resolvedStates[pieceIndex] ?? "missing";
                    if (state === "done") {
                        verifiedInBlock += 1;
                        continue;
                    }
                    if (availabilityMissing) {
                        continue;
                    }

                    const peers = availability[pieceIndex] ?? 0;
                    peerMin = peerMin == null ? peers : Math.min(peerMin, peers);
                    peerMax = peerMax == null ? peers : Math.max(peerMax, peers);
                    if (peers <= 0) {
                        deadInBlock += 1;
                    } else if (peers <= rareThreshold) {
                        rareInBlock += 1;
                    } else {
                        commonInBlock += 1;
                    }
                }

                const pieceCount = pieceRange.endPieceIndex - pieceRange.startPieceIndex + 1;
                const missingInBlock = pieceCount - verifiedInBlock;
                const composition: Array<{ tone: SwarmTone; count: number }> = [
                    { tone: "verified", count: verifiedInBlock },
                    { tone: "common", count: commonInBlock },
                    { tone: "rare", count: rareInBlock },
                    { tone: "dead", count: deadInBlock },
                    { tone: "missing", count: availabilityMissing ? missingInBlock : 0 },
                ];
                const dominantTone = composition.reduce(
                    (best, entry) => {
                        if (entry.count > best.count) {
                            return entry;
                        }
                        if (entry.count === best.count && entry.count > 0) {
                            const weight = {
                                dead: 5,
                                rare: 4,
                                common: 3,
                                missing: 2,
                                verified: 1,
                            } satisfies Record<SwarmTone, number>;
                            return weight[entry.tone] > weight[best.tone] ? entry : best;
                        }
                        return best;
                    },
                    composition[0] ?? { tone: "verified" as SwarmTone, count: 0 },
                );

                return {
                    blockIndex,
                    row,
                    col,
                    startPieceIndex: pieceRange.startPieceIndex,
                    endPieceIndex: pieceRange.endPieceIndex,
                    pieceCount,
                    totalSizeLabel: pieceSize
                        ? formatBytes(pieceSize * pieceCount)
                        : t("torrent_modal.stats.unknown_size"),
                    verifiedCount: verifiedInBlock,
                    missingCount: missingInBlock,
                    commonCount: commonInBlock,
                    rareCount: rareInBlock,
                    deadCount: deadInBlock,
                    isMixed: composition.filter((entry) => entry.count > 0).length > 1,
                    tone:
                        dominantTone.count > 0
                            ? dominantTone.tone
                            : availabilityMissing && missingInBlock > 0
                              ? "missing"
                              : "verified",
                    peerMin,
                    peerMax,
                };
            }),
        [
            availability,
            availabilityMissing,
            columns,
            displayCellCount,
            displayTopology,
            pieceSize,
            rareThreshold,
            resolvedStates,
            t,
            totalPieces,
        ],
    );

    let rareCount = 0;
    let deadCount = 0;
    let verifiedCount = 0;
    for (let index = 0; index < totalPieces; index += 1) {
        const tone = resolveTone(index);
        if (tone === "verified") {
            verifiedCount += 1;
        } else if (tone === "rare") {
            rareCount += 1;
        } else if (tone === "dead") {
            deadCount += 1;
        }
    }

    const missingCount = totalPieces - verifiedCount;
    const verifiedPercent = totalPieces > 0 ? Math.round((verifiedCount / totalPieces) * 100) : 0;
    const pieceSizeLabel = pieceSize ? formatBytes(pieceSize) : t("torrent_modal.stats.unknown_size");

    const [hoveredBlock, setHoveredBlock] = useState<DisplayBlock | null>(null);
    const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>();

    useEffect(() => {
        pointerRef.current.isInside = false;
        setHoveredBlock(null);
        setTooltipStyle(undefined);
    }, [totalPieces]);

    const readCell = (clientX: number, clientY: number) => {
        const drawState = drawStateRef.current;
        const root = rootRef.current;
        if (!drawState || !root) {
            return null;
        }

        const rect = root.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const worldX =
            (localX - drawState.contentOriginX) / Math.max(drawState.fitZoom, 1e-6);
        const worldY =
            (localY - drawState.contentOriginY) / Math.max(drawState.fitZoom, 1e-6);
        const col = fitIndex(worldX, colAxis.starts, cellSize);
        const row = fitIndex(worldY, rowAxis.starts, cellSize);
        if (col == null || row == null) {
            return null;
        }

        const block = displayBlocks[row * columns + col] ?? null;
        if (!block) {
            return null;
        }

        const bounds = resolveRenderedCellBounds({
            x:
                drawState.contentOriginX +
                (colAxis.starts[block.col] ?? 0) * drawState.fitZoom,
            y:
                drawState.contentOriginY +
                (rowAxis.starts[block.row] ?? 0) * drawState.fitZoom,
            size: cellSize * drawState.fitZoom,
        });
        const isInsideRenderedCell =
            localX >= bounds.x &&
            localX <= bounds.x + bounds.width &&
            localY >= bounds.y &&
            localY <= bounds.y + bounds.height;
        return isInsideRenderedCell ? block : null;
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

            const { cssW, cssH } = fitCanvasToContainer(canvas, rootRef.current, MIN_DRAW_DIMENSION);
            if (cssW < MIN_DRAW_DIMENSION || cssH < MIN_DRAW_DIMENSION) {
                return;
            }

            const fitZoom = Math.max(displayTopology.fitZoom, 1e-6);
            const contentWidth = colAxis.total * fitZoom;
            const contentHeight = rowAxis.total * fitZoom;
            const origin = resolveContentOrigin(cssW, cssH, contentWidth, contentHeight);
            drawStateRef.current = {
                fitZoom,
                viewportWidth: cssW,
                viewportHeight: cssH,
                contentOriginX: origin.x,
                contentOriginY: origin.y,
            };
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                return;
            }

            ctx.clearRect(0, 0, cssW, cssH);
            const size = cellSize * displayTopology.fitZoom;
            for (const block of displayBlocks) {
                if (!block) {
                    continue;
                }

                const bounds = resolveRenderedCellBounds({
                    x: origin.x + (colAxis.starts[block.col] ?? 0) * fitZoom,
                    y: origin.y + (rowAxis.starts[block.row] ?? 0) * fitZoom,
                    size,
                });

                if (block.tone === "verified") {
                    ctx.fillStyle = resolveCanvasColor(palette.success);
                    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
                } else if (block.tone === "common") {
                    ctx.fillStyle = resolveCanvasColor(palette.primary);
                    ctx.globalAlpha = 0.35;
                    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
                    ctx.globalAlpha = 1;
                } else if (block.tone === "rare") {
                    ctx.fillStyle = resolveCanvasColor(palette.warning);
                    ctx.globalAlpha = 0.75;
                    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
                    ctx.globalAlpha = 1;
                } else if (block.tone === "dead") {
                    ctx.fillStyle = resolveCanvasColor(palette.foreground);
                    ctx.globalAlpha = 0.12;
                    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
                    ctx.globalAlpha = 1;
                    ctx.strokeStyle = resolveCanvasColor(palette.danger);
                    ctx.lineWidth = Math.max(1, displayTopology.fitZoom * 0.12);
                    ctx.strokeRect(
                        bounds.x + 0.5,
                        bounds.y + 0.5,
                        Math.max(0, bounds.width - 1),
                        Math.max(0, bounds.height - 1),
                    );
                } else {
                    ctx.fillStyle = resolveCanvasColor(palette.foreground);
                    ctx.globalAlpha = 0.18;
                    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
                    ctx.globalAlpha = 1;
                }

                if (block.tone === "rare" && Math.min(bounds.width, bounds.height) >= 5) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
                    ctx.clip();
                    ctx.strokeStyle = resolveCanvasColor(palette.foreground);
                    ctx.globalAlpha = 0.22;
                    ctx.lineWidth = Math.max(1, displayTopology.fitZoom * 0.12);
                    const stripeGap = Math.max(4, Math.min(bounds.width, bounds.height) * 0.4);
                    for (
                        let stripe = -Math.min(bounds.width, bounds.height);
                        stripe < Math.max(bounds.width, bounds.height) * 2;
                        stripe += stripeGap
                    ) {
                        ctx.beginPath();
                        ctx.moveTo(bounds.x + stripe, bounds.y + bounds.height);
                        ctx.lineTo(bounds.x + stripe + bounds.height, bounds.y);
                        ctx.stroke();
                    }
                    ctx.restore();
                    ctx.globalAlpha = 1;
                }

                if (block.isMixed && Math.min(bounds.width, bounds.height) >= 6) {
                    const markerSize = Math.max(4, Math.min(bounds.width, bounds.height) * 0.24);
                    ctx.fillStyle = resolveCanvasColor(palette.foreground);
                    ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(bounds.x + bounds.width, bounds.y);
                    ctx.lineTo(bounds.x + bounds.width - markerSize, bounds.y);
                    ctx.lineTo(bounds.x + bounds.width, bounds.y + markerSize);
                    ctx.closePath();
                    ctx.fill();
                    ctx.globalAlpha = 1;
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
            const size = cellSize * drawState.fitZoom;

            if (hoveredBlock) {
                const hoveredBounds = resolveRenderedCellBounds({
                    x:
                        drawState.contentOriginX +
                        (colAxis.starts[hoveredBlock.col] ?? 0) * drawState.fitZoom,
                    y:
                        drawState.contentOriginY +
                        (rowAxis.starts[hoveredBlock.row] ?? 0) * drawState.fitZoom,
                    size,
                });
                ctx.strokeStyle = resolveCanvasColor(palette.foreground);
                ctx.globalAlpha = 0.82;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(
                    hoveredBounds.x + 0.5,
                    hoveredBounds.y + 0.5,
                    Math.max(0, hoveredBounds.width - 1),
                    Math.max(0, hoveredBounds.height - 1),
                );
                ctx.globalAlpha = 1;
            }
        });
    };
    scheduleDrawRef.current = scheduleDraw;

    useEffect(() => {
        scheduleDraw();
    }, [cellSize, colAxis, columns, displayBlocks, displayTopology, hoveredBlock, palette, rowAxis, rows, viewportBounds]);

    useEffect(() => {
        if (!pointerRef.current.isInside) {
            return;
        }
        setHoveredBlock(readCell(pointerRef.current.clientX, pointerRef.current.clientY));
    }, [colAxis, displayBlocks, rowAxis]);

    useEffect(() => {
        if (!hoveredBlock) {
            setTooltipStyle(undefined);
            return;
        }

        const tooltip = tooltipRef.current;
        const drawState = drawStateRef.current;
        if (!tooltip || !drawState) {
            return;
        }

        const bounds = resolveRenderedCellBounds({
            x:
                drawState.contentOriginX +
                (colAxis.starts[hoveredBlock.col] ?? 0) * drawState.fitZoom,
            y:
                drawState.contentOriginY +
                (rowAxis.starts[hoveredBlock.row] ?? 0) * drawState.fitZoom,
            size: cellSize * drawState.fitZoom,
        });
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
            bounds.x + bounds.width / 2 - tooltipRect.width / 2,
            TOOLTIP_EDGE_PADDING,
            maxLeft,
        );
        const aboveTop = bounds.y - tooltipRect.height - TOOLTIP_GAP;
        const belowTop = bounds.y + bounds.height + TOOLTIP_GAP;
        const preferredTop = aboveTop >= TOOLTIP_EDGE_PADDING || belowTop > maxTop ? aboveTop : belowTop;
        const top = clamp(preferredTop, TOOLTIP_EDGE_PADDING, maxTop);

        setTooltipStyle({ left, top, visibility: "visible" });
    }, [cellSize, colAxis, columns, displayTopology, hoveredBlock, rowAxis, rows]);

    useEffect(() => {
        const syncViewportBounds = () => {
            const nextBounds = readViewportBounds(rootRef.current);
            if (nextBounds == null) {
                return;
            }
            setViewportBounds((currentBounds) =>
                currentBounds?.width === nextBounds.width && currentBounds?.height === nextBounds.height
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

    useEffect(
        () => () => {
            cancelScheduledFrame(frameRef.current);
            cancelScheduledFrame(overlayFrameRef.current);
        },
        [],
    );

    const formatAvailabilitySummary = (block: DisplayBlock | null) => {
        if (!block || block.missingCount <= 0) {
            return null;
        }
        if (availabilityMissing || block.peerMin == null || block.peerMax == null) {
            return t("torrent_modal.piece_map.tooltip_availability_unknown");
        }
        return block.peerMin === block.peerMax
            ? t("torrent_modal.piece_map.tooltip_available_peers", {
                  peers: block.peerMin,
              })
            : t("torrent_modal.piece_map.tooltip_peers_range", {
                  min: block.peerMin,
                  max: block.peerMax,
              });
    };

    const tooltipDetail = useMemo<TooltipDetail | null>(() => {
        if (!hoveredBlock) {
            return null;
        }

        const titlePrefix =
            hoveredBlock.pieceCount === 1
                ? t("torrent_modal.piece_map.tooltip_piece", {
                      piece: hoveredBlock.startPieceIndex + 1,
                  })
                : t("torrent_modal.piece_map.tooltip_piece_range", {
                      start: hoveredBlock.startPieceIndex + 1,
                      end: hoveredBlock.endPieceIndex + 1,
                  });
        const title = `${titlePrefix}, ${hoveredBlock.totalSizeLabel}`;
        const summaryParts = [
            hoveredBlock.verifiedCount > 0
                ? t("torrent_modal.piece_map.tooltip_state_count", {
                      count: hoveredBlock.verifiedCount,
                      state: t("torrent_modal.stats.verified"),
                  })
                : null,
            hoveredBlock.commonCount > 0
                ? t("torrent_modal.piece_map.tooltip_state_count", {
                      count: hoveredBlock.commonCount,
                      state: t("torrent_modal.availability.legend_common"),
                  })
                : null,
            hoveredBlock.rareCount > 0
                ? t("torrent_modal.piece_map.tooltip_state_count", {
                      count: hoveredBlock.rareCount,
                      state: t("torrent_modal.availability.legend_rare"),
                  })
                : null,
            hoveredBlock.deadCount > 0
                ? t("torrent_modal.piece_map.tooltip_state_count", {
                      count: hoveredBlock.deadCount,
                      state: t("torrent_modal.piece_map.legend_dead"),
                  })
                : null,
            hoveredBlock.missingCount > 0
                ? t("torrent_modal.piece_map.tooltip_state_count", {
                      count: hoveredBlock.missingCount,
                      state: t("torrent_modal.stats.missing"),
                  })
                : null,
        ].filter((value): value is string => Boolean(value));
        const summary = summaryParts.join(" · ");
        const swatches = Array.from(
            { length: hoveredBlock.pieceCount },
            (_, offset): TooltipDetailSwatch => {
                const pieceIndex = hoveredBlock.startPieceIndex + offset;
                const state = resolvedStates[pieceIndex] ?? "missing";
                if (state === "done") {
                    return { tone: "verified" };
                }
                if (availabilityMissing) {
                    return { tone: "missing" };
                }
                const peers = availability[pieceIndex] ?? 0;
                if (peers <= 0) {
                    return { tone: "dead" };
                }
                if (peers <= rareThreshold) {
                    return { tone: "rare" };
                }
                return { tone: "common" };
            },
        );

        const availabilityLine = formatAvailabilitySummary(hoveredBlock);

        return {
            title,
            summary,
            availabilityLine,
            swatches,
            swatchSize: cellSize,
            swatchGap: cellGap,
        };
    }, [
        availability,
        availabilityMissing,
        cellGap,
        cellSize,
        hoveredBlock,
        rareThreshold,
        resolvedStates,
        t,
    ]);

    return {
        refs: {
            rootRef,
            canvasRef,
            overlayRef,
            tooltipRef,
        },
        palette,
        totalPieces,
        pieceSizeLabel,
        verifiedCount,
        verifiedPercent,
        missingCount,
        rareCount,
        deadCount,
        availabilityMissing,
        tooltipDetail,
        tooltipStyle,
        handlers: {
            onMouseMove: (event) => {
                pointerRef.current = {
                    clientX: event.clientX,
                    clientY: event.clientY,
                    isInside: true,
                };
                setHoveredBlock(readCell(event.clientX, event.clientY));
            },
            onMouseLeave: () => {
                pointerRef.current.isInside = false;
                setHoveredBlock(null);
                setTooltipStyle(undefined);
            },
        },
    };
}
