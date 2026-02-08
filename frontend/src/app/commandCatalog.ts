import { KEYMAP, ShortcutIntent } from "@/config/logic";

export const COMMAND_ID = {
    AddTorrent: "add-torrent",
    AddMagnet: "add-magnet",
    OpenSettings: "open-settings",
    RefreshTorrents: "refresh-torrents",
    FocusSearch: "focus-search",
    FilterAll: "filter-all",
    FilterDownloading: "filter-downloading",
    FilterSeeding: "filter-seeding",
    ContextPauseSelected: "context.pause_selected",
    ContextResumeSelected: "context.resume_selected",
    ContextRecheckSelected: "context.recheck_selected",
    ContextOpenInspector: "context.open_inspector",
    ContextSelectAllFiles: "context.select_all_files",
    ContextResetPeerSort: "context.inspector.reset_peer_sort",
    ContextSortPeersBySpeed: "context.inspector.sort_peers_by_speed",
} as const;

export type CommandId = (typeof COMMAND_ID)[keyof typeof COMMAND_ID];

export type CommandGroupId = "actions" | "filters" | "search" | "context";

interface BasePaletteCommandDefinition {
    id: CommandId;
    group: Exclude<CommandGroupId, "context">;
    titleKey: string;
    descriptionKey: string;
}

export const BASE_PALETTE_COMMANDS = [
    {
        id: COMMAND_ID.AddTorrent,
        group: "actions",
        titleKey: "command_palette.actions.add_torrent",
        descriptionKey: "command_palette.actions.add_torrent_description",
    },
    {
        id: COMMAND_ID.AddMagnet,
        group: "actions",
        titleKey: "command_palette.actions.add_magnet",
        descriptionKey: "command_palette.actions.add_magnet_description",
    },
    {
        id: COMMAND_ID.OpenSettings,
        group: "actions",
        titleKey: "command_palette.actions.open_settings",
        descriptionKey: "command_palette.actions.open_settings_description",
    },
    {
        id: COMMAND_ID.RefreshTorrents,
        group: "actions",
        titleKey: "command_palette.actions.refresh",
        descriptionKey: "command_palette.actions.refresh_description",
    },
    {
        id: COMMAND_ID.FocusSearch,
        group: "search",
        titleKey: "command_palette.actions.focus_search",
        descriptionKey: "command_palette.actions.focus_search_description",
    },
    {
        id: COMMAND_ID.FilterAll,
        group: "filters",
        titleKey: "nav.filter_all",
        descriptionKey: "command_palette.filters.all_description",
    },
    {
        id: COMMAND_ID.FilterDownloading,
        group: "filters",
        titleKey: "nav.filter_downloading",
        descriptionKey: "command_palette.filters.downloading_description",
    },
    {
        id: COMMAND_ID.FilterSeeding,
        group: "filters",
        titleKey: "nav.filter_seeding",
        descriptionKey: "command_palette.filters.seeding_description",
    },
] as const satisfies readonly BasePaletteCommandDefinition[];

export type BasePaletteCommandId = (typeof BASE_PALETTE_COMMANDS)[number]["id"];

export const HOTKEY_COMMAND_ID = {
    SelectAll: "selectAll",
    Remove: "remove",
    ShowDetails: "showDetails",
    ToggleInspector: "toggleInspector",
    TogglePause: "togglePause",
    Recheck: "recheck",
    RemoveWithData: "removeWithData",
} as const;

export type HotkeyCommandId =
    (typeof HOTKEY_COMMAND_ID)[keyof typeof HOTKEY_COMMAND_ID];

export const HOTKEY_SHORTCUTS: Record<HotkeyCommandId, string | string[]> = {
    [HOTKEY_COMMAND_ID.SelectAll]: KEYMAP[ShortcutIntent.SelectAll],
    [HOTKEY_COMMAND_ID.Remove]: KEYMAP[ShortcutIntent.Delete],
    [HOTKEY_COMMAND_ID.ShowDetails]: KEYMAP[ShortcutIntent.ShowDetails],
    [HOTKEY_COMMAND_ID.ToggleInspector]: "cmd+i,ctrl+i",
    [HOTKEY_COMMAND_ID.TogglePause]: KEYMAP[ShortcutIntent.TogglePause],
    [HOTKEY_COMMAND_ID.Recheck]: KEYMAP[ShortcutIntent.Recheck],
    [HOTKEY_COMMAND_ID.RemoveWithData]: KEYMAP[ShortcutIntent.RemoveWithData],
};
