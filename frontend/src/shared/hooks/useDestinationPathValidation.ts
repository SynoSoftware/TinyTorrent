import { useEffect, useMemo, useRef, useState } from "react";
import { scheduler } from "@/app/services/scheduler";
import type { DaemonPathStyle } from "@/services/rpc/types";
import {
    evaluateDestinationPathCandidate,
    readDestinationFreeSpace,
    resolvePosixProbeCandidates,
    toRpcWindowsProbeRootPath,
    type DestinationFreeSpace,
    type DestinationPathEvaluation,
    type DestinationProbeWarning,
    type DestinationRootProbeResult,
    type DestinationValidationReason,
} from "@/shared/domain/destinationPath";

type DestinationPathValidationStatus =
    | "idle"
    | "validating"
    | "valid"
    | "invalid";

type DestinationPathValidationSnapshot = {
    evaluation: DestinationPathEvaluation;
    status: DestinationPathValidationStatus;
    reason: DestinationValidationReason | null;
    freeSpace: DestinationFreeSpace | null;
    probeWarning: DestinationProbeWarning | null;
    isFresh: boolean;
};

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
    checkFreeSpace?: (path: string) => Promise<unknown>;
    debounceMs: number;
};

const fromSnapshot = (
    snapshot: DestinationPathValidationSnapshot,
): DestinationPathValidationResult => ({
    normalizedPath: snapshot.evaluation.normalizedPath,
    hasValue: snapshot.evaluation.hasValue,
    status: snapshot.status,
    reason: snapshot.reason,
    freeSpace: snapshot.freeSpace,
    probeWarning: snapshot.probeWarning,
    isFresh: snapshot.isFresh,
});

const resolvePosixProbeResult = async (
    normalizedPath: string,
    checkFreeSpace?: (path: string) => Promise<unknown>,
): Promise<{
    freeSpace: DestinationFreeSpace | null;
    probeWarning: DestinationProbeWarning | null;
}> => {
    if (typeof checkFreeSpace !== "function") {
        return { freeSpace: null, probeWarning: "free_space_unavailable" };
    }

    const candidates = resolvePosixProbeCandidates(normalizedPath);
    for (const candidate of candidates) {
        try {
            const response = await checkFreeSpace(candidate);
            const freeSpace = readDestinationFreeSpace(response);
            if (freeSpace) {
                return { freeSpace, probeWarning: null };
            }
            return { freeSpace: null, probeWarning: "free_space_unavailable" };
        } catch {
            // Continue and try fallback candidate once.
        }
    }

    return { freeSpace: null, probeWarning: "free_space_unavailable" };
};

const resolveWindowsRootProbe = async ({
    probeRoot,
    checkFreeSpace,
    cache,
}: {
    probeRoot: string;
    checkFreeSpace?: (path: string) => Promise<unknown>;
    cache: Map<string, DestinationRootProbeResult>;
}): Promise<DestinationRootProbeResult> => {
    const cached = cache.get(probeRoot);
    if (cached) {
        return cached;
    }

    if (typeof checkFreeSpace !== "function") {
        const result: DestinationRootProbeResult = {
            ok: true,
            probeWarning: "free_space_unavailable",
        };
        cache.set(probeRoot, result);
        return result;
    }

    try {
        const response = await checkFreeSpace(toRpcWindowsProbeRootPath(probeRoot));
        const freeSpace = readDestinationFreeSpace(response);
        const result: DestinationRootProbeResult = freeSpace
            ? { ok: true, freeSpace }
            : { ok: true, probeWarning: "free_space_unavailable" };
        cache.set(probeRoot, result);
        return result;
    } catch {
        const result: DestinationRootProbeResult = {
            ok: false,
            reason: "root_unreachable",
        };
        cache.set(probeRoot, result);
        return result;
    }
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
    const rootProbeCacheRef = useRef<Map<string, DestinationRootProbeResult>>(
        new Map(),
    );
    const validationRunIdRef = useRef(0);
    const [snapshot, setSnapshot] = useState<DestinationPathValidationSnapshot>({
        evaluation,
        status: "idle",
        reason: null,
        freeSpace: null,
        probeWarning: null,
        isFresh: false,
    });

    useEffect(() => {
        if (!isOpen) {
            rootProbeCacheRef.current.clear();
            validationRunIdRef.current += 1;
            setSnapshot({
                evaluation,
                status: "idle",
                reason: null,
                freeSpace: null,
                probeWarning: null,
                isFresh: false,
            });
            return;
        }

        if (!evaluation.hasValue) {
            setSnapshot({
                evaluation,
                status: "idle",
                reason: null,
                freeSpace: null,
                probeWarning: null,
                isFresh: true,
            });
            return;
        }

        if (evaluation.reason) {
            setSnapshot({
                evaluation,
                status: "invalid",
                reason: evaluation.reason,
                freeSpace: null,
                probeWarning: null,
                isFresh: true,
            });
            return;
        }

        const runId = validationRunIdRef.current + 1;
        validationRunIdRef.current = runId;

        const cancel = scheduler.scheduleTimeout(() => {
            setSnapshot({
                evaluation,
                status: "validating",
                reason: null,
                freeSpace: null,
                probeWarning: null,
                isFresh: false,
            });

            void (async () => {
                if (daemonPathStyle === "windows") {
                    const probeRoot = evaluation.resolvedProbeRoot;
                    if (!probeRoot) {
                        if (validationRunIdRef.current !== runId) return;
                        setSnapshot({
                            evaluation,
                            status: "invalid",
                            reason: "invalid_format",
                            freeSpace: null,
                            probeWarning: null,
                            isFresh: true,
                        });
                        return;
                    }
                    const probe = await resolveWindowsRootProbe({
                        probeRoot,
                        checkFreeSpace,
                        cache: rootProbeCacheRef.current,
                    });
                    if (validationRunIdRef.current !== runId) return;
                    if (!probe.ok) {
                        setSnapshot({
                            evaluation,
                            status: "invalid",
                            reason: probe.reason,
                            freeSpace: null,
                            probeWarning: null,
                            isFresh: true,
                        });
                        return;
                    }
                    setSnapshot({
                        evaluation,
                        status: "valid",
                        reason: null,
                        freeSpace: probe.freeSpace ?? null,
                        probeWarning: probe.probeWarning ?? null,
                        isFresh: true,
                    });
                    return;
                }

                const posixProbe = await resolvePosixProbeResult(
                    evaluation.normalizedPath,
                    checkFreeSpace,
                );
                if (validationRunIdRef.current !== runId) return;
                setSnapshot({
                    evaluation,
                    status: "valid",
                    reason: null,
                    freeSpace: posixProbe.freeSpace,
                    probeWarning: posixProbe.probeWarning,
                    isFresh: true,
                });
            })();
        }, debounceMs);

        return cancel;
    }, [checkFreeSpace, daemonPathStyle, debounceMs, evaluation, isOpen]);

    return fromSnapshot(snapshot);
};
