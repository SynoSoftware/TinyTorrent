import { STATUS } from "@/shared/status";
import { scheduler } from "@/app/services/scheduler";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type {
    AddTorrentPayload,
    AddTorrentResult,
    SessionStats,
    TorrentDetailEntity,
    TorrentEntity,
} from "@/services/rpc/entities";
import type {
    HeartbeatSubscriberParams,
    HeartbeatSubscription,
} from "@/services/rpc/heartbeat";
import type {
    EngineAdapter,
    EngineRuntimeCapabilities,
    TorrentDetailsRequestOptions,
} from "@/services/rpc/engine-adapter";
import type { TransmissionFreeSpace } from "@/services/rpc/types";
import {
    cloneDevErrorEnvelope,
    cloneDevTorrentDetail,
    type DevTestFaultMode,
} from "@/app/dev/recovery/scenarios";

const createFsError = (code: string, message: string) => {
    const err = new Error(message) as Error & { code?: string };
    err.code = code;
    return err;
};

export class DevTestAdapter implements EngineAdapter {
    private detail: TorrentDetailEntity;
    private faultMode: DevTestFaultMode;
    private verifyFails: boolean;
    private readonly verifyDelayMs = 450;
    private cancelVerifyTimeout: (() => void) | null = null;

    constructor(
        initialDetail: TorrentDetailEntity,
        initialFaultMode: DevTestFaultMode,
    ) {
        this.detail = cloneDevTorrentDetail(initialDetail);
        this.faultMode = initialFaultMode;
        this.verifyFails = false;
    }

    configure(params: {
        detail: TorrentDetailEntity;
        faultMode: DevTestFaultMode;
        verifyFails: boolean;
    }) {
        this.detail = cloneDevTorrentDetail(params.detail);
        this.faultMode = params.faultMode;
        this.verifyFails = params.verifyFails;
    }

    setFaultMode(mode: DevTestFaultMode) {
        this.faultMode = mode;
    }

    private throwFault(path: string): never {
        if (this.faultMode === "missing") {
            throw createFsError("ENOENT", `Path missing: ${path}`);
        }
        if (this.faultMode === "access_denied") {
            throw createFsError("EACCES", `Permission denied: ${path}`);
        }
        if (this.faultMode === "disk_full") {
            throw createFsError("ENOSPC", `Disk full: ${path}`);
        }
        throw createFsError("EUNKNOWN", `Unknown filesystem error: ${path}`);
    }

    private resolveDetail(): TorrentDetail {
        return cloneDevTorrentDetail(this.detail);
    }

    private updateDetail(next: Partial<TorrentDetailEntity>) {
        this.detail = {
            ...this.detail,
            ...next,
            speed: next.speed ? { ...next.speed } : { ...this.detail.speed },
            peerSummary: next.peerSummary
                ? { ...next.peerSummary }
                : { ...this.detail.peerSummary },
            errorEnvelope:
                next.errorEnvelope === undefined
                    ? cloneDevErrorEnvelope(this.detail.errorEnvelope)
                    : cloneDevErrorEnvelope(next.errorEnvelope),
        };
    }

    getCapabilities(): EngineRuntimeCapabilities {
        return {
            executionModel: "remote",
            hasHostFileSystemAccess: false,
            canCheckFreeSpace: true,
        };
    }

    async getTorrents(): Promise<TorrentEntity[]> {
        return [this.resolveDetail()];
    }

    async getTorrentDetails(
        id: string,
        options?: TorrentDetailsRequestOptions,
    ): Promise<TorrentDetailEntity> {
        void options;
        if (id !== this.detail.id) {
            throw new Error("torrent_not_found");
        }
        return this.resolveDetail();
    }

    async getSessionStats(): Promise<SessionStats> {
        return {
            downloadSpeed: this.detail.speed.down,
            uploadSpeed: this.detail.speed.up,
            torrentCount: 1,
            activeTorrentCount:
                this.detail.state === STATUS.torrent.DOWNLOADING ? 1 : 0,
            pausedTorrentCount:
                this.detail.state === STATUS.torrent.PAUSED ? 1 : 0,
        };
    }

    async addTorrent(payload: AddTorrentPayload): Promise<AddTorrentResult> {
        void payload;
        return {
            id: this.detail.id,
            rpcId: 1,
            name: this.detail.name,
            duplicate: false,
        };
    }

    async pause(ids: string[]): Promise<void> {
        void ids;
        this.updateDetail({
            state: STATUS.torrent.PAUSED,
            speed: { down: 0, up: 0 },
        });
    }

    async resume(ids: string[]): Promise<void> {
        void ids;
        if (this.faultMode !== "ok") {
            this.throwFault(
                this.detail.downloadDir ?? this.detail.savePath ?? "",
            );
        }
        this.updateDetail({
            state: STATUS.torrent.DOWNLOADING,
            speed: { down: 512_000, up: 64_000 },
            errorEnvelope: undefined,
            downloaded: this.detail.downloaded + 512_000,
            leftUntilDone: Math.max(
                0,
                (this.detail.leftUntilDone ?? 0) - 512_000,
            ),
        });
    }

    async remove(ids: string[], deleteData: boolean): Promise<void> {
        void ids;
        void deleteData;
        this.updateDetail({
            state: STATUS.torrent.PAUSED,
            speed: { down: 0, up: 0 },
        });
    }

    async verify(ids: string[]): Promise<void> {
        void ids;
        if (this.verifyFails) {
            throw createFsError("EIO", "verify_failed");
        }
        this.updateDetail({
            state: STATUS.torrent.CHECKING,
            verificationProgress: 0.2,
        });
        this.cancelVerifyTimeout?.();
        this.cancelVerifyTimeout = scheduler.scheduleTimeout(() => {
            this.updateDetail({
                state: STATUS.torrent.PAUSED,
                verificationProgress: 1,
            });
            this.cancelVerifyTimeout = null;
        }, this.verifyDelayMs);
    }

    async moveToTop(ids: string[]): Promise<void> {
        void ids;
    }

    async moveUp(ids: string[]): Promise<void> {
        void ids;
    }

    async moveDown(ids: string[]): Promise<void> {
        void ids;
    }

    async moveToBottom(ids: string[]): Promise<void> {
        void ids;
    }

    async updateFileSelection(
        id: string,
        indexes: number[],
        wanted: boolean,
    ): Promise<void> {
        void id;
        void indexes;
        void wanted;
    }

    async checkFreeSpace(path: string): Promise<TransmissionFreeSpace> {
        if (this.faultMode !== "ok") {
            this.throwFault(path);
        }
        return {
            path,
            sizeBytes: 200 * 1024 * 1024 * 1024,
            totalSize: 400 * 1024 * 1024 * 1024,
        };
    }

    async setTorrentLocation(
        id: string,
        location: string,
        moveData?: boolean,
    ): Promise<void> {
        void moveData;
        if (id !== this.detail.id) {
            throw new Error("torrent_not_found");
        }
        this.updateDetail({
            downloadDir: location,
            savePath: location,
        });
        this.faultMode = "ok";
    }

    subscribeToHeartbeat(
        params: HeartbeatSubscriberParams,
    ): HeartbeatSubscription {
        void params;
        return {
            unsubscribe() {},
        };
    }

    destroy(): void {
        this.cancelVerifyTimeout?.();
        this.cancelVerifyTimeout = null;
    }
}
