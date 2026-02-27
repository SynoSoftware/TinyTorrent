import { useMemo } from "react";
import type { TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";

interface UseTorrentDetailHeaderStatusParams {
    torrent?: TorrentDetail | null;
}

interface TorrentDetailHeaderStatus {
    statusLabel: string | null;
    tooltip: string | null;
    primaryHint: string | null;
}

export function useTorrentDetailHeaderStatus({
    torrent,
}: UseTorrentDetailHeaderStatusParams): TorrentDetailHeaderStatus {
    return useMemo(() => {
        if (!torrent) {
            return {
                statusLabel: null,
                tooltip: null,
                primaryHint: null,
            };
        }

        const statusLabel = String(torrent.state);
        const tooltip = torrent.errorString && torrent.errorString.trim().length > 0
            ? torrent.errorString
            : statusLabel;

        return {
            statusLabel,
            tooltip,
            primaryHint: null,
        };
    }, [torrent]);
}

