import { Button, Switch } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import {
    useSettingsFormActions,
    useSettingsFormState,
} from "@/modules/settings/context/SettingsFormContext";
import { LanguageMenu } from "@/shared/ui/controls/LanguageMenu";
import { RawConfigRenderer } from "@/modules/settings/components/SettingsBlockRenderers";
import { TEXT_ROLE, withOpacity } from "@/config/textRoles";

export function InterfaceTabContent() {
    const { t } = useTranslation();
    const { config, updateConfig } = useSettingsFormState();
    const {
        buttonActions,
        interfaceTab: {
            isImmersive,
            hasDismissedInsights,
            onToggleWorkspaceStyle,
        },
    } = useSettingsFormActions();

    const canToggleShell = typeof onToggleWorkspaceStyle === "function";

    return (
        <>
            <SettingsSection title={t("settings.sections.dashboard")}>
                <div className="space-y-stage">
                    <div className="flex items-start justify-between gap-panel">
                        <div className="min-w-0">
                            <p className={withOpacity(TEXT_ROLE.bodyStrong, 80)}>
                                {t("settings.labels.shellStyle")}
                            </p>
                            <p className={TEXT_ROLE.caption}>
                                {t("settings.descriptions.shellStyle")}
                            </p>
                        </div>
                        <div className="flex gap-tools shrink-0">
                            <Button
                                size="md"
                                variant={isImmersive ? "light" : "shadow"}
                                color={isImmersive ? "default" : "primary"}
                                onPress={() => {
                                    if (!isImmersive || !canToggleShell) return;
                                    onToggleWorkspaceStyle?.();
                                }}
                                isDisabled={!canToggleShell || !isImmersive}
                            >
                                {t("settings.options.shellStyle.classic")}
                            </Button>
                            <Button
                                size="md"
                                variant={isImmersive ? "shadow" : "light"}
                                color={isImmersive ? "primary" : "default"}
                                onPress={() => {
                                    if (isImmersive || !canToggleShell) return;
                                    onToggleWorkspaceStyle?.();
                                }}
                                isDisabled={!canToggleShell || isImmersive}
                            >
                                {t("settings.options.shellStyle.immersive")}
                            </Button>
                        </div>
                    </div>

                    {isImmersive && hasDismissedInsights && (
                        <div className="flex items-start justify-between gap-panel">
                            <div className="min-w-0">
                                <p className={withOpacity(TEXT_ROLE.bodyStrong, 80)}>
                                    {t("settings.buttons.restore_hud")}
                                </p>
                                <p className={TEXT_ROLE.caption}>
                                    {t("settings.descriptions.restore_hud")}
                                </p>
                            </div>
                            <Button
                                size="md"
                                variant="shadow"
                                color="primary"
                                onPress={buttonActions.restoreHud}
                            >
                                {t("settings.buttons.restore_hud")}
                            </Button>
                        </div>
                    )}
                </div>
            </SettingsSection>

            <SettingsSection
                title={t("settings.sections.visuals")}
                description={t("settings.descriptions.table_watermark")}
                className="mt-panel"
            >
                <div className="flex items-center justify-between h-control-row">
                    <span className={`${withOpacity(TEXT_ROLE.body, 80)} font-medium`}>
                        {t("settings.labels.tableWatermark")}
                    </span>
                    <Switch
                        size="md"
                        isSelected={config.table_watermark_enabled}
                        onValueChange={(val) =>
                            updateConfig("table_watermark_enabled", val)
                        }
                    />
                </div>
            </SettingsSection>

            <SettingsSection
                title={t("settings.sections.localization")}
                description={t("settings.descriptions.language")}
                className="mt-panel"
            >
                <div className="flex items-center justify-between gap-panel">
                    <div>
                        <span className={withOpacity(TEXT_ROLE.bodyStrong, 80)}>
                            {t("settings.labels.language")}
                        </span>
                        <p className={TEXT_ROLE.caption}>
                            {t("settings.descriptions.language_helper")}
                        </p>
                    </div>
                    <LanguageMenu />
                </div>
            </SettingsSection>

            <SettingsSection
                title={t("settings.sections.advanced")}
                description={t("settings.descriptions.config_export")}
                className="mt-panel"
            >
                <RawConfigRenderer
                    block={{
                        type: "raw-config",
                        labelKey: "settings.labels.raw_config",
                        descriptionKey: "settings.descriptions.config_details",
                    }}
                />
            </SettingsSection>
        </>
    );
}
