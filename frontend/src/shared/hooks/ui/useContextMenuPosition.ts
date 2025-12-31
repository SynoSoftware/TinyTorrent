import type { RefObject } from "react";
import { useCallback } from "react";

export interface ClampContextMenuOptions {
    menuWidth?: number;
    margin?: number;
}

export interface UseContextMenuPositionOptions {
    containerRef?: RefObject<HTMLElement | null>;
    defaultMargin?: number;
    defaultMenuWidth?: number;
}

export interface ContextMenuVirtualElement {
    x: number;
    y: number;
    getBoundingClientRect: () => DOMRect;
}

const clampValue = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

export const DEFAULT_CONTEXT_MENU_MARGIN = 16;

export const useContextMenuPosition = ({
    containerRef,
    defaultMargin = DEFAULT_CONTEXT_MENU_MARGIN,
    defaultMenuWidth = 0,
}: UseContextMenuPositionOptions = {}) => {
    const clampContextMenuPosition = useCallback(
        (x: number, y: number, options: ClampContextMenuOptions = {}) => {
            const margin = options.margin ?? defaultMargin;
            const menuWidth = options.menuWidth ?? defaultMenuWidth;

            if (containerRef?.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const maxX = Math.max(
                    rect.width - menuWidth - margin,
                    margin
                );
                const maxY = Math.max(rect.height - margin, margin);
                return {
                    x: clampValue(x, margin, maxX),
                    y: clampValue(y, margin, maxY),
                };
            }

            if (typeof window === "undefined") {
                return { x, y };
            }

            const maxX = Math.max(window.innerWidth - margin, margin);
            const maxY = Math.max(window.innerHeight - margin, margin);
            return {
                x: clampValue(x, margin, maxX),
                y: clampValue(y, margin, maxY),
            };
        },
        [containerRef, defaultMargin, defaultMenuWidth]
    );

    const createVirtualElement = useCallback(
        (x: number, y: number, options?: ClampContextMenuOptions) => {
            const { x: clampedX, y: clampedY } =
                clampContextMenuPosition(x, y, options);
            return {
                x: clampedX,
                y: clampedY,
                getBoundingClientRect: () =>
                    ({
                        width: 0,
                        height: 0,
                        top: clampedY,
                        right: clampedX,
                        bottom: clampedY,
                        left: clampedX,
                        x: clampedX,
                        y: clampedY,
                        toJSON: () => {},
                    } as DOMRect),
            };
        },
        [clampContextMenuPosition]
    );

    return { clampContextMenuPosition, createVirtualElement };
};
