import { useCallback, useRef, useState } from "react";

export const ANIMATION_SUPPRESSION_KEYS = {
    autoFit: "auto-fit",
    autoFitAll: "auto-fit-all",
    panelResize: "panel-resize",
    rowDrag: "row-drag",
    queueReorder: "queue-reorder",
} as const;

export type AnimationSuppressionKey =
    (typeof ANIMATION_SUPPRESSION_KEYS)[keyof typeof ANIMATION_SUPPRESSION_KEYS];

export const useTableAnimationGuard = () => {
    const keysRef = useRef(new Set<AnimationSuppressionKey>());
    const [activeCount, setActiveCount] = useState(0);

    const begin = useCallback((key: AnimationSuppressionKey) => {
        const keys = keysRef.current;
        if (keys.has(key)) return;
        keys.add(key);
        setActiveCount(keys.size);
    }, []);

    const end = useCallback((key: AnimationSuppressionKey) => {
        const keys = keysRef.current;
        if (!keys.has(key)) return;
        keys.delete(key);
        setActiveCount(keys.size);
    }, []);

    const clear = useCallback(() => {
        keysRef.current.clear();
        setActiveCount(0);
    }, []);

    return {
        isSuppressed: activeCount > 0,
        begin,
        end,
        clear,
    };
};

export default useTableAnimationGuard;
