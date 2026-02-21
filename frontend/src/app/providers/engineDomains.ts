import { useMemo } from "react";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { EngineInfo, SessionStats } from "@/services/rpc/entities";
import { isRpcCommandError } from "@/services/rpc/errors";
import type {
    HeartbeatDetailProfile,
    HeartbeatErrorEvent,
    HeartbeatMode,
    HeartbeatPayload,
} from "@/services/rpc/heartbeat";
import type { TransmissionSessionSettings } from "@/services/rpc/types";

type TableSubscriptionParams = {
    pollingIntervalMs?: number;
    onUpdate: (payload: HeartbeatPayload) => void;
    onError: (event: HeartbeatErrorEvent) => void;
};

type NonTableSubscriptionParams = {
    mode: Exclude<HeartbeatMode, "table">;
    detailId?: string | null;
    detailProfile?: HeartbeatDetailProfile;
    includeTrackerStats?: boolean;
    pollingIntervalMs?: number;
    onUpdate: (payload: HeartbeatPayload) => void;
    onError: (event: HeartbeatErrorEvent) => void;
};

export type EngineTestPortOutcome =
    | { status: "open" }
    | { status: "closed" }
    | { status: "unsupported" }
    | { status: "offline" }
    | { status: "failed" };

export interface EngineSessionDomain {
    canFetchSessionSettings: boolean;
    canUpdateSessionSettings: boolean;
    canTestPort: boolean;
    canDetectEngine: boolean;
    probeConnection: () => Promise<void>;
    getSessionStats: () => Promise<SessionStats>;
    fetchSessionSettings: () => Promise<TransmissionSessionSettings>;
    updateSessionSettings: (
        settings: Partial<TransmissionSessionSettings>,
    ) => Promise<void>;
    testPort: () => Promise<EngineTestPortOutcome>;
    detectEngine: () => Promise<EngineInfo>;
    resetConnection: () => void;
    updateRequestTimeout: (timeout: number) => void;
}

export interface EngineHeartbeatDomain {
    subscribeTable: (params: TableSubscriptionParams) => {
        unsubscribe: () => void;
    };
    subscribeNonTable: (params: NonTableSubscriptionParams) => {
        unsubscribe: () => void;
    };
}

const getClient = (client?: EngineAdapter) => client;

export function useEngineSessionDomain(
    clientOverride?: EngineAdapter,
): EngineSessionDomain {
    const contextClient = useTorrentClient();
    const client = getClient(clientOverride) ?? contextClient;
    return useMemo<EngineSessionDomain>(() => {
        const fetchSessionSettings = client.fetchSessionSettings;
        const updateSessionSettings = client.updateSessionSettings;
        const testPort = client.testPort;
        const detectEngine = client.detectEngine;
        const canFetchSessionSettings =
            typeof fetchSessionSettings === "function";
        const canUpdateSessionSettings =
            typeof updateSessionSettings === "function";
        const canTestPort = typeof testPort === "function";
        const canDetectEngine = typeof detectEngine === "function";

        return {
            canFetchSessionSettings,
            canUpdateSessionSettings,
            canTestPort,
            canDetectEngine,
            probeConnection: async () => {
                if (typeof fetchSessionSettings === "function") {
                    await fetchSessionSettings.call(client);
                    return;
                }
                await client.getSessionStats();
            },
            getSessionStats: () => client.getSessionStats(),
            fetchSessionSettings: async () => {
                if (typeof fetchSessionSettings !== "function") {
                    throw new Error(
                        "Session settings not supported by the torrent client",
                    );
                }
                return fetchSessionSettings.call(client);
            },
            updateSessionSettings: async (
                settings: Partial<TransmissionSessionSettings>,
            ) => {
                if (typeof updateSessionSettings !== "function") {
                    throw new Error(
                        "Session settings not supported by this client",
                    );
                }
                await updateSessionSettings.call(client, settings);
            },
            testPort: async () => {
                if (typeof testPort !== "function") {
                    return { status: "unsupported" };
                }
                try {
                    const isOpen = await testPort.call(client);
                    return { status: isOpen ? "open" : "closed" };
                } catch (error) {
                    if (isRpcCommandError(error)) {
                        return { status: "offline" };
                    }
                    return { status: "failed" };
                }
            },
            detectEngine: async () => {
                if (typeof detectEngine !== "function") {
                    throw new Error(
                        "Engine detection not supported by this client",
                    );
                }
                return detectEngine.call(client);
            },
            resetConnection: () => {
                if (typeof client.resetConnection === "function") {
                    client.resetConnection();
                }
            },
            updateRequestTimeout: (timeout: number) => {
                client.updateRequestTimeout?.(timeout);
            },
        };
    }, [client]);
}

export function useEngineHeartbeatDomain(
    clientOverride?: EngineAdapter,
): EngineHeartbeatDomain {
    const contextClient = useTorrentClient();
    const client = getClient(clientOverride) ?? contextClient;
    return useMemo<EngineHeartbeatDomain>(
        () => ({
            subscribeTable: ({ pollingIntervalMs, onUpdate, onError }) =>
                client.subscribeToHeartbeat({
                    mode: "table",
                    pollingIntervalMs,
                    onUpdate,
                    onError,
                }),
            subscribeNonTable: ({
                mode,
                detailId,
                detailProfile,
                includeTrackerStats,
                pollingIntervalMs,
                onUpdate,
                onError,
            }) =>
                client.subscribeToHeartbeat({
                    mode,
                    detailId: detailId ?? null,
                    detailProfile,
                    includeTrackerStats,
                    pollingIntervalMs,
                    onUpdate,
                    onError,
                }),
        }),
        [client],
    );
}
