import {
    Button,
    Card,
    Chip,
    Switch,
    cn,
} from "@heroui/react";
import type { ChipProps } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAsyncToggle } from "@/modules/settings/hooks/useAsyncToggle";
import type { ReactNode } from "react";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import { useShellAgent } from "@/app/hooks/useShellAgent";
import { useUiModeCapabilities } from "@/app/context/UiModeContext";

// TODO: Replace direct NativeShell system-integration calls with the ShellAgent/ShellExtensions adapter; enforce locality rules (only when connected to localhost) and render a clear “ShellExtensions unavailable” state for remote/browser connections.
// TODO: IMPORTANT: This file should NOT *determine* locality/ShellExtensions availability. It should *consume* a single capability/locality source of truth (context/provider).
// TODO: Gating rule for these controls is `uiMode === "Full"` (single source of truth). `uiMode` must be computed once from:
// TODO: - endpoint is loopback (localhost/127.0.0.1/::1) AND
// TODO: - ShellAgent bridge is available
// TODO: Otherwise (`uiMode === "Rpc"`), render disabled with clear UX explaining why (remote daemon or browser runtime => no host integration).
// TODO: Do not model this as `serverClass === "tinytorrent"`: that label conflates “daemon protocol” with “host integration available”.
// TODO: In the current architecture, the daemon is always `transmission-daemon` (Transmission RPC). “Host integration available” is a separate, local-only capability.
// TODO: Remove any mention of TT token/security protocol from this surface; it is not relevant in Transmission-only mode.

interface SystemSectionCardProps {
    title?: string;
    description?: string;
    children: ReactNode;
}

function SystemSectionCard({
    title,
    description,
    children,
}: SystemSectionCardProps) {
    return (
        <Card
            shadow="sm"
            className="bg-content1/50 border border-content1/20 rounded-2xl p-panel"
        >
            {title && (
                <h3
                    className="text-scaled font-bold uppercase text-foreground/40 mb-panel leading-tight"
                    style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
                >
                    {title}
                </h3>
            )}
            {description && (
                <p
                    className="text-scaled uppercase text-foreground/50 mb-panel"
                    style={{ letterSpacing: "var(--tt-tracking-wide)" }}
                >
                    {description}
                </p>
            )}
            <div className="space-y-stage">{children}</div>
        </Card>
    );
}

interface SystemRowProps {
    label: string;
    control: ReactNode;
    status?: ReactNode;
    helper?: string;
    disabled?: boolean;
}

function SystemRow({
    label,
    control,
    status,
    helper,
    disabled,
}: SystemRowProps) {
    return (
        <div
            className={cn(
                "flex flex-col gap-tight",
                disabled && "opacity-50 pointer-events-none"
            )}
        >
            <div className="flex items-center justify-between h-row px-panel">
                <span
                    className={cn(
                        "text-scaled font-medium text-foreground/80",
                        disabled && "opacity-40"
                    )}
                >
                    {label}
                </span>
                <div className="flex items-center gap-tools whitespace-nowrap">
                    {control}
                    {status}
                </div>
            </div>
            {helper && (
                <p
                    className={cn(
                        "px-panel text-label text-foreground/60",
                        disabled && "opacity-40"
                    )}
                >
                    {helper}
                </p>
            )}
        </div>
    );
}

function StatusChip({
    label,
    color = "default",
}: {
    label: string;
    color?: ChipProps["color"];
}) {
    return (
        <Chip
            size="sm"
            variant="flat"
            color={color}
            radius="sm"
            className="font-semibold text-scaled tracking-tight"
        >
            {label}
        </Chip>
    );
}

interface SystemTabContentProps {
    isNativeMode: boolean;
}

