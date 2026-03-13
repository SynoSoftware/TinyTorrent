import type {
    CSSProperties,
    MouseEvent as ReactMouseEvent,
    MutableRefObject,
    RefObject,
} from "react";
import {
    useCallback,
    useEffect,
    useEffectEvent,
    useMemo,
    useRef,
    useState,
} from "react";
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
const TOPOLOGY_SCORE_EPSILON = 1e-6;
const MIN_BALANCED_COLUMN_COVERAGE_X = 0.72;
const SWARM_TONE_WEIGHT: Record<SwarmTone, number> = {
    dead: 5,
    rare: 4,
    common: 3,
    missing: 2,
    verified: 1,
};

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
    swatchColumns: number;
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
    coverageX: number;
    coverageY: number;
    fitsHeight: boolean;
    coverageScore: number;
};
type ViewportBoundsSetter = (
    next:
        | ViewportBounds
        | ((current: ViewportBounds | null) => ViewportBounds | null),
) => void;
type OverviewTopologyParams = {
    viewportWidth: number | null;
    viewportHeight: number | null;
    totalPieces: number;
    cellSize: number;
    gap: number;
    fallbackColumns: number;
};
type TranslateFn = ReturnType<typeof useTranslation>["t"];
type TooltipDetailBuildParams = {
    block: DisplayBlock | null;
    t: TranslateFn;
    availabilityMissing: boolean;
    availability: number[];
    rareThreshold: number;
    resolvedStates: PieceStatus[];
    swatchSize: number;
    swatchGap: number;
};

const resolveTooltipAvailabilityLine = (params: {
    block: DisplayBlock;
    availabilityMissing: boolean;
    t: TranslateFn;
}) => {
    if (params.block.missingCount <= 0) {
        return null;
    }
    if (
        params.availabilityMissing ||
        params.block.peerMin == null ||
        params.block.peerMax == null
    ) {
        return params.t("torrent_modal.piece_map.tooltip_availability_unknown");
    }
    return params.block.peerMin === params.block.peerMax
        ? params.t("torrent_modal.piece_map.tooltip_available_peers", {
              peers: params.block.peerMin,
          })
        : params.t("torrent_modal.piece_map.tooltip_peers_range", {
              min: params.block.peerMin,
              max: params.block.peerMax,
          });
};

const buildTooltipTitle = (block: DisplayBlock, t: TranslateFn) => {
    const titlePrefix =
        block.pieceCount === 1
            ? t("torrent_modal.piece_map.tooltip_piece", {
                  piece: block.startPieceIndex + 1,
              })
            : t("torrent_modal.piece_map.tooltip_piece_range", {
                  start: block.startPieceIndex + 1,
                  end: block.endPieceIndex + 1,
              });
    return `${titlePrefix}, ${block.totalSizeLabel}`;
};

const buildTooltipSummary = (
    block: DisplayBlock,
    availabilityMissing: boolean,
    t: TranslateFn,
) => {
    const summaryParts = [
        {
            key: "verified",
            count: block.verifiedCount,
            stateLabel: t("torrent_modal.stats.verified"),
        },
        {
            key: "common",
            count: block.commonCount,
            stateLabel: t("torrent_modal.availability.legend_common"),
        },
        {
            key: "rare",
            count: block.rareCount,
            stateLabel: t("torrent_modal.availability.legend_rare"),
        },
        {
            key: "dead",
            count: block.deadCount,
            stateLabel: t("torrent_modal.piece_map.legend_dead"),
        },
        {
            key: "missing",
            count: block.missingCount,
            stateLabel: t("torrent_modal.stats.missing"),
        },
    ];
    return summaryParts
        .filter(
            (part) =>
                part.count > 0 &&
                (availabilityMissing || part.key !== "missing"),
        )
        .map((part) =>
            part.count === 1
                ? part.stateLabel
                : t("torrent_modal.piece_map.tooltip_state_count", {
                      count: part.count,
                      state: part.stateLabel,
                  }),
        )
        .join(" · ");
};

const buildTooltipSwatches = (params: {
    block: DisplayBlock;
    resolvedStates: PieceStatus[];
    availabilityMissing: boolean;
    availability: number[];
    rareThreshold: number;
}) =>
    Array.from({ length: params.block.pieceCount }, (_, offset): TooltipDetailSwatch => {
        const pieceIndex = params.block.startPieceIndex + offset;
        return {
            tone: resolvePieceTone({
                pieceIndex,
                resolvedStates: params.resolvedStates,
                availabilityMissing: params.availabilityMissing,
                availability: params.availability,
                rareThreshold: params.rareThreshold,
            }),
        };
    });

