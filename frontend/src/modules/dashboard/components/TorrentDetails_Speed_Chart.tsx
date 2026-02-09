import { Button, ButtonGroup } from "@heroui/react";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { Columns, Layers } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatSpeed } from "@/shared/utils/format";
import { SPEED_WINDOW_OPTIONS } from "@/config/logic";
import { useUiClock } from "@/shared/hooks/useUiClock";
import {
    HISTORY_POINTS,
    getCssToken,
    useCanvasPalette,
} from "@/modules/dashboard/hooks/utils/canvasUtils";
import { usePreferences } from "@/app/context/PreferencesContext";
import {
    SPEED_CHART_LINE_WIDTH,
    SPEED_CHART_DOWN_STROKE_TOKEN,
    SPEED_CHART_UP_STROKE_TOKEN,
    SPEED_CHART_FILL_ALPHA,
    SPEED_CANVAS_DENOM_FLOOR,
    SPEED_SMOOTH_DECAY,
    SPEED_RETENTION_MS,
    SPEED_BUCKET_WIDTH_SMALL,
    SPEED_BUCKET_WIDTH_MED,
    SPEED_BUCKET_COUNT_SMALL,
    SPEED_BUCKET_COUNT_MED,
} from "@/config/logic";
import { cn } from "@heroui/react";

// Use Lucide icons to match project style and theme (color via currentColor)

type Point = { x: number; y: number };
type TimedValue = { ts: number; value: number; synthetic?: boolean };
type SpeedWindowKey = (typeof SPEED_WINDOW_OPTIONS)[number]["key"];
type LayoutMode = "combined" | "split";

type SeriesChartProps = {
    color: string;
    timedRef: React.MutableRefObject<TimedValue[]>;
    windowMs: number;
    maxRef: React.MutableRefObject<number>;
    className?: string;
    tick: number; // Render tick: used only to invalidate canvas rendering
};

interface SpeedChartProps {
    downHistory: number[];
    upHistory: number[];
    isStandalone?: boolean;
}

const nowMs = () => performance.timeOrigin + performance.now();
const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

/** Data Processing Utilities */
const resampleTimed = (
    history: TimedValue[],
    windowMs: number,
    buckets: number
): number[] => {
    // Current time drives the window, NOT the last data point.
    // This ensures the graph scrolls left even if no new data comes in.
    const end = nowMs();
    const start = end - windowMs;

    if (!history.length || buckets <= 0)
        return Array(Math.max(buckets, 0)).fill(0);

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
    const denom = Math.max(maxValue, SPEED_CANVAS_DENOM_FLOOR);
    return values.map((value, index) => ({
        x: index * spacing,
        y: height - clamp01(value / denom) * height,
    }));
};

/** Canvas Drawing Utilities */
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

const createGradient = (
    ctx: CanvasRenderingContext2D,
    height: number,
    color: string
) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    try {
        const topTransparentPct = `${Math.round(
            (1 - SPEED_CHART_FILL_ALPHA) * 100
        )}%`;
        gradient.addColorStop(
            0,
            `color-mix(in srgb, ${color}, transparent ${topTransparentPct})`
        );
        gradient.addColorStop(
            1,
            `color-mix(in srgb, ${color}, transparent 100%)`
        );
    } catch {
        gradient.addColorStop(0, `rgba(127,127,127,${SPEED_CHART_FILL_ALPHA})`);
        gradient.addColorStop(1, "rgba(127,127,127,0)");
    }
    return gradient;
};

const computeBucketsFromWidth = (width: number) => {
    if (width <= 0) return 0;
    if (width < SPEED_BUCKET_WIDTH_SMALL) return SPEED_BUCKET_COUNT_SMALL;
    if (width < SPEED_BUCKET_WIDTH_MED) return SPEED_BUCKET_COUNT_MED;
    return HISTORY_POINTS;
};

