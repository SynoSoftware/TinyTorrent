import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import { SystemIntegrationSettings } from "@/modules/settings/components/tabs/system/SystemIntegrationSettings";
import {
    SingleInputRenderer,
    SwitchRenderer,
} from "@/modules/settings/components/SettingsBlockRenderers";

interface SystemTabContentProps {
    isNativeMode: boolean;
}

export function SystemTabContent({ isNativeMode }: SystemTabContentProps) {
    const { t } = useTranslation();

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
        <>
            <SettingsSection
                title={t("settings.sections.system_integration")}
                description={t("settings.descriptions.system_integration")}
            >
                <div className="mt-panel">
                    <SystemIntegrationSettings />
                </div>
            </SettingsSection>

            <SettingsSection
                title={t("settings.sections.startup")}
                description={t("settings.descriptions.startup")}
                className="mt-panel"
            >
                <div className="space-y-stage mt-panel">
                    <SwitchRenderer
                        block={{
                            type: "switch",
                            labelKey: "settings.labels.openOnTrayStart",
                            stateKey: "auto_open_ui",
                        }}
                    />
                    <SwitchRenderer
                        block={{
                            type: "switch",
                            labelKey: "settings.labels.autorunHidden",
                            stateKey: "autorun_hidden",
                        }}
                    />
                    <SwitchRenderer
                        block={{
                            type: "switch",
                            labelKey: "settings.labels.showSplash",
                            stateKey: "show_splash",
                        }}
                    />
                    <SingleInputRenderer
                        block={{
                            type: "input",
                            labelKey: "settings.labels.splashMessage",
                            stateKey: "splash_message",
                            variant: "bordered",
                            dependsOn: "show_splash",
                        }}
                    />
                </div>
            </SettingsSection>
        </>
    );
}
