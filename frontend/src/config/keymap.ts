export enum ShortcutIntent {
    SelectAll = "action.select_all",
    Delete = "action.delete",
    ShowDetails = "action.show_details",
    TogglePause = "action.toggle_pause",
}

export const KEY_SCOPE = {
    Dashboard: "dashboard",
    Modal: "modal",
    Settings: "settings",
} as const;

export const KEYMAP: Record<ShortcutIntent, string | string[]> = {
    [ShortcutIntent.SelectAll]: ["ctrl+a", "meta+a"],
    [ShortcutIntent.Delete]: ["delete", "backspace"],
    [ShortcutIntent.ShowDetails]: ["enter"],
    [ShortcutIntent.TogglePause]: ["space"],
};