const buildTooltipDetail = (params: TooltipDetailBuildParams): TooltipDetail | null => {
    if (!params.block) {
        return null;
    }
    return {
        title: buildTooltipTitle(params.block, params.t),
        summary: buildTooltipSummary(
            params.block,
            params.availabilityMissing,
            params.t,
        ),
        availabilityLine: resolveTooltipAvailabilityLine({
            block: params.block,
            availabilityMissing: params.availabilityMissing,
            t: params.t,
        }),
        swatches: buildTooltipSwatches({
            block: params.block,
            resolvedStates: params.resolvedStates,
            availabilityMissing: params.availabilityMissing,
            availability: params.availability,
            rareThreshold: params.rareThreshold,
        }),
        swatchSize: params.swatchSize,
        swatchGap: params.swatchGap,
        swatchColumns: SEPARATOR_BLOCKS,
    };
};

const resolveTooltipStyleForBlock = (params: {
    hoveredBlock: DisplayBlock | null;
    tooltipElement: HTMLDivElement | null;
    drawState: DrawState | null;
    colAxis: Axis;
    rowAxis: Axis;
    cellSize: number;
}): CSSProperties | undefined => {
    if (!params.hoveredBlock || !params.tooltipElement || !params.drawState) {
        return undefined;
    }

    const bounds = resolveRenderedCellBounds({
        x:
            params.drawState.contentOriginX +
            (params.colAxis.starts[params.hoveredBlock.col] ?? 0) *
                params.drawState.fitZoom,
        y:
            params.drawState.contentOriginY +
            (params.rowAxis.starts[params.hoveredBlock.row] ?? 0) *
                params.drawState.fitZoom,
        size: params.cellSize * params.drawState.fitZoom,
    });
    const tooltipRect = params.tooltipElement.getBoundingClientRect();
    const maxLeft = Math.max(
        TOOLTIP_EDGE_PADDING,
        params.drawState.viewportWidth - tooltipRect.width - TOOLTIP_EDGE_PADDING,
    );
    const maxTop = Math.max(
        TOOLTIP_EDGE_PADDING,
        params.drawState.viewportHeight - tooltipRect.height - TOOLTIP_EDGE_PADDING,
    );
    const left = clamp(
        bounds.x + bounds.width / 2 - tooltipRect.width / 2,
        TOOLTIP_EDGE_PADDING,
        maxLeft,
    );
    const aboveTop = bounds.y - tooltipRect.height - TOOLTIP_GAP;
    const belowTop = bounds.y + bounds.height + TOOLTIP_GAP;
    const preferredTop =
        aboveTop >= TOOLTIP_EDGE_PADDING || belowTop > maxTop
            ? aboveTop
            : belowTop;
    const top = clamp(preferredTop, TOOLTIP_EDGE_PADDING, maxTop);

    return { left, top, visibility: "visible" };
};

const resolvePieceTone = (params: {
    pieceIndex: number;
    resolvedStates: PieceStatus[];
    availabilityMissing: boolean;
    availability: number[];
    rareThreshold: number;
}): SwarmTone => {
    if ((params.resolvedStates[params.pieceIndex] ?? "missing") === "done") {
        return "verified";
    }
    if (params.availabilityMissing) {
        return "missing";
    }
    const peers = params.availability[params.pieceIndex] ?? 0;
    if (peers <= 0) {
        return "dead";
    }
    if (peers <= params.rareThreshold) {
        return "rare";
    }
    return "common";
};

const summarizeToneCounts = (params: {
    totalPieces: number;
    resolvedStates: PieceStatus[];
    availabilityMissing: boolean;
    availability: number[];
    rareThreshold: number;
}) => {
    let rareCount = 0;
    let deadCount = 0;
    let verifiedCount = 0;

    for (let pieceIndex = 0; pieceIndex < params.totalPieces; pieceIndex += 1) {
        const tone = resolvePieceTone({
            pieceIndex,
            resolvedStates: params.resolvedStates,
            availabilityMissing: params.availabilityMissing,
            availability: params.availability,
            rareThreshold: params.rareThreshold,
        });
        if (tone === "verified") {
            verifiedCount += 1;
        } else if (tone === "rare") {
            rareCount += 1;
        } else if (tone === "dead") {
            deadCount += 1;
        }
    }

    return { rareCount, deadCount, verifiedCount };
};

