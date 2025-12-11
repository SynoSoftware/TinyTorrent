import { createContext, type PropsWithChildren, useContext, useMemo, useState } from "react";

export type FocusPart =
    | "table"
    | "inspector"
    | "search"
    | "navbar"
    | "command-palette";

interface FocusContextValue {
    activePart: FocusPart;
    setActivePart: (part: FocusPart) => void;
}

const FocusContext = createContext<FocusContextValue | null>(null);

export function FocusProvider({ children }: PropsWithChildren<unknown>) {
    const [activePart, setActivePart] = useState<FocusPart>("table");
    const value = useMemo(
        () => ({
            activePart,
            setActivePart,
        }),
        [activePart]
    );

    return (
        <FocusContext.Provider value={value}>
            {children}
        </FocusContext.Provider>
    );
}

export function useFocusState() {
    const context = useContext(FocusContext);
    if (!context) {
        throw new Error("useFocusState must be used within a FocusProvider");
    }
    return context;
}

export function useActiveFocusPart() {
    return useFocusState().activePart;
}
