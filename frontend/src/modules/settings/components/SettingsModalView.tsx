import { Button, Modal, ModalContent, cn } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ChevronLeft, RotateCcw, Save, X } from "lucide-react";
import { ICON_STROKE_WIDTH, INTERACTION_CONFIG } from "@/config/logic";
import { APP_VERSION } from "@/shared/version";
import {
    GLASS_MODAL_SURFACE,
    MODAL_SURFACE_FOOTER,
    MODAL_SURFACE_FRAME,
    MODAL_SURFACE_HEADER,
} from "@/shared/ui/layout/glass-surface";
import { Section } from "@/shared/ui/layout/Section";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { SettingsFormProvider } from "@/modules/settings/context/SettingsFormContext";
import { SettingsFormBuilder } from "@/modules/settings/components/SettingsFormBuilder";
import { ConnectionCredentialsCard } from "@/modules/settings/components/tabs/connection/ConnectionManager";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import { SystemTabContent } from "@/modules/settings/components/tabs/system/SystemTabContent";
import { InterfaceTabContent } from "@/modules/settings/components/InterfaceTabContent";
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
                "flex flex-col border-r border-content1/20 bg-content1/50 blur-glass transition-transform duration-300 absolute inset-y-0 left-0 z-sticky settings-sidebar-shell sm:relative sm:translate-x-0",
                !isMobileMenuOpen ? "-translate-x-full" : "translate-x-0",
            )}
        >
            <div className="p-stage border-b border-content1/10 flex justify-between items-center h-modal-header shrink-0">
                <h2 className="font-bold tracking-tight text-foreground tt-navbar-tab-font">
                    {t("settings.modal.title")}
                </h2>
                <Button
                    isIconOnly
                    variant="shadow"
                    size="md"
                    className="sm:hidden text-foreground/50"
                    onPress={controller.commands.onRequestClose}
                >
                    <X
                        strokeWidth={ICON_STROKE_WIDTH}
                        className="toolbar-icon-size-md"
                    />
                </Button>
            </div>

            <div className="flex-1 px-panel py-panel space-y-tight overflow-y-auto scrollbar-hide">
                {safeVisibleTabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => controller.commands.onSelectTab(tab.id)}
                        className={cn(
                            "w-full flex items-center gap-panel px-panel py-panel rounded-panel transition-all duration-200 group relative",
                            activeTabDefinition.id === tab.id
                                ? "bg-primary/10 text-primary font-semibold"
                                : "text-foreground/60 hover:text-foreground hover:bg-content2/50 font-medium",
                        )}
                        style={{
                            fontSize: "var(--icon)",
                        }}
                    >
                        <tab.icon
                            strokeWidth={ICON_STROKE_WIDTH}
                            className={cn(
                                "shrink-0 toolbar-icon-size-md",
                                activeTabDefinition.id === tab.id
                                    ? "text-primary"
                                    : "text-foreground/50",
                            )}
                        />
                        <span>{t(tab.labelKey)}</span>
                        {activeTabDefinition.id === tab.id && (
                            <motion.div
                                layoutId="activeTabIndicator"
                                className="absolute settings-tab-indicator bg-primary rounded-r-pill"
                            />
                        )}
                    </button>
                ))}
            </div>

            <div className="p-panel border-t border-content1/10 shrink-0">
                <div className="text-scaled text-foreground/30 font-mono tracking-widest">
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
            className={cn(
                MODAL_SURFACE_HEADER,
                "sticky top-0 z-panel shrink-0 h-modal-header flex items-center justify-between px-stage bg-content1/30 blur-glass",
            )}
        >
            <div className="flex items-center gap-tools">
                <Button
                    isIconOnly
                    variant="shadow"
                    size="md"
                    className="sm:hidden -ml-tight text-foreground/50"
                    onPress={controller.commands.onOpenMobileMenu}
                >
                    <ChevronLeft className="toolbar-icon-size-md" />
                </Button>
                <div className="flex flex-col">
                    <h1 className="font-bold text-foreground tt-navbar-tab-font">
                        {t(activeTabDefinition.headerKey)}
                    </h1>
                    {hasUnsavedChanges && (
                        <span className="text-scaled uppercase font-bold text-warning animate-pulse tracking-0-2">
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
                className="text-foreground/40 hover:text-foreground hidden sm:flex"
            />
        </div>
    );
}

interface SettingsContentProps {
    controller: SettingsModalController;
}

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
            className="flex-1 min-h-0 overflow-y-auto scrollbar-hide"
        >
            {tabsFallbackActive && (
                <div className="rounded-panel border border-warning/30 bg-warning/10 px-panel py-tight text-label text-warning mb-panel">
                    {t("settings.modal.error_no_tabs")}
                </div>
            )}
            {modalFeedback && (
                <div
                    className={cn(
                        "rounded-panel border px-panel py-tight text-label mb-panel",
                        modalFeedback.type === "error"
                            ? "border-danger/40 bg-danger/5 text-danger"
                            : "border-success/40 bg-success/10 text-success",
                    )}
                >
                    {modalFeedback.text}
                </div>
            )}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTabDefinition.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col space-y-stage sm:space-y-stage pb-stage"
                >
                    {settingsLoadError && (
                        <div className="rounded-panel border border-warning/30 bg-warning/10 px-panel py-tight text-label text-warning">
                            {t("settings.load_error")}
                        </div>
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
                                <div className="space-y-stage">
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
            <div
                className={cn(
                    MODAL_SURFACE_FOOTER,
                    "sticky bottom-0 z-panel shrink-0 bg-content1/40 blur-glass px-stage py-stage flex items-center justify-between",
                )}
            >
                <div className="w-full flex items-center gap-panel">
                    <div className="flex flex-col min-w-0">
                        <span className="text-scaled font-semibold text-warning">
                            {t("settings.modal.discard_title")}
                        </span>
                        <span className="text-label text-foreground/60">
                            {t("settings.modal.discard_body")}
                        </span>
                    </div>
                    <div className="flex gap-tools ml-auto shrink-0">
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
        <div
            className={cn(
                MODAL_SURFACE_FOOTER,
                "sticky bottom-0 z-panel shrink-0 bg-content1/40 blur-glass px-stage py-stage flex items-center justify-between",
            )}
        >
            <Button
                size="md"
                variant="shadow"
                color="danger"
                className="opacity-70 hover:opacity-100"
                onPress={controller.commands.onReset}
                startContent={
                    <RotateCcw
                        strokeWidth={ICON_STROKE_WIDTH}
                        className="toolbar-icon-size-sm shrink-0"
                    />
                }
            >
                {t("settings.modal.footer.reset_defaults")}
            </Button>
            <div className="flex gap-tools ml-auto">
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
                                className="toolbar-icon-size-sm shrink-0"
                            />
                        )
                    }
                    className="font-semibold shadow-small shadow-primary/20"
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
                base: cn(
                    GLASS_MODAL_SURFACE,
                    MODAL_SURFACE_FRAME,
                    uiMode === "Full"
                        ? "flex flex-row max-h-full max-w-full"
                        : "flex flex-row h-settings max-h-settings min-h-settings",
                ),
                wrapper: "overflow-hidden",
            }}
            motionProps={INTERACTION_CONFIG.modalBloom}
        >
            <ModalContent className="h-full flex flex-col">
                <div className="flex flex-row flex-1 min-h-0 overflow-hidden relative">
                    <SettingsSidebar controller={controller} />
                    <div className="flex-1 min-h-0 flex flex-col bg-content1/10 blur-glass relative w-full">
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
