import { Button, Modal, cn } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ChevronLeft, RotateCcw, X } from "lucide-react";
import { registry } from "@/config/logic";
import { form, modal, surface } from "@/shared/ui/layout/glass-surface";
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
const { visuals, visualizations } = registry;

const settingsModalView = {
    dialogFull: "max-h-full max-w-full",
    dialogBounded: "h-settings max-h-settings min-h-settings",
    row: "flex flex-row flex-1 min-h-0 overflow-hidden relative",
    mainPane: "flex-1 min-h-0 flex flex-col glass-panel surface-layer-1 text-foreground bg-transparent relative w-full",
    header: "shrink-0 h-modal-header flex items-center justify-between px-stage",
    headerLead: "flex min-w-0 flex-1 items-center gap-panel",
    headerTitle: "flex min-w-0 flex-col overflow-hidden",
    headerMobileBack: "sm:hidden -ml-tight text-foreground/50",
    headerDesktopClose: `text-foreground/40 hidden sm:flex ${visuals.interactive.dismiss}`,
    titleFont: "tt-navbar-tab-font",
    iconSm: "toolbar-icon-size-sm shrink-0",
    iconMd: "toolbar-icon-size-md",
    sidebar: `flex flex-col border-r border-default/20 glass-panel surface-layer-0 text-foreground ${registry.tokens.primitive.motion.slow} absolute inset-y-0 left-0 z-sticky settings-sidebar-shell sm:relative sm:translate-x-0`,
    sidebarHidden: "-translate-x-full",
    sidebarVisible: "translate-x-0",
    sidebarHeader: "p-stage border-b border-default/10 flex justify-between items-center h-modal-header shrink-0",
    sidebarCloseButton: "sm:hidden text-foreground/50",
    sidebarBody: "flex-1 px-panel py-panel space-y-tight overflow-y-auto scrollbar-hide",
    sidebarVersion: "p-panel border-t border-default/10 shrink-0",
    tabButton: `w-full flex items-center gap-panel px-panel py-panel rounded-panel ${registry.tokens.primitive.motion.medium} group relative`,
    tabButtonActive: "bg-accent-soft text-accent font-semibold",
    tabButtonInactive: `text-foreground/60 font-medium ${visuals.interactive.navItem}`,
    tabIcon: "shrink-0 toolbar-icon-size-md",
    tabIconActive: "text-accent",
    tabIconInactive: "text-foreground/50",
    tabIndicator: "absolute settings-tab-indicator bg-accent rounded-r-pill",
    scroll: "flex-1 min-h-0 overflow-y-auto scrollbar-hide",
    contentStack: "flex flex-col space-y-stage sm:space-y-stage pb-stage",
    alert: "mb-panel px-panel py-tight",
    inlineAlert: "px-panel py-tight",
} as const;

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
        <div
            className={cn(
                settingsModalView.sidebar,
                !isMobileMenuOpen
                    ? settingsModalView.sidebarHidden
                    : settingsModalView.sidebarVisible,
            )}
        >
            <div className={settingsModalView.sidebarHeader}>
                <h2 className={cn(visuals.typography.text.headingLarge, settingsModalView.titleFont)}>
                    {t("settings.modal.title")}
                </h2>
                <Button
                    isIconOnly
                    variant="ghost"
                    size="md"
                    className={settingsModalView.sidebarCloseButton}
                    onPress={controller.commands.onRequestClose}
                >
                    <X strokeWidth={visuals.icon.strokeWidth} className={settingsModalView.iconMd} />
                </Button>
            </div>

            <div className={settingsModalView.sidebarBody}>
                {safeVisibleTabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => controller.commands.onSelectTab(tab.id)}
                        className={cn(
                            settingsModalView.tabButton,
                            activeTabDefinition.id === tab.id
                                ? settingsModalView.tabButtonActive
                                : settingsModalView.tabButtonInactive,
                        )}
                        style={{
                            fontSize: "var(--icon)",
                        }}
                    >
                        <tab.icon
                            strokeWidth={visuals.icon.strokeWidth}
                            className={cn(
                                settingsModalView.tabIcon,
                                activeTabDefinition.id === tab.id
                                    ? settingsModalView.tabIconActive
                                    : settingsModalView.tabIconInactive,
                            )}
                        />
                        <span>{t(tab.labelKey)}</span>
                        {activeTabDefinition.id === tab.id && (
                            <motion.div
                                layoutId="activeTabIndicator"
                                className={settingsModalView.tabIndicator}
                            />
                        )}
                    </button>
                ))}
            </div>

            <div className={settingsModalView.sidebarVersion}>
                <div className={form.blockStackTight}>
                    <Button
                        variant="danger"
                        onPress={controller.commands.onReset}
                    >
                        <span className={form.blockRowBetween}>
                            <RotateCcw
                                strokeWidth={visuals.icon.strokeWidth}
                                className={settingsModalView.iconSm}
                            />
                            <span>{t("settings.modal.footer.reset_defaults")}</span>
                        </span>
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
        <div
            className={cn(
                modal.chrome.header,
                surface.chrome.sticky,
                settingsModalView.header,
            )}
        >
            <div className={settingsModalView.headerLead}>
                <Button
                    isIconOnly
                    variant="ghost"
                    size="md"
                    className={settingsModalView.headerMobileBack}
                    onPress={controller.commands.onOpenMobileMenu}
                >
                    <ChevronLeft className={settingsModalView.iconMd} />
                </Button>
                <div className={settingsModalView.headerTitle}>
                    <h1 className={cn(visuals.typography.text.headingLarge, settingsModalView.titleFont)}>
                        {t(activeTabDefinition.headerKey)}
                    </h1>
                </div>
            </div>
            <ToolbarIconButton
                Icon={X}
                ariaLabel={t("torrent_modal.actions.close")}
                onPress={controller.commands.onRequestClose}
                iconSize="lg"
                className={settingsModalView.headerDesktopClose}
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
        <Section padding="modal" className={settingsModalView.scroll}>
            {tabsFallbackActive && (
                <AlertPanel severity="warning" className={settingsModalView.alert}>
                    {t("settings.modal.error_no_tabs")}
                </AlertPanel>
            )}
            {modalError && (
                <AlertPanel severity="danger" className={settingsModalView.alert}>
                    {modalError}
                </AlertPanel>
            )}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTabDefinition.id}
                    {...SETTINGS_TAB_CONTENT_ANIMATION}
                    className={settingsModalView.contentStack}
                >
                    {settingsLoadError && (
                        <AlertPanel severity="warning" className={settingsModalView.inlineAlert}>
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
    const dialogClassName =
        uiMode === "Full"
            ? cn(modal.surface.base, settingsModalView.dialogFull)
            : cn(modal.surface.base, settingsModalView.dialogBounded);

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={controller.commands.onOpenChange}
        >
            <Modal.Backdrop variant="opaque" isDismissable={false} />
            <Modal.Container
                className={modal.placement.center}
                placement="center"
                scroll="outside"
                size={uiMode === "Full" ? "full" : "lg"}
            >
                <Modal.Dialog className={dialogClassName}>
                    <div className={cn(modal.layout.frame, settingsModalView.row)}>
                        <SettingsSidebar controller={controller} />
                        <div className={settingsModalView.mainPane}>
                            <SettingsHeader controller={controller} />
                            <SettingsContent controller={controller} />
                        </div>
                    </div>
                </Modal.Dialog>
            </Modal.Container>
        </Modal>
    );
}

export function SettingsModal({ viewModel }: SettingsModalProps) {
    const controller = useSettingsModalController(viewModel);
    return <SettingsModalView controller={controller} />;
}
