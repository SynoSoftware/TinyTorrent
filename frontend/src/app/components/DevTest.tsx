import { Button, Switch } from "@heroui/react";
import { Copy, ChevronUp, ChevronDown } from "lucide-react";
import TorrentRecoveryModal from "@/modules/dashboard/components/TorrentRecoveryModal";
import { DEV_TEST_PATH } from "@/app/dev/recovery/scenarios";
import { useDevTestViewModel as useDevTestViewModel } from "@/app/viewModels/useDevTestViewModel";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { Section } from "@/shared/ui/layout/Section";

export { DEV_TEST_PATH };

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
                        <h1 className="text-scaled font-bold text-foreground">
                            {viewModel.header.title}
                        </h1>
                        <p className="text-label text-foreground/70">
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
                                <p className="text-label font-semibold text-foreground">
                                    {viewModel.scenario.title}
                                </p>
                                <div className="grid grid-cols-2 gap-tools">
                                    {viewModel.scenario.options.map(
                                        (option) => (
                                            <Button
                                                key={option.id}
                                                variant={
                                                    option.isSelected
                                                        ? "shadow"
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
                                                <div className="flex flex-col items-start gap-tight">
                                                    <span className="font-semibold">
                                                        {option.label}
                                                    </span>
                                                    <span className="text-label text-foreground/70">
                                                        {option.kindLabel}
                                                    </span>
                                                </div>
                                            </Button>
                                        ),
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col gap-tight">
                                <p className="text-label font-semibold text-foreground">
                                    {viewModel.confidence.title}
                                </p>
                                <div className="flex flex-wrap items-center gap-tools">
                                    {viewModel.confidence.options.map(
                                        (option) => (
                                            <Button
                                                key={option.id}
                                                variant={
                                                    option.isSelected
                                                        ? "shadow"
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
                            </div>

                            <div className="flex flex-col gap-tight">
                                <p className="text-label font-semibold text-foreground">
                                    {viewModel.controls.title}
                                </p>
                                <div className="flex flex-wrap items-center gap-stage">
                                    <Switch
                                        isSelected={
                                            viewModel.controls
                                                .verifyFailsSelected
                                        }
                                        onValueChange={
                                            viewModel.controls.setVerifyFails
                                        }
                                        size="sm"
                                    >
                                        {viewModel.controls.verifyFailsLabel}
                                    </Switch>
                                    <div className="flex items-center gap-tools">
                                        <span className="text-label text-foreground/70">
                                            {viewModel.controls.faultModeLabel}
                                        </span>
                                        {viewModel.controls.faultModes.map(
                                            (option) => (
                                                <Button
                                                    key={option.id}
                                                    size="md"
                                                    variant={
                                                        option.isSelected
                                                            ? "shadow"
                                                            : "light"
                                                    }
                                                    color={
                                                        option.isSelected
                                                            ? "primary"
                                                            : "default"
                                                    }
                                                    onPress={option.onSelect}
                                                >
                                                    {option.label}
                                                </Button>
                                            ),
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-tools">
                                <Button
                                    variant="shadow"
                                    color="primary"
                                    size="lg"
                                    onPress={viewModel.actions.applyScenario}
                                >
                                    {viewModel.actions.applyScenarioLabel}
                                </Button>
                                <Button
                                    variant="light"
                                    size="md"
                                    onPress={viewModel.actions.openRecovery}
                                    isDisabled={
                                        viewModel.actions.openRecoveryDisabled
                                    }
                                >
                                    {viewModel.actions.openRecoveryLabel}
                                </Button>
                                <Button
                                    variant="light"
                                    size="md"
                                    onPress={
                                        viewModel.actions.markPathAvailable
                                    }
                                    isDisabled={
                                        viewModel.actions
                                            .markPathAvailableDisabled
                                    }
                                >
                                    {viewModel.actions.markPathAvailableLabel}
                                </Button>
                            </div>

                            <div className="flex flex-wrap items-center gap-stage text-label text-foreground/70">
                                {viewModel.state.rows.map((row) => (
                                    <span key={row.id}>
                                        {row.label}{" "}
                                        <span className="font-semibold text-foreground">
                                            {row.value}
                                        </span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </GlassPanel>

                    <GlassPanel layer={1} className="p-panel">
                        <div className="flex flex-col gap-stage">
                            <div className="flex flex-wrap items-center justify-between gap-tools">
                                <p className="text-label font-semibold text-foreground">
                                    {viewModel.smoke.title}
                                </p>
                                <Button
                                    variant="shadow"
                                    color="primary"
                                    size="md"
                                    isDisabled={viewModel.smoke.runDisabled}
                                    onPress={viewModel.smoke.run}
                                >
                                    {viewModel.smoke.runLabel}
                                </Button>
                            </div>

                            <p className="text-label text-foreground/70">
                                {viewModel.smoke.summaryText}
                            </p>

                            <div className="flex flex-col gap-tight">
                                <p className="text-label font-semibold text-foreground">
                                    {viewModel.smoke.assertionTitle}
                                </p>
                                {viewModel.smoke.assertions.map((assertion) => (
                                    <div
                                        key={assertion.id}
                                        className="surface-layer-1 rounded-panel p-tight flex flex-wrap items-center justify-between gap-tools"
                                    >
                                        <span className="text-label font-medium text-foreground">
                                            {assertion.label}
                                        </span>
                                        <div className="flex flex-wrap items-center gap-tools text-label">
                                            <span className="text-foreground/70">
                                                {assertion.expectedLabel}
                                            </span>
                                            <span className="text-foreground/70">
                                                {assertion.actualLabel}
                                            </span>
                                            <span className="font-semibold text-foreground">
                                                {assertion.assertionLabel}
                                            </span>
                                            {assertion.reasonLabel && (
                                                <span className="text-foreground/60">
                                                    {assertion.reasonLabel}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-col gap-tight">
                                {viewModel.smoke.rows.map((row) => (
                                    <div
                                        key={row.id}
                                        className="surface-layer-1 rounded-panel p-tight flex flex-wrap items-center justify-between gap-tools"
                                    >
                                        <span className="text-label font-medium text-foreground">
                                            {row.label}
                                        </span>
                                        <div className="flex items-center gap-tools">
                                            {row.details && (
                                                <span className="text-label text-foreground/60">
                                                    {row.details}
                                                </span>
                                            )}
                                            <span className="text-label font-semibold text-foreground">
                                                {row.statusLabel}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-col gap-tight">
                                <div className="flex flex-wrap items-center justify-between gap-tools">
                                    <p className="text-label font-semibold text-foreground">
                                        {viewModel.system.title}
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
                                <div className="flex flex-col gap-tight">
                                    {viewModel.system.rows.map((row) => (
                                        <div
                                            key={row.id}
                                            className="surface-layer-1 rounded-panel p-tight flex flex-col gap-tight"
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-tools">
                                                <span className="text-label font-medium text-foreground">
                                                    {row.label}
                                                </span>
                                                <span className="text-label text-foreground/70">
                                                    {
                                                        viewModel.system.columns
                                                            .event
                                                    }{" "}
                                                    {row.eventLabel}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-stage text-label text-foreground/70">
                                                <span>
                                                    {
                                                        viewModel.system.columns
                                                            .completion
                                                    }{" "}
                                                    {row.completionLabel}
                                                </span>
                                                <span>
                                                    {
                                                        viewModel.system.columns
                                                            .resumed
                                                    }{" "}
                                                    {row.resumedLabel}
                                                </span>
                                                <span>
                                                    {
                                                        viewModel.system.columns
                                                            .before
                                                    }{" "}
                                                    {row.beforeState}
                                                </span>
                                                <span>
                                                    {
                                                        viewModel.system.columns
                                                            .after
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

            <TorrentRecoveryModal
                viewModel={viewModel.recoveryModalViewModel}
            />

            {viewModel.footer && (
                <div className="fixed bottom-0 left-0 right-0 z-overlay border-t border-white/10 bg-neutral-900/95 p-4 backdrop-blur-md">
                    <div className="flex flex-col gap-2">
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
                                    size="sm"
                                    variant="flat"
                                    onPress={viewModel.footer.copy}
                                    startContent={<Copy size={16} />}
                                >
                                    {viewModel.footer.copyLabel}
                                </Button>
                                <Button
                                    size="sm"
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
                            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-white/80 border-t border-white/5 pt-2 mt-1">
                                {viewModel.footer.expectedBehavior}
                            </pre>
                        )}
                    </div>
                </div>
            )}
        </Section>
    );
}
