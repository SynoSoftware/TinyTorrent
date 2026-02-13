import { Button, Chip, cn, Switch, type ChipProps } from "@heroui/react";
import type { ReactNode } from "react";
import { Copy, ChevronUp, ChevronDown } from "lucide-react";
import TorrentRecoveryModal from "@/modules/dashboard/components/TorrentRecoveryModal";
import { DEV_TEST_PATH } from "@/app/dev/recovery/scenarios";
import {
    type DevTestStatusTone,
    useDevTestViewModel as useDevTestViewModel,
} from "@/app/viewModels/useDevTestViewModel";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { Section } from "@/shared/ui/layout/Section";
import { TEXT_ROLE, TEXT_ROLE_EXTENDED } from "@/config/textRoles";
import { DIAGNOSTIC } from "@/shared/ui/layout/glass-surface";

export { DEV_TEST_PATH };

const DEV_STEP_LABEL_CLASS = TEXT_ROLE.label;
const DEV_GROUP_TITLE_CLASS = TEXT_ROLE.headingSection;
const DEV_STATUS_CHIP_COLOR: Record<DevTestStatusTone, ChipProps["color"]> = {
    default: "default",
    primary: "primary",
    success: "success",
    warning: "warning",
    danger: "danger",
};
function DevWorkflowStep({
    stepLabel,
    title,
    children,
}: {
    stepLabel: string;
    title: string;
    children: ReactNode;
}) {
    return (
        <div className={DIAGNOSTIC.stepCard}>
            <div className={DIAGNOSTIC.stepHeader}>
                <p className={DEV_STEP_LABEL_CLASS}>{stepLabel}</p>
                <p className={DEV_GROUP_TITLE_CLASS}>{title}</p>
            </div>
            {children}
        </div>
    );
}

function DevStatusToken({
    label,
    tone,
    className,
}: {
    label: string;
    tone: DevTestStatusTone;
    className?: string;
}) {
    return (
        <Chip
            size="md"
            variant="flat"
            color={DEV_STATUS_CHIP_COLOR[tone]}
            className={className}
            classNames={DIAGNOSTIC.statusChipClassNames}
        >
            {label}
        </Chip>
    );
}

