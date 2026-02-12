import { useEffect, useRef, useState } from "react";
import type { Row } from "@tanstack/react-table";
import { scheduler } from "@/app/services/scheduler";

type MarqueeRect = { left: number; top: number; width: number; height: number };


interface UseMarqueeParams<TRow> {
    parentRef: React.RefObject<HTMLElement | null>;
    rowHeight: number;
    rowsRef: React.MutableRefObject<Row<TRow>[]>;
    rowIds: string[];
    getBaseSelection: () => Record<string, boolean>;
    previewSelection: (next: Record<string, boolean>) => void;
    commitSelection: (
        next: Record<string, boolean>,
        focusIndex: number | null,
        focusRowId: string | null
    ) => void;
    clearSelection: () => void;
}

export function useMarqueeSelection<TRow>({
    parentRef,
    rowHeight,
    rowsRef,
    rowIds,
    getBaseSelection,
    previewSelection,
    commitSelection,
    clearSelection,
}: UseMarqueeParams<TRow>) {
    const marqueeStateRef = useRef<{
        startClientX: number;
        startClientY: number;
        startContentY: number;
        isAdditive: boolean;
    } | null>(null);
    const marqueeClickBlockRef = useRef(false);
    const isMarqueeDraggingRef = useRef(false);
    const marqueeBlockResetRef = useRef<(() => void) | null>(null);

    const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);

    const pendingSelectionRef = useRef<Record<string, boolean> | null>(null);
    const rafHandleRef = useRef<number | null>(null);

    useEffect(() => {
        const container = parentRef.current;
        if (!container) return;

        const handleMouseDown = (event: MouseEvent) => {
            if (event.button !== 0) return;
            const target = event.target as Element | null;
            if (
                target?.closest("[data-torrent-row]") ||
                target?.closest('[role="row"]')
            ) {
                return;
            }
            const rect = container.getBoundingClientRect();
            const startClientX = event.clientX - rect.left;
            const startClientY = event.clientY - rect.top;
            const startContentY = startClientY + container.scrollTop;

            isMarqueeDraggingRef.current = true;

            marqueeStateRef.current = {
                startClientX,
                startClientY,
                startContentY,
                isAdditive: event.ctrlKey || event.metaKey,
            };
            setMarqueeRect({
                left: startClientX,
                top: startClientY,
                width: 0,
                height: 0,
            });
            event.preventDefault();
        };

        container.addEventListener("mousedown", handleMouseDown);
        return () =>
            container.removeEventListener("mousedown", handleMouseDown);
    }, [parentRef]);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            const state = marqueeStateRef.current;
            const container = parentRef.current;
            if (!state || !container) return;
            const rect = container.getBoundingClientRect();
            const currentClientX = event.clientX - rect.left;
            const currentClientY = event.clientY - rect.top;
            const left = Math.min(state.startClientX, currentClientX);
            const top = Math.min(state.startClientY, currentClientY);
            setMarqueeRect({
                left,
                top,
                width: Math.abs(currentClientX - state.startClientX),
                height: Math.abs(currentClientY - state.startClientY),
            });

            try {
                const scrollTop = container.scrollTop;
                const startContentY = state.startClientY + scrollTop;
                const currentContentY = currentClientY + scrollTop;
                const minY = Math.max(
                    0,
                    Math.min(startContentY, currentContentY)
                );
                const maxY = Math.max(
                    0,
                    Math.max(startContentY, currentContentY)
                );
                const totalHeight = (rowsRef.current?.length || 0) * rowHeight;
                const topContent = Math.max(0, minY);
                const bottomContent = Math.max(0, Math.min(maxY, totalHeight));
                if (bottomContent > topContent) {
                    const firstIndex = Math.floor(topContent / rowHeight);
                    const lastIndex = Math.floor(
                        (bottomContent - 1) / rowHeight
                    );
                    const isAdditive =
                        state.isAdditive || event.shiftKey;
                    const nextSelection: Record<string, boolean> = isAdditive
                        ? { ...getBaseSelection() }
                        : {};
                    const selectionIds = rowIds.slice(
                        firstIndex,
                        lastIndex + 1
                    );
                    for (const id of selectionIds) nextSelection[id] = true;
                    pendingSelectionRef.current = nextSelection;
                    if (rafHandleRef.current === null) {
                        rafHandleRef.current = window.requestAnimationFrame(
                            () => {
                                if (pendingSelectionRef.current) {
                                    previewSelection(
                                        pendingSelectionRef.current
                                    );
                                    pendingSelectionRef.current = null;
                                }
                                rafHandleRef.current = null;
                            }
                        );
                    }
                }
            } catch {
                // ignore
            }
        };

        const handleMouseUp = (event: MouseEvent) => {
            const state = marqueeStateRef.current;
            const container = parentRef.current;
            if (!state || !container) {
                setMarqueeRect(null);
                scheduler.scheduleTimeout(() => {
                    isMarqueeDraggingRef.current = false;
                }, 0);
                return;
            }
            const rect = container.getBoundingClientRect();
            const scrollTop =
                parentRef.current?.scrollTop ?? container.scrollTop ?? 0;
            const endClientY = event.clientY - rect.top;
            const endContentY = endClientY + scrollTop;

            marqueeStateRef.current = null;
            setMarqueeRect(null);

            const availableRows = rowsRef.current;
            if (!availableRows.length) {
                if (!state.isAdditive) {
                    clearSelection();
                }
                return;
            }

            const totalHeight = availableRows.length * rowHeight;
            const minY = Math.min(state.startContentY, endContentY);
            const maxY = Math.max(state.startContentY, endContentY);
            const topContent = Math.max(0, minY);
            const bottomContent = Math.max(0, Math.min(maxY, totalHeight));

            if (bottomContent <= topContent) {
                if (!state.isAdditive) {
                    clearSelection();
                }
                scheduler.scheduleTimeout(() => {
                    isMarqueeDraggingRef.current = false;
                }, 0);
                return;
            }

            const firstIndex = Math.floor(topContent / rowHeight);
            const lastIndex = Math.floor((bottomContent - 1) / rowHeight);

            if (firstIndex > lastIndex) {
                scheduler.scheduleTimeout(() => {
                    isMarqueeDraggingRef.current = false;
                }, 0);
                return;
            }

            const isAdditive = state.isAdditive || event.shiftKey;
            const nextSelection: Record<string, boolean> = isAdditive
                ? { ...getBaseSelection() }
                : {};
            const selectionIds = rowIds.slice(firstIndex, lastIndex + 1);
            for (const id of selectionIds) nextSelection[id] = true;
            const focusIndexValue = Math.max(
                0,
                Math.min(
                    availableRows.length - 1,
                    Math.floor(endContentY / rowHeight)
                )
            );
            const focusRow = availableRows[focusIndexValue];
            const focusRowId = focusRow ? focusRow.id : null;
            commitSelection(nextSelection, focusIndexValue, focusRowId);
            marqueeClickBlockRef.current = true;
            if (marqueeBlockResetRef.current) {
                marqueeBlockResetRef.current();
                marqueeBlockResetRef.current = null;
            }
            marqueeBlockResetRef.current = scheduler.scheduleTimeout(() => {
                marqueeClickBlockRef.current = false;
                marqueeBlockResetRef.current = null;
            }, 0);
            scheduler.scheduleTimeout(() => {
                isMarqueeDraggingRef.current = false;
            }, 0);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
            if (marqueeBlockResetRef.current) {
                marqueeBlockResetRef.current();
                marqueeBlockResetRef.current = null;
            }
            if (rafHandleRef.current !== null) {
                window.cancelAnimationFrame(rafHandleRef.current);
                rafHandleRef.current = null;
            }
        };
    }, [
        parentRef,
        rowIds,
        rowHeight,
        rowsRef,
        getBaseSelection,
        previewSelection,
        commitSelection,
        clearSelection,
    ]);

    return { marqueeRect, marqueeClickBlockRef, isMarqueeDraggingRef };
}
