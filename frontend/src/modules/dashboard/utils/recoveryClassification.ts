import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { MissingFilesClassification } from "@/services/recovery/recovery-controller";

export interface RecoveryClassificationParams {
    sessionClassification?: MissingFilesClassification | null;
    storedClassification?: MissingFilesClassification | undefined;
}

export function resolveRecoveryClassification({
    sessionClassification,
    storedClassification,
}: RecoveryClassificationParams): MissingFilesClassification | null {
    return sessionClassification ?? storedClassification ?? null;
}
