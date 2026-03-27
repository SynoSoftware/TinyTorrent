import { Button, Switch } from "@heroui/react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import {
    useSettingsFormActions,
    useSettingsFormState,
} from "@/modules/settings/context/SettingsFormContext";
import { LanguageMenu } from "@/shared/ui/controls/LanguageMenu";
import { RawConfigRenderer } from "@/modules/settings/components/SettingsBlockRenderers";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { FORM } from "@/shared/ui/layout/glass-surface";

function InterfaceFieldHelper({ helper }: { helper?: ReactNode }) {
    if (!helper) {
        return null;
    }
    return (
        <div className={FORM.locationEditorFeedbackSlot}>
            <div className={FORM.locationEditorValidationRow}>
                {helper}
            </div>
        </div>
    );
}

export function InterfaceTabContent() {
    const { t } = useTranslation();
    const { config, fieldStates } = useSettingsFormState();
    const {
        onApplySetting,
        buttonActions,
        interfaceTab: { hasDismissedInsights },
    } = useSettingsFormActions();
    const isImmersive = config.workspace_style === "immersive";
    const workspaceStylePending = Boolean(fieldStates.workspace_style?.pending);
    const workspaceStyleError = fieldStates.workspace_style?.error?.text;
    const tableWatermarkPending = Boolean(
        fieldStates.table_watermark_enabled?.pending,
    );
    const tableWatermarkError =
        fieldStates.table_watermark_enabled?.error?.text;
    const showAddDialogPending = Boolean(
        fieldStates.show_add_torrent_dialog?.pending,
    );
    const showAddDialogError =
        fieldStates.show_add_torrent_dialog?.error?.text;
    const showServerSetupPending = Boolean(
        fieldStates.show_torrent_server_setup?.pending,
    );
    const showServerSetupError =
        fieldStates.show_torrent_server_setup?.error?.text;

    return (
        <>
            <SettingsSection title={t("settings.sections.dashboard")}>
                <div className={FORM.sectionContentStack}>
                    <div className={FORM.systemRow}>
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
                                        if (!isImmersive || workspaceStylePending) {
                                            return;
                                        }
                                        void onApplySetting(
                                            "workspace_style",
                                            "classic",
                                        );
                                    }}
                                    isDisabled={!isImmersive || workspaceStylePending}
                                >
                                    {t("settings.options.shellStyle.classic")}
                                </Button>
                                <Button
                                    size="md"
                                    variant={isImmersive ? "shadow" : "light"}
                                    color={isImmersive ? "primary" : "default"}
                                    onPress={() => {
                                        if (isImmersive || workspaceStylePending) {
                                            return;
                                        }
                                        void onApplySetting(
                                            "workspace_style",
                                            "immersive",
                                        );
                                    }}
                                    isDisabled={isImmersive || workspaceStylePending}
                                >
                                    {t("settings.options.shellStyle.immersive")}
                                </Button>
                            </div>
                        </div>
                        <InterfaceFieldHelper
                            helper={
                                workspaceStyleError ? (
                                    <p className={FORM.locationEditorError}>
                                        {workspaceStyleError}
                                    </p>
                                ) : undefined
                            }
                        />
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
                    <div className={FORM.systemRow}>
                        <div className={FORM.switchRow}>
                            <AppTooltip content={t("settings.descriptions.table_watermark")}>
                                <span className={FORM.systemRowLabel}>
                                    {t("settings.labels.tableWatermark")}
                                </span>
                            </AppTooltip>
                            <Switch
                                size="md"
                                isSelected={config.table_watermark_enabled}
                                isDisabled={tableWatermarkPending}
                                onValueChange={(val) => {
                                    void onApplySetting(
                                        "table_watermark_enabled",
                                        val,
                                    );
                                }}
                            />
                        </div>
                        <InterfaceFieldHelper
                            helper={
                                tableWatermarkError ? (
                                    <p className={FORM.locationEditorError}>
                                        {tableWatermarkError}
                                    </p>
                                ) : undefined
                            }
                        />
                    </div>
                    <div className={FORM.systemRow}>
                        <div className={FORM.switchRow}>
                            <AppTooltip content={t("settings.descriptions.showAddTorrentDialog")}>
                                <span className={FORM.systemRowLabel}>
                                    {t("settings.labels.showAddTorrentDialog")}
                                </span>
                            </AppTooltip>
                            <Switch
                                size="md"
                                isSelected={config.show_add_torrent_dialog}
                                isDisabled={showAddDialogPending}
                                onValueChange={(value) => {
                                    void onApplySetting(
                                        "show_add_torrent_dialog",
                                        value,
                                    );
                                }}
                            />
                        </div>
                        <InterfaceFieldHelper
                            helper={
                                showAddDialogError ? (
                                    <p className={FORM.locationEditorError}>
                                        {showAddDialogError}
                                    </p>
                                ) : undefined
                            }
                        />
                    </div>
                    <div className={FORM.systemRow}>
                        <div className={FORM.switchRow}>
                            <AppTooltip content={t("settings.descriptions.showTorrentServerSetup")}>
                                <span className={FORM.systemRowLabel}>
                                    {t("settings.labels.showTorrentServerSetup")}
                                </span>
                            </AppTooltip>
                            <Switch
                                size="md"
                                isSelected={config.show_torrent_server_setup}
                                isDisabled={showServerSetupPending}
                                onValueChange={(value) => {
                                    void onApplySetting(
                                        "show_torrent_server_setup",
                                        value,
                                    );
                                }}
                            />
                        </div>
                        <InterfaceFieldHelper
                            helper={
                                showServerSetupError ? (
                                    <p className={FORM.locationEditorError}>
                                        {showServerSetupError}
                                    </p>
                                ) : undefined
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
