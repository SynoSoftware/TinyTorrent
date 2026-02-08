import { useMemo } from "react";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { EngineInfo, SessionStats } from "@/services/rpc/entities";
import type {
    HeartbeatErrorEvent,
    HeartbeatMode,
    HeartbeatPayload,
} from "@/services/rpc/heartbeat";
import type { TransmissionSessionSettings } from "@/services/rpc/types";
import {
    getSpeedHistoryStore,
    type SpeedHistorySnapshot,
} from "@/shared/hooks/speedHistoryStore";

type TableSubscriptionParams = {
    pollingIntervalMs?: number;
    onUpdate: (payload: HeartbeatPayload) => void;
    onError: (event: HeartbeatErrorEvent) => void;
};

type NonTableSubscriptionParams = {
    mode: Exclude<HeartbeatMode, "table">;
    detailId?: string | null;
    pollingIntervalMs?: number;
    onUpdate: (payload: HeartbeatPayload) => void;
    onError: (event: HeartbeatErrorEvent) => void;
};

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
    testPort: () => Promise<boolean>;
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

export interface EngineSpeedHistoryDomain {
    watch: (id: string) => () => void;
    subscribe: (listener: () => void) => () => void;
    get: (id: string) => SpeedHistorySnapshot;
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
                // TODO(section 20.2/20.5): return typed test-port outcomes instead of boolean/throw.
                if (typeof testPort !== "function") {
                    throw new Error("settings.modal.error_test_port");
                }
                return testPort.call(client);
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
                pollingIntervalMs,
                onUpdate,
                onError,
            }) =>
                client.subscribeToHeartbeat({
                    mode,
                    detailId: detailId ?? null,
                    pollingIntervalMs,
                    onUpdate,
                    onError,
                }),
        }),
        [client],
    );
}

export function useEngineSpeedHistoryDomain(
    clientOverride?: EngineAdapter,
): EngineSpeedHistoryDomain {
    const contextClient = useTorrentClient();
    const client = getClient(clientOverride) ?? contextClient;
    const store = useMemo(() => getSpeedHistoryStore(client), [client]);

    return useMemo<EngineSpeedHistoryDomain>(
        () => ({
            watch: (id) => store.watch(id),
            subscribe: (listener) => store.subscribe(listener),
            get: (id) => store.get(id),
        }),
        [store],
    );
}
