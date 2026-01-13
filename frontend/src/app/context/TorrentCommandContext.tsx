import { createContext, useContext } from "react";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";

export interface TorrentCommandAPI {
    handleTorrentAction: (action: TorrentTableAction, torrent: Torrent) => void;
    handleBulkAction: (action: TorrentTableAction) => void;
    openAddTorrentPicker: () => void;
    openAddMagnet: (magnetLink?: string) => void;
}

const TorrentCommandContext = createContext<TorrentCommandAPI | null>(null);

export const TorrentCommandProvider = TorrentCommandContext.Provider;

export function useTorrentCommands(): TorrentCommandAPI {
    const ctx = useContext(TorrentCommandContext);
    if (!ctx) throw new Error("TorrentCommandContext missing");
    return ctx;
}
