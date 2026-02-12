import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RecoveryModalViewModel } from "@/modules/dashboard/components/TorrentRecoveryModal";
import {
    devFaultModeLabelKey,
    DEV_TEST_SCENARIOS,
    devRecoveryScenarioById,
    type DevTestFaultMode as DevTestFaultMode,
    type DevTestScenarioId,
} from "@/app/dev/recovery/scenarios";
import { useDevTestController } from "@/app/dev/recovery/useDevTestController";
import {
    RECOVERY_SMOKE_CASES,
    useDevTestSmokeRunner,
} from "@/app/dev/recovery/useDevTestSmokeRunner";
import {
    SYSTEM_EVENT_CASES,
    useDevTestSystemEventRunner,
} from "@/app/dev/recovery/useDevTestSystemEventRunner";
import type { RecoveryConfidence } from "@/services/rpc/entities";
import type { ClipboardWriteOutcome } from "@/shared/utils/clipboard";
import { writeClipboardOutcome } from "@/shared/utils/clipboard";

type CompletionStatus = "applied" | "cancelled" | "failed" | "pending";

export interface DevTestChoiceOption<TId extends string> {
    id: TId;
    label: string;
    isSelected: boolean;
    onSelect: () => void;
}

export interface DevTestScenarioOption {
    id: DevTestScenarioId;
    label: string;
    kindLabel: string;
    isSelected: boolean;
    onSelect: () => void;
}

export interface DevTestStateRowViewModel {
    id: "current" | "modal" | "last_outcome";
    label: string;
    value: string;
}

export interface DevTestAssertionRowViewModel {
    id: DevTestScenarioId;
    label: string;
    expectedLabel: string;
    actualLabel: string;
    assertionLabel: string;
    reasonLabel: string | null;
}

export interface DevTestSmokeRowViewModel {
    id: DevTestScenarioId;
    label: string;
    details: string | null;
    statusLabel: string;
}

export interface DevTestSystemEventRowViewModel {
    id: string;
    label: string;
    eventLabel: string;
    completionLabel: string;
    resumedLabel: string;
    beforeState: string;
    afterState: string;
    details: string | null;
}

export interface DevTestViewModel {
    header: {
        title: string;
        subtitle: string;
        backLabel: string;
    };
    scenario: {
        title: string;
        options: DevTestScenarioOption[];
    };
    confidence: {
        title: string;
        options: DevTestChoiceOption<RecoveryConfidence>[];
    };
    controls: {
        title: string;
        verifyFailsLabel: string;
        verifyFailsSelected: boolean;
        setVerifyFails: (value: boolean) => void;
        faultModeLabel: string;
        faultModes: DevTestChoiceOption<DevTestFaultMode>[];
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
        rows: DevTestStateRowViewModel[];
    };
    smoke: {
        title: string;
        summaryText: string;
        runLabel: string;
        runDisabled: boolean;
        run: () => void;
        assertionTitle: string;
        assertions: DevTestAssertionRowViewModel[];
        rows: DevTestSmokeRowViewModel[];
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
        rows: DevTestSystemEventRowViewModel[];
    };
    footer: null | {
        scenarioLabel: string;
        scenarioKindLabel: string;
        expectedBehavior: string;
        summary: string;
        copyLabel: string;
        copy: () => void;
        copyStatusLabel: string | null;
        isExpanded: boolean;
        toggleExpanded: () => void;
    };
    recoveryModalViewModel: RecoveryModalViewModel;
}

