import type { CSSProperties, MouseEvent as ReactMouseEvent, RefObject, WheelEvent as ReactWheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { scheduler } from "@/app/services/scheduler";
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

const { layout, visualizations } = registry;

const MIN_VISIBLE_ZOOM = 1e-4;
const MIN_DRAW_DIMENSION = 2;
const MIN_MINIMAP_SCALE = 0.08;
const MINIMAP_THRESHOLD = 1.5;
const HUD_POLICY = {
    helpDelayMs: 1_000,
    helpVisibleMs: 10_000,
    minimapIdleMs: 2_000,
} as const;
const NAVIGATION_EPSILON = 0.5;
const TOOLTIP_GAP = 8;
const TOOLTIP_EDGE_PADDING = 10;
const MIN_DISPLAY_BLOCK_UNITS = 3;
const AGGREGATION_HYSTERESIS = 0.2;
const PRIMARY_SEPARATOR_PIECES = 64;
const SECONDARY_SEPARATOR_BLOCKS = 8;
const UNIFORM_AXIS_CHUNK_INTERVAL = Number.MAX_SAFE_INTEGER;
const UNIFORM_AXIS_CHUNK_GAP = 0;
const TRANSITION_POLICY = {
    durationMs: 140,
    parentCueMs: 220,
} as const;

type SwarmTone = "verified" | "common" | "rare" | "dead" | "missing";
type DragMode = "canvas" | "minimap" | null;
type Offset = { x: number; y: number };
type Axis = { starts: number[]; total: number };
type AxisSeparatorSettings = {
    primaryInterval: number;
    primaryGap: number;
    unitsPerCell: number;
};
type DrawState = {
    fitZoom: number;
    zoom: number;
    offset: Offset;
    viewportWidth: number;
    viewportHeight: number;
};
type HoveredPiece = {
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
    peerMin: number | null;
    peerMax: number | null;
    tone: SwarmTone;
};
type ScheduledCancel = (() => void) | null;
type ViewportBounds = { width: number; height: number };
type AggregationFootprint = { width: number; height: number };
type RootRaster = {
    piecesPerBlock: number;
    blockCount: number;
    columns: number;
    rows: number;
    footprint: AggregationFootprint;
};
type DisplayTopology = {
    rootPiecesPerBlock: number;
    piecesPerBlock: number;
    blockCount: number;
    columns: number;
    rows: number;
    factorX: number;
    factorY: number;
    fitZoom: number;
    zoom: number;
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
type ZoomAnchor = {
    pieceIndex: number;
    localX: number;
    localY: number;
};
type PointerState = {
    clientX: number;
    clientY: number;
    isInside: boolean;
};
type ParentCue = {
    row: number;
    col: number;
    colAxis: Axis;
    rowAxis: Axis;
    offset: Offset;
    zoom: number;
};
type TransitionSnapshot = {
    topology: DisplayTopology;
    colAxis: Axis;
    rowAxis: Axis;
    blocks: Array<DisplayBlock | null>;
    offset: Offset;
    zoom: number;
};
type CueSubdivision = {
    columns: number;
    rows: number;
};
type ViewTransition = {
    startedAt: number;
    durationMs: number;
    mode: "interpolate" | "crossfade";
    aggregationDirection: "expand" | "collapse" | null;
    fromOffset: Offset;
    toOffset: Offset;
    fromZoom: number;
    toZoom: number;
    previousView: TransitionSnapshot | null;
    parentCue: ParentCue | null;
    focusCue: ParentCue | null;
    focusSubdivision: CueSubdivision | null;
    parentCueUntilMs: number;
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

const resolvePrimarySeparatorGap = (cellSize: number, gap: number) => Math.max(gap * 4, Math.round(cellSize * 0.32), 6);

const resolveSecondarySeparatorGap = (cellSize: number, gap: number) =>
    Math.max(gap * 2, Math.round(cellSize * 0.18), 3);

const resolveAxisExtraGap = (
    boundaryIndex: number,
    chunkInterval: number,
    chunkGap: number,
    separatorSettings?: AxisSeparatorSettings,
) => {
    void separatorSettings;
    return chunkInterval > 0 && boundaryIndex % chunkInterval === 0 ? chunkGap : 0;
};

const estimateAxisTotal = (
    count: number,
    cellSize: number,
    gap: number,
    chunkInterval: number,
    chunkGap: number,
    separatorSettings?: AxisSeparatorSettings,
) => {
    if (count <= 0) {
        return 0;
    }

    let total = count * cellSize;
    for (let boundaryIndex = 1; boundaryIndex < count; boundaryIndex += 1) {
        total += gap + resolveAxisExtraGap(boundaryIndex, chunkInterval, chunkGap, separatorSettings);
    }
    return total;
};

const buildAxis = (
    count: number,
    cellSize: number,
    gap: number,
    chunkInterval: number,
    chunkGap: number,
    separatorSettings?: AxisSeparatorSettings,
): Axis => {
    const starts = Array.from({ length: count }, () => 0);
    let cursor = 0;
    for (let index = 0; index < count; index += 1) {
        starts[index] = cursor;
        cursor += cellSize;
        if (index < count - 1) {
            cursor += gap + resolveAxisExtraGap(index + 1, chunkInterval, chunkGap, separatorSettings);
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

const findNearestIndex = (value: number, starts: number[], cellSize: number) => {
    const directIndex = fitIndex(value, starts, cellSize);
    if (directIndex != null) {
        return directIndex;
    }

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

    const previousIndex = high >= 0 ? high : null;
    const nextIndex = low < starts.length ? low : null;
    if (previousIndex == null) {
        return nextIndex;
    }
    if (nextIndex == null) {
        return previousIndex;
    }

    const previousEnd = (starts[previousIndex] ?? 0) + cellSize;
    const nextStart = starts[nextIndex] ?? 0;
    return value - previousEnd <= nextStart - value ? previousIndex : nextIndex;
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
    columnSeparators?: AxisSeparatorSettings,
    rowSeparators?: AxisSeparatorSettings,
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
        const colTotal = estimateAxisTotal(safeColumns, cellSize, gap, chunkInterval, chunkGap, columnSeparators);
        const rowTotal = estimateAxisTotal(rows, cellSize, gap, chunkInterval, chunkGap, rowSeparators);
        const fitZoom = viewportWidth / Math.max(colTotal, 1);
        return rowTotal * fitZoom <= viewportHeight;
    };

    const aspectRatio = viewportWidth / Math.max(viewportHeight, 1);
    let columns = clamp(Math.round(Math.sqrt(totalCells * Math.max(aspectRatio, 0.1))), 1, totalCells);

    while (columns < totalCells && !fitsViewport(columns)) {
        columns += 1;
    }
    while (columns > 1 && fitsViewport(columns - 1)) {
        columns -= 1;
    }

    return columns;
};

const buildAggregationSteps = (totalPieces: number) => {
    if (totalPieces <= 1) {
        return [1];
    }

    const steps = [1];
    while ((steps[steps.length - 1] ?? 1) * 2 <= totalPieces) {
        steps.push((steps[steps.length - 1] ?? 1) * 2);
    }
    return steps;
};

const resolveRelevantHierarchySteps = (aggregationSteps: number[], rootPiecesPerBlock: number) =>
    aggregationSteps.filter((piecesPerBlock) => piecesPerBlock <= rootPiecesPerBlock);

const resolveAggregationFootprint = (piecesPerBlock: number): AggregationFootprint => {
    const safePiecesPerBlock = Math.max(1, piecesPerBlock);
    const exponent = Math.ceil(Math.log2(safePiecesPerBlock));
    const widthExponent = Math.ceil(exponent / 2);
    const width = 2 ** widthExponent;
    const height = Math.max(1, safePiecesPerBlock / width);
    return { width, height };
};

const computeFitZoom = (
    viewportWidth: number | null,
    viewportHeight: number | null,
    contentWidth: number,
    contentHeight: number,
) => {
    const widthFit =
        viewportWidth != null && viewportWidth > 0 ? viewportWidth / Math.max(contentWidth, 1) : Number.POSITIVE_INFINITY;
    const heightFit =
        viewportHeight != null && viewportHeight > 0
            ? viewportHeight / Math.max(contentHeight, 1)
            : Number.POSITIVE_INFINITY;
    const fitZoom = Math.min(widthFit, heightFit);
    return Number.isFinite(fitZoom) && fitZoom > 0 ? fitZoom : 1;
};

const buildColumnCandidates = (target: number, fallback: number, max: number) =>
    Array.from(
        new Set(
            [
                target - 6,
                target - 4,
                target - 2,
                target - 1,
                target,
                target + 1,
                target + 2,
                target + 4,
                target + 6,
                fallback,
                1,
                max,
            ].map((value) => clamp(value, 1, max)),
        ),
    );

const resolveRootColumnCount = (params: {
    viewportWidth: number | null;
    viewportHeight: number | null;
    totalCells: number;
    rootPiecesPerBlock: number;
    aggregationSteps: number[];
    cellSize: number;
    gap: number;
    chunkInterval: number;
    chunkGap: number;
    fallbackColumns: number;
}) => {
    if (params.totalCells <= 1) {
        return 1;
    }

    const rootFootprint = resolveAggregationFootprint(params.rootPiecesPerBlock);
    const fallbackColumns = resolveColumnCount(
        params.viewportWidth,
        params.viewportHeight,
        params.totalCells,
        params.cellSize,
        params.gap,
        params.chunkInterval,
        params.chunkGap,
        Math.min(params.fallbackColumns, params.totalCells),
        {
            primaryInterval: PRIMARY_SEPARATOR_PIECES,
            primaryGap: resolvePrimarySeparatorGap(params.cellSize, params.gap),
            unitsPerCell: rootFootprint.width,
        },
        {
            primaryInterval: PRIMARY_SEPARATOR_PIECES,
            primaryGap: resolvePrimarySeparatorGap(params.cellSize, params.gap),
            unitsPerCell: rootFootprint.height,
        },
    );
    if (
        params.viewportWidth == null ||
        params.viewportWidth <= 0 ||
        params.viewportHeight == null ||
        params.viewportHeight <= 0
    ) {
        return fallbackColumns;
    }

    const targetAspect = params.viewportWidth / Math.max(params.viewportHeight, 1);
    const relevantHierarchySteps = resolveRelevantHierarchySteps(params.aggregationSteps, params.rootPiecesPerBlock);
    const primaryGap = resolvePrimarySeparatorGap(params.cellSize, params.gap);

    return buildColumnCandidates(fallbackColumns, params.fallbackColumns, params.totalCells).reduce(
        (best, columns) => {
            const rows = Math.max(1, Math.ceil(params.totalCells / columns));
            const colTotal = estimateAxisTotal(
                columns,
                params.cellSize,
                params.gap,
                params.chunkInterval,
                params.chunkGap,
                {
                    primaryInterval: PRIMARY_SEPARATOR_PIECES,
                    primaryGap,
                    unitsPerCell: rootFootprint.width,
                },
            );
            const rowTotal = estimateAxisTotal(
                rows,
                params.cellSize,
                params.gap,
                params.chunkInterval,
                params.chunkGap,
                {
                    primaryInterval: PRIMARY_SEPARATOR_PIECES,
                    primaryGap,
                    unitsPerCell: rootFootprint.height,
                },
            );
            const fitZoom = computeFitZoom(params.viewportWidth, params.viewportHeight, colTotal, rowTotal);
            const baseAspect = (columns * rootFootprint.width) / Math.max(1, rows * rootFootprint.height);
            // Root rows/columns are chosen for viewport fit and stable inspection.
            // They are not required to be powers of two; only the aggregation ladder is.
            const stabilityScore = relevantHierarchySteps.reduce((score, piecesPerBlock) => {
                    const footprint = resolveAggregationFootprint(piecesPerBlock);
                    const factorX = rootFootprint.width / Math.max(1, footprint.width);
                    const factorY = rootFootprint.height / Math.max(1, footprint.height);
                    const aspect = (columns * factorX) / Math.max(1, rows * factorY);
                    return score + Math.abs(Math.log(Math.max(aspect, 0.1) / Math.max(targetAspect, 0.1)));
                }, 0);
            const fillScore =
                Math.abs(Math.log(Math.max(baseAspect, 0.1) / Math.max(targetAspect, 0.1))) +
                Math.abs(columns - fallbackColumns) / Math.max(params.totalCells, 1);
            const score = stabilityScore * 10 + fillScore - fitZoom * 0.01;
            if (score < best.score) {
                return { columns, score };
            }
            return best;
        },
        { columns: fallbackColumns, score: Number.POSITIVE_INFINITY },
    ).columns;
};

const computeDisplayTopology = (params: {
    viewportWidth: number | null;
    viewportHeight: number | null;
    totalPieces: number;
    rootRaster: RootRaster;
    piecesPerBlock: number;
    zoomMultiplier: number;
    cellSize: number;
    gap: number;
    chunkInterval: number;
    chunkGap: number;
}): DisplayTopology => {
    const blockCount = Math.max(1, Math.ceil(params.totalPieces / params.piecesPerBlock));
    const footprint = resolveAggregationFootprint(params.piecesPerBlock);
    const primaryGap = resolvePrimarySeparatorGap(params.cellSize, params.gap);
    const factorX = Math.max(1, Math.round(params.rootRaster.footprint.width / Math.max(1, footprint.width)));
    const factorY = Math.max(1, Math.round(params.rootRaster.footprint.height / Math.max(1, footprint.height)));
    const columns = Math.max(1, params.rootRaster.columns * factorX);
    const rows = Math.max(1, params.rootRaster.rows * factorY);
    const colTotal = estimateAxisTotal(columns, params.cellSize, params.gap, params.chunkInterval, params.chunkGap, {
        primaryInterval: PRIMARY_SEPARATOR_PIECES,
        primaryGap,
        unitsPerCell: footprint.width,
    });
    const fitZoom =
        computeFitZoom(
            params.viewportWidth,
            params.viewportHeight,
            colTotal,
            estimateAxisTotal(rows, params.cellSize, params.gap, params.chunkInterval, params.chunkGap, {
                primaryInterval: PRIMARY_SEPARATOR_PIECES,
                primaryGap,
                unitsPerCell: footprint.height,
            }),
        );

    return {
        rootPiecesPerBlock: params.rootRaster.piecesPerBlock,
        piecesPerBlock: params.piecesPerBlock,
        blockCount,
        columns,
        rows,
        factorX,
        factorY,
        fitZoom,
        zoom: fitZoom * params.zoomMultiplier,
    };
};

const resolveRootRaster = (params: {
    viewportWidth: number | null;
    viewportHeight: number | null;
    totalPieces: number;
    minDisplayBlockPx: number;
    cellSize: number;
    gap: number;
    chunkInterval: number;
    chunkGap: number;
    fallbackColumns: number;
}): RootRaster => {
    if (params.totalPieces <= 0) {
        return {
            piecesPerBlock: 1,
            blockCount: 1,
            columns: 1,
            rows: 1,
            footprint: resolveAggregationFootprint(1),
        };
    }

    const aggregationSteps = buildAggregationSteps(params.totalPieces);
    let rootRaster: RootRaster = {
        piecesPerBlock: aggregationSteps[0] ?? 1,
        blockCount: Math.max(1, Math.ceil(params.totalPieces / Math.max(aggregationSteps[0] ?? 1, 1))),
        columns: 1,
        rows: 1,
        footprint: resolveAggregationFootprint(aggregationSteps[0] ?? 1),
    };
    for (const piecesPerBlock of aggregationSteps) {
        const blockCount = Math.max(1, Math.ceil(params.totalPieces / piecesPerBlock));
        const columns = resolveRootColumnCount(
            {
                viewportWidth: params.viewportWidth,
                viewportHeight: params.viewportHeight,
                totalCells: blockCount,
                rootPiecesPerBlock: piecesPerBlock,
                aggregationSteps,
                cellSize: params.cellSize,
                gap: params.gap,
                chunkInterval: params.chunkInterval,
                chunkGap: params.chunkGap,
                fallbackColumns: Math.min(params.fallbackColumns, blockCount),
            },
        );
        const rows = Math.max(1, Math.ceil(blockCount / columns));
        const nextRootRaster: RootRaster = {
            piecesPerBlock,
            blockCount,
            columns,
            rows,
            footprint: resolveAggregationFootprint(piecesPerBlock),
        };
        const topology = computeDisplayTopology({
            viewportWidth: params.viewportWidth,
            viewportHeight: params.viewportHeight,
            totalPieces: params.totalPieces,
            rootRaster: nextRootRaster,
            piecesPerBlock,
            zoomMultiplier: 1,
            cellSize: params.cellSize,
            gap: params.gap,
            chunkInterval: params.chunkInterval,
            chunkGap: params.chunkGap,
        });
        rootRaster = nextRootRaster;
        if (params.cellSize * topology.zoom >= params.minDisplayBlockPx) {
            break;
        }
    }

    return rootRaster;
};

const resolveDisplayTopology = (params: {
    viewportWidth: number | null;
    viewportHeight: number | null;
    totalPieces: number;
    minDisplayBlockPx: number;
    rootRaster: RootRaster;
    preferredPiecesPerBlock?: number;
    zoomMultiplier: number;
    cellSize: number;
    gap: number;
    chunkInterval: number;
    chunkGap: number;
}): DisplayTopology => {
    if (params.totalPieces <= 0) {
        return computeDisplayTopology({
            viewportWidth: params.viewportWidth,
            viewportHeight: params.viewportHeight,
            totalPieces: params.totalPieces,
            rootRaster: params.rootRaster,
            piecesPerBlock: 1,
            zoomMultiplier: params.zoomMultiplier,
            cellSize: params.cellSize,
            gap: params.gap,
            chunkInterval: params.chunkInterval,
            chunkGap: params.chunkGap,
        });
    }

    const hierarchySteps = resolveRelevantHierarchySteps(
        buildAggregationSteps(params.rootRaster.piecesPerBlock),
        params.rootRaster.piecesPerBlock,
    );
    const candidates = hierarchySteps
        .map((piecesPerBlock) =>
            computeDisplayTopology({
                viewportWidth: params.viewportWidth,
                viewportHeight: params.viewportHeight,
                totalPieces: params.totalPieces,
                rootRaster: params.rootRaster,
                piecesPerBlock,
                zoomMultiplier: params.zoomMultiplier,
                cellSize: params.cellSize,
                gap: params.gap,
                chunkInterval: params.chunkInterval,
                chunkGap: params.chunkGap,
            }),
        );
    const targetTopology =
        candidates.find((candidate) => params.cellSize * candidate.zoom >= params.minDisplayBlockPx) ??
        candidates[candidates.length - 1];
    if (!targetTopology) {
        return computeDisplayTopology({
            viewportWidth: params.viewportWidth,
            viewportHeight: params.viewportHeight,
            totalPieces: params.totalPieces,
            rootRaster: params.rootRaster,
            piecesPerBlock: 1,
            zoomMultiplier: 1,
            cellSize: params.cellSize,
            gap: params.gap,
            chunkInterval: params.chunkInterval,
            chunkGap: params.chunkGap,
        });
    }

    if (params.preferredPiecesPerBlock == null) {
        return targetTopology;
    }

    const preferredTopology = candidates.find(
        (candidate) => candidate.piecesPerBlock === params.preferredPiecesPerBlock,
    );
    if (!preferredTopology) {
        return targetTopology;
    }

    const preferredBlockSizePx = params.cellSize * preferredTopology.zoom;
    const minStayPx = params.minDisplayBlockPx * (1 - AGGREGATION_HYSTERESIS);
    const maxStayPx = params.minDisplayBlockPx * (1 + AGGREGATION_HYSTERESIS);

    if (preferredTopology.piecesPerBlock < targetTopology.piecesPerBlock) {
        return preferredBlockSizePx >= minStayPx ? preferredTopology : targetTopology;
    }
    if (preferredTopology.piecesPerBlock > targetTopology.piecesPerBlock) {
        return preferredBlockSizePx <= maxStayPx ? preferredTopology : targetTopology;
    }

    return preferredTopology;
};

const resolveBlockOffset = (params: {
    anchor: ZoomAnchor;
    topology: DisplayTopology;
    rootRaster: RootRaster;
    totalPieces: number;
    viewportWidth: number;
    viewportHeight: number;
    cellSize: number;
    gap: number;
    chunkInterval: number;
    chunkGap: number;
}) => {
    const footprint = resolveAggregationFootprint(params.topology.piecesPerBlock);
    const primaryGap = resolvePrimarySeparatorGap(params.cellSize, params.gap);
    const colAxis = buildAxis(
        params.topology.columns,
        params.cellSize,
        params.gap,
        params.chunkInterval,
        params.chunkGap,
        {
            primaryInterval: PRIMARY_SEPARATOR_PIECES,
            primaryGap,
            unitsPerCell: footprint.width,
        },
    );
    const rowAxis = buildAxis(
        params.topology.rows,
        params.cellSize,
        params.gap,
        params.chunkInterval,
        params.chunkGap,
        {
            primaryInterval: PRIMARY_SEPARATOR_PIECES,
            primaryGap,
            unitsPerCell: footprint.height,
        },
    );
    const cell = resolveBlockGridPosition({
        pieceIndex: params.anchor.pieceIndex,
        totalPieces: params.totalPieces,
        rootRaster: params.rootRaster,
        topology: params.topology,
    });
    const row = cell?.row ?? 0;
    const col = cell?.col ?? 0;
    const worldX = (colAxis.starts[col] ?? 0) + params.cellSize / 2;
    const worldY = (rowAxis.starts[row] ?? 0) + params.cellSize / 2;

    return clampOffset(
        {
            x: worldX - params.anchor.localX / params.topology.zoom,
            y: worldY - params.anchor.localY / params.topology.zoom,
        },
        params.viewportWidth,
        params.viewportHeight,
        colAxis.total,
        rowAxis.total,
        params.topology.zoom,
    );
};

const resolveBlockGridPosition = (params: {
    pieceIndex: number;
    totalPieces: number;
    rootRaster: RootRaster;
    topology: DisplayTopology;
}) => {
    if (params.totalPieces <= 0) {
        return null;
    }

    const safePieceIndex = clamp(params.pieceIndex, 0, Math.max(0, params.totalPieces - 1));
    const rootBlockIndex = Math.floor(safePieceIndex / Math.max(1, params.rootRaster.piecesPerBlock));
    const rootRow = Math.floor(rootBlockIndex / Math.max(1, params.rootRaster.columns));
    const rootCol = rootBlockIndex % Math.max(1, params.rootRaster.columns);
    const localPieceIndex = safePieceIndex % Math.max(1, params.rootRaster.piecesPerBlock);
    const childOrdinal = Math.floor(localPieceIndex / Math.max(1, params.topology.piecesPerBlock));
    const childRow = Math.floor(childOrdinal / Math.max(1, params.topology.factorX));
    const childCol = childOrdinal % Math.max(1, params.topology.factorX);

    return {
        rootRow,
        rootCol,
        row: rootRow * params.topology.factorY + childRow,
        col: rootCol * params.topology.factorX + childCol,
    };
};

const buildDisplayBlocks = (params: {
    displayCellCount: number;
    columns: number;
    topology: DisplayTopology;
    rootRaster: RootRaster;
    totalPieces: number;
    pieceSize?: number;
    unknownSizeLabel: string;
    resolvedStates: PieceStatus[];
    availability: number[];
    availabilityMissing: boolean;
    rareThreshold: number;
}) =>
    Array.from({ length: params.displayCellCount }, (_, blockIndex) => {
        const row = Math.floor(blockIndex / params.columns);
        const col = blockIndex % params.columns;
        const pieceRange = resolveCellPieceRange({
            row,
            col,
            topology: params.topology,
            rootRaster: params.rootRaster,
            totalPieces: params.totalPieces,
        });
        if (!pieceRange) {
            return null;
        }
        const startPieceIndex = pieceRange.startPieceIndex;
        const endPieceIndex = pieceRange.endPieceIndex;
        let verifiedInBlock = 0;
        let commonInBlock = 0;
        let deadInBlock = 0;
        let rareInBlock = 0;
        let peerMin: number | null = null;
        let peerMax: number | null = null;

        for (let pieceIndex = startPieceIndex; pieceIndex <= endPieceIndex; pieceIndex += 1) {
            const state = params.resolvedStates[pieceIndex] ?? "missing";
            if (state === "done") {
                verifiedInBlock += 1;
                continue;
            }

            if (params.availabilityMissing) {
                continue;
            }

            const peers = params.availability[pieceIndex] ?? 0;
            peerMin = peerMin == null ? peers : Math.min(peerMin, peers);
            peerMax = peerMax == null ? peers : Math.max(peerMax, peers);
            if (peers <= 0) {
                deadInBlock += 1;
            } else if (peers <= params.rareThreshold) {
                rareInBlock += 1;
            } else {
                commonInBlock += 1;
            }
        }

        const pieceCount = endPieceIndex - startPieceIndex + 1;
        const missingInBlock = pieceCount - verifiedInBlock;
        const composition: Array<{ tone: SwarmTone; count: number }> = [
            { tone: "verified", count: verifiedInBlock },
            { tone: "common", count: commonInBlock },
            { tone: "rare", count: rareInBlock },
            { tone: "dead", count: deadInBlock },
            { tone: "missing", count: params.availabilityMissing ? missingInBlock : 0 },
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
        const activeStates = composition.filter((entry) => entry.count > 0).length;
        const tone: SwarmTone =
            dominantTone.count > 0
                ? dominantTone.tone
                : params.availabilityMissing && missingInBlock > 0
                  ? "missing"
                  : "verified";

        return {
            blockIndex,
            row,
            col,
            startPieceIndex,
            endPieceIndex,
            pieceCount,
            totalSizeLabel: params.pieceSize ? formatBytes(params.pieceSize * pieceCount) : params.unknownSizeLabel,
            verifiedCount: verifiedInBlock,
            missingCount: missingInBlock,
            commonCount: commonInBlock,
            rareCount: rareInBlock,
            deadCount: deadInBlock,
            isMixed: activeStates > 1,
            tone,
            peerMin,
            peerMax,
        };
    });

const easeOutQuad = (value: number) => 1 - (1 - value) * (1 - value);

const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;

const resolveRenderedCellGap = (boundaryIndex: number, unitsPerCell: number, size: number) => {
    const secondaryGap =
        boundaryIndex % SECONDARY_SEPARATOR_BLOCKS === 0
            ? clamp(Math.round(size * 0.12), 1, 4)
            : 0;
    const primaryGap =
        (boundaryIndex * Math.max(1, unitsPerCell)) % PRIMARY_SEPARATOR_PIECES === 0
            ? clamp(Math.round(size * 0.26), 2, 8)
            : 0;
    return Math.max(primaryGap, secondaryGap);
};

const resolveRenderedCellBounds = (params: {
    x: number;
    y: number;
    size: number;
    row: number;
    col: number;
    rows: number;
    columns: number;
    footprint: AggregationFootprint;
}) => ({
    x: params.x,
    y: params.y,
    width: Math.max(
        1,
        params.size -
            (params.col < params.columns - 1
                ? resolveRenderedCellGap(params.col + 1, params.footprint.width, params.size)
                : 0),
    ),
    height: Math.max(
        1,
        params.size -
            (params.row < params.rows - 1
                ? resolveRenderedCellGap(params.row + 1, params.footprint.height, params.size)
                : 0),
    ),
});

const resolveRenderedView = (params: { drawState: DrawState; transition: ViewTransition | null; now: number }) => {
    const { drawState, transition, now } = params;
    if (!transition) {
        return {
            offset: drawState.offset,
            zoom: drawState.zoom,
            transitionProgress: 1,
            currentAlpha: 1,
            previousAlpha: 0,
            previousView: null as TransitionSnapshot | null,
            parentCue: null as { cue: ParentCue; alpha: number } | null,
            focusCue: null as { cue: ParentCue; alpha: number } | null,
            isActive: false,
        };
    }

    const rawProgress = clamp((now - transition.startedAt) / Math.max(1, transition.durationMs), 0, 1);
    const progress = easeOutQuad(rawProgress);
    const cueProgress = clamp((now - transition.startedAt) / Math.max(1, TRANSITION_POLICY.parentCueMs), 0, 1);
    const parentCue =
        transition.parentCue && now <= transition.parentCueUntilMs
            ? {
                  cue: transition.parentCue,
                  alpha: 1 - cueProgress,
              }
            : null;
    const focusCue =
        transition.focusCue && now <= transition.parentCueUntilMs
            ? {
                  cue: transition.focusCue,
                  alpha: 0.35 + cueProgress * 0.65,
              }
            : null;

    if (transition.mode === "crossfade") {
        return {
            offset: transition.toOffset,
            zoom: transition.toZoom,
            transitionProgress: progress,
            currentAlpha: 1,
            previousAlpha: 0,
            previousView: null,
            parentCue,
            focusCue,
            isActive: rawProgress < 1 || parentCue != null || focusCue != null,
        };
    }

    return {
        offset: {
            x: lerp(transition.fromOffset.x, transition.toOffset.x, progress),
            y: lerp(transition.fromOffset.y, transition.toOffset.y, progress),
        },
        zoom: lerp(transition.fromZoom, transition.toZoom, progress),
        transitionProgress: progress,
        currentAlpha: 1,
        previousAlpha: 0,
        previousView: null,
        parentCue,
        focusCue,
        isActive: rawProgress < 1 || parentCue != null || focusCue != null,
    };
};

const drawBlockLayer = (params: {
    ctx: CanvasRenderingContext2D;
    blocks: Array<DisplayBlock | null>;
    columns: number;
    rows: number;
    colAxis: Axis;
    rowAxis: Axis;
    footprint: AggregationFootprint;
    cellSize: number;
    offset: Offset;
    zoom: number;
    viewportWidth: number;
    viewportHeight: number;
    palette: ReturnType<typeof useCanvasPalette>;
    alpha: number;
}) => {
    const layerAlpha = clamp(params.alpha, 0, 1);
    if (layerAlpha <= 0) {
        return;
    }
    const contentOrigin = resolveContentScreenOrigin({
        viewportWidth: params.viewportWidth,
        viewportHeight: params.viewportHeight,
        contentWidth: params.colAxis.total,
        contentHeight: params.rowAxis.total,
        zoom: params.zoom,
    });

    const worldLeft = params.offset.x;
    const worldRight = params.offset.x + params.viewportWidth / params.zoom;
    const worldTop = params.offset.y;
    const worldBottom = params.offset.y + params.viewportHeight / params.zoom;
    const rowStart = Math.max(0, fitIndex(worldTop, params.rowAxis.starts, params.cellSize) ?? 0);
    const rowEnd = Math.min(
        params.rows - 1,
        (fitIndex(worldBottom, params.rowAxis.starts, params.cellSize) ?? params.rows - 1) + 1,
    );
    const colStart = Math.max(0, fitIndex(worldLeft, params.colAxis.starts, params.cellSize) ?? 0);
    const colEnd = Math.min(
        params.columns - 1,
        (fitIndex(worldRight, params.colAxis.starts, params.cellSize) ?? params.columns - 1) + 1,
    );
    const setAlpha = (alpha: number) => {
        params.ctx.globalAlpha = layerAlpha * alpha;
    };

    for (let row = rowStart; row <= rowEnd; row += 1) {
        const y = contentOrigin.y + ((params.rowAxis.starts[row] ?? 0) - params.offset.y) * params.zoom;
        for (let col = colStart; col <= colEnd; col += 1) {
            const blockIndex = row * params.columns + col;
            if (blockIndex >= params.blocks.length) {
                break;
            }
            const block = params.blocks[blockIndex];
            if (!block) {
                continue;
            }
            const x = contentOrigin.x + ((params.colAxis.starts[col] ?? 0) - params.offset.x) * params.zoom;
            const size = params.cellSize * params.zoom;
            const { width: drawWidth, height: drawHeight } = resolveRenderedCellBounds({
                x,
                y,
                size,
                row,
                col,
                rows: params.rows,
                columns: params.columns,
                footprint: params.footprint,
            });
            const tone = block.tone;
            if (tone === "verified") {
                params.ctx.fillStyle = resolveCanvasColor(params.palette.success);
                setAlpha(1);
                params.ctx.fillRect(x, y, drawWidth, drawHeight);
                if (Math.min(drawWidth, drawHeight) >= 4) {
                    params.ctx.strokeStyle = params.palette.highlight;
                    setAlpha(0.35);
                    params.ctx.beginPath();
                    params.ctx.moveTo(x + 0.5, y + drawHeight - 0.5);
                    params.ctx.lineTo(x + 0.5, y + 0.5);
                    params.ctx.lineTo(x + drawWidth - 0.5, y + 0.5);
                    params.ctx.stroke();
                    params.ctx.strokeStyle = resolveCanvasColor(params.palette.foreground);
                    setAlpha(0.2);
                    params.ctx.beginPath();
                    params.ctx.moveTo(x + drawWidth - 0.5, y);
                    params.ctx.lineTo(x + drawWidth - 0.5, y + drawHeight - 0.5);
                    params.ctx.lineTo(x, y + drawHeight - 0.5);
                    params.ctx.stroke();
                }
            } else if (tone === "common") {
                params.ctx.fillStyle = resolveCanvasColor(params.palette.primary);
                setAlpha(0.35);
                params.ctx.fillRect(x, y, drawWidth, drawHeight);
            } else if (tone === "rare") {
                params.ctx.fillStyle = resolveCanvasColor(params.palette.warning);
                setAlpha(0.75);
                params.ctx.fillRect(x, y, drawWidth, drawHeight);
            } else if (tone === "dead") {
                params.ctx.fillStyle = resolveCanvasColor(params.palette.foreground);
                setAlpha(0.12);
                params.ctx.fillRect(x, y, drawWidth, drawHeight);
                params.ctx.strokeStyle = resolveCanvasColor(params.palette.danger);
                params.ctx.lineWidth = Math.max(1, params.zoom * 0.15);
                setAlpha(1);
                params.ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, drawWidth - 1), Math.max(0, drawHeight - 1));
            } else {
                params.ctx.fillStyle = resolveCanvasColor(params.palette.foreground);
                setAlpha(0.2);
                params.ctx.fillRect(x, y, drawWidth, drawHeight);
            }
            if (tone === "rare" && Math.min(drawWidth, drawHeight) >= 5) {
                params.ctx.save();
                params.ctx.beginPath();
                params.ctx.rect(x, y, drawWidth, drawHeight);
                params.ctx.clip();
                params.ctx.strokeStyle = resolveCanvasColor(params.palette.foreground);
                params.ctx.lineWidth = Math.max(1, params.zoom * 0.14);
                setAlpha(0.24);
                const stripeGap = Math.max(4, Math.min(drawWidth, drawHeight) * 0.4);
                for (let stripe = -drawWidth; stripe < drawWidth * 2; stripe += stripeGap) {
                    params.ctx.beginPath();
                    params.ctx.moveTo(x + stripe, y + drawHeight);
                    params.ctx.lineTo(x + stripe + drawWidth, y);
                    params.ctx.stroke();
                }
                params.ctx.restore();
            }
            if (block.isMixed && Math.min(drawWidth, drawHeight) >= 6) {
                const markerSize = Math.max(4, Math.min(drawWidth, drawHeight) * 0.28);
                params.ctx.fillStyle = resolveCanvasColor(params.palette.foreground);
                setAlpha(0.7);
                params.ctx.beginPath();
                params.ctx.moveTo(x + drawWidth, y);
                params.ctx.lineTo(x + drawWidth - markerSize, y);
                params.ctx.lineTo(x + drawWidth, y + markerSize);
                params.ctx.closePath();
                params.ctx.fill();
            }
        }
    }

    params.ctx.globalAlpha = 1;
};

const resolveCellPieceRange = (params: {
    row: number;
    col: number;
    topology: DisplayTopology;
    rootRaster: RootRaster;
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

    const rootRow = Math.floor(params.row / Math.max(1, params.topology.factorY));
    const rootCol = Math.floor(params.col / Math.max(1, params.topology.factorX));
    const rootBlockIndex = rootRow * params.rootRaster.columns + rootCol;
    if (rootBlockIndex >= params.rootRaster.blockCount) {
        return null;
    }

    const childRow = params.row % Math.max(1, params.topology.factorY);
    const childCol = params.col % Math.max(1, params.topology.factorX);
    const childOrdinal = childRow * params.topology.factorX + childCol;
    const rootStartPieceIndex = rootBlockIndex * params.rootRaster.piecesPerBlock;
    const rootEndPieceIndex = Math.min(
        params.totalPieces - 1,
        rootStartPieceIndex + params.rootRaster.piecesPerBlock - 1,
    );
    const rootPieceCount = rootEndPieceIndex - rootStartPieceIndex + 1;
    const childCount = Math.ceil(rootPieceCount / Math.max(1, params.topology.piecesPerBlock));
    if (childOrdinal >= childCount) {
        return null;
    }

    const startPieceIndex = rootStartPieceIndex + childOrdinal * params.topology.piecesPerBlock;
    if (startPieceIndex >= params.totalPieces) {
        return null;
    }

    return {
        startPieceIndex,
        endPieceIndex: Math.min(params.totalPieces - 1, startPieceIndex + params.topology.piecesPerBlock - 1),
    };
};

const resolveAnchorPieceIndex = (params: {
    worldX: number;
    worldY: number;
    rowStarts: number[];
    colStarts: number[];
    cellSize: number;
    totalPieces: number;
    topology: DisplayTopology;
    rootRaster: RootRaster;
}) => {
    const col = findNearestIndex(params.worldX, params.colStarts, params.cellSize);
    const row = findNearestIndex(params.worldY, params.rowStarts, params.cellSize);
    if (col == null || row == null) {
        return 0;
    }

    const block = resolveCellPieceRange({
        row,
        col,
        topology: params.topology,
        rootRaster: params.rootRaster,
        totalPieces: params.totalPieces,
    });
    if (!block) {
        return 0;
    }

    return Math.floor((block.startPieceIndex + block.endPieceIndex) / 2);
};

const resolveZoomAnchorPieceIndex = (params: {
    worldX: number;
    worldY: number;
    rowStarts: number[];
    colStarts: number[];
    cellSize: number;
    totalPieces: number;
    topology: DisplayTopology;
    rootRaster: RootRaster;
    currentPiecesPerBlock: number;
    nextPiecesPerBlock: number;
}) => {
    const col = findNearestIndex(params.worldX, params.colStarts, params.cellSize);
    const row = findNearestIndex(params.worldY, params.rowStarts, params.cellSize);
    if (col == null || row == null) {
        return 0;
    }

    const block = resolveCellPieceRange({
        row,
        col,
        topology: params.topology,
        rootRaster: params.rootRaster,
        totalPieces: params.totalPieces,
    });
    if (!block) {
        return 0;
    }

    const blockStart = block.startPieceIndex;
    const blockEnd = block.endPieceIndex;
    const blockPieceCount = blockEnd - blockStart + 1;
    const blockX = params.colStarts[col] ?? 0;
    const blockY = params.rowStarts[row] ?? 0;
    const xRatio = clamp((params.worldX - blockX) / Math.max(params.cellSize, 1), 0, 0.999999);
    const yRatio = clamp((params.worldY - blockY) / Math.max(params.cellSize, 1), 0, 0.999999);
    const footprint = resolveAggregationFootprint(params.currentPiecesPerBlock);
    const localCol = clamp(Math.floor(xRatio * footprint.width), 0, Math.max(0, footprint.width - 1));
    const localRow = clamp(Math.floor(yRatio * footprint.height), 0, Math.max(0, footprint.height - 1));
    const pieceOrdinal = Math.min(blockPieceCount - 1, localRow * footprint.width + localCol);
    const childOffset = Math.floor(pieceOrdinal / Math.max(params.nextPiecesPerBlock, 1)) * Math.max(params.nextPiecesPerBlock, 1);
    return Math.min(blockEnd, blockStart + childOffset);
};

const resolveTopologyTransitionAnchor = (params: {
    worldX: number;
    worldY: number;
    rowStarts: number[];
    colStarts: number[];
    cellSize: number;
    totalPieces: number;
    topology: DisplayTopology;
    rootRaster: RootRaster;
    currentPiecesPerBlock: number;
    nextPiecesPerBlock: number;
}) => {
    if (params.currentPiecesPerBlock === params.nextPiecesPerBlock) {
        return resolveAnchorPieceIndex({
            worldX: params.worldX,
            worldY: params.worldY,
            rowStarts: params.rowStarts,
            colStarts: params.colStarts,
            cellSize: params.cellSize,
            totalPieces: params.totalPieces,
            topology: params.topology,
            rootRaster: params.rootRaster,
        });
    }

    return resolveZoomAnchorPieceIndex(params);
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

const resolveContentScreenOrigin = (params: {
    viewportWidth: number;
    viewportHeight: number;
    contentWidth: number;
    contentHeight: number;
    zoom: number;
}) => {
    void params;
    return { x: 0, y: 0 };
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
    buildAggregationSteps,
    resolveAggregationFootprint,
    resolveRootRaster,
    resolveDisplayTopology,
    resolveBlockGridPosition,
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
    blockDensityLabel: string;
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
    const { unit } = useLayoutMetrics();
    const palette = useCanvasPalette();
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const minimapRef = useRef<HTMLCanvasElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const drawStateRef = useRef<DrawState | null>(null);
    const viewTransitionRef = useRef<ViewTransition | null>(null);
    const dragModeRef = useRef<DragMode>(null);
    const dragStartRef = useRef({ x: 0, y: 0, offset: { x: 0, y: 0 } });
    const frameRef = useRef<FrameHandle | null>(null);
    const overlayFrameRef = useRef<FrameHandle | null>(null);
    const minimapFrameRef = useRef<FrameHandle | null>(null);
    const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
    const pointerRef = useRef<PointerState>({
        clientX: 0,
        clientY: 0,
        isInside: false,
    });
    const previousTopologyRef = useRef<DisplayTopology | null>(null);
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
    const chunkInterval = UNIFORM_AXIS_CHUNK_INTERVAL;
    const chunkGap = UNIFORM_AXIS_CHUNK_GAP;
    const zoomLevels = layout.heatmap.zoomLevels;
    const indexOfOne = zoomLevels.indexOf(1);
    const firstLevelAtOrAboveOne = indexOfOne >= 0 ? indexOfOne : zoomLevels.findIndex((level) => level > 1);
    const initialZoomIndex = Math.max(0, firstLevelAtOrAboveOne);
    const [zoomIndex, setZoomIndex] = useState(initialZoomIndex);
    const zoomMultiplier = zoomLevels[zoomIndex] ?? 1;
    const minDisplayBlockPx = Math.max(unit * MIN_DISPLAY_BLOCK_UNITS, unit);
    const rootRaster = useMemo(
        () =>
            resolveRootRaster({
                viewportWidth: viewportBounds?.width ?? null,
                viewportHeight: viewportBounds?.height ?? null,
                totalPieces,
                minDisplayBlockPx,
                cellSize,
                gap: cellGap,
                chunkInterval,
                chunkGap,
                fallbackColumns,
            }),
        [
            cellGap,
            cellSize,
            chunkGap,
            chunkInterval,
            fallbackColumns,
            minDisplayBlockPx,
            totalPieces,
            viewportBounds,
        ],
    );
    const displayTopology = useMemo(
        () =>
            resolveDisplayTopology({
                viewportWidth: viewportBounds?.width ?? null,
                viewportHeight: viewportBounds?.height ?? null,
                totalPieces,
                minDisplayBlockPx,
                rootRaster,
                preferredPiecesPerBlock: previousTopologyRef.current?.piecesPerBlock,
                zoomMultiplier,
                cellSize,
                gap: cellGap,
                chunkInterval,
                chunkGap,
            }),
        [
            cellGap,
            cellSize,
            chunkGap,
            chunkInterval,
            minDisplayBlockPx,
            rootRaster,
            totalPieces,
            viewportBounds,
            zoomMultiplier,
        ],
    );
    const pieceStatesLength = pieceStates?.length ?? 0;
    const availabilityLength = pieceAvailability?.length ?? 0;
    const piecesPerBlock = displayTopology.piecesPerBlock;
    const displayBlockCount = displayTopology.blockCount;
    const columns = displayTopology.columns;
    const rows = displayTopology.rows;
    const displayCellCount = columns * rows;
    const currentFootprint = useMemo(() => resolveAggregationFootprint(piecesPerBlock), [piecesPerBlock]);
    const primarySeparatorGap = useMemo(() => resolvePrimarySeparatorGap(cellSize, cellGap), [cellGap, cellSize]);
    const colAxis = useMemo(
        () =>
            buildAxis(columns, cellSize, cellGap, chunkInterval, chunkGap, {
                primaryInterval: PRIMARY_SEPARATOR_PIECES,
                primaryGap: primarySeparatorGap,
                unitsPerCell: currentFootprint.width,
            }),
        [cellGap, cellSize, chunkGap, chunkInterval, columns, currentFootprint.width, primarySeparatorGap],
    );
    const rowAxis = useMemo(
        () =>
            buildAxis(rows, cellSize, cellGap, chunkInterval, chunkGap, {
                primaryInterval: PRIMARY_SEPARATOR_PIECES,
                primaryGap: primarySeparatorGap,
                unitsPerCell: currentFootprint.height,
            }),
        [cellGap, cellSize, chunkGap, chunkInterval, currentFootprint.height, primarySeparatorGap, rows],
    );

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
            buildDisplayBlocks({
                displayCellCount,
                columns,
                topology: displayTopology,
                rootRaster,
                totalPieces,
                pieceSize,
                unknownSizeLabel: t("torrent_modal.stats.unknown_size"),
                resolvedStates,
                availability,
                availabilityMissing,
                rareThreshold,
            }),
        [
            availability,
            availabilityMissing,
            columns,
            displayCellCount,
            displayTopology,
            piecesPerBlock,
            pieceSize,
            rareThreshold,
            resolvedStates,
            rootRaster,
            t,
            totalPieces,
        ],
    );

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
    const verifiedPercent = totalPieces > 0 ? Math.round((verifiedCount / totalPieces) * 100) : 0;
    const pieceSizeLabel = pieceSize ? formatBytes(pieceSize) : t("torrent_modal.stats.unknown_size");
    const blockDensityLabel =
        piecesPerBlock === 1
            ? t("torrent_modal.piece_map.zoom_block_density_one")
            : t("torrent_modal.piece_map.zoom_block_density_other", {
                  count: piecesPerBlock,
              });

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

    const stopActiveTransition = () => {
        const drawState = drawStateRef.current;
        if (!drawState) {
            viewTransitionRef.current = null;
            return;
        }

        const transition = viewTransitionRef.current;
        if (!transition) {
            return;
        }

        const renderedView = resolveRenderedView({
            drawState,
            transition,
            now: performance.now(),
        });
        viewTransitionRef.current = null;
        drawStateRef.current = {
            ...drawState,
            offset: renderedView.offset,
            zoom: renderedView.zoom,
        };
        setOffset(renderedView.offset);
    };

    const setHoveredCell = (cell: ReturnType<typeof readCell>) => {
        if (!cell) {
            setHoveredPiece(null);
            setTooltipStyle(undefined);
            return;
        }

        setHoveredPiece({
            blockIndex: cell.blockIndex,
            row: cell.row,
            col: cell.col,
            startPieceIndex: cell.startPieceIndex,
            endPieceIndex: cell.endPieceIndex,
            pieceCount: cell.pieceCount,
            totalSizeLabel: cell.totalSizeLabel,
            verifiedCount: cell.verifiedCount,
            missingCount: cell.missingCount,
            commonCount: cell.commonCount,
            rareCount: cell.rareCount,
            deadCount: cell.deadCount,
            isMixed: cell.isMixed,
            peerMin: cell.peerMin,
            peerMax: cell.peerMax,
            tone: cell.tone,
        });
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

    useEffect(() => {
        const previousTopology = previousTopologyRef.current;
        previousTopologyRef.current = displayTopology;

        if (
            !previousTopology ||
            (previousTopology.piecesPerBlock === displayTopology.piecesPerBlock &&
                previousTopology.columns === displayTopology.columns &&
                previousTopology.rows === displayTopology.rows)
        ) {
            zoomAnchorRef.current = null;
            return;
        }

        const viewport = readViewportBounds(rootRef.current);
        if (!viewport) {
            zoomAnchorRef.current = null;
            return;
        }

        const anchor = zoomAnchorRef.current ?? (() => {
            const previousFootprint = resolveAggregationFootprint(previousTopology.piecesPerBlock);
            const previousPrimaryGap = resolvePrimarySeparatorGap(cellSize, cellGap);
            const previousColAxis = buildAxis(
                previousTopology.columns,
                cellSize,
                cellGap,
                chunkInterval,
                chunkGap,
                {
                    primaryInterval: PRIMARY_SEPARATOR_PIECES,
                    primaryGap: previousPrimaryGap,
                    unitsPerCell: previousFootprint.width,
                },
            );
            const previousRowAxis = buildAxis(
                previousTopology.rows,
                cellSize,
                cellGap,
                chunkInterval,
                chunkGap,
                {
                    primaryInterval: PRIMARY_SEPARATOR_PIECES,
                    primaryGap: previousPrimaryGap,
                    unitsPerCell: previousFootprint.height,
                },
            );
            const previousZoom = Math.max(previousTopology.zoom, MIN_VISIBLE_ZOOM);
            const localX = viewport.width / 2;
            const localY = viewport.height / 2;
            const previousOrigin = resolveContentScreenOrigin({
                viewportWidth: viewport.width,
                viewportHeight: viewport.height,
                contentWidth: previousColAxis.total,
                contentHeight: previousRowAxis.total,
                zoom: previousZoom,
            });
            const worldX = offset.x + (localX - previousOrigin.x) / previousZoom;
            const worldY = offset.y + (localY - previousOrigin.y) / previousZoom;

            return {
                pieceIndex: resolveTopologyTransitionAnchor({
                    worldX,
                    worldY,
                    rowStarts: previousRowAxis.starts,
                    colStarts: previousColAxis.starts,
                    cellSize,
                    totalPieces,
                    topology: previousTopology,
                    rootRaster,
                    currentPiecesPerBlock: previousTopology.piecesPerBlock,
                    nextPiecesPerBlock: displayTopology.piecesPerBlock,
                }),
                localX,
                localY,
            };
        })();
        const previousFootprint = resolveAggregationFootprint(previousTopology.piecesPerBlock);
        const nextFootprint = resolveAggregationFootprint(displayTopology.piecesPerBlock);
        const previousPrimaryGap = resolvePrimarySeparatorGap(cellSize, cellGap);
        const previousColAxis = buildAxis(
            previousTopology.columns,
            cellSize,
            cellGap,
            chunkInterval,
            chunkGap,
            {
                primaryInterval: PRIMARY_SEPARATOR_PIECES,
                primaryGap: previousPrimaryGap,
                unitsPerCell: previousFootprint.width,
            },
        );
        const previousRowAxis = buildAxis(
            previousTopology.rows,
            cellSize,
            cellGap,
            chunkInterval,
            chunkGap,
            {
                primaryInterval: PRIMARY_SEPARATOR_PIECES,
                primaryGap: previousPrimaryGap,
                unitsPerCell: previousFootprint.height,
            },
        );
        const nextColAxis = buildAxis(
            displayTopology.columns,
            cellSize,
            cellGap,
            chunkInterval,
            chunkGap,
            {
                primaryInterval: PRIMARY_SEPARATOR_PIECES,
                primaryGap: previousPrimaryGap,
                unitsPerCell: nextFootprint.width,
            },
        );
        const nextRowAxis = buildAxis(
            displayTopology.rows,
            cellSize,
            cellGap,
            chunkInterval,
            chunkGap,
            {
                primaryInterval: PRIMARY_SEPARATOR_PIECES,
                primaryGap: previousPrimaryGap,
                unitsPerCell: nextFootprint.height,
            },
        );

        const remappedOffset = resolveBlockOffset({
            anchor,
            topology: displayTopology,
            rootRaster,
            totalPieces,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
            cellSize,
            gap: cellGap,
            chunkInterval,
            chunkGap,
        });
        const previousCell = resolveBlockGridPosition({
            pieceIndex: anchor.pieceIndex,
            totalPieces,
            rootRaster,
            topology: previousTopology,
        });
        const focusCell = resolveBlockGridPosition({
            pieceIndex: anchor.pieceIndex,
            totalPieces,
            rootRaster,
            topology: displayTopology,
        });
        const aggregationChanged = previousTopology.piecesPerBlock !== displayTopology.piecesPerBlock;
        const aggregationDirection = !aggregationChanged
            ? null
            : previousTopology.piecesPerBlock < displayTopology.piecesPerBlock
              ? "collapse"
              : "expand";
        const transitionStartedAt = performance.now();
        viewTransitionRef.current = {
            startedAt: transitionStartedAt,
            durationMs: TRANSITION_POLICY.durationMs,
            mode: aggregationChanged ? "crossfade" : "interpolate",
            aggregationDirection,
            fromOffset: offset,
            toOffset: remappedOffset,
            fromZoom: Math.max(previousTopology.zoom, MIN_VISIBLE_ZOOM),
            toZoom: Math.max(displayTopology.zoom, MIN_VISIBLE_ZOOM),
            previousView: aggregationChanged
                ? {
                      topology: previousTopology,
                      colAxis: previousColAxis,
                      rowAxis: previousRowAxis,
                      blocks: buildDisplayBlocks({
                          displayCellCount: previousTopology.columns * previousTopology.rows,
                          columns: previousTopology.columns,
                          topology: previousTopology,
                          rootRaster,
                          totalPieces,
                          pieceSize,
                          unknownSizeLabel: t("torrent_modal.stats.unknown_size"),
                          resolvedStates,
                          availability,
                          availabilityMissing,
                          rareThreshold,
                      }),
                      offset,
                      zoom: Math.max(previousTopology.zoom, MIN_VISIBLE_ZOOM),
                  }
                : null,
            parentCue:
                previousCell != null
                    ? {
                          row: previousCell.row,
                          col: previousCell.col,
                          colAxis: previousColAxis,
                          rowAxis: previousRowAxis,
                          offset,
                          zoom: Math.max(previousTopology.zoom, MIN_VISIBLE_ZOOM),
                      }
                    : null,
            focusCue:
                focusCell != null
                    ? {
                          row: focusCell.row,
                          col: focusCell.col,
                          colAxis: nextColAxis,
                          rowAxis: nextRowAxis,
                          offset: remappedOffset,
                          zoom: Math.max(displayTopology.zoom, MIN_VISIBLE_ZOOM),
                      }
                    : null,
            focusSubdivision:
                aggregationDirection === "collapse"
                    ? {
                          columns: Math.max(1, Math.round(nextFootprint.width / Math.max(1, previousFootprint.width))),
                          rows: Math.max(1, Math.round(nextFootprint.height / Math.max(1, previousFootprint.height))),
                      }
                    : null,
            parentCueUntilMs: transitionStartedAt + TRANSITION_POLICY.parentCueMs,
        };
        drawStateRef.current = {
            fitZoom: displayTopology.fitZoom,
            zoom: displayTopology.zoom,
            offset: remappedOffset,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
        };
        setOffset(remappedOffset);
        zoomAnchorRef.current = null;
    }, [
        cellGap,
        cellSize,
        chunkGap,
        chunkInterval,
        displayTopology,
        offset.x,
        offset.y,
        availability,
        availabilityMissing,
        pieceSize,
        rareThreshold,
        resolvedStates,
        rootRaster,
        t,
        totalPieces,
    ]);

    const restartHelpHintTimers = () => {
        clearHelpHintTimers();
        setShowHelpHint(false);
        helpTimerRef.current = scheduler.scheduleTimeout(() => {
            if (dragModeRef.current === null) {
                setShowHelpHint(true);
            }
        }, HUD_POLICY.helpDelayMs);
        helpDismissTimerRef.current = scheduler.scheduleTimeout(() => {
            setShowHelpHint(false);
        }, HUD_POLICY.helpVisibleMs);
    };

    const refreshMinimapHud = (showMinimap = false) => {
        clearMinimapTimer();
        const minimapUseful = showMinimap || hasNavigated;
        setShowMinimapHud(minimapUseful);
        if (minimapUseful) {
            minimapDismissTimerRef.current = scheduler.scheduleTimeout(() => {
                setShowMinimapHud(false);
            }, HUD_POLICY.minimapIdleMs);
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
        const origin = resolveContentScreenOrigin({
            viewportWidth: drawState.viewportWidth,
            viewportHeight: drawState.viewportHeight,
            contentWidth: colAxis.total,
            contentHeight: rowAxis.total,
            zoom: drawState.zoom,
        });
        const worldX = drawState.offset.x + (clientX - rect.left - origin.x) / drawState.zoom;
        const worldY = drawState.offset.y + (clientY - rect.top - origin.y) / drawState.zoom;
        const col = fitIndex(worldX, colAxis.starts, cellSize);
        const row = fitIndex(worldY, rowAxis.starts, cellSize);
        if (col == null || row == null) {
            return null;
        }
        const blockIndex = row * columns + col;
        if (blockIndex < 0 || blockIndex >= displayCellCount) {
            return null;
        }
        const block = displayBlocks[blockIndex];
        if (!block) {
            return null;
        }
        return {
            blockIndex,
            row,
            col,
            startPieceIndex: block.startPieceIndex,
            endPieceIndex: block.endPieceIndex,
            pieceCount: block.pieceCount,
            totalSizeLabel: block.totalSizeLabel,
            verifiedCount: block.verifiedCount,
            missingCount: block.missingCount,
            commonCount: block.commonCount,
            rareCount: block.rareCount,
            deadCount: block.deadCount,
            isMixed: block.isMixed,
            peerMin: block.peerMin,
            peerMax: block.peerMax,
            tone: block.tone,
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
        const contentOrigin = resolveContentScreenOrigin({
            viewportWidth: drawState.viewportWidth,
            viewportHeight: drawState.viewportHeight,
            contentWidth: colAxis.total,
            contentHeight: rowAxis.total,
            zoom: drawState.zoom,
        });
        const worldX = drawState.offset.x + (localX - contentOrigin.x) / drawState.zoom;
        const worldY = drawState.offset.y + (localY - contentOrigin.y) / drawState.zoom;
        const nextTopology = resolveDisplayTopology({
            viewportWidth: drawState.viewportWidth,
            viewportHeight: drawState.viewportHeight,
            totalPieces,
            minDisplayBlockPx,
            rootRaster,
            preferredPiecesPerBlock: displayTopology.piecesPerBlock,
            zoomMultiplier: zoomLevels[nextIndex] ?? 1,
            cellSize,
            gap: cellGap,
            chunkInterval,
            chunkGap,
        });
        const anchorPieceIndex = resolveTopologyTransitionAnchor({
            worldX,
            worldY,
            rowStarts: rowAxis.starts,
            colStarts: colAxis.starts,
            cellSize,
            totalPieces,
            topology: displayTopology,
            rootRaster,
            currentPiecesPerBlock: piecesPerBlock,
            nextPiecesPerBlock: nextTopology.piecesPerBlock,
        });
        const nextOffset = resolveBlockOffset({
            anchor: {
                pieceIndex: anchorPieceIndex,
                localX,
                localY,
            },
            topology: nextTopology,
            rootRaster,
            totalPieces,
            viewportWidth: drawState.viewportWidth,
            viewportHeight: drawState.viewportHeight,
            cellSize,
            gap: cellGap,
            chunkInterval,
            chunkGap,
        });
        zoomAnchorRef.current = {
            pieceIndex: anchorPieceIndex,
            localX,
            localY,
        };
        drawStateRef.current = {
            fitZoom: nextTopology.fitZoom,
            zoom: nextTopology.zoom,
            offset: nextOffset,
            viewportWidth: drawState.viewportWidth,
            viewportHeight: drawState.viewportHeight,
        };
        setZoomIndex(nextIndex);
        setOffset(nextOffset);
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
            const fitZoom = Math.max(MIN_VISIBLE_ZOOM, displayTopology.fitZoom);
            const zoom = Math.max(MIN_VISIBLE_ZOOM, displayTopology.zoom);
            const nextOffset = clampOffset(offset, cssW, cssH, colAxis.total, rowAxis.total, zoom);
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
            const renderedView = resolveRenderedView({
                drawState: drawStateRef.current,
                transition: dragModeRef.current === null ? viewTransitionRef.current : null,
                now: performance.now(),
            });
            if (viewTransitionRef.current && !renderedView.isActive) {
                viewTransitionRef.current = null;
            } else if (renderedView.isActive) {
                scheduleDrawRef.current();
            }

            if (renderedView.previousView) {
                drawBlockLayer({
                    ctx,
                    blocks: renderedView.previousView.blocks,
                    columns: renderedView.previousView.topology.columns,
                    rows: renderedView.previousView.topology.rows,
                    colAxis: renderedView.previousView.colAxis,
                    rowAxis: renderedView.previousView.rowAxis,
                    footprint: resolveAggregationFootprint(renderedView.previousView.topology.piecesPerBlock),
                    cellSize,
                    offset: renderedView.previousView.offset,
                    zoom: renderedView.previousView.zoom,
                    viewportWidth: cssW,
                    viewportHeight: cssH,
                    palette,
                    alpha: renderedView.previousAlpha,
                });
            }
            drawBlockLayer({
                ctx,
                blocks: displayBlocks,
                columns,
                rows,
                colAxis,
                rowAxis,
                footprint: currentFootprint,
                cellSize,
                offset: renderedView.offset,
                zoom: renderedView.zoom,
                viewportWidth: cssW,
                viewportHeight: cssH,
                palette,
                alpha: renderedView.currentAlpha,
            });
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
            const renderedView = resolveRenderedView({
                drawState,
                transition: dragModeRef.current === null ? viewTransitionRef.current : null,
                now: performance.now(),
            });
            const contentOrigin = resolveContentScreenOrigin({
                viewportWidth: drawState.viewportWidth,
                viewportHeight: drawState.viewportHeight,
                contentWidth: colAxis.total,
                contentHeight: rowAxis.total,
                zoom: renderedView.zoom,
            });
            const sourceCue = renderedView.parentCue?.cue ?? null;
            const destinationCue = renderedView.focusCue?.cue ?? null;
            if (sourceCue || destinationCue) {
                const sourceX =
                    sourceCue == null
                        ? null
                        : resolveContentScreenOrigin({
                              viewportWidth: drawState.viewportWidth,
                              viewportHeight: drawState.viewportHeight,
                              contentWidth: sourceCue.colAxis.total,
                              contentHeight: sourceCue.rowAxis.total,
                              zoom: sourceCue.zoom,
                          }).x +
                          ((sourceCue.colAxis.starts[sourceCue.col] ?? 0) - sourceCue.offset.x) * sourceCue.zoom;
                const sourceY =
                    sourceCue == null
                        ? null
                        : resolveContentScreenOrigin({
                              viewportWidth: drawState.viewportWidth,
                              viewportHeight: drawState.viewportHeight,
                              contentWidth: sourceCue.colAxis.total,
                              contentHeight: sourceCue.rowAxis.total,
                              zoom: sourceCue.zoom,
                          }).y +
                          ((sourceCue.rowAxis.starts[sourceCue.row] ?? 0) - sourceCue.offset.y) * sourceCue.zoom;
                const sourceSize = sourceCue == null ? null : cellSize * sourceCue.zoom;
                const destinationX =
                    destinationCue == null
                        ? null
                        : resolveContentScreenOrigin({
                              viewportWidth: drawState.viewportWidth,
                              viewportHeight: drawState.viewportHeight,
                              contentWidth: destinationCue.colAxis.total,
                              contentHeight: destinationCue.rowAxis.total,
                              zoom: destinationCue.zoom,
                          }).x +
                          ((destinationCue.colAxis.starts[destinationCue.col] ?? 0) - destinationCue.offset.x) *
                              destinationCue.zoom;
                const destinationY =
                    destinationCue == null
                        ? null
                        : resolveContentScreenOrigin({
                              viewportWidth: drawState.viewportWidth,
                              viewportHeight: drawState.viewportHeight,
                              contentWidth: destinationCue.colAxis.total,
                              contentHeight: destinationCue.rowAxis.total,
                              zoom: destinationCue.zoom,
                          }).y +
                          ((destinationCue.rowAxis.starts[destinationCue.row] ?? 0) - destinationCue.offset.y) *
                              destinationCue.zoom;
                const destinationSize = destinationCue == null ? null : cellSize * destinationCue.zoom;
                const cueX =
                    sourceX == null
                        ? (destinationX ?? 0)
                        : destinationX == null
                          ? sourceX
                          : lerp(sourceX, destinationX, renderedView.transitionProgress);
                const cueY =
                    sourceY == null
                        ? (destinationY ?? 0)
                        : destinationY == null
                          ? sourceY
                          : lerp(sourceY, destinationY, renderedView.transitionProgress);
                const cueSize =
                    sourceSize == null
                        ? (destinationSize ?? 0)
                        : destinationSize == null
                          ? sourceSize
                          : lerp(sourceSize, destinationSize, renderedView.transitionProgress);
                const cueAlpha = Math.max(
                    renderedView.parentCue?.alpha ?? 0,
                    renderedView.focusCue?.alpha ?? 0,
                );

                ctx.fillStyle = resolveCanvasColor(palette.primary);
                ctx.globalAlpha = 0.12 * cueAlpha;
                ctx.fillRect(cueX + 1, cueY + 1, Math.max(0, cueSize - 2), Math.max(0, cueSize - 2));
                ctx.strokeStyle = resolveCanvasColor(palette.primary);
                ctx.globalAlpha = 0.85 * cueAlpha;
                ctx.lineWidth = 2;
                ctx.strokeRect(cueX + 1, cueY + 1, Math.max(0, cueSize - 2), Math.max(0, cueSize - 2));
                if (cueSize >= 10) {
                    ctx.strokeStyle = resolveCanvasColor(palette.highlight);
                    ctx.globalAlpha = 0.5 * cueAlpha;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(cueX + 4, cueY + 4, Math.max(0, cueSize - 8), Math.max(0, cueSize - 8));
                }
                ctx.globalAlpha = 1;
            }
            if (!hoveredPiece) {
                return;
            }
            const cellBounds = resolveRenderedCellBounds({
                x: contentOrigin.x + ((colAxis.starts[hoveredPiece.col] ?? 0) - renderedView.offset.x) * renderedView.zoom,
                y: contentOrigin.y + ((rowAxis.starts[hoveredPiece.row] ?? 0) - renderedView.offset.y) * renderedView.zoom,
                size: cellSize * renderedView.zoom,
                row: hoveredPiece.row,
                col: hoveredPiece.col,
                rows,
                columns,
                footprint: currentFootprint,
            });
            ctx.strokeStyle = resolveCanvasColor(palette.foreground);
            ctx.globalAlpha = 0.85;
            ctx.lineWidth = 2;
            ctx.strokeRect(
                cellBounds.x + 0.5,
                cellBounds.y + 0.5,
                Math.max(0, cellBounds.width - 1),
                Math.max(0, cellBounds.height - 1),
            );
            ctx.strokeStyle = resolveCanvasColor(palette.primary);
            ctx.globalAlpha = 0.9;
            ctx.lineWidth = 1;
            ctx.strokeRect(
                cellBounds.x + 2,
                cellBounds.y + 2,
                Math.max(0, cellBounds.width - 4),
                Math.max(0, cellBounds.height - 4),
            );
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
            for (let blockIndex = 0; blockIndex < displayCellCount; blockIndex += 1) {
                const block = displayBlocks[blockIndex];
                if (!block) {
                    continue;
                }
                const x = offsetX + (colAxis.starts[block.col] ?? 0) * scale;
                const y = offsetY + (rowAxis.starts[block.row] ?? 0) * scale;
                const size = Math.max(1, cellSize * scale);
                const tone = block.tone;
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
    }, [colAxis, displayBlockCount, displayBlocks, hoveredPiece, offset, palette, rowAxis, zoomIndex]);

    useEffect(() => {
        if (!pointerRef.current.isInside || dragModeRef.current !== null) {
            return;
        }
        setHoveredCell(readCell(pointerRef.current.clientX, pointerRef.current.clientY));
    }, [colAxis, displayBlockCount, displayBlocks, offset, rowAxis, zoomIndex]);

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

        const contentOrigin = resolveContentScreenOrigin({
            viewportWidth: drawState.viewportWidth,
            viewportHeight: drawState.viewportHeight,
            contentWidth: colAxis.total,
            contentHeight: rowAxis.total,
            zoom: drawState.zoom,
        });
        const cellBounds = resolveRenderedCellBounds({
            x: contentOrigin.x + ((colAxis.starts[hoveredPiece.col] ?? 0) - drawState.offset.x) * drawState.zoom,
            y: contentOrigin.y + ((rowAxis.starts[hoveredPiece.row] ?? 0) - drawState.offset.y) * drawState.zoom,
            size: cellSize * drawState.zoom,
            row: hoveredPiece.row,
            col: hoveredPiece.col,
            rows,
            columns,
            footprint: currentFootprint,
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
            cellBounds.x + cellBounds.width / 2 - tooltipRect.width / 2,
            TOOLTIP_EDGE_PADDING,
            maxLeft,
        );
        const aboveTop = cellBounds.y - tooltipRect.height - TOOLTIP_GAP;
        const belowTop = cellBounds.y + cellBounds.height + TOOLTIP_GAP;
        const fitsAbove = aboveTop >= TOOLTIP_EDGE_PADDING;
        const fitsBelow = belowTop <= maxTop;
        const preferredTop = fitsAbove || !fitsBelow ? aboveTop : belowTop;
        const top = clamp(preferredTop, TOOLTIP_EDGE_PADDING, maxTop);

        setTooltipStyle({ left, top, visibility: "visible" });
    }, [availabilityMissing, cellSize, colAxis, hoveredPiece, offset, pieceSizeLabel, rowAxis, zoomIndex]);

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

    useEffect(() => {
        const stopDragging = () => {
            if (dragModeRef.current === null) {
                return;
            }
            dragModeRef.current = null;
            setDragMode(null);
            restartHelpHintRef.current();
            refreshMinimapHudRef.current();
        };

        const onMouseMove = (event: MouseEvent) => {
            const drawState = drawStateRef.current;
            if (!drawState) {
                return;
            }
            if (dragModeRef.current === "canvas") {
                refreshMinimapHudRef.current(true);
                const nextOffset = clampOffset(
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
                );
                drawStateRef.current = {
                    ...drawState,
                    offset: nextOffset,
                };
                setOffset(nextOffset);
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
                const nextOffset = clampOffset(
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
                );
                drawStateRef.current = {
                    ...drawState,
                    offset: nextOffset,
                };
                setOffset(nextOffset);
            }
        };
        const onMouseUp = () => {
            stopDragging();
        };
        const onWindowBlur = () => {
            stopDragging();
        };
        const onVisibilityChange = () => {
            if (document.visibilityState !== "visible") {
                stopDragging();
            }
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        window.addEventListener("blur", onWindowBlur);
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            window.removeEventListener("blur", onWindowBlur);
            document.removeEventListener("visibilitychange", onVisibilityChange);
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
        const pieceLabel =
            hoveredPiece.pieceCount === 1
                ? t("torrent_modal.piece_map.tooltip_piece", {
                      piece: hoveredPiece.startPieceIndex + 1,
                  })
                : t("torrent_modal.piece_map.tooltip_piece_range", {
                      start: hoveredPiece.startPieceIndex + 1,
                      end: hoveredPiece.endPieceIndex + 1,
                  });
        const blockSizeLabel =
            hoveredPiece.pieceCount === 1
                ? hoveredPiece.totalSizeLabel
                : t("torrent_modal.piece_map.tooltip_block_summary", {
                      count: hoveredPiece.pieceCount,
                      size: hoveredPiece.totalSizeLabel,
                  });
        const availabilityLabel =
            hoveredPiece.missingCount <= 0
                ? null
                : availabilityMissing
                  ? t("torrent_modal.piece_map.tooltip_availability_unknown")
                  : hoveredPiece.peerMin == null || hoveredPiece.peerMax == null
                    ? t("torrent_modal.piece_map.tooltip_availability_unknown")
                    : hoveredPiece.peerMin === hoveredPiece.peerMax
                      ? t("torrent_modal.piece_map.tooltip_available_peers", {
                            peers: hoveredPiece.peerMin,
                        })
                      : t("torrent_modal.piece_map.tooltip_peers_range", {
                            min: hoveredPiece.peerMin,
                            max: hoveredPiece.peerMax,
                        });
        const compositionParts = [
            hoveredPiece.verifiedCount > 0
                ? t("torrent_modal.piece_map.tooltip_state_count", {
                      count: hoveredPiece.verifiedCount,
                      state: t("torrent_modal.stats.verified"),
                  })
                : null,
            hoveredPiece.commonCount > 0
                ? t("torrent_modal.piece_map.tooltip_state_count", {
                      count: hoveredPiece.commonCount,
                      state: t("torrent_modal.availability.legend_common"),
                  })
                : null,
            hoveredPiece.rareCount > 0
                ? t("torrent_modal.piece_map.tooltip_state_count", {
                      count: hoveredPiece.rareCount,
                      state: t("torrent_modal.availability.legend_rare"),
                  })
                : null,
            hoveredPiece.deadCount > 0
                ? t("torrent_modal.piece_map.tooltip_state_count", {
                      count: hoveredPiece.deadCount,
                      state: t("torrent_modal.piece_map.legend_dead"),
                  })
                : null,
            availabilityMissing && hoveredPiece.missingCount > 0
                ? t("torrent_modal.piece_map.tooltip_state_count", {
                      count: hoveredPiece.missingCount,
                      state: t("torrent_modal.stats.missing"),
                  })
                : null,
        ].filter((value): value is string => Boolean(value));

        if (hoveredPiece.isMixed) {
            const lines = [pieceLabel, blockSizeLabel];
            if (compositionParts.length > 0) {
                lines.push(compositionParts.join(" • "));
            }
            if (availabilityLabel && !availabilityMissing) {
                lines.push(availabilityLabel);
            }
            return lines;
        }

        const statusLabel =
            hoveredPiece.missingCount <= 0
                ? t("torrent_modal.stats.verified")
                : hoveredPiece.tone === "dead"
                  ? t("torrent_modal.piece_map.legend_dead")
                  : hoveredPiece.tone === "rare"
                    ? t("torrent_modal.availability.legend_rare")
                    : hoveredPiece.tone === "common"
                      ? t("torrent_modal.availability.legend_common")
                      : t("torrent_modal.stats.missing");

        const lines = [pieceLabel, blockSizeLabel, statusLabel];
        if (availabilityLabel && hoveredPiece.missingCount > 0) {
            lines.push(availabilityLabel);
        }
        return lines;
    }, [availabilityMissing, hoveredPiece, t]);

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
        blockDensityLabel,
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
                pointerRef.current = {
                    clientX: event.clientX,
                    clientY: event.clientY,
                    isInside: true,
                };
                setHoveredCell(readCell(event.clientX, event.clientY));
            },
            onMouseLeave: () => {
                if (dragModeRef.current !== null) {
                    return;
                }
                pointerRef.current.isInside = false;
                clearHelpHintTimers();
                setHoveredPiece(null);
                setTooltipStyle(undefined);
                setShowHelpHint(false);
            },
            onMouseDown: (event) => {
                if (event.button !== 0) {
                    return;
                }
                event.preventDefault();
                const drawState = drawStateRef.current;
                if (!drawState) {
                    return;
                }
                stopActiveTransition();
                const stableDrawState = drawStateRef.current ?? drawState;
                setHoveredPiece(null);
                setTooltipStyle(undefined);
                dragModeRef.current = "canvas";
                restartHelpHintTimers();
                refreshMinimapHud(true);
                dragStartRef.current = {
                    x: event.clientX,
                    y: event.clientY,
                    offset: stableDrawState.offset,
                };
                setDragMode("canvas");
            },
            onWheel: (event) => {
                event.preventDefault();
                if (event.deltaY === 0) return;
                const direction = event.deltaY < 0 ? 1 : -1;
                const wheelStep = clamp(Math.ceil(Math.abs(event.deltaY) / 120), 1, 3);
                const nextIndex = clamp(zoomIndex + direction * wheelStep, 0, zoomLevels.length - 1);
                if (nextIndex === zoomIndex) return;
                restartHelpHintTimers();
                refreshMinimapHud(true);
                applyZoom(nextIndex, event.clientX, event.clientY);
            },
            onMinimapMouseDown: (event) => {
                if (event.button !== 0) {
                    return;
                }
                event.preventDefault();
                stopActiveTransition();
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
                                (event.clientX - rect.left - originX) / Math.max(scale, MIN_MINIMAP_SCALE) -
                                drawState.viewportWidth / drawState.zoom / 2,
                            y:
                                (event.clientY - rect.top - originY) / Math.max(scale, MIN_MINIMAP_SCALE) -
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
