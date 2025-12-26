import {
    useCallback,
    useRef,
    useState,
    useEffect,
    type MutableRefObject,
} from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { RpcStatus } from "@/shared/types/rpc";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";

interface UseTorrentDetailParams {
    torrentClient: EngineAdapter;
    reportRpcStatus: (status: RpcStatus) => void;
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
    reportRpcStatus,
    isMountedRef,
    sessionReady,
}: UseTorrentDetailParams): UseTorrentDetailResult {
    const [detailData, setDetailData] = useState<TorrentDetail | null>(null);
    const detailRequestRef = useRef(0);
    const activeDetailIdRef = useRef<string | null>(null);

    const loadDetail = useCallback(
        async (torrentId: string, placeholder?: TorrentDetail) => {
            const requestId = ++detailRequestRef.current;
            activeDetailIdRef.current = torrentId;
            if (placeholder) {
                setDetailData(placeholder);
            }
            try {
                const detail = await torrentClient.getTorrentDetails(torrentId);
                if (
                    detailRequestRef.current !== requestId ||
                    activeDetailIdRef.current !== torrentId
                )
                    return;
                if (isMountedRef.current) {
                    setDetailData(detail);
                }
            } catch {
                if (
                    detailRequestRef.current !== requestId ||
                    activeDetailIdRef.current !== torrentId
                )
                    return;
                if (isMountedRef.current) {
                    reportRpcStatus("error");
                }
            }
        },
        [torrentClient, reportRpcStatus, isMountedRef]
    );

    const refreshDetailData = useCallback(async () => {
        if (!detailData) return;
        await loadDetail(detailData.id);
    }, [detailData, loadDetail]);

    const mutateDetail = useCallback(
        (updater: (current: TorrentDetail) => TorrentDetail | null) => {
            setDetailData((prev) => {
                if (!prev) return prev;
                const next = updater(prev);
                return next;
            });
        },
        []
    );

    const clearDetail = useCallback(() => {
        detailRequestRef.current += 1;
        activeDetailIdRef.current = null;
        setDetailData(null);
    }, []);

    useEffect(() => {
        if (!sessionReady || !detailData?.id) return;
        const subscription = torrentClient.subscribeToHeartbeat({
            mode: "detail",
            detailId: detailData.id,
            onUpdate: ({ detail }) => {
                if (!detail) return;
                if (!isMountedRef.current) return;
                if (activeDetailIdRef.current !== detail.id) return;
                setDetailData(detail);
                reportRpcStatus("connected");
            },
            onError: () => {
                if (!isMountedRef.current) return;
                reportRpcStatus("error");
            },
        });
        return () => {
            subscription.unsubscribe();
        };
    }, [
        sessionReady,
        detailData?.id,
        torrentClient,
        reportRpcStatus,
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
