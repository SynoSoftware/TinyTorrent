import { useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useFocusState } from "@/app/context/AppShellStateContext";
import { useSelection } from "@/app/context/AppShellStateContext";
import { useTorrentCommands } from "@/app/context/AppCommandContext";
import { createGlobalHotkeyBindings } from "@/app/commandRegistry";
import { HOTKEY_COMMAND_ID } from "@/app/commandCatalog";
import { useGlobalHotkeyContext } from "@/app/context/GlobalHotkeyContext";

export function GlobalHotkeysHost() {
    const {
        torrents,
        selectedTorrents,
        detailData,
        handleRequestDetails,
        handleCloseDetail,
    } = useGlobalHotkeyContext();
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
        ]
    );

    const hotkeys = useMemo(
        () =>
            createGlobalHotkeyBindings({
                controller: hotkeyController,
                setSelectedIds,
                setActiveId,
                setActivePart,
            }),
        [
            hotkeyController,
            setSelectedIds,
            setActiveId,
            setActivePart,
        ]
    );

    useHotkeys(
        hotkeys[HOTKEY_COMMAND_ID.SelectAll].keys,
        hotkeys[HOTKEY_COMMAND_ID.SelectAll].handler,
        hotkeys[HOTKEY_COMMAND_ID.SelectAll].options,
        [hotkeys]
    );

    useHotkeys(
        hotkeys[HOTKEY_COMMAND_ID.Remove].keys,
        hotkeys[HOTKEY_COMMAND_ID.Remove].handler,
        hotkeys[HOTKEY_COMMAND_ID.Remove].options,
        [hotkeys]
    );

    useHotkeys(
        hotkeys[HOTKEY_COMMAND_ID.ShowDetails].keys,
        hotkeys[HOTKEY_COMMAND_ID.ShowDetails].handler,
        hotkeys[HOTKEY_COMMAND_ID.ShowDetails].options,
        [hotkeys]
    );

    useHotkeys(
        hotkeys[HOTKEY_COMMAND_ID.ToggleInspector].keys,
        hotkeys[HOTKEY_COMMAND_ID.ToggleInspector].handler,
        hotkeys[HOTKEY_COMMAND_ID.ToggleInspector].options,
        [hotkeys]
    );

    useHotkeys(
        hotkeys[HOTKEY_COMMAND_ID.TogglePause].keys,
        hotkeys[HOTKEY_COMMAND_ID.TogglePause].handler,
        hotkeys[HOTKEY_COMMAND_ID.TogglePause].options,
        [hotkeys]
    );

    useHotkeys(
        hotkeys[HOTKEY_COMMAND_ID.Recheck].keys,
        hotkeys[HOTKEY_COMMAND_ID.Recheck].handler,
        hotkeys[HOTKEY_COMMAND_ID.Recheck].options,
        [hotkeys]
    );

    useHotkeys(
        hotkeys[HOTKEY_COMMAND_ID.RemoveWithData].keys,
        hotkeys[HOTKEY_COMMAND_ID.RemoveWithData].handler,
        hotkeys[HOTKEY_COMMAND_ID.RemoveWithData].options,
        [hotkeys]
    );

    return null;
}

export default GlobalHotkeysHost;

