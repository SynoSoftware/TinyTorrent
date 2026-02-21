import type { TorrentStatus } from "@/services/rpc/entities";
import type { TorrentOperationState } from "@/shared/status";

export type OptimisticStatusEntry = {
    state?: TorrentStatus;
    operation?: TorrentOperationState;
};

export type OptimisticStatusMap = Record<string, OptimisticStatusEntry>;
