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
import { useFocusState } from "../../../app/context/FocusContext";

import {
    TorrentTable,
    type TorrentTableAction,
    type OptimisticStatusMap,
} from "./TorrentTable";
import {
    TorrentDetailView,
    type DetailTab,
    type PeerSortStrategy,
} from "./TorrentDetailView";
import type { Torrent, TorrentDetail } from "../types/torrent";
import {
    ICON_STROKE_WIDTH,
    SHELL_CONTENT_STYLE,
    SHELL_FRAME_STYLE,
    SHELL_GAP,
    SHELL_HANDLE_HIT_AREA,
    SHELL_INNER_RADIUS,
    SHELL_RADIUS,
    SHELL_RING_PADDING,
} from "../../../config/logic";
import type { TorrentPeerEntity } from "../../../services/rpc/entities";
import type {
    FileExplorerContextAction,
    FileExplorerEntry,
} from "../../../shared/ui/workspace/FileExplorerTree";
import type { PeerContextAction } from "./details/tabs/PeersTab";
import { GLASS_BLOCK_SURFACE } from "../../../shared/ui/layout/glass-surface";

/**
 * LAYOUT METRICS SYSTEM
 * ----------------------------------------------------------------------
 * Values for the shared shell geometry are sourced from the centralized
 * `LAYOUT_METRICS` configuration so every panel aligns with the same gap,
 * radius, and ring padding.
 */
const METRICS = {
    gap: SHELL_GAP,
    radius: SHELL_RADIUS,
    ringPadding: SHELL_RING_PADDING,
    handleHitArea: SHELL_HANDLE_HIT_AREA,
} as const;

/**
 * Computed geometry for the inner container so it nests perfectly
 * inside the outer container without looking "off-center".
 */
const COMPUTED = {
    innerRadius: SHELL_INNER_RADIUS,
    handleSize: METRICS.gap,
} as const;

const ANIMATION = {
    spring: {
        type: "spring",
        stiffness: 240,
        damping: 26,
    } as Transition,
    entry: { duration: 0.2 },
} as const;

interface ModeLayoutProps {
    torrents: Torrent[];
    filter: string;
    searchQuery: string;
    isTableLoading: boolean;
    detailSplitDirection?: "horizontal" | "vertical";
    onAction?: (action: TorrentTableAction, torrent: Torrent) => void;
    onRequestDetails?: (torrent: Torrent) => void;
    onSelectionChange?: (selection: Torrent[]) => void;
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
    sequentialSupported?: boolean;
    superSeedingSupported?: boolean;
    optimisticStatuses?: OptimisticStatusMap;
    peerSortStrategy?: PeerSortStrategy;
    inspectorTabCommand?: DetailTab | null;
    onInspectorTabCommandHandled?: () => void;
    isDropActive?: boolean;
    tableWatermarkEnabled?: boolean;
}

