import type { TorrentTransportStatus } from "@/services/rpc/entities";

export type PeerContextAction = "add_peer" | "ban_ip" | "copy_ip";

export type DetailTab =
    | "general"
    | "content"
    | "pieces"
    | "speed"
    | "peers"
    | "trackers";

export type PeerSortStrategy = string;

export type OptimisticOperation = "moving";

export type OptimisticStatusEntry = {
    state?: TorrentTransportStatus;
    operation?: OptimisticOperation;
};

export type OptimisticStatusMap = Record<string, OptimisticStatusEntry>;
