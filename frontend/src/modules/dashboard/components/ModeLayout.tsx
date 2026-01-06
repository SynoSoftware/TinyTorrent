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
import { useFocusState } from "@/app/context/FocusContext";

import { TorrentTable } from "./TorrentTable";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import { TorrentDetailView } from "./TorrentDetailView";
import type {
    DetailTab,
    PeerSortStrategy,
} from "@/modules/dashboard/types/torrentDetail";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import {
    ICON_STROKE_WIDTH,
    getShellTokens,
    MIN_HANDLE_VISUAL_WIDTH,
} from "@/config/logic";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import type { CapabilityStore } from "@/app/types/capabilities";
import type { WorkspaceStyle } from "@/app/hooks/useWorkspaceShell";
import type { TorrentPeerEntity } from "@/services/rpc/entities";
import type {
    FileExplorerContextAction,
    FileExplorerEntry,
} from "@/shared/ui/workspace/FileExplorerTree";
import type { PeerContextAction } from "./details/tabs/PeersTab";

const ANIMATION = {
    spring: {
        type: "spring",
        stiffness: 240,
        damping: 26,
    } as Transition,
    entry: { duration: 0.2 },
} as const;

interface ModeLayoutProps {
    workspaceStyle: WorkspaceStyle;
    torrents: Torrent[];
    filter: string;
    searchQuery: string;
    isTableLoading: boolean;
    detailSplitDirection?: "horizontal" | "vertical";
    onAction?: (action: TorrentTableAction, torrent: Torrent) => void;
    onRequestDetails?: (torrent: Torrent) => void;
    onSelectionChange?: (selection: Torrent[]) => void;
    onActiveRowChange?: (torrent: Torrent | null) => void;
    detailData: TorrentDetail | null;
    onCloseDetail: () => void;
    onFilesToggle?: (
        indexes: number[],
        wanted: boolean
    ) => Promise<void> | void;
    ghostTorrents?: Torrent[];
    onOpenFolder?: (torrent: Torrent) => Promise<void>;
    onFileContextAction?: (
        action: FileExplorerContextAction,
        entry: FileExplorerEntry
    ) => void;
    onPeerContextAction?: (
        action: PeerContextAction,
        peer: TorrentPeerEntity
    ) => void;
    onSequentialToggle?: (enabled: boolean) => Promise<void> | void;
    onSuperSeedingToggle?: (enabled: boolean) => Promise<void> | void;
    onForceTrackerReannounce?: () => Promise<void> | void;
    onSetLocation?: (torrent: TorrentDetail) => Promise<void> | void;
    onRedownload?: (torrent: TorrentDetail) => Promise<void> | void;
    onRetry?: (torrent: TorrentDetail) => Promise<void> | void;
    capabilities: CapabilityStore;
    optimisticStatuses?: OptimisticStatusMap;
    peerSortStrategy?: PeerSortStrategy;
    inspectorTabCommand?: DetailTab | null;
    onInspectorTabCommandHandled?: () => void;
    isDropActive?: boolean;
    tableWatermarkEnabled?: boolean;
}

