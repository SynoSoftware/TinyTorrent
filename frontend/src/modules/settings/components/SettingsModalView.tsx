import { Button, Modal, ModalContent, cn } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ChevronLeft, RotateCcw, Save, X } from "lucide-react";
import {
    ICON_STROKE_WIDTH,
    INTERACTION_CONFIG,
    DETAILS_TOOLTIP_OPACITY_ANIMATION,
} from "@/config/logic";
import { APP_VERSION } from "@/shared/version";
import {
    APP_MODAL_CLASS,
} from "@/shared/ui/layout/glass-surface";
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
                APP_MODAL_CLASS.sidebar,
                !isMobileMenuOpen
                    ? APP_MODAL_CLASS.sidebarHidden
                    : APP_MODAL_CLASS.sidebarVisible,
            )}
        >
            <div className={APP_MODAL_CLASS.sidebarHeader}>
                <h2 className={cn(TEXT_ROLE.headingLarge, APP_MODAL_CLASS.headingFont)}>
                    {t("settings.modal.title")}
                </h2>
                <Button
                    isIconOnly
                    variant="shadow"
                    size="md"
                    className={APP_MODAL_CLASS.sidebarCloseButton}
                    onPress={controller.commands.onRequestClose}
                >
                    <X
                        strokeWidth={ICON_STROKE_WIDTH}
                        className={APP_MODAL_CLASS.iconMd}
                    />
                </Button>
            </div>

            <div className={APP_MODAL_CLASS.sidebarBody}>
                {safeVisibleTabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => controller.commands.onSelectTab(tab.id)}
                        className={cn(
                            APP_MODAL_CLASS.tabButtonBase,
                            activeTabDefinition.id === tab.id
                                ? APP_MODAL_CLASS.tabButtonActive
                                : APP_MODAL_CLASS.tabButtonInactive,
                        )}
                        style={{
                            fontSize: "var(--icon)",
                        }}
                    >
                        <tab.icon
                            strokeWidth={ICON_STROKE_WIDTH}
                            className={cn(
                                APP_MODAL_CLASS.tabIcon,
                                activeTabDefinition.id === tab.id
                                    ? APP_MODAL_CLASS.tabIconActive
                                    : APP_MODAL_CLASS.tabIconInactive,
                            )}
                        />
                        <span>{t(tab.labelKey)}</span>
                        {activeTabDefinition.id === tab.id && (
                            <motion.div
                                layoutId="activeTabIndicator"
                                className={APP_MODAL_CLASS.tabIndicator}
                            />
                        )}
                    </button>
                ))}
            </div>

            <div className={APP_MODAL_CLASS.versionWrapper}>
                <div className={APP_MODAL_CLASS.versionText}>
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
        <div
            className={APP_MODAL_CLASS.header}
        >
            <div className={APP_MODAL_CLASS.headerLead}>
                <Button
                    isIconOnly
                    variant="shadow"
                    size="md"
                    className={APP_MODAL_CLASS.headerMobileBack}
                    onPress={controller.commands.onOpenMobileMenu}
                >
                    <ChevronLeft className={APP_MODAL_CLASS.iconMd} />
                </Button>
                <div className={APP_MODAL_CLASS.headerTitleWrap}>
                    <h1 className={cn(TEXT_ROLE.headingLarge, APP_MODAL_CLASS.headingFont)}>
                        {t(activeTabDefinition.headerKey)}
                    </h1>
                    {hasUnsavedChanges && (
                        <span
                            className={APP_MODAL_CLASS.headerUnsaved}
                        >
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
                className={APP_MODAL_CLASS.desktopClose}
            />
        </div>
    );
}

interface SettingsContentProps {
    controller: SettingsModalController;
}

const SETTINGS_TAB_CONTENT_ANIMATION = {
    initial: { opacity: DETAILS_TOOLTIP_OPACITY_ANIMATION.initial.opacity, y: 10 },
    animate: { opacity: DETAILS_TOOLTIP_OPACITY_ANIMATION.animate.opacity, y: 0 },
    exit: { opacity: DETAILS_TOOLTIP_OPACITY_ANIMATION.exit.opacity, y: -10 },
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
        <Section
            padding="modal"
            className={APP_MODAL_CLASS.scrollContent}
        >
            {tabsFallbackActive && (
                <AlertPanel severity="warning" className={APP_MODAL_CLASS.alert}>
                    {t("settings.modal.error_no_tabs")}
                </AlertPanel>
            )}
            {modalFeedback && (
                <AlertPanel
                    severity={modalFeedback.type === "error" ? "danger" : "success"}
                    className={APP_MODAL_CLASS.alert}
                >
                    {modalFeedback.text}
                </AlertPanel>
            )}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTabDefinition.id}
                    {...SETTINGS_TAB_CONTENT_ANIMATION}
                    className={APP_MODAL_CLASS.contentStack}
                >
                    {settingsLoadError && (
                        <AlertPanel
                            severity="warning"
                            className={APP_MODAL_CLASS.inlineAlert}
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
                                <div className={APP_MODAL_CLASS.connectionStack}>
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
            <div className={APP_MODAL_CLASS.footer}>
                <div className={APP_MODAL_CLASS.footerConfirmContent}>
                    <div className={APP_MODAL_CLASS.footerTextWrap}>
                        <span className={APP_MODAL_CLASS.footerWarningTitle}>
                            {t("settings.modal.discard_title")}
                        </span>
                        <span className={TEXT_ROLE.caption}>
                            {t("settings.modal.discard_body")}
                        </span>
                    </div>
                    <div className={APP_MODAL_CLASS.footerActions}>
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
        <div className={APP_MODAL_CLASS.footer}>
            <Button
                size="md"
                variant="shadow"
                color="danger"
                className={APP_MODAL_CLASS.footerResetButton}
                onPress={controller.commands.onReset}
                startContent={
                            <RotateCcw
                                strokeWidth={ICON_STROKE_WIDTH}
                                className={APP_MODAL_CLASS.iconSm}
                            />
                        }
            >
                {t("settings.modal.footer.reset_defaults")}
            </Button>
            <div className={APP_MODAL_CLASS.footerButtonRow}>
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
                                strokeWidth={ICON_STROKE_WIDTH}
                                className={APP_MODAL_CLASS.iconSm}
                            />
                        )
                    }
                    className={APP_MODAL_CLASS.footerSaveButton}
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
            classNames={{
                base:
                    uiMode === "Full"
                        ? APP_MODAL_CLASS.settingsModalBaseFull
                        : APP_MODAL_CLASS.settingsModalBaseRpc,
                wrapper: APP_MODAL_CLASS.settingsModalWrapper,
            }}
            motionProps={INTERACTION_CONFIG.modalBloom}
        >
            <ModalContent className={APP_MODAL_CLASS.contentWrapper}>
                <div className={APP_MODAL_CLASS.layout}>
                    <SettingsSidebar controller={controller} />
                    <div className={APP_MODAL_CLASS.mainPane}>
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



