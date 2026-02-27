import { useMemo } from "react";
import type { TransmissionFreeSpace } from "@/services/rpc/types";
import type { DaemonPathStyle } from "@/services/rpc/types";
import {
    evaluateDestinationPathCandidate,
    type DestinationFreeSpace,
    type DestinationProbeWarning,
    type DestinationValidationReason,
} from "@/shared/domain/destinationPath";
import { useDestinationFreeSpaceProbe } from "@/shared/hooks/useDestinationFreeSpaceProbe";

type DestinationPathValidationStatus =
    | "idle"
    | "validating"
    | "valid"
    | "invalid";

export type DestinationPathValidationResult = Readonly<{
    normalizedPath: string;
    hasValue: boolean;
    status: DestinationPathValidationStatus;
    reason: DestinationValidationReason | null;
    freeSpace: DestinationFreeSpace | null;
    probeWarning: DestinationProbeWarning | null;
    isFresh: boolean;
}>;

type UseDestinationPathValidationParams = {
    isOpen: boolean;
    candidatePath: string;
    daemonPathStyle: DaemonPathStyle;
    checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
    debounceMs: number;
};

export const useDestinationPathValidation = ({
    isOpen,
    candidatePath,
    daemonPathStyle,
    checkFreeSpace,
    debounceMs,
}: UseDestinationPathValidationParams): DestinationPathValidationResult => {
    const evaluation = useMemo(
        () => evaluateDestinationPathCandidate(candidatePath, daemonPathStyle),
        [candidatePath, daemonPathStyle],
    );
    const shouldProbe = isOpen && evaluation.hasValue && evaluation.reason === null;
    const probe = useDestinationFreeSpaceProbe({
        isOpen,
        shouldProbe,
        daemonPathStyle,
        normalizedPath: evaluation.normalizedPath,
        probeRoot: evaluation.resolvedProbeRoot,
        checkFreeSpace,
        debounceMs,
    });

    if (!isOpen) {
        return {
            normalizedPath: evaluation.normalizedPath,
            hasValue: evaluation.hasValue,
            status: "idle",
            reason: null,
            freeSpace: null,
            probeWarning: null,
            isFresh: false,
        };
    }

    if (!evaluation.hasValue) {
        return {
            normalizedPath: evaluation.normalizedPath,
            hasValue: false,
            status: "idle",
            reason: null,
            freeSpace: null,
            probeWarning: null,
            isFresh: true,
        };
    }

    if (evaluation.reason) {
        return {
            normalizedPath: evaluation.normalizedPath,
            hasValue: true,
            status: "invalid",
            reason: evaluation.reason,
            freeSpace: null,
            probeWarning: null,
            isFresh: true,
        };
    }

    if (probe.status === "resolved") {
        if (probe.reason) {
            return {
                normalizedPath: evaluation.normalizedPath,
                hasValue: true,
                status: "invalid",
                reason: probe.reason,
                freeSpace: null,
                probeWarning: null,
                isFresh: probe.isFresh,
            };
        }
        return {
            normalizedPath: evaluation.normalizedPath,
            hasValue: true,
            status: "valid",
            reason: null,
            freeSpace: probe.freeSpace,
            probeWarning: probe.probeWarning,
            isFresh: probe.isFresh,
        };
    }

    return {
        normalizedPath: evaluation.normalizedPath,
        hasValue: true,
        status: "validating",
        reason: null,
        freeSpace: null,
        probeWarning: null,
        isFresh: false,
    };
};
