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
import type {
    StatusBarViewModel,
    WorkspaceShellViewModel,
} from "@/app/viewModels/useAppViewModel";

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
            className="tt-app-shell relative flex min-h-screen w-full flex-col overflow-hidden bg-background text-foreground font-sans selection:bg-primary/20"
        >
            <input {...getInputProps()} />

            {isImmersiveShell && !isNativeHost && (
                <div className="pointer-events-none absolute inset-0 z-floor">
                    <div className="absolute inset-0 bg-background/95" />
                    <div className="absolute inset-0 mix-blend-screen opacity-50 bg-primary/20" />
                    <div className="absolute inset-0 mix-blend-screen opacity-40 bg-content1/15" />
                    <div className="absolute inset-0 bg-noise opacity-20" />
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-0 h-shell-accent-large rounded-pill bg-primary/30 blur-glass opacity-40" />
                    <div className="absolute left-1/2 -translate-x-1/2 top-0 h-shell-accent-medium rounded-pill bg-primary/30 blur-glass opacity-35" />
                </div>
            )}

            <AnimatePresence>
                {rpcStatus === STATUS.connection.ERROR && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={TOAST_SPRING_TRANSITION}
                        className="fixed z-toast"
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

            <div className="relative z-panel flex w-full flex-1">
                <Section
                    centered
                    padding={shellSectionPadding}
                    className={cn(
                        "tt-shell-body flex w-full flex-1 flex-col",
                        isNativeHost && "native-shell-body",
                        isImmersiveShell ? "gap-stage" : "gap-tools",
                    )}
                    style={
                        isImmersiveShell && !isNativeHost
                            ? { maxWidth: "var(--tt-shell-main-max-w)" }
                            : undefined
                    }
                >
                    {isImmersiveShell ? (
                        <div
                            className="acrylic border shadow-hud"
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
                                    "tt-shell-no-drag acrylic flex-1 min-h-0 h-full border shadow-hud",
                                    isNativeHost && "native-shell-inner",
                                )}
                                style={{
                                    borderRadius: `${IMMERSIVE_MAIN_OUTER_RADIUS}px`,
                                    padding: `${IMMERSIVE_MAIN_PADDING}px`,
                                }}
                            >
                                <main
                                    className={cn(
                                        "flex-1 min-h-0 h-full overflow-hidden border bg-background/20 shadow-inner",
                                        isNativeHost && "native-shell-main",
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
                                        "tt-shell-no-drag grid gap-panel",
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
                                                        "glass-panel relative overflow-hidden border border-content1/10 bg-background/55 p-panel shadow-hud",
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
                                                        className="absolute rounded-pill bg-content1/20 p-tight text-foreground/60 transition hover:bg-content1/40 hover:text-foreground"
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
                                                            className="text-current"
                                                        />
                                                    </button>

                                                    <div className="flex items-start gap-workbench">
                                                        <div
                                                            className={cn(
                                                                "flex size-icon-btn-lg items-center justify-center rounded-panel",
                                                                card.iconBgClass,
                                                            )}
                                                        >
                                                            <StatusIcon
                                                                Icon={Icon}
                                                                size="lg"
                                                                className="text-current"
                                                            />
                                                        </div>

                                                        <div className="flex-1">
                                                            <p className="text-label text-foreground/60">
                                                                {card.title}
                                                            </p>
                                                            <p className="mt-tight text-scaled font-semibold text-foreground">
                                                                {card.label}
                                                            </p>
                                                            <p className="mt-panel text-label text-foreground/60">
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
                                className="tt-shell-no-drag glass-panel border border-content1/10 bg-background/75 shadow-hud blur-glass"
                                style={{
                                    borderRadius: `${IMMERSIVE_CHROME_RADIUS}px`,
                                    padding: `${IMMERSIVE_CHROME_PADDING}px`,
                                }}
                            >
                                {renderStatusBarSection()}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 min-h-0 h-full flex flex-col gap-tools">
                            <div className="tt-shell-no-drag flex-1 min-h-0 h-full">
                                {renderModeLayoutSection()}
                            </div>
                            <div className="tt-shell-no-drag">
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
