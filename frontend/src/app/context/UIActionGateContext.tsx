import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";
import type { ReactNode } from "react";

type UIActionGateReadValue = {
    isRemoved: (id?: string | null) => boolean;
};

type UIActionGateControllerValue = {
    markRemoved: (id: string) => void;
    unmarkRemoved: (id: string) => void;
};

const UIActionGateReadContext = createContext<UIActionGateReadValue | null>(
    null
);
const UIActionGateControllerContext =
    createContext<UIActionGateControllerValue | null>(null);
// TODO: Fold this gate into the orchestrator/view-model layer (with recovery/selection) to avoid a separate context for removed state.

export function UIActionGateProvider({ children }: { children: ReactNode }) {
    const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());

    const markRemoved = useCallback((id: string) => {
        setRemovedIds((prev) => {
            if (prev.has(id)) return prev;
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    }, []);

    const unmarkRemoved = useCallback((id: string) => {
        setRemovedIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, []);

    const isRemoved = useCallback(
        (id?: string | null) => Boolean(id && removedIds.has(id)),
        [removedIds]
    );

    const readValue = useMemo(() => ({ isRemoved }), [isRemoved]);
    const controllerValue = useMemo(
        () => ({ markRemoved, unmarkRemoved }),
        [markRemoved, unmarkRemoved]
    );

    return (
        <UIActionGateReadContext.Provider value={readValue}>
            <UIActionGateControllerContext.Provider value={controllerValue}>
                {children}
            </UIActionGateControllerContext.Provider>
        </UIActionGateReadContext.Provider>
    );
}

export function useUIActionGate() {
    const context = useContext(UIActionGateReadContext);
    if (!context) {
        throw new Error(
            "useUIActionGate must be used within a UIActionGateProvider"
        );
    }
    return context;
}

export function useUIActionGateController() {
    const context = useContext(UIActionGateControllerContext);
    if (!context) {
        throw new Error(
            "useUIActionGateController must be used within a UIActionGateProvider"
        );
    }
    return context;
}
