import { useMemo } from "react";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { subscribeToTableHeartbeat } from "@/app/services/tableHeartbeat";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { EngineInfo, SessionStats } from "@/services/rpc/entities";
import type { HeartbeatMode, HeartbeatPayload } from "@/services/rpc/heartbeat";
import type { TransmissionSessionSettings } from "@/services/rpc/types";
import {
    getSpeedHistoryStore,
    type SpeedHistorySnapshot,
} from "@/shared/hooks/speedHistoryStore";

type TableSubscriptionParams = {
    pollingIntervalMs?: number;
    onUpdate: (payload: HeartbeatPayload) => void;
    onError?: () => void;
};

type NonTableSubscriptionParams = {
    mode: Exclude<HeartbeatMode, "table">;
    detailId?: string | null;
    pollingIntervalMs?: number;
    onUpdate: (payload: HeartbeatPayload) => void;
    onError?: () => void;
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
        const fetchSessionSettings = client.fetchSessionSettings?.bind(client);
        const updateSessionSettings = client.updateSessionSettings?.bind(client);
        const testPort = client.testPort?.bind(client);
        const detectEngine = client.detectEngine?.bind(client);
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
                if (fetchSessionSettings) {
                    await fetchSessionSettings();
                    return;
                }
                await client.getSessionStats();
            },
            getSessionStats: () => client.getSessionStats(),
            fetchSessionSettings: async () => {
                if (!fetchSessionSettings) {
                    throw new Error(
                        "Session settings not supported by the torrent client",
                    );
                }
                return fetchSessionSettings();
            },
            updateSessionSettings: async (
                settings: Partial<TransmissionSessionSettings>,
            ) => {
                if (!updateSessionSettings) {
                    throw new Error(
                        "Session settings not supported by this client",
                    );
                }
                await updateSessionSettings(settings);
            },
            testPort: async () => {
                if (!testPort) {
                    throw new Error("settings.modal.error_test_port");
                }
                return testPort();
            },
            detectEngine: async () => {
                if (!detectEngine) {
                    throw new Error(
                        "Engine detection not supported by this client",
                    );
                }
                return detectEngine();
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
                subscribeToTableHeartbeat({
                    client,
                    pollingIntervalMs,
                    onUpdate,
                    onError: onError ?? (() => {}),
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
                    onError: onError ?? (() => {}),
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