const countBlockToneComposition = (params: {
    startPieceIndex: number;
    endPieceIndex: number;
    resolvedStates: PieceStatus[];
    availabilityMissing: boolean;
    availability: number[];
    rareThreshold: number;
}) => {
    let verifiedInBlock = 0;
    let commonInBlock = 0;
    let deadInBlock = 0;
    let rareInBlock = 0;
    let peerMin: number | null = null;
    let peerMax: number | null = null;

    for (
        let pieceIndex = params.startPieceIndex;
        pieceIndex <= params.endPieceIndex;
        pieceIndex += 1
    ) {
        const tone = resolvePieceTone({
            pieceIndex,
            resolvedStates: params.resolvedStates,
            availabilityMissing: params.availabilityMissing,
            availability: params.availability,
            rareThreshold: params.rareThreshold,
        });
        if (tone === "verified") {
            verifiedInBlock += 1;
            continue;
        }
        if (tone === "common") {
            commonInBlock += 1;
        } else if (tone === "rare") {
            rareInBlock += 1;
        } else if (tone === "dead") {
            deadInBlock += 1;
        }

        if (!params.availabilityMissing && tone !== "missing") {
            const peers = params.availability[pieceIndex] ?? 0;
            peerMin = peerMin == null ? peers : Math.min(peerMin, peers);
            peerMax = peerMax == null ? peers : Math.max(peerMax, peers);
        }
    }

    return {
        verifiedInBlock,
        commonInBlock,
        rareInBlock,
        deadInBlock,
        peerMin,
        peerMax,
    };
};

const resolveDominantBlockTone = (params: {
    composition: Array<{ tone: SwarmTone; count: number }>;
    availabilityMissing: boolean;
    missingCount: number;
}) => {
    const dominantTone = params.composition.reduce(
        (best, entry) => {
            if (entry.count > best.count) {
                return entry;
            }
            if (entry.count === best.count && entry.count > 0) {
                return SWARM_TONE_WEIGHT[entry.tone] > SWARM_TONE_WEIGHT[best.tone]
                    ? entry
                    : best;
            }
            return best;
        },
        params.composition[0] ?? { tone: "verified" as SwarmTone, count: 0 },
    );
    if (dominantTone.count > 0) {
        return dominantTone.tone;
    }
    return params.availabilityMissing && params.missingCount > 0
        ? "missing"
        : "verified";
};

const buildDisplayBlocks = (params: {
    displayCellCount: number;
    columns: number;
    displayTopology: DisplayTopology;
    totalPieces: number;
    resolvedStates: PieceStatus[];
    availabilityMissing: boolean;
    availability: number[];
    rareThreshold: number;
    pieceSize?: number;
    t: TranslateFn;
}): Array<DisplayBlock | null> =>
    Array.from({ length: params.displayCellCount }, (_, blockIndex) => {
        const row = Math.floor(blockIndex / params.columns);
        const col = blockIndex % params.columns;
        const pieceRange = resolveCellPieceRange({
            row,
            col,
            topology: params.displayTopology,
            totalPieces: params.totalPieces,
        });
        if (!pieceRange) {
            return null;
        }

        const compositionCounts = countBlockToneComposition({
            startPieceIndex: pieceRange.startPieceIndex,
            endPieceIndex: pieceRange.endPieceIndex,
            resolvedStates: params.resolvedStates,
            availabilityMissing: params.availabilityMissing,
            availability: params.availability,
            rareThreshold: params.rareThreshold,
        });
        const pieceCount = pieceRange.endPieceIndex - pieceRange.startPieceIndex + 1;
        const missingInBlock = pieceCount - compositionCounts.verifiedInBlock;
        const composition: Array<{ tone: SwarmTone; count: number }> = [
            { tone: "verified", count: compositionCounts.verifiedInBlock },
            { tone: "common", count: compositionCounts.commonInBlock },
            { tone: "rare", count: compositionCounts.rareInBlock },
            { tone: "dead", count: compositionCounts.deadInBlock },
            {
                tone: "missing",
                count: params.availabilityMissing ? missingInBlock : 0,
            },
        ];
        const tone = resolveDominantBlockTone({
            composition,
            availabilityMissing: params.availabilityMissing,
            missingCount: missingInBlock,
        });

        return {
            blockIndex,
            row,
            col,
            startPieceIndex: pieceRange.startPieceIndex,
            endPieceIndex: pieceRange.endPieceIndex,
            pieceCount,
            totalSizeLabel: params.pieceSize
                ? formatBytes(params.pieceSize * pieceCount)
                : params.t("torrent_modal.stats.unknown_size"),
            verifiedCount: compositionCounts.verifiedInBlock,
            missingCount: missingInBlock,
            commonCount: compositionCounts.commonInBlock,
            rareCount: compositionCounts.rareInBlock,
            deadCount: compositionCounts.deadInBlock,
            isMixed: composition.filter((entry) => entry.count > 0).length > 1,
            tone,
            peerMin: compositionCounts.peerMin,
            peerMax: compositionCounts.peerMax,
        };
    });

