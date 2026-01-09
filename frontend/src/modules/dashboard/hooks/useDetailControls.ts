import { useCallback, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { ReportCommandErrorFn } from "@/shared/types/rpc";
import { isRpcCommandError } from "@/services/rpc/errors";
import type { CapabilityKey, CapabilityState } from "@/app/types/capabilities";

interface UseDetailControlsParams {
    detailData: TorrentDetail | null;
    torrentClient: EngineAdapter;
    refreshTorrents: () => Promise<void>;
    refreshDetailData: () => Promise<void>;
    refreshSessionStatsData: () => Promise<void>;
    reportCommandError: ReportCommandErrorFn;
    isMountedRef: MutableRefObject<boolean>;
    mutateDetail: (
        updater: (current: TorrentDetail) => TorrentDetail | null
    ) => void;
    updateCapabilityState: (
        capability: CapabilityKey,
        state: CapabilityState
    ) => void;
}

interface RefreshOptions {
    refreshTorrents?: boolean;
    refreshDetail?: boolean;
    refreshStats?: boolean;
    reportRpcError?: boolean;
    propagateError?: boolean;
}

export function useDetailControls({
    detailData,
    torrentClient,
    refreshTorrents,
    refreshDetailData,
    refreshSessionStatsData,
    reportCommandError,
    isMountedRef,
    mutateDetail,
    updateCapabilityState,
}: UseDetailControlsParams) {
    const { t } = useTranslation();
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
            } catch (error) {
                if (isMountedRef.current && (options?.reportRpcError ?? true)) {
                    if (!isRpcCommandError(error)) {
                        reportCommandError(error);
                    }
                }
                if (options?.propagateError) {
                    throw error;
                }
            }
        },
        [
            refreshDetailData,
            refreshSessionStatsData,
            refreshTorrents,
            reportCommandError,
            isMountedRef,
        ]
    );

    const handleFileSelectionChange = useCallback(
        async (indexes: number[], wanted: boolean) => {
            if (!detailData) return;
            const availableIndexes = new Set(
                detailData.files?.map((file) => file.index) ?? []
            );
            const validIndexes = indexes.filter((index) =>
                availableIndexes.has(index)
            );
            if (!validIndexes.length) return;
            const fileCount = detailData.files?.length ?? 0;
            const boundedIndexes = validIndexes.filter(
                (index) => index >= 0 && index < fileCount
            );
            if (!boundedIndexes.length) return;

            mutateDetail((current) => {
                if (!current.files) return current;
                const updatedFiles = current.files.map((file) =>
                    boundedIndexes.includes(file.index)
                        ? { ...file, wanted }
                        : file
                );
                return { ...current, files: updatedFiles };
            });
            await runWithRefresh(() =>
                torrentClient.updateFileSelection(
                    detailData.id,
                    boundedIndexes,
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
            try {
                await runWithRefresh(
                    () => sequentialFn(detailData.id, enabled),
                    { propagateError: true }
                );
                updateCapabilityState("sequentialDownload", "supported");
            } catch (error) {
                if (isUnsupportedCapabilityError(error)) {
                    updateCapabilityState("sequentialDownload", "unsupported");
                }
            }
        },
        [
            detailData,
            mutateDetail,
            runWithRefresh,
            torrentClient,
            updateCapabilityState,
        ]
    );

    const handleSuperSeedingToggle = useCallback(
        async (enabled: boolean) => {
            if (!detailData) return;
            const superSeedingFn = torrentClient.setSuperSeeding;
            if (!superSeedingFn) return;
            mutateDetail((current) => ({ ...current, superSeeding: enabled }));
            try {
                await runWithRefresh(
                    () => superSeedingFn(detailData.id, enabled),
                    { propagateError: true }
                );
                updateCapabilityState("superSeeding", "supported");
            } catch (error) {
                if (isUnsupportedCapabilityError(error)) {
                    updateCapabilityState("superSeeding", "unsupported");
                }
            }
        },
        [
            detailData,
            mutateDetail,
            runWithRefresh,
            torrentClient,
            updateCapabilityState,
        ]
    );

    const handleForceTrackerReannounce = useCallback(async (): Promise<
        string | void
    > => {
        if (!detailData) return;
        const reannounceFn = torrentClient.forceTrackerReannounce;
        if (!reannounceFn) return;

        const prevTrackers = detailData.trackers ?? [];
        const snapshot = prevTrackers.map((t) => ({
            id: t.id,
            announce: t.announce,
            lastAnnounceTime:
                typeof t.lastAnnounceTime === "number" ? t.lastAnnounceTime : 0,
            lastAnnounceSucceeded: t.lastAnnounceSucceeded === true,
        }));

        try {
            // fire the reannounce RPC (do not refresh torrents or stats immediately)
            await runWithRefresh(() => reannounceFn(detailData.id), {
                refreshTorrents: false,
                refreshStats: false,
                reportRpcError: false,
            });
        } catch (err) {
            throw err;
        }

        // Wait for the heartbeat to report an updated detail for this torrent
        // rather than polling the adapter directly. This avoids creating
        // additional RPC traffic and relies on the HeartbeatManager to
        // deliver detail updates written by the engine.
        const timeout = 12_000; // 12s

        try {
            return await new Promise<string | undefined>((resolve) => {
                let settled = false;
                const timer = window.setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    try {
                        sub.unsubscribe();
                    } catch {}
                    resolve(t("torrent_modal.trackers.reannounce_timeout"));
                }, timeout);

                const sub = torrentClient.subscribeToHeartbeat({
                    mode: "detail",
                    detailId: detailData.id,
                    onUpdate: (payload) => {
                        if (settled) return;
                        const fresh = payload.detail;
                        if (!fresh) return;
                        const freshTrackers = fresh.trackers ?? [];
                        const changed = snapshot.some((s) => {
                            const match = freshTrackers.find(
                                (ft) =>
                                    ft.id === s.id || ft.announce === s.announce
                            );
                            if (!match) return false;
                            const ftTime =
                                typeof match.lastAnnounceTime === "number"
                                    ? match.lastAnnounceTime
                                    : 0;
                            const ftSucc = match.lastAnnounceSucceeded === true;
                            return (
                                ftTime > s.lastAnnounceTime ||
                                (ftSucc && !s.lastAnnounceSucceeded)
                            );
                        });

                        if (changed) {
                            settled = true;
                            try {
                                sub.unsubscribe();
                            } catch {}
                            window.clearTimeout(timer);
                            // update the detail cache with the fresh detail
                            mutateDetail(() => fresh as any);
                            resolve(
                                t("torrent_modal.trackers.reannounce_completed")
                            );
                        }
                    },
                    onError: () => {
                        // ignore errors; the timeout will handle failure
                    },
                });
            });
        } catch {
            return t("torrent_modal.trackers.reannounce_timeout");
        }
    }, [
        detailData,
        runWithRefresh,
        torrentClient,
        isMountedRef,
        mutateDetail,
        t,
    ]);

    const isUnsupportedCapabilityError = (error: unknown) => {
        if (!isRpcCommandError(error)) {
            return false;
        }
        const normalizedCode = error.code?.toLowerCase();
        if (normalizedCode === "invalid arguments") {
            return true;
        }
        const message = error.message?.toLowerCase() ?? "";
        return (
            message.includes("invalid arguments") ||
            message.includes("unsupported field") ||
            message.includes("field not found")
        );
    };

    return {
        handleFileSelectionChange,
        handleSequentialToggle,
        handleSuperSeedingToggle,
        handleForceTrackerReannounce,
    };
}
