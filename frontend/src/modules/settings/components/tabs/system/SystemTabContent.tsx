import { useTranslation } from "react-i18next";
import { SystemInstallSection } from "@/modules/settings/components/tabs/system/SystemInstallSection";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import { useSettingsForm } from "@/modules/settings/context/SettingsFormContext";

export function SystemTabContent() {
    const { t } = useTranslation();
    const {
        autorunSwitch,
        handlerSwitch,
        handlerRequiresElevation,
        extensionModeEnabled,
        isMocked,
        onSystemInstall,
        systemInstallFeatureAvailable,
    } = useSettingsForm();

    return (
        <SettingsSection
            title={t("settings.sections.install")}
            description={t("settings.descriptions.install")}
        >
            <div className="space-y-stage mt-panel">
                <SystemInstallSection
                    autorunSwitch={autorunSwitch}
                    handlerSwitch={handlerSwitch}
                    handlerRequiresElevation={handlerRequiresElevation}
                    extensionModeEnabled={extensionModeEnabled}
                    isMocked={isMocked}
                    onSystemInstall={onSystemInstall}
                    systemInstallFeatureAvailable={
                        systemInstallFeatureAvailable
                    }
                />
            </div>
        </SettingsSection>
    );
}