const useObservedSize = () => {
    const ref = useRef<HTMLDivElement | null>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        if (typeof window === "undefined") return;
        const el = ref.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        if (!(el instanceof Element)) return;

        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setSize({
                    width: Math.max(0, entry.contentRect.width),
                    height: Math.max(0, entry.contentRect.height),
                });
            }
        });

        try {
            ro.observe(el);
        } catch {
            ro.disconnect();
            return;
        }
        const rect = el.getBoundingClientRect();
        const initialMeasureHandle = window.setTimeout(() => {
            setSize({ width: rect.width || 0, height: rect.height || 0 });
        }, 0);

        return () => {
            window.clearTimeout(initialMeasureHandle);
            ro.disconnect();
        };
    }, []);

    return { ref, size };
};

const SeriesChart = ({
    color,
    timedRef,
    windowMs,
    maxRef,
    className,
    tick, // Dependent on tick
}: SeriesChartProps) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const { ref: containerRef, size } = useObservedSize();
    const palette = useCanvasPalette();

    // We remove useMemo here for values/points because they MUST change on every tick to scroll
    const buckets = useMemo(
        () => computeBucketsFromWidth(size.width),
        [size.width]
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || size.width === 0 || size.height === 0 || !buckets)
            return;

        // 1. Calculate values based on CURRENT TIME (tick)
        const values = resampleTimed(timedRef.current, windowMs, buckets);

        // 2. Update Max Scaling
        const peak = Math.max(...values, SPEED_CANVAS_DENOM_FLOOR);
        maxRef.current = Math.max(maxRef.current * SPEED_SMOOTH_DECAY, peak);

        // 3. Build Points
        const points = buildPoints(
            values,
            size.width,
            size.height,
            maxRef.current
        );

        // 4. Draw
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = size.width * dpr;
        canvas.height = size.height * dpr;
        canvas.style.width = `${size.width}px`;
        canvas.style.height = `${size.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size.width, size.height);

        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        fillSmooth(ctx, points, size.height);
        ctx.fillStyle = createGradient(ctx, size.height, color);
        ctx.fill();

        strokeSmooth(ctx, points);
        ctx.strokeStyle = color;
        ctx.lineWidth = SPEED_CHART_LINE_WIDTH;
        ctx.stroke();

        // Draw subtle reference guides: horizontal mid-line (~50%),
        // a near-top line representing recent max, and vertical time anchors.
        ctx.save();
        try {
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = palette.placeholder || "rgba(255,255,255,0.08)";
            ctx.setLineDash([4, 6]);

            // Horizontal: middle (50%)
            const yMid = size.height / 2;
            ctx.beginPath();
            ctx.moveTo(0, yMid + 0.5);
            ctx.lineTo(size.width, yMid + 0.5);
            ctx.stroke();

            // Horizontal: per-series MAX line (placed at correct Y based on maxRef)
            const denom = Math.max(maxRef.current, SPEED_CANVAS_DENOM_FLOOR);
            const seriesMaxYRaw =
                size.height - clamp01(maxRef.current / denom) * size.height;
            const seriesMaxY = Math.min(
                size.height - 8,
                Math.max(8, seriesMaxYRaw)
            );
            ctx.beginPath();
            ctx.moveTo(0, seriesMaxY + 0.5);
            ctx.lineTo(size.width, seriesMaxY + 0.5);
            ctx.stroke();

            // Vertical time anchors (3 lines evenly spaced; rightmost is 'now')
            const verticalCount = 3;
            for (let i = 0; i < verticalCount; i++) {
                const x = (i / (verticalCount - 1)) * size.width;
                ctx.beginPath();
                ctx.moveTo(x + 0.5, 0);
                ctx.lineTo(x + 0.5, size.height);
                ctx.stroke();
            }

            // Labels: MAX at right (for this single series) and Now anchor
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            const rootFontSize = parseFloat(
                getComputedStyle(document.documentElement).fontSize || "16"
            );
            const labelFontSize = Math.max(12, Math.round(rootFontSize));
            ctx.font = `${labelFontSize}px Inter, system-ui, sans-serif`;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            const maxLabel = `MAX ${formatSpeed(maxRef.current)}`;
            ctx.fillStyle = color; // series color
            ctx.fillText(maxLabel, size.width - 6, seriesMaxY);

            // 'Now' anchor removed in combined view to avoid overlapping overlay legend
        } finally {
            ctx.restore();
        }
    }, [
        tick,
        size,
        color,
        windowMs,
        buckets,
        maxRef,
        palette.placeholder,
        timedRef,
    ]); // Re-run on tick

    return (
        <div
            ref={containerRef}
            className={cn("w-full relative min-h-0", className)}
        >
            <canvas ref={canvasRef} className="block w-full h-full" />
            {/* Legend overlay removed from per-series chart to avoid referencing parent colors; legend is shown in CombinedChart */}
        </div>
    );
};

type CombinedChartProps = {
    downTimedRef: React.MutableRefObject<TimedValue[]>;
    upTimedRef: React.MutableRefObject<TimedValue[]>;
    downColor: string;
    upColor: string;
    windowMs: number;
    className?: string;
    tick: number; // Render tick: used only to invalidate canvas rendering
};

const CombinedChart = ({
    downTimedRef,
    upTimedRef,
    downColor,
    upColor,
    windowMs,
    className,
    tick,
}: CombinedChartProps) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const { ref: containerRef, size } = useObservedSize();
    const palette = useCanvasPalette();
    const maxRef = useRef(1024);
    const downMaxRefLocal = useRef(1024);
    const upMaxRefLocal = useRef(1024);
    const buckets = useMemo(
        () => computeBucketsFromWidth(size.width),
        [size.width]
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || size.width === 0 || size.height === 0 || !buckets)
            return;

        // 1. Calculate values
        const downValues = resampleTimed(
            downTimedRef.current,
            windowMs,
            buckets
        );
        const upValues = resampleTimed(upTimedRef.current, windowMs, buckets);

        // 2. Scaling
        const downPeak = Math.max(...downValues, 0);
        const upPeak = Math.max(...upValues, 0);
        const peak = Math.max(downPeak, upPeak, SPEED_CANVAS_DENOM_FLOOR);
        maxRef.current = Math.max(maxRef.current * SPEED_SMOOTH_DECAY, peak);

        // Maintain smoothed per-series max values for labeling
        downMaxRefLocal.current = Math.max(
            downMaxRefLocal.current * SPEED_SMOOTH_DECAY,
            downPeak
        );
        upMaxRefLocal.current = Math.max(
            upMaxRefLocal.current * SPEED_SMOOTH_DECAY,
            upPeak
        );

        // 3. Points
        const downPoints = buildPoints(
            downValues,
            size.width,
            size.height,
            maxRef.current
        );
        const upPoints = buildPoints(
            upValues,
            size.width,
            size.height,
            maxRef.current
        );

        // 4. Draw
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = size.width * dpr;
        canvas.height = size.height * dpr;
        canvas.style.width = `${size.width}px`;
        canvas.style.height = `${size.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size.width, size.height);

        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        // Draw Upload
        ctx.globalCompositeOperation = "source-over";
        fillSmooth(ctx, upPoints, size.height);
        ctx.fillStyle = createGradient(ctx, size.height, upColor);
        ctx.fill();

        strokeSmooth(ctx, upPoints);
        ctx.strokeStyle = upColor;
        ctx.lineWidth = SPEED_CHART_LINE_WIDTH;
        ctx.stroke();

        // Draw Download
        ctx.beginPath();
        fillSmooth(ctx, downPoints, size.height);
        ctx.fillStyle = createGradient(ctx, size.height, downColor);
        ctx.fill();

        strokeSmooth(ctx, downPoints);
        ctx.strokeStyle = downColor;
        ctx.lineWidth = SPEED_CHART_LINE_WIDTH;
        ctx.stroke();

        // Draw subtle reference guides for combined chart as well
        ctx.save();
        try {
            // Subtle mid-line and vertical time anchors
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = palette.placeholder || "rgba(255,255,255,0.08)";
            ctx.setLineDash([4, 6]);

            const yMid = size.height / 2;
            ctx.beginPath();
            ctx.moveTo(0, yMid + 0.5);
            ctx.lineTo(size.width, yMid + 0.5);
            ctx.stroke();

            const verticalCount = 3;
            for (let i = 0; i < verticalCount; i++) {
                const x = (i / (verticalCount - 1)) * size.width;
                ctx.beginPath();
                ctx.moveTo(x + 0.5, 0);
                ctx.lineTo(x + 0.5, size.height);
                ctx.stroke();
            }

            // Per-series MAX dashed lines (placed at the correct Y position)
            const denom = Math.max(maxRef.current, SPEED_CANVAS_DENOM_FLOOR);
            const yDownMaxRaw =
                size.height -
                clamp01(downMaxRefLocal.current / denom) * size.height;
            const yUpMaxRaw =
                size.height -
                clamp01(upMaxRefLocal.current / denom) * size.height;
            const yDownMax = Math.min(
                size.height - 8,
                Math.max(8, yDownMaxRaw)
            );
            const yUpMax = Math.min(size.height - 8, Math.max(8, yUpMaxRaw));

            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.moveTo(0, yDownMax + 0.5);
            ctx.lineTo(size.width, yDownMax + 0.5);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, yUpMax + 0.5);
            ctx.lineTo(size.width, yUpMax + 0.5);
            ctx.stroke();

            // Labels: per-series MAX at right edge, and small 'Now' anchor
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            const rootFontSize = parseFloat(
                getComputedStyle(document.documentElement).fontSize || "16"
            );
            const labelFontSize = Math.max(12, Math.round(rootFontSize));
            ctx.font = `${labelFontSize}px Inter, system-ui, sans-serif`;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";

            const downMaxLabel = `MAX ${formatSpeed(downMaxRefLocal.current)}`;
            ctx.fillStyle = downColor;
            ctx.fillText(downMaxLabel, size.width - 6, yDownMax);

            const upMaxLabel = `MAX ${formatSpeed(upMaxRefLocal.current)}`;
            ctx.fillStyle = upColor;
            ctx.fillText(upMaxLabel, size.width - 6, yUpMax);

            // Time scale labels: left = full window, middle = halfway point
            const formatDuration = (ms: number) => {
                if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
                const mins = Math.floor(ms / 60_000);
                const secs = Math.round((ms % 60_000) / 1000);
                return secs === 0
                    ? `${mins}m`
                    : `${mins}:${String(secs).padStart(2, "0")}m`;
            };
            const leftLabel = formatDuration(windowMs);
            const midLabel = formatDuration(Math.floor(windowMs / 2));
            ctx.textBaseline = "bottom";
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = palette.foreground || "rgba(255,255,255,0.6)";
            ctx.font = `${Math.max(
                10,
                labelFontSize - 2
            )}px Inter, system-ui, sans-serif`;
            ctx.textAlign = "left";
            ctx.fillText(leftLabel, 6, size.height - 4);
            ctx.textAlign = "center";
            ctx.fillText(midLabel, size.width / 2, size.height - 4);
            ctx.textAlign = "right";
        } finally {
            ctx.restore();
        }
    }, [
        tick,
        size,
        downColor,
        upColor,
        windowMs,
        buckets,
        downTimedRef,
        upTimedRef,
        palette.foreground,
        palette.placeholder,
    ]); // Re-run on tick

    return (
        <div
            ref={containerRef}
            className={cn("w-full relative min-h-0", className)}
        >
            <canvas ref={canvasRef} className="block w-full h-full" />
        </div>
    );
};

