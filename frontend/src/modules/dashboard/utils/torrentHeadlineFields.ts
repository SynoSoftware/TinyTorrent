export type TorrentHeadlineSurface = "table" | "summary";

export type TorrentHeadlineFieldId =
    | "name"
    | "progress"
    | "status"
    | "health"
    | "queue"
    | "eta"
    | "speed"
    | "peers"
    | "size"
    | "added"
    | "completedOn"
    | "uploadingTo"
    | "downloadingFrom";

export interface TorrentHeadlineFieldDefinition {
    id: TorrentHeadlineFieldId;
    surfaces: readonly TorrentHeadlineSurface[];
    tableLabelKey?: string;
    summaryLabelKey?: string;
}

const defineField = (
    id: TorrentHeadlineFieldId,
    surfaces: readonly TorrentHeadlineSurface[],
    labels: {
        tableLabelKey?: string;
        summaryLabelKey?: string;
    },
): TorrentHeadlineFieldDefinition => ({
    id,
    surfaces,
    ...labels,
});

export const torrentHeadlineFields = {
    name: defineField("name", ["table", "summary"], {
        tableLabelKey: "table.header_name",
        summaryLabelKey: "torrent_modal.general.fields.name",
    }),
    progress: defineField("progress", ["table", "summary"], {
        tableLabelKey: "table.header_progress",
        summaryLabelKey: "torrent_modal.general.fields.progress",
    }),
    status: defineField("status", ["table", "summary"], {
        tableLabelKey: "table.header_status",
        summaryLabelKey: "torrent_modal.general.fields.status",
    }),
    health: defineField("health", ["table"], {
        tableLabelKey: "table.header_health",
    }),
    queue: defineField("queue", ["table", "summary"], {
        tableLabelKey: "table.header_queue",
        summaryLabelKey: "torrent_modal.general.fields.queue_position",
    }),
    eta: defineField("eta", ["table", "summary"], {
        tableLabelKey: "table.header_eta",
        summaryLabelKey: "torrent_modal.general.fields.eta",
    }),
    speed: defineField("speed", ["table", "summary"], {
        tableLabelKey: "table.header_speed",
        summaryLabelKey: "torrent_modal.general.fields.speed",
    }),
    peers: defineField("peers", ["table", "summary"], {
        tableLabelKey: "table.header_peers",
        summaryLabelKey: "torrent_modal.general.fields.peers",
    }),
    size: defineField("size", ["table", "summary"], {
        tableLabelKey: "table.header_size",
        summaryLabelKey: "torrent_modal.general.fields.size",
    }),
    added: defineField("added", ["table", "summary"], {
        tableLabelKey: "table.header_added",
        summaryLabelKey: "torrent_modal.general.fields.time_added",
    }),
    completedOn: defineField("completedOn", ["table"], {
        tableLabelKey: "table.header_completed_on",
    }),
    uploadingTo: defineField("uploadingTo", ["summary"], {
        summaryLabelKey: "torrent_modal.general.fields.peers_uploading_to",
    }),
    downloadingFrom: defineField("downloadingFrom", ["summary"], {
        summaryLabelKey: "torrent_modal.general.fields.peers_downloading_from",
    }),
} as const satisfies Record<TorrentHeadlineFieldId, TorrentHeadlineFieldDefinition>;

export const torrentHeadlineOrder: TorrentHeadlineFieldId[] = [
    "name",
    "speed",
    "queue",
    "peers",
    "uploadingTo",
    "downloadingFrom",
    "size",
    "status",
    "eta",
    "progress",
    "added",
];
