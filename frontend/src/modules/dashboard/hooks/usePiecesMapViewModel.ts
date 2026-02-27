import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { scheduler } from "@/app/services/scheduler";
import { formatBytes } from "@/shared/utils/format";
import {
    cancelScheduledFrame, scheduleFrame, useCanvasPalette, clamp, buildPieceGridRows, classifyPieceState, normalizePiecePercent, fitCanvasToContainer, resolveCanvasColor, computePieceMapGeometry, findPieceAtPoint, type FrameHandle, type PieceMapGeometry, type PieceStatus, } from "@/modules/dashboard/hooks/utils/canvasUtils";
import { registry } from "@/config/logic";
const { visualizations } = registry;

export interface PiecesMapProps {
    percent: number;
    pieceCount?: number;
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

const PIECE_STATUS_TRANSLATION_KEYS: Record<PieceStatus, string> = {
    done: "torrent_modal.stats.verified",
    downloading: "torrent_modal.stats.downloading",
    missing: "torrent_modal.stats.missing",
};

export interface PiecesMapViewModel {
    refs: {
        rootRef: RefObject<HTMLDivElement | null>;
        canvasRef: RefObject<HTMLCanvasElement | null>;
        overlayRef: RefObject<HTMLCanvasElement | null>;
    };
    palette: ReturnType<typeof useCanvasPalette>;
    totalPieces: number;
    pieceSizeLabel: string;
    doneCount: number;
    downloadingCount: number;
    missingCount: number;
    hasBinaryPieceStates: boolean;
    tooltipLines: string[];
    tooltipStyle?: { left: number; top: number };
    isDragging: boolean;
    handlers: {
        onMouseMove: (event: ReactMouseEvent<HTMLCanvasElement>) => void;
        onMouseLeave: () => void;
        onMouseDown: (event: ReactMouseEvent<HTMLCanvasElement>) => void;
    };
}

export function usePiecesMapViewModel({
    percent,
    pieceCount,
    pieceStates,
    pieceSize,
}: PiecesMapProps): PiecesMapViewModel {
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const { t } = useTranslation();
    const palette = useCanvasPalette();

    const normalizedPercent = normalizePiecePercent(percent);
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
        Number.isFinite(visualizations.details.pieceMap.columns)
            ? visualizations.details.pieceMap.columns
            : 1
    );
    const gridRows = buildPieceGridRows(totalPieces, columns, {
        base: visualizations.details.pieceMap.rows.base,
        max: visualizations.details.pieceMap.rows.max,
    });

    const pieceStatesLength = pieceStates?.length ?? 0;
    const hasBinaryPieceStates =
        pieceStatesLength >= totalPieces &&
        (pieceStates?.every((value) => value === 0 || value === 1) ?? false);

    const resolvedStates: PieceStatus[] = useMemo(() => {
        if (pieceStates && pieceStates.length >= totalPieces) {
            return pieceStates
                .slice(0, totalPieces)
                .map((value) => classifyPieceState(value, hasBinaryPieceStates));
        }
        const doneUntil = Math.round(totalPieces * normalizedPercent);
        return Array.from({ length: totalPieces }, (_, index) =>
            index < doneUntil ? "done" : "missing"
        );
    }, [pieceStates, totalPieces, normalizedPercent, hasBinaryPieceStates]);

    const doneCount = useMemo(
        () => resolvedStates.filter((status) => status === "done").length,
        [resolvedStates]
    );
    const downloadingCount = useMemo(
        () => resolvedStates.filter((status) => status === "downloading").length,
        [resolvedStates]
    );
    const missingCount = totalPieces - doneCount - downloadingCount;

    const pieceSizeLabel = pieceSize
        ? formatBytes(pieceSize)
        : t("torrent_modal.stats.unknown_size");

    const frameRef = useRef<FrameHandle | null>(null);
    const overlayFrameRef = useRef<FrameHandle | null>(null);
    const retryRef = useRef(0);
    const retryTimeoutRef = useRef<(() => void) | null>(null);

    const [hovered, setHovered] = useState<HoverInfo | null>(null);
    const [hoverPos, setHoverPos] = useState<HoverPosition | null>(null);

    const focusRowRef = useRef(0);
    const targetFocusRowRef = useRef(0);
    const draggingRef = useRef(false);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartYRef = useRef(0);
    const dragStartFocusRef = useRef(0);
    const strengthRef = useRef(1.0);
    const sigmaRef = useRef(6.0);

    const geometryRef = useRef<PieceMapGeometry | null>(null);

    const computeGeometry = useCallback(
        (cssW: number, cssH: number) => {
            geometryRef.current = computePieceMapGeometry({
                cssW,
                cssH,
                columns,
                rows: gridRows,
                focusRow: focusRowRef.current,
                strength: strengthRef.current,
                sigma: sigmaRef.current,
            });
        },
        [columns, gridRows]
    );

