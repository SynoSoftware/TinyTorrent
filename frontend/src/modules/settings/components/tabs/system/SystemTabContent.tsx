import {
    Button,
    Card,
    Chip,
    Checkbox,
    Select,
    SelectItem,
    Switch,
    cn,
} from "@heroui/react";
import type { ChipProps } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NativeShell } from "@/app/runtime";
import { useAsyncToggle } from "@/modules/settings/hooks/useAsyncToggle";
import { useSettingsForm } from "@/modules/settings/context/SettingsFormContext";
import type { ReactNode } from "react";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
// TODO: Replace direct NativeShell system-integration calls with the ShellAgent/ShellExtensions adapter; enforce locality rules (only when connected to localhost) and render a clear “ShellExtensions unavailable” state for remote/browser connections.
// TODO: IMPORTANT: This file should NOT *determine* locality/ShellExtensions availability. It should *consume* a single capability/locality source of truth (context/provider).
// TODO: Gating rule for these controls is `uiMode === "Full"` (single source of truth). `uiMode` must be computed once from:
// TODO: - endpoint is loopback (localhost/127.0.0.1/::1) AND
// TODO: - ShellAgent bridge is available
// TODO: Otherwise (`uiMode === "Rpc"`), render disabled with clear UX explaining why (remote daemon or browser runtime => no host integration).
// TODO: Do not model this as `serverClass === "tinytorrent"`: that label conflates “daemon protocol” with “host integration available”.
// TODO: In the current architecture, the daemon is always `transmission-daemon` (Transmission RPC). “Host integration available” is a separate, local-only capability.
// TODO: Remove any mention of TT token/security protocol from this surface; it is not relevant in Transmission-only mode.

const POWER_PREF_KEY = "tiny-torrent.system.prevent-sleep";
const UPDATE_PREF_KEY = "tiny-torrent.system.auto-update";
const CLOSE_ACTION_PREF_KEY = "tiny-torrent.system.close-action";
const DEFAULT_POWER_STATE = true;
const DEFAULT_UPDATE_STATE = true;
const DEFAULT_CLOSE_ACTION: CloseAction = "minimize";

type CloseAction = "minimize" | "quit";

