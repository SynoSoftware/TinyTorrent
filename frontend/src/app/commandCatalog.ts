import { Shortcuts } from "@/app/controlPlane/shortcuts";

export const commandId = {
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

export type CommandId = (typeof commandId)[keyof typeof commandId];

export type CommandGroupId = "actions" | "filters" | "search" | "context";

interface BasePaletteCommandDefinition {
    id: CommandId;
    group: Exclude<CommandGroupId, "context">;
    titleKey: string;
    descriptionKey: string;
}

export const BASE_PALETTE_COMMANDS = [
    {
        id: commandId.AddTorrent,
        group: "actions",
        titleKey: "command_palette.actions.add_torrent",
        descriptionKey: "command_palette.actions.add_torrent_description",
    },
    {
        id: commandId.AddMagnet,
        group: "actions",
        titleKey: "command_palette.actions.add_magnet",
        descriptionKey: "command_palette.actions.add_magnet_description",
    },
    {
        id: commandId.OpenSettings,
        group: "actions",
        titleKey: "command_palette.actions.open_settings",
        descriptionKey: "command_palette.actions.open_settings_description",
    },
    {
        id: commandId.RefreshTorrents,
        group: "actions",
        titleKey: "command_palette.actions.refresh",
        descriptionKey: "command_palette.actions.refresh_description",
    },
    {
        id: commandId.FocusSearch,
        group: "search",
        titleKey: "command_palette.actions.focus_search",
        descriptionKey: "command_palette.actions.focus_search_description",
    },
    {
        id: commandId.FilterAll,
        group: "filters",
        titleKey: "nav.filter_all",
        descriptionKey: "command_palette.filters.all_description",
    },
    {
        id: commandId.FilterDownloading,
        group: "filters",
        titleKey: "nav.filter_downloading",
        descriptionKey: "command_palette.filters.downloading_description",
    },
    {
        id: commandId.FilterSeeding,
        group: "filters",
        titleKey: "nav.filter_seeding",
        descriptionKey: "command_palette.filters.seeding_description",
    },
] as const satisfies readonly BasePaletteCommandDefinition[];

export type BasePaletteCommandId = (typeof BASE_PALETTE_COMMANDS)[number]["id"];

export const hotkeyCommandId = {
    SelectAll: "selectAll",
    Remove: "remove",
    ShowDetails: "showDetails",
    ToggleInspector: "toggleInspector",
    TogglePause: "togglePause",
    Recheck: "recheck",
    RemoveWithData: "removeWithData",
} as const;

export type HotkeyCommandId =
    (typeof hotkeyCommandId)[keyof typeof hotkeyCommandId];

export const hotkeyShortcuts: Record<HotkeyCommandId, string | string[]> = {
    [hotkeyCommandId.SelectAll]:
        Shortcuts.keymap[Shortcuts.intents.SelectAll],
    [hotkeyCommandId.Remove]: Shortcuts.keymap[Shortcuts.intents.Delete],
    [hotkeyCommandId.ShowDetails]:
        Shortcuts.keymap[Shortcuts.intents.ShowDetails],
    [hotkeyCommandId.ToggleInspector]: "cmd+i,ctrl+i",
    [hotkeyCommandId.TogglePause]:
        Shortcuts.keymap[Shortcuts.intents.TogglePause],
    [hotkeyCommandId.Recheck]: Shortcuts.keymap[Shortcuts.intents.Recheck],
    [hotkeyCommandId.RemoveWithData]:
        Shortcuts.keymap[Shortcuts.intents.RemoveWithData],
};
