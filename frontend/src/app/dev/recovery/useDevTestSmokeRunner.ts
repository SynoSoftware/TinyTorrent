import { useCallback, useMemo, useState } from "react";
import type { RecoveryRequestCompletionOutcome } from "@/app/context/RecoveryContext";
import type { RecoveryConfidence } from "@/services/rpc/entities";
import { RECOVERY_POLL_INTERVAL_MS } from "@/config/logic";
import { STATUS } from "@/shared/status";
import {
    cloneDevTorrentDetail,
    DEV_TEST_SCENARIOS,
    DEV_RECOVERY_TORRENT_ID,
    devRecoveryScenarioById,
    type DevTestScenarioDefinition,
    type DevTestScenarioId,
} from "@/app/dev/recovery/scenarios";
import type {
    ApplyRecoveryScenarioParams,
    DevTestController,
} from "@/app/dev/recovery/useDevTestController";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export type RecoverySmokeRunStatus = "idle" | "running" | "passed" | "failed";

export type RecoverySmokeCaseResult = {
    scenarioId: DevTestScenarioId;
    status: "passed" | "failed";
    details: string;
    completion: {
        expected: "applied";
        actual: RecoveryRequestCompletionOutcome["status"] | "pending";
        reason: string | null;
    };
};

type RecoverySmokeCase = {
    scenarioId: DevTestScenarioId;
    expectedKind: DevTestScenarioDefinition["kind"];
    expectation: "modal_recovery" | "auto_recovery";
    verifyFails: boolean;
};

const RECOVERY_SMOKE_CASES: RecoverySmokeCase[] = [
    {
        scenarioId: "path_loss",
        expectedKind: "pathLoss",
        expectation: "modal_recovery",
        verifyFails: false,
    },
    {
        scenarioId: "volume_loss",
        expectedKind: "volumeLoss",
        expectation: "modal_recovery",
        verifyFails: false,
    },
    {
        scenarioId: "access_denied",
        expectedKind: "accessDenied",
        expectation: "modal_recovery",
        verifyFails: false,
    },
    {
        scenarioId: "disk_full",
        expectedKind: "pathLoss",
        expectation: "modal_recovery",
        verifyFails: false,
    },
    {
        scenarioId: "data_gap",
        expectedKind: "dataGap",
        expectation: "auto_recovery",
        verifyFails: false,
    },
];

const SMOKE_WAIT_POLL_MS = Math.max(
    40,
    Math.floor(RECOVERY_POLL_INTERVAL_MS / 5),
);
const SMOKE_TIMEOUTS = {
    sessionOpenMs: RECOVERY_POLL_INTERVAL_MS * 3,
    completionMs: RECOVERY_POLL_INTERVAL_MS * 4,
    settleMs: RECOVERY_POLL_INTERVAL_MS * 2,
};
const EXPECTED_COMPLETION_STATUS = "applied" as const;

const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
    });

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs: number,
    pollMs = SMOKE_WAIT_POLL_MS,
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
    let timeoutHandle: number | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = window.setTimeout(() => {
            reject(new Error(timeoutError));
        }, timeoutMs);
    });
    try {
        return await Promise.race([completion, timeoutPromise]);
    } finally {
        if (timeoutHandle !== null) {
            window.clearTimeout(timeoutHandle);
        }
    }
};

const toSmokeScenarioPreset = (
    params: RecoverySmokeCase,
    confidence: RecoveryConfidence,
): ApplyRecoveryScenarioParams => {
    const scenario =
        devRecoveryScenarioById.get(params.scenarioId) ?? DEV_TEST_SCENARIOS[0];
    return {
        scenarioId: params.scenarioId,
        confidence,
        faultMode: scenario.faultMode,
        verifyFails: params.verifyFails,
    };
};

export interface RecoverySmokeRunner {
    status: RecoverySmokeRunStatus;
    results: RecoverySmokeCaseResult[];
    resultByScenarioId: Map<DevTestScenarioId, RecoverySmokeCaseResult>;
    summaryText: string;
    runSmoke: () => Promise<void>;
}