export function ModeLayout({
    workspaceStyle,
    torrents,
    filter,
    searchQuery,
    isTableLoading,
    onAction,
    onRequestDetails,
    detailData,
    onCloseDetail,
    onFilesToggle,
    ghostTorrents,
    onFileContextAction,
    onPeerContextAction,
    onSequentialToggle,
    onSuperSeedingToggle,
    onForceTrackerReannounce,
    onSetLocation,
    onRedownload,
    onRetry,
    onOpenFolder,
    capabilities,
    optimisticStatuses,
    peerSortStrategy,
    inspectorTabCommand,
    onInspectorTabCommandHandled,
    onSelectionChange,
    onActiveRowChange,
    isDropActive = false,
    detailSplitDirection = "vertical",
    tableWatermarkEnabled = true,
}: ModeLayoutProps) {
    const { t } = useTranslation();
    const { activePart, setActivePart } = useFocusState();

    const isImmersiveShell = workspaceStyle === "immersive";

    const shell = getShellTokens(workspaceStyle);

    const splitDirection = detailSplitDirection;
    const isHorizontalSplit = splitDirection === "horizontal";
    const detailPanelRef = useRef<ImperativePanelHandle | null>(null);
    const focusReturnRef = useRef<string | null>(null);
    const [isDetailFullscreen, setIsDetailFullscreen] = useState(false);
    const isDetailOpen = Boolean(detailData);

    const focusTable = useCallback(
        () => setActivePart("table"),
        [setActivePart]
    );
    const focusInspector = useCallback(
        () => setActivePart("inspector"),
        [setActivePart]
    );

    const handleDetailRequest = useCallback(
        (torrent: Torrent) => {
            focusReturnRef.current = torrent.id;
            setActivePart("inspector");
            setIsDetailFullscreen(false);
            onRequestDetails?.(torrent);
        },
        [onRequestDetails, setActivePart]
    );

    const handleDetailFullscreenRequest = useCallback(
        (torrent: Torrent) => {
            focusReturnRef.current = torrent.id;
            setActivePart("inspector");
            setIsDetailFullscreen(true);
            onRequestDetails?.(torrent);
        },
        [onRequestDetails, setActivePart]
    );

    const handleDetailClose = useCallback(() => {
        setIsDetailFullscreen(false);
        setActivePart("table");
        onCloseDetail();
    }, [onCloseDetail, setActivePart]);

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
        if (isDetailOpen && !isDetailFullscreen) {
            detailPanelRef.current.expand();
        } else {
            detailPanelRef.current.collapse();
        }
    }, [isDetailOpen, isDetailFullscreen]);

    useEffect(() => {
        if (isDetailOpen || typeof document === "undefined") return;
        const pendingId = focusReturnRef.current;
        if (!pendingId) return;
        const rowElement = document.querySelector<HTMLElement>(
            `[data-torrent-row="${pendingId}"]`
        );
        rowElement?.focus();
        focusReturnRef.current = null;
    }, [isDetailOpen]);

    useEffect(() => {
        if (detailData) return;
        setIsDetailFullscreen(false);
    }, [detailData]);

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

    const getShellStyles = (partName: "table" | "inspector") => {
        const isActive = activePart === partName;
        return {
            // Always include a subtle top border to prevent jump when focus highlight appears
            className: cn(
                "relative h-full w-full flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden transition-all duration-200",
                "border-t border-default/10",
                // remove active top-border color so the main container does not
                // gain a green focus line; keep a subtle neutral divider instead.
                "bg-transparent"
            ),
            // NOTE: surfaceStyle removed here — workbench PanelGroup is the single surface owner.
        };
    };

    const getContentStyles = () => ({
        className: cn(
            "relative flex-1 min-h-0 w-full h-full overflow-hidden",
            !isImmersiveShell && "bg-background/40"
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
                "flex-1 min-h-0 h-full w-full relative overflow-hidden  rounded-2xl"
            )}
            style={shell.surfaceStyle}
        >
            {/* --- MAIN PANEL --- */}
            <Panel className="relative flex-1 min-h-0 shadow-medium">
                <div {...getShellStyles("table")} onPointerDown={focusTable}>
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
                                <TorrentTable
                                    embedded={isImmersiveShell}
                                    torrents={torrents}
                                    filter={filter}
                                    searchQuery={searchQuery}
                                    isLoading={isTableLoading}
                                    onAction={onAction}
                                    onRequestDetails={handleDetailRequest}
                                    onRequestDetailsFullscreen={
                                        handleDetailFullscreenRequest
                                    }
                                    onSelectionChange={onSelectionChange}
                                    onActiveRowChange={onActiveRowChange}
                                    optimisticStatuses={optimisticStatuses}
                                    ghostTorrents={ghostTorrents}
                                    onOpenFolder={onOpenFolder}
                                />
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
                        : "cursor-row-resize"
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
                            "transition-colors bg-foreground/0 group-hover:bg-foreground/10 group-active:bg-primary/50"
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
                    isHorizontalSplit ? "h-full" : "w-full"
                )}
            >
                <div {...getShellStyles("inspector")}>
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
                                <TorrentDetailView
                                    torrent={detailData}
                                    onClose={handleDetailClose}
                                    onFilesToggle={onFilesToggle}
                                    onFileContextAction={onFileContextAction}
                                    onPeerContextAction={onPeerContextAction}
                                    peerSortStrategy={peerSortStrategy}
                                    inspectorTabCommand={inspectorTabCommand}
                                    onInspectorTabCommandHandled={
                                        onInspectorTabCommandHandled
                                    }
                                    onSequentialToggle={onSequentialToggle}
                                    onSuperSeedingToggle={onSuperSeedingToggle}
                                    onForceTrackerReannounce={
                                        onForceTrackerReannounce
                                    }
                                    onSetLocation={onSetLocation}
                                    onRedownload={onRedownload}
                                    onRetry={onRetry}
                                    capabilities={capabilities}
                                    isDetailFullscreen={false}
                                    onDock={handleDetailDock}
                                    onPopout={handleDetailPopout}
                                />
                            </motion.div>
                        </div>
                    </div>
                </div>
            </Panel>
        </PanelGroup>
    );

    return (
        <div className="flex-1 min-h-0 h-full">
            {layoutContent}
            {/* --- FULLSCREEN MODAL --- */}
            <AnimatePresence initial={false}>
                {detailData && isDetailFullscreen && (
                    <motion.div
                        key={`fullscreen-detail-${detailData.id}`}
                        className="fixed inset-0 z-40 flex items-center justify-center p-stage"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                    >
                        <div className="absolute inset-0 pointer-events-none bg-background/60 backdrop-blur-sm" />
                        <motion.div
                            className={cn(
                                "relative z-10 flex h-full w-full flex-col overflow-hidden bg-content1/80 backdrop-blur-xl border border-content1/20 shadow-medium"
                            )}
                            style={{ borderRadius: `${shell.radius}px` }}
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={{ duration: 0.25 }}
                        >
                                <TorrentDetailView
                                    torrent={detailData}
                                    onClose={handleDetailClose}
                                    onFilesToggle={onFilesToggle}
                                    onFileContextAction={onFileContextAction}
                                    onPeerContextAction={onPeerContextAction}
                                    peerSortStrategy={peerSortStrategy}
                                    inspectorTabCommand={inspectorTabCommand}
                                    onInspectorTabCommandHandled={
                                        onInspectorTabCommandHandled
                                    }
                                    onSequentialToggle={onSequentialToggle}
                                    onSuperSeedingToggle={onSuperSeedingToggle}
                                    onForceTrackerReannounce={
                                        onForceTrackerReannounce
                                    }
                                    onSetLocation={onSetLocation}
                                    onRedownload={onRedownload}
                                    onRetry={onRetry}
                                    capabilities={capabilities}
                                isDetailFullscreen={isDetailFullscreen}
                                isStandalone={true}
                                onDock={handleDetailDock}
                                onPopout={handleDetailPopout}
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
