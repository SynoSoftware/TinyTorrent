import type { TorrentStatus } from "@/services/rpc/entities";

export type OptimisticStatusEntry = {
    state: TorrentStatus;
    expiresAt: number;
};

export type OptimisticStatusMap = Record<string, OptimisticStatusEntry>;