/* -------------------------------------------------------------------------- */
/*                                MAIN COMPONENT                              */
/* -------------------------------------------------------------------------- */

// Layout preference is persisted inside PreferencesProvider.

export const SpeedChart = ({
    downHistory,
    upHistory,
    isStandalone = false,
}: SpeedChartProps) => {
    const { t } = useTranslation();
    // NOTE:
    // `tick` is used ONLY to invalidate canvas rendering.
    // Time semantics (sample timestamps, retention windows, and bucket math)
    // are derived exclusively from `nowMs()` (monotonic performance time).
    // Do NOT derive timestamps from `tick` or add a second heartbeat —
    // `tick` is equivalent to a repaint driver (requestAnimationFrame/setInterval)
    // and must not be considered a source of truth for data semantics.
    // If you ever rename the hook export, prefer `renderTick` to make intent explicit.
    const { tick } = useUiClock();
    const palette = useCanvasPalette();

    const [selectedWindow, setSelectedWindow] = useState<SpeedWindowKey>("1m");
    const {
        preferences: { speedChartLayoutMode },
        setSpeedChartLayoutMode,
    } = usePreferences();

    const setLayout = useCallback(
        (mode: LayoutMode) => {
            setSpeedChartLayoutMode(mode);
        },
        [setSpeedChartLayoutMode]
    );

    const layout: LayoutMode =
        speedChartLayoutMode ?? (isStandalone ? "split" : "combined");

    const latestDown = downHistory.at(-1) ?? 0;
    const latestUp = upHistory.at(-1) ?? 0;

    const windowOption =
        SPEED_WINDOW_OPTIONS.find((option) => option.key === selectedWindow) ??
        SPEED_WINDOW_OPTIONS[0];
    const windowMs = windowOption.minutes * 60_000;

    const downTimed = useRef<TimedValue[]>([]);
    const upTimed = useRef<TimedValue[]>([]);
    const downMaxRef = useRef(1024);
    const upMaxRef = useRef(1024);

    // Feed Data Effect
    const seededRef = useRef({ down: false, up: false });
    useEffect(() => {
        const ts = nowMs();

        // Seed from engine-provided history once (synthetic samples evenly
        // spread across the current window). This gives an instant filled
        // chart without claiming backend truth — synthetic points are
        // visually helpful and will age out naturally.
        const trySeed = (
            hist: number[],
            targetRef: React.MutableRefObject<TimedValue[]>,
            key: "down" | "up"
        ) => {
            if (seededRef.current[key]) return;
            if (!hist || hist.length === 0) return;

            const N = hist.length;
            const start = ts - windowMs;
            const samples: TimedValue[] = [];
            if (N === 1) {
                samples.push({
                    ts: start + Math.floor(windowMs / 2),
                    value: hist[0],
                    synthetic: true,
                });
            } else {
                for (let i = 0; i < N; i++) {
                    const t = start + (i / (N - 1)) * windowMs;
                    samples.push({
                        ts: Math.round(t),
                        value: hist[i],
                        synthetic: true,
                    });
                }
            }
            targetRef.current = samples;
            seededRef.current[key] = true;
        };

        trySeed(downHistory, downTimed, "down");
        trySeed(upHistory, upTimed, "up");

        // Always append the newest live sample when available.
        downTimed.current.push({ ts, value: latestDown });
        upTimed.current.push({ ts, value: latestUp });

        const retainMs = Math.max(windowMs, SPEED_RETENTION_MS);
        const cutoff = ts - retainMs;

        if (downTimed.current[0]?.ts < cutoff) {
            downTimed.current = downTimed.current.filter((p) => p.ts >= cutoff);
            upTimed.current = upTimed.current.filter((p) => p.ts >= cutoff);
        }
    }, [latestDown, latestUp, windowMs, downHistory, upHistory]); // ONLY runs when network data or engine history changes

    const downColor =
        getCssToken(SPEED_CHART_DOWN_STROKE_TOKEN) || palette.primary;
    const upColor = getCssToken(SPEED_CHART_UP_STROKE_TOKEN) || palette.success;

    return (
        <div className="flex flex-col gap-tools h-full min-h-0">
            {/* Header / Controls */}
            <div className="flex items-center justify-between font-mono text-foreground/60 shrink-0">
                <div className="flex items-center gap-panel">
                    <span className="flex items-center gap-tight text-success font-bold">
                        ↓ {formatSpeed(latestDown)}
                    </span>
                    <span className="flex items-center gap-tight text-primary font-bold">
                        ↑ {formatSpeed(latestUp)}
                    </span>
                </div>

                <div className="flex items-center gap-tight">
                    <ButtonGroup
                        size="md"
                        variant="flat"
                        className="bg-content1/20 rounded-panel p-tight gap-none mr-tight"
                    >
                        <ToolbarIconButton
                            Icon={Columns}
                            iconSize="md"
                            className={cn(
                                "rounded-tight",
                                layout === "split"
                                    ? "bg-background shadow-small text-foreground"
                                    : "bg-transparent text-foreground/50"
                            )}
                            onPress={() => setLayout("split")}
                            ariaLabel={t(
                                "inspector.speed_chart.split_view_aria"
                            )}
                        />
                        <ToolbarIconButton
                            Icon={Layers}
                            iconSize="md"
                            className={cn(
                                "rounded-tight",
                                layout === "combined"
                                    ? "bg-background shadow-small text-foreground"
                                    : "bg-transparent text-foreground/50"
                            )}
                            onPress={() => setLayout("combined")}
                            ariaLabel={t(
                                "inspector.speed_chart.combined_view_aria"
                            )}
                        />
                    </ButtonGroup>

                    <div className="flex bg-content1/20 rounded-pill p-tight">
                        {SPEED_WINDOW_OPTIONS.map((option) => (
                            <Button
                                key={option.key}
                                size="md"
                                variant={
                                    selectedWindow === option.key
                                        ? "solid"
                                        : "light"
                                }
                                color={
                                    selectedWindow === option.key
                                        ? "secondary"
                                        : "default"
                                }
                                className={cn(
                                    "rounded-pill px-tight min-w-0 font-medium",
                                    selectedWindow === option.key
                                        ? "bg-foreground text-background shadow-small"
                                        : "text-foreground/60"
                                )}
                                onPress={() => setSelectedWindow(option.key)}
                            >
                                {option.label}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col gap-panel">
                {layout === "split" ? (
                    <>
                        <div className="flex-1 min-h-0 flex flex-col rounded-panel border border-content1/20 bg-content1/10 p-panel overflow-hidden relative">
                            <span
                                style={{
                                    top: "var(--tt-p-tight)",
                                    left: "var(--tt-p-panel)",
                                    fontSize: "var(--tt-fz-label)",
                                }}
                                className="absolute uppercase tracking-wider font-bold text-success/60 z-panel pointer-events-none text-label"
                            >
                                Download
                            </span>
                            <SeriesChart
                                color={downColor}
                                timedRef={downTimed}
                                windowMs={windowMs}
                                maxRef={downMaxRef}
                                className="flex-1"
                                tick={tick} // Passed tick
                            />
                        </div>
                        <div className="flex-1 min-h-0 flex flex-col rounded-panel border border-content1/20 bg-content1/10 p-panel overflow-hidden relative">
                            <span
                                style={{
                                    top: "var(--tt-p-tight)",
                                    left: "var(--tt-p-panel)",
                                    fontSize: "var(--tt-fz-label)",
                                }}
                                className="absolute uppercase tracking-wider font-bold text-primary/60 z-panel pointer-events-none text-label"
                            >
                                Upload
                            </span>
                            <SeriesChart
                                color={upColor}
                                timedRef={upTimed}
                                windowMs={windowMs}
                                maxRef={upMaxRef}
                                className="flex-1"
                                tick={tick} // Passed tick
                            />
                        </div>
                    </>
                ) : (
                    <div className="flex-1 min-h-0 flex flex-col rounded-panel border border-content1/20 bg-content1/10 p-panel overflow-hidden relative">
                        {/* legend moved above charts to avoid overlapping MAX labels */}
                        <CombinedChart
                            downTimedRef={downTimed}
                            upTimedRef={upTimed}
                            downColor={downColor}
                            upColor={upColor}
                            windowMs={windowMs}
                            className="flex-1"
                            tick={tick} // Passed tick
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
