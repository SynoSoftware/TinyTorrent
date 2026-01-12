// Types-only: canonical Phase-3 torrent intent taxonomy

export type EnsureTorrentActive = {
    type: "ENSURE_TORRENT_ACTIVE";
    torrentId: string | number;
};

export type EnsureTorrentPaused = {
    type: "ENSURE_TORRENT_PAUSED";
    torrentId: string | number;
};

export type EnsureTorrentRemoved = {
    type: "ENSURE_TORRENT_REMOVED";
    torrentId: string | number;
    deleteData?: boolean;
};

export type EnsureTorrentValid = {
    type: "ENSURE_TORRENT_VALID";
    torrentId: string | number;
};

export type EnsureTorrentRecoverable = {
    type: "ENSURE_TORRENT_RECOVERABLE";
    torrentId: string | number;
};

export type EnsureTorrentAtLocation = {
    type: "ENSURE_TORRENT_AT_LOCATION";
    torrentId: string | number;
    path: string;
    recreate?: boolean;
};

export type EnsureTorrentDataPresent = {
    type: "ENSURE_TORRENT_DATA_PRESENT";
    torrentId: string | number;
    recreate?: boolean;
};

export type EnsureTorrentAnnounced = {
    type: "ENSURE_TORRENT_ANNOUNCED";
    torrentId: string | number;
};

export type EnsureSelectionActive = {
    type: "ENSURE_SELECTION_ACTIVE";
    torrentIds: Array<string | number>;
};

export type EnsureSelectionRemoved = {
    type: "ENSURE_SELECTION_REMOVED";
    torrentIds: Array<string | number>;
    deleteData?: boolean;
};

export type EnsureSelectionPaused = {
    type: "ENSURE_SELECTION_PAUSED";
    torrentIds: Array<string | number>;
};

export type EnsureSelectionValid = {
    type: "ENSURE_SELECTION_VALID";
    torrentIds: Array<string | number>;
};

export type OpenTorrentFolder = {
    type: "OPEN_TORRENT_FOLDER";
    torrentId: string | number;
};

export type TorrentIntent =
    | EnsureTorrentActive
    | EnsureTorrentPaused
    | EnsureTorrentRemoved
    | EnsureTorrentValid
    | EnsureTorrentRecoverable
    | EnsureTorrentAtLocation
    | EnsureTorrentDataPresent
    | EnsureTorrentAnnounced
    | EnsureSelectionActive
    | EnsureSelectionRemoved
    | EnsureSelectionPaused
    | EnsureSelectionValid
    | OpenTorrentFolder;

export type QueueMoveIntent = {
    type: "QUEUE_MOVE";
    torrentId: string | number;
    direction: "up" | "down" | "top" | "bottom";
    steps?: number;
};

export type TorrentIntentExtended = TorrentIntent | QueueMoveIntent;

export type RecoveryState = null | {
    /* placeholder */
};

export const TorrentIntents = {
    ensureActive: (torrentId: string | number): EnsureTorrentActive => ({
        type: "ENSURE_TORRENT_ACTIVE",
        torrentId,
    }),
    ensurePaused: (torrentId: string | number): EnsureTorrentPaused => ({
        type: "ENSURE_TORRENT_PAUSED",
        torrentId,
    }),
    ensureRemoved: (
        torrentId: string | number,
        deleteData?: boolean
    ): EnsureTorrentRemoved => ({
        type: "ENSURE_TORRENT_REMOVED",
        torrentId,
        deleteData,
    }),
    ensureValid: (torrentId: string | number): EnsureTorrentValid => ({
        type: "ENSURE_TORRENT_VALID",
        torrentId,
    }),
    ensureRecoverable: (
        torrentId: string | number
    ): EnsureTorrentRecoverable => ({
        type: "ENSURE_TORRENT_RECOVERABLE",
        torrentId,
    }),
    ensureAtLocation: (
        torrentId: string | number,
        path: string,
        recreate?: boolean
    ): EnsureTorrentAtLocation => ({
        type: "ENSURE_TORRENT_AT_LOCATION",
        torrentId,
        path,
        recreate,
    }),
    ensureDataPresent: (
        torrentId: string | number,
        recreate?: boolean
    ): EnsureTorrentDataPresent => ({
        type: "ENSURE_TORRENT_DATA_PRESENT",
        torrentId,
        recreate,
    }),
    ensureAnnounced: (torrentId: string | number): EnsureTorrentAnnounced => ({
        type: "ENSURE_TORRENT_ANNOUNCED",
        torrentId,
    }),
    ensureSelectionActive: (
        torrentIds: Array<string | number>
    ): EnsureSelectionActive => ({
        type: "ENSURE_SELECTION_ACTIVE",
        torrentIds,
    }),
    ensureSelectionRemoved: (
        torrentIds: Array<string | number>,
        deleteData?: boolean
    ): EnsureSelectionRemoved => ({
        type: "ENSURE_SELECTION_REMOVED",
        torrentIds,
        deleteData,
    }),
    ensureSelectionPaused: (
        torrentIds: Array<string | number>
    ): EnsureSelectionPaused => ({
        type: "ENSURE_SELECTION_PAUSED",
        torrentIds,
    }),
    ensureSelectionValid: (
        torrentIds: Array<string | number>
    ): EnsureSelectionValid => ({
        type: "ENSURE_SELECTION_VALID",
        torrentIds,
    }),
    openTorrentFolder: (torrentId: string | number): OpenTorrentFolder => ({
        type: "OPEN_TORRENT_FOLDER",
        torrentId,
    }),
    queueMove: (
        torrentId: string | number,
        direction: "up" | "down" | "top" | "bottom",
        steps?: number
    ): QueueMoveIntent => ({
        type: "QUEUE_MOVE",
        torrentId,
        direction,
        steps,
    }),
} as const;
