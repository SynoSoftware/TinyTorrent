function expect(cond: boolean, msg: string) {
    if (!cond) throw new Error(msg);
}
import {
    processHeartbeat,
    configure,
    _resetForTests,
} from "../services/rpc/recoveryAutomation.ts";
import type { ErrorEnvelope, TorrentEntity } from "../services/rpc/entities.ts";

function makeTorrent(
    id: string,
    fp: string | null,
    errorClass: string,
    recoveryState: string
): TorrentEntity {
    const env: ErrorEnvelope = {
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
    };
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
        errorEnvelope: env,
    };
    return result as TorrentEntity;
}

export async function runAllTests() {
    console.log("Running recoveryAutomation tests...");

    // Test 1: stable lastErrorAt across repeated heartbeats same fingerprint
    _resetForTests();
    configure({ coolDownMs: 1000 });

    const t1 = makeTorrent("1", "fp1", "diskFull", "blocked");
    processHeartbeat([t1], undefined);
    expect(
        !!(
            t1.errorEnvelope && typeof t1.errorEnvelope.lastErrorAt === "number"
        ),
        "first heartbeat should stamp lastErrorAt"
    );
    const first = t1.errorEnvelope!.lastErrorAt as number;

    // prepare previous snapshot (clone)
    const prev1 = [{ ...t1, errorEnvelope: { ...t1.errorEnvelope } }];
    const t2 = makeTorrent("1", "fp1", "diskFull", "blocked");
    processHeartbeat([t2], prev1 as any);
    expect(
        !!(t2.errorEnvelope && t2.errorEnvelope.lastErrorAt === first),
        "lastErrorAt must be stable across same fingerprint"
    );

    // Test 2: fingerprint change resets lastErrorAt
    const prev2 = [{ ...t2, errorEnvelope: { ...t2.errorEnvelope } }];
    const t3 = makeTorrent("1", "fp2", "diskFull", "blocked");
    processHeartbeat([t3], prev2 as any);
    expect(
        !!(
            t3.errorEnvelope && typeof t3.errorEnvelope.lastErrorAt === "number"
        ),
        "new fingerprint should have a timestamp"
    );

    // Test 3: lastErrorAt cleared on errorClass none
    const prev3 = [{ ...t3, errorEnvelope: { ...t3.errorEnvelope } }];
    const t4 = makeTorrent("1", null, "none", "ok");
    processHeartbeat([t4], prev3 as any);
    expect(
        !!(t4.errorEnvelope && t4.errorEnvelope.lastErrorAt === null),
        "errorClass none must clear lastErrorAt"
    );

    // Test 4 removed: auto-pause automation is no longer present in recoveryAutomation

    // Test 5: cooldown suppression does not prevent stamping lastErrorAt
    _resetForTests();
    configure({ coolDownMs: 60_000 });
    // simulate prior action just now to force suppression if suppression would apply
    const t7 = makeTorrent("7", "fpS", "trackerWarning", "transientWaiting");
    // first heartbeat, stamp
    processHeartbeat([t7], undefined);
    expect(
        !!(
            t7.errorEnvelope && typeof t7.errorEnvelope.lastErrorAt === "number"
        ),
        "initial stamp on trackerWarning"
    );
    const stamped = t7.errorEnvelope!.lastErrorAt as number;
    // craft previous as snapshot
    const prev7 = [{ ...t7, errorEnvelope: { ...t7.errorEnvelope } }];
    // Call processHeartbeat with previous==prev7 and current with same fingerprint; stamping should remain stable
    const t8 = makeTorrent("7", "fpS", "trackerWarning", "transientWaiting");
    processHeartbeat([t8], prev7 as any);
    expect(
        !!(t8.errorEnvelope && t8.errorEnvelope.lastErrorAt === stamped),
        "stamping must remain stable even when suppressed"
    );

    console.log("All recoveryAutomation tests passed");
}
