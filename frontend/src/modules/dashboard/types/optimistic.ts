import type { TorrentStatus } from "@/services/rpc/entities";

export type OptimisticOperation = "moving";

export type OptimisticStatusEntry = {
    state?: TorrentStatus;
    operation?: OptimisticOperation;
};

export type OptimisticStatusMap = Record<string, OptimisticStatusEntry>;
