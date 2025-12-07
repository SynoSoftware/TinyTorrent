export const ShortcutIntent = {
    SelectAll: "action.select_all",
    Delete: "action.delete",
    ShowDetails: "action.show_details",
    TogglePause: "action.toggle_pause",
    Recheck: "action.recheck",
    RemoveWithData: "action.remove_with_data",
} as const;

export type ShortcutIntent =
    (typeof ShortcutIntent)[keyof typeof ShortcutIntent];

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
    [ShortcutIntent.Recheck]: "ctrl+r",
    [ShortcutIntent.RemoveWithData]: "shift+delete",
};
