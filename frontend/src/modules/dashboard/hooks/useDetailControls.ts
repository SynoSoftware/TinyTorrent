import { useCallback, type MutableRefObject } from "react";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { RpcStatus } from "@/shared/types/rpc";

interface UseDetailControlsParams {
    detailData: TorrentDetail | null;
    torrentClient: EngineAdapter;
    refreshTorrents: () => Promise<void>;
    refreshDetailData: () => Promise<void>;
    refreshSessionStatsData: () => Promise<void>;
    reportRpcStatus: (status: RpcStatus) => void;
    isMountedRef: MutableRefObject<boolean>;
    mutateDetail: (
        updater: (current: TorrentDetail) => TorrentDetail | null
    ) => void;
}

interface RefreshOptions {
    refreshTorrents?: boolean;
    refreshDetail?: boolean;
    refreshStats?: boolean;
}

export function useDetailControls({
    detailData,
    torrentClient,
    refreshTorrents,
    refreshDetailData,
    refreshSessionStatsData,
    reportRpcStatus,
    isMountedRef,
    mutateDetail,
}: UseDetailControlsParams) {
    const runWithRefresh = useCallback(
        async (operation: () => Promise<void>, options?: RefreshOptions) => {
            try {
                await operation();
                if (options?.refreshTorrents ?? true) {
                    await refreshTorrents();
                }
                if (options?.refreshDetail ?? true) {
                    await refreshDetailData();
                }
                if (options?.refreshStats ?? true) {
                    await refreshSessionStatsData();
                }
            } catch {
                if (isMountedRef.current) {
                    reportRpcStatus("error");
                }
            }
        },
        [
            refreshDetailData,
            refreshSessionStatsData,
            refreshTorrents,
            reportRpcStatus,
            isMountedRef,
        ]
    );

    const handleFileSelectionChange = useCallback(
        async (indexes: number[], wanted: boolean) => {
            if (!detailData) return;
            mutateDetail((current) => {
                if (!current.files) return current;
                const updatedFiles = current.files.map((file) =>
                    indexes.includes(file.index) ? { ...file, wanted } : file
                );
                return { ...current, files: updatedFiles };
            });
            await runWithRefresh(() =>
                torrentClient.updateFileSelection(
                    detailData.id,
                    indexes,
                    wanted
                )
            );
        },
        [detailData, mutateDetail, runWithRefresh, torrentClient]
    );

    const handleSequentialToggle = useCallback(
        async (enabled: boolean) => {
            if (!detailData) return;
            const sequentialFn = torrentClient.setSequentialDownload;
            if (!sequentialFn) return;
            mutateDetail((current) => ({
                ...current,
                sequentialDownload: enabled,
            }));
            await runWithRefresh(() => sequentialFn(detailData.id, enabled));
        },
        [detailData, mutateDetail, runWithRefresh, torrentClient]
    );

    const handleSuperSeedingToggle = useCallback(
        async (enabled: boolean) => {
            if (!detailData) return;
            const superSeedingFn = torrentClient.setSuperSeeding;
            if (!superSeedingFn) return;
            mutateDetail((current) => ({ ...current, superSeeding: enabled }));
            await runWithRefresh(() => superSeedingFn(detailData.id, enabled));
        },
        [detailData, mutateDetail, runWithRefresh, torrentClient]
    );

    const handleForceTrackerReannounce = useCallback(async () => {
        if (!detailData) return;
        const reannounceFn = torrentClient.forceTrackerReannounce;
        if (!reannounceFn) return;
        await runWithRefresh(() => reannounceFn(detailData.id), {
            refreshTorrents: false,
            refreshStats: false,
        });
    }, [detailData, runWithRefresh, torrentClient]);

    return {
        handleFileSelectionChange,
        handleSequentialToggle,
        handleSuperSeedingToggle,
        handleForceTrackerReannounce,
    };
}
