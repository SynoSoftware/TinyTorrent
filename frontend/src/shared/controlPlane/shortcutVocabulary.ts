export const ShortcutIntents = {
    SelectAll: "action.select_all",
    Delete: "action.delete",
    ShowDetails: "action.show_details",
    TogglePause: "action.toggle_pause",
    Recheck: "action.recheck",
    RemoveWithData: "action.remove_with_data",
    QueueMoveTop: "action.queue_move_top",
    QueueMoveUp: "action.queue_move_up",
    QueueMoveDown: "action.queue_move_down",
    QueueMoveBottom: "action.queue_move_bottom",
    NavigateNextTab: "action.navigate_next_tab",
    NavigatePreviousTab: "action.navigate_previous_tab",
    NavigateFirstTab: "action.navigate_first_tab",
    NavigateLastTab: "action.navigate_last_tab",
} as const;

export type ShortcutIntent =
    (typeof ShortcutIntents)[keyof typeof ShortcutIntents];