    const drawPieces = useCallback(
        (nowMs: number) => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const { cssW, cssH } = fitCanvasToContainer(
                canvas,
                rootRef.current,
                150
            );
            computeGeometry(cssW, cssH);

            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            ctx.clearRect(0, 0, cssW, cssH);
            const geometry = geometryRef.current;
            if (!geometry) return;

            const gap = Math.max(0.5, Math.min(1.25, geometry.cellW * 0.06));
            const wInner = Math.max(1, geometry.cellW - gap);
            const stripeSpeed = 0.02;
            const stripeOffset = (nowMs * stripeSpeed) % 12;

            for (let row = 0; row < gridRows; row++) {
                const y0 = geometry.yStarts[row];
                const y1 = geometry.yStarts[row + 1];
                const hInner = Math.max(1, y1 - y0 - gap);
                const baseIndex = row * columns;
                const tooSmallForDetail = y1 - y0 < 3.5;

                for (let col = 0; col < columns; col++) {
                    const pieceIndex = baseIndex + col;
                    if (pieceIndex >= totalPieces) break;

                    const status = resolvedStates[pieceIndex] ?? "missing";
                    const x = col * geometry.cellW;

                    if (status === "done") {
                        ctx.fillStyle = resolveCanvasColor(palette.success);
                        ctx.fillRect(x, y0, wInner, hInner);
                        continue;
                    }

                    if (status === "missing") {
                        ctx.fillStyle = resolveCanvasColor(palette.foreground);
                        ctx.globalAlpha = 0.16;
                        ctx.fillRect(x, y0, wInner, hInner);
                        ctx.globalAlpha = 1;

                        if (!tooSmallForDetail) {
                            ctx.strokeStyle = resolveCanvasColor(palette.foreground);
                            ctx.globalAlpha = 0.9;
                            ctx.lineWidth = 1;
                            ctx.strokeRect(x + 0.5, y0 + 0.5, wInner - 1, hInner - 1);
                            ctx.globalAlpha = 1;
                        }
                        continue;
                    }

                    ctx.fillStyle = resolveCanvasColor(palette.warning);
                    ctx.fillRect(x, y0, wInner, hInner);

                    if (!tooSmallForDetail) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(x, y0, wInner, hInner);
                        ctx.clip();

                        ctx.strokeStyle = resolveCanvasColor(palette.primary);
                        ctx.globalAlpha = 0.55;
                        ctx.lineWidth = 1;

                        for (
                            let stripe = -hInner;
                            stripe < wInner + hInner;
                            stripe += 6
                        ) {
                            ctx.beginPath();
                            ctx.moveTo(x + stripe + stripeOffset, y0 + hInner);
                            ctx.lineTo(x + stripe + stripeOffset + hInner, y0);
                            ctx.stroke();
                        }

                        ctx.restore();
                        ctx.globalAlpha = 1;
                    }
                }
            }
        },
        [
            columns,
            computeGeometry,
            gridRows,
            palette,
            resolvedStates,
            totalPieces,
        ]
    );

    const drawOverlay = useCallback(() => {
        const overlay = overlayRef.current;
        if (!overlay) return;

        const { cssW, cssH } = fitCanvasToContainer(
            overlay,
            rootRef.current,
            150
        );
        const ctx = overlay.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, cssW, cssH);
        if (!hovered) return;

        const geometry = geometryRef.current;
        if (!geometry) return;

        const y0 = geometry.yStarts[hovered.row];
        const y1 = geometry.yStarts[hovered.row + 1];
        const x0 = hovered.col * geometry.cellW;

        const w = geometry.cellW;
        const h = y1 - y0;

        ctx.strokeStyle = resolveCanvasColor(palette.foreground);
        ctx.globalAlpha = 0.92;
        ctx.lineWidth = 2;
        ctx.strokeRect(x0 + 1, y0 + 1, w - 3, h - 3);

        ctx.strokeStyle = resolveCanvasColor(palette.primary);
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 3, y0 + 3, w - 7, h - 7);
        ctx.globalAlpha = 1;
    }, [hovered, palette.foreground, palette.primary]);

    const scheduleDraw = useCallback(() => {
        if (frameRef.current) cancelScheduledFrame(frameRef.current);
        frameRef.current = scheduleFrame((nowMs) => {
            drawPieces(nowMs);
        });

        if (overlayFrameRef.current) cancelScheduledFrame(overlayFrameRef.current);
        overlayFrameRef.current = scheduleFrame(() => {
            drawOverlay();
        });
    }, [drawPieces, drawOverlay]);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        const attempt = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const dpr = window.devicePixelRatio || 1;
            const cssRect = root.getBoundingClientRect();
            const expectedW = Math.max(1, Math.floor(cssRect.width * dpr));
            const expectedH = Math.max(1, Math.floor(Math.max(cssRect.height, 2) * dpr));

            if (canvas.width !== expectedW || canvas.height !== expectedH) {
                retryRef.current += 1;
                canvas.style.width = `${cssRect.width}px`;
                canvas.style.height = `${Math.max(cssRect.height, 2)}px`;
                canvas.width = expectedW;
                canvas.height = expectedH;
                scheduleDraw();
                if (retryRef.current < 4) {
                    retryTimeoutRef.current = scheduler.scheduleTimeout(
                        attempt,
                        180,
                    );
                }
            } else {
                retryRef.current = 0;
            }
        };

        retryTimeoutRef.current = scheduler.scheduleTimeout(attempt, 120);
        return () => {
            retryTimeoutRef.current?.();
            retryTimeoutRef.current = null;
        };
    }, [scheduleDraw]);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const dy = clamp(event.deltaY, -120, 120);

            if (event.altKey) {
                sigmaRef.current = clamp(sigmaRef.current - dy * 0.03, 3.0, 18.0);
            } else {
                strengthRef.current = clamp(strengthRef.current - dy * 0.004, 0.2, 1.8);
            }

            scheduleDraw();
        };

        root.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            root.removeEventListener("wheel", onWheel as EventListener);
        };
    }, [scheduleDraw]);

    useEffect(() => {
        let raf = 0;

        const tick = () => {
            raf = window.requestAnimationFrame(tick);

            if (draggingRef.current) {
                scheduleDraw();
                return;
            }

            const current = focusRowRef.current;
            const target = targetFocusRowRef.current;
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

    useEffect(() => {
        scheduleDraw();
        const onResize = () => scheduleDraw();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [scheduleDraw]);

    const handleMove = useCallback(
        (event: ReactMouseEvent<HTMLCanvasElement>) => {
            const geometry = geometryRef.current;
            if (!geometry) return;

            const x = event.nativeEvent.offsetX;
            const y = event.nativeEvent.offsetY;
            const hit = findPieceAtPoint(x, y, geometry, columns, totalPieces);

            if (!hit) {
                setHovered(null);
                setHoverPos(null);
                return;
            }

            const status = resolvedStates[hit.index] ?? "missing";
            setHovered({
                pieceIndex: hit.index,
                status,
                row: hit.row,
                col: hit.col,
            });
            setHoverPos({
                x: hit.cell.x,
                y: hit.cell.y,
                width: hit.cell.w,
                height: hit.cell.h,
            });

            targetFocusRowRef.current = hit.row;
            scheduleDraw();
        },
        [columns, resolvedStates, scheduleDraw, totalPieces]
    );

    const handleLeave = useCallback(() => {
        setHovered(null);
        setHoverPos(null);
        scheduleDraw();
    }, [scheduleDraw]);

    const handleDown = useCallback((event: ReactMouseEvent<HTMLCanvasElement>) => {
        draggingRef.current = true;
        setIsDragging(true);
        dragStartYRef.current = event.clientY;
        dragStartFocusRef.current = focusRowRef.current;
    }, []);

    useEffect(() => {
        const onMove = (event: globalThis.MouseEvent) => {
            if (!draggingRef.current) return;

            const root = rootRef.current;
            if (!root) return;

            const rect = root.getBoundingClientRect();
            const y = clamp(event.clientY - rect.top, 0, rect.height);
            const geometry = geometryRef.current;
            const approxRowHeight = geometry
                ? geometry.totalH / Math.max(1, gridRows)
                : rect.height / Math.max(1, gridRows);
            const dy = event.clientY - dragStartYRef.current;

            const nextFocus = dragStartFocusRef.current - dy / Math.max(2, approxRowHeight);
            const underCursorHit =
                geometry &&
                findPieceAtPoint(
                    rect.width * 0.5,
                    y,
                    geometry,
                    columns,
                    totalPieces
                );
            const blended =
                underCursorHit == null
                    ? nextFocus
                    : nextFocus * 0.75 + underCursorHit.row * 0.25;

            focusRowRef.current = clamp(blended, 0, Math.max(0, gridRows - 1));
            targetFocusRowRef.current = focusRowRef.current;
            scheduleDraw();
        };

        const onUp = () => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            setIsDragging(false);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [columns, gridRows, scheduleDraw, totalPieces]);

    useEffect(
        () => () => {
            if (frameRef.current) cancelScheduledFrame(frameRef.current);
            if (overlayFrameRef.current) cancelScheduledFrame(overlayFrameRef.current);
        },
        []
    );

    const tooltipLines = useMemo(() => {
        if (!hovered) return [];
        return [
            t(PIECE_STATUS_TRANSLATION_KEYS[hovered.status]),
            `${t("torrent_modal.stats.piece_index")}: ${hovered.pieceIndex + 1}`,
            t("torrent_modal.piece_map.tooltip_size", { size: pieceSizeLabel }),
        ];
    }, [hovered, pieceSizeLabel, t]);

    const tooltipStyle = useMemo(() => {
        if (!hoverPos) return undefined;
        return { left: hoverPos.x + 12, top: hoverPos.y - 64 };
    }, [hoverPos]);

    return {
        refs: {
            rootRef,
            canvasRef,
            overlayRef,
        },
        palette,
        totalPieces,
        pieceSizeLabel,
        doneCount,
        downloadingCount,
        missingCount,
        hasBinaryPieceStates,
        tooltipLines,
        tooltipStyle,
        isDragging,
        handlers: {
            onMouseMove: handleMove,
            onMouseLeave: handleLeave,
            onMouseDown: handleDown,
        },
    };
}


