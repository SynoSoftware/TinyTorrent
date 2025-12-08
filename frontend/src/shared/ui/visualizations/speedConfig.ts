import { INTERACTION_CONFIG } from "../../../config/interaction";

export const SPEED_WINDOW_OPTIONS = [
    { key: "1m", label: "1m", minutes: 1 },
    { key: "5m", label: "5m", minutes: 5 },
    { key: "30m", label: "30m", minutes: 30 },
    { key: "1h", label: "1h", minutes: 60 },
] as const;

export const { speedChart } = INTERACTION_CONFIG;
export const CHART_WIDTH = speedChart.width;
export const CHART_HEIGHT = speedChart.height;
