import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RecoveryModalViewModel } from "@/modules/dashboard/components/TorrentRecoveryModal";
import {
    devFaultModeLabelKey,
    DEV_RECOVERY_SCENARIOS,
    devRecoveryScenarioById,
    type DevRecoveryFaultMode,
    type DevRecoveryScenarioId,
} from "@/app/dev/recovery/scenarios";
import { useDevRecoveryPlaygroundController } from "@/app/dev/recovery/useDevRecoveryPlaygroundController";
import {
    RECOVERY_SMOKE_CASES,
    useDevRecoverySmokeRunner,
} from "@/app/dev/recovery/useDevRecoverySmokeRunner";
import {
    SYSTEM_EVENT_CASES,
    useDevRecoverySystemEventRunner,
} from "@/app/dev/recovery/useDevRecoverySystemEventRunner";
import type { RecoveryConfidence } from "@/services/rpc/entities";
import type { ClipboardWriteOutcome } from "@/shared/utils/clipboard";
import { writeClipboardOutcome } from "@/shared/utils/clipboard";

type CompletionStatus = "applied" | "cancelled" | "failed" | "pending";

export interface DevRecoveryChoiceOption<TId extends string> {
    id: TId;
    label: string;
    isSelected: boolean;
    onSelect: () => void;
}

export interface DevRecoveryScenarioOption {
    id: DevRecoveryScenarioId;
    label: string;
    kindLabel: string;
    isSelected: boolean;
    onSelect: () => void;
}

export interface DevRecoveryStateRowViewModel {
    id: "current" | "modal" | "last_outcome";
    label: string;
    value: string;
}

export interface DevRecoveryAssertionRowViewModel {
    id: DevRecoveryScenarioId;
    label: string;
    expectedLabel: string;
    actualLabel: string;
    assertionLabel: string;
    reasonLabel: string | null;
}

export interface DevRecoverySmokeRowViewModel {
    id: DevRecoveryScenarioId;
    label: string;
    details: string | null;
    statusLabel: string;
}

export interface DevRecoverySystemEventRowViewModel {
    id: string;
    label: string;
    eventLabel: string;
    completionLabel: string;
    resumedLabel: string;
    beforeState: string;
    afterState: string;
    details: string | null;
}

export interface DevRecoveryPlaygroundViewModel {
    header: {
        title: string;
        subtitle: string;
        backLabel: string;
    };
    scenario: {
        title: string;
        options: DevRecoveryScenarioOption[];
    };
    confidence: {
        title: string;
        options: DevRecoveryChoiceOption<RecoveryConfidence>[];
    };
    controls: {
        title: string;
        verifyFailsLabel: string;
        verifyFailsSelected: boolean;
        setVerifyFails: (value: boolean) => void;
        faultModeLabel: string;
        faultModes: DevRecoveryChoiceOption<DevRecoveryFaultMode>[];
    };
    actions: {
        applyScenarioLabel: string;
        openRecoveryLabel: string;
        markPathAvailableLabel: string;
        applyScenario: () => void;
        openRecovery: () => void;
        markPathAvailable: () => void;
        openRecoveryDisabled: boolean;
        markPathAvailableDisabled: boolean;
    };
    state: {
        rows: DevRecoveryStateRowViewModel[];
    };
    smoke: {
        title: string;
        summaryText: string;
        runLabel: string;
        runDisabled: boolean;
        run: () => void;
        assertionTitle: string;
        assertions: DevRecoveryAssertionRowViewModel[];
        rows: DevRecoverySmokeRowViewModel[];
    };
    system: {
        title: string;
        summaryText: string;
        runLabel: string;
        runDisabled: boolean;
        run: () => void;
        columns: {
            event: string;
            completion: string;
            resumed: string;
            before: string;
            after: string;
        };
        rows: DevRecoverySystemEventRowViewModel[];
    };
    footer: null | {
        scenarioLabel: string;
        scenarioKindLabel: string;
        expectedBehavior: string;
        copyLabel: string;
        copy: () => void;
        copyStatusLabel: string | null;
    };
    recoveryModalViewModel: RecoveryModalViewModel;
}

