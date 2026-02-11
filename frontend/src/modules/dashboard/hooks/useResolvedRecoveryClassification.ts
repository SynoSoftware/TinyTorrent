import { useMemo } from "react";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { useMissingFilesClassification } from "@/services/recovery/missingFilesStore";
import type { MissingFilesClassification } from "@/services/recovery/recovery-controller";
import type { ErrorClass } from "@/services/rpc/entities";
import { getRecoveryFingerprint } from "@/app/domain/recoveryUtils";

const ACTIONABLE_RECOVERY_ERROR_CLASSES = new Set<ErrorClass>([
    "missingFiles",
    "permissionDenied",
    "diskFull",
]);

export function useResolvedRecoveryClassification(
    torrent?: {
        id?: string | number;
        hash?: string;
        errorEnvelope?: {
            errorClass?: ErrorClass | null;
            fingerprint?: string | null;
        } | null;
    } | null
): MissingFilesClassification | null {
    const { getRecoverySessionForKey } = useRecoveryContext();
    const torrentKey = torrent ? getRecoveryFingerprint(torrent) : null;
    const sessionClassification =
        getRecoverySessionForKey(torrentKey)?.classification ?? null;
    const storedClassification = useMissingFilesClassification(
        torrent?.id ?? torrent?.hash ?? undefined
    );
    return useMemo(
        () => {
            const isActionable =
                torrent?.errorEnvelope?.errorClass != null &&
                ACTIONABLE_RECOVERY_ERROR_CLASSES.has(
                    torrent.errorEnvelope.errorClass,
                );
            if (!isActionable && !sessionClassification) {
                return null;
            }
            return sessionClassification ?? storedClassification ?? null;
        },
        [sessionClassification, storedClassification, torrent?.errorEnvelope?.errorClass]
    );
}
