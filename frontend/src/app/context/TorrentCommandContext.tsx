import { createContext, useContext } from "react";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";

export interface TorrentCommandAPI {
    handleTorrentAction: (action: TorrentTableAction, torrent: Torrent) => void;
    handleBulkAction: (action: TorrentTableAction) => void;
    openAddTorrentPicker: () => void;
    openAddMagnet: (magnetLink?: string) => void;
}
// TODO: Replace “void commands” with typed outcomes (success/canceled/unsupported/failed) so UI surfaces do not infer results from side-effects or missing errors (see AGENTS.md “Outcomes are data”).
// TODO: Avoid duplicating action mapping logic across AppContent + hooks. This context should be backed by a single action/viewmodel layer that owns dispatch sequencing (see `todo.md` task 13).

const TorrentCommandContext = createContext<TorrentCommandAPI | null>(null);

export const TorrentCommandProvider = TorrentCommandContext.Provider;

export function useTorrentCommands(): TorrentCommandAPI {
    const ctx = useContext(TorrentCommandContext);
    if (!ctx) throw new Error("TorrentCommandContext missing");
    return ctx;
}