export function useDevRecoveryPlaygroundViewModel(): DevRecoveryPlaygroundViewModel {
    const { t } = useTranslation();
    const controller = useDevRecoveryPlaygroundController({ t });
    const smoke = useDevRecoverySmokeRunner({ t, controller });
    const systemRunner = useDevRecoverySystemEventRunner({ t, controller });
    const [clipboardStatus, setClipboardStatus] = useState<
        ClipboardWriteOutcome["status"] | null
    >(null);

    const selectedScenario = useMemo(
        () => devRecoveryScenarioById.get(controller.selectedScenarioId),
        [controller.selectedScenarioId],
    );

    const resolveCompletionLabel = useCallback(
        (status: CompletionStatus) =>
            t(`dev.recovery_playground.assertion.completion.${status}`),
        [t],
    );

    const scenarioOptions = useMemo<DevRecoveryScenarioOption[]>(
        () =>
            DEV_RECOVERY_SCENARIOS.map((scenario) => ({
                id: scenario.id,
                label: t(scenario.labelKey),
                kindLabel: t(`dev.recovery_playground.kind.${scenario.kind}`),
                isSelected: controller.selectedScenarioId === scenario.id,
                onSelect: () => {
                    controller.setSelectedScenarioId(scenario.id);
                    controller.setFaultMode(scenario.faultMode);
                    controller.setVerifyFails(
                        Boolean(scenario.verifyFailsByDefault),
                    );
                },
            })),
        [
            controller.selectedScenarioId,
            controller.setFaultMode,
            controller.setSelectedScenarioId,
            controller.setVerifyFails,
            t,
        ],
    );

    const confidenceOptions = useMemo<
        DevRecoveryChoiceOption<RecoveryConfidence>[]
    >(
        () =>
            (["certain", "likely", "unknown"] as const).map((confidence) => ({
                id: confidence,
                label: t(`dev.recovery_playground.confidence.${confidence}`),
                isSelected: controller.selectedConfidence === confidence,
                onSelect: () => controller.setSelectedConfidence(confidence),
            })),
        [controller.selectedConfidence, controller.setSelectedConfidence, t],
    );

    const faultModeOptions = useMemo<
        DevRecoveryChoiceOption<DevRecoveryFaultMode>[]
    >(
        () =>
            (
                ["ok", "missing", "access_denied", "disk_full"] as const
            ).map((faultMode) => ({
                id: faultMode,
                label: t(devFaultModeLabelKey[faultMode]),
                isSelected: controller.faultMode === faultMode,
                onSelect: () => controller.setFaultMode(faultMode),
            })),
        [controller.faultMode, controller.setFaultMode, t],
    );

    const stateRows = useMemo<DevRecoveryStateRowViewModel[]>(() => {
        const rows: DevRecoveryStateRowViewModel[] = [
            {
                id: "current",
                label: t("dev.recovery_playground.state.current"),
                value: controller.currentStateLabel,
            },
            {
                id: "modal",
                label: t("dev.recovery_playground.state.modal_open"),
                value: controller.isModalOpen ? t("labels.on") : t("labels.off"),
            },
        ];
        if (controller.lastOpenOutcome) {
            rows.push({
                id: "last_outcome",
                label: t("dev.recovery_playground.state.last_outcome"),
                value: controller.lastOpenOutcome,
            });
        }
        return rows;
    }, [
        controller.currentStateLabel,
        controller.isModalOpen,
        controller.lastOpenOutcome,
        t,
    ]);

    const assertions = useMemo<DevRecoveryAssertionRowViewModel[]>(
        () =>
            RECOVERY_SMOKE_CASES.map((smokeCase) => {
                const result = smoke.resultByScenarioId.get(smokeCase.scenarioId);
                const completion = result?.completion;
                const expectedStatus = completion?.expected ?? "applied";
                const actualStatus = completion?.actual ?? "pending";
                const isMatch = completion?.actual === completion?.expected;
                const assertionLabel = completion
                    ? isMatch
                        ? t("dev.recovery_playground.assertion.match")
                        : t("dev.recovery_playground.assertion.mismatch")
                    : t("dev.recovery_playground.assertion.pending");
                return {
                    id: smokeCase.scenarioId,
                    label: t(
                        `dev.recovery_playground.scenario.${smokeCase.scenarioId}`,
                    ),
                    expectedLabel: `${t("dev.recovery_playground.assertion.expected")} ${resolveCompletionLabel(expectedStatus)}`,
                    actualLabel: `${t("dev.recovery_playground.assertion.actual")} ${resolveCompletionLabel(actualStatus)}`,
                    assertionLabel,
                    reasonLabel: completion?.reason
                        ? t("dev.recovery_playground.assertion.reason", {
                              reason: completion.reason,
                          })
                        : null,
                };
            }),
        [resolveCompletionLabel, smoke.resultByScenarioId, t],
    );

    const smokeRows = useMemo<DevRecoverySmokeRowViewModel[]>(
        () =>
            RECOVERY_SMOKE_CASES.map((smokeCase) => {
                const result = smoke.resultByScenarioId.get(smokeCase.scenarioId);
                const statusLabel = result
                    ? result.status === "passed"
                        ? t("dev.recovery_playground.smoke.status.passed")
                        : t("dev.recovery_playground.smoke.status.failed")
                    : smoke.status === "running"
                      ? t("dev.recovery_playground.smoke.status.running")
                      : t("dev.recovery_playground.smoke.status.pending");
                return {
                    id: smokeCase.scenarioId,
                    label: t(
                        `dev.recovery_playground.scenario.${smokeCase.scenarioId}`,
                    ),
                    details: result?.details ?? null,
                    statusLabel,
                };
            }),
        [smoke.resultByScenarioId, smoke.status, t],
    );

    const systemRows = useMemo<DevRecoverySystemEventRowViewModel[]>(
        () =>
            SYSTEM_EVENT_CASES.map((testCase) => {
                const result = systemRunner.resultByCaseId.get(testCase.id);
                const completionLabel = result
                    ? t(
                          `dev.recovery_playground.assertion.completion.${result.completion.actual}`,
                      )
                    : t("dev.recovery_playground.assertion.pending");
                const resumedLabel = result
                    ? result.resumed
                        ? t("dev.recovery_playground.system.resumed_yes")
                        : t("dev.recovery_playground.system.resumed_no")
                    : t("dev.recovery_playground.system.resumed_pending");
                return {
                    id: testCase.id,
                    label: t(testCase.labelKey),
                    eventLabel: t(testCase.eventKey),
                    completionLabel,
                    resumedLabel,
                    beforeState: result?.beforeState ?? "-",
                    afterState: result?.afterState ?? "-",
                    details: result?.details ?? null,
                };
            }),
        [systemRunner.resultByCaseId, t],
    );

    const copyContext = useCallback(async () => {
        if (!selectedScenario) {
            setClipboardStatus("empty");
            return;
        }

        const text = [
            `${t("dev.recovery_playground.copy.scenario")}: ${t(selectedScenario.labelKey)} (${t(`dev.recovery_playground.kind.${selectedScenario.kind}`)})`,
            `${t("dev.recovery_playground.label.fault_mode")}: ${t(devFaultModeLabelKey[selectedScenario.faultMode])}`,
            `${t("dev.recovery_playground.copy.error_class")}: ${selectedScenario.errorClass}`,
            "",
            `${t("dev.recovery_playground.copy.expected_behavior")}:`,
            t(selectedScenario.expectedBehaviorKey),
        ].join("\n");

        const outcome = await writeClipboardOutcome(text);
        setClipboardStatus(outcome.status);
    }, [selectedScenario, t]);

    return useMemo(
        () => ({
            header: {
                title: t("dev.recovery_playground.title"),
                subtitle: t("dev.recovery_playground.subtitle"),
                backLabel: t("dev.recovery_playground.back_to_app"),
            },
            scenario: {
                title: t("dev.recovery_playground.section.scenario"),
                options: scenarioOptions,
            },
            confidence: {
                title: t("dev.recovery_playground.section.confidence"),
                options: confidenceOptions,
            },
            controls: {
                title: t("dev.recovery_playground.section.controls"),
                verifyFailsLabel: t(
                    "dev.recovery_playground.toggle.verify_fails",
                ),
                verifyFailsSelected: controller.verifyFails,
                setVerifyFails: controller.setVerifyFails,
                faultModeLabel: t("dev.recovery_playground.label.fault_mode"),
                faultModes: faultModeOptions,
            },
            actions: {
                applyScenarioLabel: t(
                    "dev.recovery_playground.action.apply_scenario",
                ),
                openRecoveryLabel: t(
                    "dev.recovery_playground.action.open_recovery",
                ),
                markPathAvailableLabel: t(
                    "dev.recovery_playground.action.mark_path_available",
                ),
                applyScenario: () => {
                    void controller.applySelectedScenario();
                },
                openRecovery: () => {
                    controller.openRecoveryForCurrentDetail();
                },
                markPathAvailable: () => {
                    void controller.setFaultModeLive("ok");
                },
                openRecoveryDisabled: !controller.detailData,
                markPathAvailableDisabled: controller.faultMode === "ok",
            },
            state: {
                rows: stateRows,
            },
            smoke: {
                title: t("dev.recovery_playground.section.smoke"),
                summaryText: smoke.summaryText,
                runLabel:
                    smoke.status === "running"
                        ? t("dev.recovery_playground.action.run_smoke_running")
                        : t("dev.recovery_playground.action.run_smoke"),
                runDisabled: smoke.status === "running",
                run: () => {
                    void smoke.runSmoke();
                },
                assertionTitle: t("dev.recovery_playground.assertion.title"),
                assertions,
                rows: smokeRows,
            },
            system: {
                title: t("dev.recovery_playground.section.system_events"),
                summaryText: systemRunner.summaryText,
                runLabel:
                    systemRunner.status === "running"
                        ? t("dev.recovery_playground.action.run_system_running")
                        : t("dev.recovery_playground.action.run_system"),
                runDisabled: systemRunner.status === "running",
                run: () => {
                    void systemRunner.runSystemEvents();
                },
                columns: {
                    event: t("dev.recovery_playground.system.column.event"),
                    completion: t(
                        "dev.recovery_playground.system.column.completion",
                    ),
                    resumed: t("dev.recovery_playground.system.column.resumed"),
                    before: t("dev.recovery_playground.system.column.before"),
                    after: t("dev.recovery_playground.system.column.after"),
                },
                rows: systemRows,
            },
            footer: selectedScenario
                ? {
                      scenarioLabel: t(selectedScenario.labelKey),
                      scenarioKindLabel: t(
                          `dev.recovery_playground.kind.${selectedScenario.kind}`,
                      ),
                      expectedBehavior: t(selectedScenario.expectedBehaviorKey),
                      copyLabel: t(
                          "dev.recovery_playground.action.copy_context",
                      ),
                      copy: () => {
                          void copyContext();
                      },
                      copyStatusLabel: clipboardStatus
                          ? t(
                                `dev.recovery_playground.clipboard.${clipboardStatus}`,
                            )
                          : null,
                  }
                : null,
            recoveryModalViewModel: controller.recoveryModalViewModel,
        }),
        [
            assertions,
            clipboardStatus,
            confidenceOptions,
            controller.applySelectedScenario,
            controller.detailData,
            controller.faultMode,
            controller.openRecoveryForCurrentDetail,
            controller.recoveryModalViewModel,
            controller.setFaultModeLive,
            controller.setVerifyFails,
            controller.verifyFails,
            copyContext,
            faultModeOptions,
            scenarioOptions,
            selectedScenario,
            smoke.runSmoke,
            smoke.status,
            smoke.summaryText,
            smokeRows,
            stateRows,
            systemRows,
            systemRunner.runSystemEvents,
            systemRunner.status,
            systemRunner.summaryText,
            t,
        ],
    );
}
