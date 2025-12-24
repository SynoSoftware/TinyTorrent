import { Button, Input, Switch, cn } from "@heroui/react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
    SystemInstallOptions,
    SystemInstallResult,
} from "@/services/rpc/types";
import { useAsyncToggle } from "@/modules/settings/hooks/useAsyncToggle";

const SYSTEM_INSTALL_LOCATIONS = [
    { key: "desktop", labelKey: "settings.install.locations.desktop" },
    { key: "start-menu", labelKey: "settings.install.locations.start-menu" },
    { key: "startup", labelKey: "settings.install.locations.startup" },
];
const DEFAULT_INSTALL_NAME = "TinyTorrent";

interface AutorunSwitchProps {
    isSelected: boolean;
    isDisabled: boolean;
    onChange: (next: boolean) => Promise<void>;
}

interface SystemInstallSectionProps {
    autorunSwitch: AutorunSwitchProps;
    handlerSwitch: AutorunSwitchProps;
    handlerRequiresElevation: boolean;
    extensionModeEnabled: boolean;
    isMocked: boolean;
    onSystemInstall?: (
        options: SystemInstallOptions
    ) => Promise<SystemInstallResult>;
    systemInstallFeatureAvailable: boolean;
}

export function SystemInstallSection({
    autorunSwitch,
    handlerSwitch,
    handlerRequiresElevation,
    extensionModeEnabled,
    isMocked,
    onSystemInstall,
    systemInstallFeatureAvailable,
}: SystemInstallSectionProps) {
    const { t } = useTranslation();
    const [installName, setInstallName] = useState(DEFAULT_INSTALL_NAME);
    const [installArgs, setInstallArgs] = useState("");
    const [installLocations, setInstallLocations] = useState<string[]>(() =>
        SYSTEM_INSTALL_LOCATIONS.map((option) => option.key)
    );
    const [installToProgramFiles, setInstallToProgramFiles] = useState(false);
    const [systemInstallResult, setSystemInstallResult] =
        useState<SystemInstallResult | null>(null);
    const [systemInstallError, setSystemInstallError] = useState<string | null>(
        null
    );
    const [isSystemInstalling, setIsSystemInstalling] = useState(false);

    const installToProgramFilesToggle = useAsyncToggle(
        installToProgramFiles,
        setInstallToProgramFiles
    );

    const isSystemInstallDisabled = isSystemInstalling;

    const toggleInstallLocation = (location: string) => {
        setInstallLocations((current) => {
            if (current.includes(location)) {
                if (current.length === 1) {
                    return current;
                }
                return current.filter((entry) => entry !== location);
            }
            return [...current, location];
        });
    };

    const handleSystemInstall = useCallback(async () => {
        if (!extensionModeEnabled) {
            return;
        }
        const trimmedName = installName.trim();
        const trimmedArgs = installArgs.trim();
        const payload: SystemInstallOptions = {
            ...(trimmedName ? { name: trimmedName } : {}),
            ...(trimmedArgs ? { args: trimmedArgs } : {}),
            locations: installLocations,
            installToProgramFiles,
        };
        setSystemInstallError(null);
        setSystemInstallResult(null);

        if (isMocked) {
            const mockLabel = trimmedName || DEFAULT_INSTALL_NAME;
            const mockShortcuts = SYSTEM_INSTALL_LOCATIONS.reduce(
                (acc, entry) => {
                    acc[entry.key] = `C:/mock/${entry.key}/${mockLabel}.lnk`;
                    return acc;
                },
                {} as Record<string, string>
            );
            const installedPath = `C:/Program Files/${mockLabel}`;
            setSystemInstallResult({
                action: "system-install",
                success: true,
                message: t("settings.install.result_success"),
                shortcuts: mockShortcuts,
                installSuccess: true,
                installedPath,
                installMessage: t("settings.install.installed_path", {
                    path: installedPath,
                }),
                handlersRegistered: handlerSwitch.isSelected,
                handlerMessage: handlerSwitch.isSelected
                    ? t("settings.install.handlers_registered")
                    : t("settings.install.handlers_not_registered"),
            });
            return;
        }

        if (!onSystemInstall || !systemInstallFeatureAvailable) {
            return;
        }

        setIsSystemInstalling(true);
        try {
            const result = await onSystemInstall(payload);
            setSystemInstallResult(result);
        } catch (error) {
            setSystemInstallError(
                error instanceof Error
                    ? error.message
                    : t("settings.install.result_failure")
            );
        } finally {
            setIsSystemInstalling(false);
        }
    }, [
        extensionModeEnabled,
        installArgs,
        installLocations,
        installName,
        installToProgramFiles,
        isMocked,
        handlerSwitch.isSelected,
        onSystemInstall,
        systemInstallFeatureAvailable,
        t,
    ]);

    const locationButtons = SYSTEM_INSTALL_LOCATIONS.map((location) => {
        const isSelected = installLocations.includes(location.key);
        const cannotDeselect = isSelected && installLocations.length === 1;
        const locationButtonDisabled =
            isSystemInstallDisabled || cannotDeselect;
        return (
            <Button
                key={location.key}
                size="sm"
                variant={isSelected ? "shadow" : "light"}
                color={isSelected ? "primary" : undefined}
                className="uppercase tracking-[0.2em] h-8 px-3"
                style={{ fontSize: "var(--tt-font-size-base)" }}
                onPress={() => {
                    if (locationButtonDisabled) {
                        return;
                    }
                    toggleInstallLocation(location.key);
                }}
                isDisabled={locationButtonDisabled}
            >
                {t(location.labelKey)}
            </Button>
        );
    });
    const installResult = systemInstallResult;
    const shortcutEntries = installResult?.shortcuts
        ? Object.entries(installResult.shortcuts)
        : [];
    const showHandlerSection =
        installResult?.handlersRegistered !== undefined ||
        Boolean(installResult?.handlerMessage);
    const programFilesMessage =
        installResult?.installMessage ||
        (installResult?.installSuccess && installResult?.installedPath
            ? t("settings.install.installed_path", {
                  path: installResult.installedPath,
              })
            : t("settings.install.install_not_requested"));

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
                <Input
                    label={t("settings.labels.installName")}
                    labelPlacement="outside"
                    placeholder=" "
                    size="sm"
                    variant="bordered"
                    value={installName}
                    isDisabled={isSystemInstallDisabled}
                    onChange={(event) => setInstallName(event.target.value)}
                />
                <Input
                    label={t("settings.labels.installArgs")}
                    labelPlacement="outside"
                    placeholder=" "
                    size="sm"
                    variant="bordered"
                    value={installArgs}
                    isDisabled={isSystemInstallDisabled}
                    onChange={(event) => setInstallArgs(event.target.value)}
                />
            </div>
            <div className="space-y-2">
                <p
                    className="font-semibold uppercase tracking-[0.25em] text-foreground/50"
                    style={{ fontSize: "var(--tt-font-size-base)" }}
                >
                    {t("settings.labels.installLocations")}
                </p>
                <div className="flex flex-wrap gap-2">{locationButtons}</div>
            </div>
            <div className="flex flex-col gap-3">
                <Switch
                    size="sm"
                    isSelected={autorunSwitch.isSelected}
                    isDisabled={autorunSwitch.isDisabled}
                    onValueChange={autorunSwitch.onChange}
                >
                    <span className="text-sm font-medium text-foreground/80">
                        {t("settings.connection.autorun_label")}
                    </span>
                </Switch>
                <Switch
                    size="sm"
                    isSelected={handlerSwitch.isSelected}
                    isDisabled={handlerSwitch.isDisabled}
                    onValueChange={handlerSwitch.onChange}
                >
                    <span className="text-sm font-medium text-foreground/80">
                        {t("settings.labels.installRegisterHandlers")}
                    </span>
                </Switch>
                {handlerRequiresElevation && (
                    <p
                        style={{ fontSize: "var(--tt-font-size-base)" }}
                        className="text-foreground/60"
                    >
                        {t("settings.install.handler_requires_elevation")}
                    </p>
                )}
                <Switch
                    size="sm"
                    isSelected={installToProgramFiles}
                    isDisabled={
                        isSystemInstallDisabled ||
                        installToProgramFilesToggle.pending
                    }
                    onValueChange={installToProgramFilesToggle.onChange}
                >
                    <span className="text-sm font-medium text-foreground/80">
                        {t("settings.labels.installProgramFiles")}
                    </span>
                </Switch>
            </div>
            <div className="flex flex-col gap-2">
                <Button
                    size="md"
                    variant="shadow"
                    color="primary"
                    className="font-semibold shadow-lg shadow-primary/20"
                    onPress={handleSystemInstall}
                    isLoading={isSystemInstalling}
                    isDisabled={isSystemInstallDisabled}
                >
                    {isSystemInstalling
                        ? t("settings.install.button_busy")
                        : t("settings.install.button")}
                </Button>
                {systemInstallError && (
                    <p
                        style={{ fontSize: "var(--tt-font-size-base)" }}
                        className="text-danger"
                    >
                        {systemInstallError}
                    </p>
                )}
                {installResult && (
                    <div className="space-y-3 rounded-2xl border border-content1/20 bg-content1/30 p-4">
                        <div className="flex items-center justify-between gap-2">
                            <span
                                className={cn(
                                    "font-semibold uppercase tracking-[0.2em]",
                                    installResult.success
                                        ? "text-success"
                                        : "text-danger"
                                )}
                                style={{ fontSize: "var(--tt-font-size-base)" }}
                            >
                                {installResult.success
                                    ? t("settings.install.result_success")
                                    : t("settings.install.result_partial")}
                            </span>
                            {installResult.permissionDenied && (
                                <span
                                    className="font-semibold uppercase tracking-[0.3em] text-danger"
                                    style={{
                                        fontSize: "var(--tt-font-size-base)",
                                    }}
                                >
                                    {t(
                                        "settings.install.result_permission_denied"
                                    )}
                                </span>
                            )}
                        </div>
                        {installResult.message && (
                            <p className="text-sm text-foreground/70">
                                {installResult.message}
                            </p>
                        )}
                        <div className="space-y-2">
                            <div>
                                <p
                                    className="font-semibold uppercase tracking-[0.25em] text-foreground/50"
                                    style={{
                                        fontSize: "var(--tt-font-size-base)",
                                    }}
                                >
                                    {t("settings.install.shortcuts_header")}
                                </p>
                                {shortcutEntries.length ? (
                                    <ul className="mt-1 space-y-1 text-sm text-foreground/70">
                                        {shortcutEntries.map(([key, value]) => {
                                            const labelKey =
                                                SYSTEM_INSTALL_LOCATIONS.find(
                                                    (location) =>
                                                        location.key === key
                                                )?.labelKey;
                                            return (
                                                <li
                                                    key={key}
                                                    className="flex flex-col gap-0.5"
                                                >
                                                    {labelKey && (
                                                        <span
                                                            className="uppercase tracking-[0.3em] text-foreground/40"
                                                            style={{
                                                                fontSize:
                                                                    "var(--tt-font-size-base)",
                                                            }}
                                                        >
                                                            {t(labelKey)}
                                                        </span>
                                                    )}
                                                    <span className="break-all text-sm text-foreground/70">
                                                        {value}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="mt-1 text-sm text-foreground/60">
                                        {t("settings.install.shortcuts_none")}
                                    </p>
                                )}
                            </div>
                            <div>
                                <p
                                    className="font-semibold uppercase tracking-[0.3em] text-foreground/50"
                                    style={{
                                        fontSize: "var(--tt-font-size-base)",
                                    }}
                                >
                                    {t("settings.install.program_files_label")}
                                </p>
                                <p className="text-sm text-foreground/70">
                                    {programFilesMessage}
                                </p>
                            </div>
                            {showHandlerSection && (
                                <div>
                                    <p
                                        className="font-semibold uppercase tracking-[0.3em] text-foreground/50"
                                        style={{
                                            fontSize:
                                                "var(--tt-font-size-base)",
                                        }}
                                    >
                                        {t("settings.install.handlers_header")}
                                    </p>
                                    <p className="text-sm text-foreground/70">
                                        {installResult.handlersRegistered
                                            ? t(
                                                  "settings.install.handlers_registered"
                                              )
                                            : t(
                                                  "settings.install.handlers_not_registered"
                                              )}
                                    </p>
                                    {installResult.handlerMessage && (
                                        <p className="text-sm text-foreground/60">
                                            {installResult.handlerMessage}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
