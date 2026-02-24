import React, { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { useRecoveryState } from "@/modules/dashboard/hooks/useRecoveryState";
import type { UseRecoveryStateResult } from "@/modules/dashboard/hooks/useRecoveryState";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { MissingFilesClassification } from "@/services/recovery/recovery-controller";
import STATUS from "@/shared/status";
import { getRecoveryFingerprint } from "@/app/domain/recoveryUtils";

type RecoveryStateRef = {
    current: UseRecoveryStateResult | null;
};

const BASE_TORRENT: Torrent = {
    id: "torrent-a",
    hash: "hash-a",
    name: "Torrent A",
    state: STATUS.torrent.MISSING_FILES,
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0 },
    totalSize: 1,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
};

const CLASSIFICATION: MissingFilesClassification = {
    kind: "pathLoss",
    confidence: "likely",
    path: "D:\\Data",
    recommendedActions: ["locate"],
    escalationSignal: "none",
};

const DEFAULT_TORRENTS: Torrent[] = [
    BASE_TORRENT,
    {
        ...BASE_TORRENT,
        id: "torrent-b",
        hash: "hash-b",
        name: "Torrent B",
    },
    {
        ...BASE_TORRENT,
        id: "torrent-c",
        hash: "hash-c",
        name: "Torrent C",
    },
];

function RecoveryStateHarness({ controllerRef, torrents }: { controllerRef: RecoveryStateRef; torrents: Torrent[] }) {
    const recoveryState = useRecoveryState({
        torrents,
        detailData: null,
    });
    useEffect(() => {
        controllerRef.current = recoveryState;
    }, [controllerRef, recoveryState]);
    return null;
}

const waitForCondition = async (predicate: () => boolean, timeoutMs = 1500): Promise<void> => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (predicate()) {
            return;
        }
        await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 20);
        });
    }
    throw new Error("wait_for_condition_timeout");
};

const readController = (controllerRef: RecoveryStateRef): UseRecoveryStateResult => {
    if (!controllerRef.current) {
        throw new Error("controller_not_ready");
    }
    return controllerRef.current;
};

