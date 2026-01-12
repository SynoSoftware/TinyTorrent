import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";

type SelectionContextValue = {
    selectedIds: string[];
    setSelectedIds: (ids: readonly string[]) => void;
    activeId: string | null;
    setActiveId: (id: string | null) => void;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
    const [selectedIds, setSelectedIdsState] = useState<string[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    const setSelectedIds = useCallback((ids: readonly string[]) => {
        const normalized = Array.from(new Set(ids.filter((id) => Boolean(id))));
        setSelectedIdsState((prev) => {
            if (
                prev.length === normalized.length &&
                prev.every((value, index) => value === normalized[index])
            ) {
                return prev;
            }
            return normalized;
        });
    }, []);

    const value = useMemo(
        () => ({
            selectedIds,
            setSelectedIds,
            activeId,
            setActiveId,
        }),
        [activeId, selectedIds, setSelectedIds]
    );

    return (
        <SelectionContext.Provider value={value}>
            {children}
        </SelectionContext.Provider>
    );
}

export function useSelection() {
    const context = useContext(SelectionContext);
    if (!context) {
        throw new Error("useSelection must be used under SelectionProvider");
    }
    return context;
}
