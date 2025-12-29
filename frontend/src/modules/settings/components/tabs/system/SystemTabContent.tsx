import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import { SystemIntegrationSettings } from "@/modules/settings/components/tabs/system/SystemIntegrationSettings";

interface SystemTabContentProps {
    isNativeMode: boolean;
}

export function SystemTabContent({ isNativeMode }: SystemTabContentProps) {
    const { t } = useTranslation();

    return (
        <SettingsSection
            title={t("settings.headers.system")}
            description={t("settings.descriptions.system_integration")}
        >
            <div className="mt-panel">
                {isNativeMode ? (
                    <SystemIntegrationSettings />
                ) : (
                    <div className="flex flex-col gap-tight">
                        <p className="text-scaled text-foreground/80">
                            {t("settings.system.notice")}
                        </p>
                        <p className="text-label text-foreground/60">
                            {t("settings.system.instructions")}
                        </p>
                    </div>
                )}
            </div>
        </SettingsSection>
    );
}
