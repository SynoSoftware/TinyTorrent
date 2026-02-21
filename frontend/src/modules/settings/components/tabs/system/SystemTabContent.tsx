import { Button, Chip, Switch, cn } from "@heroui/react";
import type { ChipProps } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAsyncToggle } from "@/modules/settings/hooks/useAsyncToggle";
import type { ReactNode } from "react";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import {
    shellAgent,
    type SystemIntegrationReadOutcome,
} from "@/app/agents/shell-agent";
import { useUiModeCapabilities } from "@/app/context/SessionContext";
import { VISUAL_STATE } from "@/config/logic";
import { TEXT_ROLE } from "@/config/textRoles";
import { FORM } from "@/shared/ui/layout/glass-surface";

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
        <div className={FORM.sectionCardEmphasized}>
            {title && (
                <h3
                    className={FORM.sectionTitle}
                    style={FORM.sectionTitleTrackingStyle}
                >
                    {title}
                </h3>
            )}
            {description && (
                <p
                    className={FORM.sectionDescription}
                    style={FORM.sectionDescriptionTrackingStyle}
                >
                    {description}
                </p>
            )}
            <div className={FORM.sectionContentStack}>{children}</div>
        </div>
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
        <div className={cn(FORM.systemRow, disabled && VISUAL_STATE.disabled)}>
            <div className={FORM.systemRowHeader}>
                <span
                    className={cn(
                        FORM.systemRowLabel,
                        disabled && VISUAL_STATE.muted,
                    )}
                >
                    {label}
                </span>
                <div className={FORM.systemRowControl}>
                    {control}
                    {status}
                </div>
            </div>
            {helper && (
                <p
                    className={cn(
                        FORM.systemRowHelper,
                        disabled && VISUAL_STATE.muted,
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
            className={FORM.systemStatusChip}
        >
            {label}
        </Chip>
    );
}

export function SystemTabContent() {
    const { t } = useTranslation();
    const { uiMode, shellAgentAvailable } = useUiModeCapabilities();

    const [integrationStatus, setIntegrationStatus] = useState({
        autorun: false,
        associations: false,
    });
    const [integrationReadStatus, setIntegrationReadStatus] = useState<
        "ok" | "unsupported" | "failed"
    >("ok");
    const [integrationLoading, setIntegrationLoading] = useState(true);
    const [associationPending, setAssociationPending] = useState(false);
    const [autorunErrorMessage, setAutorunErrorMessage] = useState<
        string | null
    >(null);
    const canUseShell = uiMode === "Full" && shellAgentAvailable;

    const refreshIntegration =
        useCallback(async (): Promise<SystemIntegrationReadOutcome> => {
            if (!canUseShell) {
                setIntegrationReadStatus("unsupported");
                setIntegrationLoading(false);
                return { status: "unsupported" };
            }
            setIntegrationLoading(true);
            try {
                const outcome =
                    await shellAgent.getSystemIntegrationStatusReadOutcome();
                setIntegrationReadStatus(outcome.status);
                if (outcome.status === "ok") {
                    setIntegrationStatus({
                        autorun: Boolean(outcome.value.autorun),
                        associations: Boolean(outcome.value.associations),
                    });
                }
                return outcome;
            } catch {
                setIntegrationReadStatus("failed");
                return { status: "failed" };
            } finally {
                setIntegrationLoading(false);
            }
        }, [canUseShell]);

    useEffect(() => {
        if (!canUseShell) {
            setIntegrationReadStatus("unsupported");
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
            if (!canUseShell) {
                return {
                    status: "unsupported",
                    reason: "shell_unavailable",
                } as const;
            }
            await shellAgent.setSystemIntegration({ autorun: next });
            const refreshOutcome = await refreshIntegration();
            if (refreshOutcome.status === "unsupported") {
                return {
                    status: "unsupported",
                    reason: "shell_unavailable",
                } as const;
            }
            if (refreshOutcome.status === "failed") {
                throw new Error("settings.system.integration_read_failed");
            }
            return { status: "applied" } as const;
        },
    );

    const handleAutorunValueChange = useCallback(
        (next: boolean) => {
            void (async () => {
                const outcome = await autorunToggle.onChange(next);
                if (outcome.status === "applied") {
                    setAutorunErrorMessage(null);
                    return;
                }
                if (outcome.status === "unsupported") {
                    setAutorunErrorMessage(
                        t("settings.system.autorun_toggle_unsupported"),
                    );
                    void refreshIntegration();
                    return;
                }
                if (outcome.status === "failed") {
                    setAutorunErrorMessage(
                        t("settings.system.autorun_toggle_failed"),
                    );
                    void refreshIntegration();
                    return;
                }
            })();
        },
        [autorunToggle, refreshIntegration, t],
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
    }, [canUseShell, refreshIntegration]);

    const handleAssociationRefresh = useCallback(async () => {
        if (!canUseShell) return;
        await refreshIntegration();
    }, [canUseShell, refreshIntegration]);

    const associationLabel =
        !canUseShell || integrationReadStatus === "unsupported"
            ? t("settings.system.handlers_unsupported")
            : integrationLoading
              ? t("settings.system.handlers_unknown")
              : integrationReadStatus === "failed"
                ? t("settings.system.handlers_read_failed")
                : integrationStatus.associations
                  ? t("settings.system.handlers_registered")
                  : t("settings.system.handlers_not_registered");

    const associationChipColor =
        integrationReadStatus === "failed"
            ? "warning"
            : integrationReadStatus === "ok" &&
                !integrationLoading &&
                integrationStatus.associations
              ? "success"
              : integrationReadStatus === "ok" && !integrationLoading
                ? "danger"
                : "default";

    const associationButtonLabel = integrationStatus.associations
        ? t("settings.system.refreshAssociation")
        : t("settings.system.repairAssociation");
    const handleAssociationAction = integrationStatus.associations
        ? handleAssociationRefresh
        : handleAssociationRepair;

    const autorunLabel =
        !canUseShell || integrationReadStatus === "unsupported"
            ? t("settings.system.autorun_status_unsupported")
            : integrationLoading
              ? t("settings.system.autorun_unknown")
              : integrationReadStatus === "failed"
                ? t("settings.system.autorun_read_failed")
                : integrationStatus.autorun
                  ? t("settings.system.autorun_enabled")
                  : t("settings.system.autorun_disabled");

    const autorunDisabled =
        !canUseShell ||
        integrationLoading ||
        autorunToggle.pending ||
        integrationReadStatus !== "ok";

    const integrationReadHelper =
        integrationReadStatus === "failed"
            ? t("settings.system.integration_read_failed")
            : integrationReadStatus === "unsupported"
              ? t("settings.system.integration_read_unsupported")
              : undefined;

    if (!canUseShell) {
        return (
            <SettingsSection
                title={t("settings.headers.system")}
                description={t("settings.descriptions.system_integration")}
            >
                <div className={FORM.systemNoticeStack}>
                    <p className={FORM.systemNoticeBody}>
                        {t("settings.system.notice")}
                    </p>
                    <p className={TEXT_ROLE.caption}>
                        {t("settings.system.instructions")}
                    </p>
                </div>
            </SettingsSection>
        );
    }

    return (
        <div className={FORM.systemRootStack}>
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
                    helper={integrationReadHelper}
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
                            onValueChange={handleAutorunValueChange}
                            isDisabled={autorunDisabled}
                        />
                    }
                    status={<StatusChip label={autorunLabel} color="default" />}
                    helper={autorunErrorMessage ?? integrationReadHelper}
                />
            </SystemSectionCard>
        </div>
    );
}
