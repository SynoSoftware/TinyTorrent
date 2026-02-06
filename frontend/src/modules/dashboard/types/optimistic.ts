import type { TorrentStatus } from "@/services/rpc/entities";

export type OptimisticStatusEntry = {
    state: TorrentStatus;
};

export type OptimisticStatusMap = Record<string, OptimisticStatusEntry>;
