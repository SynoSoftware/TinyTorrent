import { useHotkeys } from "react-hotkeys-hook";
import { useTorrentActionsContext } from "@/app/context/TorrentActionsContext";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import { KEYMAP, ShortcutIntent } from "@/config/logic";
import STATUS from "@/shared/status";

interface UseTorrentShortcutsProps {
    scope: string;
    selectedTorrents: Torrent[];
    selectAll: () => void;
    onRequestDetails?: (torrent: Torrent) => void;
}

export function useTorrentShortcuts({
    scope,
    selectedTorrents,
    selectAll,
    onRequestDetails,
}: UseTorrentShortcutsProps) {
    const actions = useTorrentActionsContext();
    const dispatch = actions.dispatch;
    const hasSelection = selectedTorrents.length > 0;
    const primaryTorrent = selectedTorrents[0];
    const hasPrimaryTorrent = Boolean(primaryTorrent);
    const isActiveTorrent =
        primaryTorrent &&
        (primaryTorrent.state === STATUS.torrent.DOWNLOADING ||
            primaryTorrent.state === STATUS.torrent.SEEDING);

    useHotkeys(
        KEYMAP[ShortcutIntent.SelectAll],
        (event) => {
            event.preventDefault();
            selectAll();
        },
        { scopes: scope },
        [selectAll]
    );

    useHotkeys(
        KEYMAP[ShortcutIntent.Delete],
        (event) => {
            event.preventDefault();
            if (!dispatch || !hasSelection) return;
            // Use selection-level intent when possible
            void dispatch(
                TorrentIntents.ensureSelectionRemoved(
                    selectedTorrents.map((t) => t.id ?? t.hash),
                    false
                )
            );
        },
        {
            scopes: scope,
            enabled: hasSelection && Boolean(dispatch),
        },
        [hasSelection, dispatch, selectedTorrents]
    );

    useHotkeys(
        KEYMAP[ShortcutIntent.ShowDetails],
        (event) => {
            event.preventDefault();
            if (primaryTorrent && onRequestDetails) {
                onRequestDetails(primaryTorrent);
            }
        },
        {
            scopes: scope,
            enabled: hasPrimaryTorrent && Boolean(onRequestDetails),
        },
        [primaryTorrent, onRequestDetails]
    );

    useHotkeys(
        KEYMAP[ShortcutIntent.TogglePause],
        (event) => {
            event.preventDefault();
            if (!dispatch || !primaryTorrent) return;
            if (isActiveTorrent) {
                void dispatch(
                    TorrentIntents.ensurePaused(
                        primaryTorrent.id ?? primaryTorrent.hash
                    )
                );
            } else {
                void dispatch(
                    TorrentIntents.ensureActive(
                        primaryTorrent.id ?? primaryTorrent.hash
                    )
                );
            }
        },
        { scopes: scope, enabled: hasPrimaryTorrent && Boolean(dispatch) },
        [primaryTorrent, isActiveTorrent, dispatch]
    );

    useHotkeys(
        KEYMAP[ShortcutIntent.Recheck],
        (event) => {
            event.preventDefault();
            if (!dispatch || !hasSelection) return;
            void dispatch(
                TorrentIntents.ensureSelectionActive(
                    selectedTorrents.map(
                        (torrent) => torrent.id ?? torrent.hash
                    )
                )
            );
        },
        { scopes: scope, enabled: hasSelection && Boolean(dispatch) },
        [hasSelection, dispatch, selectedTorrents]
    );

    useHotkeys(
        KEYMAP[ShortcutIntent.RemoveWithData],
        (event) => {
            event.preventDefault();
            if (!dispatch || !hasSelection) return;
            void dispatch(
                TorrentIntents.ensureSelectionRemoved(
                    selectedTorrents.map((t) => t.id ?? t.hash),
                    true
                )
            );
        },
        {
            scopes: scope,
            enabled: hasSelection && Boolean(dispatch),
        },
        [hasSelection, dispatch, selectedTorrents]
    );
}
