import { Button } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatSpeed } from "../../../../../shared/utils/format";
import type { TorrentDetail } from "../../../../../modules/dashboard/types/torrent";
import {
    CHART_HEIGHT,
    CHART_WIDTH,
    SPEED_WINDOW_OPTIONS,
} from "../../../../../config/logic";
import { HISTORY_POINTS } from "./canvasUtils";

type Point = { x: number; y: number };
const SHIFT_DURATION_MS = 1600;
const DOWN_STROKE = "#22c55e";
const UP_STROKE = "#6366f1";

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
    fillStyle: CanvasGradient,
    strokeStyle: string
) => {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, CHART_HEIGHT);
    points.forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.lineTo(points.at(-1)?.x ?? CHART_WIDTH, CHART_HEIGHT);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();

    ctx.beginPath();
    points.forEach((point, index) => {
        if (index === 0) {
            ctx.moveTo(point.x, point.y);
            return;
        }
        ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();
};

type SpeedWindowKey = (typeof SPEED_WINDOW_OPTIONS)[number]["key"];

interface SpeedChartProps {
    downHistory: number[];
    upHistory: number[];
}

export const SpeedChart = ({ downHistory, upHistory }: SpeedChartProps) => {
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
    const animationRef = useRef<number | null>(null);
    const animationStartRef = useRef(performance.now());
    const pointsRef = useRef(points);

    useEffect(() => {
        pointsRef.current = points;
        animationStartRef.current = performance.now();
    }, [points]);

    const drawFrame = useCallback(
        (timestamp: number) => {
            const canvas = canvasRef.current;
            const { down, up } = pointsRef.current;
            if (!canvas || !down.length || !up.length) {
                animationRef.current = requestAnimationFrame(drawFrame);
                return;
            }
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                animationRef.current = requestAnimationFrame(drawFrame);
                return;
            }
            const dpr =
                typeof window !== "undefined"
                    ? window.devicePixelRatio || 1
                    : 1;
            canvas.width = CHART_WIDTH * dpr;
            canvas.height = CHART_HEIGHT * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

            const delta = timestamp - animationStartRef.current;
            let progress = Math.min(delta / SHIFT_DURATION_MS, 1);
            const offset = spacing * progress;
            ctx.save();
            ctx.translate(-offset, 0);

            const downGradient = ctx.createLinearGradient(
                0,
                0,
                0,
                CHART_HEIGHT
            );
            downGradient.addColorStop(0, "rgba(34,197,94,0.35)");
            downGradient.addColorStop(1, "rgba(34,197,94,0)");

            const upGradient = ctx.createLinearGradient(0, 0, 0, CHART_HEIGHT);
            upGradient.addColorStop(0, "rgba(99,102,241,0.35)");
            upGradient.addColorStop(1, "rgba(99,102,241,0)");

            drawSeries(ctx, down, downGradient, DOWN_STROKE);
            drawSeries(ctx, up, upGradient, UP_STROKE);

            ctx.restore();
            if (progress >= 1) {
                animationStartRef.current = timestamp;
            }
            animationRef.current = requestAnimationFrame(drawFrame);
        },
        [spacing]
    );

    useEffect(() => {
        animationRef.current = requestAnimationFrame(drawFrame);
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [drawFrame]);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-[11px] font-mono text-foreground/60">
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
                            size="sm"
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
                            className="rounded-full px-3 text-[11px]"
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

// Shared cache across hook instances to bound memory and centralize trimming.
const sharedSpeedHistoryCache = new Map<
    string,
    { down: number[]; up: number[] }
>();

export const clearSharedSpeedHistoryCache = () => {
    sharedSpeedHistoryCache.clear();
};

export const useTorrentDetailSpeedHistory = (torrent: TorrentDetail | null) => {
    const [downHistory, setDownHistory] = useState<number[]>(() =>
        new Array(HISTORY_POINTS).fill(0)
    );
    const [upHistory, setUpHistory] = useState<number[]>(() =>
        new Array(HISTORY_POINTS).fill(0)
    );

    useEffect(() => {
        if (!torrent) {
            // When inspector is closed, free global cache to limit memory.
            sharedSpeedHistoryCache.clear();
            setDownHistory(new Array(HISTORY_POINTS).fill(0));
            setUpHistory(new Array(HISTORY_POINTS).fill(0));
            return;
        }
        const cached = sharedSpeedHistoryCache.get(torrent.id);
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
        sharedSpeedHistoryCache.set(torrent.id, {
            down: [...downHistory],
            up: [...upHistory],
        });

        // Prevent unbounded growth if users click through many torrents.
        const maxEntries = 64;
        while (sharedSpeedHistoryCache.size > maxEntries) {
            const oldestKey = sharedSpeedHistoryCache.keys().next().value;
            if (!oldestKey) break;
            sharedSpeedHistoryCache.delete(oldestKey);
        }
    }, [downHistory, upHistory, torrent]);

    return { downHistory, upHistory };
};
