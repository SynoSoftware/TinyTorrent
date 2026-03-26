import { Button, Switch } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import {
    useSettingsFormActions,
    useSettingsFormState,
} from "@/modules/settings/context/SettingsFormContext";
import { LanguageMenu } from "@/shared/ui/controls/LanguageMenu";
import { RawConfigRenderer } from "@/modules/settings/components/SettingsBlockRenderers";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { FORM } from "@/shared/ui/layout/glass-surface";
import { usePreferences } from "@/app/context/PreferencesContext";

export function InterfaceTabContent() {
    const { t } = useTranslation();
    const { config } = useSettingsFormState();
    const {
        preferences: { hasConnectedTorrentServer },
        updatePreferences,
    } = usePreferences();
    const {
        onApplySetting,
        buttonActions,
        interfaceTab: {
            isImmersive,
            hasDismissedInsights,
            showAddTorrentDialog,
            onToggleWorkspaceStyle,
            setShowAddTorrentDialog,
        },
    } = useSettingsFormActions();

    return (
        <>
            <SettingsSection title={t("settings.sections.dashboard")}>
                <div className={FORM.sectionContentStack}>
                    <div className={FORM.interfaceRow}>
                        <div className={FORM.interfaceRowInfo}>
                            <AppTooltip content={t("settings.descriptions.shellStyle")}>
                                <span className={FORM.systemRowLabel}>
                                    {t("settings.labels.shellStyle")}
                                </span>
                            </AppTooltip>
                        </div>
                        <div className={FORM.interfaceRowActions}>
                            <Button
                                size="md"
                                variant={isImmersive ? "light" : "shadow"}
                                color={isImmersive ? "default" : "primary"}
                                onPress={() => {
                                    if (!isImmersive) return;
                                    onToggleWorkspaceStyle();
                                }}
                                isDisabled={!isImmersive}
                            >
                                {t("settings.options.shellStyle.classic")}
                            </Button>
                            <Button
                                size="md"
                                variant={isImmersive ? "shadow" : "light"}
                                color={isImmersive ? "primary" : "default"}
                                onPress={() => {
                                    if (isImmersive) return;
                                    onToggleWorkspaceStyle();
                                }}
                                isDisabled={isImmersive}
                            >
                                {t("settings.options.shellStyle.immersive")}
                            </Button>
                        </div>
                    </div>

                    {isImmersive && hasDismissedInsights && (
                        <div className={FORM.interfaceRow}>
                            <div className={FORM.interfaceRowInfo}>
                                <AppTooltip content={t("settings.descriptions.restore_hud")}>
                                    <span className={FORM.systemRowLabel}>
                                        {t("settings.buttons.restore_hud")}
                                    </span>
                                </AppTooltip>
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
                className={FORM.sectionMarginTop}
            >
                <div className={FORM.blockStackTight}>
                    <div className={FORM.switchRow}>
                        <AppTooltip content={t("settings.descriptions.table_watermark")}>
                            <span className={FORM.systemRowLabel}>
                                {t("settings.labels.tableWatermark")}
                            </span>
                        </AppTooltip>
                        <Switch
                            size="md"
                            isSelected={config.table_watermark_enabled}
                            onValueChange={(val) => {
                                void onApplySetting(
                                    "table_watermark_enabled",
                                    val,
                                );
                            }}
                        />
                    </div>
                    <div className={FORM.switchRow}>
                        <AppTooltip content={t("settings.descriptions.showAddTorrentDialog")}>
                            <span className={FORM.systemRowLabel}>
                                {t("settings.labels.showAddTorrentDialog")}
                            </span>
                        </AppTooltip>
                        <Switch
                            size="md"
                            isSelected={showAddTorrentDialog}
                            onValueChange={setShowAddTorrentDialog}
                        />
                    </div>
                    <div className={FORM.switchRow}>
                        <AppTooltip content={t("settings.descriptions.showTorrentServerSetup")}>
                            <span className={FORM.systemRowLabel}>
                                {t("settings.labels.showTorrentServerSetup")}
                            </span>
                        </AppTooltip>
                        <Switch
                            size="md"
                            isSelected={!hasConnectedTorrentServer}
                            onValueChange={(value) =>
                                updatePreferences({
                                    hasConnectedTorrentServer: !value,
                                })
                            }
                        />
                    </div>
                </div>
            </SettingsSection>

            <SettingsSection
                title={t("settings.sections.localization")}
                className={FORM.sectionMarginTop}
            >
                <div className={FORM.languageRow}>
                    <AppTooltip content={t("settings.descriptions.language")}>
                        <span className={FORM.systemRowLabel}>
                            {t("settings.labels.language")}
                        </span>
                    </AppTooltip>
                    <LanguageMenu />
                </div>
            </SettingsSection>

            <SettingsSection
                title={t("settings.sections.advanced")}
                className={FORM.sectionMarginTop}
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