const readDisplayCell = (params: {
    clientX: number;
    clientY: number;
    drawState: DrawState | null;
    root: HTMLDivElement | null;
    colAxis: Axis;
    rowAxis: Axis;
    cellSize: number;
    displayBlocks: Array<DisplayBlock | null>;
    columns: number;
}): DisplayBlock | null => {
    if (!params.drawState || !params.root) {
        return null;
    }

    const rect = params.root.getBoundingClientRect();
    const localX = params.clientX - rect.left;
    const localY = params.clientY - rect.top;
    const worldX =
        (localX - params.drawState.contentOriginX) /
        Math.max(params.drawState.fitZoom, 1e-6);
    const worldY =
        (localY - params.drawState.contentOriginY) /
        Math.max(params.drawState.fitZoom, 1e-6);
    const col = fitIndex(worldX, params.colAxis.starts, params.cellSize);
    const row = fitIndex(worldY, params.rowAxis.starts, params.cellSize);
    if (col == null || row == null) {
        return null;
    }

    const block = params.displayBlocks[row * params.columns + col] ?? null;
    if (!block) {
        return null;
    }

    const bounds = resolveRenderedCellBounds({
        x:
            params.drawState.contentOriginX +
            (params.colAxis.starts[block.col] ?? 0) * params.drawState.fitZoom,
        y:
            params.drawState.contentOriginY +
            (params.rowAxis.starts[block.row] ?? 0) * params.drawState.fitZoom,
        size: params.cellSize * params.drawState.fitZoom,
    });
    const isInsideRenderedCell =
        localX >= bounds.x &&
        localX <= bounds.x + bounds.width &&
        localY >= bounds.y &&
        localY <= bounds.y + bounds.height;
    return isInsideRenderedCell ? block : null;
};

const drawDisplayBlocksToCanvas = (params: {
    ctx: CanvasRenderingContext2D;
    displayBlocks: Array<DisplayBlock | null>;
    palette: ReturnType<typeof useCanvasPalette>;
    origin: { x: number; y: number };
    colAxis: Axis;
    rowAxis: Axis;
    fitZoom: number;
    cellSize: number;
    displayTopology: DisplayTopology;
}) => {
    const size = params.cellSize * params.displayTopology.fitZoom;
    for (const block of params.displayBlocks) {
        if (!block) {
            continue;
        }
        const bounds = resolveRenderedCellBounds({
            x: params.origin.x + (params.colAxis.starts[block.col] ?? 0) * params.fitZoom,
            y: params.origin.y + (params.rowAxis.starts[block.row] ?? 0) * params.fitZoom,
            size,
        });

        if (block.tone === "verified") {
            params.ctx.fillStyle = resolveCanvasColor(params.palette.success);
            params.ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        } else if (block.tone === "common") {
            params.ctx.fillStyle = resolveCanvasColor(params.palette.primary);
            params.ctx.globalAlpha = 0.35;
            params.ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            params.ctx.globalAlpha = 1;
        } else if (block.tone === "rare") {
            params.ctx.fillStyle = resolveCanvasColor(params.palette.warning);
            params.ctx.globalAlpha = 0.75;
            params.ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            params.ctx.globalAlpha = 1;
        } else if (block.tone === "dead") {
            params.ctx.fillStyle = resolveCanvasColor(params.palette.foreground);
            params.ctx.globalAlpha = 0.12;
            params.ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            params.ctx.globalAlpha = 1;
            params.ctx.strokeStyle = resolveCanvasColor(params.palette.danger);
            params.ctx.lineWidth = Math.max(1, params.displayTopology.fitZoom * 0.12);
            params.ctx.strokeRect(
                bounds.x + 0.5,
                bounds.y + 0.5,
                Math.max(0, bounds.width - 1),
                Math.max(0, bounds.height - 1),
            );
        } else {
            params.ctx.fillStyle = resolveCanvasColor(params.palette.foreground);
            params.ctx.globalAlpha = 0.18;
            params.ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            params.ctx.globalAlpha = 1;
        }

        if (block.tone === "rare" && Math.min(bounds.width, bounds.height) >= 5) {
            params.ctx.save();
            params.ctx.beginPath();
            params.ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
            params.ctx.clip();
            params.ctx.strokeStyle = resolveCanvasColor(params.palette.foreground);
            params.ctx.globalAlpha = 0.22;
            params.ctx.lineWidth = Math.max(1, params.displayTopology.fitZoom * 0.12);
            const stripeGap = Math.max(
                4,
                Math.min(bounds.width, bounds.height) * 0.4,
            );
            for (
                let stripe = -Math.min(bounds.width, bounds.height);
                stripe < Math.max(bounds.width, bounds.height) * 2;
                stripe += stripeGap
            ) {
                params.ctx.beginPath();
                params.ctx.moveTo(bounds.x + stripe, bounds.y + bounds.height);
                params.ctx.lineTo(bounds.x + stripe + bounds.height, bounds.y);
                params.ctx.stroke();
            }
            params.ctx.restore();
            params.ctx.globalAlpha = 1;
        }

        if (block.isMixed && Math.min(bounds.width, bounds.height) >= 6) {
            const markerSize = Math.max(
                4,
                Math.min(bounds.width, bounds.height) * 0.24,
            );
            params.ctx.fillStyle = resolveCanvasColor(params.palette.foreground);
            params.ctx.globalAlpha = 0.6;
            params.ctx.beginPath();
            params.ctx.moveTo(bounds.x + bounds.width, bounds.y);
            params.ctx.lineTo(bounds.x + bounds.width - markerSize, bounds.y);
            params.ctx.lineTo(bounds.x + bounds.width, bounds.y + markerSize);
            params.ctx.closePath();
            params.ctx.fill();
            params.ctx.globalAlpha = 1;
        }
    }
};

