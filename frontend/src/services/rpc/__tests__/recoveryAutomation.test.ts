import { describe, it, expect, beforeEach } from "vitest";
import {
    processHeartbeat,
    configure,
    _resetForTests,
} from "@/services/rpc/recoveryAutomation";
import type {
    ErrorClass,
    RecoveryState,
    TorrentEntity,
} from "@/services/rpc/entities";

function makeTorrent(
    id: string,
    fp: string | null,
    errorClass: ErrorClass,
    recoveryState: RecoveryState
): TorrentEntity {
    return {
        id,
        hash: id,
        name: "t" + id,
        progress: 0,
        state: "paused",
        speed: { down: 0, up: 0 },
        peerSummary: { connected: 0 },
        totalSize: 0,
        eta: -1,
        ratio: 0,
        uploaded: 0,
        downloaded: 0,
        added: Date.now(),
        error: 3,
        errorString: undefined,
        errorEnvelope: {
            errorClass,
            errorMessage: null,
            lastErrorAt: null,
            recoveryState,
            retryCount: null,
            nextRetryAt: null,
            recoveryActions: [],
            automationHint: null,
            fingerprint: fp,
            primaryAction: null,
        },
    };
}

describe("recoveryAutomation", () => {
    beforeEach(() => {
        _resetForTests();
    });

    it("stamps and preserves lastErrorAt for repeated fingerprint heartbeats", () => {
        configure({ coolDownMs: 1000 });
        const t1 = makeTorrent("1", "fp1", "diskFull", "blocked");
        processHeartbeat([t1], undefined);
        expect(typeof t1.errorEnvelope!.lastErrorAt).toBe("number");
        const first = t1.errorEnvelope!.lastErrorAt as number;

        const prev1: TorrentEntity[] = [t1];
        const t2 = makeTorrent("1", "fp1", "diskFull", "blocked");
        processHeartbeat([t2], prev1);
        expect(t2.errorEnvelope!.lastErrorAt).toBe(first);
    });

    it("resets lastErrorAt when fingerprint changes and clears on errorClass none", () => {
        const t1 = makeTorrent("2", "fpA", "diskFull", "blocked");
        processHeartbeat([t1], undefined);
        expect(typeof t1.errorEnvelope!.lastErrorAt).toBe("number");
        const prev: TorrentEntity[] = [t1];
        const t2 = makeTorrent("2", "fpB", "diskFull", "blocked");
        processHeartbeat([t2], prev);
        expect(typeof t2.errorEnvelope!.lastErrorAt).toBe("number");

        const prev2: TorrentEntity[] = [t2];
        const t3 = makeTorrent("2", null, "none", "ok");
        processHeartbeat([t3], prev2);
        expect(t3.errorEnvelope!.lastErrorAt).toBeNull();
    });

    it("stamping remains stable across suppressed cooldowns", () => {
        _resetForTests();
        configure({ coolDownMs: 60_000 });
        const t7 = makeTorrent(
            "7",
            "fpS",
            "trackerWarning",
            "transientWaiting"
        );
        processHeartbeat([t7], undefined);
        expect(typeof t7.errorEnvelope!.lastErrorAt).toBe("number");
        const stamped = t7.errorEnvelope!.lastErrorAt as number;
        const prev7: TorrentEntity[] = [t7];
        const t8 = makeTorrent(
            "7",
            "fpS",
            "trackerWarning",
            "transientWaiting"
        );
        processHeartbeat([t8], prev7);
        expect(t8.errorEnvelope!.lastErrorAt).toBe(stamped);
    });
});
