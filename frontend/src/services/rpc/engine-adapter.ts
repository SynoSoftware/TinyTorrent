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

export interface EngineAdapter {
    getServerClass?(): ServerClass;
    // TODO: Remove `getServerClass`. Daemon identity should not drive UI capabilities; Transmission-only.
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
    getServerCapabilities?: () => ServerCapabilities;
}

export interface ServerCapabilities {
    host: string;
    serverClass: ServerClass;
    supportsOpenFolder: boolean;
    supportsSetLocation: boolean;
    supportsManual: boolean;
}
// TODO: These flags are UI-facing capabilities, but this type currently mixes two concepts:
// TODO: - daemon/protocol identity (`serverClass`)
// TODO: - UI runtime/bridge capabilities (open folder, browse, set-location)
// TODO: With the new model:
// TODO: - The daemon is Transmission RPC (no RPC extensions), so `serverClass` should not drive “full vs limited” UX.
// TODO: - Introduce `UiMode = "Full" | "Rpc"` derived from (a) endpoint is loopback + (b) ShellAgent/ShellExtensions bridge available.
// TODO: - UI should only branch on UiMode (TinyTorrent vs Transmission UX). Protocol “server class” (if retained at all) must be treated as debug-only.
// TODO: Replace `ServerCapabilities` with a UI-level `UiCapabilities` / `UiMode` output from a single provider/helper:
// TODO: - `UiMode=Full`: ShellExtensions actions enabled (browse directory, open folder, system integration)
// TODO: - `UiMode=Rpc`: ShellExtensions actions disabled (manual path entry may still be allowed as a UI policy)
// TODO: Standardize wording: use “ShellAgent/ShellExtensions” (not “HostAgent”) across code/docs/comments to match our chosen term.
