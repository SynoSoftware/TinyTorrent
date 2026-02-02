import { useMemo } from "react";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { useMissingFilesClassification } from "@/services/recovery/missingFilesStore";
import { resolveRecoveryClassification } from "@/modules/dashboard/utils/recoveryClassification";
import type { MissingFilesClassification } from "@/services/recovery/recovery-controller";

const getTorrentKey = (entry?: { id?: string | number; hash?: string } | null) =>
    entry?.id?.toString() ?? entry?.hash ?? "";

export function useResolvedRecoveryClassification(
    torrent?: { id?: string | number; hash?: string } | null
): MissingFilesClassification | null {
    const { getRecoverySessionForKey } = useRecoveryContext();
    const torrentKey = getTorrentKey(torrent);
    const sessionClassification =
        getRecoverySessionForKey(torrentKey)?.classification ?? null;
    const storedClassification = useMissingFilesClassification(
        torrent?.id ?? torrent?.hash ?? undefined
    );
    return useMemo(
        () =>
            resolveRecoveryClassification({
                sessionClassification,
                storedClassification,
            }),
        [sessionClassification, storedClassification]
    );
}

