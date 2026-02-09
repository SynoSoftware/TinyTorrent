import {
    createContext,
    useContext,
    useMemo,
    type ReactNode,
} from "react";
import type { Torrent } from "@/modules/dashboard/types/torrent";

export type DetailOpenMode = "docked" | "fullscreen";

export interface DetailOpenContextValue {
    disableDetailOpen?: boolean;
    openDetail?: (torrent: Torrent, mode: DetailOpenMode) => void;
}

const DetailOpenContext = createContext<DetailOpenContextValue>({
    disableDetailOpen: false,
});

export function DetailOpenProvider({
    value,
    children,
}: {
    value: DetailOpenContextValue;
    children: ReactNode;
}) {
    const memoized = useMemo(() => value, [value]);
    return (
        <DetailOpenContext.Provider value={memoized}>
            {children}
        </DetailOpenContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDetailOpenContext(): DetailOpenContextValue {
    return useContext(DetailOpenContext);
}
