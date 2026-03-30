import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "@heroui/react";
import { memo } from "react";
import RemoveConfirmationModal from "@/modules/torrent-remove/components/RemoveConfirmationModal";
import { DeleteConfirmationProvider } from "@/modules/torrent-remove/context/DeleteConfirmationContext";
import { X } from "lucide-react";

import { Dashboard_Layout } from "@/modules/dashboard/components/Dashboard_Layout";
import { SettingsModal } from "@/modules/settings/components/SettingsModalView";
import { Navbar } from "@/app/components/layout/Navbar";
import { StatusBar } from "@/app/components/layout/StatusBar";
import { registry } from "@/config/logic";
import { StatusIcon } from "@/shared/ui/components/StatusIcon";
import { Section, type SectionPadding } from "@/shared/ui/layout/Section";
import { workbench } from "@/shared/ui/layout/glass-surface";
import type { StatusBarViewModel, WorkspaceShellViewModel } from "@/app/viewModels/useAppViewModel";
const { shell, visuals } = registry;

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

export function WorkspaceShell({ workspaceViewModel, statusBarViewModel }: WorkspaceShellProps) {
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
    const isImmersiveShell = workspaceStyle === "immersive";
    const { t } = useTranslation();

    const renderNavbar = () => <MemoNavbar viewModel={navbar} />;

    const renderModeLayoutSection = () => <MemoDashboardLayout viewModel={dashboard} />;

    const renderStatusBarSection = () => <StatusBar viewModel={statusBarViewModel} />;

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
    const immersive = shell.immersive;

    const hudGridClass = HUD_COLUMNS[Math.min(visibleHudCards.length, 3) as keyof typeof HUD_COLUMNS] ?? "grid-cols-1";
    const shellSectionPadding: SectionPadding =
        isImmersiveShell && !isNativeHost ? "shell" : !isImmersiveShell && !isNativeHost ? "panel" : "none";

    return (
        <div {...getRootProps()} className={workbench.root}>
            <input {...getInputProps()} />

            {isImmersiveShell && !isNativeHost && (
                <div className={workbench.immersiveBackgroundRoot}>
                    <div className={workbench.immersiveBackgroundBase} />
                    <div className={workbench.immersiveBackgroundPrimaryBlend} />
                    <div className={workbench.immersiveBackgroundSecondaryBlend} />{" "}
                    <div className={workbench.immersiveBackgroundNoise} />
                    <div className={workbench.immersiveBackgroundAccentBottom} />{" "}
                    <div className={workbench.immersiveBackgroundAccentTop} />
                </div>
            )}

            <div className={workbench.content}>
                <Section
                    centered
                    padding={shellSectionPadding}
                    className={cn(
                        workbench.section,
                        isNativeHost && workbench.nativeShellBody,
                        isImmersiveShell ? workbench.sectionGapImmersive : workbench.sectionGapClassic,
                    )}
                    style={isImmersiveShell && !isNativeHost ? { maxWidth: "var(--tt-shell-main-max-w)" } : undefined}
                >
                    {isImmersiveShell ? (
                        <div
                            className={workbench.immersiveNavbarWrap}
                            style={{
                                borderRadius: `${immersive.chromeRadius}px`,
                                padding: `${immersive.chromePadding}px`,
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
                                className={cn(workbench.immersiveMainWrap, isNativeHost && workbench.nativeShellInner)}
                                style={{
                                    borderRadius: `${immersive.mainOuterRadius}px`,
                                    padding: `${immersive.mainPadding}px`,
                                }}
                            >
                                <main
                                    className={cn(workbench.immersiveMain, isNativeHost && workbench.nativeShellMain)}
                                    style={{
                                        borderRadius: `${immersive.mainInnerRadius}px`,
                                        padding: `${immersive.mainContentPadding}px`,
                                    }}
                                >
                                    {renderModeLayoutSection()}
                                </main>
                            </div>
                            {visibleHudCards.length > 0 ? (
                                <section className={cn(workbench.immersiveHudSection, hudGridClass)}>
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
                                                    className={cn(workbench.immersiveHudCard, card.surfaceClass)}
                                                    style={{
                                                        borderRadius: `${immersive.hudCardRadius}px`,
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => dismissHudCard(card.id)}
                                                        className={workbench.immersiveHudDismissButton}
                                                        style={{
                                                            right: "var(--spacing-tight)",
                                                            top: "var(--spacing-tight)",
                                                        }}
                                                        aria-label={t("workspace.stage.dismiss_card")}
                                                    >
                                                        <StatusIcon
                                                            Icon={X}
                                                            size="md"
                                                            className={workbench.iconCurrent}
                                                        />
                                                    </button>

                                                    <div className={workbench.immersiveHudCardContent}>
                                                        <div
                                                            className={cn(
                                                                workbench.immersiveHudIconWrap,
                                                                card.iconBgClass,
                                                            )}
                                                        >
                                                            <StatusIcon
                                                                Icon={Icon}
                                                                size="lg"
                                                                className={workbench.iconCurrent}
                                                            />
                                                        </div>

                                                        <div className={workbench.immersiveHudTextWrap}>
                                                            <p className={visuals.typography.text.caption}>
                                                                {" "}
                                                                {card.title}{" "}
                                                            </p>
                                                            <p className={workbench.immersiveHudTextLabel}>
                                                                {" "}
                                                                {card.label}{" "}
                                                            </p>
                                                            <p className={workbench.immersiveHudTextDescription}>
                                                                {" "}
                                                                {card.description}{" "}
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
                                className={workbench.immersiveStatusWrap}
                                style={{
                                    borderRadius: `${immersive.chromeRadius}px`,
                                    padding: `${immersive.chromePadding}px`,
                                }}
                            >
                                {renderStatusBarSection()}
                            </div>
                        </>
                    ) : (
                        <div className={workbench.classicStack}>
                            <div className={workbench.classicMainWrap}>{renderModeLayoutSection()}</div>
                            <div className={workbench.classicStatusWrap}>{renderStatusBarSection()}</div>
                        </div>
                    )}
                </Section>
            </div>

            {renderDeleteModal()}

            <MemoSettingsModal viewModel={settingsModal} />
        </div>
    );
}
