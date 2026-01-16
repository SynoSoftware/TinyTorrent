import { useCallback, useState } from "react";
import type { MutableRefObject } from "react";

import type {
    GhostTorrentOptions,
    GhostTorrentStrategy,
} from "@/modules/dashboard/hooks/useTorrentData";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type {
    ReportCommandErrorFn,
} from "@/shared/types/rpc";
import type { TorrentStatus } from "@/services/rpc/entities";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TransmissionFreeSpace } from "@/services/rpc/types";
import { isRpcCommandError } from "@/services/rpc/errors";

interface UseAddTorrentParams {
    torrentClient: EngineAdapter;
    refreshTorrents: () => Promise<void>;
    refreshSessionStatsData: () => Promise<void>;
    reportCommandError: ReportCommandErrorFn;
    isMountedRef: MutableRefObject<boolean>;
    addGhostTorrent: (options: GhostTorrentOptions) => string;
    removeGhostTorrent: (id: string) => void;
}
// TODO: Reduce parameter surface area. This hook currently mixes:
// TODO: - orchestration (RPC add + refresh)
// TODO: - ghost UI state management
// TODO: - error reporting policy
// TODO: Target: `useAddTorrent(viewModelDeps)` where deps are grouped objects (client, refresh, ghostStore) provided by the App/Dashboard view-model, not individually threaded params.
// TODO: Align with `todo.md` task 13 (ViewModel contracts) and task 17 (Add-torrent defaults service) so add flows live behind one owner and UI components stay “dumb”.

interface AddTorrentPayload {
    magnetLink?: string;
    metainfo?: string;
    metainfoPath?: string;
    downloadDir: string;
    startNow: boolean;
    filesUnwanted?: number[];
    priorityHigh?: number[];
    priorityNormal?: number[];
    priorityLow?: number[];
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
    reportCommandError,
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
                payload.metainfoPath ??
                payload.metainfo ??
                "New Torrent";
            let rpcAttempted = false;
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
                rpcAttempted = true;
                await torrentClient.addTorrent({
                    magnetLink: payload.magnetLink,
                    metainfo: payload.metainfo,
                    metainfoPath: payload.metainfoPath,
                    downloadDir: payload.downloadDir,
                    paused: !payload.startNow,
                    filesUnwanted: payload.filesUnwanted,
                    priorityHigh: payload.priorityHigh,
                    priorityNormal: payload.priorityNormal,
                    priorityLow: payload.priorityLow,
                });
                await refreshTorrents();
                await refreshSessionStatsData();
            } catch (error) {
                if (
                    isMountedRef.current &&
                    rpcAttempted &&
                    !isRpcCommandError(error)
                ) {
                    reportCommandError(error);
                }
                throw error;
            } finally {
                if (ghostId) {
                    removeGhostTorrent(ghostId);
                }
                setIsAddingTorrent(false);
            }
        },
        [
            reportCommandError,
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
