import { describe, it, expect, beforeEach } from "vitest";
import {
    processHeartbeat,
    configure,
    _resetForTests,
} from "@/services/rpc/recoveryAutomation";

function makeTorrent(
    id: string,
    fp: string | null,
    errorClass: string,
    recoveryState: string
) {
    const result: any = {
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
        errorString: null,
        errorEnvelope: {
            errorClass: errorClass as any,
            errorMessage: null,
            lastErrorAt: null,
            recoveryState: recoveryState as any,
            retryCount: null,
            nextRetryAt: null,
            recoveryActions: [],
            automationHint: null,
            fingerprint: fp,
            primaryAction: null,
        },
    };
    return result;
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

        const prev1 = [{ ...t1, errorEnvelope: { ...t1.errorEnvelope } }];
        const t2 = makeTorrent("1", "fp1", "diskFull", "blocked");
        processHeartbeat([t2], prev1 as any);
        expect(t2.errorEnvelope!.lastErrorAt).toBe(first);
    });

    it("resets lastErrorAt when fingerprint changes and clears on errorClass none", () => {
        const t1 = makeTorrent("2", "fpA", "diskFull", "blocked");
        processHeartbeat([t1], undefined);
        expect(typeof t1.errorEnvelope!.lastErrorAt).toBe("number");
        const prev = [{ ...t1, errorEnvelope: { ...t1.errorEnvelope } }];
        const t2 = makeTorrent("2", "fpB", "diskFull", "blocked");
        processHeartbeat([t2], prev as any);
        expect(typeof t2.errorEnvelope!.lastErrorAt).toBe("number");

        const prev2 = [{ ...t2, errorEnvelope: { ...t2.errorEnvelope } }];
        const t3 = makeTorrent("2", null, "none", "ok");
        processHeartbeat([t3], prev2 as any);
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
        const prev7 = [{ ...t7, errorEnvelope: { ...t7.errorEnvelope } }];
        const t8 = makeTorrent(
            "7",
            "fpS",
            "trackerWarning",
            "transientWaiting"
        );
        processHeartbeat([t8], prev7 as any);
        expect(t8.errorEnvelope!.lastErrorAt).toBe(stamped);
    });
});
