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
import { STATUS } from "@/shared/status";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
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

export function useTorrentDetail({
    torrentClient,
    isMountedRef,
}: UseTorrentDetailParams): UseTorrentDetailResult {
    const heartbeatDomain = useEngineHeartbeatDomain(torrentClient);
    const { reportReadError, rpcStatus } = useSession();
    const {
        preferences: { inspectorTab },
    } = usePreferences();
    const sessionReady = rpcStatus === STATUS.connection.CONNECTED;
    const [detailData, setDetailData] = useState<TorrentDetail | null>(null);
    const activeDetailIdRef = useRef<string | null>(null);
    const detailTimestampRef = useRef(0);
    const detailIdentityRef = useRef<{ id: string; hash: string } | null>(null);
    const detailRequestRef = useRef(0);
    const detailProfile = inspectorTab === "pieces" ? "pieces" : "standard";
    const includeTrackerStats = inspectorTab === "trackers";

    const commitDetailState = useCallback(
        (detail: TorrentDetail | null, timestamp = Date.now()) => {
            if (!isMountedRef.current) return;
            setDetailData(detail);
            detailTimestampRef.current = detail ? timestamp : 0;
            detailIdentityRef.current =
                detail && typeof detail.hash === "string" && detail.hash.length > 0
                    ? { id: detail.id, hash: detail.hash }
                    : null;
        },
        [isMountedRef],
    );

    // FIX: Removed the direct RPC call.
    // This forces the data loading to go through the Heartbeat subscription,
    // which is protected by the global 500ms/1000ms throttle.
    // This stops the "Row Thrashing" storm.
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
                detailTimestampRef.current = next ? Date.now() : 0;
                detailIdentityRef.current = next
                    ? { id: next.id, hash: next.hash }
                    : null;
                return next;
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