const drawHoveredBlockOverlay = (params: {
    ctx: CanvasRenderingContext2D;
    hoveredBlock: DisplayBlock | null;
    drawState: DrawState;
    colAxis: Axis;
    rowAxis: Axis;
    cellSize: number;
    palette: ReturnType<typeof useCanvasPalette>;
}) => {
    if (!params.hoveredBlock) {
        return;
    }

    const hoveredBounds = resolveRenderedCellBounds({
        x:
            params.drawState.contentOriginX +
            (params.colAxis.starts[params.hoveredBlock.col] ?? 0) *
                params.drawState.fitZoom,
        y:
            params.drawState.contentOriginY +
            (params.rowAxis.starts[params.hoveredBlock.row] ?? 0) *
                params.drawState.fitZoom,
        size: params.cellSize * params.drawState.fitZoom,
    });
    params.ctx.strokeStyle = resolveCanvasColor(params.palette.foreground);
    params.ctx.globalAlpha = 0.82;
    params.ctx.lineWidth = 1.5;
    params.ctx.strokeRect(
        hoveredBounds.x + 0.5,
        hoveredBounds.y + 0.5,
        Math.max(0, hoveredBounds.width - 1),
        Math.max(0, hoveredBounds.height - 1),
    );
    params.ctx.globalAlpha = 1;
};

