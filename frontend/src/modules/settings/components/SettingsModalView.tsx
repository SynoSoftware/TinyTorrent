import { Button, Modal, ModalContent, cn } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ChevronLeft, RotateCcw, X } from "lucide-react";
import { registry } from "@/config/logic";
import { form, modal } from "@/shared/ui/layout/glass-surface";
import { Section } from "@/shared/ui/layout/Section";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { AlertPanel } from "@/shared/ui/layout/AlertPanel";
import { SettingsFormProvider } from "@/modules/settings/context/SettingsFormContext";
import { SettingsFormBuilder } from "@/modules/settings/components/SettingsFormBuilder";
import { ConnectionCredentialsCard } from "@/modules/settings/components/tabs/connection/ConnectionManager";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import { SystemTabContent } from "@/modules/settings/components/tabs/system/SystemTabContent";
import { InterfaceTabContent } from "@/modules/settings/components/InterfaceTabContent";
import type { SettingsModalController } from "@/modules/settings/hooks/useSettingsModalController";
import { useSettingsModalController } from "@/modules/settings/hooks/useSettingsModalController";
import type { SettingsModalViewModel } from "@/app/viewModels/useAppViewModel";
const { interaction, visuals, visualizations } = registry;

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
    const { safeVisibleTabs, activeTabDefinition, isMobileMenuOpen } = controller.modal;

    return (
        <div className={cn(modal.sidebar, !isMobileMenuOpen ? modal.sidebarHidden : modal.sidebarVisible)}>
            <div className={modal.sidebarHeader}>
                <h2 className={cn(visuals.typography.text.headingLarge, modal.headingFont)}>
                    {t("settings.modal.title")}
                </h2>
                <Button
                    isIconOnly
                    variant="shadow"
                    size="md"
                    className={modal.sidebarCloseButton}
                    onPress={controller.commands.onRequestClose}
                >
                    <X strokeWidth={visuals.icon.strokeWidth} className={modal.iconMd} />
                </Button>
            </div>

            <div className={modal.sidebarBody}>
                {safeVisibleTabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => controller.commands.onSelectTab(tab.id)}
                        className={cn(
                            modal.tabButtonBase,
                            activeTabDefinition.id === tab.id ? modal.tabButtonActive : modal.tabButtonInactive,
                        )}
                        style={{
                            fontSize: "var(--icon)",
                        }}
                    >
                        <tab.icon
                            strokeWidth={visuals.icon.strokeWidth}
                            className={cn(
                                modal.tabIcon,
                                activeTabDefinition.id === tab.id ? modal.tabIconActive : modal.tabIconInactive,
                            )}
                        />
                        <span>{t(tab.labelKey)}</span>
                        {activeTabDefinition.id === tab.id && (
                            <motion.div layoutId="activeTabIndicator" className={modal.tabIndicator} />
                        )}
                    </button>
                ))}
            </div>

            <div className={modal.versionWrapper}>
                <div className={form.blockStackTight}>
                    <Button
                        size="md"
                        variant="light"
                        color="danger"
                        onPress={controller.commands.onReset}
                        startContent={<RotateCcw strokeWidth={visuals.icon.strokeWidth} className={modal.iconSm} />}
                    >
                        {t("settings.modal.footer.reset_defaults")}
                    </Button>
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
    const { activeTabDefinition } = controller.modal;

    return (
        <div className={modal.header}>
            <div className={modal.headerLead}>
                <Button
                    isIconOnly
                    variant="shadow"
                    size="md"
                    className={modal.headerMobileBack}
                    onPress={controller.commands.onOpenMobileMenu}
                >
                    <ChevronLeft className={modal.iconMd} />
                </Button>
                <div className={modal.headerTitleWrap}>
                    <h1 className={cn(visuals.typography.text.headingLarge, modal.headingFont)}>
                        {t(activeTabDefinition.headerKey)}
                    </h1>
                </div>
            </div>
            <ToolbarIconButton
                Icon={X}
                ariaLabel={t("torrent_modal.actions.close")}
                onPress={controller.commands.onRequestClose}
                iconSize="lg"
                className={modal.desktopClose}
            />
        </div>
    );
}

interface SettingsContentProps {
    controller: SettingsModalController;
}

const SETTINGS_TAB_CONTENT_ANIMATION = {
    initial: {
        opacity: visualizations.surface.fade.base.initial.opacity,
        y: 10,
    },
    animate: {
        opacity: visualizations.surface.fade.base.animate.opacity,
        y: 0,
    },
    exit: { opacity: visualizations.surface.fade.base.exit.opacity, y: -10 },
    transition: visualizations.surface.fade.base.transition,
} as const;

function SettingsContent({ controller }: SettingsContentProps) {
    const { t } = useTranslation();
    const {
        activeTabDefinition,
        tabsFallbackActive,
        modalError,
        settingsLoadError,
        settingsFormState,
        settingsFormActions,
    } = controller.modal;
    return (
        <Section padding="modal" className={modal.scrollContent}>
            {tabsFallbackActive && (
                <AlertPanel severity="warning" className={modal.alert}>
                    {t("settings.modal.error_no_tabs")}
                </AlertPanel>
            )}
            {modalError && (
                <AlertPanel severity="danger" className={modal.alert}>
                    {modalError}
                </AlertPanel>
            )}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTabDefinition.id}
                    {...SETTINGS_TAB_CONTENT_ANIMATION}
                    className={modal.contentStack}
                >
                    {settingsLoadError && (
                        <AlertPanel severity="warning" className={modal.inlineAlert}>
                            {t("settings.load_error")}
                        </AlertPanel>
                    )}
                    <SettingsFormProvider stateValue={settingsFormState} actionsValue={settingsFormActions}>
                        {activeTabDefinition.id === "connection" ? (
                            <SettingsSection
                                title={t("settings.sections.active_connection")}
                                description={t("settings.descriptions.connection_profiles")}
                            >
                                <ConnectionCredentialsCard />
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

export function SettingsModalView({ controller }: SettingsModalViewProps) {
    const { isOpen, uiMode } = controller.modal;
    const modalClassNames = uiMode === "Full" ? modal.settingsModalClassNamesFull : modal.settingsModalClassNamesRpc;

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={controller.commands.onOpenChange}
            backdrop="blur"
            placement="center"
            size="5xl"
            hideCloseButton
            isDismissable={false}
            isKeyboardDismissDisabled={false}
            classNames={modalClassNames}
            motionProps={interaction.config.modalBloom}
        >
            <ModalContent className={modal.contentWrapper}>
                <div className={modal.layout}>
                    <SettingsSidebar controller={controller} />
                    <div className={modal.mainPane}>
                        <SettingsHeader controller={controller} />
                        <SettingsContent controller={controller} />
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
