import {
    Button,
    Chip,
    Progress,
    Switch,
    Tab,
    Tabs,
    cn,
    Tooltip,
} from "@heroui/react";
import {
    Activity,
    ArrowDownCircle,
    ArrowUpCircle,
    Copy,
    Grid,
    HardDrive,
    Folder,
    Hash,
    Info,
    Network,
    PauseCircle,
    PlayCircle,
    Server,
    Trash2,
    X,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type MouseEvent,
    type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { GlassPanel } from "../../../shared/ui/layout/GlassPanel";
import {
    formatBytes,
    formatSpeed,
    formatTime,
} from "../../../shared/utils/format";
import {
    FileExplorerTree,
    type FileExplorerEntry,
} from "../../../shared/ui/workspace/FileExplorerTree";
import constants from "../../../config/constants.json";
import type { Torrent, TorrentDetail } from "../types/torrent";
import type { TorrentTableAction } from "./TorrentTable";
import type {
    TorrentPeerEntity,
    TorrentStatus,
} from "../../../services/rpc/entities";

const GLASS_TOOLTIP_CLASSNAMES = {
    content:
        "bg-content1/80 border border-content1/20 backdrop-blur-3xl shadow-[0_25px_75px_rgba(0,0,0,0.35)] rounded-2xl px-3 py-1.5 text-[11px] leading-tight text-foreground/90",
    arrow: "bg-content1/80",
} as const;

// --- TYPES ---
type DetailTab =
    | "general"
    | "content"
    | "pieces"
    | "trackers"
    | "peers"
    | "speed";

interface TorrentDetailViewProps {
    torrent: TorrentDetail | null;
    onClose: () => void;
    onFilesToggle?: (
        indexes: number[],
        wanted: boolean
    ) => Promise<void> | void;
    onSequentialToggle?: (enabled: boolean) => Promise<void> | void;
    onSuperSeedingToggle?: (enabled: boolean) => Promise<void> | void;
    onForceTrackerReannounce?: () => Promise<void> | void;
    sequentialSupported?: boolean;
    superSeedingSupported?: boolean;
    onAction?: (action: TorrentTableAction, torrent: Torrent) => void;
}

type PieceStatus = "done" | "downloading" | "missing";

interface PiecesMapProps {
    percent: number;
    pieceCount?: number;
    pieceStates?: number[];
    pieceSize?: number;
}

const PIECE_MAP_DEFAULTS = {
    columns: 42,
    base_rows: 6,
    max_rows: 12,
    cell_size: 10,
    cell_gap: 2,
} as const;
const HEATMAP_DEFAULTS = {
    sample_limit_multiplier: 6,
    zoom_levels: [1, 1.5, 2, 2.5],
    cell_size: 6,
    cell_gap: 3,
} as const;
const PEER_MAP_DEFAULTS = {
    drift_amplitude: 5,
    drift_duration: { min: 6, max: 10 },
} as const;

const pieceMapConfig = constants.layout?.piece_map ?? PIECE_MAP_DEFAULTS;
const heatmapConfig = constants.layout?.heatmap ?? HEATMAP_DEFAULTS;
const peerMapConfig = constants.layout?.peer_map ?? PEER_MAP_DEFAULTS;

const PIECE_COLUMNS = pieceMapConfig.columns;
const PIECE_BASE_ROWS = pieceMapConfig.base_rows;
const PIECE_MAX_ROWS = pieceMapConfig.max_rows;
const PIECE_CANVAS_CELL_SIZE = pieceMapConfig.cell_size;
const PIECE_CANVAS_CELL_GAP = pieceMapConfig.cell_gap;
const PIECE_BASE_CELL_COUNT = PIECE_COLUMNS * PIECE_BASE_ROWS;
const PIECE_MAX_CELL_COUNT = PIECE_COLUMNS * PIECE_MAX_ROWS;
const HEATMAP_SAMPLE_LIMIT =
    PIECE_COLUMNS * heatmapConfig.sample_limit_multiplier;
const HEATMAP_ZOOM_LEVELS = heatmapConfig.zoom_levels;
const HISTORY_POINTS = constants.performance.history_data_points;
const HEATMAP_CANVAS_CELL_SIZE = heatmapConfig.cell_size;
const HEATMAP_CANVAS_CELL_GAP = heatmapConfig.cell_gap;

type CanvasPalette = {
    primary: string;
    warning: string;
    missing: string;
    highlight: string;
    glowPrimary: string;
    glowWarning: string;
    placeholder: string;
};

const buildCanvasPalette = (): CanvasPalette => {
    const computedStyles =
        typeof window !== "undefined"
            ? window.getComputedStyle(document.documentElement)
            : null;
    const readVar = (name: string, fallback: string) => {
        const value = computedStyles?.getPropertyValue(name)?.trim();
        return value || fallback;
    };
    return {
        primary: readVar("--heroui-primary", "#06b6d4"),
        warning: readVar("--heroui-warning", "#f97316"),
        missing: readVar("--heroui-content1", "rgba(15,23,42,0.3)"),
        highlight: "rgba(255,255,255,0.65)",
        glowPrimary: "rgba(14,165,233,0.45)",
        glowWarning: "rgba(245,158,11,0.55)",
        placeholder: "rgba(255,255,255,0.08)",
    };
};

const useCanvasPalette = () => useMemo(buildCanvasPalette, []);

const getAvailabilityColor = (value: number, maxPeers: number) => {
    const ratio = Math.min(Math.max(value / maxPeers, 0), 1);
    const hue = ratio * 220;
    const lightness = value === 0 ? 58 : 48;
    return `hsl(${hue}, 75%, ${lightness}%)`;
};

const PIECE_STATUS_TRANSLATION_KEYS: Record<PieceStatus, string> = {
    done: "torrent_modal.stats.verified",
    downloading: "torrent_modal.stats.downloading",
    missing: "torrent_modal.stats.missing",
};

type PieceCell = { pieceIndex: number; status: PieceStatus } | null;
type PieceHover = {
    gridIndex: number;
    pieceIndex: number;
    status: PieceStatus;
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

const PiecesMap = ({
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
        [totalPieces, sampleCount]
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
        [pieceStates, normalizedPercent, totalPieces]
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
    }, [sampleIndexes, cellsToDraw, determineStatus]);

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
    const renderKey = useMemo(() => {
        const statusList = cells
            .map((cell) =>
                cell ? `${cell.pieceIndex}:${cell.status}` : "empty"
            )
            .join(",");
        return `${pieceCount ?? "auto"}|${
            pieceSize ?? "unknown"
        }|${normalizedPercent.toFixed(4)}|${statusList}`;
    }, [cells, pieceCount, pieceSize, normalizedPercent]);
    const renderCacheRef = useRef<string>("");

    const drawPieces = useCallback(() => {
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
            ctx.fillRect(x, y, PIECE_CANVAS_CELL_SIZE, PIECE_CANVAS_CELL_SIZE);
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
    }, [canvasHeight, canvasWidth, cellPitch, cells, hoveredPiece, palette]);

    useEffect(() => {
        if (renderCacheRef.current === renderKey) return;
        drawPieces();
        renderCacheRef.current = renderKey;
    }, [drawPieces, renderKey]);

    useEffect(() => {
        setHoveredPiece(null);
    }, [cells]);

    const handleCanvasMove = useCallback(
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
                setHoveredPiece(null);
                return;
            }
            const cellIndex = row * PIECE_COLUMNS + column;
            const cell = cells[cellIndex];
            if (!cell) {
                setHoveredPiece(null);
                return;
            }
            setHoveredPiece({
                gridIndex: cellIndex,
                pieceIndex: cell.pieceIndex,
                status: cell.status,
            });
        },
        [canvasHeight, canvasWidth, cells, cellPitch, gridRows]
    );

    const tooltipContent = hoveredPiece
        ? t("torrent_modal.piece_map.tooltip", {
              piece: hoveredPiece.pieceIndex + 1,
              status: t(PIECE_STATUS_TRANSLATION_KEYS[hoveredPiece.status]),
          })
        : undefined;

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
                <Tooltip
                    content={tooltipContent}
                    delay={0}
                    closeDelay={0}
                    classNames={GLASS_TOOLTIP_CLASSNAMES}
                    isDisabled={!hoveredPiece}
                >
                    <canvas
                        ref={canvasRef}
                        width={canvasWidth}
                        height={canvasHeight}
                        className="w-full h-auto block rounded-2xl cursor-crosshair"
                        onMouseMove={handleCanvasMove}
                        onMouseLeave={() => setHoveredPiece(null)}
                    />
                </Tooltip>
            </div>
        </div>
    );
};

