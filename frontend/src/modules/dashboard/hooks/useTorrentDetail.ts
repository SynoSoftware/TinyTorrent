import {
    useCallback,
    useRef,
    useState,
    useEffect,
    type MutableRefObject,
} from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { useSession } from "@/app/context/SessionContext";
import { usePreferences } from "@/app/context/PreferencesContext";
import { status } from "@/shared/status";
import type { TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";
import { useEngineHeartbeatDomain } from "@/app/providers/engineDomains";

interface UseTorrentDetailParams {
    torrentClient: EngineAdapter;
    isMountedRef: MutableRefObject<boolean>;
}

interface UseTorrentDetailResult {
    detailData: TorrentDetail | null;
    loadDetail: (
        torrentId: string,
        placeholder?: TorrentDetail,
    ) => Promise<void>;
    refreshDetailData: () => Promise<void>;
    clearDetail: () => void;
    mutateDetail: (
        updater: (current: TorrentDetail) => TorrentDetail | null,
    ) => void;
}

const cloneDetail = (detail: TorrentDetail): TorrentDetail => ({
    ...detail,
    files: detail.files ? [...detail.files] : detail.files,
    trackers: detail.trackers ? [...detail.trackers] : detail.trackers,
    peers: detail.peers ? [...detail.peers] : detail.peers,
    // Keep the large piece arrays by reference. Re-cloning them on every
    // detail write turns small UI toggles into massive allocation churn.
    pieceStates: detail.pieceStates,
    pieceAvailability: detail.pieceAvailability,
});

export function useTorrentDetail({
    torrentClient,
    isMountedRef,
}: UseTorrentDetailParams): UseTorrentDetailResult {
    const heartbeatDomain = useEngineHeartbeatDomain(torrentClient);
    const { reportReadError, rpcStatus } = useSession();
    const {
        preferences: { inspectorTab },
    } = usePreferences();
    const sessionReady = rpcStatus === status.connection.connected;
    const [detailData, setDetailData] = useState<TorrentDetail | null>(null);
    const activeDetailIdRef = useRef<string | null>(null);
    const detailTimestampRef = useRef(0);
    const detailIdentityRef = useRef<{ id: string; hash: string } | null>(null);
    const detailRequestRef = useRef(0);
    const detailProfile = inspectorTab === "pieces" ? "pieces" : "standard";
    // Preload tracker data as soon as details open so the Trackers tab can
    // render immediately when selected. Keep this on the existing detail
    // heartbeat path instead of introducing a tab-owned fetch/poll cycle.
    const includeTrackerStats = true;

    const commitDetailState = useCallback(
        (detail: TorrentDetail | null, timestamp = Date.now()) => {
            if (!isMountedRef.current) return;
            const nextDetail = detail ? cloneDetail(detail) : null;
            setDetailData(nextDetail);
            detailTimestampRef.current = nextDetail ? timestamp : 0;
            detailIdentityRef.current =
                nextDetail &&
                typeof nextDetail.hash === "string" &&
                nextDetail.hash.length > 0
                    ? { id: nextDetail.id, hash: nextDetail.hash }
                    : null;
        },
        [isMountedRef],
    );

    // Detail reads stay on the heartbeat owner instead of making a second
    // ad-hoc RPC path here. The heartbeat still controls cadence, but it now
    // performs an immediate detail fetch when a detail view opens without a
    // usable cached payload.
    const loadDetail = useCallback(
        async (torrentId: string, placeholder?: TorrentDetail) => {
            activeDetailIdRef.current = torrentId;

            // If we have a placeholder, use it to set state immediately.
            // This triggers the useEffect below to subscribe to the Heartbeat.
            if (placeholder) {
                commitDetailState(placeholder, 0);
            } else {
                // If no placeholder, create a stub so we can subscribe.
                // The Heartbeat will fill in the real data on the next tick.
                commitDetailState({ id: torrentId } as TorrentDetail, 0);
            }
        },
        [commitDetailState],
    );

    const refreshDetailData = useCallback(async () => {
        if (!detailData) return;
        await loadDetail(detailData.id, detailData);
    }, [detailData, loadDetail]);

    const mutateDetail = useCallback(
        (updater: (current: TorrentDetail) => TorrentDetail | null) => {
            if (!isMountedRef.current) return;
            setDetailData((prev) => {
                if (!prev) return prev;
                const next = updater(prev);
                if (next === prev) {
                    return prev;
                }
                const committed = next ? cloneDetail(next) : null;
                detailTimestampRef.current = committed ? Date.now() : 0;
                detailIdentityRef.current = committed
                    ? { id: committed.id, hash: committed.hash }
                    : null;
                return committed;
            });
        },
        [isMountedRef],
    );

    const clearDetail = useCallback(() => {
        detailRequestRef.current += 1;
        activeDetailIdRef.current = null;
        detailTimestampRef.current = 0;
        detailIdentityRef.current = null;
        if (isMountedRef.current) {
            setDetailData(null);
        }
    }, [isMountedRef]);

    useEffect(() => {
        if (!sessionReady || !detailData?.id) return;
        const subscription = heartbeatDomain.subscribeNonTable({
            mode: "detail",
            detailId: detailData.id,
            detailProfile,
            includeTrackerStats,
            onUpdate: ({ detail, timestampMs }) => {
                if (!isMountedRef.current) return;
                if (!detail) return;
                if (activeDetailIdRef.current !== detail.id) return;
                const identity = detailIdentityRef.current;
                if (
                    identity &&
                    identity.hash &&
                    identity.hash !== detail.hash
                ) {
                    return;
                }
                const heartbeatTimestamp = timestampMs ?? Date.now();
                if (heartbeatTimestamp < detailTimestampRef.current) return;
                commitDetailState(detail, heartbeatTimestamp);
            },
            onError: () => {
                if (!isMountedRef.current) return;
                reportReadError();
            },
        });
        return () => {
            subscription.unsubscribe();
        };
    }, [
        sessionReady,
        detailData?.id,
        detailProfile,
        includeTrackerStats,
        heartbeatDomain,
        reportReadError,
        commitDetailState,
        isMountedRef,
    ]);

    return {
        detailData,
        loadDetail,
        refreshDetailData,
        clearDetail,
        mutateDetail,
    };
}

