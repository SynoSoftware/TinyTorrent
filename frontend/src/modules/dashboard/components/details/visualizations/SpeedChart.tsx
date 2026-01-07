import { Button, ButtonGroup } from "@heroui/react";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { Columns, Layers } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
type TimedValue = { ts: number; value: number };
type SpeedWindowKey = (typeof SPEED_WINDOW_OPTIONS)[number]["key"];
type LayoutMode = "combined" | "split";

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
    } catch (e) {
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
        if (!el) return;

        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setSize({
                    width: Math.max(0, entry.contentRect.width),
                    height: Math.max(0, entry.contentRect.height),
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

/* -------------------------------------------------------------------------- */
/*                                SUB COMPONENTS                              */
/* -------------------------------------------------------------------------- */

type SeriesChartProps = {
    color: string;
    timed: TimedValue[];
    windowMs: number;
    maxRef: React.MutableRefObject<number>;
    className?: string;
    tick: number; // Render tick: used only to invalidate canvas rendering
};

const SeriesChart = ({
    color,
    timed,
    windowMs,
    maxRef,
    className,
    tick, // Dependent on tick
}: SeriesChartProps) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const { ref: containerRef, size } = useObservedSize();

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
        const values = resampleTimed(timed, windowMs, buckets);

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
    }, [tick, size, color, windowMs, buckets]); // Re-run on tick

    return (
        <div
            ref={containerRef}
            className={cn("w-full relative min-h-0", className)}
        >
            <canvas ref={canvasRef} className="block w-full h-full" />
        </div>
    );
};

type CombinedChartProps = {
    downTimed: TimedValue[];
    upTimed: TimedValue[];
    downColor: string;
    upColor: string;
    windowMs: number;
    className?: string;
    tick: number; // Render tick: used only to invalidate canvas rendering
};

const CombinedChart = ({
    downTimed,
    upTimed,
    downColor,
    upColor,
    windowMs,
    className,
    tick,
}: CombinedChartProps) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const { ref: containerRef, size } = useObservedSize();
    const maxRef = useRef(1024);
    const buckets = useMemo(
        () => computeBucketsFromWidth(size.width),
        [size.width]
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || size.width === 0 || size.height === 0 || !buckets)
            return;

        // 1. Calculate values
        const downValues = resampleTimed(downTimed, windowMs, buckets);
        const upValues = resampleTimed(upTimed, windowMs, buckets);

        // 2. Scaling
        const downPeak = Math.max(...downValues, 0);
        const upPeak = Math.max(...upValues, 0);
        const peak = Math.max(downPeak, upPeak, SPEED_CANVAS_DENOM_FLOOR);
        maxRef.current = Math.max(maxRef.current * SPEED_SMOOTH_DECAY, peak);

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
    }, [tick, size, downColor, upColor, windowMs, buckets]); // Re-run on tick

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

const STORAGE_KEY = "speed_chart_layout_pref";

export const SpeedChart = ({
    downHistory,
    upHistory,
    isStandalone = false,
}: SpeedChartProps) => {
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

    // Layout Persistence Logic
    const [userLayoutPref, setUserLayoutPref] = useState<LayoutMode | null>(
        () => {
            if (typeof window !== "undefined") {
                const saved = localStorage.getItem(STORAGE_KEY);
                return saved === "combined" || saved === "split"
                    ? (saved as LayoutMode)
                    : null;
            }
            return null;
        }
    );

    const setLayout = useCallback((mode: LayoutMode) => {
        setUserLayoutPref(mode);
        localStorage.setItem(STORAGE_KEY, mode);
    }, []);

    const layout: LayoutMode =
        userLayoutPref ?? (isStandalone ? "split" : "combined");

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
    useEffect(() => {
        const ts = nowMs();
        // Only push if we actually have data, or strictly on prop change.
        // NOTE: We don't depend on 'tick' here, only on data arrival.
        downTimed.current.push({ ts, value: latestDown });
        upTimed.current.push({ ts, value: latestUp });

        const retainMs = Math.max(windowMs, SPEED_RETENTION_MS);
        const cutoff = ts - retainMs;

        if (downTimed.current[0]?.ts < cutoff) {
            downTimed.current = downTimed.current.filter((p) => p.ts >= cutoff);
            upTimed.current = upTimed.current.filter((p) => p.ts >= cutoff);
        }
    }, [latestDown, latestUp, windowMs]); // ONLY runs when network data changes

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
                        className="bg-content1/20 rounded-lg p-0.5 gap-0 mr-2"
                    >
                        <ToolbarIconButton
                            Icon={Columns}
                            iconSize="md"
                            className={cn(
                                "rounded-md",
                                layout === "split"
                                    ? "bg-background shadow-sm text-foreground"
                                    : "bg-transparent text-foreground/50"
                            )}
                            onPress={() => setLayout("split")}
                            ariaLabel="Split View"
                        />
                        <ToolbarIconButton
                            Icon={Layers}
                            iconSize="md"
                            className={cn(
                                "rounded-md",
                                layout === "combined"
                                    ? "bg-background shadow-sm text-foreground"
                                    : "bg-transparent text-foreground/50"
                            )}
                            onPress={() => setLayout("combined")}
                            ariaLabel="Combined View"
                        />
                    </ButtonGroup>

                    <div className="flex bg-content1/20 rounded-full p-0.5">
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
                                    "rounded-full px-3 h-8 min-w-0 font-medium",
                                    selectedWindow === option.key
                                        ? "bg-foreground text-background shadow-sm"
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
                        <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-content1/20 bg-content1/10 p-panel overflow-hidden relative">
                            <span
                                style={{
                                    top: "var(--tt-p-tight)",
                                    left: "var(--tt-p-panel)",
                                    fontSize: "var(--tt-fz-label)",
                                }}
                                className="absolute uppercase tracking-wider font-bold text-success/60 z-10 pointer-events-none text-label"
                            >
                                Download
                            </span>
                            <SeriesChart
                                color={downColor}
                                timed={downTimed.current}
                                windowMs={windowMs}
                                maxRef={downMaxRef}
                                className="flex-1"
                                tick={tick} // Passed tick
                            />
                        </div>
                        <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-content1/20 bg-content1/10 p-panel overflow-hidden relative">
                            <span
                                style={{
                                    top: "var(--tt-p-tight)",
                                    left: "var(--tt-p-panel)",
                                    fontSize: "var(--tt-fz-label)",
                                }}
                                className="absolute uppercase tracking-wider font-bold text-primary/60 z-10 pointer-events-none text-label"
                            >
                                Upload
                            </span>
                            <SeriesChart
                                color={upColor}
                                timed={upTimed.current}
                                windowMs={windowMs}
                                maxRef={upMaxRef}
                                className="flex-1"
                                tick={tick} // Passed tick
                            />
                        </div>
                    </>
                ) : (
                    <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-content1/20 bg-content1/10 p-panel overflow-hidden relative">
                        <div
                            style={{
                                top: "var(--tt-p-tight)",
                                left: "var(--tt-p-panel)",
                            }}
                            className="absolute flex gap-tools z-10 pointer-events-none"
                        >
                            <span
                                className="text-label uppercase tracking-wider font-bold"
                                style={{ color: downColor }}
                            >
                                Download
                            </span>
                            <span
                                className="text-label uppercase tracking-wider font-bold"
                                style={{ color: upColor }}
                            >
                                Upload
                            </span>
                        </div>
                        <CombinedChart
                            downTimed={downTimed.current}
                            upTimed={upTimed.current}
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