const scheduleDrawFrames = (params: {
    frameRef: MutableRefObject<FrameHandle | null>;
    overlayFrameRef: MutableRefObject<FrameHandle | null>;
    canvasRef: RefObject<HTMLCanvasElement | null>;
    overlayRef: RefObject<HTMLCanvasElement | null>;
    rootRef: RefObject<HTMLDivElement | null>;
    viewportBounds: ViewportBounds | null;
    setViewportBounds: ViewportBoundsSetter;
    drawStateRef: MutableRefObject<DrawState | null>;
    displayTopology: DisplayTopology;
    colAxis: Axis;
    rowAxis: Axis;
    cellSize: number;
    displayBlocks: Array<DisplayBlock | null>;
    palette: ReturnType<typeof useCanvasPalette>;
    hoveredBlock: DisplayBlock | null;
}) => {
    if (params.frameRef.current) {
        cancelScheduledFrame(params.frameRef.current);
    }

    params.frameRef.current = scheduleFrame(() => {
        const canvas = params.canvasRef.current;
        if (!canvas) {
            return;
        }

        const measuredViewportBounds = readViewportBounds(params.rootRef.current);
        if (
            measuredViewportBounds != null &&
            (measuredViewportBounds.width !== params.viewportBounds?.width ||
                measuredViewportBounds.height !== params.viewportBounds?.height)
        ) {
            params.setViewportBounds(measuredViewportBounds);
            return;
        }

        const { cssW, cssH, dpr } = fitCanvasToContainer(
            canvas,
            params.rootRef.current,
            MIN_DRAW_DIMENSION,
        );
        if (cssW < MIN_DRAW_DIMENSION || cssH < MIN_DRAW_DIMENSION) {
            return;
        }

        const fitZoom = Math.max(params.displayTopology.fitZoom, 1e-6);
        const contentWidth = params.colAxis.total * fitZoom;
        const origin = resolveContentOrigin(cssW, contentWidth);
        params.drawStateRef.current = {
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

        // Draw in CSS-space coordinates after fitting the high-DPI backing store.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawDisplayBlocksToCanvas({
            ctx,
            displayBlocks: params.displayBlocks,
            palette: params.palette,
            origin,
            colAxis: params.colAxis,
            rowAxis: params.rowAxis,
            fitZoom,
            cellSize: params.cellSize,
            displayTopology: params.displayTopology,
        });
    });

    if (params.overlayFrameRef.current) {
        cancelScheduledFrame(params.overlayFrameRef.current);
    }
    params.overlayFrameRef.current = scheduleFrame(() => {
        const overlay = params.overlayRef.current;
        const drawState = params.drawStateRef.current;
        if (!overlay || !drawState) {
            return;
        }

        const { dpr } = fitCanvasToContainer(
            overlay,
            params.rootRef.current,
            MIN_DRAW_DIMENSION,
        );
        const ctx = overlay.getContext("2d");
        if (!ctx) {
            return;
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawHoveredBlockOverlay({
            ctx,
            hoveredBlock: params.hoveredBlock,
            drawState,
            colAxis: params.colAxis,
            rowAxis: params.rowAxis,
            cellSize: params.cellSize,
            palette: params.palette,
        });
    });
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
    contentWidth: number,
) => ({
    x: Math.max(0, (viewportWidth - contentWidth) / 2),
    y: 0,
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

const resolveMaxFittingColumns = (params: {
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

const resolveColumnCandidates = (params: {
    maxColumns: number;
    totalCells: number;
}) => {
    const cappedMaxColumns = clamp(params.maxColumns, 1, params.totalCells);
    if (params.totalCells < SEPARATOR_BLOCKS || cappedMaxColumns < SEPARATOR_BLOCKS) {
        return [cappedMaxColumns];
    }

    const candidates: number[] = [];
    for (
        let columns = cappedMaxColumns;
        columns >= SEPARATOR_BLOCKS;
        columns -= SEPARATOR_BLOCKS
    ) {
        candidates.push(columns);
    }
    return candidates;
};

const pickBetterColumnMetrics = (
    current: TopologyMetrics | null,
    candidate: TopologyMetrics,
) => {
    if (!current) {
        return candidate;
    }
    if (candidate.fitsHeight !== current.fitsHeight) {
        return candidate.fitsHeight ? candidate : current;
    }

    const currentHasBalancedWidth =
        current.coverageX >= MIN_BALANCED_COLUMN_COVERAGE_X;
    const candidateHasBalancedWidth =
        candidate.coverageX >= MIN_BALANCED_COLUMN_COVERAGE_X;
    if (currentHasBalancedWidth !== candidateHasBalancedWidth) {
        return candidateHasBalancedWidth ? candidate : current;
    }

    if (candidate.coverageScore > current.coverageScore + TOPOLOGY_SCORE_EPSILON) {
        return candidate;
    }
    if (
        Math.abs(candidate.coverageScore - current.coverageScore) <=
            TOPOLOGY_SCORE_EPSILON &&
        candidate.contentHeight >
            current.contentHeight + TOPOLOGY_SCORE_EPSILON
    ) {
        return candidate;
    }
    return current;
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
    const maxFittingColumns = resolveMaxFittingColumns({
        viewportWidth: params.viewportWidth,
        totalCells: blockCount,
        cellSize: params.cellSize,
        gap: params.gap,
        fallbackColumns: Math.min(params.fallbackColumns, blockCount),
        maxColumns,
        separatorEvery: SEPARATOR_BLOCKS,
        separatorExtraGap,
    });
    const columnCandidates = resolveColumnCandidates({
        maxColumns: maxFittingColumns,
        totalCells: blockCount,
    });

    let bestMetrics: TopologyMetrics | null = null;
    for (const columns of columnCandidates) {
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
        const coverageX =
            params.viewportWidth != null && params.viewportWidth > 0
                ? clamp(contentWidth / params.viewportWidth, 0, 1)
                : 1;
        const coverageY =
            params.viewportHeight != null && params.viewportHeight > 0
                ? clamp(contentHeight / params.viewportHeight, 0, 1)
                : 1;
        const fitsHeight =
            params.viewportHeight == null ||
            params.viewportHeight <= 0 ||
            contentHeight <= params.viewportHeight;
        bestMetrics = pickBetterColumnMetrics(bestMetrics, {
            topology,
            contentWidth,
            contentHeight,
            coverageX,
            coverageY,
            fitsHeight,
            coverageScore: coverageX * coverageY,
        });
    }

    return (
        bestMetrics ?? {
            topology: computeOverviewTopology({
                viewportWidth: params.viewportWidth,
                viewportHeight: params.viewportHeight,
                totalPieces: params.totalPieces,
                columns: 1,
                piecesPerBlock: params.piecesPerBlock,
                cellSize: params.cellSize,
                gap: params.gap,
            }),
            contentWidth: params.cellSize,
            contentHeight: params.cellSize,
            coverageX: 1,
            coverageY: 1,
            fitsHeight: true,
            coverageScore: 0,
        }
    );
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

const hasRenderableViewport = (params: OverviewTopologyParams) =>
    params.viewportWidth != null &&
    params.viewportWidth > 0 &&
    params.viewportHeight != null &&
    params.viewportHeight > 0;

const buildFallbackOverviewTopology = (
    params: OverviewTopologyParams,
    totalPieces: number,
) =>
    computeOverviewTopology({
        viewportWidth: params.viewportWidth,
        viewportHeight: params.viewportHeight,
        totalPieces,
        columns: Math.min(params.fallbackColumns, totalPieces),
        piecesPerBlock: 1,
        cellSize: params.cellSize,
        gap: params.gap,
    });

const pickBestFittingMetrics = (params: {
    current: TopologyMetrics | null;
    candidate: TopologyMetrics;
    viewportHeight: number;
}) => {
    if (!params.current) {
        return params.candidate;
    }
    if (
        params.candidate.coverageScore >
        params.current.coverageScore + TOPOLOGY_SCORE_EPSILON
    ) {
        return params.candidate;
    }
    if (
        Math.abs(params.candidate.coverageScore - params.current.coverageScore) >
        TOPOLOGY_SCORE_EPSILON
    ) {
        return params.current;
    }

    const candidateHeightCoverage =
        params.viewportHeight > 0
            ? params.candidate.contentHeight / params.viewportHeight
            : 1;
    const currentHeightCoverage =
        params.viewportHeight > 0
            ? params.current.contentHeight / params.viewportHeight
            : 1;
    if (
        candidateHeightCoverage >
        currentHeightCoverage + TOPOLOGY_SCORE_EPSILON
    ) {
        return params.candidate;
    }
    if (
        Math.abs(candidateHeightCoverage - currentHeightCoverage) <=
            TOPOLOGY_SCORE_EPSILON &&
        params.candidate.topology.piecesPerBlock <
            params.current.topology.piecesPerBlock
    ) {
        return params.candidate;
    }
    return params.current;
};

const evaluateOverviewMetrics = (
    params: OverviewTopologyParams,
    candidates: number[],
) => {
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
        if (
            !fallback ||
            metrics.coverageScore >
                fallback.coverageScore + TOPOLOGY_SCORE_EPSILON
        ) {
            fallback = metrics;
        }
        if (!metrics.fitsHeight) {
            continue;
        }
        best = pickBestFittingMetrics({
            current: best,
            candidate: metrics,
            viewportHeight: params.viewportHeight ?? 0,
        });
    }

    return { best, fallback };
};

const resolveOverviewTopology = (params: OverviewTopologyParams): DisplayTopology => {
    const normalizedTotalPieces = Math.max(1, params.totalPieces);
    const fallbackTopology = buildFallbackOverviewTopology(
        params,
        normalizedTotalPieces,
    );
    if (params.totalPieces <= 0 || !hasRenderableViewport(params)) {
        return fallbackTopology;
    }

    const candidates = resolvePiecesPerBlockCandidates({
        viewportWidth: params.viewportWidth ?? 0,
        viewportHeight: params.viewportHeight ?? 0,
        totalPieces: params.totalPieces,
        cellSize: params.cellSize,
        gap: params.gap,
    });
    const { best, fallback } = evaluateOverviewMetrics(params, candidates);

    return best?.topology ?? fallback?.topology ?? fallbackTopology;
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
        typeof pieceCount === "number" &&
        Number.isFinite(pieceCount) &&
        pieceCount > 0
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

    const availabilityLength = pieceAvailability?.length ?? 0;
    const pieceStatesLength = pieceStates?.length ?? 0;
    const hasBinaryPieceStates =
        pieceStatesLength >= totalPieces &&
        (pieceStates?.every((value) => value === 0 || value === 1) ?? false);
    const resolvedStates = useMemo(
        () => {
            if (pieceStates && pieceStates.length >= totalPieces) {
                return pieceStates
                    .slice(0, totalPieces)
                    .map((value) => resolveStatus(value, hasBinaryPieceStates));
            }
            const doneUntil = Math.round(totalPieces * normalizedPercent);
            return Array.from({ length: totalPieces }, (_, index) =>
                index < doneUntil ? "done" : "missing",
            );
        },
        [hasBinaryPieceStates, normalizedPercent, pieceStates, totalPieces],
    );

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

    const displayBlocks = useMemo<Array<DisplayBlock | null>>(
        () =>
            buildDisplayBlocks({
                displayCellCount,
                columns,
                displayTopology,
                totalPieces,
                resolvedStates,
                availabilityMissing,
                availability,
                rareThreshold,
                pieceSize,
                t,
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
    const { rareCount, deadCount, verifiedCount } = useMemo(
        () =>
            summarizeToneCounts({
                totalPieces,
                resolvedStates,
                availabilityMissing,
                availability,
                rareThreshold,
            }),
        [
            availability,
            availabilityMissing,
            rareThreshold,
            resolvedStates,
            totalPieces,
        ],
    );

    const missingCount = totalPieces - verifiedCount;
    const verifiedPercent =
        totalPieces > 0 ? Math.round((verifiedCount / totalPieces) * 100) : 0;
    const pieceSizeLabel = pieceSize
        ? formatBytes(pieceSize)
        : t("torrent_modal.stats.unknown_size");

    const [hoveredBlock, setHoveredBlock] = useState<DisplayBlock | null>(null);
    const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>();

    const readCell = useCallback(
        (clientX: number, clientY: number) =>
            readDisplayCell({
                clientX,
                clientY,
                drawState: drawStateRef.current,
                root: rootRef.current,
                colAxis,
                rowAxis,
                cellSize,
                displayBlocks,
                columns,
            }),
        [cellSize, colAxis, columns, displayBlocks, rowAxis],
    );
    const syncHoveredBlockFromPointer = useEffectEvent(() => {
        setHoveredBlock(
            pointerRef.current.isInside
                ? readCell(pointerRef.current.clientX, pointerRef.current.clientY)
                : null,
        );
    });

    const scheduleDraw = useCallback(
        () =>
            scheduleDrawFrames({
                frameRef,
                overlayFrameRef,
                canvasRef,
                overlayRef,
                rootRef,
                viewportBounds,
                setViewportBounds,
                drawStateRef,
                displayTopology,
                colAxis,
                rowAxis,
                cellSize,
                displayBlocks,
                palette,
                hoveredBlock,
            }),
        [
            canvasRef,
            cellSize,
            colAxis,
            displayBlocks,
            displayTopology,
            drawStateRef,
            frameRef,
            hoveredBlock,
            overlayRef,
            overlayFrameRef,
            palette,
            rowAxis,
            rootRef,
            setViewportBounds,
            viewportBounds,
        ],
    );

    useEffect(() => {
        scheduleDrawRef.current = scheduleDraw;
    }, [scheduleDraw]);

    useEffect(() => {
        scheduleDraw();
    }, [scheduleDraw]);

    useEffect(() => {
        pointerRef.current.isInside = false;
        syncHoveredBlockFromPointer();
    }, [totalPieces]);

    useEffect(() => {
        syncHoveredBlockFromPointer();
    }, [readCell]);

    useEffect(() => {
        setTooltipStyle(
            resolveTooltipStyleForBlock({
                hoveredBlock,
                tooltipElement: tooltipRef.current,
                drawState: drawStateRef.current,
                colAxis,
                rowAxis,
                cellSize,
            }),
        );
    }, [cellSize, colAxis, hoveredBlock, rowAxis]);

    useEffect(() => {
        const syncViewportBounds = () => {
            const nextBounds = readViewportBounds(rootRef.current);
            if (!nextBounds) {
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
        const observedRoot = rootRef.current;
        if (observedRoot) {
            observer.observe(observedRoot);
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

    const tooltipDetail = useMemo<TooltipDetail | null>(
        () =>
            buildTooltipDetail({
                block: hoveredBlock,
                t,
                availabilityMissing,
                availability,
                rareThreshold,
                resolvedStates,
                swatchSize: cellSize,
                swatchGap: cellGap,
            }),
        [
            availability,
            availabilityMissing,
            cellGap,
            cellSize,
            hoveredBlock,
            rareThreshold,
            resolvedStates,
            t,
        ],
    );

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
