import { cn } from "@heroui/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@/shared/utils/format";
import {
    cancelScheduledFrame,
    scheduleFrame,
    useCanvasPalette,
    normalizeCanvasColor,
} from "./canvasUtils";
import type { FrameHandle } from "./canvasUtils";
import { DETAILS_PIECE_MAP_CONFIG } from "@/config/logic";
import { TEXT_ROLES } from "@/modules/dashboard/components/details/tabs/textRoles";

type PieceStatus = "done" | "downloading" | "missing";

interface PiecesMapProps {
    percent: number;
    pieceCount?: number;
    /**
     * expected:
     * - binary: 0/1 (missing/done)
     * - tri: 0/1/2 (missing/downloading/done)
     */
    pieceStates?: number[];
    pieceSize?: number;
}

type HoverInfo = {
    pieceIndex: number;
    status: PieceStatus;
    row: number;
    col: number;
};

type HoverPosition = { x: number; y: number; width: number; height: number };

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const normalizePercent = (value: number) => {
    const numeric = Number.isFinite(value) ? value : 0;
    return clamp(numeric, 0, 1);
};

const buildGridRows = (pieceCount: number) => {
    const safeCount = Number.isFinite(pieceCount)
        ? Math.max(0, Math.round(pieceCount))
        : 0;
    const rowsFromPieces =
        safeCount > 0
            ? Math.ceil(
                  safeCount / Math.max(1, DETAILS_PIECE_MAP_CONFIG.columns)
              )
            : 0;
    return Math.min(
        DETAILS_PIECE_MAP_CONFIG.rows.max,
        Math.max(DETAILS_PIECE_MAP_CONFIG.rows.base, rowsFromPieces)
    );
};

const PIECE_STATUS_TRANSLATION_KEYS: Record<PieceStatus, string> = {
    done: "torrent_modal.stats.verified",
    downloading: "torrent_modal.stats.downloading",
    missing: "torrent_modal.stats.missing",
};

function classifyPieceState(
    value: number,
    hasBinaryPieceStates: boolean
): PieceStatus {
    if (hasBinaryPieceStates) return value === 1 ? "done" : "missing";
    // assumed: 0 missing, 1 downloading, 2 done
    if (value === 2) return "done";
    if (value === 1) return "downloading";
    return "missing";
}

function fitCanvasToParent(
    canvas: HTMLCanvasElement,
    container: HTMLElement | null
) {
    if (!container) return { cssW: canvas.width, cssH: canvas.height, dpr: 1 };

    const rect = container.getBoundingClientRect();

    const dpr = window.devicePixelRatio || 1;

    const pxW = Math.max(1, Math.floor(rect.width * dpr));
    const pxH = Math.max(1, Math.floor(rect.height * dpr));

    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;

    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return { cssW: rect.width, cssH: rect.height, dpr };
}

/**
 * A single-surface "focus+context" map:
 * - whole dataset always visible (no scroll)
 * - rows locally expand near focusRow (cursor proximity)
 * - drag pans focusRow (surface moves under cursor)
 * - wheel adjusts distortion strength (not zoom, not scroll)
 */
