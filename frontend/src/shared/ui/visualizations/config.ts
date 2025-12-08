import constants from "../../../config/constants.json";

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

export const PIECE_COLUMNS = pieceMapConfig.columns;
export const PIECE_BASE_ROWS = pieceMapConfig.base_rows;
export const PIECE_MAX_ROWS = pieceMapConfig.max_rows;
export const PIECE_CANVAS_CELL_SIZE = pieceMapConfig.cell_size;
export const PIECE_CANVAS_CELL_GAP = pieceMapConfig.cell_gap;

export const HEATMAP_SAMPLE_LIMIT =
    PIECE_COLUMNS * heatmapConfig.sample_limit_multiplier;
export const HEATMAP_ZOOM_LEVELS = heatmapConfig.zoom_levels;
export const HEATMAP_CANVAS_CELL_SIZE = heatmapConfig.cell_size;
export const HEATMAP_CANVAS_CELL_GAP = heatmapConfig.cell_gap;

export const PEER_MAP_CONFIG = peerMapConfig;
