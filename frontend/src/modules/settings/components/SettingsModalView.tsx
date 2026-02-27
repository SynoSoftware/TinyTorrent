import { Button, Modal, ModalContent, cn } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ChevronLeft, RotateCcw, Save, X } from "lucide-react";
import { registry } from "@/config/logic";
import { APP_VERSION } from "@/shared/version";
import { MODAL } from "@/shared/ui/layout/glass-surface";
import { Section } from "@/shared/ui/layout/Section";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { AlertPanel } from "@/shared/ui/layout/AlertPanel";
import { SettingsFormProvider } from "@/modules/settings/context/SettingsFormContext";
import { SettingsFormBuilder } from "@/modules/settings/components/SettingsFormBuilder";
import { ConnectionCredentialsCard } from "@/modules/settings/components/tabs/connection/ConnectionManager";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import { SystemTabContent } from "@/modules/settings/components/tabs/system/SystemTabContent";
import { InterfaceTabContent } from "@/modules/settings/components/InterfaceTabContent";
import { TEXT_ROLE } from "@/config/textRoles";
import type { SettingsModalController } from "@/modules/settings/hooks/useSettingsModalController";
import { useSettingsModalController } from "@/modules/settings/hooks/useSettingsModalController";
import type { SettingsModalViewModel } from "@/app/viewModels/useAppViewModel";
const { layout, interaction, visuals, visualizations, ui } = registry;

interface SettingsModalViewProps {
    controller: SettingsModalController;
}

interface SettingsModalProps {
    viewModel: SettingsModalViewModel;
}

interface SettingsSidebarProps {
    controller: SettingsModalController;
}

function SettingsSidebar({ controller }: SettingsSidebarProps) {
    const { t } = useTranslation();
    const { safeVisibleTabs, activeTabDefinition, isMobileMenuOpen } =
        controller.modal;

    return (
        <div
            className={cn(
                MODAL.sidebar,
                !isMobileMenuOpen ? MODAL.sidebarHidden : MODAL.sidebarVisible,
            )}
        >
            <div className={MODAL.sidebarHeader}>
                <h2 className={cn(TEXT_ROLE.headingLarge, MODAL.headingFont)}>
                    {t("settings.modal.title")}
                </h2>
                <Button
                    isIconOnly
                    variant="shadow"
                    size="md"
                    className={MODAL.sidebarCloseButton}
                    onPress={controller.commands.onRequestClose}
                >
                    <X
                        strokeWidth={visuals.icon.strokeWidth}
                        className={MODAL.iconMd}
                    />
                </Button>
            </div>

            <div className={MODAL.sidebarBody}>
                {safeVisibleTabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => controller.commands.onSelectTab(tab.id)}
                        className={cn(
                            MODAL.tabButtonBase,
                            activeTabDefinition.id === tab.id
                                ? MODAL.tabButtonActive
                                : MODAL.tabButtonInactive,
                        )}
                        style={{
                            fontSize: "var(--icon)",
                        }}
                    >
                        <tab.icon
                            strokeWidth={visuals.icon.strokeWidth}
                            className={cn(
                                MODAL.tabIcon,
                                activeTabDefinition.id === tab.id
                                    ? MODAL.tabIconActive
                                    : MODAL.tabIconInactive,
                            )}
                        />
                        <span>{t(tab.labelKey)}</span>
                        {activeTabDefinition.id === tab.id && (
                            <motion.div
                                layoutId="activeTabIndicator"
                                className={MODAL.tabIndicator}
                            />
                        )}
                    </button>
                ))}
            </div>

            <div className={MODAL.versionWrapper}>
                <div className={MODAL.versionText}>
                    {t("brand.version", { version: APP_VERSION })}
                </div>
            </div>
        </div>
    );
}

interface SettingsHeaderProps {
    controller: SettingsModalController;
}

function SettingsHeader({ controller }: SettingsHeaderProps) {
    const { t } = useTranslation();
    const { activeTabDefinition, hasUnsavedChanges } = controller.modal;

    return (
        <div className={MODAL.header}>
            <div className={MODAL.headerLead}>
                <Button
                    isIconOnly
                    variant="shadow"
                    size="md"
                    className={MODAL.headerMobileBack}
                    onPress={controller.commands.onOpenMobileMenu}
                >
                    <ChevronLeft className={MODAL.iconMd} />
                </Button>
                <div className={MODAL.headerTitleWrap}>
                    <h1
                        className={cn(
                            TEXT_ROLE.headingLarge,
                            MODAL.headingFont,
                        )}
                    >
                        {t(activeTabDefinition.headerKey)}
                    </h1>
                    {hasUnsavedChanges && (
                        <span className={MODAL.headerUnsaved}>
                            {t("settings.unsaved_changes")}
                        </span>
                    )}
                </div>
            </div>
            <ToolbarIconButton
                Icon={X}
                ariaLabel={t("torrent_modal.actions.close")}
                onPress={controller.commands.onRequestClose}
                iconSize="lg"
                className={MODAL.desktopClose}
            />
        </div>
    );
}

interface SettingsContentProps {
    controller: SettingsModalController;
}

const SETTINGS_TAB_CONTENT_ANIMATION = {
    initial: {
        opacity: visualizations.details.tooltipOpacityAnimation.initial.opacity,
        y: 10,
    },
    animate: {
        opacity: visualizations.details.tooltipOpacityAnimation.animate.opacity,
        y: 0,
    },
    exit: { opacity: visualizations.details.tooltipOpacityAnimation.exit.opacity, y: -10 },
    transition: { duration: 0.2 },
} as const;

