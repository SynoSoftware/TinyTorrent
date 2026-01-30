import type {
    EngineInfo,
    TorrentDetailEntity,
    TorrentEntity,
    AddTorrentPayload,
    AddTorrentResult,
    SessionStats,
    ServerClass,
} from "./entities";
// TODO: Remove `TinyTorrentCapabilities` once RPC extensions are removed; Transmission RPC is the only daemon contract.
// TODO: Deprecate `ServerClass` as a UX concept; keep only if needed for diagnostics/logging (see `src/services/rpc/entities.ts`).
import type {
    TransmissionSessionSettings,
    TransmissionFreeSpace,
} from "./types";
import type {
    HeartbeatSubscriberParams,
    HeartbeatSubscription,
} from "./heartbeat";

export type EngineExecutionModel = "local" | "remote";

export interface EngineCapabilities {
    executionModel: EngineExecutionModel;
    hasHostFileSystemAccess: boolean;
    canCheckFreeSpace: boolean;
    canCreateDirectory: boolean;
}

export const DEFAULT_ENGINE_CAPABILITIES: EngineCapabilities = {
    executionModel: "remote",
    hasHostFileSystemAccess: false,
    canCheckFreeSpace: false,
    canCreateDirectory: false,
};

export interface EngineAdapter {
    getServerClass?(): ServerClass;
    // TODO: Remove `getServerClass`. Daemon identity should not drive UI capabilities; Transmission-only.
    getCapabilities?(): EngineCapabilities;
    handshake?(): Promise<unknown>;
    notifyUiReady?(): Promise<void>;
    notifyUiDetached?(): Promise<void>;
    // TODO: Remove `notifyUiReady/notifyUiDetached` once `session-ui-attach/detach` is deleted (RPC extensions: NONE).
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
    createDirectory?(path: string): Promise<void>;
    // TODO: Remove `createDirectory` from EngineAdapter. Directory creation is a host filesystem operation and must be handled by ShellAgent (local-only) rather than daemon RPC.
    getSpeedHistory?(id: string): Promise<{ down: number[]; up: number[] }>;
    destroy?(): void;
    resetConnection?(): void;
}
