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
    DETAILS_TOOLTIP_OPACITY_ANIMATION,
    DROP_OVERLAY_ROLE,
    DROP_OVERLAY_TITLE_ROLE,
    ICON_STROKE_WIDTH,
    getShellTokens,
    MIN_HANDLE_VISUAL_WIDTH,
} from "@/config/logic";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { Section } from "@/shared/ui/layout/Section";
import {
    buildDashboardInspectorPanelClass,
    buildDashboardResizeHandleClass,
    DASHBOARD_LAYOUT_CLASS,
} from "@/shared/ui/layout/glass-surface";
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

const OVERLAY_FADE_ANIMATION = {
    initial: { opacity: DETAILS_TOOLTIP_OPACITY_ANIMATION.initial.opacity },
    animate: { opacity: DETAILS_TOOLTIP_OPACITY_ANIMATION.animate.opacity },
    exit: { opacity: DETAILS_TOOLTIP_OPACITY_ANIMATION.exit.opacity },
    transition: ANIMATION.entry,
} as const;

const DROP_OVERLAY_ACCENT_ANIMATION = {
    initial: { scale: 0.96, opacity: 0.4 },
    animate: { scale: 1, opacity: 0.8 },
    exit: { opacity: 0 },
    transition: {
        ...ANIMATION.spring,
        repeat: Infinity,
        repeatType: "reverse" as const,
    },
} as const;

const FULLSCREEN_PANEL_ANIMATION = {
    initial: {
        opacity: DETAILS_TOOLTIP_OPACITY_ANIMATION.initial.opacity,
        scale: 0.96,
    },
    animate: {
        opacity: DETAILS_TOOLTIP_OPACITY_ANIMATION.animate.opacity,
        scale: 1,
    },
    exit: {
        opacity: DETAILS_TOOLTIP_OPACITY_ANIMATION.exit.opacity,
        scale: 0.96,
    },
    transition: { duration: 0.25 },
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
                DASHBOARD_LAYOUT_CLASS.root,
            ),
            // NOTE: surfaceStyle removed here — workbench PanelGroup is the single surface owner.
        };
    };

    const getContentStyles = () => ({
        className: cn(
            DASHBOARD_LAYOUT_CLASS.content,
            !isImmersiveShell && DASHBOARD_LAYOUT_CLASS.contentClassicSurface,
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
                    className={DASHBOARD_LAYOUT_CLASS.dropOverlay}
                    {...OVERLAY_FADE_ANIMATION}
                >
                    <motion.div
                        className={DASHBOARD_LAYOUT_CLASS.dropOverlayAccent}
                        // affordance only — do not apply surfaceStyle here; parent surface is workbench
                        {...DROP_OVERLAY_ACCENT_ANIMATION}
                    />
                    <div className={cn(DASHBOARD_LAYOUT_CLASS.dropOverlayIconWrap, DROP_OVERLAY_ROLE)}>
                        <StatusIcon
                            Icon={FileUp}
                            size="xl"
                            strokeWidth={ICON_STROKE_WIDTH}
                            className={DASHBOARD_LAYOUT_CLASS.dropOverlayIconTone}
                        />
                        <span className={DROP_OVERLAY_TITLE_ROLE}>
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
            className={DASHBOARD_LAYOUT_CLASS.panelGroup}
            style={shell.surfaceStyle}
        >
            {/* --- MAIN PANEL --- */}
            <Panel className={DASHBOARD_LAYOUT_CLASS.mainPanel}>
                <div {...getShellStyles()} onPointerDown={focusTable}>
                    <div {...getContentStyles()}>
                        <div
                            className={DASHBOARD_LAYOUT_CLASS.tableHost}
                            style={{
                                borderRadius: `${shell.innerRadius}px`,
                            }}
                        >
                            {tableWatermarkEnabled && (
                                <div
                                    aria-hidden="true"
                                    className={DASHBOARD_LAYOUT_CLASS.tableWatermark}
                                />
                            )}
                            <div
                                className={DASHBOARD_LAYOUT_CLASS.tableContent}
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
                className={buildDashboardResizeHandleClass(isHorizontalSplit)}
                hitAreaMargins={{
                    coarse: shell.handleHitArea,
                    fine: shell.handleHitArea,
                }}
                style={{
                    // Use CSS-driven semantic gap (no new numeric literals)
                    flexBasis: "var(--tt-gap)",
                }}
            >
                <div className={DASHBOARD_LAYOUT_CLASS.resizeHandleInner}>
                    <div
                        className={DASHBOARD_LAYOUT_CLASS.resizeHandleBar}
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
                className={buildDashboardInspectorPanelClass(isHorizontalSplit)}
            >
                <div {...getShellStyles()}>
                    <div {...getContentStyles()}>
                        <div
                            className={DASHBOARD_LAYOUT_CLASS.inspectorContent}
                            style={{
                                borderRadius: `${shell.innerRadius}px`,
                            }}
                        >
                            <motion.div
                                className={DASHBOARD_LAYOUT_CLASS.inspectorContent}
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
        <Section className={DASHBOARD_LAYOUT_CLASS.section}>
            {layoutContent}
            {/* --- FULLSCREEN MODAL --- */}
            <AnimatePresence initial={false}>
                {detailData && isDetailFullscreenActive && (
                    <motion.div
                        key={`fullscreen-detail-${detailData.id}`}
                        className={DASHBOARD_LAYOUT_CLASS.fullscreenOverlay}
                        {...OVERLAY_FADE_ANIMATION}
                        transition={{ duration: 0.25 }}
                    >
                        <Section
                            padding="stage"
                            className={DASHBOARD_LAYOUT_CLASS.fullscreenSection}
                        >
                            <div className={DASHBOARD_LAYOUT_CLASS.fullscreenBackdrop} />
                            <motion.div
                                className={DASHBOARD_LAYOUT_CLASS.fullscreenPanel}
                                style={{ borderRadius: `${shell.radius}px` }}
                                {...FULLSCREEN_PANEL_ANIMATION}
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
