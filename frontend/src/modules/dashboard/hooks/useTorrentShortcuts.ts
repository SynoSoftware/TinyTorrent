import { useHotkeys } from "react-hotkeys-hook";
import type { Torrent } from "../types/torrent";
import type { TorrentTableAction } from "../components/TorrentTable";
import { KEYMAP, ShortcutIntent } from "../../../config/keymap";

interface UseTorrentShortcutsProps {
    scope: string;
    selectedTorrents: Torrent[];
    selectAll: () => void;
    onAction?: (action: TorrentTableAction, torrent: Torrent) => void;
    onRequestDetails?: (torrent: Torrent) => void;
}

export function useTorrentShortcuts({
    scope,
    selectedTorrents,
    selectAll,
    onAction,
    onRequestDetails,
}: UseTorrentShortcutsProps) {
    const hasSelection = selectedTorrents.length > 0;
    const primaryTorrent = selectedTorrents[0];
    const hasPrimaryTorrent = Boolean(primaryTorrent);
    const isActiveTorrent =
        primaryTorrent &&
        ["downloading", "seeding"].includes(primaryTorrent.state);

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
            if (!onAction || !hasSelection) return;
            selectedTorrents.forEach((torrent) => {
                onAction("remove", torrent);
            });
        },
        { scopes: scope, enabled: hasSelection && Boolean(onAction) },
        [hasSelection, onAction, selectedTorrents]
    );

    useHotkeys(
        KEYMAP[ShortcutIntent.ShowDetails],
        (event) => {
            event.preventDefault();
            if (primaryTorrent && onRequestDetails) {
                onRequestDetails(primaryTorrent);
            }
        },
        { scopes: scope, enabled: hasPrimaryTorrent && Boolean(onRequestDetails) },
        [primaryTorrent, onRequestDetails]
    );

    useHotkeys(
        KEYMAP[ShortcutIntent.TogglePause],
        (event) => {
            event.preventDefault();
            if (!onAction || !primaryTorrent) return;
            const nextAction: TorrentTableAction = isActiveTorrent
                ? "pause"
                : "resume";
            onAction(nextAction, primaryTorrent);
        },
        { scopes: scope, enabled: hasPrimaryTorrent && Boolean(onAction) },
        [primaryTorrent, isActiveTorrent, onAction]
    );

    useHotkeys(
        KEYMAP[ShortcutIntent.Recheck],
        (event) => {
            event.preventDefault();
            if (!onAction || !hasSelection) return;
            selectedTorrents.forEach((torrent) => {
                onAction("recheck", torrent);
            });
        },
        { scopes: scope, enabled: hasSelection && Boolean(onAction) },
        [hasSelection, onAction, selectedTorrents]
    );

    useHotkeys(
        KEYMAP[ShortcutIntent.RemoveWithData],
        (event) => {
            event.preventDefault();
            if (!onAction || !hasSelection) return;
            selectedTorrents.forEach((torrent) => {
                onAction("remove-with-data", torrent);
            });
        },
        { scopes: scope, enabled: hasSelection && Boolean(onAction) },
        [hasSelection, onAction, selectedTorrents]
    );
}
