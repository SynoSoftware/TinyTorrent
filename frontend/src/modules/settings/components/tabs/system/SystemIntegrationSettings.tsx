import { Switch } from "@heroui/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NativeShell } from "@/app/runtime";
import { useAsyncToggle } from "@/modules/settings/hooks/useAsyncToggle";

export function SystemIntegrationSettings() {
    const { t } = useTranslation();
    const [autorunEnabled, setAutorunEnabled] = useState(false);
    const [associationsEnabled, setAssociationsEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isActive = true;
        const loadStatus = async () => {
            if (!NativeShell.isAvailable) {
                if (isActive) {
                    setIsLoading(false);
                }
                return;
            }
            try {
                const status = await NativeShell.getSystemIntegrationStatus();
                if (!isActive) {
                    return;
                }
                setAutorunEnabled(Boolean(status.autorun));
                setAssociationsEnabled(Boolean(status.associations));
            } catch {
                // Silently ignore host errors.
            } finally {
                if (isActive) {
                    setIsLoading(false);
                }
            }
        };
        void loadStatus();
        return () => {
            isActive = false;
        };
    }, []);

    const autorunToggle = useAsyncToggle(
        autorunEnabled,
        setAutorunEnabled,
        async (next) => {
            await NativeShell.setSystemIntegration({ autorun: next });
        }
    );
    const associationsToggle = useAsyncToggle(
        associationsEnabled,
        setAssociationsEnabled,
        async (next) => {
            await NativeShell.setSystemIntegration({ associations: next });
        }
    );

    return (
        <div className="flex flex-col gap-tools">
            <Switch
                size="md"
                isSelected={autorunEnabled}
                isDisabled={isLoading || autorunToggle.pending}
                onValueChange={autorunToggle.onChange}
            >
                <span className="text-scaled font-medium text-foreground/80">
                    {t("settings.connection.autorun_label")}
                </span>
            </Switch>
            <p className="text-label text-foreground/60">
                {autorunEnabled
                    ? t("settings.connection.autorun_status_enabled")
                    : t("settings.connection.autorun_status_disabled")}
            </p>
            <Switch
                size="md"
                isSelected={associationsEnabled}
                isDisabled={isLoading || associationsToggle.pending}
                onValueChange={associationsToggle.onChange}
            >
                <span className="text-scaled font-medium text-foreground/80">
                    {t("settings.labels.installRegisterHandlers")}
                </span>
            </Switch>
            <p className="text-label text-foreground/60">
                {associationsEnabled
                    ? t("settings.install.handlers_registered")
                    : t("settings.install.handlers_not_registered")}
            </p>
        </div>
    );
}
