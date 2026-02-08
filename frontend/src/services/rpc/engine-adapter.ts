import type {
    EngineInfo,
    TorrentDetailEntity,
    TorrentEntity,
    AddTorrentPayload,
    AddTorrentResult,
    SessionStats,
    ServerClass,
} from "@/services/rpc/entities";
import type {
    TransmissionSessionSettings,
    TransmissionFreeSpace,
} from "@/services/rpc/types";
import type {
    HeartbeatSubscriberParams,
    HeartbeatSubscription,
} from "@/services/rpc/heartbeat";

export type EngineExecutionModel = "local" | "remote";

export interface EngineCapabilities {
    executionModel: EngineExecutionModel;
    hasHostFileSystemAccess: boolean;
    canCheckFreeSpace: boolean;
}

export const DEFAULT_ENGINE_CAPABILITIES: EngineCapabilities = {
    executionModel: "remote",
    hasHostFileSystemAccess: false,
    canCheckFreeSpace: false,
};

export interface EngineAdapter {
    getServerClass?(): ServerClass;
    getCapabilities?(): EngineCapabilities;
    handshake?(): Promise<unknown>;
    notifyUiReady?(): Promise<void>;
    notifyUiDetached?(): Promise<void>;
    fetchSessionSettings?(): Promise<TransmissionSessionSettings>;
    updateSessionSettings?(
        settings: Partial<TransmissionSessionSettings>
    ): Promise<void>;
    testPort?(): Promise<boolean>;
    checkFreeSpace?(path: string): Promise<TransmissionFreeSpace>;
    getTorrents(): Promise<TorrentEntity[]>;
    getTorrentDetails(id: string): Promise<TorrentDetailEntity>;
    fetchNetworkTelemetry?(): Promise<
        import("./entities").NetworkTelemetry | null
    >;
    getSessionStats(): Promise<SessionStats>;
    addTorrent(payload: AddTorrentPayload): Promise<AddTorrentResult>;
    pause(ids: string[]): Promise<void>;
    resume(ids: string[]): Promise<void>;
    remove(ids: string[], deleteData: boolean): Promise<void>;
    verify(ids: string[]): Promise<void>;
    moveToTop(ids: string[]): Promise<void>;
    moveUp(ids: string[]): Promise<void>;
    moveDown(ids: string[]): Promise<void>;
    moveToBottom(ids: string[]): Promise<void>;
    updateFileSelection(
        id: string,
        indexes: number[],
        wanted: boolean
    ): Promise<void>;
    setTorrentLocation?(
        id: string,
        location: string,
        moveData?: boolean
    ): Promise<void>;
    setSequentialDownload?(id: string, enabled: boolean): Promise<void>;
    setSuperSeeding?(id: string, enabled: boolean): Promise<void>;
    forceTrackerReannounce?(id: string): Promise<void>;
    detectEngine?(): Promise<EngineInfo>;
    updateRequestTimeout?(timeout: number): void;
    subscribeToHeartbeat(
        params: HeartbeatSubscriberParams
    ): HeartbeatSubscription;
    getSpeedHistory?(id: string): Promise<{ down: number[]; up: number[] }>;
    destroy(): void;
    resetConnection?(): void;
}