export function ModeLayout({
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
    onOpenFolder,
    sequentialSupported,
    superSeedingSupported,
    optimisticStatuses,
    peerSortStrategy,
    inspectorTabCommand,
    onInspectorTabCommandHandled,
    onSelectionChange,
    isDropActive = false,
    detailSplitDirection = "vertical",
    tableWatermarkEnabled = true,
}: ModeLayoutProps) {
    const { t } = useTranslation();
    const { activePart, setActivePart } = useFocusState();

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
        if (detailData) return;
        setIsDetailFullscreen(false);
    }, [detailData]);

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
            className: cn(
                "relative h-full transition-all duration-200 border flex flex-col box-border min-w-0 min-h-0",
                GLASS_BLOCK_SURFACE,
                isActive
                    ? "border-primary/30 ring-1 ring-primary/20 z-20"
                    : "border-content1/10 z-10"
            ),
            style: SHELL_FRAME_STYLE,
        };
    };

    const getContentStyles = () => ({
        className:
            "relative flex-1 min-h-0 w-full h-full overflow-hidden bg-background/40",
        style: {
            ...SHELL_CONTENT_STYLE,
            padding: `${METRICS.gap}px`,
        },
    });

    const dropOverlay = (
        <AnimatePresence>
            {isDropActive && (
                <motion.div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center z-50"
                    style={SHELL_CONTENT_STYLE}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={ANIMATION.entry}
                >
                    <motion.div
                        className="absolute inset-2 border border-primary/60"
                        style={SHELL_CONTENT_STYLE}
                        initial={{ scale: 0.96, opacity: 0.4 }}
                        animate={{ scale: 1, opacity: 0.8 }}
                        exit={{ opacity: 0 }}
                        transition={{
                            ...ANIMATION.spring,
                            repeat: Infinity,
                            repeatType: "reverse",
                        }}
                    />
                    <div className="relative z-10 flex flex-col items-center gap-2 rounded-2xl border border-primary/30 bg-background/90 px-6 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-foreground/70 shadow-lg backdrop-blur-md">
                        <FileUp
                            size={28}
                            strokeWidth={ICON_STROKE_WIDTH}
                            className="text-primary"
                        />
                        <span className="text-sm font-semibold text-foreground">
                            {t("drop_overlay.title")}
                        </span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return (
        <div className="flex-1 min-h-0 h-full">
            <PanelGroup
                direction={splitDirection}
                autoSaveId="tiny-torrent.workbench.layout"
                className="flex-1 min-h-0 h-full w-full relative flex flex-col overflow-hidden"
            >
                {/* --- MAIN PANEL --- */}
                <Panel className="relative flex-1 min-h-0">
                    <div
                        {...getShellStyles("table")}
                        onPointerDown={focusTable}
                    >
                        <div {...getContentStyles()}>
                            <div
                                className="relative z-10 h-full min-h-0 overflow-hidden"
                                style={{
                                    borderRadius: `${SHELL_INNER_RADIUS}px`,
                                }}
                            >
                                {tableWatermarkEnabled && (
                                    <div
                                        aria-hidden="true"
                                        className="pointer-events-none absolute inset-0 z-0 torrent-table-watermark"
                                    />
                                )}
                                <div
                                    className="relative z-10 h-full min-h-0"
                                    style={{ borderRadius: "inherit" }}
                                >
                                    <TorrentTable
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
                        coarse: METRICS.handleHitArea,
                        fine: METRICS.handleHitArea,
                    }}
                    style={{
                        // This strictly defines the visual gap
                        flexBasis: COMPUTED.handleSize,
                    }}
                >
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div
                            className={cn(
                                "transition-colors bg-foreground/0 group-hover:bg-foreground/10 group-active:bg-primary/50",
                                isHorizontalSplit
                                    ? "h-full w-[1px]"
                                    : "w-full h-[1px]"
                            )}
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
                        "hidden overflow-hidden lg:flex",
                        isHorizontalSplit ? "h-full" : "w-full"
                    )}
                >
                    <div {...getShellStyles("inspector")}>
                        <div {...getContentStyles()}>
                            <div
                                className="h-full min-h-0 flex-1 overflow-hidden"
                                style={{
                                    borderRadius: `${SHELL_INNER_RADIUS}px`,
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
                                        onFileContextAction={
                                            onFileContextAction
                                        }
                                        onPeerContextAction={
                                            onPeerContextAction
                                        }
                                        peerSortStrategy={peerSortStrategy}
                                        inspectorTabCommand={
                                            inspectorTabCommand
                                        }
                                        onInspectorTabCommandHandled={
                                            onInspectorTabCommandHandled
                                        }
                                        onSequentialToggle={onSequentialToggle}
                                        onSuperSeedingToggle={
                                            onSuperSeedingToggle
                                        }
                                        onForceTrackerReannounce={
                                            onForceTrackerReannounce
                                        }
                                        sequentialSupported={
                                            sequentialSupported
                                        }
                                        superSeedingSupported={
                                            superSeedingSupported
                                        }
                                        isFullscreen={isDetailFullscreen}
                                        onPopout={handleDetailPopout}
                                    />
                                </motion.div>
                            </div>
                        </div>
                    </div>
                </Panel>
            </PanelGroup>

            {/* --- FULLSCREEN MODAL --- */}
            <AnimatePresence initial={false}>
                {detailData && isDetailFullscreen && (
                    <motion.div
                        key={`fullscreen-detail-${detailData.id}`}
                        className="fixed inset-0 z-40 flex items-center justify-center p-6"
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
                            style={{ borderRadius: METRICS.radius }}
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
                                sequentialSupported={sequentialSupported}
                                superSeedingSupported={superSeedingSupported}
                                isFullscreen
                                onDock={handleDetailDock}
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