interface AvailabilityHeatmapProps {
    pieceAvailability?: number[];
    label: string;
    legendRare: string;
    legendCommon: string;
    emptyLabel: string;
    formatTooltip: (piece: number, peers: number) => string;
}

type HeatmapHover = { gridIndex: number; pieceIndex: number; peers: number };

const AvailabilityHeatmap = ({
    pieceAvailability,
    label,
    legendRare,
    legendCommon,
    emptyLabel,
    formatTooltip,
}: AvailabilityHeatmapProps) => {
    const palette = useCanvasPalette();
    const [zoomIndex, setZoomIndex] = useState(0);
    const zoomLevel = HEATMAP_ZOOM_LEVELS[zoomIndex] ?? 1;

    if (!pieceAvailability?.length) {
        return (
            <div className="rounded-2xl border border-content1/20 bg-content1/10 p-4 text-[11px] text-foreground/50 text-center">
                {emptyLabel}
            </div>
        );
    }

    const sampleLimit = Math.round(HEATMAP_SAMPLE_LIMIT * zoomLevel);
    const sampleCount = Math.min(pieceAvailability.length, sampleLimit);
    const sampledCells = useMemo(() => {
        const step =
            sampleCount > 1
                ? (pieceAvailability.length - 1) / (sampleCount - 1)
                : 1;
        return Array.from({ length: sampleCount }, (_, index) => {
            const pieceIndex = Math.min(
                pieceAvailability.length - 1,
                Math.round(index * step)
            );
            return {
                pieceIndex,
                value: pieceAvailability[pieceIndex] ?? 0,
            };
        });
    }, [pieceAvailability, sampleCount]);

    const maxPeers =
        pieceAvailability.reduce(
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
    const cellPitch = HEATMAP_CANVAS_CELL_SIZE + HEATMAP_CANVAS_CELL_GAP;

    const getHeatColor = useCallback(
        (value: number) => getAvailabilityColor(value, maxPeers),
        [maxPeers]
    );

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
        const pitch = cellPitch;

        heatCells.forEach((cell, index) => {
            const column = index % PIECE_COLUMNS;
            const row = Math.floor(index / PIECE_COLUMNS);
            const x = column * pitch;
            const y = row * pitch;
            ctx.save();
            if (cell) {
                const color = getHeatColor(cell.value);
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
    }, [
        canvasHeight,
        canvasWidth,
        heatCells,
        hoveredCell,
        getHeatColor,
        maxPeers,
        palette.highlight,
        palette.placeholder,
        cellPitch,
    ]);

    useEffect(() => {
        drawHeatmap();
    }, [drawHeatmap]);

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
        [canvasHeight, canvasWidth, cellPitch, gridRows, heatCells]
    );

    const tooltipContent = hoveredCell
        ? formatTooltip(hoveredCell.pieceIndex + 1, hoveredCell.peers)
        : undefined;

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
                        onPress={() =>
                            setZoomIndex((prev) => Math.max(0, prev - 1))
                        }
                        isDisabled={zoomIndex === 0}
                    >
                        <ZoomOut size={12} />
                    </Button>
                    <span className="text-[10px] font-mono text-foreground/60">
                        x{zoomLevel.toFixed(1)}
                    </span>
                    <Button
                        size="sm"
                        variant="flat"
                        color="default"
                        className="h-7 w-7 rounded-full"
                        onPress={() =>
                            setZoomIndex((prev) =>
                                Math.min(
                                    HEATMAP_ZOOM_LEVELS.length - 1,
                                    prev + 1
                                )
                            )
                        }
                        isDisabled={
                            zoomIndex === HEATMAP_ZOOM_LEVELS.length - 1
                        }
                    >
                        <ZoomIn size={12} />
                    </Button>
                </div>
            </div>
            <div className="rounded-2xl border border-content1/20 bg-content1/10 p-2">
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

interface PeerMapProps {
    peers: TorrentPeerEntity[];
}

const PEER_DRIFT_AMPLITUDE = peerMapConfig.drift_amplitude;
const PEER_DRIFT_DURATION_MIN = peerMapConfig.drift_duration.min;
const PEER_DRIFT_DURATION_MAX = peerMapConfig.drift_duration.max;

const PeerMap = ({ peers }: PeerMapProps) => {
    const { t } = useTranslation();
    const [scale, setScale] = useState(1);
    const gradientId = useId();
    const radarSweepId = `peer-map-radar-${gradientId}`;

    const maxRate = useMemo(
        () =>
            Math.max(
                ...peers.map((peer) => peer.rateToClient + peer.rateToPeer),
                1
            ),
        [peers]
    );
    const nodes = useMemo(() => {
        if (!peers.length) return [];
        const radius = 70;
        const center = 90;
        return peers.map((peer, index) => {
            const angle = (index / peers.length) * Math.PI * 2;
            const speed = peer.rateToClient + peer.rateToPeer;
            const distance = 30 + (speed / maxRate) * 40;
            const x = center + Math.cos(angle) * distance;
            const y = center + Math.sin(angle) * distance;
            const size = 6 + (peer.progress ?? 0) * 12;
            const isChoking = peer.peerIsChoking;
            const fill = isChoking ? "hsl(0,80%,60%)" : "hsl(150,80%,60%)";
            const driftX = (Math.random() - 0.5) * PEER_DRIFT_AMPLITUDE;
            const driftY = (Math.random() - 0.5) * PEER_DRIFT_AMPLITUDE;
            const duration =
                PEER_DRIFT_DURATION_MIN +
                Math.random() *
                    (PEER_DRIFT_DURATION_MAX - PEER_DRIFT_DURATION_MIN);
            const delay = Math.random() * 1.5;
            const delayY = delay + Math.random() * 0.7;
            return {
                peer,
                x,
                y,
                size,
                fill,
                driftX,
                driftY,
                duration,
                delay,
                delayY,
            };
        });
    }, [maxRate, peers]);

    const handleZoom = (direction: "in" | "out") => {
        setScale((prev) => {
            const next =
                direction === "in"
                    ? Math.min(1.5, prev + 0.2)
                    : Math.max(0.8, prev - 0.2);
            return next;
        });
    };

    return (
        <motion.div
            layout
            className="rounded-2xl border border-content1/20 bg-content1/15 p-4 space-y-3"
        >
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-[11px] uppercase tracking-[0.3em] text-foreground/50">
                        {t("torrent_modal.peer_map.title")}
                    </span>
                    <span className="text-[10px] font-mono text-foreground/50">
                        {t("torrent_modal.peer_map.total", {
                            count: peers.length,
                        })}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        size="sm"
                        variant="flat"
                        color="default"
                        className="h-7 w-7"
                        onPress={() => handleZoom("out")}
                    >
                        <ZoomOut size={12} />
                    </Button>
                    <Button
                        size="sm"
                        variant="flat"
                        color="default"
                        className="h-7 w-7"
                        onPress={() => handleZoom("in")}
                    >
                        <ZoomIn size={12} />
                    </Button>
                </div>
            </div>
            <div className="flex justify-center">
                <motion.svg
                    width={180}
                    height={180}
                    viewBox="0 0 180 180"
                    className="rounded-2xl bg-content1/10 border border-content1/20"
                    style={{
                        transform: `scale(${scale})`,
                        transformOrigin: "center",
                    }}
                >
                    <defs>
                        <linearGradient
                            id={radarSweepId}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="0"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--heroui-primary)"
                                stopOpacity="0.35"
                            />
                            <stop
                                offset="20%"
                                stopColor="var(--heroui-primary)"
                                stopOpacity="0.25"
                            />
                            <stop
                                offset="70%"
                                stopColor="var(--heroui-primary)"
                                stopOpacity="0.05"
                            />
                            <stop
                                offset="100%"
                                stopColor="transparent"
                                stopOpacity="0"
                            />
                        </linearGradient>
                    </defs>
                    <motion.circle
                        cx={90}
                        cy={90}
                        r={80}
                        stroke="var(--heroui-content1)"
                        strokeWidth={1}
                        fill="transparent"
                        className="opacity-25"
                    />
                    <motion.g
                        style={{ transformOrigin: "90px 90px" }}
                        animate={{ rotate: 360 }}
                        transition={{
                            duration: 14,
                            repeat: Infinity,
                            ease: "linear",
                        }}
                    >
                        <circle
                            cx={90}
                            cy={90}
                            r={70}
                            fill="none"
                            stroke={`url(#${radarSweepId})`}
                            strokeWidth={14}
                            strokeLinecap="round"
                            strokeDasharray="50 360"
                            className="opacity-60"
                        />
                    </motion.g>
                    {nodes.map(
                        ({
                            peer,
                            x,
                            y,
                            size,
                            fill,
                            driftX,
                            driftY,
                            duration,
                            delay,
                            delayY,
                        }) => (
                            <Tooltip
                                key={`${peer.address}-${x}-${y}`}
                                content={`${peer.address} · ${formatSpeed(
                                    peer.rateToClient
                                )} DL / ${formatSpeed(peer.rateToPeer)} UL`}
                                delay={0}
                                closeDelay={0}
                                classNames={GLASS_TOOLTIP_CLASSNAMES}
                            >
                                <motion.circle
                                    cx={x}
                                    cy={y}
                                    r={size}
                                    fill={fill}
                                    stroke="var(--heroui-foreground)"
                                    strokeWidth={peer.peerIsChoking ? 0.5 : 1}
                                    animate={{
                                        translateX: [0, driftX, -driftX, 0],
                                        translateY: [0, driftY, -driftY, 0],
                                    }}
                                    transition={{
                                        translateX: {
                                            duration,
                                            repeat: Infinity,
                                            repeatType: "mirror",
                                            ease: "easeInOut",
                                            delay,
                                        },
                                        translateY: {
                                            duration,
                                            repeat: Infinity,
                                            repeatType: "mirror",
                                            ease: "easeInOut",
                                            delay: delayY,
                                        },
                                        default: {
                                            type: "spring",
                                            stiffness: 300,
                                            damping: 20,
                                        },
                                    }}
                                    whileHover={{ scale: 1.2 }}
                                />
                            </Tooltip>
                        )
                    )}
                </motion.svg>
            </div>
        </motion.div>
    );
};

const useTorrentDetailSpeedHistory = (torrent: TorrentDetail | null) => {
    const cacheRef = useRef(
        new Map<string, { down: number[]; up: number[] }>()
    );
    const [downHistory, setDownHistory] = useState<number[]>(() =>
        new Array(HISTORY_POINTS).fill(0)
    );
    const [upHistory, setUpHistory] = useState<number[]>(() =>
        new Array(HISTORY_POINTS).fill(0)
    );

    useEffect(() => {
        if (!torrent) {
            setDownHistory(new Array(HISTORY_POINTS).fill(0));
            setUpHistory(new Array(HISTORY_POINTS).fill(0));
            return;
        }
        const cached = cacheRef.current.get(torrent.id);
        if (cached) {
            setDownHistory(cached.down);
            setUpHistory(cached.up);
        } else {
            const empty = new Array(HISTORY_POINTS).fill(0);
            setDownHistory(empty);
            setUpHistory(empty);
        }
    }, [torrent]);

    useEffect(() => {
        if (!torrent) return;
        setDownHistory((prev) => [...prev.slice(1), torrent.speed.down]);
        setUpHistory((prev) => [...prev.slice(1), torrent.speed.up]);
    }, [torrent?.id, torrent?.speed.down, torrent?.speed.up]);

    useEffect(() => {
        if (!torrent) return;
        cacheRef.current.set(torrent.id, {
            down: [...downHistory],
            up: [...upHistory],
        });
    }, [downHistory, upHistory, torrent]);

    return { downHistory, upHistory };
};

// --- SUB-COMPONENT: SPEED CHART (Custom SVG, Zero Bloat) ---
const CHART_WIDTH = 180;
const CHART_HEIGHT = 72;

const SpeedChart = ({
    downHistory,
    upHistory,
}: {
    downHistory: number[];
    upHistory: number[];
}) => {
    const maxValue = Math.max(...downHistory, ...upHistory, 1);
    const latestDown = downHistory.at(-1) ?? 0;
    const latestUp = upHistory.at(-1) ?? 0;
    const buildSplinePath = (values: number[]) => {
        if (!values.length) return "";
        const points = values.map((value, index) => {
            const x = (index / (values.length - 1 || 1)) * CHART_WIDTH;
            const normalized = Math.min(Math.max(value / maxValue, 0), 1);
            const y = CHART_HEIGHT - normalized * CHART_HEIGHT;
            return { x, y };
        });
        if (points.length === 1) {
            const point = points[0];
            return `M${point.x.toFixed(2)},${point.y.toFixed(2)}`;
        }
        const tension = 0.4;
        let path = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i - 1] ?? points[i];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[i + 2] ?? points[i + 1];
            const cp1 = {
                x: p1.x + (p2.x - p0.x) * tension,
                y: p1.y + (p2.y - p0.y) * tension,
            };
            const cp2 = {
                x: p2.x - (p3.x - p1.x) * tension,
                y: p2.y - (p3.y - p1.y) * tension,
            };
            path += ` C${cp1.x.toFixed(2)},${cp1.y.toFixed(2)} ${cp2.x.toFixed(
                2
            )},${cp2.y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
        }
        return path;
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-[11px] font-mono text-foreground/60">
                <span className="text-success">
                    ↓ {formatSpeed(latestDown)}
                </span>
                <span className="text-primary">↑ {formatSpeed(latestUp)}</span>
            </div>
            <div className="rounded-2xl border border-content1/20 bg-content1/20 p-3">
                <svg
                    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                    preserveAspectRatio="none"
                    className="w-full h-20"
                >
                    <defs>
                        <linearGradient
                            id="down-gradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="#22c55e"
                                stopOpacity="0.6"
                            />
                            <stop
                                offset="100%"
                                stopColor="#22c55e"
                                stopOpacity="0"
                            />
                        </linearGradient>
                        <linearGradient
                            id="up-gradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="#6366f1"
                                stopOpacity="0.6"
                            />
                            <stop
                                offset="100%"
                                stopColor="#6366f1"
                                stopOpacity="0"
                            />
                        </linearGradient>
                    </defs>
                    <path
                        d={buildSplinePath(downHistory)}
                        fill="none"
                        stroke="url(#down-gradient)"
                        strokeWidth="3"
                        strokeLinecap="round"
                    />
                    <path
                        d={buildSplinePath(upHistory)}
                        fill="none"
                        stroke="url(#up-gradient)"
                        strokeWidth="3"
                        strokeLinecap="round"
                    />
                </svg>
            </div>
        </div>
    );
};

interface GeneralInfoCardProps {
    icon: LucideIcon;
    label: string;
    value: ReactNode;
    helper?: ReactNode;
    accent?: string;
}

const GeneralInfoCard = ({
    icon: Icon,
    label,
    value,
    helper,
    accent,
}: GeneralInfoCardProps) => (
    <GlassPanel className="p-4">
        <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-content1/20 bg-content1/30">
                <Icon size={18} className="text-foreground/70" />
            </div>
            <div className="flex-1 space-y-1">
                <div className="text-[10px] uppercase tracking-[0.3em] text-foreground/40">
                    {label}
                </div>
                <div
                    className={`text-lg font-semibold ${
                        accent ?? "text-foreground"
                    }`}
                >
                    {value}
                </div>
                {helper && (
                    <div className="text-[11px] text-foreground/50">
                        {helper}
                    </div>
                )}
            </div>
        </div>
    </GlassPanel>
);

type StatusChipColor = "success" | "primary" | "warning" | "danger";

// --- MAIN COMPONENT ---

const STATUS_CONFIG: Record<
    TorrentStatus,
    { color: StatusChipColor; labelKey: string }
> = {
    downloading: {
        color: "success",
        labelKey: "torrent_modal.statuses.status_downloading",
    },
    seeding: {
        color: "primary",
        labelKey: "torrent_modal.statuses.status_seeding",
    },
    paused: {
        color: "warning",
        labelKey: "torrent_modal.statuses.status_paused",
    },
    checking: {
        color: "warning",
        labelKey: "torrent_modal.statuses.status_checking",
    },
    queued: {
        color: "warning",
        labelKey: "torrent_modal.statuses.status_queued",
    },
    error: { color: "danger", labelKey: "torrent_modal.statuses.status_error" },
} as const;

export function TorrentDetailView({
    torrent,
    onClose,
    onFilesToggle,
    onSequentialToggle,
    onSuperSeedingToggle,
    onForceTrackerReannounce,
    sequentialSupported: sequentialSupportedProp,
    superSeedingSupported: superSeedingSupportedProp,
    onAction,
}: TorrentDetailViewProps) {
    const { t } = useTranslation();
    const { downHistory, upHistory } = useTorrentDetailSpeedHistory(torrent);
    const [activeTab, setActiveTab] = useState<DetailTab>("general");
    const sequentialSupported =
        sequentialSupportedProp ?? Boolean(onSequentialToggle);
    const superSeedingSupported =
        superSeedingSupportedProp ?? Boolean(onSuperSeedingToggle);

    useEffect(() => {
        if (torrent) setActiveTab("general");
    }, [torrent?.id]);

    const handleAction = useCallback(
        (action: TorrentTableAction) => {
            if (!torrent || !onAction) return;
            onAction(action, torrent);
        },
        [onAction, torrent]
    );

    const handleCopyHash = () => {
        if (!torrent) return;
        navigator.clipboard.writeText(torrent.hash);
    };

    if (!torrent) return null;

    const progressPercent = torrent.progress * 100;
    const activePeers =
        torrent.peerSummary.connected + (torrent.peerSummary.seeds ?? 0);
    const timeRemainingLabel =
        torrent.eta > 0
            ? formatTime(torrent.eta)
            : t("torrent_modal.eta_unknown");
    const canPause = ["downloading", "seeding", "checking"].includes(
        torrent.state
    );
    const canResume = ["paused", "queued", "error"].includes(torrent.state);

    const trackers = torrent.trackers ?? [];
    const peerEntries = torrent.peers ?? [];
    const files = torrent.files ?? [];
    const downloadDir = torrent.savePath ?? t("torrent_modal.labels.unknown");
    const statusMeta = STATUS_CONFIG[torrent.state];
    const fileEntries = useMemo<FileExplorerEntry[]>(() => {
        return files.map((file, index) => ({
            name: file.name,
            index,
            length: file.length,
            progress: file.progress,
            wanted: file.wanted,
            priority: file.priority,
        }));
    }, [files]);

    const reannounceSupported = Boolean(onForceTrackerReannounce);

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="sticky top-0 z-30 border-b border-content1/20 bg-background/90 backdrop-blur-2xl">
                <div className="px-6 pt-6 pb-4 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-bold text-foreground truncate">
                                    {torrent.name}
                                </h3>
                                <Chip
                                    size="sm"
                                    variant="flat"
                                    color={statusMeta.color}
                                    classNames={{
                                        base: "h-5 px-1",
                                        content:
                                            "text-[9px] font-bold uppercase tracking-wider",
                                    }}
                                >
                                    {t(statusMeta.labelKey)}
                                </Chip>
                            </div>
                            <span className="text-[10px] uppercase tracking-widest text-foreground/40 font-bold">
                                {t("torrent_modal.general.hash")}:{" "}
                                {torrent.hash.substring(0, 8)}...
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {canPause && (
                                <Button
                                    size="sm"
                                    variant="shadow"
                                    color="warning"
                                    className="flex items-center gap-1"
                                    onPress={() => handleAction("pause")}
                                >
                                    <PauseCircle size={14} />
                                    {t("table.actions.pause")}
                                </Button>
                            )}
                            {canResume && (
                                <Button
                                    size="sm"
                                    variant="shadow"
                                    color="success"
                                    className="flex items-center gap-1"
                                    onPress={() => handleAction("resume")}
                                >
                                    <PlayCircle size={14} />
                                    {t("table.actions.resume")}
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="flat"
                                color="danger"
                                className="flex items-center gap-1"
                                onPress={() => handleAction("remove")}
                            >
                                <Trash2 size={14} />
                                {t("table.actions.remove")}
                            </Button>
                            <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                onPress={onClose}
                                className="text-foreground/40 hover:text-foreground"
                                aria-label={t("torrent_modal.actions.close")}
                            >
                                <X size={20} />
                            </Button>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-content1/20 bg-content1/20 p-4 space-y-3">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <div className="text-[10px] uppercase tracking-widest text-foreground/40 font-bold mb-1">
                                    {t("torrent_modal.stats.total_progress")}
                                </div>
                                <div className="text-4xl font-mono font-medium tracking-tight">
                                    {progressPercent.toFixed(1)}%
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] uppercase tracking-widest text-foreground/40 font-bold">
                                    {t("torrent_modal.stats.time_remaining")}
                                </div>
                                <div className="font-mono text-xl">
                                    {timeRemainingLabel}
                                </div>
                            </div>
                        </div>

                        <Progress
                            value={progressPercent}
                            size="lg"
                            classNames={{
                                track: "h-3 bg-content1/20",
                                indicator:
                                    "bg-gradient-to-r from-success/50 to-success",
                            }}
                        />

                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[9px] uppercase tracking-wider font-bold text-foreground/40">
                                <span>
                                    {t("torrent_modal.stats.availability")}
                                </span>
                                <span className="text-primary">
                                    {activePeers}{" "}
                                    {t("torrent_modal.stats.active")}
                                </span>
                            </div>
                            <div className="h-1.5 w-full bg-content1/20 rounded-full overflow-hidden flex">
                                <div className="h-full bg-primary w-full opacity-80" />{" "}
                                {/* Full bar implies 100% available */}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- BODY --- */}
            <div className="flex-1 min-h-0 bg-content1/20 border-t border-content1/10">
                <div className="flex-1 min-h-0 h-full overflow-y-auto px-6 pb-6 pt-6">
                    <Tabs
                        variant="underlined"
                        selectedKey={activeTab}
                        onSelectionChange={(k) => setActiveTab(k as DetailTab)}
                        classNames={{
                            tabList: "gap-6 p-0",
                            cursor: "w-full bg-primary h-[2px]",
                            tab: "px-0 h-9 text-xs font-medium text-foreground/50 data-[selected=true]:text-foreground data-[selected=true]:font-bold",
                        }}
                    >
                        <Tab
                            key="general"
                            title={
                                <div className="flex items-center gap-2">
                                    <Info size={14} />{" "}
                                    {t("torrent_modal.tabs.general")}
                                </div>
                            }
                        />
                        <Tab
                            key="content"
                            title={
                                <div className="flex items-center gap-2">
                                    <HardDrive size={14} />{" "}
                                    {t("torrent_modal.tabs.content")}
                                </div>
                            }
                        />
                        <Tab
                            key="pieces"
                            title={
                                <div className="flex items-center gap-2">
                                    <Grid size={14} />{" "}
                                    {t("torrent_modal.tabs.pieces")}
                                </div>
                            }
                        />
                        <Tab
                            key="trackers"
                            title={
                                <div className="flex items-center gap-2">
                                    <Server size={14} />{" "}
                                    {t("torrent_modal.tabs.trackers")}
                                </div>
                            }
                        />
                        <Tab
                            key="peers"
                            title={
                                <div className="flex items-center gap-2">
                                    <Network size={14} />{" "}
                                    {t("torrent_modal.tabs.peers")}
                                </div>
                            }
                        />
                        <Tab
                            key="speed"
                            title={
                                <div className="flex items-center gap-2">
                                    <Activity size={14} />{" "}
                                    {t("torrent_modal.tabs.speed")}
                                </div>
                            }
                        />
                    </Tabs>
                    <div className="pt-6">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.15 }}
                                className="min-h-0 overflow-y-auto pr-2 scrollbar-hide pb-8"
                            >
                                {/* --- TAB: GENERAL --- */}
                                {activeTab === "general" && (
                                    <div className="space-y-6">
                                        <GlassPanel className="p-4 space-y-4 bg-content1/30 border border-content1/20">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[10px] uppercase tracking-[0.3em] text-foreground/40">
                                                        {t(
                                                            "torrent_modal.controls.title"
                                                        )}
                                                    </span>
                                                    <p className="text-[11px] text-foreground/50">
                                                        {t(
                                                            "torrent_modal.controls.description"
                                                        )}
                                                    </p>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="flat"
                                                    color="primary"
                                                    className="h-8"
                                                    onPress={
                                                        onForceTrackerReannounce
                                                    }
                                                    isDisabled={
                                                        !reannounceSupported
                                                    }
                                                >
                                                    {t(
                                                        "torrent_modal.controls.force_reannounce"
                                                    )}
                                                </Button>
                                            </div>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <Switch
                                                    size="sm"
                                                    color="success"
                                                    isDisabled={
                                                        !sequentialSupported
                                                    }
                                                    isSelected={Boolean(
                                                        torrent.sequentialDownload
                                                    )}
                                                    onValueChange={(value) =>
                                                        onSequentialToggle?.(
                                                            Boolean(value)
                                                        )
                                                    }
                                                >
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span className="text-sm font-medium">
                                                            {t(
                                                                "torrent_modal.controls.sequential"
                                                            )}
                                                        </span>
                                                        <span className="text-[11px] text-foreground/50">
                                                            {t(
                                                                "torrent_modal.controls.sequential_helper"
                                                            )}
                                                        </span>
                                                        {!sequentialSupported && (
                                                            <span className="text-[10px] text-warning">
                                                                {t(
                                                                    "torrent_modal.controls.not_supported"
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                </Switch>
                                                <Switch
                                                    size="sm"
                                                    color="primary"
                                                    isDisabled={
                                                        !superSeedingSupported
                                                    }
                                                    isSelected={Boolean(
                                                        torrent.superSeeding
                                                    )}
                                                    onValueChange={(value) =>
                                                        onSuperSeedingToggle?.(
                                                            Boolean(value)
                                                        )
                                                    }
                                                >
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span className="text-sm font-medium">
                                                            {t(
                                                                "torrent_modal.controls.super_seeding"
                                                            )}
                                                        </span>
                                                        <span className="text-[11px] text-foreground/50">
                                                            {t(
                                                                "torrent_modal.controls.super_seeding_helper"
                                                            )}
                                                        </span>
                                                        {!superSeedingSupported && (
                                                            <span className="text-[10px] text-warning">
                                                                {t(
                                                                    "torrent_modal.controls.not_supported"
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                </Switch>
                                            </div>
                                        </GlassPanel>

                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <GeneralInfoCard
                                                icon={ArrowDownCircle}
                                                label={t(
                                                    "torrent_modal.stats.downloaded"
                                                )}
                                                value={
                                                    <span className="font-mono text-sm">
                                                        {formatBytes(
                                                            torrent.downloaded
                                                        )}
                                                    </span>
                                                }
                                                helper={t(
                                                    "torrent_modal.stats.downloaded_helper"
                                                )}
                                                accent="text-success"
                                            />
                                            <GeneralInfoCard
                                                icon={ArrowUpCircle}
                                                label={t(
                                                    "torrent_modal.stats.uploaded"
                                                )}
                                                value={
                                                    <span className="font-mono text-sm text-primary">
                                                        {formatBytes(
                                                            torrent.uploaded
                                                        )}
                                                    </span>
                                                }
                                                helper={t(
                                                    "torrent_modal.stats.ratio",
                                                    {
                                                        ratio: torrent.ratio.toFixed(
                                                            2
                                                        ),
                                                    }
                                                )}
                                                accent="text-primary"
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <GlassPanel className="p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <Folder
                                                        size={16}
                                                        className="text-foreground/50"
                                                    />
                                                    <span className="text-[10px] uppercase tracking-[0.3em] text-foreground/40">
                                                        {t(
                                                            "torrent_modal.labels.save_path"
                                                        )}
                                                    </span>
                                                </div>
                                                <code className="font-mono text-xs text-foreground/70 bg-content1/20 px-2 py-1 rounded break-words">
                                                    {downloadDir}
                                                </code>
                                            </GlassPanel>
                                            <GlassPanel className="p-4 space-y-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <Hash
                                                            size={16}
                                                            className="text-foreground/50"
                                                        />
                                                        <span className="text-[10px] uppercase tracking-[0.3em] text-foreground/40">
                                                            {t(
                                                                "torrent_modal.labels.info_hash"
                                                            )}
                                                        </span>
                                                    </div>
                                                    <Button
                                                        isIconOnly
                                                        size="sm"
                                                        variant="flat"
                                                        onPress={handleCopyHash}
                                                        aria-label={t(
                                                            "table.actions.copy_hash"
                                                        )}
                                                        className="text-foreground/50 hover:text-foreground"
                                                    >
                                                        <Copy size={12} />
                                                    </Button>
                                                </div>
                                                <code className="font-mono text-xs text-foreground/70 bg-content1/20 px-2 py-1 rounded break-words">
                                                    {torrent.hash}
                                                </code>
                                            </GlassPanel>
                                        </div>
                                    </div>
                                )}

                                {/* --- TAB: PIECES (New) --- */}
                                {activeTab === "pieces" && (
                                    <div className="h-full flex flex-col gap-4">
                                        <GlassPanel className="flex-1 overflow-hidden p-4">
                                            <PiecesMap
                                                percent={torrent.progress}
                                                pieceCount={torrent.pieceCount}
                                                pieceSize={torrent.pieceSize}
                                                pieceStates={
                                                    torrent.pieceStates
                                                }
                                            />
                                        </GlassPanel>
                                        <GlassPanel className="flex-1 overflow-hidden p-4">
                                            <AvailabilityHeatmap
                                                pieceAvailability={
                                                    torrent.pieceAvailability
                                                }
                                                label={t(
                                                    "torrent_modal.availability.label"
                                                )}
                                                legendRare={t(
                                                    "torrent_modal.availability.legend_rare"
                                                )}
                                                legendCommon={t(
                                                    "torrent_modal.availability.legend_common"
                                                )}
                                                emptyLabel={t(
                                                    "torrent_modal.availability.empty"
                                                )}
                                                formatTooltip={(piece, peers) =>
                                                    t(
                                                        "torrent_modal.availability.tooltip",
                                                        { piece, peers }
                                                    )
                                                }
                                            />
                                        </GlassPanel>
                                    </div>
                                )}
                                {/* --- TAB: SPEED (New) --- */}
                                {activeTab === "speed" && (
                                    <div className="h-full flex flex-col">
                                        <GlassPanel className="flex-1 p-6">
                                            <SpeedChart
                                                downHistory={downHistory}
                                                upHistory={upHistory}
                                            />
                                        </GlassPanel>
                                    </div>
                                )}

                                {/* --- TAB: CONTENT --- */}
                                {activeTab === "content" && (
                                    <div className="flex flex-col gap-3">
                                        <GlassPanel className="p-4 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-foreground/60">
                                                    {t(
                                                        "torrent_modal.files_title"
                                                    )}
                                                </div>
                                                <span className="text-[11px] text-foreground/50">
                                                    {files.length === 1
                                                        ? t(
                                                              "torrent_modal.file_counts.count_single"
                                                          )
                                                        : t(
                                                              "torrent_modal.file_counts.count_multiple",
                                                              {
                                                                  count: files.length,
                                                              }
                                                          )}
                                                </span>
                                            </div>
                                            <div className="text-[11px] text-foreground/50">
                                                {t(
                                                    "torrent_modal.files_description"
                                                )}
                                            </div>
                                            <div className="max-h-[320px] overflow-y-auto">
                                                <FileExplorerTree
                                                    files={fileEntries}
                                                    emptyMessage={t(
                                                        "torrent_modal.files_empty"
                                                    )}
                                                    onFilesToggle={(
                                                        indexes: number[],
                                                        wanted: boolean
                                                    ) =>
                                                        onFilesToggle?.(
                                                            indexes,
                                                            wanted
                                                        )
                                                    }
                                                />
                                            </div>
                                        </GlassPanel>
                                    </div>
                                )}

                                {/* --- TAB: PEERS --- */}
                                {activeTab === "peers" && (
                                    <div className="flex flex-col gap-4">
                                        <PeerMap peers={peerEntries} />
                                        <div className="flex flex-col gap-2">
                                            {peerEntries.map((peer, i) => (
                                                <GlassPanel
                                                    key={i}
                                                    className="p-3 grid grid-cols-12 items-center gap-4 hover:bg-content1/50 transition-colors"
                                                >
                                                    <div className="col-span-4 flex flex-col">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-mono">
                                                                {peer.address}
                                                            </span>
                                                            {peer.country && (
                                                                <Chip
                                                                    size="sm"
                                                                    variant="flat"
                                                                    classNames={{
                                                                        base: "h-4 px-1",
                                                                        content:
                                                                            "text-[9px] font-bold",
                                                                    }}
                                                                >
                                                                    {
                                                                        peer.country
                                                                    }
                                                                </Chip>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] text-foreground/40 truncate">
                                                            {peer.clientName}
                                                        </span>
                                                    </div>
                                                    <div className="col-span-2 text-[10px] font-mono opacity-50">
                                                        {peer.flagStr}
                                                    </div>
                                                    <div className="col-span-3 flex flex-col gap-1">
                                                        <Progress
                                                            size="sm"
                                                            value={
                                                                peer.progress *
                                                                100
                                                            }
                                                            classNames={{
                                                                track: "h-1 bg-content1/10",
                                                                indicator:
                                                                    "bg-primary",
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="col-span-3 flex flex-col items-end font-mono text-[10px]">
                                                        <span className="text-success">
                                                            {formatSpeed(
                                                                peer.rateToClient
                                                            )}
                                                        </span>
                                                        <span className="text-primary">
                                                            {formatSpeed(
                                                                peer.rateToPeer
                                                            )}
                                                        </span>
                                                    </div>
                                                </GlassPanel>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {/* --- TAB: TRACKERS --- */}
                                {activeTab === "trackers" && (
                                    <div className="flex flex-col gap-2">
                                        {trackers.length === 0 && (
                                            <div className="px-4 py-3 text-xs text-foreground/50">
                                                {t(
                                                    "torrent_modal.trackers.empty"
                                                )}
                                            </div>
                                        )}
                                        {trackers.map((tracker) => (
                                            <GlassPanel
                                                key={`${tracker.announce}-${tracker.tier}`}
                                                className="p-3 flex items-center justify-between hover:bg-content1/50 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className={cn(
                                                            "w-1.5 h-1.5 rounded-full",
                                                            tracker.lastAnnounceSucceeded
                                                                ? "bg-success shadow-[0_0_8px_rgba(34,197,94,0.4)]"
                                                                : "bg-warning"
                                                        )}
                                                    />
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-mono text-foreground/80 truncate max-w-xs">
                                                            {tracker.announce}
                                                        </span>
                                                        <span className="text-[10px] text-foreground/40">
                                                            {t(
                                                                "torrent_modal.trackers.tier"
                                                            )}{" "}
                                                            {tracker.tier} -{" "}
                                                            {tracker.lastAnnounceResult ||
                                                                "-"}{" "}
                                                            -{" "}
                                                            {tracker.lastAnnounceSucceeded
                                                                ? t(
                                                                      "torrent_modal.trackers.status_online"
                                                                  )
                                                                : t(
                                                                      "torrent_modal.trackers.status_partial"
                                                                  )}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/30">
                                                        {t(
                                                            "torrent_modal.trackers.peers_label"
                                                        )}
                                                    </span>
                                                    <div className="font-mono text-xs">
                                                        {t(
                                                            "torrent_modal.trackers.peer_summary",
                                                            {
                                                                seeded: tracker.seederCount,
                                                                leeching:
                                                                    tracker.leecherCount,
                                                            }
                                                        )}
                                                    </div>
                                                </div>
                                            </GlassPanel>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
}
