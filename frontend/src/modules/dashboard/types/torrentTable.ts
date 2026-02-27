import {
    ShortcutIntents,
    type ShortcutIntent,
} from "@/shared/controlPlane/shortcutVocabulary";

export const torrentTableActions = {
    pause: "pause",
    resume: "resume",
    resumeNow: "resume-now",
    recheck: "recheck",
    remove: "remove",
    removeWithData: "remove-with-data",
    queueMoveTop: "queue-move-top",
    queueMoveUp: "queue-move-up",
    queueMoveDown: "queue-move-down",
    queueMoveBottom: "queue-move-bottom",
} as const;

export type TorrentTableAction =
    (typeof torrentTableActions)[keyof typeof torrentTableActions];
type TorrentTableActionName = keyof typeof torrentTableActions;

type TorrentTableActionMetadata = {
    shortcut?: ShortcutIntent;
    isQueueAction?: true;
};

const {
    TogglePause,
    Recheck,
    Delete,
    RemoveWithData,
    QueueMoveTop,
    QueueMoveUp,
    QueueMoveDown,
    QueueMoveBottom,
} = ShortcutIntents;

export const TorrentTableActionCatalog = {
    pause: {
        shortcut: TogglePause,
    },
    resume: {
        shortcut: TogglePause,
    },
    resumeNow: {},
    recheck: {
        shortcut: Recheck,
    },
    remove: {
        shortcut: Delete,
    },
    removeWithData: {
        shortcut: RemoveWithData,
    },
    queueMoveTop: {
        shortcut: QueueMoveTop,
        isQueueAction: true,
    },
    queueMoveUp: {
        shortcut: QueueMoveUp,
        isQueueAction: true,
    },
    queueMoveDown: {
        shortcut: QueueMoveDown,
        isQueueAction: true,
    },
    queueMoveBottom: {
        shortcut: QueueMoveBottom,
        isQueueAction: true,
    },
} as const satisfies Record<TorrentTableActionName, TorrentTableActionMetadata>;

const torrentTableActionSet = new Set<TorrentTableAction>(
    Object.values(torrentTableActions),
);
const torrentTableActionNameById = Object.fromEntries(
    Object.entries(torrentTableActions).map(([actionName, actionId]) => [
        actionId,
        actionName,
    ]),
) as Record<TorrentTableAction, TorrentTableActionName>;

export const isTorrentTableAction = (
    value: string,
): value is TorrentTableAction => torrentTableActionSet.has(value as TorrentTableAction);

export const getTorrentTableActionShortcutIntent = (
    action: TorrentTableAction,
): ShortcutIntent | undefined => {
    const actionName = torrentTableActionNameById[action];
    const definition = TorrentTableActionCatalog[actionName];
    return "shortcut" in definition ? definition.shortcut : undefined;
};

export const queueTableActions = Object.entries(TorrentTableActionCatalog)
    .flatMap(([actionName, definition]) =>
        "isQueueAction" in definition && definition.isQueueAction
            ? [torrentTableActions[actionName as TorrentTableActionName]]
            : [],
    ) as readonly TorrentTableAction[];

const queueTableActionSet = new Set<TorrentTableAction>(queueTableActions);

export const isQueueTableAction = (
    action: TorrentTableAction,
): action is (typeof queueTableActions)[number] =>
    queueTableActionSet.has(action);
