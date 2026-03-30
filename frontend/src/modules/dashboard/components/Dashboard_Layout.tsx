import { AnimatePresence, motion } from "framer-motion";
import { FileUp } from "lucide-react";
import { cn } from "@heroui/react";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFocusState } from "@/app/context/AppShellStateContext";

import { TorrentTable } from "@/modules/dashboard/components/TorrentTable";
import { TorrentDetails } from "@/modules/dashboard/components/TorrentDetails";
import { DetailOpenProvider, type DetailOpenMode } from "@/modules/dashboard/context/DetailOpenContext";
import { registry } from "@/config/logic";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { Section } from "@/shared/ui/layout/Section";
import { dashBoard } from "@/shared/ui/layout/glass-surface";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { DashboardViewModel } from "@/app/viewModels/useAppViewModel";
import { isEditableKeyboardTarget } from "@/shared/utils/dom";
const { layout, shell, visuals, visualizations, ui } = registry;

const fadeBase = visualizations.surface.fade.base;
interface DashboardLayoutProps {
    viewModel: DashboardViewModel;
}

type RequestedDetailPresentation = DetailOpenMode;

export function Dashboard_Layout({ viewModel }: DashboardLayoutProps) {
    const { workspaceStyle, table, detail, detailSplitDirection } = viewModel;
    const { tableWatermarkEnabled, isDropActive = false } = table;
    const { detailData, handleRequestDetails, closeDetail } = detail;
    const { t } = useTranslation();
    const { activePart, setActivePart } = useFocusState();

    const isImmersiveShell = workspaceStyle === "immersive";

    const shellTokens = shell.getTokens(workspaceStyle);

    const splitDirection = detailSplitDirection ?? "vertical";
    const isHorizontalSplit = splitDirection === "horizontal";
    const detailPanelRef = useRef<ImperativePanelHandle | null>(null);
    const focusReturnRef = useRef<string | null>(null);
    const [requestedDetailPresentation, setRequestedDetailPresentation] =
        useState<RequestedDetailPresentation>("docked");
    const [isViewportForcedFullscreen, setIsViewportForcedFullscreen] = useState(false);
    const isDetailOpen = Boolean(detailData);
    const inspectorBreakpointPx = layout.details.inspectorBreakpointPx;
    const effectiveDetailPresentation: RequestedDetailPresentation = isDetailOpen
        ? isViewportForcedFullscreen
            ? "fullscreen"
            : requestedDetailPresentation
        : requestedDetailPresentation;
    const isDetailFullscreenActive = isDetailOpen && effectiveDetailPresentation === "fullscreen";
    const isDockedInspectorActive = isDetailOpen && effectiveDetailPresentation === "docked";
    const showDockedInspectorShell = !isViewportForcedFullscreen;
    const canShowPresentationToggle = !isViewportForcedFullscreen;
    const shouldRestoreInspectorFocus = isDetailOpen && activePart === "inspector";

    const focusTable = useCallback(() => setActivePart("table"), [setActivePart]);
    const focusInspector = useCallback(() => setActivePart("inspector"), [setActivePart]);

    const handleDetailOpen = useCallback(
        (torrent: Torrent, mode: DetailOpenMode) => {
            focusReturnRef.current = torrent.id;
            setActivePart("inspector");
            setRequestedDetailPresentation(mode);
            void handleRequestDetails(torrent);
        },
        [handleRequestDetails, setActivePart],
    );

    const handleDetailClose = useCallback(() => {
        setRequestedDetailPresentation("docked");
        setActivePart("table");
        closeDetail();
    }, [closeDetail, setActivePart]);

    const handleDetailDock = useCallback(() => {
        setRequestedDetailPresentation("docked");
        setActivePart("inspector");
    }, [setActivePart]);

    const handleDetailPopout = useCallback(() => {
        setRequestedDetailPresentation("fullscreen");
        setActivePart("inspector");
    }, [setActivePart]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }
        const query = `(max-width: ${Math.max(inspectorBreakpointPx - 0.02, 0)}px)`;
        const mediaQuery = window.matchMedia(query);
        const syncViewportMode = () => {
            setIsViewportForcedFullscreen(mediaQuery.matches);
        };
        syncViewportMode();
        mediaQuery.addEventListener("change", syncViewportMode);
        return () => mediaQuery.removeEventListener("change", syncViewportMode);
    }, [inspectorBreakpointPx]);

    useEffect(() => {
        if (!detailPanelRef.current) return;
        if (isDockedInspectorActive) {
            detailPanelRef.current.expand();
        } else {
            detailPanelRef.current.collapse();
        }
    }, [isDockedInspectorActive]);

    useEffect(() => {
        if (isDetailOpen || typeof document === "undefined") return;
        const pendingId = focusReturnRef.current;
        if (!pendingId) return;
        const rowElement = document.querySelector<HTMLElement>(`[data-torrent-row="${pendingId}"]`);
        rowElement?.focus();
        focusReturnRef.current = null;
    }, [isDetailOpen]);

    useEffect(() => {
        if (!isDetailOpen) return;
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            if (isEditableKeyboardTarget(event.target)) return;
            event.preventDefault();
            handleDetailClose();
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [isDetailOpen, handleDetailClose]);

    useEffect(() => {
        if (!shouldRestoreInspectorFocus || typeof document === "undefined") {
            return;
        }
        const handle = window.requestAnimationFrame(() => {
            document.querySelector<HTMLElement>("[data-detail-host='true']")?.focus();
        });
        return () => window.cancelAnimationFrame(handle);
    }, [effectiveDetailPresentation, shouldRestoreInspectorFocus]);

    // --- GEOMETRY HELPERS ---

    const getShellStyles = () => {
        return {
            // Always include a subtle top border to prevent jump when focus highlight appears
            className: cn(dashBoard.root),
            // NOTE: surfaceStyle removed here — workbench PanelGroup is the single surface owner.
        };
    };

    const getContentStyles = () => ({
        className: cn(dashBoard.content, !isImmersiveShell && dashBoard.contentClassicSurface),
        style: isImmersiveShell
            ? undefined
            : {
                  // Padding remains (geometry token); surfaceStyle removed — parent owns surface.
                  padding: `${shellTokens.gap}px`,
              },
    });

    const dropOverlay = (
        <AnimatePresence>
            {isDropActive && (
                <motion.div className={dashBoard.dropOverlay} {...fadeBase}>
                    <motion.div
                        className={dashBoard.dropOverlayAccent}
                        // affordance only — do not apply surfaceStyle here; parent surface is workbench
                        {...visualizations.surface.accent.pulse}
                    />
                    <div className={cn(dashBoard.dropOverlayIconWrap, ui.dropOverlay.role)}>
                        <StatusIcon
                            Icon={FileUp}
                            size="xl"
                            strokeWidth={visuals.icon.strokeWidth}
                            className={dashBoard.dropOverlayIconTone}
                        />
                        <span className={ui.dropOverlay.titleRole}>{t("drop_overlay.title")}</span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    const layoutContent = (
        <PanelGroup
            direction={splitDirection}
            autoSaveId="tiny-torrent.workbench.layout"
            className={dashBoard.panelGroup}
            style={shellTokens.surfaceStyle}
        >
            {/* --- MAIN PANEL --- */}
            <Panel className={dashBoard.mainPanel}>
                <div {...getShellStyles()} onPointerDown={focusTable}>
                    <div {...getContentStyles()}>
                        <div
                            className={dashBoard.tableHost}
                            style={{
                                borderRadius: `${shellTokens.innerRadius}px`,
                            }}
                        >
                            <div className={dashBoard.tableContent} style={{ borderRadius: "inherit" }}>
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

            {showDockedInspectorShell && (
                <>
                    {/* --- RESIZE HANDLE (The Gap) --- */}
                    <PanelResizeHandle
                        className={cn(
                            dashBoard.resizeHandleBase,
                            isHorizontalSplit ? dashBoard.resizeHandleHorizontal : dashBoard.resizeHandleVertical,
                            !isDetailOpen && "pointer-events-none opacity-0",
                        )}
                        hitAreaMargins={{
                            coarse: shellTokens.handleHitArea,
                            fine: shellTokens.handleHitArea,
                        }}
                        style={{
                            flexBasis: isDetailOpen ? "var(--tt-gap)" : "0px",
                        }}
                    >
                        <div className={dashBoard.resizeHandleInner}>
                            <div
                                className={dashBoard.resizeHandleBar}
                                style={
                                    isHorizontalSplit
                                        ? {
                                              width: `${ui.resizeHandle.minVisualWidth}px`,
                                              height: "100%",
                                          }
                                        : {
                                              height: `${ui.resizeHandle.minVisualWidth}px`,
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
                            dashBoard.inspectorPanelBase,
                            isHorizontalSplit ? dashBoard.inspectorPanelHorizontal : dashBoard.inspectorPanelVertical,
                        )}
                    >
                        <div {...getShellStyles()}>
                            <div {...getContentStyles()}>
                                {isDockedInspectorActive ? (
                                    <div
                                        className={dashBoard.inspectorContent}
                                        style={{
                                            borderRadius: `${shellTokens.innerRadius}px`,
                                        }}
                                    >
                                        <motion.div
                                            className={dashBoard.inspectorContent}
                                            initial={false}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={fadeBase.transition}
                                        >
                                            <TorrentDetails
                                                viewModel={detail}
                                                isDetailFullscreen={false}
                                                onPopout={canShowPresentationToggle ? handleDetailPopout : undefined}
                                                onClose={handleDetailClose}
                                            />
                                        </motion.div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </Panel>
                </>
            )}
        </PanelGroup>
    );

    const fullscreenPadding = isViewportForcedFullscreen ? "none" : "stage";
    const fullscreenRadius = isViewportForcedFullscreen ? 0 : shellTokens.radius;
    const fullscreenCloseOnly = isViewportForcedFullscreen;

    return (
        <Section className={dashBoard.section}>
            {tableWatermarkEnabled && <div aria-hidden="true" className={dashBoard.desktopWatermark} />}
            {layoutContent}
            {/* --- FULLSCREEN modal --- */}
            <AnimatePresence initial={false}>
                {detailData && isDetailFullscreenActive && (
                    <motion.div
                        key={`fullscreen-detail-${detailData.id}`}
                        className={dashBoard.fullscreenOverlay}
                        {...fadeBase}
                        transition={{ duration: 0.25 }}
                    >
                        <Section padding={fullscreenPadding} className={dashBoard.fullscreenSection}>
                            <div className={dashBoard.fullscreenBackdrop} />
                            <motion.div
                                className={dashBoard.fullscreenPanel}
                                style={{ borderRadius: fullscreenRadius }}
                                {...visualizations.surface.fade.fullscreenPanel}
                            >
                                <TorrentDetails
                                    viewModel={detail}
                                    isDetailFullscreen={isDetailFullscreenActive}
                                    isStandalone={true}
                                    onDock={fullscreenCloseOnly ? undefined : handleDetailDock}
                                    onPopout={undefined}
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
