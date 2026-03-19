import { useCallback, useState, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { SessionStats, TorrentEntity } from "@/services/rpc/entities";
import type { ReportReadErrorFn } from "@/shared/types/rpc";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import { isRpcCommandError } from "@/services/rpc/errors";
import {
    useEngineHeartbeatDomain,
    useEngineSessionDomain,
} from "@/app/providers/engineDomains";

interface UseSessionStatsParams {
    torrentClient: EngineAdapter;
    reportReadError: ReportReadErrorFn;
    isMountedRef: MutableRefObject<boolean>;
    sessionReady: boolean;
}

export const deriveLiveTransferRates = (
    stats: SessionStats,
    torrents: TorrentEntity[] | undefined,
): SessionStats => {
    if (!Array.isArray(torrents) || torrents.length === 0) {
        return stats;
    }

    let downloadSpeed = 0;
    let uploadSpeed = 0;

    for (const torrent of torrents) {
        if (torrent.isGhost) {
            continue;
        }
        downloadSpeed += Math.max(0, torrent.speed.down);
        uploadSpeed += Math.max(0, torrent.speed.up);
    }

    if (
        downloadSpeed === stats.downloadSpeed &&
        uploadSpeed === stats.uploadSpeed
    ) {
        return stats;
    }

    return {
        ...stats,
        downloadSpeed,
        uploadSpeed,
    };
};

export function useSessionStats({
    torrentClient,
    reportReadError,
    isMountedRef,
    sessionReady,
}: UseSessionStatsParams) {
    const heartbeatDomain = useEngineHeartbeatDomain(torrentClient);
    const sessionDomain = useEngineSessionDomain(torrentClient);
    const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
    const [liveTransportStatus, setLiveTransportStatus] =
        useState<HeartbeatSource>("polling");
    const lastHeartbeatTorrentsRef = useRef<TorrentEntity[] | undefined>(
        undefined
    );
    // TODO: With “RPC extensions: NONE”, HeartbeatSource must collapse to polling-only. Update this hook to:
    // TODO: - remove websocket-related source variants from the type
    // TODO: - avoid logging transport status transitions as an app concern
    // TODO: - rely on the planned Session+UiMode provider as the single source of truth for “connected vs offline” and refresh scheduling

    const refreshSessionStatsData = useCallback(async () => {
        try {
            const stats = await sessionDomain.getSessionStats();
            if (isMountedRef.current) {
                setSessionStats(
                    deriveLiveTransferRates(
                        stats,
                        lastHeartbeatTorrentsRef.current
                    )
                );
            }
        } catch (error) {
            if (isMountedRef.current && !isRpcCommandError(error)) {
                reportReadError();
            }
        }
    }, [isMountedRef, reportReadError, sessionDomain]);

    const setSessionStatsIfChanged = useCallback(
        (next: SessionStats | null) => {
            setSessionStats((current) => {
                if (current === next) {
                    return current;
                }
                if (current && next) {
                    const same =
                        current.downloadSpeed === next.downloadSpeed &&
                        current.uploadSpeed === next.uploadSpeed &&
                        current.torrentCount === next.torrentCount &&
                        current.activeTorrentCount === next.activeTorrentCount &&
                        current.pausedTorrentCount === next.pausedTorrentCount &&
                        current.dhtNodes === next.dhtNodes &&
                        current.downloadDirFreeSpace ===
                            next.downloadDirFreeSpace &&
                        current.networkTelemetry?.dhtEnabled ===
                            next.networkTelemetry?.dhtEnabled &&
                        current.networkTelemetry?.pexEnabled ===
                            next.networkTelemetry?.pexEnabled &&
                        current.networkTelemetry?.lpdEnabled ===
                            next.networkTelemetry?.lpdEnabled &&
                        current.networkTelemetry?.portForwardingEnabled ===
                            next.networkTelemetry?.portForwardingEnabled &&
                        current.networkTelemetry?.altSpeedEnabled ===
                            next.networkTelemetry?.altSpeedEnabled &&
                        current.networkTelemetry?.downloadDirFreeSpace ===
                            next.networkTelemetry?.downloadDirFreeSpace &&
                        current.networkTelemetry?.downloadQueueEnabled ===
                            next.networkTelemetry?.downloadQueueEnabled &&
                        current.networkTelemetry?.seedQueueEnabled ===
                            next.networkTelemetry?.seedQueueEnabled;
                    return same ? current : next;
                }
                return next;
            });
        },
        [],
    );

    useEffect(() => {
        if (!sessionReady) return;
        const subscription = heartbeatDomain.subscribeTable({
            onUpdate: ({ sessionStats: stats, torrents, source }) => {
                if (!isMountedRef.current || !stats) return;
                lastHeartbeatTorrentsRef.current = torrents;
                setSessionStatsIfChanged(
                    deriveLiveTransferRates(stats, torrents),
                );
                if (source) {
                    setLiveTransportStatus((current) =>
                        current === source ? current : source,
                    );
                }
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
        heartbeatDomain,
        isMountedRef,
        reportReadError,
        sessionReady,
        setSessionStatsIfChanged,
    ]);

    useEffect(() => {
        if (sessionReady) {
            return;
        }
        lastHeartbeatTorrentsRef.current = undefined;
    }, [sessionReady]);

    return {
        sessionStats,
        refreshSessionStatsData,
        liveTransportStatus,
    };
}
