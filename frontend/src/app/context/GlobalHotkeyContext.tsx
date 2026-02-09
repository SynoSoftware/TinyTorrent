/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";

export interface GlobalHotkeyContextValue {
    torrents: Torrent[];
    selectedTorrents: Torrent[];
    detailData: TorrentDetail | null;
    handleRequestDetails: (torrent: Torrent) => Promise<void>;
    handleCloseDetail: () => void;
}

const GlobalHotkeyContext = createContext<GlobalHotkeyContextValue | null>(null);

export function GlobalHotkeyProvider({
    value,
    children,
}: {
    value: GlobalHotkeyContextValue;
    children: ReactNode;
}) {
    return (
        <GlobalHotkeyContext.Provider value={value}>
            {children}
        </GlobalHotkeyContext.Provider>
    );
}

export function useGlobalHotkeyContext(): GlobalHotkeyContextValue {
    const context = useContext(GlobalHotkeyContext);
    if (!context) {
        throw new Error(
            "useGlobalHotkeyContext must be used within GlobalHotkeyProvider"
        );
    }
    return context;
}
