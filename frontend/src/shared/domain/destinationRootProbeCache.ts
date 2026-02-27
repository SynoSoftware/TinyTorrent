import type { TransmissionFreeSpace } from "@/services/rpc/types";
import {
    SET_LOCATION_ROOT_PROBE_CACHE_TTL_MS,
    SET_LOCATION_ROOT_PROBE_ERROR_CACHE_TTL_MS,
} from "@/config/logic";
import {
    readDestinationFreeSpace,
    toRpcWindowsProbeRootPath,
    type DestinationRootProbeResult,
} from "@/shared/domain/destinationPath";

export interface DestinationRootProbeCachePolicy {
    successTtlMs: number;
    errorTtlMs: number;
}

export interface DestinationRootProbeCache {
    clear: () => void;
    resolve: (params: {
        probeRoot: string;
        checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
        epoch: number;
    }) => Promise<DestinationRootProbeResult>;
}

type DestinationRootProbeCacheEntry = {
    epoch: number;
    expiresAtMs: number;
    result: DestinationRootProbeResult;
};

const DEFAULT_POLICY: DestinationRootProbeCachePolicy = {
    successTtlMs: SET_LOCATION_ROOT_PROBE_CACHE_TTL_MS,
    errorTtlMs: SET_LOCATION_ROOT_PROBE_ERROR_CACHE_TTL_MS,
};

export const createDestinationRootProbeCache = (
    policy: DestinationRootProbeCachePolicy = DEFAULT_POLICY,
): DestinationRootProbeCache => {
    const cache = new Map<string, DestinationRootProbeCacheEntry>();

    return {
        clear: () => {
            cache.clear();
        },
        resolve: async ({ probeRoot, checkFreeSpace, epoch }) => {
            const nowMs = Date.now();
            const cached = cache.get(probeRoot);
            if (
                cached &&
                cached.epoch === epoch &&
                cached.expiresAtMs > nowMs
            ) {
                return cached.result;
            }
            if (cached) {
                cache.delete(probeRoot);
            }

            if (typeof checkFreeSpace !== "function") {
                const result: DestinationRootProbeResult = {
                    ok: true,
                    probeWarning: "free_space_unavailable",
                };
                cache.set(probeRoot, {
                    epoch,
                    expiresAtMs: nowMs + policy.successTtlMs,
                    result,
                });
                return result;
            }

            try {
                const response = await checkFreeSpace(
                    toRpcWindowsProbeRootPath(probeRoot),
                );
                const freeSpace = readDestinationFreeSpace(response);
                const result: DestinationRootProbeResult = freeSpace
                    ? { ok: true, freeSpace }
                    : { ok: true, probeWarning: "free_space_unavailable" };
                cache.set(probeRoot, {
                    epoch,
                    expiresAtMs: nowMs + policy.successTtlMs,
                    result,
                });
                return result;
            } catch {
                const result: DestinationRootProbeResult = {
                    ok: false,
                    reason: "root_unreachable",
                };
                cache.set(probeRoot, {
                    epoch,
                    expiresAtMs: nowMs + policy.errorTtlMs,
                    result,
                });
                return result;
            }
        },
    };
};