export function useDevTestSmokeRunner({
    t,
    controller,
}: {
    t: TranslateFn;
    controller: DevTestController;
}): RecoverySmokeRunner {
    const [status, setStatus] = useState<RecoverySmokeRunStatus>("idle");
    const [results, setResults] = useState<RecoverySmokeCaseResult[]>([]);

    const runSmoke = useCallback(async () => {
        if (status === "running") return;
        setStatus("running");
        setResults([]);

        const nextResults: RecoverySmokeCaseResult[] = [];
        for (const smokeCase of RECOVERY_SMOKE_CASES) {
            let completionActual: RecoverySmokeCaseResult["completion"]["actual"] =
                "pending";
            let completionReason: string | null = null;
            try {
                await controller.applyScenarioPreset(
                    toSmokeScenarioPreset(smokeCase, "certain"),
                );

                const detail = await controller.getTorrentDetail(
                    DEV_RECOVERY_TORRENT_ID,
                );
                const openOutcome = controller.openRecoveryForTorrent(
                    cloneDevTorrentDetail(detail),
                );
                if (openOutcome.status !== "requested") {
                    throw new Error(`open_outcome:${openOutcome.status}`);
                }
                const completion = openOutcome.completion;

                if (smokeCase.expectation === "modal_recovery") {
                    const opened = await waitForCondition(
                        () => Boolean(controller.getRecoverySession()),
                        SMOKE_TIMEOUTS.sessionOpenMs,
                    );
                    if (!opened) {
                        throw new Error("session_open_timeout");
                    }

                    const session = controller.getRecoverySession();
                    if (!session) {
                        throw new Error("missing_session");
                    }
                    if (
                        session.classification.kind !== smokeCase.expectedKind
                    ) {
                        throw new Error(
                            `unexpected_kind:${session.classification.kind}`,
                        );
                    }
                    if (controller.isPrimaryActionDisabled()) {
                        throw new Error("primary_action_disabled");
                    }

                    await controller.setFaultModeLive("ok");
                    await controller.autoRetryRecovery();
                }

                const completionOutcome = await waitForCompletionWithTimeout(
                    completion,
                    SMOKE_TIMEOUTS.completionMs,
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

                if (smokeCase.expectation === "auto_recovery") {
                    const updatedDetail = await controller.getTorrentDetail(
                        DEV_RECOVERY_TORRENT_ID,
                    );
                    if (updatedDetail.state === STATUS.torrent.MISSING_FILES) {
                        throw new Error("auto_recovery_not_applied");
                    }
                }

                const settled = await waitForCondition(
                    () =>
                        !controller.getRecoverySession() &&
                        !controller.isRecoveryBusy(),
                    SMOKE_TIMEOUTS.settleMs,
                );
                if (!settled) {
                    throw new Error("settle_timeout");
                }

                nextResults.push({
                    scenarioId: smokeCase.scenarioId,
                    status: "passed",
                    details: t("dev.test.smoke.case_passed"),
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
                    scenarioId: smokeCase.scenarioId,
                    status: "failed",
                    details:
                        error instanceof Error
                            ? error.message
                            : t("dev.test.smoke.error_unknown"),
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
                    SMOKE_TIMEOUTS.settleMs,
                );
            }

            setResults([...nextResults]);
        }

        const passedCount = nextResults.filter(
            (result) => result.status === "passed",
        ).length;
        setStatus(
            passedCount === RECOVERY_SMOKE_CASES.length ? "passed" : "failed",
        );
    }, [controller, status, t]);

    const resultByScenarioId = useMemo(
        () => new Map(results.map((result) => [result.scenarioId, result])),
        [results],
    );

    const passedCount = results.filter(
        (result) => result.status === "passed",
    ).length;
    const summaryText =
        status === "idle"
            ? t("dev.test.smoke.idle")
            : t("dev.test.smoke.summary", {
                  passed: passedCount,
                  total: RECOVERY_SMOKE_CASES.length,
              });

    return {
        status,
        results,
        resultByScenarioId,
        summaryText,
        runSmoke,
    };
}

export { RECOVERY_SMOKE_CASES };
