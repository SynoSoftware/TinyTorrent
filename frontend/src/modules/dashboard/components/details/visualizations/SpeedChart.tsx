import { Button } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatSpeed } from "@/shared/utils/format";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import {
    CHART_HEIGHT,
    CHART_WIDTH,
    SPEED_WINDOW_OPTIONS,
} from "@/config/logic";
import {
    HISTORY_POINTS,
    getCssToken,
    useCanvasPalette,
} from "@/modules/dashboard/components/details/visualizations/canvasUtils";

type Point = { x: number; y: number };
// Visual tokens are provided by the design constants and exposed via `logic.ts`.
// This removes ad-hoc numeric literals from component code (No-New-Numbers).
import {
    SPEED_CHART_LINE_WIDTH,
    SPEED_CHART_FILL_ALPHA,
    SPEED_CHART_DOWN_STROKE_TOKEN,
    SPEED_CHART_UP_STROKE_TOKEN,
} from "@/config/logic";

const resampleHistory = (values: number[], targetLength: number) => {
    if (values.length <= targetLength) return [...values];
    const factor = values.length / targetLength;
    return Array.from({ length: targetLength }, (_, index) => {
        const start = Math.floor(index * factor);
        const end = Math.min(values.length, Math.floor((index + 1) * factor));
        const sliceEnd = end > start ? end : start + 1;
        const slice = values.slice(start, sliceEnd);
        if (!slice.length) {
            return values[start] ?? 0;
        }
        const total = slice.reduce((sum, value) => sum + value, 0);
        return total / slice.length;
    });
};

const buildPoints = (
    values: number[],
    spacing: number,
    maxValue: number
): Point[] => {
    if (!values.length) return [];
    return values.map((value, index) => ({
        x: index * spacing,
        y:
            CHART_HEIGHT -
            Math.min(Math.max(value / maxValue, 0), 1) * CHART_HEIGHT,
    }));
};

const drawSeries = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    strokeStyle: string
) => {
    if (!points.length) return;
    // Build path for fill
    ctx.beginPath();
    ctx.moveTo(points[0].x, CHART_HEIGHT);
    points.forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.lineTo(points.at(-1)?.x ?? CHART_WIDTH, CHART_HEIGHT);
    ctx.closePath();

    // Fill using the stroke color with reduced alpha (driven by design token).
    ctx.save();
    ctx.globalAlpha = SPEED_CHART_FILL_ALPHA;
    ctx.fillStyle = strokeStyle;
    ctx.fill();
    ctx.restore();

    // Stroke the series
    ctx.beginPath();
    points.forEach((point, index) => {
        if (index === 0) {
            ctx.moveTo(point.x, point.y);
            return;
        }
        ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = SPEED_CHART_LINE_WIDTH;
    ctx.lineCap = "round";
    ctx.stroke();
};

type SpeedWindowKey = (typeof SPEED_WINDOW_OPTIONS)[number]["key"];

interface SpeedChartProps {
    downHistory: number[];
    upHistory: number[];
    // `tick` is an engine-driven heartbeat counter. Incremented on every engine heartbeat.
    // Redraw happens on tick changes so the UI advances time even when values are identical.
    tick?: number;
}

export const SpeedChart = ({
    downHistory,
    upHistory,
    tick,
}: SpeedChartProps) => {
    const [selectedWindow, setSelectedWindow] = useState<SpeedWindowKey>("1m");
    const latestDown = downHistory.at(-1) ?? 0;
    const latestUp = upHistory.at(-1) ?? 0;

    const windowOption =
        SPEED_WINDOW_OPTIONS.find((option) => option.key === selectedWindow) ??
        SPEED_WINDOW_OPTIONS[0];
    const targetLength = Math.max(
        3,
        Math.round(HISTORY_POINTS / windowOption.minutes)
    );

    const spacing =
        targetLength > 1 ? CHART_WIDTH / (targetLength - 1) : CHART_WIDTH;

    const downValues = useMemo(
        () => resampleHistory(downHistory, targetLength),
        [downHistory, targetLength]
    );
    const upValues = useMemo(
        () => resampleHistory(upHistory, targetLength),
        [upHistory, targetLength]
    );

    const maxValue = useMemo(
        () => Math.max(...downValues, ...upValues, 1),
        [downValues, upValues]
    );

    const points = useMemo(() => {
        return {
            down: buildPoints(downValues, spacing, maxValue),
            up: buildPoints(upValues, spacing, maxValue),
        };
    }, [downValues, upValues, spacing, maxValue]);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    // Always call hooks at the top level (AGENTS.md compliance)
    const palette = useCanvasPalette();

    // Render snapshot on any relevant change. Crucially, include `tick` so that
    // time advances even when speed values are identical between heartbeats.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr =
            typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        canvas.width = CHART_WIDTH * dpr;
        canvas.height = CHART_HEIGHT * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

        // Use palette from top-level hook
        const downToken =
            getCssToken(SPEED_CHART_DOWN_STROKE_TOKEN) || palette.primary;
        const upToken =
            getCssToken(SPEED_CHART_UP_STROKE_TOKEN) || palette.success;

        // Draw fills/strokes using the resolved semantic colors. For fills we use
        // `globalAlpha` to simulate a soft gradient without parsing color strings.
        drawSeries(ctx, points.down, downToken);
        drawSeries(ctx, points.up, upToken);
    }, [points, spacing, tick]);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between font-mono text-foreground/60">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1 text-success">
                        ↓ {formatSpeed(latestDown)}
                    </span>
                    <span className="flex items-center gap-1 text-primary">
                        ↑ {formatSpeed(latestUp)}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {SPEED_WINDOW_OPTIONS.map((option) => (
                        <Button
                            key={option.key}
                            size="md"
                            variant={
                                selectedWindow === option.key
                                    ? "shadow"
                                    : "flat"
                            }
                            color={
                                selectedWindow === option.key
                                    ? "primary"
                                    : "default"
                            }
                            className="rounded-full px-(--p-3) text-(--font-size-sm)"
                            onPress={() => setSelectedWindow(option.key)}
                            aria-pressed={selectedWindow === option.key}
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>
            </div>
            <div className="rounded-2xl border border-content1/20 bg-content1/20 p-3">
                <div
                    className="w-full pointer-events-none"
                    style={{ height: `${CHART_HEIGHT}px` }}
                >
                    <canvas
                        ref={canvasRef}
                        width={CHART_WIDTH}
                        height={CHART_HEIGHT}
                        className="w-full h-full block"
                    />
                </div>
            </div>
        </div>
    );
};

// NOTE: Removing UI-owned global cache. Per AGENTS.md the engine must own history and retention.
// This hook provides a minimal instance-local history derived directly from the `torrent` prop
// and should be replaced by an engine-driven subscription (EngineAdapter) as soon as available.
// NOTE: History ownership has been moved to the engine/heartbeat layer.
// `useEngineSpeedHistory` (shared hook) should be used by tabs/components
// to read engine-provided, fixed-length buffers. The previous UI-owned
// `useTorrentDetailSpeedHistory` has been intentionally removed.
