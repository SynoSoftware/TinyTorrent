// Types-only: canonical torrent intent taxonomy
// TODO: Keep intents stable and implementation-agnostic:
// TODO: - UI components emit intents; a single command bus/dispatcher executes them (EngineAdapter + ShellAgent), not the view itself.
// TODO: - Do not add “RPC extended” or “tinytorrent server mode” semantics here; Transmission RPC is the daemon contract.
// TODO: - If you need new commands, prefer adding them to the command registry (see todo.md item 17) and mapping registry ids -> intents in one place.

export type EnsureTorrentActive = {
    type: "ENSURE_TORRENT_ACTIVE";
    torrentId: string | number;
};

export type EnsureTorrentActiveNow = {
    type: "ENSURE_TORRENT_ACTIVE_NOW";
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

export type EnsureTorrentAtLocation = {
    type: "ENSURE_TORRENT_AT_LOCATION";
    torrentId: string | number;
    path: string;
    moveData?: boolean;
};

export type TorrentAddTracker = {
    type: "TORRENT_ADD_TRACKER";
    torrentIds: Array<string | number>;
    trackers: string[];
};

export type TorrentRemoveTracker = {
    type: "TORRENT_REMOVE_TRACKER";
    torrentIds: Array<string | number>;
    trackerIds: number[];
};

export type TorrentReplaceTrackers = {
    type: "TORRENT_REPLACE_TRACKERS";
    torrentIds: Array<string | number>;
    trackers: string[];
};

export type EnsureSelectionActive = {
    type: "ENSURE_SELECTION_ACTIVE";
    torrentIds: Array<string | number>;
};

export type EnsureSelectionActiveNow = {
    type: "ENSURE_SELECTION_ACTIVE_NOW";
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

export type SetTorrentFilesWanted = {
    type: "SET_TORRENT_FILES_WANTED";
    torrentId: string | number;
    fileIndexes: number[];
    wanted: boolean;
};

export type SetTorrentSequentialDownload = {
    type: "SET_TORRENT_SEQUENTIAL";
    torrentId: string | number;
    enabled: boolean;
};

export type SetTorrentSuperSeeding = {
    type: "SET_TORRENT_SUPERSEEDING";
    torrentId: string | number;
    enabled: boolean;
};

export type AddMagnetTorrent = {
    type: "ADD_MAGNET_TORRENT";
    magnetLink: string;
    downloadDir: string;
    paused: boolean;
};

export type AddTorrentFromFile = {
    type: "ADD_TORRENT_FROM_FILE";
    metainfoBase64: string;
    downloadDir: string;
    paused: boolean;
    filesUnwanted: number[];
    priorityHigh: number[];
    priorityNormal: number[];
    priorityLow: number[];
    sequentialDownload?: boolean;
    skipHashCheck?: boolean;
};

export type FinalizeExistingTorrent = {
    type: "FINALIZE_EXISTING_TORRENT";
    torrentId: string | number;
    downloadDir: string;
    filesUnwanted: number[];
    resume: boolean;
};

export type TorrentIntent =
    | EnsureTorrentActive
    | EnsureTorrentActiveNow
    | EnsureTorrentPaused
    | EnsureTorrentRemoved
    | EnsureTorrentValid
    | EnsureTorrentAtLocation
    | TorrentAddTracker
    | TorrentRemoveTracker
    | TorrentReplaceTrackers
    | EnsureSelectionActive
    | EnsureSelectionActiveNow
    | EnsureSelectionRemoved
    | EnsureSelectionPaused
    | EnsureSelectionValid
    | SetTorrentFilesWanted
    | SetTorrentSequentialDownload
    | SetTorrentSuperSeeding
    | AddMagnetTorrent
    | AddTorrentFromFile
    | FinalizeExistingTorrent;

export type QueueMoveIntent = {
    type: "QUEUE_MOVE";
    torrentId: string | number;
    direction: "up" | "down" | "top" | "bottom";
    steps?: number;
};

export type TorrentIntentExtended = TorrentIntent | QueueMoveIntent;

export const TorrentIntents = {
    ensureActive: (torrentId: string | number): EnsureTorrentActive => ({
        type: "ENSURE_TORRENT_ACTIVE",
        torrentId,
    }),
    ensureActiveNow: (torrentId: string | number): EnsureTorrentActiveNow => ({
        type: "ENSURE_TORRENT_ACTIVE_NOW",
        torrentId,
    }),
    ensurePaused: (torrentId: string | number): EnsureTorrentPaused => ({
        type: "ENSURE_TORRENT_PAUSED",
        torrentId,
    }),
    ensureRemoved: (torrentId: string | number, deleteData?: boolean): EnsureTorrentRemoved => ({
        type: "ENSURE_TORRENT_REMOVED",
        torrentId,
        deleteData,
    }),
    ensureValid: (torrentId: string | number): EnsureTorrentValid => ({
        type: "ENSURE_TORRENT_VALID",
        torrentId,
    }),
    ensureAtLocation: (
        torrentId: string | number,
        path: string,
        options?: {
            moveData?: boolean;
        },
    ): EnsureTorrentAtLocation => ({
        type: "ENSURE_TORRENT_AT_LOCATION",
        torrentId,
        path,
        moveData: options?.moveData,
    }),
    torrentAddTracker: (torrentIds: Array<string | number>, trackers: string[]): TorrentAddTracker => ({
        type: "TORRENT_ADD_TRACKER",
        torrentIds,
        trackers,
    }),
    torrentRemoveTracker: (torrentIds: Array<string | number>, trackerIds: number[]): TorrentRemoveTracker => ({
        type: "TORRENT_REMOVE_TRACKER",
        torrentIds,
        trackerIds,
    }),
    torrentReplaceTrackers: (torrentIds: Array<string | number>, trackers: string[]): TorrentReplaceTrackers => ({
        type: "TORRENT_REPLACE_TRACKERS",
        torrentIds,
        trackers,
    }),
    ensureSelectionActive: (torrentIds: Array<string | number>): EnsureSelectionActive => ({
        type: "ENSURE_SELECTION_ACTIVE",
        torrentIds,
    }),
    ensureSelectionActiveNow: (torrentIds: Array<string | number>): EnsureSelectionActiveNow => ({
        type: "ENSURE_SELECTION_ACTIVE_NOW",
        torrentIds,
    }),
    ensureSelectionRemoved: (torrentIds: Array<string | number>, deleteData?: boolean): EnsureSelectionRemoved => ({
        type: "ENSURE_SELECTION_REMOVED",
        torrentIds,
        deleteData,
    }),
    ensureSelectionPaused: (torrentIds: Array<string | number>): EnsureSelectionPaused => ({
        type: "ENSURE_SELECTION_PAUSED",
        torrentIds,
    }),
    ensureSelectionValid: (torrentIds: Array<string | number>): EnsureSelectionValid => ({
        type: "ENSURE_SELECTION_VALID",
        torrentIds,
    }),
    setFilesWanted: (torrentId: string | number, fileIndexes: number[], wanted: boolean): SetTorrentFilesWanted => ({
        type: "SET_TORRENT_FILES_WANTED",
        torrentId,
        fileIndexes,
        wanted,
    }),
    setSequentialDownload: (torrentId: string | number, enabled: boolean): SetTorrentSequentialDownload => ({
        type: "SET_TORRENT_SEQUENTIAL",
        torrentId,
        enabled,
    }),
    setSuperSeeding: (torrentId: string | number, enabled: boolean): SetTorrentSuperSeeding => ({
        type: "SET_TORRENT_SUPERSEEDING",
        torrentId,
        enabled,
    }),
    queueMove: (
        torrentId: string | number,
        direction: "up" | "down" | "top" | "bottom",
        steps?: number,
    ): QueueMoveIntent => ({
        type: "QUEUE_MOVE",
        torrentId,
        direction,
        steps,
    }),
    addMagnetTorrent: (magnetLink: string, downloadDir: string, paused: boolean): AddMagnetTorrent => ({
        type: "ADD_MAGNET_TORRENT",
        magnetLink,
        downloadDir,
        paused,
    }),
    addTorrentFromFile: (
        metainfoBase64: string,
        downloadDir: string,
        paused: boolean,
        filesUnwanted: number[],
        priorityHigh: number[],
        priorityNormal: number[],
        priorityLow: number[],
        sequentialDownload?: boolean,
        skipHashCheck?: boolean,
    ): AddTorrentFromFile => ({
        type: "ADD_TORRENT_FROM_FILE",
        metainfoBase64,
        downloadDir,
        paused,
        filesUnwanted,
        priorityHigh,
        priorityNormal,
        priorityLow,
        sequentialDownload,
        skipHashCheck,
    }),
    finalizeExistingTorrent: (
        torrentId: string | number,
        downloadDir: string,
        filesUnwanted: number[],
        resume: boolean,
    ): FinalizeExistingTorrent => ({
        type: "FINALIZE_EXISTING_TORRENT",
        torrentId,
        downloadDir,
        filesUnwanted,
        resume,
    }),
} as const;
