import { useCallback, useState } from "react";
import type { MutableRefObject } from "react";

import type { EngineAdapter } from "../../services/rpc/engine-adapter";
import type { RpcStatus } from "../../shared/types/rpc";
import type { Torrent } from "../../modules/dashboard/types/torrent";
import type { TransmissionFreeSpace } from "../../services/rpc/types";

interface UseAddTorrentParams {
    torrentClient: EngineAdapter;
    refreshTorrents: () => Promise<void>;
    refreshSessionStatsData: () => Promise<void>;
    reportRpcStatus: (status: RpcStatus) => void;
    isMountedRef: MutableRefObject<boolean>;
}

interface AddTorrentPayload {
    magnetLink?: string;
    metainfo?: string;
    downloadDir: string;
    startNow: boolean;
    filesUnwanted?: number[];
}

export function useAddTorrent({
    torrentClient,
    refreshTorrents,
    refreshSessionStatsData,
    reportRpcStatus,
    isMountedRef,
}: UseAddTorrentParams) {
    const [isAddingTorrent, setIsAddingTorrent] = useState(false);

    const handleAddTorrent = useCallback(
        async (payload: AddTorrentPayload) => {
            setIsAddingTorrent(true);
            try {
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
                setIsAddingTorrent(false);
            }
        },
        [
            reportRpcStatus,
            refreshSessionStatsData,
            refreshTorrents,
            torrentClient,
        ]
    );

    return {
        isAddingTorrent,
        handleAddTorrent,
    };
}