function useLocalPreference<T>(key: string, fallback: T) {
    const [value, setValue] = useState<T>(() => {
        if (typeof window === "undefined") {
            return fallback;
        }
        try {
            const stored = window.localStorage.getItem(key);
            if (stored !== null) {
                return JSON.parse(stored) as T;
            }
        } catch {
            // Ignore invalid JSON.
        }
        return fallback;
    });

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // Fail silently if storage is unavailable.
        }
    }, [key, value]);

    return [value, setValue] as const;
}

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
    const { config, updateConfig } = useSettingsForm();

    const [powerManagementEnabled, setPowerManagementEnabled] =
        useLocalPreference(POWER_PREF_KEY, DEFAULT_POWER_STATE);
    const [autoUpdateEnabled, setAutoUpdateEnabled] = useLocalPreference(
        UPDATE_PREF_KEY,
        DEFAULT_UPDATE_STATE
    );
    const [closeButtonAction, setCloseButtonAction] =
        useLocalPreference<CloseAction>(
            CLOSE_ACTION_PREF_KEY,
            DEFAULT_CLOSE_ACTION
        );

    const [integrationStatus, setIntegrationStatus] = useState({
        autorun: false,
        associations: false,
    });
    const [integrationLoading, setIntegrationLoading] = useState(true);
    const [associationPending, setAssociationPending] = useState(false);

    const refreshIntegration = useCallback(async () => {
        if (!isNativeMode) {
            setIntegrationLoading(false);
            return;
        }
        setIntegrationLoading(true);
        try {
            const status = await NativeShell.getSystemIntegrationStatus();
            setIntegrationStatus({
                autorun: Boolean(status.autorun),
                associations: Boolean(status.associations),
            });
        } catch {
            // Preserve previous values on failure.
        } finally {
            setIntegrationLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isNativeMode) {
            return;
        }
        void refreshIntegration();
    }, [isNativeMode, refreshIntegration]);

    const setAutorunState = useCallback((next: boolean) => {
        setIntegrationStatus((prev) => ({ ...prev, autorun: next }));
    }, []);

    const autorunToggle = useAsyncToggle(
        Boolean(integrationStatus.autorun),
        setAutorunState,
        async (next) => {
            if (!isNativeMode) {
                throw new Error("Native shell unavailable");
            }
            await NativeShell.setSystemIntegration({ autorun: next });
            await refreshIntegration();
        }
    );

    const handleAssociationAction = useCallback(async () => {
        if (!isNativeMode) {
            return;
        }
        setAssociationPending(true);
        try {
            await NativeShell.setSystemIntegration({ associations: true });
        } finally {
            setAssociationPending(false);
            await refreshIntegration();
        }
    }, [refreshIntegration]);

    const associationLabel =
        isNativeMode && !integrationLoading
            ? integrationStatus.associations
                ? t("settings.install.handlers_registered")
                : t("settings.install.handlers_not_registered")
            : t("settings.system.handlers_unknown");

    const associationChipColor =
        isNativeMode && !integrationLoading && integrationStatus.associations
            ? "success"
            : isNativeMode &&
              !integrationLoading &&
              !integrationStatus.associations
            ? "danger"
            : "default";

    const associationButtonLabel =
        integrationStatus.associations && isNativeMode && !integrationLoading
            ? t("settings.system.checkAssociation")
            : t("settings.system.repairAssociation");

    const autorunLabel =
        isNativeMode && !integrationLoading
            ? integrationStatus.autorun
                ? t("settings.system.autorun_enabled")
                : t("settings.system.autorun_disabled")
            : t("settings.system.autorun_unknown");

    const autorunDisabled =
        !isNativeMode || integrationLoading || autorunToggle.pending;

    const silentStartDisabled =
        !isNativeMode || integrationLoading || !integrationStatus.autorun;

    if (!isNativeMode) {
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
                                !isNativeMode ||
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
                <SystemRow
                    label={t("settings.labels.preventSleep")}
                    helper={t("settings.labels.preventSleepHelper")}
                    control={
                        <Switch
                            size="md"
                            color="primary"
                            isSelected={powerManagementEnabled}
                            onValueChange={setPowerManagementEnabled}
                        />
                    }
                    status={
                        <StatusChip
                            label={
                                powerManagementEnabled
                                    ? t("settings.system.power_active")
                                    : t("settings.system.power_off")
                            }
                            color="default"
                        />
                    }
                />
                <SystemRow
                    label={t("settings.labels.updateChecks")}
                    control={
                        <Switch
                            size="md"
                            color="primary"
                            isSelected={autoUpdateEnabled}
                            onValueChange={setAutoUpdateEnabled}
                        />
                    }
                    status={
                        <StatusChip
                            label={
                                autoUpdateEnabled
                                    ? t("settings.system.update_auto")
                                    : t("settings.system.update_manual")
                            }
                            color="primary"
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
                <SystemRow
                    label={t("settings.labels.silentStart")}
                    helper={t("settings.labels.silentStartHelper")}
                    control={
                        <Checkbox
                            size="md"
                            isSelected={config.autorun_hidden}
                            onValueChange={(next) =>
                                updateConfig("autorun_hidden", next)
                            }
                            isDisabled={silentStartDisabled}
                        />
                    }
                    disabled={silentStartDisabled}
                />
            </SystemSectionCard>
            <SystemSectionCard
                title={t("settings.sections.window_behavior")}
                description={t("settings.descriptions.window_behavior")}
            >
                <SystemRow
                    label={t("settings.labels.closeButtonAction")}
                    control={
                        <Select
                            size="sm"
                            variant="bordered"
                            selectedKeys={[closeButtonAction]}
                            classNames={{ trigger: "h-button" }}
                            onSelectionChange={(keys) => {
                                const [next] = [...keys];
                                if (next === "minimize" || next === "quit") {
                                    setCloseButtonAction(next);
                                }
                            }}
                        >
                            <SelectItem key="minimize">
                                {t("settings.options.closeAction.minimize")}
                            </SelectItem>
                            <SelectItem key="quit">
                                {t("settings.options.closeAction.quit")}
                            </SelectItem>
                        </Select>
                    }
                />
            </SystemSectionCard>
        </div>
    );
}
