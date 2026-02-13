import { AnimatePresence, motion, type Transition } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button, cn } from "@heroui/react";
import { memo } from "react";
import RemoveConfirmationModal from "@/modules/torrent-remove/components/RemoveConfirmationModal";
import { DeleteConfirmationProvider } from "@/modules/torrent-remove/context/DeleteConfirmationContext";
import { X } from "lucide-react";
import { STATUS } from "@/shared/status";

import { Dashboard_Layout } from "@/modules/dashboard/components/Dashboard_Layout";
import { SettingsModal } from "@/modules/settings/components/SettingsModalView";
import { Navbar } from "@/app/components/layout/Navbar";
import { StatusBar } from "@/app/components/layout/StatusBar";
import {
    IMMERSIVE_CHROME_PADDING,
    IMMERSIVE_CHROME_RADIUS,
    IMMERSIVE_HUD_CARD_RADIUS,
    IMMERSIVE_MAIN_CONTENT_PADDING,
    IMMERSIVE_MAIN_INNER_RADIUS,
    IMMERSIVE_MAIN_OUTER_RADIUS,
    IMMERSIVE_MAIN_PADDING,
} from "@/config/logic";
import { StatusIcon } from "@/shared/ui/components/StatusIcon";
import { Section, type SectionPadding } from "@/shared/ui/layout/Section";
import {
    WORKBENCH_CLASS,
} from "@/shared/ui/layout/glass-surface";
import type {
    StatusBarViewModel,
    WorkspaceShellViewModel,
} from "@/app/viewModels/useAppViewModel";
import { TEXT_ROLE } from "@/config/textRoles";

const TOAST_SPRING_TRANSITION: Transition = {
    type: "spring",
    stiffness: 300,
    damping: 28,
};

const HUD_COLUMNS = {
    0: "grid-cols-1",
    1: "grid-cols-1",
    2: "md:grid-cols-2",
    3: "xl:grid-cols-3",
};

const MemoNavbar = memo(Navbar);
const MemoDashboardLayout = memo(Dashboard_Layout);
const MemoSettingsModal = memo(SettingsModal);

interface WorkspaceShellProps {
    workspaceViewModel: WorkspaceShellViewModel;
    statusBarViewModel: StatusBarViewModel;
}

