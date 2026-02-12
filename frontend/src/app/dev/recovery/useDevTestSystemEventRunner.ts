import { useCallback, useMemo, useState } from "react";
import type { RecoveryRequestCompletionOutcome } from "@/app/context/RecoveryContext";
import { scheduler } from "@/app/services/scheduler";
import { RECOVERY_POLL_INTERVAL_MS } from "@/config/logic";
import { STATUS } from "@/shared/status";
import {
    cloneDevTorrentDetail,
    DEV_RECOVERY_TORRENT_ID,
    type DevTestFaultMode,
    type DevTestScenarioDefinition,
    type DevTestScenarioId,
} from "@/app/dev/recovery/scenarios";
import type { DevTestController } from "@/app/dev/recovery/useDevTestController";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export type RecoverySystemEventRunStatus =
    | "idle"
    | "running"
    | "passed"
    | "failed";

export type RecoverySystemEventCaseId =
    | "disk_space_restored"
    | "volume_replugged"
    | "path_restored"
    | "permissions_restored";

type RecoverySystemEventCase = {
    id: RecoverySystemEventCaseId;
    scenarioId: DevTestScenarioId;
    expectedKind: DevTestScenarioDefinition["kind"];
    initialFaultMode: DevTestFaultMode;
    verifyFails: boolean;
    labelKey: string;
    eventKey: string;
};

export type RecoverySystemEventCaseResult = {
    caseId: RecoverySystemEventCaseId;
    scenarioId: DevTestScenarioId;
    labelKey: string;
    eventKey: string;
    status: "passed" | "failed";
    details: string;
    beforeState: string;
    afterState: string;
    resumed: boolean;
    completion: {
        expected: "applied";
        actual: RecoveryRequestCompletionOutcome["status"] | "pending";
        reason: string | null;
    };
};

const SYSTEM_EVENT_CASES: RecoverySystemEventCase[] = [
    {
        id: "disk_space_restored",
        scenarioId: "disk_full",
        expectedKind: "pathLoss",
        initialFaultMode: "disk_full",
        verifyFails: false,
        labelKey: "dev.test.system.case.disk_space_restored",
        eventKey: "dev.test.system.event.space_freed",
    },
    {
        id: "volume_replugged",
        scenarioId: "volume_loss",
        expectedKind: "volumeLoss",
        initialFaultMode: "missing",
        verifyFails: false,
        labelKey: "dev.test.system.case.volume_replugged",
        eventKey: "dev.test.system.event.drive_replugged",
    },
    {
        id: "path_restored",
        scenarioId: "path_loss",
        expectedKind: "pathLoss",
        initialFaultMode: "missing",
        verifyFails: false,
        labelKey: "dev.test.system.case.path_restored",
        eventKey: "dev.test.system.event.path_created",
    },
    {
        id: "permissions_restored",
        scenarioId: "access_denied",
        expectedKind: "accessDenied",
        initialFaultMode: "access_denied",
        verifyFails: false,
        labelKey: "dev.test.system.case.permissions_restored",
        eventKey: "dev.test.system.event.permissions_fixed",
    },
];

const EVENT_WAIT_POLL_MS = Math.max(
    40,
    Math.floor(RECOVERY_POLL_INTERVAL_MS / 5),
);

const EVENT_TIMEOUTS = {
    sessionOpenMs: RECOVERY_POLL_INTERVAL_MS * 4,
    completionMs: RECOVERY_POLL_INTERVAL_MS * 8,
    settleMs: RECOVERY_POLL_INTERVAL_MS * 4,
};

const EXPECTED_COMPLETION_STATUS = "applied" as const;

const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
        scheduler.scheduleTimeout(resolve, ms);
    });

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs: number,
    pollMs = EVENT_WAIT_POLL_MS,
): Promise<boolean> => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (predicate()) return true;
        await sleep(pollMs);
    }
    return false;
};

const waitForCompletionWithTimeout = async <T>(
    completion: Promise<T>,
    timeoutMs: number,
    timeoutError: string,
): Promise<T> => {
    let cancelTimeout: () => void = () => {};
    const timeoutPromise = new Promise<never>((_, reject) => {
        cancelTimeout = scheduler.scheduleTimeout(() => {
            reject(new Error(timeoutError));
        }, timeoutMs);
    });
    try {
        return await Promise.race([completion, timeoutPromise]);
    } finally {
        cancelTimeout();
    }
};

const isRecoveryActiveState = (state: string): boolean =>
    state === STATUS.torrent.DOWNLOADING || state === STATUS.torrent.SEEDING;

export interface RecoverySystemEventRunner {
    status: RecoverySystemEventRunStatus;
    results: RecoverySystemEventCaseResult[];
    resultByCaseId: Map<
        RecoverySystemEventCaseId,
        RecoverySystemEventCaseResult
    >;
    summaryText: string;
    runSystemEvents: () => Promise<void>;
}