function SettingsContent({ controller }: SettingsContentProps) {
    const { t } = useTranslation();
    const {
        activeTabDefinition,
        tabsFallbackActive,
        modalFeedback,
        settingsLoadError,
        settingsFormState,
        settingsFormActions,
    } = controller.modal;
    return (
        <Section padding="modal" className={MODAL.scrollContent}>
            {tabsFallbackActive && (
                <AlertPanel severity="warning" className={MODAL.alert}>
                    {t("settings.modal.error_no_tabs")}
                </AlertPanel>
            )}
            {modalFeedback && (
                <AlertPanel
                    severity={
                        modalFeedback.type === "error" ? "danger" : "success"
                    }
                    className={MODAL.alert}
                >
                    {modalFeedback.text}
                </AlertPanel>
            )}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTabDefinition.id}
                    {...SETTINGS_TAB_CONTENT_ANIMATION}
                    className={MODAL.contentStack}
                >
                    {settingsLoadError && (
                        <AlertPanel
                            severity="warning"
                            className={MODAL.inlineAlert}
                        >
                            {t("settings.load_error")}
                        </AlertPanel>
                    )}
                    <SettingsFormProvider
                        stateValue={settingsFormState}
                        actionsValue={settingsFormActions}
                    >
                        {activeTabDefinition.id === "connection" ? (
                            <SettingsSection
                                title={t("settings.sections.active_connection")}
                                description={t(
                                    "settings.descriptions.connection_profiles",
                                )}
                            >
                                <div className={MODAL.connectionStack}>
                                    <ConnectionCredentialsCard />
                                </div>
                            </SettingsSection>
                        ) : activeTabDefinition.id === "system" ? (
                            <SystemTabContent />
                        ) : activeTabDefinition.id === "gui" ? (
                            <InterfaceTabContent />
                        ) : (
                            <SettingsFormBuilder tab={activeTabDefinition} />
                        )}
                    </SettingsFormProvider>
                </motion.div>
            </AnimatePresence>
        </Section>
    );
}

interface SettingsFooterProps {
    controller: SettingsModalController;
}

function SettingsFooter({ controller }: SettingsFooterProps) {
    const { t } = useTranslation();
    const { closeConfirmPending, isSaving, hasUnsavedChanges } =
        controller.modal;

    if (closeConfirmPending) {
        return (
            <div className={MODAL.footer}>
                <div className={MODAL.footerConfirmContent}>
                    <div className={MODAL.footerTextWrap}>
                        <span className={MODAL.footerWarningTitle}>
                            {t("settings.modal.discard_title")}
                        </span>
                        <span className={TEXT_ROLE.caption}>
                            {t("settings.modal.discard_body")}
                        </span>
                    </div>
                    <div className={MODAL.footerActions}>
                        <Button
                            size="md"
                            variant="light"
                            onPress={controller.commands.onKeepEditing}
                        >
                            {t("settings.modal.discard_keep")}
                        </Button>
                        <Button
                            size="md"
                            variant="shadow"
                            color="danger"
                            onPress={controller.commands.onDiscardAndClose}
                        >
                            {t("settings.modal.discard_close")}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={MODAL.footer}>
            <Button
                size="md"
                variant="shadow"
                color="danger"
                className={MODAL.footerResetButton}
                onPress={controller.commands.onReset}
                startContent={
                    <RotateCcw
                        strokeWidth={visuals.icon.strokeWidth}
                        className={MODAL.iconSm}
                    />
                }
            >
                {t("settings.modal.footer.reset_defaults")}
            </Button>
            <div className={MODAL.footerButtonRow}>
                <Button
                    size="md"
                    variant="light"
                    onPress={controller.commands.onRequestClose}
                >
                    {t("settings.modal.footer.cancel")}
                </Button>
                <Button
                    size="md"
                    color="primary"
                    variant="shadow"
                    onPress={controller.commands.onSave}
                    isLoading={isSaving}
                    isDisabled={!hasUnsavedChanges || isSaving}
                    startContent={
                        !isSaving && (
                            <Save
                                strokeWidth={visuals.icon.strokeWidth}
                                className={MODAL.iconSm}
                            />
                        )
                    }
                    className={MODAL.footerSaveButton}
                >
                    {t("settings.modal.footer.save")}
                </Button>
            </div>
        </div>
    );
}

export function SettingsModalView({ controller }: SettingsModalViewProps) {
    const { isOpen, uiMode } = controller.modal;

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={controller.commands.onOpenChange}
            backdrop="blur"
            placement="center"
            size="5xl"
            hideCloseButton
            isDismissable
            isKeyboardDismissDisabled={false}
            classNames={MODAL.builder.settingsModalClassNames(uiMode === "Full")}
            motionProps={interaction.config.modalBloom}
        >
            <ModalContent className={MODAL.contentWrapper}>
                <div className={MODAL.layout}>
                    <SettingsSidebar controller={controller} />
                    <div className={MODAL.mainPane}>
                        <SettingsHeader controller={controller} />
                        <SettingsContent controller={controller} />
                        <SettingsFooter controller={controller} />
                    </div>
                </div>
            </ModalContent>
        </Modal>
    );
}

export function SettingsModal({ viewModel }: SettingsModalProps) {
    const controller = useSettingsModalController(viewModel);
    return <SettingsModalView controller={controller} />;
}