export function WorkspaceShell({
    workspaceViewModel,
    statusBarViewModel,
}: WorkspaceShellProps) {
    const {
        dragAndDrop,
        workspaceStyle: workspaceStyleControls,
        settingsModal,
        dashboard,
        hud,
        deletion,
        navbar,
        isNativeHost,
    } = workspaceViewModel;
    const { getRootProps, getInputProps } = dragAndDrop;
    const { workspaceStyle } = workspaceStyleControls;
    const { visibleHudCards, dismissHudCard } = hud;
    const { pendingDelete, clearPendingDelete, confirmDelete } = deletion;
    const { rpcStatus, handleReconnect } = statusBarViewModel;
    const isImmersiveShell = workspaceStyle === "immersive";
    const { t } = useTranslation();

    const renderNavbar = () => <MemoNavbar viewModel={navbar} />;

    const renderModeLayoutSection = () => (
        <MemoDashboardLayout viewModel={dashboard} />
    );

    const renderStatusBarSection = () => (
        <StatusBar viewModel={statusBarViewModel} />
    );

    const renderDeleteModal = () => (
        <DeleteConfirmationProvider value={deleteConfirmationContextValue}>
            <RemoveConfirmationModal />
        </DeleteConfirmationProvider>
    );

    const deleteConfirmationContextValue = {
        pendingDelete,
        clearPendingDelete,
        confirmDelete,
    };

    const hudGridClass =
        HUD_COLUMNS[
            Math.min(visibleHudCards.length, 3) as keyof typeof HUD_COLUMNS
        ] ?? "grid-cols-1";
    const shellSectionPadding: SectionPadding =
        isImmersiveShell && !isNativeHost
            ? "shell"
            : !isImmersiveShell && !isNativeHost
              ? "panel"
              : "none";

    return (
        <div
            {...getRootProps()}
            className={WORKBENCH_CLASS.root}
        >
            <input {...getInputProps()} />

            {isImmersiveShell && !isNativeHost && (
                <div className={WORKBENCH_CLASS.immersiveBackgroundRoot}>
                    <div className={WORKBENCH_CLASS.immersiveBackgroundBase} />
                    <div className={WORKBENCH_CLASS.immersiveBackgroundPrimaryBlend} />
                    <div className={WORKBENCH_CLASS.immersiveBackgroundSecondaryBlend} />
                    <div className={WORKBENCH_CLASS.immersiveBackgroundNoise} />
                    <div className={WORKBENCH_CLASS.immersiveBackgroundAccentBottom} />
                    <div className={WORKBENCH_CLASS.immersiveBackgroundAccentTop} />
                </div>
            )}

            <AnimatePresence>
                {rpcStatus === STATUS.connection.ERROR && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={TOAST_SPRING_TRANSITION}
                        className={WORKBENCH_CLASS.reconnectToast}
                        style={{
                            bottom: "var(--spacing-panel)",
                            right: "var(--spacing-panel)",
                        }}
                    >
                        <Button
                            size="md"
                            variant="shadow"
                            color="warning"
                            onPress={() => {
                                void handleReconnect();
                            }}
                        >
                            {t("status_bar.reconnect")}
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className={WORKBENCH_CLASS.content}>
                <Section
                    centered
                    padding={shellSectionPadding}
                    className={cn(
                        WORKBENCH_CLASS.section,
                        isNativeHost && WORKBENCH_CLASS.nativeShellBody,
                        isImmersiveShell
                            ? WORKBENCH_CLASS.sectionGapImmersive
                            : WORKBENCH_CLASS.sectionGapClassic,
                    )}
                    style={
                        isImmersiveShell && !isNativeHost
                            ? { maxWidth: "var(--tt-shell-main-max-w)" }
                            : undefined
                    }
                >
                    {isImmersiveShell ? (
                        <div
                            className={WORKBENCH_CLASS.immersiveNavbarWrap}
                            style={{
                                borderRadius: `${IMMERSIVE_CHROME_RADIUS}px`,
                                padding: `${IMMERSIVE_CHROME_PADDING}px`,
                            }}
                        >
                            {renderNavbar()}
                        </div>
                    ) : (
                        renderNavbar()
                    )}

                    {isImmersiveShell ? (
                        <>
                                <div
                                    className={cn(
                                        WORKBENCH_CLASS.immersiveMainWrap,
                                        isNativeHost && WORKBENCH_CLASS.nativeShellInner,
                                    )}
                                style={{
                                    borderRadius: `${IMMERSIVE_MAIN_OUTER_RADIUS}px`,
                                    padding: `${IMMERSIVE_MAIN_PADDING}px`,
                                }}
                            >
                                <main
                                    className={cn(
                                        WORKBENCH_CLASS.immersiveMain,
                                        isNativeHost && WORKBENCH_CLASS.nativeShellMain,
                                    )}
                                    style={{
                                        borderRadius: `${IMMERSIVE_MAIN_INNER_RADIUS}px`,
                                        padding: `${IMMERSIVE_MAIN_CONTENT_PADDING}px`,
                                    }}
                                >
                                    {renderModeLayoutSection()}
                                </main>
                            </div>
                            {visibleHudCards.length > 0 ? (
                                <section
                                    className={cn(
                                        WORKBENCH_CLASS.immersiveHudSection,
                                        hudGridClass,
                                    )}
                                >
                                    <AnimatePresence>
                                        {visibleHudCards.map((card) => {
                                            const Icon = card.icon;
                                            return (
                                                <motion.div
                                                    key={card.id}
                                                    layout
                                                    initial={{
                                                        opacity: 0,
                                                        y: 12,
                                                        scale: 0.98,
                                                    }}
                                                    animate={{
                                                        opacity: 1,
                                                        y: 0,
                                                        scale: 1,
                                                    }}
                                                    exit={{
                                                        opacity: 0,
                                                        y: 12,
                                                        scale: 0.98,
                                                    }}
                                                    transition={{
                                                        duration: 0.2,
                                                    }}
                                                    whileHover={{ y: -4 }}
                                                    className={cn(
                                                        WORKBENCH_CLASS.immersiveHudCard,
                                                        card.surfaceClass,
                                                    )}
                                                    style={{
                                                        borderRadius: `${IMMERSIVE_HUD_CARD_RADIUS}px`,
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            dismissHudCard(
                                                                card.id,
                                                            )
                                                        }
                                                        className={WORKBENCH_CLASS.immersiveHudDismissButton}
                                                        style={{
                                                            right: "var(--spacing-tight)",
                                                            top: "var(--spacing-tight)",
                                                        }}
                                                        aria-label={t(
                                                            "workspace.stage.dismiss_card",
                                                        )}
                                                    >
                                                        <StatusIcon
                                                            Icon={X}
                                                            size="md"
                                                            className={WORKBENCH_CLASS.iconCurrent}
                                                        />
                                                    </button>

                                                    <div className={WORKBENCH_CLASS.immersiveHudCardContent}>
                                                        <div
                                                            className={cn(
                                                                WORKBENCH_CLASS.immersiveHudIconWrap,
                                                                card.iconBgClass,
                                                            )}
                                                        >
                                                            <StatusIcon
                                                                Icon={Icon}
                                                                size="lg"
                                                                className={WORKBENCH_CLASS.iconCurrent}
                                                            />
                                                        </div>

                                                        <div className={WORKBENCH_CLASS.immersiveHudTextWrap}>
                                                            <p className={TEXT_ROLE.caption}>
                                                                {card.title}
                                                            </p>
                                                            <p className={WORKBENCH_CLASS.immersiveHudTextLabel}>
                                                                {card.label}
                                                            </p>
                                                            <p className={WORKBENCH_CLASS.immersiveHudTextDescription}>
                                                                {
                                                                    card.description
                                                                }
                                                            </p>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                </section>
                            ) : (
                                <></>
                            )}

                            <div
                                className={WORKBENCH_CLASS.immersiveStatusWrap}
                                style={{
                                    borderRadius: `${IMMERSIVE_CHROME_RADIUS}px`,
                                    padding: `${IMMERSIVE_CHROME_PADDING}px`,
                                }}
                            >
                                {renderStatusBarSection()}
                            </div>
                        </>
                    ) : (
                        <div className={WORKBENCH_CLASS.classicStack}>
                            <div className={WORKBENCH_CLASS.classicMainWrap}>
                                {renderModeLayoutSection()}
                            </div>
                            <div className={WORKBENCH_CLASS.classicStatusWrap}>
                                {renderStatusBarSection()}
                            </div>
                        </div>
                    )}
                </Section>
            </div>

            {renderDeleteModal()}

            <MemoSettingsModal viewModel={settingsModal} />
        </div>
    );
}