const mountHarness = async (
    initialTorrents: Torrent[] = DEFAULT_TORRENTS,
): Promise<{
    controllerRef: RecoveryStateRef;
    rerender: (torrents: Torrent[]) => void;
    cleanup: () => void;
}> => {
    const controllerRef: RecoveryStateRef = { current: null };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(
        React.createElement(RecoveryStateHarness, {
            controllerRef,
            torrents: initialTorrents,
        }),
    );
    await waitForCondition(() => controllerRef.current !== null);
    return {
        controllerRef,
        rerender: (torrents: Torrent[]) => {
            root.render(
                React.createElement(RecoveryStateHarness, {
                    controllerRef,
                    torrents,
                }),
            );
        },
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("useRecoveryState queue ownership", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("deduplicates queued entries by fingerprint and shares completion promise", async () => {
        const mounted = await mountHarness();
        try {
            const controller = readController(mounted.controllerRef);
            const activeEntry = readController(mounted.controllerRef).createRecoveryQueueEntry(
                BASE_TORRENT,
                "resume",
                {
                    kind: "needs-user-decision",
                    reason: "missing",
                    message: "path_check_failed",
                },
                CLASSIFICATION,
                "fp-a",
            );
            const queuedEntry = readController(mounted.controllerRef).createRecoveryQueueEntry(
                {
                    ...BASE_TORRENT,
                    id: "torrent-b",
                    hash: "hash-b",
                    name: "Torrent B",
                },
                "downloadMissing",
                {
                    kind: "needs-user-decision",
                    reason: "missing",
                    message: "path_check_failed",
                },
                CLASSIFICATION,
                "fp-b",
            );
            const queuedDuplicate = controller.createRecoveryQueueEntry(
                {
                    ...BASE_TORRENT,
                    id: "torrent-b-duplicate",
                    hash: "hash-b-duplicate",
                    name: "Torrent B Duplicate",
                },
                "downloadMissing",
                {
                    kind: "needs-user-decision",
                    reason: "missing",
                    message: "path_check_failed",
                },
                CLASSIFICATION,
                "fp-b",
            );

            controller.enqueueRecoveryEntry(activeEntry);
            const queuedPromise = controller.enqueueRecoveryEntry(queuedEntry);
            const duplicatePromise = controller.enqueueRecoveryEntry(queuedDuplicate);

            expect(duplicatePromise).toBe(queuedPromise);
            await waitForCondition(() => readController(mounted.controllerRef).state.queuedCount === 1);

            controller.finalizeRecovery({ status: "cancelled" });
            await waitForCondition(
                () => readController(mounted.controllerRef).state.session?.torrent.id === "torrent-b",
            );

            controller.finalizeRecovery({ status: "handled" });
            await expect(queuedPromise).resolves.toEqual({ status: "handled" });
            await expect(duplicatePromise).resolves.toEqual({ status: "handled" });
        } finally {
            mounted.cleanup();
        }
    });

    it("advances queued sessions one-at-a-time when active session finalizes", async () => {
        const mounted = await mountHarness();
        try {
            const controller = readController(mounted.controllerRef);
            const entryA = controller.createRecoveryQueueEntry(
                BASE_TORRENT,
                "resume",
                {
                    kind: "needs-user-decision",
                    reason: "missing",
                    message: "path_check_failed",
                },
                CLASSIFICATION,
                "fp-a",
            );
            const entryB = controller.createRecoveryQueueEntry(
                {
                    ...BASE_TORRENT,
                    id: "torrent-b",
                    hash: "hash-b",
                    name: "Torrent B",
                },
                "resume",
                {
                    kind: "needs-user-decision",
                    reason: "missing",
                    message: "path_check_failed",
                },
                CLASSIFICATION,
                "fp-b",
            );
            const entryC = controller.createRecoveryQueueEntry(
                {
                    ...BASE_TORRENT,
                    id: "torrent-c",
                    hash: "hash-c",
                    name: "Torrent C",
                },
                "resume",
                {
                    kind: "needs-user-decision",
                    reason: "missing",
                    message: "path_check_failed",
                },
                CLASSIFICATION,
                "fp-c",
            );

            controller.enqueueRecoveryEntry(entryA);
            controller.enqueueRecoveryEntry(entryB);
            controller.enqueueRecoveryEntry(entryC);

            await waitForCondition(() => readController(mounted.controllerRef).state.queuedCount === 2);

            controller.finalizeRecovery({ status: "cancelled" });
            await waitForCondition(
                () => readController(mounted.controllerRef).state.session?.torrent.id === "torrent-b",
            );
            expect(readController(mounted.controllerRef).state.queuedCount).toBe(1);

            controller.finalizeRecovery({ status: "cancelled" });
            await waitForCondition(
                () => readController(mounted.controllerRef).state.session?.torrent.id === "torrent-c",
            );
            expect(readController(mounted.controllerRef).state.queuedCount).toBe(0);

            controller.finalizeRecovery({ status: "cancelled" });
            await waitForCondition(() => readController(mounted.controllerRef).state.session === null);
        } finally {
            mounted.cleanup();
        }
    });

    it("cancels an active recovery during auto-close window without allowing stale finalize", async () => {
        const mounted = await mountHarness();
        try {
            const entry = readController(mounted.controllerRef).createRecoveryQueueEntry(
                BASE_TORRENT,
                "resume",
                {
                    kind: "needs-user-decision",
                    reason: "missing",
                    message: "path_check_failed",
                },
                CLASSIFICATION,
                "fp-autoclose-cancel",
            );
            const completion = readController(mounted.controllerRef).enqueueRecoveryEntry(entry);
            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session));
            const scheduled = readController(mounted.controllerRef).scheduleRecoveryFinalize(
                2_000,
                { status: "handled" },
                {
                    kind: "auto-recovered",
                    message: "path_ready",
                },
            );
            expect(scheduled).toBe(true);
            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session?.autoCloseAtMs));

            readController(mounted.controllerRef).cancelRecoveryForFingerprint(getRecoveryFingerprint(BASE_TORRENT), {
                status: "cancelled",
            });
            await expect(completion).resolves.toEqual({ status: "cancelled" });
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 2_100);
            });
            expect(readController(mounted.controllerRef).state.session).toBeNull();
        } finally {
            mounted.cleanup();
        }
    });

    it("auto-closes a resolved recovery session after countdown without reopening", async () => {
        const mounted = await mountHarness();
        try {
            const controller = readController(mounted.controllerRef);
            const entry = controller.createRecoveryQueueEntry(
                BASE_TORRENT,
                "resume",
                {
                    kind: "needs-user-decision",
                    reason: "missing",
                    message: "path_check_failed",
                },
                CLASSIFICATION,
                "fp-autoclose-positive",
            );
            const completion = controller.enqueueRecoveryEntry(entry);
            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session));

            const scheduled = controller.scheduleRecoveryFinalize(
                150,
                { status: "handled" },
                {
                    kind: "auto-recovered",
                    message: "path_ready",
                },
            );
            expect(scheduled).toBe(true);
            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session?.autoCloseAtMs));

            await expect(completion).resolves.toEqual({ status: "handled" });
            await waitForCondition(() => readController(mounted.controllerRef).state.session === null);

            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 250);
            });
            expect(readController(mounted.controllerRef).state.session).toBeNull();
            expect(readController(mounted.controllerRef).state.queuedCount).toBe(0);
        } finally {
            mounted.cleanup();
        }
    });

    it("advances queued recovery exactly once when active ownership is invalidated during auto-close overlap", async () => {
        const mounted = await mountHarness();
        try {
            const controller = readController(mounted.controllerRef);
            const activeEntry = controller.createRecoveryQueueEntry(
                BASE_TORRENT,
                "resume",
                {
                    kind: "needs-user-decision",
                    reason: "missing",
                    message: "path_check_failed",
                },
                CLASSIFICATION,
                "fp-active-overlap",
            );
            const queuedEntry = controller.createRecoveryQueueEntry(
                {
                    ...BASE_TORRENT,
                    id: "torrent-b",
                    hash: "hash-b",
                    name: "Torrent B",
                },
                "resume",
                {
                    kind: "needs-user-decision",
                    reason: "missing",
                    message: "path_check_failed",
                },
                CLASSIFICATION,
                "fp-queued-overlap",
            );

            const activeCompletion = readController(mounted.controllerRef).enqueueRecoveryEntry(activeEntry);
            const queuedCompletion = readController(mounted.controllerRef).enqueueRecoveryEntry(queuedEntry);
            await waitForCondition(
                () => readController(mounted.controllerRef).state.session?.torrent.id === "torrent-a",
            );
            expect(readController(mounted.controllerRef).state.queuedCount).toBe(1);

            const scheduled = readController(mounted.controllerRef).scheduleRecoveryFinalize(
                2_000,
                { status: "handled" },
                {
                    kind: "auto-recovered",
                    message: "path_ready",
                },
            );
            expect(scheduled).toBe(true);

            readController(mounted.controllerRef).cancelRecoveryForFingerprint(getRecoveryFingerprint(BASE_TORRENT), {
                status: "cancelled",
            });
            await expect(activeCompletion).resolves.toEqual({ status: "cancelled" });

            await waitForCondition(
                () => readController(mounted.controllerRef).state.session?.torrent.id === "torrent-b",
            );
            expect(readController(mounted.controllerRef).state.queuedCount).toBe(0);

            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 2_100);
            });
            expect(readController(mounted.controllerRef).state.session?.torrent.id).toBe("torrent-b");

            readController(mounted.controllerRef).finalizeRecovery({
                status: "cancelled",
            });
            await expect(queuedCompletion).resolves.toEqual({ status: "cancelled" });
            await waitForCondition(() => readController(mounted.controllerRef).state.session === null);
        } finally {
            mounted.cleanup();
        }
    });

    it("clears auto-paused-by-recovery ownership after successful resume", async () => {
        const mounted = await mountHarness();
        try {
            const controller = readController(mounted.controllerRef);
            const fingerprint = "fp-resume-clear";

            controller.markRecoveryPausedBySystem(fingerprint);
            expect(controller.getRecoveryPauseOrigin(fingerprint)).toBe("recovery");
            expect(controller.isBackgroundRecoveryEligible(fingerprint)).toBe(true);

            controller.markRecoveryResumed(fingerprint);

            expect(controller.getRecoveryPauseOrigin(fingerprint)).toBeNull();
            expect(controller.isRecoveryCancelled(fingerprint)).toBe(false);
            expect(controller.isBackgroundRecoveryEligible(fingerprint)).toBe(false);
        } finally {
            mounted.cleanup();
        }
    });

    it("stops retry eligibility when system pause ownership becomes user pause", async () => {
        const mounted = await mountHarness();
        try {
            const controller = readController(mounted.controllerRef);
            const fingerprint = "fp-pause-origin";

            controller.markRecoveryPausedBySystem(fingerprint);
            expect(controller.isBackgroundRecoveryEligible(fingerprint)).toBe(true);

            controller.markRecoveryPausedByUser(fingerprint);

            expect(controller.getRecoveryPauseOrigin(fingerprint)).toBe("user");
            expect(controller.isRecoveryCancelled(fingerprint)).toBe(true);
            expect(controller.isBackgroundRecoveryEligible(fingerprint)).toBe(false);
        } finally {
            mounted.cleanup();
        }
    });

    it("marks cancelled recovery as ineligible until a new resume cycle starts", async () => {
        const mounted = await mountHarness();
        try {
            const controller = readController(mounted.controllerRef);
            const fingerprint = "fp-cancelled";

            controller.markRecoveryPausedBySystem(fingerprint);
            expect(controller.isBackgroundRecoveryEligible(fingerprint)).toBe(true);

            controller.markRecoveryCancelled(fingerprint);
            expect(controller.getRecoveryPauseOrigin(fingerprint)).toBeNull();
            expect(controller.isRecoveryCancelled(fingerprint)).toBe(true);
            expect(controller.isBackgroundRecoveryEligible(fingerprint)).toBe(false);

            controller.markRecoveryResumed(fingerprint);
            expect(controller.isRecoveryCancelled(fingerprint)).toBe(false);
        } finally {
            mounted.cleanup();
        }
    });

    it("keeps unknown pause ownership ineligible for background recovery", async () => {
        const mounted = await mountHarness();
        try {
            const controller = readController(mounted.controllerRef);
            const fingerprint = "fp-unknown-origin";

            expect(controller.getRecoveryPauseOrigin(fingerprint)).toBeNull();
            expect(controller.isRecoveryCancelled(fingerprint)).toBe(false);
            expect(controller.isBackgroundRecoveryEligible(fingerprint)).toBe(false);
        } finally {
            mounted.cleanup();
        }
    });

    it("clears pause ownership when torrent becomes active even with stale actionable envelope", async () => {
        const mounted = await mountHarness([
            {
                ...BASE_TORRENT,
                state: STATUS.torrent.PAUSED,
                errorEnvelope: {
                    errorClass: "permissionDenied",
                    errorMessage: "access_denied",
                    lastErrorAt: Date.now(),
                    recoveryState: "blocked",
                    recoveryActions: [],
                },
            },
        ]);
        try {
            const controller = readController(mounted.controllerRef);
            const fingerprint = "hash-a";
            controller.markRecoveryPausedBySystem(fingerprint);
            expect(controller.getRecoveryPauseOrigin(fingerprint)).toBe("recovery");
            expect(controller.isBackgroundRecoveryEligible(fingerprint)).toBe(true);

            mounted.rerender([
                {
                    ...BASE_TORRENT,
                    state: STATUS.torrent.DOWNLOADING,
                    errorEnvelope: {
                        errorClass: "permissionDenied",
                        errorMessage: "stale_error_metadata",
                        lastErrorAt: Date.now(),
                        recoveryState: "blocked",
                        recoveryActions: [],
                    },
                },
            ]);

            await waitForCondition(
                () => readController(mounted.controllerRef).getRecoveryPauseOrigin(fingerprint) === null,
            );
            expect(controller.isBackgroundRecoveryEligible(fingerprint)).toBe(false);
        } finally {
            mounted.cleanup();
        }
    });
});
