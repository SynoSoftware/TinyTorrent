import { useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useFocusState } from "@/app/context/AppShellStateContext";
import { useSelection } from "@/app/context/AppShellStateContext";
import { useTorrentCommands } from "@/app/context/AppCommandContext";
import { createGlobalHotkeyBindings } from "@/app/commandRegistry";
import { hotkeyCommandId } from "@/app/commandCatalog";
import type { TorrentEntity as Torrent, TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";

export interface GlobalHotkeysHostProps {
    torrents: Torrent[];
    selectedTorrents: Torrent[];
    detailData: TorrentDetail | null;
    handleRequestDetails: (torrent: Torrent) => Promise<void>;
    handleCloseDetail: () => void;
}

export function GlobalHotkeysHost({
    torrents,
    selectedTorrents,
    detailData,
    handleRequestDetails,
    handleCloseDetail,
}: GlobalHotkeysHostProps) {
    const { selectedIds, activeId, setSelectedIds, setActiveId } = useSelection();
    const { setActivePart } = useFocusState();
    const { handleTorrentAction, handleBulkAction } = useTorrentCommands();

    const hotkeyController = useMemo(
        () => ({
            getState: () => ({
                torrents,
                selectedIds,
                selectedTorrents,
                activeId,
                detailData,
            }),
            handleRequestDetails,
            handleCloseDetail,
            handleBulkAction,
            handleTorrentAction,
        }),
        [
            activeId,
            detailData,
            handleBulkAction,
            handleCloseDetail,
            handleRequestDetails,
            handleTorrentAction,
            selectedIds,
            selectedTorrents,
            torrents,
        ],
    );

    const hotkeys = useMemo(
        () =>
            createGlobalHotkeyBindings({
                controller: hotkeyController,
                setSelectedIds,
                setActiveId,
                setActivePart,
            }),
        [hotkeyController, setSelectedIds, setActiveId, setActivePart],
    );

    useHotkeys(
        hotkeys[hotkeyCommandId.SelectAll].keys,
        hotkeys[hotkeyCommandId.SelectAll].handler,
        hotkeys[hotkeyCommandId.SelectAll].options,
        [hotkeys],
    );

    useHotkeys(
        hotkeys[hotkeyCommandId.Remove].keys,
        hotkeys[hotkeyCommandId.Remove].handler,
        hotkeys[hotkeyCommandId.Remove].options,
        [hotkeys],
    );

    useHotkeys(
        hotkeys[hotkeyCommandId.ShowDetails].keys,
        hotkeys[hotkeyCommandId.ShowDetails].handler,
        hotkeys[hotkeyCommandId.ShowDetails].options,
        [hotkeys],
    );

    useHotkeys(
        hotkeys[hotkeyCommandId.ToggleInspector].keys,
        hotkeys[hotkeyCommandId.ToggleInspector].handler,
        hotkeys[hotkeyCommandId.ToggleInspector].options,
        [hotkeys],
    );

    useHotkeys(
        hotkeys[hotkeyCommandId.TogglePause].keys,
        hotkeys[hotkeyCommandId.TogglePause].handler,
        hotkeys[hotkeyCommandId.TogglePause].options,
        [hotkeys],
    );

    useHotkeys(
        hotkeys[hotkeyCommandId.Recheck].keys,
        hotkeys[hotkeyCommandId.Recheck].handler,
        hotkeys[hotkeyCommandId.Recheck].options,
        [hotkeys],
    );

    useHotkeys(
        hotkeys[hotkeyCommandId.RemoveWithData].keys,
        hotkeys[hotkeyCommandId.RemoveWithData].handler,
        hotkeys[hotkeyCommandId.RemoveWithData].options,
        [hotkeys],
    );

    return null;
}

export default GlobalHotkeysHost;