export function SystemTabContent({ isNativeMode }: SystemTabContentProps) {
    const { t } = useTranslation();
    const { shellAgent } = useShellAgent();
    const { uiMode } = useUiModeCapabilities();

    const [integrationStatus, setIntegrationStatus] = useState({
        autorun: false,
        associations: false,
    });
    const [integrationLoading, setIntegrationLoading] = useState(true);
    const [associationPending, setAssociationPending] = useState(false);
    const canUseShell =
        isNativeMode && uiMode === "Full" && shellAgent.isAvailable;

    const refreshIntegration = useCallback(async () => {
        if (!canUseShell) {
            setIntegrationLoading(false);
            return;
        }
        setIntegrationLoading(true);
        try {
            const status = await shellAgent.getSystemIntegrationStatus();
            setIntegrationStatus({
                autorun: Boolean(status.autorun),
                associations: Boolean(status.associations),
            });
        } catch {
            // Preserve previous values on failure.
        } finally {
            setIntegrationLoading(false);
        }
    }, [canUseShell, shellAgent]);

    useEffect(() => {
        if (!canUseShell) {
            setIntegrationLoading(false);
            return;
        }
        void refreshIntegration();
    }, [canUseShell, refreshIntegration]);

    const setAutorunState = useCallback((next: boolean) => {
        setIntegrationStatus((prev) => ({ ...prev, autorun: next }));
    }, []);

    const autorunToggle = useAsyncToggle(
        Boolean(integrationStatus.autorun),
        setAutorunState,
        async (next) => {
            if (!canUseShell) return;
            await shellAgent.setSystemIntegration({ autorun: next });
            await refreshIntegration();
        }
    );

    const handleAssociationRepair = useCallback(async () => {
        if (!canUseShell) return;
        setAssociationPending(true);
        try {
            await shellAgent.setSystemIntegration({ associations: true });
        } finally {
            setAssociationPending(false);
            await refreshIntegration();
        }
    }, [canUseShell, refreshIntegration, shellAgent]);

    const handleAssociationRefresh = useCallback(async () => {
        if (!canUseShell) return;
        await refreshIntegration();
    }, [canUseShell, refreshIntegration]);

    const associationLabel =
        canUseShell && !integrationLoading
            ? integrationStatus.associations
                ? t("settings.system.handlers_registered")
                : t("settings.system.handlers_not_registered")
            : t("settings.system.handlers_unknown");

    const associationChipColor =
        canUseShell && !integrationLoading && integrationStatus.associations
            ? "success"
            : canUseShell && !integrationLoading
            ? "danger"
            : "default";

    const associationButtonLabel = integrationStatus.associations
        ? t("settings.system.refreshAssociation")
        : t("settings.system.repairAssociation");
    const handleAssociationAction = integrationStatus.associations
        ? handleAssociationRefresh
        : handleAssociationRepair;

    const autorunLabel =
        canUseShell && !integrationLoading
            ? integrationStatus.autorun
                ? t("settings.system.autorun_enabled")
                : t("settings.system.autorun_disabled")
            : t("settings.system.autorun_unknown");

    const autorunDisabled =
        !canUseShell || integrationLoading || autorunToggle.pending;

    if (!canUseShell) {
        return (
            <SettingsSection
                title={t("settings.headers.system")}
                description={t("settings.descriptions.system_integration")}
            >
                <div className="mt-panel flex flex-col gap-tight">
                    <p className="text-scaled text-foreground/80">
                        {t("settings.system.notice")}
                    </p>
                    <p className="text-label text-foreground/60">
                        {t("settings.system.instructions")}
                    </p>
                </div>
            </SettingsSection>
        );
    }

    return (
        <div className="space-y-stage">
            <SystemSectionCard
                title={t("settings.sections.system_integration")}
                description={t("settings.descriptions.system_integration")}
            >
                <SystemRow
                    label={t("settings.labels.defaultTorrentApp")}
                    control={
                        <Button
                            size="sm"
                            variant="bordered"
                            radius="full"
                            onPress={handleAssociationAction}
                            isDisabled={
                                associationPending ||
                                !canUseShell ||
                                integrationLoading
                            }
                        >
                            {associationButtonLabel}
                        </Button>
                    }
                    status={
                        <StatusChip
                            label={associationLabel}
                            color={associationChipColor}
                        />
                    }
                />
            </SystemSectionCard>
            <SystemSectionCard
                title={t("settings.sections.startup")}
                description={t("settings.descriptions.startup")}
            >
                <SystemRow
                    label={t("settings.labels.launchOnStartup")}
                    control={
                        <Switch
                            size="md"
                            color="primary"
                            isSelected={integrationStatus.autorun}
                            onValueChange={autorunToggle.onChange}
                            isDisabled={autorunDisabled}
                        />
                    }
                    status={<StatusChip label={autorunLabel} color="default" />}
                />
            </SystemSectionCard>
        </div>
    );
}