export default function DevTest() {
    const viewModel = useDevTestViewModel();

    return (
        <Section padding="stage" className={DIAGNOSTIC.root}>
            <div className={DIAGNOSTIC.stack}>
                <div className={DIAGNOSTIC.topbar}>
                    <div className={DIAGNOSTIC.topbarText}>
                        <h1 className={TEXT_ROLE.heading}>
                            {viewModel.header.title}
                        </h1>
                        <p className={TEXT_ROLE.bodySmall}>
                            {viewModel.header.subtitle}
                        </p>
                    </div>
                    <Button as="a" href="/" variant="light" size="md">
                        {viewModel.header.backLabel}
                    </Button>
                </div>

                <div className={DIAGNOSTIC.grid}>
                    <GlassPanel layer={1} className={DIAGNOSTIC.panelPrimary}>
                        <div className={DIAGNOSTIC.stack}>
                            <div className={DIAGNOSTIC.stepHeader}>
                                <p className={DEV_STEP_LABEL_CLASS}>
                                    {viewModel.workflow.panels.inputs}
                                </p>
                                <h2 className={DIAGNOSTIC.sectionTitle}>
                                    {viewModel.header.title}
                                </h2>
                            </div>

                            <DevWorkflowStep
                                stepLabel={viewModel.workflow.steps.scenario}
                                title={viewModel.scenario.title}
                            >
                                <div className={DIAGNOSTIC.optionsStack}>
                                    {viewModel.scenario.options.map(
                                        (option) => (
                                            <Button
                                                key={option.id}
                                                variant={
                                                    option.isSelected
                                                        ? "flat"
                                                        : "light"
                                                }
                                                color={
                                                    option.isSelected
                                                        ? "primary"
                                                        : "default"
                                                }
                                                size="md"
                                                className={
                                                    DIAGNOSTIC.optionButtonFull
                                                }
                                                onPress={option.onSelect}
                                            >
                                                <span
                                                    className={cn(
                                                        TEXT_ROLE.body,
                                                        "font-medium",
                                                    )}
                                                >
                                                    {option.label}
                                                </span>
                                            </Button>
                                        ),
                                    )}
                                </div>
                            </DevWorkflowStep>

                            <DevWorkflowStep
                                stepLabel={viewModel.workflow.steps.confidence}
                                title={viewModel.confidence.title}
                            >
                                <div className={DIAGNOSTIC.optionsWrap}>
                                    {viewModel.confidence.options.map(
                                        (option) => (
                                            <Button
                                                key={option.id}
                                                variant={
                                                    option.isSelected
                                                        ? "flat"
                                                        : "light"
                                                }
                                                color={
                                                    option.isSelected
                                                        ? "primary"
                                                        : "default"
                                                }
                                                size="md"
                                                onPress={option.onSelect}
                                            >
                                                {option.label}
                                            </Button>
                                        ),
                                    )}
                                </div>
                            </DevWorkflowStep>

                            <DevWorkflowStep
                                stepLabel={viewModel.workflow.steps.controls}
                                title={viewModel.controls.title}
                            >
                                <div className={DIAGNOSTIC.optionsStack}>
                                    <Switch
                                        isSelected={
                                            viewModel.controls
                                                .verifyFailsSelected
                                        }
                                        onValueChange={
                                            viewModel.controls.setVerifyFails
                                        }
                                        size="md"
                                    >
                                        {viewModel.controls.verifyFailsLabel}
                                    </Switch>
                                    <p className={DEV_STEP_LABEL_CLASS}>
                                        {viewModel.controls.faultModeLabel}
                                    </p>
                                    <div
                                        className={
                                            DIAGNOSTIC.optionsGridResponsive
                                        }
                                    >
                                        {viewModel.controls.faultModes.map(
                                            (option) => (
                                                <Button
                                                    key={option.id}
                                                    size="md"
                                                    variant={
                                                        option.isSelected
                                                            ? "flat"
                                                            : "light"
                                                    }
                                                    color={
                                                        option.isSelected
                                                            ? "primary"
                                                            : "default"
                                                    }
                                                    className={
                                                        DIAGNOSTIC.optionButtonLeft
                                                    }
                                                    onPress={option.onSelect}
                                                >
                                                    <span
                                                        className={cn(
                                                            TEXT_ROLE.body,
                                                            DIAGNOSTIC.optionLabelStrong,
                                                        )}
                                                    >
                                                        {
                                                            viewModel.controls
                                                                .simulatePrefixLabel
                                                        }{" "}
                                                        {option.label}
                                                    </span>
                                                </Button>
                                            ),
                                        )}
                                    </div>
                                </div>
                            </DevWorkflowStep>

                            <DevWorkflowStep
                                stepLabel={viewModel.workflow.steps.execute}
                                title={viewModel.actions.applyScenarioLabel}
                            >
                                <div className={DIAGNOSTIC.executeRow}>
                                    <Button
                                        variant="shadow"
                                        color="primary"
                                        size="lg"
                                        onPress={
                                            viewModel.actions.applyScenario
                                        }
                                    >
                                        {viewModel.actions.applyScenarioLabel}
                                    </Button>
                                    <div className={DIAGNOSTIC.executeActions}>
                                        <Button
                                            variant="light"
                                            size="md"
                                            onPress={
                                                viewModel.actions.openRecovery
                                            }
                                            isDisabled={
                                                viewModel.actions
                                                    .openRecoveryDisabled
                                            }
                                        >
                                            {
                                                viewModel.actions
                                                    .openRecoveryLabel
                                            }
                                        </Button>
                                        <Button
                                            variant="light"
                                            size="md"
                                            onPress={
                                                viewModel.actions
                                                    .markPathAvailable
                                            }
                                            isDisabled={
                                                viewModel.actions
                                                    .markPathAvailableDisabled
                                            }
                                        >
                                            {
                                                viewModel.actions
                                                    .markPathAvailableLabel
                                            }
                                        </Button>
                                    </div>
                                </div>
                                <div
                                    className={cn(
                                        DIAGNOSTIC.stateRow,
                                        TEXT_ROLE.bodySmall,
                                    )}
                                >
                                    {viewModel.state.rows.map((row) => (
                                        <span
                                            key={row.id}
                                            className={DIAGNOSTIC.statePill}
                                        >
                                            {row.label}{" "}
                                            <span
                                                className={
                                                    DIAGNOSTIC.statePillValue
                                                }
                                            >
                                                {row.value}
                                            </span>
                                        </span>
                                    ))}
                                </div>
                            </DevWorkflowStep>
                        </div>
                    </GlassPanel>

                    <div className={DIAGNOSTIC.panelSecondaryWrap}>
                        <GlassPanel
                            layer={1}
                            className={DIAGNOSTIC.panelSecondary}
                        >
                            <div className={DIAGNOSTIC.stack}>
                                <div className={DIAGNOSTIC.stepHeader}>
                                    <p className={DEV_STEP_LABEL_CLASS}>
                                        {viewModel.workflow.panels.results}
                                    </p>
                                    <h2 className={DIAGNOSTIC.sectionTitle}>
                                        {viewModel.workflow.results.execution}
                                    </h2>
                                </div>

                                <div className={DIAGNOSTIC.smokeCard}>
                                    <div className={DIAGNOSTIC.topbar}>
                                        <p className={DEV_GROUP_TITLE_CLASS}>
                                            {viewModel.smoke.title}
                                        </p>
                                        <Button
                                            variant="shadow"
                                            color="primary"
                                            size="md"
                                            isDisabled={
                                                viewModel.smoke.runDisabled
                                            }
                                            onPress={viewModel.smoke.run}
                                        >
                                            {viewModel.smoke.runLabel}
                                        </Button>
                                    </div>
                                    <p className={TEXT_ROLE.bodySmall}>
                                        {viewModel.smoke.summaryText}
                                    </p>
                                    <div className={DIAGNOSTIC.smokeRows}>
                                        {viewModel.smoke.rows.map((row) => (
                                            <div
                                                key={row.id}
                                                className={DIAGNOSTIC.smokeRow}
                                            >
                                                <span
                                                    className={TEXT_ROLE.body}
                                                >
                                                    {row.label}
                                                </span>
                                                <DevStatusToken
                                                    label={row.statusLabel}
                                                    tone={row.statusTone}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className={DIAGNOSTIC.verifyCard}>
                                    <p className={DEV_GROUP_TITLE_CLASS}>
                                        {
                                            viewModel.workflow.results
                                                .verification
                                        }
                                    </p>
                                    <p className={TEXT_ROLE.bodySmall}>
                                        {viewModel.smoke.assertionTitle}
                                    </p>
                                    <div className={DIAGNOSTIC.verifyTableWrap}>
                                        <table
                                            className={DIAGNOSTIC.verifyTable}
                                        >
                                            <thead
                                                className={
                                                    DIAGNOSTIC.verifyHead
                                                }
                                            >
                                                <tr
                                                    className={
                                                        DIAGNOSTIC.verifyHeadRow
                                                    }
                                                >
                                                    <th
                                                        className={cn(
                                                            DEV_STEP_LABEL_CLASS,
                                                            DIAGNOSTIC.verifyHeaderCell,
                                                        )}
                                                    >
                                                        {
                                                            viewModel.smoke
                                                                .columns
                                                                .scenario
                                                        }
                                                    </th>
                                                    <th
                                                        className={cn(
                                                            DEV_STEP_LABEL_CLASS,
                                                            DIAGNOSTIC.verifyHeaderCell,
                                                        )}
                                                    >
                                                        {
                                                            viewModel.smoke
                                                                .columns
                                                                .expected
                                                        }
                                                    </th>
                                                    <th
                                                        className={cn(
                                                            DEV_STEP_LABEL_CLASS,
                                                            DIAGNOSTIC.verifyHeaderCell,
                                                        )}
                                                    >
                                                        {
                                                            viewModel.smoke
                                                                .columns.actual
                                                        }
                                                    </th>
                                                    <th
                                                        className={cn(
                                                            DEV_STEP_LABEL_CLASS,
                                                            DIAGNOSTIC.verifyHeaderCell,
                                                        )}
                                                    >
                                                        {
                                                            viewModel.smoke
                                                                .columns.status
                                                        }
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {viewModel.smoke.assertions.map(
                                                    (assertion) => (
                                                        <tr
                                                            key={assertion.id}
                                                            className={
                                                                DIAGNOSTIC.verifyRow
                                                            }
                                                        >
                                                            <td
                                                                className={
                                                                    DIAGNOSTIC.verifyCell
                                                                }
                                                            >
                                                                <div
                                                                    className={
                                                                        DIAGNOSTIC.verifyLabelWrap
                                                                    }
                                                                >
                                                                    <span
                                                                        className={
                                                                            TEXT_ROLE.body
                                                                        }
                                                                    >
                                                                        {
                                                                            assertion.label
                                                                        }
                                                                    </span>
                                                                    {assertion.reasonLabel && (
                                                                        <span
                                                                            className={
                                                                                TEXT_ROLE.caption
                                                                            }
                                                                        >
                                                                            {
                                                                                assertion.reasonLabel
                                                                            }
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td
                                                                className={cn(
                                                                    DIAGNOSTIC.verifyCell,
                                                                    TEXT_ROLE_EXTENDED.tableCell,
                                                                )}
                                                            >
                                                                {
                                                                    assertion.expectedLabel
                                                                }
                                                            </td>
                                                            <td
                                                                className={cn(
                                                                    DIAGNOSTIC.verifyCell,
                                                                    TEXT_ROLE_EXTENDED.tableCell,
                                                                )}
                                                            >
                                                                {
                                                                    assertion.actualLabel
                                                                }
                                                            </td>
                                                            <td
                                                                className={
                                                                    DIAGNOSTIC.verifyCell
                                                                }
                                                            >
                                                                <DevStatusToken
                                                                    label={
                                                                        assertion.assertionLabel
                                                                    }
                                                                    tone={
                                                                        assertion.statusTone
                                                                    }
                                                                />
                                                            </td>
                                                        </tr>
                                                    ),
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className={DIAGNOSTIC.systemCard}>
                                    <div className={DIAGNOSTIC.topbar}>
                                        <p className={DEV_GROUP_TITLE_CLASS}>
                                            {
                                                viewModel.workflow.results
                                                    .systemReactions
                                            }
                                        </p>
                                        <Button
                                            variant="shadow"
                                            color="primary"
                                            size="md"
                                            isDisabled={
                                                viewModel.system.runDisabled
                                            }
                                            onPress={viewModel.system.run}
                                        >
                                            {viewModel.system.runLabel}
                                        </Button>
                                    </div>
                                    <p className={TEXT_ROLE.bodySmall}>
                                        {viewModel.system.summaryText}
                                    </p>
                                    <div className={DIAGNOSTIC.systemRows}>
                                        {viewModel.system.rows.map((row) => (
                                            <div
                                                key={row.id}
                                                className={
                                                    DIAGNOSTIC.systemRowCard
                                                }
                                            >
                                                <div
                                                    className={
                                                        DIAGNOSTIC.systemRowHead
                                                    }
                                                >
                                                    <span
                                                        className={cn(
                                                            TEXT_ROLE.body,
                                                            DIAGNOSTIC.optionLabelStrong,
                                                        )}
                                                    >
                                                        {row.label}
                                                    </span>
                                                    <span
                                                        className={
                                                            TEXT_ROLE.caption
                                                        }
                                                    >
                                                        {row.eventLabel}
                                                    </span>
                                                </div>
                                                <div
                                                    className={
                                                        DIAGNOSTIC.systemStatusRow
                                                    }
                                                >
                                                    <div
                                                        className={
                                                            DIAGNOSTIC.systemStatusPair
                                                        }
                                                    >
                                                        <span
                                                            className={
                                                                DEV_STEP_LABEL_CLASS
                                                            }
                                                        >
                                                            {
                                                                viewModel.system
                                                                    .columns
                                                                    .completion
                                                            }
                                                        </span>
                                                        <DevStatusToken
                                                            label={
                                                                row.completionLabel
                                                            }
                                                            tone={
                                                                row.completionTone
                                                            }
                                                        />
                                                    </div>
                                                    <div
                                                        className={
                                                            DIAGNOSTIC.systemStatusPair
                                                        }
                                                    >
                                                        <span
                                                            className={
                                                                DEV_STEP_LABEL_CLASS
                                                            }
                                                        >
                                                            {
                                                                viewModel.system
                                                                    .columns
                                                                    .resumed
                                                            }
                                                        </span>
                                                        <DevStatusToken
                                                            label={
                                                                row.resumedLabel
                                                            }
                                                            tone={
                                                                row.resumedTone
                                                            }
                                                        />
                                                    </div>
                                                </div>
                                                <div
                                                    className={cn(
                                                        DIAGNOSTIC.systemMeta,
                                                        TEXT_ROLE.bodySmall,
                                                    )}
                                                >
                                                    <span>
                                                        {
                                                            viewModel.system
                                                                .columns.before
                                                        }{" "}
                                                        {row.beforeState}
                                                    </span>
                                                    <span>
                                                        {
                                                            viewModel.system
                                                                .columns.after
                                                        }{" "}
                                                        {row.afterState}
                                                    </span>
                                                </div>
                                                {row.details && (
                                                    <span
                                                        className={
                                                            TEXT_ROLE.caption
                                                        }
                                                    >
                                                        {row.details}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </GlassPanel>
                    </div>
                </div>
            </div>

            <TorrentRecoveryModal
                viewModel={viewModel.recoveryModalViewModel}
            />

            {viewModel.footer && (
                <div className={DIAGNOSTIC.footer}>
                    <div className={DIAGNOSTIC.footerStack}>
                        <div className={DIAGNOSTIC.footerRow}>
                            <div className={DIAGNOSTIC.footerLeft}>
                                <span
                                    className={cn(
                                        TEXT_ROLE.bodySmall,
                                        DIAGNOSTIC.footerScenarioLabel,
                                    )}
                                >
                                    {viewModel.footer.scenarioLabel}
                                </span>
                                <span
                                    className={cn(
                                        DIAGNOSTIC.footerScenario,
                                        TEXT_ROLE.bodySmall,
                                    )}
                                >
                                    {viewModel.footer.scenarioKindLabel}
                                </span>
                                {!viewModel.footer.isExpanded && (
                                    <span
                                        className={cn(
                                            DIAGNOSTIC.footerSummary,
                                            TEXT_ROLE.caption,
                                            DIAGNOSTIC.footerSummaryMuted,
                                        )}
                                    >
                                        {viewModel.footer.summary}
                                    </span>
                                )}
                            </div>
                            <div className={DIAGNOSTIC.footerRight}>
                                <span className={TEXT_ROLE.caption}>
                                    {viewModel.footer.copyStatusLabel}
                                </span>
                                <Button
                                    size="md"
                                    variant="flat"
                                    onPress={viewModel.footer.copy}
                                    startContent={<Copy size={16} />}
                                >
                                    {viewModel.footer.copyLabel}
                                </Button>
                                <Button
                                    size="md"
                                    variant="light"
                                    isIconOnly
                                    onPress={viewModel.footer.toggleExpanded}
                                >
                                    {viewModel.footer.isExpanded ? (
                                        <ChevronDown size={16} />
                                    ) : (
                                        <ChevronUp size={16} />
                                    )}
                                </Button>
                            </div>
                        </div>

                        {viewModel.footer.isExpanded && (
                            <pre
                                className={cn(
                                    DIAGNOSTIC.footerExpected,
                                    TEXT_ROLE.codeMuted,
                                    DIAGNOSTIC.footerExpectedTone,
                                )}
                            >
                                {viewModel.footer.expectedBehavior}
                            </pre>
                        )}
                    </div>
                </div>
            )}
        </Section>
    );
}
