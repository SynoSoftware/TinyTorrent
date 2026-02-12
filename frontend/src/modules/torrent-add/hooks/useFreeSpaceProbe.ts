import { useEffect, useRef, useState } from "react";
import type { TransmissionFreeSpace } from "@/services/rpc/types";
import { infraLogger } from "@/shared/utils/infraLogger";
import { scheduler } from "@/app/services/scheduler";

export type FreeSpaceProbeState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ok"; value: TransmissionFreeSpace }
    | { status: "error"; reason: "unknown"; message?: string };

export function useFreeSpaceProbe({
    checkFreeSpace,
    path,
    enabled,
}: {
    checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
    path: string;
    enabled: boolean;
}): FreeSpaceProbeState {
    const [state, setState] = useState<FreeSpaceProbeState>({ status: "idle" });
    const runIdRef = useRef(0);
    const lastSuccessRef = useRef<{
        path: string;
        value: TransmissionFreeSpace;
    } | null>(null);
    const scopedCacheRef = useRef<Map<string, TransmissionFreeSpace>>(new Map());

    const getScopeKey = (value: string): string | null => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const driveMatch = trimmed.match(/^([a-zA-Z]):[\\/]/);
        if (driveMatch) return `win:${driveMatch[1].toUpperCase()}:`;
        if (/^\\\\/.test(trimmed)) {
            const parts = trimmed
                .replace(/^\\\\/, "")
                .split(/[\\/]/)
                .filter((part) => part.length > 0);
            if (parts.length >= 2) {
                return `unc:${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`;
            }
            return "unc";
        }
        if (trimmed.startsWith("/")) return "posix:/";
        return null;
    };

    useEffect(() => {
        const trimmed = path.trim();
        if (!checkFreeSpace || !enabled || !trimmed) {
            const cancelIdleReset = scheduler.scheduleTimeout(() => {
                setState({ status: "idle" });
            }, 0);
            return cancelIdleReset;
        }

        const runId = ++runIdRef.current;
        const scopeKey = getScopeKey(trimmed);
        const scopedCached = scopeKey
            ? scopedCacheRef.current.get(scopeKey)
            : undefined;
        const exactCached = lastSuccessRef.current;
        if (exactCached && exactCached.path === trimmed) {
            // Keep last successful value visible while refreshing in background.
            setState({ status: "ok", value: exactCached.value });
        } else if (scopedCached) {
            // While user types within the same volume/share, keep stable stale value.
            setState({ status: "ok", value: scopedCached });
        }
        infraLogger.debug({
            scope: "add_torrent",
            event: "free_space_probe_start",
            message: "Started free-space probe",
            details: {
                runId,
                path: trimmed,
                enabled,
                warmCache:
                    (exactCached && exactCached.path === trimmed) ||
                    Boolean(scopedCached),
            },
        });

        const cancelDebounce = scheduler.scheduleTimeout(() => {
            // Only show explicit loading when we have no usable stale value.
            if (!scopedCached && !(exactCached && exactCached.path === trimmed)) {
                setState({ status: "loading" });
            }

            checkFreeSpace(trimmed)
                .then((space) => {
                    if (runIdRef.current !== runId) return;
                    lastSuccessRef.current = {
                        path: trimmed,
                        value: space,
                    };
                    const resolvedScope = getScopeKey(space.path) ?? scopeKey;
                    if (resolvedScope) {
                        scopedCacheRef.current.set(resolvedScope, space);
                    }
                    infraLogger.debug({
                        scope: "add_torrent",
                        event: "free_space_probe_ok",
                        message: "Free-space probe completed",
                        details: {
                            runId,
                            requestedPath: trimmed,
                            reportedPath: space.path,
                            sizeBytes: space.sizeBytes,
                            totalSize: space.totalSize,
                        },
                    });
                    setState({ status: "ok", value: space });
                })
                .catch((error: unknown) => {
                    if (runIdRef.current !== runId) return;
                    const message =
                        error instanceof Error
                            ? error.message.trim()
                            : typeof error === "string"
                              ? error.trim()
                              : "";
                    infraLogger.debug(
                        {
                            scope: "add_torrent",
                            event: "free_space_probe_error",
                            message: "Free-space probe failed",
                            details: {
                                runId,
                                path: trimmed,
                                message: message || "(empty)",
                            },
                        },
                        error,
                    );
                    if (scopedCached || (exactCached && exactCached.path === trimmed)) {
                        // Keep stale display to avoid flicker while typing.
                        return;
                    }
                    setState({
                        status: "error",
                        reason: "unknown",
                        message: message || undefined,
                    });
                });
        }, 220);

        return cancelDebounce;
    }, [checkFreeSpace, enabled, path]);

    return state;
}
