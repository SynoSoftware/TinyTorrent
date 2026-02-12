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
import { TEXT_ROLE } from "@/config/textRoles";

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
const DEV_STATUS_CHIP_CLASSNAMES = {
    base: "border border-default/20 bg-content1/70",
    content: "text-label font-semibold uppercase tracking-tight",
} as const;

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
        <div className="surface-layer-2 rounded-panel p-panel flex flex-col gap-stage">
            <div className="flex flex-col gap-tight">
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
            classNames={DEV_STATUS_CHIP_CLASSNAMES}
        >
            {label}
        </Chip>
    );
}

export default function DevTest() {
    const viewModel = useDevTestViewModel();

    return (
        <Section
            padding="stage"
            className="min-h-screen surface-layer-0 text-foreground pb-stage"
        >
            <div className="flex flex-col gap-stage">
                <div className="flex flex-wrap items-center justify-between gap-tools">
                    <div className="flex flex-col gap-tight">
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

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-stage">
                    <GlassPanel layer={1} className="p-panel">
                        <div className="flex flex-col gap-stage">
                            <div className="flex flex-col gap-tight">
                                <p className={DEV_STEP_LABEL_CLASS}>
                                    {viewModel.workflow.panels.inputs}
                                </p>
                                <h2 className="text-navbar font-semibold text-foreground">
                                    {viewModel.header.title}
                                </h2>
                            </div>

                            <DevWorkflowStep
                                stepLabel={viewModel.workflow.steps.scenario}
                                title={viewModel.scenario.title}
                            >
                                <div className="flex flex-col gap-tools">
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
                                                className="h-auto w-full justify-start whitespace-normal text-left"
                                                onPress={option.onSelect}
                                            >
                                                <span className="text-scaled font-medium">
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
                                <div className="flex flex-wrap items-center gap-tools">
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
                                <div className="flex flex-col gap-tools">
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
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-tools">
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
                                                    className="justify-start text-left whitespace-normal"
                                                    onPress={option.onSelect}
                                                >
                                                    <span className="text-scaled font-medium">
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
                                <div className="flex flex-wrap items-center justify-between gap-stage">
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
                                    <div className="flex flex-wrap items-center justify-end gap-tools">
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
                                <div className="flex flex-wrap items-center gap-tools text-label text-foreground/70">
                                    {viewModel.state.rows.map((row) => (
                                        <span
                                            key={row.id}
                                            className="surface-layer-1 rounded-pill px-tight py-tight"
                                        >
                                            {row.label}{" "}
                                            <span className="font-semibold text-foreground">
                                                {row.value}
                                            </span>
                                        </span>
                                    ))}
                                </div>
                            </DevWorkflowStep>
                        </div>
                    </GlassPanel>

                    <div className="lg:border-l lg:border-default/20 lg:pl-panel">
                        <GlassPanel
                            layer={1}
                            className="p-panel bg-content1/35"
                        >
                            <div className="flex flex-col gap-stage">
                                <div className="flex flex-col gap-tight">
                                    <p className={DEV_STEP_LABEL_CLASS}>
                                        {viewModel.workflow.panels.results}
                                    </p>
                                    <h2 className="text-navbar font-semibold text-foreground">
                                        {viewModel.workflow.results.execution}
                                    </h2>
                                </div>

                                <div className="surface-layer-2 rounded-panel p-panel flex flex-col gap-stage">
                                    <div className="flex flex-wrap items-center justify-between gap-tools">
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
                                    <p className="text-label text-foreground/70">
                                        {viewModel.smoke.summaryText}
                                    </p>
                                    <div className="surface-layer-1 rounded-panel p-tight flex flex-col divide-y divide-default/10">
                                        {viewModel.smoke.rows.map((row) => (
                                            <div
                                                key={row.id}
                                                className="py-tight flex flex-wrap items-center justify-between gap-tools"
                                            >
                                                <span className="text-scaled text-foreground">
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

                                <div className="surface-layer-2 rounded-panel p-panel flex flex-col gap-stage">
                                    <p className={DEV_GROUP_TITLE_CLASS}>
                                        {
                                            viewModel.workflow.results
                                                .verification
                                        }
                                    </p>
                                    <p className="text-label text-foreground/70">
                                        {viewModel.smoke.assertionTitle}
                                    </p>
                                    <div className="surface-layer-1 rounded-panel overflow-hidden">
                                        <table className="w-full border-separate border-spacing-0 text-left">
                                            <thead className="bg-background/40">
                                                <tr className="border-b border-default/15">
                                                    <th
                                                        className={cn(
                                                            DEV_STEP_LABEL_CLASS,
                                                            "px-panel py-tight",
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
                                                            "px-panel py-tight",
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
                                                            "px-panel py-tight",
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
                                                            "px-panel py-tight",
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
                                                            className="border-b border-default/10 last:border-b-0"
                                                        >
                                                            <td className="px-panel py-tight">
                                                                <div className="flex flex-col gap-tight">
                                                                    <span className="text-scaled text-foreground">
                                                                        {
                                                                            assertion.label
                                                                        }
                                                                    </span>
                                                                    {assertion.reasonLabel && (
                                                                        <span className="text-label text-foreground/60">
                                                                            {
                                                                                assertion.reasonLabel
                                                                            }
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-panel py-tight text-scaled text-foreground/75">
                                                                {
                                                                    assertion.expectedLabel
                                                                }
                                                            </td>
                                                            <td className="px-panel py-tight text-scaled text-foreground/75">
                                                                {
                                                                    assertion.actualLabel
                                                                }
                                                            </td>
                                                            <td className="px-panel py-tight">
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

                                <div className="surface-layer-2 rounded-panel p-panel flex flex-col gap-stage">
                                    <div className="flex flex-wrap items-center justify-between gap-tools">
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
                                    <p className="text-label text-foreground/70">
                                        {viewModel.system.summaryText}
                                    </p>
                                    <div className="flex flex-col gap-tools">
                                        {viewModel.system.rows.map((row) => (
                                            <div
                                                key={row.id}
                                                className="surface-layer-1 rounded-panel p-tight border-l border-default/20 pl-panel flex flex-col gap-tools"
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-tools">
                                                    <span className="text-scaled font-medium text-foreground">
                                                        {row.label}
                                                    </span>
                                                    <span className="text-label text-foreground/60">
                                                        {row.eventLabel}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-stage">
                                                    <div className="flex items-center gap-tight">
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
                                                    <div className="flex items-center gap-tight">
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
                                                <div className="flex flex-wrap items-center gap-stage text-label text-foreground/70">
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
                                                    <span className="text-label text-foreground/60">
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
                <div className="fixed bottom-0 left-0 right-0 z-overlay border-t border-default/20 bg-content1/85 p-panel backdrop-blur-xl">
                    <div className="flex flex-col gap-tools">
                        <div className="flex flex-wrap items-center justify-between gap-tools">
                            <div className="flex flex-wrap items-center gap-tools">
                                <span className="text-label font-semibold text-foreground">
                                    {viewModel.footer.scenarioLabel}
                                </span>
                                <span className="surface-layer-1 rounded-panel px-tight py-tight text-label text-foreground/70">
                                    {viewModel.footer.scenarioKindLabel}
                                </span>
                                {!viewModel.footer.isExpanded && (
                                    <span className="text-label text-foreground/50 truncate flex-1 min-w-0">
                                        {viewModel.footer.summary}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-tools">
                                <span className="text-label text-foreground/60">
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
                            <pre className="whitespace-pre-wrap font-mono text-label leading-relaxed text-foreground/80 border-t border-default/10 pt-tight mt-tight">
                                {viewModel.footer.expectedBehavior}
                            </pre>
                        )}
                    </div>
                </div>
            )}
        </Section>
    );
}
