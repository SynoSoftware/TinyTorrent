import { useEffect, useRef, useState } from "react";
import { scheduler } from "@/app/services/scheduler";
import type { DaemonPathStyle, TransmissionFreeSpace } from "@/services/rpc/types";
import {
    readDestinationFreeSpace,
    resolvePosixProbeCandidates,
    type DestinationFreeSpace,
    type DestinationProbeWarning,
} from "@/shared/domain/destinationPath";
import { createDestinationRootProbeCache } from "@/shared/domain/destinationRootProbeCache";

type DestinationFreeSpaceProbeSnapshot = {
    key: string | null;
    status: "idle" | "validating" | "resolved";
    reason: "root_unreachable" | null;
    freeSpace: DestinationFreeSpace | null;
    probeWarning: DestinationProbeWarning | null;
    isFresh: boolean;
};

export type DestinationFreeSpaceProbeResult = Readonly<{
    status: "idle" | "validating" | "resolved";
    reason: "root_unreachable" | null;
    freeSpace: DestinationFreeSpace | null;
    probeWarning: DestinationProbeWarning | null;
    isFresh: boolean;
}>;

export interface UseDestinationFreeSpaceProbeParams {
    isOpen: boolean;
    shouldProbe: boolean;
    daemonPathStyle: DaemonPathStyle;
    normalizedPath: string;
    probeRoot: string | null;
    checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
    debounceMs: number;
}

const resolvePosixProbeResult = async (
    normalizedPath: string,
    checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>,
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

const createProbeKey = ({
    daemonPathStyle,
    normalizedPath,
    probeRoot,
}: {
    daemonPathStyle: DaemonPathStyle;
    normalizedPath: string;
    probeRoot: string | null;
}): string => `${daemonPathStyle}|${normalizedPath}|${probeRoot ?? ""}`;

export const useDestinationFreeSpaceProbe = ({
    isOpen,
    shouldProbe,
    daemonPathStyle,
    normalizedPath,
    probeRoot,
    checkFreeSpace,
    debounceMs,
}: UseDestinationFreeSpaceProbeParams): DestinationFreeSpaceProbeResult => {
    const probeCacheRef = useRef(createDestinationRootProbeCache());
    const probeEpochRef = useRef(0);
    const probeRunIdRef = useRef(0);
    const [snapshot, setSnapshot] = useState<DestinationFreeSpaceProbeSnapshot>(
        {
            key: null,
            status: "idle",
            reason: null,
            freeSpace: null,
            probeWarning: null,
            isFresh: false,
        },
    );

    const probeKey =
        shouldProbe && probeRoot
            ? createProbeKey({
                  daemonPathStyle,
                  normalizedPath,
                  probeRoot,
              })
            : shouldProbe
              ? createProbeKey({
                    daemonPathStyle,
                    normalizedPath,
                    probeRoot: null,
                })
              : null;

    // Probe cache lifetime is scoped to probe strategy identity.
    // Keep cache across modal open/close, but reset when strategy changes.
    useEffect(() => {
        probeEpochRef.current += 1;
        probeCacheRef.current.clear();
    }, [checkFreeSpace, daemonPathStyle]);

    useEffect(() => {
        if (!isOpen || !shouldProbe || !probeKey) {
            if (!isOpen) {
                probeRunIdRef.current += 1;
            }
            setSnapshot({
                key: null,
                status: "idle",
                reason: null,
                freeSpace: null,
                probeWarning: null,
                isFresh: !isOpen ? false : true,
            });
            return;
        }

        const runId = probeRunIdRef.current + 1;
        probeRunIdRef.current = runId;

        const cancel = scheduler.scheduleTimeout(() => {
            setSnapshot({
                key: probeKey,
                status: "validating",
                reason: null,
                freeSpace: null,
                probeWarning: null,
                isFresh: false,
            });

            void (async () => {
                if (daemonPathStyle === "windows") {
                    if (!probeRoot) {
                        if (probeRunIdRef.current !== runId) return;
                        setSnapshot({
                            key: probeKey,
                            status: "resolved",
                            reason: "root_unreachable",
                            freeSpace: null,
                            probeWarning: null,
                            isFresh: true,
                        });
                        return;
                    }
                    const probe = await probeCacheRef.current.resolve({
                        probeRoot,
                        checkFreeSpace,
                        epoch: probeEpochRef.current,
                    });
                    if (probeRunIdRef.current !== runId) return;
                    setSnapshot({
                        key: probeKey,
                        status: "resolved",
                        reason: probe.ok ? null : probe.reason,
                        freeSpace: probe.ok ? (probe.freeSpace ?? null) : null,
                        probeWarning: probe.ok
                            ? (probe.probeWarning ?? null)
                            : null,
                        isFresh: true,
                    });
                    return;
                }

                const posixProbe = await resolvePosixProbeResult(
                    normalizedPath,
                    checkFreeSpace,
                );
                if (probeRunIdRef.current !== runId) return;
                setSnapshot({
                    key: probeKey,
                    status: "resolved",
                    reason: null,
                    freeSpace: posixProbe.freeSpace,
                    probeWarning: posixProbe.probeWarning,
                    isFresh: true,
                });
            })();
        }, debounceMs);

        return cancel;
    }, [
        checkFreeSpace,
        daemonPathStyle,
        debounceMs,
        isOpen,
        normalizedPath,
        probeKey,
        probeRoot,
        shouldProbe,
    ]);

    if (shouldProbe && probeKey && snapshot.key !== probeKey) {
        return {
            status: "validating",
            reason: null,
            freeSpace: null,
            probeWarning: null,
            isFresh: false,
        };
    }

    return {
        status: snapshot.status,
        reason: snapshot.reason,
        freeSpace: snapshot.freeSpace,
        probeWarning: snapshot.probeWarning,
        isFresh: snapshot.isFresh,
    };
};
