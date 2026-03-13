import { useMemo } from "react";
import type { TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";
import type { OptimisticStatusEntry } from "@/modules/dashboard/types/contracts";
import { useTranslation } from "react-i18next";
import { getTorrentStatusPresentation } from "@/modules/dashboard/utils/torrentStatus";

interface UseTorrentDetailHeaderStatusParams {
    torrent?: TorrentDetail | null;
    optimisticStatus?: OptimisticStatusEntry;
}

interface TorrentDetailHeaderStatus {
    statusLabel: string | null;
    tooltip: string | null;
    primaryHint: string | null;
}

export function useTorrentDetailHeaderStatus({
    torrent,
    optimisticStatus,
}: UseTorrentDetailHeaderStatusParams): TorrentDetailHeaderStatus {
    const { t } = useTranslation();
    return useMemo(() => {
        if (!torrent) {
            return {
                statusLabel: null,
                tooltip: null,
                primaryHint: null,
            };
        }

        const presentation = getTorrentStatusPresentation(
            torrent,
            t,
            optimisticStatus,
        );
        if (!presentation.label) {
            return {
                statusLabel: null,
                tooltip: null,
                primaryHint: null,
            };
        }

        return {
            statusLabel: presentation.label,
            tooltip: presentation.tooltip,
            primaryHint: null,
        };
    }, [optimisticStatus, t, torrent]);
}

