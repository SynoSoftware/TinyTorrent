import type { TorrentStatus } from "@/services/rpc/entities";

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
    state?: TorrentStatus;
    operation?: OptimisticOperation;
};

export type OptimisticStatusMap = Record<string, OptimisticStatusEntry>;
