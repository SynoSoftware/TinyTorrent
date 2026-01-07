import { Button } from "@heroui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatSpeed } from "@/shared/utils/format";
import { SPEED_WINDOW_OPTIONS } from "@/config/logic";
import { useUiClock } from "@/shared/hooks/useUiClock";
import {
    HISTORY_POINTS,
    getCssToken,
    useCanvasPalette,
} from "@/modules/dashboard/components/details/visualizations/canvasUtils";
import {
    SPEED_CHART_LINE_WIDTH,
    SPEED_CHART_FILL_ALPHA,
    SPEED_CHART_DOWN_STROKE_TOKEN,
    SPEED_CHART_UP_STROKE_TOKEN,
} from "@/config/logic";

type Point = { x: number; y: number };
type TimedValue = { ts: number; value: number };
type SpeedWindowKey = (typeof SPEED_WINDOW_OPTIONS)[number]["key"];

interface SpeedChartProps {
    downHistory: number[];
    upHistory: number[];
}

/**
 * UI-local timestamping is only used to make the canvas time-truthful across
 * jitter/variable heartbeat cadence. The heartbeat still drives all sampling.
 * When engine provides timestamps, replace `ts` at append time.
 */
const nowMs = () => performance.timeOrigin + performance.now();

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const resampleTimed = (
    history: TimedValue[],
    windowMs: number,
    buckets: number
): number[] => {
    if (!history.length || buckets <= 0)
        return Array(Math.max(buckets, 0)).fill(0);

    const end = history.at(-1)!.ts;
    const start = end - windowMs;
    const bucketMs = windowMs / buckets;

    const sums = Array(buckets).fill(0);
    const counts = Array(buckets).fill(0);

    for (const item of history) {
        if (item.ts < start || item.ts > end) continue;
        const idx = Math.min(
            buckets - 1,
            Math.floor((item.ts - start) / bucketMs)
        );
        sums[idx] += item.value;
        counts[idx] += 1;
    }

    return sums.map((sum, i) => (counts[i] ? sum / counts[i] : 0));
};

const buildPoints = (
    values: number[],
    width: number,
    height: number,
    maxValue: number
): Point[] => {
    if (!values.length || width <= 0 || height <= 0) return [];
    const spacing = values.length > 1 ? width / (values.length - 1) : width;
    const denom = Math.max(maxValue, 1);
    return values.map((value, index) => ({
        x: index * spacing,
        y: height - clamp01(value / denom) * height,
    }));
};

/**
 * Smooth polyline using a mid-point quadratic method:
 * - avoids sharp joints
 * - keeps it fast (no heavy spline math)
 * - stable for thin charts and huge charts
 */
const strokeSmooth = (ctx: CanvasRenderingContext2D, points: Point[]) => {
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length - 1; i++) {
        const curr = points[i];
        const next = points[i + 1];
        const midX = (curr.x + next.x) / 2;
        const midY = (curr.y + next.y) / 2;
        ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
    }

    const last = points.at(-1)!;
    ctx.lineTo(last.x, last.y);
};

const fillSmooth = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    width: number,
    height: number
) => {
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, height);
    ctx.lineTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length - 1; i++) {
        const curr = points[i];
        const next = points[i + 1];
        const midX = (curr.x + next.x) / 2;
        const midY = (curr.y + next.y) / 2;
        ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
    }

    const last = points.at(-1)!;
    ctx.lineTo(last.x, last.y);
    ctx.lineTo(last.x, height);
    ctx.closePath();
};

const computeBucketsFromWidth = (width: number) => {
    if (width <= 0) return 0;
    if (width < 240) return 48;
    if (width < 520) return 96;
    return HISTORY_POINTS;
};

const useObservedSize = () => {
    const ref = useRef<HTMLDivElement | null>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        if (typeof window === "undefined") return;
        const el = ref.current;
        if (!el) return;

        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setSize({
                    width: Math.max(0, entry.contentRect.width || 0),
                    height: Math.max(0, entry.contentRect.height || 0),
                });
            }
        });

        ro.observe(el);
        const rect = el.getBoundingClientRect();
        setSize({ width: rect.width || 0, height: rect.height || 0 });

        return () => ro.disconnect();
    }, []);

    return { ref, size };
};

type SeriesChartProps = {
    title: string;
    color: string;
    latest: number;
    timed: TimedValue[];
    windowMs: number;
    // Optional shared max smoothing (keeps each chart stable)
    maxRef: React.MutableRefObject<number>;
};

