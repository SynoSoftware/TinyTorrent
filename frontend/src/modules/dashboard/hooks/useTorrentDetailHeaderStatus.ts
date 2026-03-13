import { useMemo } from "react";
import type { TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";
import type { OptimisticStatusEntry } from "@/modules/dashboard/types/contracts";
import { useTranslation } from "react-i18next";
import {
    getEffectiveTorrentState,
    getTorrentStatusLabelKey,
} from "@/modules/dashboard/utils/torrentStatus";

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

        if (optimisticStatus?.operation === "moving") {
            const label = t("table.status_moving");
            return {
                statusLabel: label,
                tooltip: label,
                primaryHint: null,
            };
        }

        const effectiveState = getEffectiveTorrentState(torrent, optimisticStatus);
        const statusLabelKey = getTorrentStatusLabelKey(effectiveState);
        const statusLabel =
            statusLabelKey != null
                ? t(statusLabelKey)
                : typeof effectiveState === "string" && effectiveState.length > 0
                  ? effectiveState
                : null;
        if (!statusLabel) {
            return {
                statusLabel: null,
                tooltip: null,
                primaryHint: null,
            };
        }
        const tooltip = torrent.errorString && torrent.errorString.trim().length > 0
            ? torrent.errorString
            : statusLabel;

        return {
            statusLabel,
            tooltip,
            primaryHint: null,
        };
    }, [optimisticStatus, t, torrent]);
}

