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
import { ICON_STROKE_WIDTH } from "../../../config/logic";
import type { TorrentPeerEntity } from "../../../services/rpc/entities";
import type {
    FileExplorerContextAction,
    FileExplorerEntry,
} from "../../../shared/ui/workspace/FileExplorerTree";
import type { PeerContextAction } from "./details/tabs/PeersTab";

const DROP_BORDER_TRANSITION: Transition = {
    type: "spring",
    stiffness: 240,
    damping: 26,
    repeat: Infinity,
    repeatType: "reverse",
};

const DETAIL_PANEL_LAYOUT_ID = "tiny-torrent.detail-panel.layout";

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
}: ModeLayoutProps) {
    const { t } = useTranslation();
    const { activePart, setActivePart } = useFocusState();
    const splitDirection = detailSplitDirection;
    const isHorizontalSplit = splitDirection === "horizontal";
    const detailPanelMinSize = isHorizontalSplit ? 22 : 26;
    const detailPanelDefaultSize = isHorizontalSplit ? 34 : 34;
    const detailPanelRef = useRef<ImperativePanelHandle | null>(null);
    const focusReturnRef = useRef<string | null>(null);
    const [isDetailFullscreen, setIsDetailFullscreen] = useState(false);

    const isDetailOpen = Boolean(detailData);
    const tableFocused = activePart === "table";
    const inspectorFocused = activePart === "inspector";
    const focusTable = useCallback(() => setActivePart("table"), [setActivePart]);
    const focusInspector = useCallback(() => setActivePart("inspector"), [
        setActivePart,
    ]);
    const tableRegionClass = cn(
        "absolute inset-0 pb-2 rounded-2xl transition-colors duration-200 overflow-hidden",
        tableFocused
            ? "border border-primary/30 ring-1 ring-primary/20"
            : "border border-content1/10"
    );

    const handleDetailRequest = useCallback(
        (torrent: Torrent) => {
            focusReturnRef.current = torrent.id;
            setActivePart("inspector");
            setIsDetailFullscreen(false);
            onRequestDetails?.(torrent);
        },
        [onRequestDetails, setActivePart, setIsDetailFullscreen]
    );

    const handleDetailFullscreenRequest = useCallback(
        (torrent: Torrent) => {
            focusReturnRef.current = torrent.id;
            setActivePart("inspector");
            setIsDetailFullscreen(true);
            onRequestDetails?.(torrent);
        },
        [onRequestDetails, setActivePart, setIsDetailFullscreen]
    );

    const handleDetailClose = useCallback(() => {
        setIsDetailFullscreen(false);
        setActivePart("table");
        onCloseDetail();
    }, [onCloseDetail, setActivePart, setIsDetailFullscreen]);
    const handleDetailDock = useCallback(() => {
        setIsDetailFullscreen(false);
        setActivePart("inspector");
    }, [setActivePart, setIsDetailFullscreen]);
    const handleDetailPopout = useCallback(() => {
        setIsDetailFullscreen(true);
        setActivePart("inspector");
    }, [setActivePart, setIsDetailFullscreen]);
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
        if (isDetailOpen) return;
        if (typeof document === "undefined") return;
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
        return () => {
            window.removeEventListener("keydown", handleEscape);
        };
    }, [isDetailOpen, handleDetailClose]);

    const dropOverlay = (
        <AnimatePresence>
            {isDropActive && (
                <motion.div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center z-50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <motion.div
                        className="absolute inset-2 rounded-[34px] border border-primary/60"
                        initial={{ scale: 0.96, opacity: 0.4 }}
                        animate={{ scale: 1, opacity: 0.8 }}
                        exit={{ opacity: 0 }}
                        transition={DROP_BORDER_TRANSITION}
                    />
                    <motion.div
                        className="absolute inset-6 rounded-[30px] border border-primary/30 opacity-60"
                        initial={{ scale: 1.03, opacity: 0.3 }}
                        animate={{ scale: 1, opacity: 0.65 }}
                        exit={{ opacity: 0 }}
                        transition={{
                            ...DROP_BORDER_TRANSITION,
                            stiffness: 200,
                        }}
                    />
                    <div className="relative z-10 flex flex-col items-center gap-2 rounded-2xl border border-primary/30 bg-background/90 px-6 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-foreground/70 shadow-lg">
                        <FileUp
                            size={28}
                            strokeWidth={ICON_STROKE_WIDTH}
                            className="text-primary"
                        />
                        <span className="text-sm font-semibold text-foreground">
                            {t("drop_overlay.title")}
                        </span>
                        <span className="text-[10px] tracking-[0.45em] text-foreground/50">
                            {t("drop_overlay.subtitle")}
                        </span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    const panelGroupClass = cn(
        "flex-1 min-h-0 h-full w-full",
        "relative flex flex-col overflow-hidden"
    );
    const detailPanelClass = cn(
        "glass-panel inspector-shell hidden flex-col overflow-hidden rounded-2xl transition-colors lg:flex z-20",
        inspectorFocused
            ? "border border-primary/30 ring-1 ring-primary/20"
            : "border border-content1/20",
        {
            "lg:w-[360px] lg:max-w-[440px] h-full": isHorizontalSplit,
            "lg:h-[360px] lg:max-h-[440px] w-full": !isHorizontalSplit,
        }
    );
    const handleClass = cn(
        "group relative z-10 transition-colors",
        isHorizontalSplit
            ? "h-full w-4 cursor-col-resize"
            : "w-full h-4 cursor-row-resize"
    );

    return (
        <div className="flex-1 min-h-0 h-full">
            <PanelGroup
                direction={splitDirection}
                autoSaveId={DETAIL_PANEL_LAYOUT_ID}
                className={panelGroupClass}
            >
                <Panel className="relative flex-1 min-h-0">
                    <div className={tableRegionClass} onPointerDown={focusTable}>
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
                        {dropOverlay}
                    </div>
                </Panel>
                <PanelResizeHandle
                    className={handleClass}
                    hitAreaMargins={{ coarse: 20, fine: 6 }}
                >
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span
                            className={cn(
                                isHorizontalSplit
                                    ? "h-full w-[1px]"
                                    : "w-full h-[1px]",
                                "bg-foreground/10 transition-colors group-hover:bg-foreground/30"
                            )}
                        />
                    </span>
                </PanelResizeHandle>
                <Panel
                    ref={detailPanelRef}
                    collapsible
                    collapsedSize={0}
                    minSize={detailPanelMinSize}
                    defaultSize={detailPanelDefaultSize}
                    onPointerDown={focusInspector}
                    className={detailPanelClass}
                >
                    <motion.div
                        className="h-full min-h-0 flex-1"
                        initial={false}
                        animate={
                            isDetailOpen
                                ? { opacity: 1, y: 0 }
                                : { opacity: 0.75, y: 6 }
                        }
                        transition={{ duration: 0.2 }}
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
                            isFullscreen={isDetailFullscreen}
                            onPopout={handleDetailPopout}
                        />
                    </motion.div>
                </Panel>
            </PanelGroup>
            <AnimatePresence initial={false}>
                {detailData && isDetailFullscreen && (
                    <motion.div
                        key={`fullscreen-detail-${detailData.id}`}
                        className="fixed inset-0 z-40 flex items-center justify-center p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                    >
                        <div className="absolute inset-0 pointer-events-none bg-background/90 backdrop-blur-3xl" />
                        <motion.div
                            className="relative z-10 flex h-full w-full max-h-[calc(100vh-2rem)] max-w-[1100px] flex-col overflow-hidden rounded-[32px] border border-content1/20 bg-background/60 shadow-[0_40px_100px_rgba(0,0,0,0.55)] backdrop-blur-3xl"
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
