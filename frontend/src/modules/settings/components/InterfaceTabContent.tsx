import { Button, Switch } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import {
    useSettingsFormActions,
    useSettingsFormState,
} from "@/modules/settings/context/SettingsFormContext";
import { LanguageMenu } from "@/shared/ui/controls/LanguageMenu";
import { RawConfigRenderer } from "@/modules/settings/components/SettingsBlockRenderers";
import { TEXT_ROLE } from "@/config/textRoles";
import { FORM_UI_CLASS } from "@/shared/ui/layout/glass-surface";

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
                <div className={FORM_UI_CLASS.interfaceStack}>
                    <div className={FORM_UI_CLASS.interfaceRow}>
                        <div className={FORM_UI_CLASS.interfaceRowInfo}>
                            <p className={FORM_UI_CLASS.interfaceRowTitle}>
                                {t("settings.labels.shellStyle")}
                            </p>
                            <p className={TEXT_ROLE.caption}>
                                {t("settings.descriptions.shellStyle")}
                            </p>
                        </div>
                        <div className={FORM_UI_CLASS.interfaceRowActions}>
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
                        <div className={FORM_UI_CLASS.interfaceRow}>
                            <div className={FORM_UI_CLASS.interfaceRowInfo}>
                                <p className={FORM_UI_CLASS.interfaceRowTitle}>
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
                className={FORM_UI_CLASS.sectionMarginTop}
            >
                <div className={FORM_UI_CLASS.switchRow}>
                    <span className={FORM_UI_CLASS.systemRowLabel}>
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
                className={FORM_UI_CLASS.sectionMarginTop}
            >
                <div className={FORM_UI_CLASS.languageRow}>
                    <div>
                        <span className={FORM_UI_CLASS.interfaceRowTitle}>
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
                className={FORM_UI_CLASS.sectionMarginTop}
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
