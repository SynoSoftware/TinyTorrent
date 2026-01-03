import {
    useCallback,
    useRef,
    useState,
    useEffect,
    type MutableRefObject,
} from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { ReportReadErrorFn } from "@/shared/types/rpc";
import { isRpcCommandError } from "@/services/rpc/errors";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";

interface UseTorrentDetailParams {
    torrentClient: EngineAdapter;
    reportReadError: ReportReadErrorFn;
    isMountedRef: MutableRefObject<boolean>;
    sessionReady: boolean;
}

interface UseTorrentDetailResult {
    detailData: TorrentDetail | null;
    loadDetail: (
        torrentId: string,
        placeholder?: TorrentDetail
    ) => Promise<void>;
    refreshDetailData: () => Promise<void>;
    clearDetail: () => void;
    mutateDetail: (
        updater: (current: TorrentDetail) => TorrentDetail | null
    ) => void;
}

export function useTorrentDetail({
    torrentClient,
    reportReadError,
    isMountedRef,
    sessionReady,
}: UseTorrentDetailParams): UseTorrentDetailResult {
    const [detailData, setDetailData] = useState<TorrentDetail | null>(null);
    const detailRequestRef = useRef(0);
    const activeDetailIdRef = useRef<string | null>(null);
    const detailTimestampRef = useRef(0);
    const detailIdentityRef = useRef<{ id: string; hash: string } | null>(
        null
    );

    const commitDetailState = useCallback(
        (detail: TorrentDetail | null, timestamp = Date.now()) => {
            if (!isMountedRef.current) return;
            setDetailData(detail);
            detailTimestampRef.current = detail ? timestamp : 0;
            detailIdentityRef.current = detail
                ? { id: detail.id, hash: detail.hash }
                : null;
        },
        [isMountedRef]
    );

    const loadDetail = useCallback(
        async (torrentId: string, placeholder?: TorrentDetail) => {
            const requestId = ++detailRequestRef.current;
            activeDetailIdRef.current = torrentId;
            if (placeholder) {
                commitDetailState(placeholder, 0);
            }
            try {
                const detail = await torrentClient.getTorrentDetails(torrentId);
                if (
                    detailRequestRef.current !== requestId ||
                    activeDetailIdRef.current !== torrentId
                )
                    return;
                commitDetailState(detail);
            } catch (error) {
                if (
                    detailRequestRef.current !== requestId ||
                    activeDetailIdRef.current !== torrentId
                )
                    return;
                if (isMountedRef.current) {
                    if (!isRpcCommandError(error)) {
                        reportReadError();
                    }
                }
            }
        },
        [torrentClient, reportReadError, isMountedRef, commitDetailState]
    );

    const refreshDetailData = useCallback(async () => {
        if (!detailData) return;
        await loadDetail(detailData.id);
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
        [isMountedRef]
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
        const subscription = torrentClient.subscribeToHeartbeat({
            mode: "detail",
            detailId: detailData.id,
            onUpdate: ({ detail, timestampMs }) => {
                if (!isMountedRef.current) return;
                if (!detail) return;
                if (activeDetailIdRef.current !== detail.id) return;
                const identity = detailIdentityRef.current;
                if (identity && identity.hash !== detail.hash) return;
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
        torrentClient,
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
