import { AnimatePresence, motion, type Transition } from "framer-motion";
import { FileUp } from "lucide-react";
import { cn } from "@heroui/react";
import {
    Panel,
    PanelGroup,
    PanelResizeHandle,
    type ImperativePanelHandle,
} from "react-resizable-panels";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFocusState } from "@/app/context/AppShellStateContext";

import { TorrentTable } from "@/modules/dashboard/components/TorrentTable";
import { TorrentDetails } from "@/modules/dashboard/components/TorrentDetails";
import {
    DetailOpenProvider,
    type DetailOpenMode,
} from "@/modules/dashboard/context/DetailOpenContext";
import {
    ICON_STROKE_WIDTH,
    getShellTokens,
    MIN_HANDLE_VISUAL_WIDTH,
} from "@/config/logic";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { Section } from "@/shared/ui/layout/Section";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { DashboardViewModel } from "@/app/viewModels/useAppViewModel";

const ANIMATION = {
    spring: {
        type: "spring",
        stiffness: 240,
        damping: 26,
    } as Transition,
    entry: { duration: 0.2 },
} as const;

interface DashboardLayoutProps {
    viewModel: DashboardViewModel;
}

export function Dashboard_Layout({ viewModel }: DashboardLayoutProps) {
    const {
        workspaceStyle,
        table,
        detail,
        detailSplitDirection,
    } = viewModel;
    const {
        tableWatermarkEnabled,
        isDropActive = false,
    } = table;
    const {
        detailData,
        handleRequestDetails,
        closeDetail,
        isDetailRecoveryBlocked,
    } = detail;
    const { t } = useTranslation();
    const { setActivePart } = useFocusState();

    const isImmersiveShell = workspaceStyle === "immersive";

    const shell = getShellTokens(workspaceStyle);

    const splitDirection = detailSplitDirection ?? "vertical";
    const isHorizontalSplit = splitDirection === "horizontal";
    const detailPanelRef = useRef<ImperativePanelHandle | null>(null);
    const focusReturnRef = useRef<string | null>(null);
    const [isDetailFullscreen, setIsDetailFullscreen] = useState(false);
    const isDetailOpen = Boolean(detailData);
    const isDetailFullscreenActive = isDetailOpen && isDetailFullscreen;

    const focusTable = useCallback(
        () => setActivePart("table"),
        [setActivePart],
    );
    const focusInspector = useCallback(
        () => setActivePart("inspector"),
        [setActivePart],
    );

    const handleDetailOpen = useCallback(
        (torrent: Torrent, mode: DetailOpenMode) => {
            focusReturnRef.current = torrent.id;
            setActivePart("inspector");
            setIsDetailFullscreen(mode === "fullscreen");
            void handleRequestDetails(torrent);
        },
        [handleRequestDetails, setActivePart],
    );

    const handleDetailClose = useCallback(() => {
        setIsDetailFullscreen(false);
        setActivePart("table");
        closeDetail();
    }, [closeDetail, setActivePart]);

    const handleDetailDock = useCallback(() => {
        setIsDetailFullscreen(false);
        setActivePart("inspector");
    }, [setActivePart]);

    const handleDetailPopout = useCallback(() => {
        setIsDetailFullscreen(true);
        setActivePart("inspector");
    }, [setActivePart]);

    useEffect(() => {
        if (!detailPanelRef.current) return;
        if (isDetailOpen && !isDetailFullscreenActive) {
            detailPanelRef.current.expand();
        } else {
            detailPanelRef.current.collapse();
        }
    }, [isDetailFullscreenActive, isDetailOpen]);

    useEffect(() => {
        if (isDetailOpen || typeof document === "undefined") return;
        const pendingId = focusReturnRef.current;
        if (!pendingId) return;
        const rowElement = document.querySelector<HTMLElement>(
            `[data-torrent-row="${pendingId}"]`,
        );
        rowElement?.focus();
        focusReturnRef.current = null;
    }, [isDetailOpen]);

    useEffect(() => {
        if (!isDetailOpen) return;
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                handleDetailClose();
            }
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [isDetailOpen, handleDetailClose]);

    // --- GEOMETRY HELPERS ---

    const getShellStyles = () => {
        return {
            // Always include a subtle top border to prevent jump when focus highlight appears
            className: cn(
                "relative h-full w-full flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden transition-all duration-200",
                "border-t border-default/10",
                // remove active top-border color so the main container does not
                // gain a green focus line; keep a subtle neutral divider instead.
                "bg-transparent",
            ),
            // NOTE: surfaceStyle removed here — workbench PanelGroup is the single surface owner.
        };
    };

    const getContentStyles = () => ({
        className: cn(
            "relative flex-1 min-h-0 w-full h-full overflow-hidden",
            !isImmersiveShell && "bg-background/40",
        ),
        style: isImmersiveShell
            ? undefined
            : {
                  // Padding remains (geometry token); surfaceStyle removed — parent owns surface.
                  padding: `${shell.gap}px`,
              },
    });

    const dropOverlay = (
        <AnimatePresence>
            {isDropActive && (
                <motion.div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center z-50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={ANIMATION.entry}
                >
                    <motion.div
                        className="absolute inset-2 border border-primary/60"
                        // affordance only — do not apply surfaceStyle here; parent surface is workbench
                        initial={{ scale: 0.96, opacity: 0.4 }}
                        animate={{ scale: 1, opacity: 0.8 }}
                        exit={{ opacity: 0 }}
                        transition={{
                            ...ANIMATION.spring,
                            repeat: Infinity,
                            repeatType: "reverse",
                        }}
                    />
                    <div className="relative z-10 tt-drop-overlay">
                        <StatusIcon
                            Icon={FileUp}
                            size="xl"
                            strokeWidth={ICON_STROKE_WIDTH}
                            className="text-primary"
                        />
                        <span className="tt-drop-overlay__title">
                            {t("drop_overlay.title")}
                        </span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    const layoutContent = (
        <PanelGroup
            direction={splitDirection}
            autoSaveId="tiny-torrent.workbench.layout"
            className={cn(
                "flex-1 min-h-0 h-full w-full relative overflow-hidden  rounded-2xl",
            )}
            style={shell.surfaceStyle}
        >
            {/* --- MAIN PANEL --- */}
            <Panel className="relative flex-1 min-h-0 shadow-medium">
                <div {...getShellStyles()} onPointerDown={focusTable}>
                    <div {...getContentStyles()}>
                        <div
                            className="relative z-10 h-full min-h-0 overflow-hidden"
                            style={{
                                borderRadius: `${shell.innerRadius}px`,
                            }}
                        >
                            {tableWatermarkEnabled && (
                                <div
                                    aria-hidden="true"
                                    className="torrent-table-watermark absolute inset-0 z-0 pointer-events-none"
                                />
                            )}
                            <div
                                className="relative z-10 h-full min-h-0"
                                style={{ borderRadius: "inherit" }}
                            >
                                <DetailOpenProvider
                                    value={{
                                        openDetail: handleDetailOpen,
                                    }}
                                >
                                    <TorrentTable
                                        embedded={isImmersiveShell}
                                        viewModel={table}
                                        /* onOpenFolder removed; leaf components use TorrentActionsContext */
                                        /* onSetLocation removed: use TorrentActionsContext.setLocation */
                                    />
                                </DetailOpenProvider>
                            </div>
                        </div>
                        {dropOverlay}
                    </div>
                </div>
            </Panel>

            {/* --- RESIZE HANDLE (The Gap) --- */}
            <PanelResizeHandle
                className={cn(
                    "group relative z-10 transition-colors focus:outline-none",
                    isHorizontalSplit
                        ? "cursor-col-resize"
                        : "cursor-row-resize",
                )}
                hitAreaMargins={{
                    coarse: shell.handleHitArea,
                    fine: shell.handleHitArea,
                }}
                style={{
                    // Use CSS-driven semantic gap (no new numeric literals)
                    flexBasis: "var(--tt-gap)",
                }}
            >
                <div className="absolute inset-0 flex items-center justify-center">
                    <div
                        className={cn(
                            "transition-colors bg-foreground/0 group-hover:bg-foreground/10 group-active:bg-primary/50",
                        )}
                        style={
                            isHorizontalSplit
                                ? {
                                      width: `${MIN_HANDLE_VISUAL_WIDTH}px`,
                                      height: "100%",
                                  }
                                : {
                                      height: `${MIN_HANDLE_VISUAL_WIDTH}px`,
                                      width: "100%",
                                  }
                        }
                    />
                </div>
            </PanelResizeHandle>

            {/* --- INSPECTOR PANEL --- */}
            <Panel
                ref={detailPanelRef}
                collapsible
                collapsedSize={0}
                minSize={26}
                defaultSize={34}
                onPointerDown={focusInspector}
                className={cn(
                    "hidden overflow-hidden lg:flex shadow-medium",
                    isHorizontalSplit ? "h-full" : "w-full",
                )}
            >
                <div {...getShellStyles()}>
                    <div {...getContentStyles()}>
                        <div
                            className="h-full min-h-0 flex-1 "
                            style={{
                                borderRadius: `${shell.innerRadius}px`,
                            }}
                        >
                            <motion.div
                                className="h-full min-h-0 flex-1"
                                initial={false}
                                animate={
                                    isDetailOpen
                                        ? { opacity: 1, y: 0 }
                                        : { opacity: 0.75, y: 6 }
                                }
                                transition={ANIMATION.entry}
                            >
                                <TorrentDetails
                                    viewModel={detail}
                                    isDetailFullscreen={false}
                                    isRecoveryBlocked={isDetailRecoveryBlocked}
                                    onDock={handleDetailDock}
                                    onPopout={handleDetailPopout}
                                    onClose={handleDetailClose}
                                />
                            </motion.div>
                        </div>
                    </div>
                </div>
            </Panel>
        </PanelGroup>
    );

    return (
        <Section className="flex-1 min-h-0 h-full">
            {layoutContent}
            {/* --- FULLSCREEN MODAL --- */}
            <AnimatePresence initial={false}>
                {detailData && isDetailFullscreenActive && (
                    <motion.div
                        key={`fullscreen-detail-${detailData.id}`}
                        className="fixed inset-0 z-40"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                    >
                        <Section
                            padding="stage"
                            className="relative h-full flex items-center justify-center"
                        >
                            <div className="absolute inset-0 pointer-events-none bg-background/60 backdrop-blur-sm" />
                            <motion.div
                                className={cn(
                                    "relative z-10 flex h-full w-full flex-col overflow-hidden bg-content1/80 backdrop-blur-xl border border-content1/20 shadow-medium",
                                )}
                                style={{ borderRadius: `${shell.radius}px` }}
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.96 }}
                                transition={{ duration: 0.25 }}
                            >
                                <TorrentDetails
                                    viewModel={detail}
                                    isDetailFullscreen={isDetailFullscreenActive}
                                    isRecoveryBlocked={isDetailRecoveryBlocked}
                                    isStandalone={true}
                                    onDock={handleDetailDock}
                                    onPopout={handleDetailPopout}
                                    onClose={handleDetailClose}
                                />
                            </motion.div>
                        </Section>
                    </motion.div>
                )}
            </AnimatePresence>
        </Section>
    );
}
