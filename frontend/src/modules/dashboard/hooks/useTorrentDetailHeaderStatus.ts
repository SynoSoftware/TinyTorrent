import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { useMissingFilesClassification } from "@/services/recovery/missingFilesStore";
import {
    formatPrimaryActionHint,
    formatPrimaryActionHintFromClassification,
    formatRecoveryStatus,
    formatRecoveryStatusFromClassification,
    formatRecoveryTooltip,
    formatRecoveryTooltipFromClassification,
} from "@/shared/utils/recoveryFormat";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import { getRecoveryFingerprint } from "@/app/domain/recoveryUtils";

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
    const { t } = useTranslation();
    const torrentKey = torrent ? getRecoveryFingerprint(torrent) : null;
    const { getRecoverySessionForKey } = useRecoveryContext();
    const sessionClassification = getRecoverySessionForKey(torrentKey)?.classification ?? null;
    const storedClassification = useMissingFilesClassification(
        torrent?.id ?? torrent?.hash ?? undefined
    );

    return useMemo(() => {
        const classification = sessionClassification ?? storedClassification ?? null;
        if (classification) {
            return {
                statusLabel: formatRecoveryStatusFromClassification(
                    classification,
                    t
                ),
                tooltip: formatRecoveryTooltipFromClassification(
                    classification,
                    t
                ),
                primaryHint: formatPrimaryActionHintFromClassification(
                    classification,
                    t
                ),
            };
        }

        if (!torrent?.errorEnvelope) {
            return {
                statusLabel: null,
                tooltip: null,
                primaryHint: null,
            };
        }

        return {
            statusLabel: formatRecoveryStatus(
                torrent.errorEnvelope,
                t,
                torrent.state,
                "general.unknown"
            ),
            tooltip: formatRecoveryTooltip(
                torrent.errorEnvelope,
                t,
                torrent.state,
                "general.unknown"
            ),
            primaryHint: formatPrimaryActionHint(torrent.errorEnvelope, t),
        };
    }, [sessionClassification, storedClassification, t, torrent]);
}