export function useDevTestViewModel(): DevTestViewModel {
    const { t } = useTranslation();
    const controller = useDevTestController({ t });
    const smoke = useDevTestSmokeRunner({ t, controller });
    const systemRunner = useDevTestSystemEventRunner({ t, controller });
    const [clipboardStatus, setClipboardStatus] = useState<
        ClipboardWriteOutcome["status"] | null
    >(null);

    const selectedScenario = useMemo(
        () => devRecoveryScenarioById.get(controller.selectedScenarioId),
        [controller.selectedScenarioId],
    );

    const resolveCompletionLabel = useCallback(
        (status: CompletionStatus) =>
            t(`dev.test.assertion.completion.${status}`),
        [t],
    );

    const scenarioOptions = useMemo<DevTestScenarioOption[]>(
        () =>
            DEV_TEST_SCENARIOS.map((scenario) => ({
                id: scenario.id,
                label: t(scenario.labelKey),
                kindLabel: t(`dev.test.kind.${scenario.kind}`),
                isSelected: controller.selectedScenarioId === scenario.id,
                onSelect: () => {
                    controller.setSelectedScenarioId(scenario.id);
                    controller.setFaultMode(scenario.faultMode);
                    controller.setVerifyFails(
                        Boolean(scenario.verifyFailsByDefault),
                    );
                },
            })),
        [controller, t],
    );

    const confidenceOptions = useMemo<
        DevTestChoiceOption<RecoveryConfidence>[]
    >(
        () =>
            (["certain", "likely", "unknown"] as const).map((confidence) => ({
                id: confidence,
                label: t(`dev.test.confidence.${confidence}`),
                isSelected: controller.selectedConfidence === confidence,
                onSelect: () => controller.setSelectedConfidence(confidence),
            })),
        [controller, t],
    );

    const faultModeOptions = useMemo<DevTestChoiceOption<DevTestFaultMode>[]>(
        () =>
            (["ok", "missing", "access_denied", "disk_full"] as const).map(
                (faultMode) => ({
                    id: faultMode,
                    label: t(devFaultModeLabelKey[faultMode]),
                    isSelected: controller.faultMode === faultMode,
                    onSelect: () => controller.setFaultMode(faultMode),
                }),
            ),
        [controller, t],
    );

    const stateRows = useMemo<DevTestStateRowViewModel[]>(() => {
        const rows: DevTestStateRowViewModel[] = [
            {
                id: "current",
                label: t("dev.test.state.current"),
                value: controller.currentStateLabel,
            },
            {
                id: "modal",
                label: t("dev.test.state.modal_open"),
                value: controller.isModalOpen
                    ? t("labels.on")
                    : t("labels.off"),
            },
        ];
        if (controller.lastOpenOutcome) {
            rows.push({
                id: "last_outcome",
                label: t("dev.test.state.last_outcome"),
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

    const assertions = useMemo<DevTestAssertionRowViewModel[]>(
        () =>
            RECOVERY_SMOKE_CASES.map((smokeCase) => {
                const result = smoke.resultByScenarioId.get(
                    smokeCase.scenarioId,
                );
                const completion = result?.completion;
                const expectedStatus = completion?.expected ?? "applied";
                const actualStatus = completion?.actual ?? "pending";
                const isMatch = completion?.actual === completion?.expected;
                const assertionLabel = completion
                    ? isMatch
                        ? t("dev.test.assertion.match")
                        : t("dev.test.assertion.mismatch")
                    : t("dev.test.assertion.pending");
                return {
                    id: smokeCase.scenarioId,
                    label: t(`dev.test.scenario.${smokeCase.scenarioId}`),
                    expectedLabel: `${t("dev.test.assertion.expected")} ${resolveCompletionLabel(expectedStatus)}`,
                    actualLabel: `${t("dev.test.assertion.actual")} ${resolveCompletionLabel(actualStatus)}`,
                    assertionLabel,
                    reasonLabel: completion?.reason
                        ? t("dev.test.assertion.reason", {
                              reason: completion.reason,
                          })
                        : null,
                };
            }),
        [resolveCompletionLabel, smoke.resultByScenarioId, t],
    );

    const smokeRows = useMemo<DevTestSmokeRowViewModel[]>(
        () =>
            RECOVERY_SMOKE_CASES.map((smokeCase) => {
                const result = smoke.resultByScenarioId.get(
                    smokeCase.scenarioId,
                );
                const statusLabel = result
                    ? result.status === "passed"
                        ? t("dev.test.smoke.status.passed")
                        : t("dev.test.smoke.status.failed")
                    : smoke.status === "running"
                      ? t("dev.test.smoke.status.running")
                      : t("dev.test.smoke.status.pending");
                return {
                    id: smokeCase.scenarioId,
                    label: t(`dev.test.scenario.${smokeCase.scenarioId}`),
                    details: result?.details ?? null,
                    statusLabel,
                };
            }),
        [smoke.resultByScenarioId, smoke.status, t],
    );

    const systemRows = useMemo<DevTestSystemEventRowViewModel[]>(
        () =>
            SYSTEM_EVENT_CASES.map((testCase) => {
                const result = systemRunner.resultByCaseId.get(testCase.id);
                const completionLabel = result
                    ? t(
                          `dev.test.assertion.completion.${result.completion.actual}`,
                      )
                    : t("dev.test.assertion.pending");
                const resumedLabel = result
                    ? result.resumed
                        ? t("dev.test.system.resumed_yes")
                        : t("dev.test.system.resumed_no")
                    : t("dev.test.system.resumed_pending");
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

    const [isFooterExpanded, setIsFooterExpanded] = useState(false);

    const copyContext = useCallback(async () => {
        if (!selectedScenario) {
            setClipboardStatus("empty");
            return;
        }

        const text = [
            `${t("dev.test.copy.scenario")}: ${t(selectedScenario.labelKey)} (${t(`dev.test.kind.${selectedScenario.kind}`)})`,
            `${t("dev.test.label.fault_mode")}: ${t(devFaultModeLabelKey[selectedScenario.faultMode])}`,
            `${t("dev.test.copy.error_class")}: ${selectedScenario.errorClass}`,
            "",
            `${t("dev.test.copy.expected_behavior")}:`,
            t(selectedScenario.expectedBehaviorKey),
        ].join("\n");

        const outcome = await writeClipboardOutcome(text);
        setClipboardStatus(outcome.status);
    }, [selectedScenario, t]);

    return useMemo(
        () => ({
            header: {
                title: t("dev.test.title"),
                subtitle: t("dev.test.subtitle"),
                backLabel: t("dev.test.back_to_app"),
            },
            scenario: {
                title: t("dev.test.section.scenario"),
                options: scenarioOptions,
            },
            confidence: {
                title: t("dev.test.section.confidence"),
                options: confidenceOptions,
            },
            controls: {
                title: t("dev.test.section.controls"),
                verifyFailsLabel: t("dev.test.toggle.verify_fails"),
                verifyFailsSelected: controller.verifyFails,
                setVerifyFails: controller.setVerifyFails,
                faultModeLabel: t("dev.test.label.fault_mode"),
                faultModes: faultModeOptions,
            },
            actions: {
                applyScenarioLabel: t("dev.test.action.apply_scenario"),
                openRecoveryLabel: t("dev.test.action.open_recovery"),
                markPathAvailableLabel: t(
                    "dev.test.action.mark_path_available",
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
                title: t("dev.test.section.smoke"),
                summaryText: smoke.summaryText,
                runLabel:
                    smoke.status === "running"
                        ? t("dev.test.action.run_smoke_running")
                        : t("dev.test.action.run_smoke"),
                runDisabled: smoke.status === "running",
                run: () => {
                    void smoke.runSmoke();
                },
                assertionTitle: t("dev.test.assertion.title"),
                assertions,
                rows: smokeRows,
            },
            system: {
                title: t("dev.test.section.system_events"),
                summaryText: systemRunner.summaryText,
                runLabel:
                    systemRunner.status === "running"
                        ? t("dev.test.action.run_system_running")
                        : t("dev.test.action.run_system"),
                runDisabled: systemRunner.status === "running",
                run: () => {
                    void systemRunner.runSystemEvents();
                },
                columns: {
                    event: t("dev.test.system.column.event"),
                    completion: t("dev.test.system.column.completion"),
                    resumed: t("dev.test.system.column.resumed"),
                    before: t("dev.test.system.column.before"),
                    after: t("dev.test.system.column.after"),
                },
                rows: systemRows,
            },
            footer: selectedScenario
                ? {
                      scenarioLabel: t(selectedScenario.labelKey),
                      scenarioKindLabel: t(
                          `dev.test.kind.${selectedScenario.kind}`,
                      ),
                      expectedBehavior: t(selectedScenario.expectedBehaviorKey),
                      summary: t(selectedScenario.expectedBehaviorKey).split(
                          "\n",
                      )[0],
                      copyLabel: t("dev.test.action.copy_context"),
                      copy: () => {
                          void copyContext();
                      },
                      copyStatusLabel: clipboardStatus
                          ? t(`dev.test.clipboard.${clipboardStatus}`)
                          : null,
                      isExpanded: isFooterExpanded,
                      toggleExpanded: () => setIsFooterExpanded((p) => !p),
                  }
                : null,
            recoveryModalViewModel: controller.recoveryModalViewModel,
        }),
        [
            assertions,
            clipboardStatus,
            confidenceOptions,
            controller,
            copyContext,
            faultModeOptions,
            isFooterExpanded,
            scenarioOptions,
            selectedScenario,
            smoke,
            smokeRows,
            stateRows,
            systemRows,
            systemRunner,
            t,
        ],
    );
}
