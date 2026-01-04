import { Button } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatSpeed } from "@/shared/utils/format";
import { SPEED_WINDOW_OPTIONS } from "@/config/logic";
import { useUiClock } from "@/shared/hooks/useUiClock";
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
    maxValue: number,
    chartHeight: number
): Point[] => {
    if (!values.length) return [];
    return values.map((value, index) => ({
        x: index * spacing,
        y:
            chartHeight -
            Math.min(Math.max(value / maxValue, 0), 1) * chartHeight,
    }));
};

const drawSeries = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    strokeStyle: string,
    chartWidth: number,
    chartHeight: number
) => {
    if (!points.length) return;
    // Build path for fill
    ctx.beginPath();
    ctx.moveTo(points[0].x, chartHeight);
    points.forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.lineTo(points.at(-1)?.x ?? chartWidth, chartHeight);
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
}

export const SpeedChart = ({ downHistory, upHistory }: SpeedChartProps) => {
    const { tick } = useUiClock();
    const [selectedWindow, setSelectedWindow] = useState<SpeedWindowKey>("1m");
    const latestDown = downHistory.at(-1) ?? 0;
    const latestUp = upHistory.at(-1) ?? 0;

    const containerRef = useRef<HTMLDivElement | null>(null);
    const [dimensions, setDimensions] = useState<{
        width: number;
        height: number;
    }>({
        width: 0,
        height: 0,
    });

    const windowOption =
        SPEED_WINDOW_OPTIONS.find((option) => option.key === selectedWindow) ??
        SPEED_WINDOW_OPTIONS[0];
    const targetLength = Math.max(
        3,
        Math.round(HISTORY_POINTS / windowOption.minutes)
    );

    const spacing =
        targetLength > 1
            ? dimensions.width / (targetLength - 1)
            : dimensions.width;

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
            down: buildPoints(downValues, spacing, maxValue, dimensions.height),
            up: buildPoints(upValues, spacing, maxValue, dimensions.height),
        };
    }, [downValues, upValues, spacing, maxValue, dimensions.height]);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    // Always call hooks at the top level (AGENTS.md compliance)
    const palette = useCanvasPalette();

    // ResizeObserver to match canvas backing store to displayed CSS size
    useEffect(() => {
        if (typeof window === "undefined") return;
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const w = Math.max(0, entry.contentRect.width || 0);
                const h = Math.max(0, entry.contentRect.height || 0);
                setDimensions({ width: w, height: h });
            }
        });
        ro.observe(el);
        // initialize
        const rect = el.getBoundingClientRect();
        setDimensions({ width: rect.width || 0, height: rect.height || 0 });
        return () => ro.disconnect();
    }, [containerRef.current]);

    // Render snapshot on any relevant change. `tick` advances the UI timeline
    // even when speed values are identical between updates.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || dimensions.width <= 0 || dimensions.height <= 0) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr =
            typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

        // Set backing store to match displayed CSS size multiplied by DPR
        canvas.width = Math.max(1, Math.floor(dimensions.width * dpr));
        canvas.height = Math.max(1, Math.floor(dimensions.height * dpr));
        // Ensure CSS size matches logical pixels
        canvas.style.width = `${dimensions.width}px`;
        canvas.style.height = `${dimensions.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, dimensions.width, dimensions.height);

        // Use palette from top-level hook
        const downToken =
            getCssToken(SPEED_CHART_DOWN_STROKE_TOKEN) || palette.primary;
        const upToken =
            getCssToken(SPEED_CHART_UP_STROKE_TOKEN) || palette.success;

        // Draw fills/strokes using the resolved semantic colors.
        drawSeries(
            ctx,
            points.down,
            downToken,
            dimensions.width,
            dimensions.height
        );
        drawSeries(
            ctx,
            points.up,
            upToken,
            dimensions.width,
            dimensions.height
        );
    }, [points, spacing, tick, dimensions, palette]);

    return (
        <div className="flex flex-col gap-tools">
            <div className="flex items-center justify-between font-mono text-foreground/60">
                <div className="flex items-center gap-panel">
                    <span className="flex items-center gap-tight text-success">
                        ↓ {formatSpeed(latestDown)}
                    </span>
                    <span className="flex items-center gap-tight text-primary">
                        ↑ {formatSpeed(latestUp)}
                    </span>
                </div>
                <div className="flex items-center gap-tight">
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
                            className="rounded-full px-(--p-panel) text-(--font-size-sm)"
                            onPress={() => setSelectedWindow(option.key)}
                            aria-pressed={selectedWindow === option.key}
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>
            </div>
            <div className="rounded-2xl border border-content1/20 bg-content1/20 p-panel">
                <div
                    ref={containerRef}
                    className="w-full pointer-events-none"
                    style={{ height: `120px` }}
                >
                    <canvas ref={canvasRef} className="w-full h-full block" />
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