export function useDevTestSystemEventRunner({
    t,
    controller,
}: {
    t: TranslateFn;
    controller: DevTestController;
}): RecoverySystemEventRunner {
    const [status, setStatus] = useState<RecoverySystemEventRunStatus>("idle");
    const [results, setResults] = useState<RecoverySystemEventCaseResult[]>([]);

    const runSystemEvents = useCallback(async () => {
        if (status === "running") return;

        setStatus("running");
        setResults([]);

        const nextResults: RecoverySystemEventCaseResult[] = [];
        for (const testCase of SYSTEM_EVENT_CASES) {
            let completionActual: RecoverySystemEventCaseResult["completion"]["actual"] =
                "pending";
            let completionReason: string | null = null;
            let beforeState: string = STATUS.torrent.MISSING_FILES;
            let afterState: string = STATUS.torrent.MISSING_FILES;
            let resumed = false;

            try {
                await controller.applyScenarioPreset({
                    scenarioId: testCase.scenarioId,
                    confidence: "certain",
                    faultMode: testCase.initialFaultMode,
                    verifyFails: testCase.verifyFails,
                });

                const detail = await controller.getTorrentDetail(
                    DEV_RECOVERY_TORRENT_ID,
                );
                beforeState = detail.state;

                const openOutcome = controller.openRecoveryForTorrent(
                    cloneDevTorrentDetail(detail),
                );
                if (openOutcome.status !== "requested") {
                    throw new Error(`open_outcome:${openOutcome.status}`);
                }

                const completion = openOutcome.completion;
                const opened = await waitForCondition(
                    () => Boolean(controller.getRecoverySession()),
                    EVENT_TIMEOUTS.sessionOpenMs,
                );
                if (!opened) {
                    throw new Error("session_open_timeout");
                }

                const session = controller.getRecoverySession();
                if (!session) {
                    throw new Error("missing_session");
                }
                if (session.classification.kind !== testCase.expectedKind) {
                    throw new Error(
                        `unexpected_kind:${session.classification.kind}`,
                    );
                }

                // Simulate the external/system event (drive plugged back, space freed, etc.).
                await controller.setFaultModeLive("ok");

                const completionOutcome = await waitForCompletionWithTimeout(
                    completion,
                    EVENT_TIMEOUTS.completionMs,
                    "completion_timeout",
                );
                completionActual = completionOutcome.status;
                completionReason =
                    completionOutcome.status === "failed"
                        ? completionOutcome.reason
                        : null;
                if (completionOutcome.status !== "applied") {
                    if (completionOutcome.status === "failed") {
                        throw new Error(
                            `completion_failed:${completionOutcome.reason}`,
                        );
                    }
                    throw new Error(`completion_${completionOutcome.status}`);
                }

                const settled = await waitForCondition(
                    () =>
                        !controller.getRecoverySession() &&
                        !controller.isRecoveryBusy(),
                    EVENT_TIMEOUTS.settleMs,
                );
                if (!settled) {
                    throw new Error("settle_timeout");
                }

                const updatedDetail = await controller.getTorrentDetail(
                    DEV_RECOVERY_TORRENT_ID,
                );
                afterState = updatedDetail.state;
                resumed = isRecoveryActiveState(afterState);
                if (!resumed) {
                    throw new Error(`not_resumed:${afterState}`);
                }

                nextResults.push({
                    caseId: testCase.id,
                    scenarioId: testCase.scenarioId,
                    labelKey: testCase.labelKey,
                    eventKey: testCase.eventKey,
                    status: "passed",
                    details: t("dev.test.system.case_passed", {
                        state: afterState,
                    }),
                    beforeState,
                    afterState,
                    resumed,
                    completion: {
                        expected: EXPECTED_COMPLETION_STATUS,
                        actual: completionActual,
                        reason: completionReason,
                    },
                });
            } catch (error) {
                if (completionReason === null && error instanceof Error) {
                    completionReason = error.message;
                }
                nextResults.push({
                    caseId: testCase.id,
                    scenarioId: testCase.scenarioId,
                    labelKey: testCase.labelKey,
                    eventKey: testCase.eventKey,
                    status: "failed",
                    details:
                        error instanceof Error
                            ? error.message
                            : t("dev.test.smoke.error_unknown"),
                    beforeState,
                    afterState,
                    resumed,
                    completion: {
                        expected: EXPECTED_COMPLETION_STATUS,
                        actual: completionActual,
                        reason: completionReason,
                    },
                });
            } finally {
                controller.releaseLocationEditor();
                controller.closeRecoveryModal();
                await waitForCondition(
                    () =>
                        !controller.getRecoverySession() &&
                        !controller.isRecoveryBusy(),
                    EVENT_TIMEOUTS.settleMs,
                );
            }

            setResults([...nextResults]);
        }

        const passedCount = nextResults.filter(
            (result) => result.status === "passed",
        ).length;
        setStatus(
            passedCount === SYSTEM_EVENT_CASES.length ? "passed" : "failed",
        );
    }, [controller, status, t]);

    const resultByCaseId = useMemo(
        () => new Map(results.map((result) => [result.caseId, result])),
        [results],
    );

    const passedCount = results.filter(
        (result) => result.status === "passed",
    ).length;

    const summaryText =
        status === "idle"
            ? t("dev.test.system.idle")
            : t("dev.test.system.summary", {
                  passed: passedCount,
                  total: SYSTEM_EVENT_CASES.length,
              });

    return {
        status,
        results,
        resultByCaseId,
        summaryText,
        runSystemEvents,
    };
}

export { SYSTEM_EVENT_CASES };
