import { Button, Switch } from "@heroui/react";
import { useTranslation } from "react-i18next";
import TorrentRecoveryModal from "@/modules/dashboard/components/TorrentRecoveryModal";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { Section } from "@/shared/ui/layout/Section";
import {
    devFaultModeLabelKey,
    DEV_RECOVERY_PLAYGROUND_PATH,
    DEV_RECOVERY_SCENARIOS,
} from "@/app/dev/recovery/scenarios";
import { useDevRecoveryPlaygroundController } from "@/app/dev/recovery/useDevRecoveryPlaygroundController";
import {
    RECOVERY_SMOKE_CASES,
    useDevRecoverySmokeRunner,
} from "@/app/dev/recovery/useDevRecoverySmokeRunner";

export { DEV_RECOVERY_PLAYGROUND_PATH };

export default function DevTest() {
    const { t } = useTranslation();
    const controller = useDevRecoveryPlaygroundController({ t });
    const smoke = useDevRecoverySmokeRunner({ t, controller });
    const resolveCompletionLabel = (
        status: "applied" | "cancelled" | "failed" | "pending",
    ) => t(`dev.recovery_playground.assertion.completion.${status}`);

    return (
        <Section
            padding="stage"
            className="min-h-screen surface-layer-0 text-foreground"
        >
            <div className="flex flex-col gap-stage">
                <GlassPanel layer={1} className="p-panel">
                    <div className="flex flex-col gap-stage">
                        <div className="flex flex-wrap items-center justify-between gap-tools">
                            <div className="flex flex-col gap-tight">
                                <h1 className="text-scaled font-bold text-foreground">
                                    {t("dev.recovery_playground.title")}
                                </h1>
                                <p className="text-label text-foreground/70">
                                    {t("dev.recovery_playground.subtitle")}
                                </p>
                            </div>
                            <Button as="a" href="/" variant="light" size="md">
                                {t("dev.recovery_playground.back_to_app")}
                            </Button>
                        </div>

                        <div className="flex flex-col gap-tight">
                            <p className="text-label font-semibold text-foreground">
                                {t("dev.recovery_playground.section.scenario")}
                            </p>
                            <div className="flex flex-wrap items-center gap-tools">
                                {DEV_RECOVERY_SCENARIOS.map((scenario) => (
                                    <Button
                                        key={scenario.id}
                                        variant={
                                            controller.selectedScenarioId ===
                                            scenario.id
                                                ? "shadow"
                                                : "light"
                                        }
                                        color={
                                            controller.selectedScenarioId ===
                                            scenario.id
                                                ? "primary"
                                                : "default"
                                        }
                                        size="md"
                                        onPress={() => {
                                            controller.setSelectedScenarioId(
                                                scenario.id,
                                            );
                                            controller.setFaultMode(
                                                scenario.faultMode,
                                            );
                                            controller.setVerifyFails(
                                                Boolean(
                                                    scenario.verifyFailsByDefault,
                                                ),
                                            );
                                        }}
                                    >
                                        {t(scenario.labelKey)}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-tight">
                            <p className="text-label font-semibold text-foreground">
                                {t(
                                    "dev.recovery_playground.section.confidence",
                                )}
                            </p>
                            <div className="flex flex-wrap items-center gap-tools">
                                {(
                                    ["certain", "likely", "unknown"] as const
                                ).map((confidence) => (
                                    <Button
                                        key={confidence}
                                        variant={
                                            controller.selectedConfidence ===
                                            confidence
                                                ? "shadow"
                                                : "light"
                                        }
                                        color={
                                            controller.selectedConfidence ===
                                            confidence
                                                ? "primary"
                                                : "default"
                                        }
                                        size="md"
                                        onPress={() =>
                                            controller.setSelectedConfidence(
                                                confidence,
                                            )
                                        }
                                    >
                                        {t(
                                            `dev.recovery_playground.confidence.${confidence}`,
                                        )}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                </GlassPanel>

                <GlassPanel layer={1} className="p-panel">
                    <div className="flex flex-col gap-stage">
                        <p className="text-label font-semibold text-foreground">
                            {t("dev.recovery_playground.section.controls")}
                        </p>
                        <div className="flex flex-wrap items-center gap-stage">
                            <Switch
                                isSelected={controller.verifyFails}
                                onValueChange={controller.setVerifyFails}
                                size="sm"
                            >
                                {t(
                                    "dev.recovery_playground.toggle.verify_fails",
                                )}
                            </Switch>
                            <div className="flex items-center gap-tools">
                                <span className="text-label text-foreground/70">
                                    {t(
                                        "dev.recovery_playground.label.fault_mode",
                                    )}
                                </span>
                                {(
                                    [
                                        "ok",
                                        "missing",
                                        "access_denied",
                                        "disk_full",
                                    ] as const
                                ).map((mode) => (
                                    <Button
                                        key={mode}
                                        size="md"
                                        variant={
                                            controller.faultMode === mode
                                                ? "shadow"
                                                : "light"
                                        }
                                        color={
                                            controller.faultMode === mode
                                                ? "primary"
                                                : "default"
                                        }
                                        onPress={() =>
                                            controller.setFaultMode(mode)
                                        }
                                    >
                                        {t(devFaultModeLabelKey[mode])}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-tools">
                            <Button
                                variant="shadow"
                                color="primary"
                                size="lg"
                                onPress={() => {
                                    void controller.applySelectedScenario();
                                }}
                            >
                                {t(
                                    "dev.recovery_playground.action.apply_scenario",
                                )}
                            </Button>
                            <Button
                                variant="light"
                                size="md"
                                onPress={
                                    controller.openRecoveryForCurrentDetail
                                }
                                isDisabled={!controller.detailData}
                            >
                                {t(
                                    "dev.recovery_playground.action.open_recovery",
                                )}
                            </Button>
                            <Button
                                variant="light"
                                size="md"
                                onPress={() => {
                                    void controller.setFaultModeLive("ok");
                                }}
                                isDisabled={controller.faultMode === "ok"}
                            >
                                {t(
                                    "dev.recovery_playground.action.mark_path_available",
                                )}
                            </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-stage text-label text-foreground/70">
                            <span>
                                {t("dev.recovery_playground.state.current")}{" "}
                                <span className="font-semibold text-foreground">
                                    {controller.currentStateLabel}
                                </span>
                            </span>
                            <span>
                                {t("dev.recovery_playground.state.modal_open")}{" "}
                                <span className="font-semibold text-foreground">
                                    {controller.isModalOpen
                                        ? t("labels.on")
                                        : t("labels.off")}
                                </span>
                            </span>
                            {controller.lastOpenOutcome && (
                                <span>
                                    {t(
                                        "dev.recovery_playground.state.last_outcome",
                                    )}{" "}
                                    <span className="font-semibold text-foreground">
                                        {controller.lastOpenOutcome}
                                    </span>
                                </span>
                            )}
                        </div>
                    </div>
                </GlassPanel>

                <GlassPanel layer={1} className="p-panel">
                    <div className="flex flex-col gap-stage">
                        <div className="flex flex-wrap items-center justify-between gap-tools">
                            <p className="text-label font-semibold text-foreground">
                                {t("dev.recovery_playground.section.smoke")}
                            </p>
                            <Button
                                variant="shadow"
                                color="primary"
                                size="md"
                                isDisabled={smoke.status === "running"}
                                onPress={() => {
                                    void smoke.runSmoke();
                                }}
                            >
                                {smoke.status === "running"
                                    ? t(
                                          "dev.recovery_playground.action.run_smoke_running",
                                      )
                                    : t(
                                          "dev.recovery_playground.action.run_smoke",
                                      )}
                            </Button>
                        </div>

                        <p className="text-label text-foreground/70">
                            {smoke.summaryText}
                        </p>

                        <div className="flex flex-col gap-tight">
                            <p className="text-label font-semibold text-foreground">
                                {t("dev.recovery_playground.assertion.title")}
                            </p>
                            {RECOVERY_SMOKE_CASES.map((smokeCase) => {
                                const result = smoke.resultByScenarioId.get(
                                    smokeCase.scenarioId,
                                );
                                const completion = result?.completion;
                                const expectedStatus =
                                    completion?.expected ?? "applied";
                                const actualStatus =
                                    completion?.actual ?? "pending";
                                const isMatch =
                                    completion?.actual === completion?.expected;
                                const assertionLabel = completion
                                    ? isMatch
                                        ? t(
                                              "dev.recovery_playground.assertion.match",
                                          )
                                        : t(
                                              "dev.recovery_playground.assertion.mismatch",
                                          )
                                    : t(
                                          "dev.recovery_playground.assertion.pending",
                                      );
                                return (
                                    <div
                                        key={`assertion-${smokeCase.scenarioId}`}
                                        className="surface-layer-1 rounded-panel p-tight flex flex-wrap items-center justify-between gap-tools"
                                    >
                                        <span className="text-label font-medium text-foreground">
                                            {t(
                                                `dev.recovery_playground.scenario.${smokeCase.scenarioId}`,
                                            )}
                                        </span>
                                        <div className="flex flex-wrap items-center gap-tools text-label">
                                            <span className="text-foreground/70">
                                                {t(
                                                    "dev.recovery_playground.assertion.expected",
                                                )}{" "}
                                                <span className="font-semibold text-foreground">
                                                    {resolveCompletionLabel(
                                                        expectedStatus,
                                                    )}
                                                </span>
                                            </span>
                                            <span className="text-foreground/70">
                                                {t(
                                                    "dev.recovery_playground.assertion.actual",
                                                )}{" "}
                                                <span className="font-semibold text-foreground">
                                                    {resolveCompletionLabel(
                                                        actualStatus,
                                                    )}
                                                </span>
                                            </span>
                                            <span className="font-semibold text-foreground">
                                                {assertionLabel}
                                            </span>
                                            {completion?.reason && (
                                                <span className="text-foreground/60">
                                                    {t(
                                                        "dev.recovery_playground.assertion.reason",
                                                        {
                                                            reason: completion.reason,
                                                        },
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex flex-col gap-tight">
                            {RECOVERY_SMOKE_CASES.map((smokeCase) => {
                                const result = smoke.resultByScenarioId.get(
                                    smokeCase.scenarioId,
                                );
                                const statusLabel = result
                                    ? result.status === "passed"
                                        ? t(
                                              "dev.recovery_playground.smoke.status.passed",
                                          )
                                        : t(
                                              "dev.recovery_playground.smoke.status.failed",
                                          )
                                    : smoke.status === "running"
                                      ? t(
                                            "dev.recovery_playground.smoke.status.running",
                                        )
                                      : t(
                                            "dev.recovery_playground.smoke.status.pending",
                                        );
                                return (
                                    <div
                                        key={smokeCase.scenarioId}
                                        className="surface-layer-1 rounded-panel p-tight flex flex-wrap items-center justify-between gap-tools"
                                    >
                                        <span className="text-label font-medium text-foreground">
                                            {t(
                                                `dev.recovery_playground.scenario.${smokeCase.scenarioId}`,
                                            )}
                                        </span>
                                        <div className="flex items-center gap-tools">
                                            {result?.details && (
                                                <span className="text-label text-foreground/60">
                                                    {result.details}
                                                </span>
                                            )}
                                            <span className="text-label font-semibold text-foreground">
                                                {statusLabel}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </GlassPanel>
            </div>

            <TorrentRecoveryModal
                viewModel={controller.recoveryModalViewModel}
            />
        </Section>
    );
}
