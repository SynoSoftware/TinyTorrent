import { useCallback, useState } from "react";
import type { MutableRefObject } from "react";

import type {
    GhostTorrentOptions,
    GhostTorrentStrategy,
} from "../../modules/dashboard/hooks/useTorrentData";
import type { EngineAdapter } from "../../services/rpc/engine-adapter";
import type { RpcStatus } from "../../shared/types/rpc";
import type { TorrentStatus } from "../../services/rpc/entities";
import type { Torrent } from "../../modules/dashboard/types/torrent";
import type { TransmissionFreeSpace } from "../../services/rpc/types";

interface UseAddTorrentParams {
    torrentClient: EngineAdapter;
    refreshTorrents: () => Promise<void>;
    refreshSessionStatsData: () => Promise<void>;
    reportRpcStatus: (status: RpcStatus) => void;
    isMountedRef: MutableRefObject<boolean>;
    addGhostTorrent: (options: GhostTorrentOptions) => string;
    removeGhostTorrent: (id: string) => void;
}

interface AddTorrentPayload {
    magnetLink?: string;
    metainfo?: string;
    downloadDir: string;
    startNow: boolean;
    filesUnwanted?: number[];
}

export interface AddTorrentContext {
    label?: string;
    strategy?: GhostTorrentStrategy;
    state?: TorrentStatus;
}

export function useAddTorrent({
    torrentClient,
    refreshTorrents,
    refreshSessionStatsData,
    reportRpcStatus,
    isMountedRef,
    addGhostTorrent,
    removeGhostTorrent,
}: UseAddTorrentParams) {
    const [isAddingTorrent, setIsAddingTorrent] = useState(false);

    const handleAddTorrent = useCallback(
        async (payload: AddTorrentPayload, context?: AddTorrentContext) => {
            setIsAddingTorrent(true);
            let ghostId: string | null = null;
            const label =
                context?.label ??
                payload.magnetLink ??
                payload.metainfo ??
                "New Torrent";
            try {
                ghostId = addGhostTorrent({
                    id: `ghost-${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2, 7)}`,
                    label,
                    downloadDir: payload.downloadDir,
                    strategy:
                        context?.strategy ??
                        (payload.magnetLink ? "magnet_lookup" : "loading"),
                    state: context?.state,
                });
                await torrentClient.addTorrent({
                    magnetLink: payload.magnetLink,
                    metainfo: payload.metainfo,
                    downloadDir: payload.downloadDir,
                    paused: !payload.startNow,
                    filesUnwanted: payload.filesUnwanted,
                });
                await refreshTorrents();
                await refreshSessionStatsData();
            } catch {
                if (isMountedRef.current) {
                    reportRpcStatus("error");
                }
                throw new Error("Failed to add torrent");
            } finally {
                if (ghostId) {
                    removeGhostTorrent(ghostId);
                }
                setIsAddingTorrent(false);
            }
        },
        [
            reportRpcStatus,
            refreshSessionStatsData,
            refreshTorrents,
            torrentClient,
            addGhostTorrent,
            removeGhostTorrent,
        ]
    );

    return {
        isAddingTorrent,
        handleAddTorrent,
    };
}
