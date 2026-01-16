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
} from "../hooks/utils/canvasUtils";
import type { FrameHandle } from "../hooks/utils/canvasUtils";
import { DETAILS_PIECE_MAP_CONFIG } from "@/config/logic";
import { TEXT_ROLES } from "@/modules/dashboard/hooks/utils/textRoles";

// TODO: Consolidate ad-hoc window events and global debug hooks (see todo.md task 20).
// TODO: This module currently:
// TODO: - mutates `window.__piecesMap*` at module scope (global side-effects)
// TODO: - emits/listens to stringly-typed `CustomEvent("tiny-torrent:...")`
// TODO: Target architecture:
// TODO: - Move event names into a shared `events.ts` (single source of truth) and document who owns dispatch/listen.
// TODO: - Gate debug helpers behind a DEV-only import or a dedicated “debug registry” module so production behavior can’t drift.
// TODO: - Avoid coupling debug triggers to DOM queries (`getElementById`, `querySelector`) without an owning boundary.

// Provide persistent debug helpers on `window` so they exist even if React
// unmounts/remounts the component. These helpers are intentionally
// defined at module scope (browser runtime) rather than inside the
// React component lifecycle so the user can call them from DevTools.
if (typeof window !== "undefined") {
    try {
        (window as any).__piecesMapForceResize = function () {
            try {
                const badge = document.getElementById("pieces-map-debug-badge");
                const root = badge ? badge.parentElement : document.body;
                const canvas = root ? root.querySelector("canvas") : null;
                if (!canvas) return { ok: false, reason: "no-canvas-found" };

                const dpr = window.devicePixelRatio || 1;
                const rect = canvas.getBoundingClientRect();
                const pxW = Math.max(1, Math.floor(rect.width * dpr));
                const pxH = Math.max(
                    1,
                    Math.floor(Math.max(rect.height, 2) * dpr)
                );

                // Force attributes + style then re-read backing store
                canvas.style.width = rect.width + "px";
                canvas.style.height = Math.max(rect.height, 2) + "px";
                canvas.setAttribute("width", String(pxW));
                canvas.setAttribute("height", String(pxH));
                canvas.width = pxW;
                canvas.height = pxH;

                return {
                    ok: true,
                    backing: { w: canvas.width, h: canvas.height },
                    css: { w: rect.width, h: rect.height },
                    dpr,
                };
            } catch (err) {
                return { ok: false, error: String(err) };
            }
        };

        (window as any).__piecesMapPing = function () {
            const badge = document.getElementById("pieces-map-debug-badge");
            if (badge) {
                const now = new Date().toLocaleTimeString();
                badge.textContent = `DEBUG ${now}`;
                return { ok: true, now };
            }
            return { ok: false, reason: "no-badge" };
        };
        // dispatchable trigger: component will listen and call scheduleDraw
        (window as any).__piecesMapTriggerDraw = function () {
            try {
                window.dispatchEvent(
                    new CustomEvent("tiny-torrent:pieces-trigger-draw")
                );
                return { ok: true };
            } catch (e) {
                return { ok: false, error: String(e) };
            }
        };
    } catch (e) {
        // swallow; this file also runs in SSR tooling sometimes
    }
}

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

    let cssW = rect.width;
    let cssH = rect.height;

    // Defensive: if container hasn't been laid out yet, force a sensible minimum
    // to avoid zero-height backing stores which break canvas math during initial mount.
    if (!cssH || cssH < 2) {
        cssH = 150; // fallback semantic minimum; prefer token-derived value if available
    }

    const dpr = window.devicePixelRatio || 1;

    const pxW = Math.max(1, Math.floor(cssW * dpr));
    const pxH = Math.max(1, Math.floor(cssH * dpr));

    // Attempt to set backing store; log before/after and fallback if needed
    try {
        const beforeW = canvas.width;
        const beforeH = canvas.height;
        console.log("PiecesMap.fitCanvasToParent:set", {
            beforeW,
            beforeH,
            pxW,
            pxH,
        });

        if (canvas.width !== pxW) canvas.width = pxW;
        if (canvas.height !== pxH) canvas.height = pxH;

        let afterW = canvas.width;
        let afterH = canvas.height;
        if (afterW !== pxW || afterH !== pxH) {
            console.warn(
                "PiecesMap.fitCanvasToParent: backing store unchanged after assignment",
                {
                    afterW,
                    afterH,
                    expectedW: pxW,
                    expectedH: pxH,
                }
            );

            // Fallback: set inline style and attributes then retry
            try {
                canvas.style.width = cssW + "px";
                canvas.style.height = cssH + "px";
                canvas.setAttribute("width", String(pxW));
                canvas.setAttribute("height", String(pxH));

                canvas.width = pxW;
                canvas.height = pxH;

                afterW = canvas.width;
                afterH = canvas.height;
                if (afterW !== pxW || afterH !== pxH) {
                    console.warn(
                        "PiecesMap.fitCanvasToParent: fallback sizing still didn't match backing store",
                        { afterW, afterH, pxW, pxH }
                    );
                } else {
                    console.log(
                        "PiecesMap.fitCanvasToParent: fallback sizing succeeded",
                        { afterW, afterH }
                    );
                }
            } catch (err2) {
                console.error(
                    "PiecesMap.fitCanvasToParent: error during fallback sizing",
                    err2
                );
            }
        } else {
            console.log("PiecesMap.fitCanvasToParent: backing store updated", {
                afterW,
                afterH,
            });
        }

        console.log("PiecesMap.fitCanvasToParent", {
            node: canvas,
            cssW,
            cssH,
            dpr,
            backingW: canvas.width,
            backingH: canvas.height,
        });
    } catch (err) {
        console.error(
            "PiecesMap.fitCanvasToParent: error setting backing store",
            err
        );
    }

    const backingMatches = canvas.width === pxW && canvas.height === pxH;
    return { cssW: cssW, cssH: cssH, dpr, backingMatches };
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
        const rootStyles = getComputedStyle(document.documentElement);
        const bodyStyles = getComputedStyle(document.body);
        let resolved = rootStyles.getPropertyValue(name).trim();
        if (!resolved) resolved = bodyStyles.getPropertyValue(name).trim();
        return normalizeCanvasColor(resolved);
    }

    // ---- draw helpers ----
    const draw = useCallback(
        (nowMs: number) => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            // Debug entry
            try {
                console.log("PiecesMap.draw called", { nowMs });
            } catch (e) {}

            const { cssW, cssH, backingMatches } = fitCanvasToParent(
                canvas,
                rootRef.current
            );
            computeGeometry(cssW, cssH);
            try {
                console.log("PiecesMap.computeGeometryResult", geomRef.current);
            } catch (e) {}

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                console.error("PiecesMap: 2D context missing");
                return;
            }

            // Debug: resolved palette colors
            try {
                console.log("PiecesMap.palette", {
                    success: resolveCssColor(palette.success),
                    warning: resolveCssColor(palette.warning),
                    primary: resolveCssColor(palette.primary),
                    content1: resolveCssColor(palette.content1),
                    danger: resolveCssColor(palette.danger),
                    foreground: resolveCssColor(palette.foreground),
                });
            } catch (e) {}

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
                    const status = resolvedStates[pieceIndex] ?? "missing";
                    const x = col * g.cellW;

                    if (status === "done") {
                        ctx.fillStyle = resolveCssColor(palette.success);

                        ctx.fillRect(x, y0, wInner, hInner);
                        continue;
                    }

                    if (status === "missing") {
                        // Use foreground with low alpha so "missing" pieces are
                        // visible on dark themes (avoid relying on content1 token)
                        ctx.fillStyle = resolveCssColor(palette.foreground);

                        ctx.globalAlpha = 0.16;
                        ctx.fillRect(x, y0, wInner, hInner);
                        ctx.globalAlpha = 0.16;

                        // outline using foreground to ensure contrast on any theme
                        if (!tooSmallForDetail) {
                            ctx.strokeStyle = resolveCssColor(
                                palette.foreground
                            );
                            ctx.globalAlpha = 0.9;
                            ctx.lineWidth = 1;
                            ctx.strokeRect(
                                x + 0.5,
                                y0 + 0.5,
                                wInner - 1,
                                hInner - 1
                            );
                            ctx.globalAlpha = 1;
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

        try {
            console.log("PiecesMap.drawOverlay");
        } catch (e) {}

        const { cssW, cssH, backingMatches } = fitCanvasToParent(
            overlay,
            rootRef.current
        );
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
        // Debug: scheduling a draw
        try {
            console.log("PiecesMap.scheduleDraw");
        } catch (e) {}

        if (frameRef.current) cancelScheduledFrame(frameRef.current);
        frameRef.current = scheduleFrame((nowMs: number) => {
            animTRef.current = nowMs;
            draw(nowMs);
        });

        if (overlayFrameRef.current)
            cancelScheduledFrame(overlayFrameRef.current);
        overlayFrameRef.current = scheduleFrame(() => drawOverlay());
    }, [draw, drawOverlay]);

    // If the backing store isn't matching, retry a few times after short delays.
    const retryRef = useRef(0);
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        const attempt = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const dpr = window.devicePixelRatio || 1;
            const cssRect = root.getBoundingClientRect();
            const expectedW = Math.max(1, Math.floor(cssRect.width * dpr));
            const expectedH = Math.max(
                1,
                Math.floor(Math.max(cssRect.height, 2) * dpr)
            );

            if (canvas.width !== expectedW || canvas.height !== expectedH) {
                retryRef.current += 1;
                console.log(
                    "PiecesMap.retrySizing: attempt",
                    retryRef.current,
                    {
                        expectedW,
                        expectedH,
                        currentW: canvas.width,
                        currentH: canvas.height,
                    }
                );
                try {
                    canvas.style.width = cssRect.width + "px";
                    canvas.style.height = Math.max(cssRect.height, 2) + "px";
                    canvas.setAttribute("width", String(expectedW));
                    canvas.setAttribute("height", String(expectedH));
                    canvas.width = expectedW;
                    canvas.height = expectedH;
                } catch (e) {
                    console.error(
                        "PiecesMap.retrySizing: error forcing size",
                        e
                    );
                }
                scheduleDraw();
                if (retryRef.current < 4) setTimeout(attempt, 180);
            } else {
                if (retryRef.current > 0)
                    console.log("PiecesMap.retrySizing: succeeded", {
                        attempts: retryRef.current,
                    });
                retryRef.current = 0;
            }
        };

        const id = setTimeout(attempt, 120);
        return () => clearTimeout(id);
    }, [scheduleDraw]);

    // Listen for an external trigger to force a draw (useful from DevTools)
    useEffect(() => {
        const handler = () => {
            try {
                console.log(
                    "PiecesMap: received external trigger -> scheduleDraw"
                );
                scheduleDraw();
            } catch (e) {
                console.error("PiecesMap: error handling external trigger", e);
            }
        };

        window.addEventListener(
            "tiny-torrent:pieces-trigger-draw",
            handler as EventListener
        );
        return () =>
            window.removeEventListener(
                "tiny-torrent:pieces-trigger-draw",
                handler as EventListener
            );
    }, [scheduleDraw]);

    // Attach a non-passive native wheel listener so we can call preventDefault().
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        const onWheel = (ev: WheelEvent) => {
            ev.preventDefault();

            const dy = clamp(ev.deltaY, -120, 120);

            if (ev.altKey) {
                sigmaRef.current = clamp(
                    sigmaRef.current - dy * 0.03,
                    3.0,
                    18.0
                );
            } else {
                strengthRef.current = clamp(
                    strengthRef.current - dy * 0.004,
                    0.2,
                    1.8
                );
            }

            scheduleDraw();
        };

        root.addEventListener("wheel", onWheel, { passive: false });
        return () =>
            root.removeEventListener("wheel", onWheel as EventListener);
    }, [scheduleDraw]);

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

            // Debug hit-test
            try {
                console.log("PiecesMap.handleMove hit", {
                    x,
                    y,
                    hit,
                    status: resolvedStates[hit.index],
                });
            } catch (err) {}
            const status = resolvedStates[hit.index] ?? "missing";
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

    // wheel handling is attached as a native, non-passive listener below

    // ---- minimal “2025” affordance: cursor changes for drag ----
    const cursor = draggingRef.current ? "grabbing" : "grab";

    // Expose a debug helper on window for quick inspection from DevTools
    useEffect(() => {
        const helper = () => {
            const canvas = canvasRef.current;
            const overlay = overlayRef.current;
            const geom = geomRef.current;
            return {
                cssSize: canvas
                    ? { w: canvas.clientWidth, h: canvas.clientHeight }
                    : null,
                backingSize: canvas
                    ? { w: canvas.width, h: canvas.height }
                    : null,
                geom,
                totalPieces,
                doneCount,
                downloadingCount,
                missingCount,
                resolvedStatesSample: resolvedStates.slice(0, 32),
            };
        };

        (window as any).__piecesMapDebug = helper;
        console.log(
            "PiecesMap: debug helper available as window.__piecesMapDebug()"
        );
        return () => {
            try {
                delete (window as any).__piecesMapDebug;
            } catch (e) {}
        };
    }, [
        totalPieces,
        doneCount,
        downloadingCount,
        missingCount,
        resolvedStates,
    ]);

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

                    {/* DEBUG: visible DOM badge so user can confirm debugging code runs */}
                    <div
                        id="pieces-map-debug-badge"
                        className="absolute left-3 top-3 z-50 px-3 py-1 rounded-lg text-xs font-semibold"
                        style={{
                            background: "rgba(255,20,60,0.14)",
                            color: "#ff5c7a",
                            border: "1px solid rgba(255,20,60,0.28)",
                        }}
                    >
                        DEBUG PIECES MAP
                    </div>

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
                            {t("torrent_modal.piece_map.hint_interact")}
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
                            background: palette.foreground,
                            display: "inline-block",
                            borderRadius: 4,
                            border: "1px solid " + palette.danger,
                            opacity: 0.2,
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