export const PiecesMap = ({
    percent,
    pieceCount,
    pieceStates,
    pieceSize,
}: PiecesMapProps) => {
    const { t } = useTranslation();
    const palette = useCanvasPalette();

    // ---- normalize data ----
    const normalizedPercent = normalizePercent(percent);
    const fallbackPieces = Math.max(
        64,
        Math.round(256 * Math.max(normalizedPercent, 0.1))
    );
    const safePieceCount =
        typeof pieceCount === "number" &&
        Number.isFinite(pieceCount) &&
        pieceCount > 0
            ? Math.round(pieceCount)
            : undefined;
    const totalPieces = safePieceCount ?? fallbackPieces;
    const columns = Math.max(
        1,
        Number.isFinite(DETAILS_PIECE_MAP_CONFIG.columns)
            ? DETAILS_PIECE_MAP_CONFIG.columns
            : 1
    );

    const gridRows = buildGridRows(totalPieces);

    const pieceStatesLength = pieceStates?.length ?? 0;
    const hasBinaryPieceStates =
        pieceStatesLength >= totalPieces &&
        (pieceStates?.every((v) => v === 0 || v === 1) ?? false);

    const resolvedStates: PieceStatus[] = useMemo(() => {
        if (pieceStates && pieceStates.length >= totalPieces) {
            return pieceStates
                .slice(0, totalPieces)
                .map((v) => classifyPieceState(v, hasBinaryPieceStates));
        }
        const doneUntil = Math.round(totalPieces * normalizedPercent);
        return Array.from({ length: totalPieces }, (_, i) =>
            i < doneUntil ? "done" : "missing"
        );
    }, [pieceStates, totalPieces, normalizedPercent, hasBinaryPieceStates]);

    const doneCount = useMemo(
        () => resolvedStates.filter((s) => s === "done").length,
        [resolvedStates]
    );
    const downloadingCount = useMemo(
        () => resolvedStates.filter((s) => s === "downloading").length,
        [resolvedStates]
    );
    const missingCount = totalPieces - doneCount - downloadingCount;

    const pieceSizeLabel = pieceSize
        ? formatBytes(pieceSize)
        : t("torrent_modal.stats.unknown_size");

    // ---- canvas refs ----
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);

    const frameRef = useRef<FrameHandle | null>(null);
    const overlayFrameRef = useRef<FrameHandle | null>(null);

    // ---- interaction state ----
    const [hovered, setHovered] = useState<HoverInfo | null>(null);
    const [hoverPos, setHoverPos] = useState<HoverPosition | null>(null);

    // Focus row is the center of distortion. targetFocusRow comes from cursor.
    const focusRowRef = useRef(0);
    const targetFocusRowRef = useRef(0);

    // Drag pans focusRow directly.
    const draggingRef = useRef(false);
    const dragStartYRef = useRef(0);
    const dragStartFocusRef = useRef(0);

    // Distortion parameters (wheel adjusts strength, not zoom).
    // strength: peak expansion amount; sigma: spread of expansion.
    const strengthRef = useRef(1.0);
    const sigmaRef = useRef(6.0);

    // Animated stripes for "downloading"
    const animTRef = useRef(0);

    // ---- computed drawing geometry per frame ----
    type Geometry = {
        cellW: number;
        baseH: number;
        peakH: number;
        sigma: number;
        yStarts: Float32Array; // length gridRows + 1; prefix sums for row starts
        totalH: number;
    };
    const geomRef = useRef<Geometry | null>(null);

    // ---- tooltip ----
    const tooltipLines = useMemo(() => {
        if (!hovered) return [];
        return [
            t(PIECE_STATUS_TRANSLATION_KEYS[hovered.status]),
            `${t("torrent_modal.stats.piece_index")}: ${
                hovered.pieceIndex + 1
            }`,
            t("torrent_modal.piece_map.tooltip_size", { size: pieceSizeLabel }),
        ];
    }, [hovered, pieceSizeLabel, t]);

    const tooltipStyle = useMemo(() => {
        if (!hoverPos) return undefined;
        return { left: hoverPos.x + 12, top: hoverPos.y - 64 };
    }, [hoverPos]);

    // ---- row height function (focus+context distortion) ----
    const computeGeometry = useCallback(
        (cssW: number, cssH: number) => {
            // Cell width is derived from available width. Columns are fixed.
            const cellW = Math.max(2, cssW / columns);

            // Base compressed row height and peak expanded row height
            // Keep whole surface visible: baseH is small; peakH is larger.
            const baseH = Math.max(2, cellW * 0.35); // dense overview at rest
            const peakH = Math.max(baseH + 1, cellW * 1.15); // local inspection height

            const sigma = clamp(sigmaRef.current, 2.5, 18);

            const yStarts = new Float32Array(gridRows + 1);

            // We compute unnormalized weights then scale to fit cssH exactly.
            // height(row) = baseH + strength*(peakH-baseH)*gauss(distance)
            const focusRow = clamp(
                focusRowRef.current,
                0,
                Math.max(0, gridRows - 1)
            );
            const strength = clamp(strengthRef.current, 0.15, 2.0);

            // First pass: sum desired heights
            let sum = 0;
            const desired = new Float32Array(gridRows);
            const inv2s2 = 1 / (2 * sigma * sigma);

            for (let r = 0; r < gridRows; r++) {
                const d = r - focusRow;
                const g = Math.exp(-(d * d) * inv2s2);
                const h = baseH + strength * (peakH - baseH) * g;
                desired[r] = h;
                sum += h;
            }

            // Scale to exactly fit container height, preserving relative distortion.
            const rawScale = sum > 0 ? cssH / sum : 1;
            const scale = Number.isFinite(rawScale) ? rawScale : 1;

            yStarts[0] = 0;
            for (let r = 0; r < gridRows; r++) {
                const baseHeight = Math.max(4, desired[r]);
                const scaledHeight = baseHeight * scale;
                const finalHeight = Math.max(4, scaledHeight);
                yStarts[r + 1] = yStarts[r] + finalHeight;
            }

            geomRef.current = {
                cellW,
                baseH: baseH * scale,
                peakH: peakH * scale,
                sigma,
                yStarts,
                totalH: yStarts[gridRows],
            };
        },
        [columns, gridRows]
    );

    // ---- hit-testing: find row from y using prefix sums ----
    const rowAtY = useCallback(
        (y: number) => {
            const g = geomRef.current;
            if (!g) return null;
            const ys = g.yStarts;
            if (y < 0 || y >= ys[ys.length - 1]) return null;

            // binary search in prefix sums
            let lo = 0;
            let hi = ys.length - 1; // last is total
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (ys[mid] <= y) lo = mid + 1;
                else hi = mid;
            }
            const row = Math.max(0, lo - 1);
            return row >= 0 && row < gridRows ? row : null;
        },
        [gridRows]
    );

    // ---- hit-testing: piece index from x,y ----
    const pieceAtPoint = useCallback(
        (x: number, y: number) => {
            const g = geomRef.current;
            if (!g) return null;

            const row = rowAtY(y);
            if (row == null) return null;

            const col = Math.floor(x / g.cellW);
            if (col < 0 || col >= columns) return null;

            const index = row * columns + col;
            if (index < 0 || index >= totalPieces) return null;

            const y0 = g.yStarts[row];
            const y1 = g.yStarts[row + 1];
            return {
                index,
                row,
                col,
                cell: { x: col * g.cellW, y: y0, w: g.cellW, h: y1 - y0 },
            };
        },
        [columns, totalPieces, rowAtY]
    );
    function resolveCssColor(value: string): string {
        if (!value.startsWith("var(")) return normalizeCanvasColor(value);
        const name = value.slice(4, -1).trim();
        const resolved = getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim();
        return normalizeCanvasColor(resolved);
    }

    // ---- draw helpers ----
    const draw = useCallback(
        (nowMs: number) => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const { cssW, cssH } = fitCanvasToParent(canvas, rootRef.current);
            computeGeometry(cssW, cssH);

            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            // background is handled by container; keep canvas transparent.
            ctx.clearRect(0, 0, cssW, cssH);

            const g = geomRef.current!;
            const gap = Math.max(0.5, Math.min(1.25, g.cellW * 0.06));
            const wInner = Math.max(1, g.cellW - gap);

            // downloading pattern (animated diagonal stripes)
            const stripeSpeed = 0.02; // px/ms
            const tpx = (nowMs * stripeSpeed) % 12;

            // encode states with redundancy:
            // - done: solid success
            // - downloading: warning fill + animated stripes
            // - missing: muted fill + danger outline
            for (let row = 0; row < gridRows; row++) {
                const y0 = g.yStarts[row];
                const y1 = g.yStarts[row + 1];
                const h = Math.max(1, y1 - y0);
                const hInner = Math.max(1, h - gap);

                const baseIndex = row * columns;

                // if a row height gets very small, reduce detail cost:
                const tooSmallForDetail = h < 3.5;

                for (let col = 0; col < columns; col++) {
                    const pieceIndex = baseIndex + col;
                    if (pieceIndex >= totalPieces) break;

                    const status = resolvedStates[pieceIndex];
                    const x = col * g.cellW;

                    if (status === "done") {
                        ctx.fillStyle = resolveCssColor(palette.success);

                        ctx.fillRect(x, y0, wInner, hInner);
                        continue;
                    }

                    if (status === "missing") {
                        ctx.fillStyle = resolveCssColor(palette.content1);

                        ctx.globalAlpha = 0.65;
                        ctx.fillRect(x, y0, wInner, hInner);
                        ctx.globalAlpha = 1;

                        // outline only if we have pixels for it
                        if (!tooSmallForDetail) {
                            ctx.strokeStyle = resolveCssColor(palette.danger);

                            ctx.lineWidth = 1;
                            ctx.strokeRect(
                                x + 0.5,
                                y0 + 0.5,
                                wInner - 1,
                                hInner - 1
                            );
                        }
                        continue;
                    }

                    // downloading
                    ctx.fillStyle = resolveCssColor(palette.warning);

                    ctx.fillRect(x, y0, wInner, hInner);

                    if (!tooSmallForDetail) {
                        // animated diagonal stripes (no extra canvas allocations)
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(x, y0, wInner, hInner);
                        ctx.clip();

                        ctx.strokeStyle = resolveCssColor(palette.primary);

                        ctx.globalAlpha = 0.55;
                        ctx.lineWidth = 1;

                        // draw stripes across the cell
                        const step = 6;
                        for (let s = -hInner; s < wInner + hInner; s += step) {
                            ctx.beginPath();
                            ctx.moveTo(x + s + tpx, y0 + hInner);
                            ctx.lineTo(x + s + tpx + hInner, y0);
                            ctx.stroke();
                        }

                        ctx.restore();
                        ctx.globalAlpha = 1;
                    }
                }
            }
        },
        [
            computeGeometry,
            gridRows,
            columns,
            totalPieces,
            resolvedStates,
            palette.success,
            palette.warning,
            palette.content1,
            palette.primary,
            palette.danger,
        ]
    );

    const drawOverlay = useCallback(() => {
        const overlay = overlayRef.current;
        if (!overlay) return;

        const { cssW, cssH } = fitCanvasToParent(overlay, rootRef.current);
        const ctx = overlay.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, cssW, cssH);

        if (!hovered) return;

        const g = geomRef.current;
        if (!g) return;

        const row = hovered.row;
        const col = hovered.col;
        const y0 = g.yStarts[row];
        const y1 = g.yStarts[row + 1];
        const x0 = col * g.cellW;

        const w = g.cellW;
        const h = y1 - y0;

        // ring that survives any background
        ctx.strokeStyle = resolveCssColor(palette.foreground);

        ctx.globalAlpha = 0.92;
        ctx.lineWidth = 2;
        ctx.strokeRect(x0 + 1, y0 + 1, w - 3, h - 3);

        ctx.strokeStyle = palette.primary;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 3, y0 + 3, w - 7, h - 7);

        ctx.globalAlpha = 1;
    }, [hovered, palette.foreground, palette.primary]);

    const scheduleDraw = useCallback(() => {
        if (frameRef.current) cancelScheduledFrame(frameRef.current);
        frameRef.current = scheduleFrame((nowMs: number) => {
            animTRef.current = nowMs;
            draw(nowMs);
        });

        if (overlayFrameRef.current)
            cancelScheduledFrame(overlayFrameRef.current);
        overlayFrameRef.current = scheduleFrame(() => drawOverlay());
    }, [draw, drawOverlay]);

    // ---- smooth focus easing (breathing surface) ----
    useEffect(() => {
        let raf = 0;

        const tick = () => {
            raf = window.requestAnimationFrame(tick);

            if (draggingRef.current) {
                // dragging owns focus; still draw for animation
                scheduleDraw();
                return;
            }

            const current = focusRowRef.current;
            const target = targetFocusRowRef.current;

            // critically damped-ish easing
            const diff = target - current;
            if (Math.abs(diff) > 0.001) {
                focusRowRef.current = current + diff * 0.18;
            } else {
                focusRowRef.current = target;
            }

            scheduleDraw();
        };

        raf = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(raf);
    }, [scheduleDraw]);

    // ---- redraw on hard changes ----
    useEffect(() => {
        scheduleDraw();
        const onResize = () => scheduleDraw();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [scheduleDraw]);

    // ---- pointer interaction ----
    const handleMove = useCallback(
        (e: ReactMouseEvent<HTMLCanvasElement>) => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const x = e.nativeEvent.offsetX;
            const y = e.nativeEvent.offsetY;

            const hit = pieceAtPoint(x, y);
            if (!hit) {
                setHovered(null);
                setHoverPos(null);
                return;
            }

            const status = resolvedStates[hit.index];
            const info: HoverInfo = {
                pieceIndex: hit.index,
                status,
                row: hit.row,
                col: hit.col,
            };

            setHovered(info);
            setHoverPos({
                x: hit.cell.x,
                y: hit.cell.y,
                width: hit.cell.w,
                height: hit.cell.h,
            });

            // cursor-driven expansion: target focus follows hovered row
            targetFocusRowRef.current = hit.row;

            // draw overlay immediately responsive
            scheduleDraw();
        },
        [pieceAtPoint, resolvedStates, scheduleDraw]
    );

    const handleLeave = useCallback(() => {
        setHovered(null);
        setHoverPos(null);
        // keep last focusRow (surface doesn't "snap away" and cause disorientation)
        scheduleDraw();
    }, [scheduleDraw]);

    const handleDown = useCallback((e: ReactMouseEvent<HTMLCanvasElement>) => {
        // drag pans the surface (focusRow), not a separator.
        draggingRef.current = true;
        dragStartYRef.current = e.clientY;
        dragStartFocusRef.current = focusRowRef.current;
    }, []);

    useEffect(() => {
        const onMove = (e: globalThis.MouseEvent) => {
            if (!draggingRef.current) return;

            const root = rootRef.current;
            const canvas = canvasRef.current;
            if (!root || !canvas) return;

            const rect = root.getBoundingClientRect();
            const y = clamp(e.clientY - rect.top, 0, rect.height);

            // Use current geometry to translate pixels -> rows robustly.
            const g = geomRef.current;
            const approxRowHeight = g
                ? g.totalH / Math.max(1, gridRows)
                : rect.height / Math.max(1, gridRows);

            const dy = e.clientY - dragStartYRef.current;

            // Drag up -> focus moves down (content moves up under cursor)
            const nextFocus =
                dragStartFocusRef.current - dy / Math.max(2, approxRowHeight);

            // Also bias toward where the cursor is during drag (keeps it feeling "grabbed")
            const underCursorRow = rowAtY(y);
            const blended =
                underCursorRow == null
                    ? nextFocus
                    : nextFocus * 0.75 + underCursorRow * 0.25;

            focusRowRef.current = clamp(blended, 0, Math.max(0, gridRows - 1));
            targetFocusRowRef.current = focusRowRef.current;

            scheduleDraw();
        };

        const onUp = () => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [gridRows, rowAtY, scheduleDraw]);

    const handleWheel = useCallback(
        (e: React.WheelEvent) => {
            // Wheel adjusts distortion strength/spread (semantic), never scrolls.
            e.preventDefault();

            const dy = clamp(e.deltaY, -120, 120);

            if (e.altKey) {
                // Alt-wheel: spread (how wide the focus region is)
                sigmaRef.current = clamp(
                    sigmaRef.current - dy * 0.03,
                    3.0,
                    18.0
                );
            } else {
                // default: strength (how tall the focus region gets)
                strengthRef.current = clamp(
                    strengthRef.current - dy * 0.004,
                    0.2,
                    1.8
                );
            }

            scheduleDraw();
        },
        [scheduleDraw]
    );

    // ---- minimal “2025” affordance: cursor changes for drag ----
    const cursor = draggingRef.current ? "grabbing" : "grab";

    return (
        <div className="flex flex-col flex-1 min-h-0 gap-panel">
            <div
                className="flex flex-wrap justify-between gap-panel text-foreground/50"
                style={{ letterSpacing: "var(--tt-tracking-wide)" }}
            >
                <div className="flex flex-col gap-tight">
                    <span className={TEXT_ROLES.label}>
                        {t("torrent_modal.stats.pieces")}
                    </span>
                    <span className="text-scaled font-mono text-foreground">
                        {totalPieces}
                    </span>
                </div>

                <div className="flex flex-col gap-tight">
                    <span className={TEXT_ROLES.label}>
                        {t("torrent_modal.stats.piece_size")}
                    </span>
                    <span className="text-scaled font-mono text-foreground">
                        {pieceSizeLabel}
                    </span>
                </div>

                <div className="flex flex-col gap-tight">
                    <span className={TEXT_ROLES.label}>
                        {t("torrent_modal.stats.verified")}
                    </span>
                    <span className="text-scaled font-mono text-foreground">
                        {doneCount}
                    </span>
                </div>

                <div className="flex flex-col gap-tight">
                    <span className={TEXT_ROLES.label}>
                        {t("torrent_modal.stats.downloading")}
                    </span>
                    <span className="text-scaled font-mono text-warning">
                        {downloadingCount}
                    </span>
                </div>

                <div className="flex flex-col gap-tight">
                    <span className={TEXT_ROLES.label}>
                        {t("torrent_modal.stats.missing")}
                    </span>
                    <span className="text-scaled font-mono text-danger">
                        {missingCount}
                    </span>
                </div>
            </div>

            {hasBinaryPieceStates && (
                <div className="text-scaled text-foreground/60">
                    {t("torrent_modal.piece_map.binary_states_note")}
                </div>
            )}

            <div
                ref={rootRef}
                className="relative z-10 flex-1 min-h-0 rounded-2xl border border-content1/20 bg-content1/10 p-panel overflow-hidden"
                onWheel={handleWheel}
            >
                <div className="relative w-full h-full">
                    <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full block rounded-2xl"
                        onMouseMove={handleMove}
                        onMouseLeave={handleLeave}
                        onMouseDown={handleDown}
                        style={{
                            cursor,
                            touchAction: "none",
                            pointerEvents: "auto",
                        }}
                    />
                    <canvas
                        ref={overlayRef}
                        className="absolute inset-0 w-full h-full block rounded-2xl pointer-events-none"
                    />

                    {tooltipLines.length > 0 && tooltipStyle && (
                        <div
                            className="pointer-events-none absolute z-10 max-w-tooltip rounded-2xl border border-content1/30 bg-content1/90 px-panel py-tight text-scaled text-foreground/90 shadow-large backdrop-blur-xl"
                            style={tooltipStyle}
                        >
                            {tooltipLines.map((line, i) => (
                                <span
                                    key={`piece-tooltip-${i}`}
                                    className={cn(
                                        "block whitespace-normal text-scaled",
                                        i === 0
                                            ? "font-semibold"
                                            : "text-foreground/70"
                                    )}
                                >
                                    {line}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* minimal inline affordance (non-intrusive, fades into the UI) */}
                    <div className="absolute right-2 bottom-2 flex gap-2">
                        <div className="text-[11px] text-foreground/60 bg-content1/40 backdrop-blur-xl border border-content1/25 rounded-full px-3 py-1">
                            {t("torrent_modal.piece_map.hint_interact", {
                                defaultValue:
                                    "Drag to pan • Wheel to inspect • Alt+Wheel to widen",
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Optional micro-legend (keep for accessibility; visually secondary) */}
            <div className="flex gap-panel mt-tight items-center">
                <span className="flex items-center gap-tight">
                    <span
                        style={{
                            width: 14,
                            height: 14,
                            background: palette.success,
                            display: "inline-block",
                            borderRadius: 4,
                        }}
                    />
                    <span
                        className={`${TEXT_ROLES.secondary} text-foreground/70`}
                    >
                        {t("torrent_modal.stats.verified")}
                    </span>
                </span>

                <span className="flex items-center gap-tight">
                    <span
                        style={{
                            width: 14,
                            height: 14,
                            background: palette.warning,
                            display: "inline-block",
                            borderRadius: 4,
                            border: "1px solid " + palette.primary,
                        }}
                    />
                    <span
                        className={`${TEXT_ROLES.secondary} text-foreground/70`}
                    >
                        {t("torrent_modal.stats.downloading")}
                    </span>
                </span>

                <span className="flex items-center gap-tight">
                    <span
                        style={{
                            width: 14,
                            height: 14,
                            background: palette.content1,
                            display: "inline-block",
                            borderRadius: 4,
                            border: "1px solid " + palette.danger,
                            opacity: 0.85,
                        }}
                    />
                    <span
                        className={`${TEXT_ROLES.secondary} text-foreground/70`}
                    >
                        {t("torrent_modal.stats.missing")}
                    </span>
                </span>
            </div>
        </div>
    );
};