const SeriesChart = ({
    title,
    color,
    latest,
    timed,
    windowMs,
    maxRef,
}: SeriesChartProps) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const { ref: containerRef, size } = useObservedSize();

    const buckets = useMemo(
        () => computeBucketsFromWidth(size.width),
        [size.width]
    );

    const values = useMemo(
        () => (buckets ? resampleTimed(timed, windowMs, buckets) : []),
        [timed, windowMs, buckets]
    );

    useEffect(() => {
        const peak = Math.max(...values, 1);
        maxRef.current = Math.max(maxRef.current * 0.94, peak);
    }, [values, maxRef]);

    const points = useMemo(
        () => buildPoints(values, size.width, size.height, maxRef.current),
        [values, size.width, size.height, maxRef.current]
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || size.width <= 0 || size.height <= 0) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr =
            typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

        canvas.width = Math.max(1, Math.floor(size.width * dpr));
        canvas.height = Math.max(1, Math.floor(size.height * dpr));
        canvas.style.width = `${size.width}px`;
        canvas.style.height = `${size.height}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size.width, size.height);

        // Smoothness knobs
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        // Fill
        fillSmooth(ctx, points, size.width, size.height);
        ctx.save();
        ctx.globalAlpha = SPEED_CHART_FILL_ALPHA;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();

        // Stroke
        strokeSmooth(ctx, points);
        ctx.strokeStyle = color;
        ctx.lineWidth = SPEED_CHART_LINE_WIDTH;
        ctx.stroke();

        // Minimal in-canvas label (no hardcoded rgba; rely on container text)
        // Keep canvas purely chart; text stays in DOM for crispness.
    }, [points, size, color]);

    return (
        <div className="flex flex-col gap-tight">
            <div className="flex items-center justify-between font-mono text-foreground/60">
                <span className="text-(--font-size-sm)">{title}</span>
                <span className="text-(--font-size-sm)">
                    {formatSpeed(latest)}
                </span>
            </div>

            <div className="rounded-2xl border border-content1/20 bg-content1/20 p-panel">
                <div
                    ref={containerRef}
                    className="w-full pointer-events-none"
                    // Use the available docked/tab space; allow the parent to scroll if constrained.
                    style={{ height: "clamp(96px, 22vh, 320px)" }}
                >
                    <canvas ref={canvasRef} className="w-full h-full block" />
                </div>
            </div>
        </div>
    );
};

export const SpeedChart = ({ downHistory, upHistory }: SpeedChartProps) => {
    const { tick } = useUiClock();
    const palette = useCanvasPalette();

    const [selectedWindow, setSelectedWindow] = useState<SpeedWindowKey>("1m");

    const latestDown = downHistory.at(-1) ?? 0;
    const latestUp = upHistory.at(-1) ?? 0;

    const windowOption =
        SPEED_WINDOW_OPTIONS.find((option) => option.key === selectedWindow) ??
        SPEED_WINDOW_OPTIONS[0];

    const windowMs = windowOption.minutes * 60_000;

    // UI-local time series fed by heartbeat.
    const downTimed = useRef<TimedValue[]>([]);
    const upTimed = useRef<TimedValue[]>([]);

    // Separate max smoothing per chart keeps each chart readable (upload often ~0).
    const downMaxRef = useRef(1);
    const upMaxRef = useRef(1);

    useEffect(() => {
        const ts = nowMs();
        downTimed.current.push({ ts, value: latestDown });
        upTimed.current.push({ ts, value: latestUp });

        // Retain enough samples for the largest window without UI-owned global caches.
        const retainMs = Math.max(windowMs, 15 * 60_000);
        const cutoff = ts - retainMs;

        downTimed.current = downTimed.current.filter((p) => p.ts >= cutoff);
        upTimed.current = upTimed.current.filter((p) => p.ts >= cutoff);
    }, [tick, latestDown, latestUp, windowMs]);

    const downColor =
        getCssToken(SPEED_CHART_DOWN_STROKE_TOKEN) || palette.primary;
    const upColor = getCssToken(SPEED_CHART_UP_STROKE_TOKEN) || palette.success;

    return (
        <div className="flex flex-col gap-tools min-h-0">
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

            {/* In docked mode, this must scroll instead of clipping */}
            <div className="min-h-0 overflow-y-auto pr-1">
                <div className="flex flex-col gap-panel">
                    <SeriesChart
                        title="Download"
                        color={downColor}
                        latest={latestDown}
                        timed={downTimed.current}
                        windowMs={windowMs}
                        maxRef={downMaxRef}
                    />
                    <SeriesChart
                        title="Upload"
                        color={upColor}
                        latest={latestUp}
                        timed={upTimed.current}
                        windowMs={windowMs}
                        maxRef={upMaxRef}
                    />
                </div>
            </div>
        </div>
    );
};
