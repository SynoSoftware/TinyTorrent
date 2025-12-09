import { AnimatePresence, motion, type Transition } from "framer-motion";
import { FileUp } from "lucide-react";
import { Modal, ModalContent } from "@heroui/react";
import { useLayoutEffect, useState, useCallback, useEffect, useRef } from "react";
import {
    TorrentTable,
    type TorrentTableAction,
    type OptimisticStatusMap,
} from "./TorrentTable";
import { TorrentDetailView } from "./TorrentDetailView";
import type { Torrent, TorrentDetail } from "../types/torrent";
import { INTERACTION_CONFIG } from "../../../config/interaction";
import type { TorrentStatus } from "../../../services/rpc/entities";
import { ICON_STROKE_WIDTH } from "../../../config/iconography";
import { useTranslation } from "react-i18next";

const { modalBloom } = INTERACTION_CONFIG;
const DROP_BORDER_TRANSITION: Transition = {
    type: "spring",
    stiffness: 240,
    damping: 26,
    repeat: Infinity,
    repeatType: "reverse",
};

interface ModeLayoutProps {
    torrents: Torrent[];
    filter: string;
    isTableLoading: boolean;
    onAction?: (action: TorrentTableAction, torrent: Torrent) => void;
    onRequestDetails?: (torrent: Torrent) => void;
    onSelectionChange?: (selection: Torrent[]) => void;
    detailData: TorrentDetail | null;
    onCloseDetail: () => void;
    onFilesToggle?: (
        indexes: number[],
        wanted: boolean
    ) => Promise<void> | void;
    onSequentialToggle?: (enabled: boolean) => Promise<void> | void;
    onSuperSeedingToggle?: (enabled: boolean) => Promise<void> | void;
    onForceTrackerReannounce?: () => Promise<void> | void;
    sequentialSupported?: boolean;
    superSeedingSupported?: boolean;
    optimisticStatuses?: OptimisticStatusMap;
    isDropActive?: boolean;
}

export function ModeLayout({
    torrents,
    filter,
    isTableLoading,
    onAction,
    onRequestDetails,
    detailData,
    onCloseDetail,
    onFilesToggle,
    onSequentialToggle,
    onSuperSeedingToggle,
    onForceTrackerReannounce,
    sequentialSupported,
    superSeedingSupported,
    optimisticStatuses,
    onSelectionChange,
    isDropActive = false,
}: ModeLayoutProps) {
    const { t } = useTranslation();
    const isDetailOpen = Boolean(detailData);
    const [detailOrigin, setDetailOrigin] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [isDetailPinned, setIsDetailPinned] = useState(false);
    const focusReturnRef = useRef<string | null>(null);

    const handleDetailRequest = useCallback(
        (torrent: Torrent) => {
            focusReturnRef.current = torrent.id;
            onRequestDetails?.(torrent);
        },
        [onRequestDetails]
    );

    const toggleDetailPin = useCallback(
        () => setIsDetailPinned((previous) => !previous),
        []
    );

    const handleDetailClose = useCallback(() => {
        setIsDetailPinned(false);
        onCloseDetail();
    }, [onCloseDetail]);

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

    useLayoutEffect(() => {
        if (
            typeof window === "undefined" ||
            !isDetailOpen ||
            !detailData
        ) {
            setDetailOrigin(null);
            return;
        }

        const selector = `[data-torrent-row="${detailData.id}"]`;
        const rowElement = document.querySelector<HTMLElement>(selector);
        if (!rowElement) {
            setDetailOrigin(null);
            return;
        }

        const updateOrigin = () => {
            const rect = rowElement.getBoundingClientRect();
            setDetailOrigin({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            });
        };

        updateOrigin();
        const ObserverCtor =
            typeof ResizeObserver === "undefined" ? undefined : ResizeObserver;
        if (!ObserverCtor) {
            return;
        }
        const observer = new ObserverCtor(() => {
            updateOrigin();
        });
        observer.observe(rowElement);

        return () => {
            observer.disconnect();
        };
    }, [detailData?.id, isDetailOpen]);

    const hasOrigin = Boolean(detailOrigin);
    const viewportOffset =
        hasOrigin &&
        typeof window !== "undefined" &&
        detailOrigin !== null
            ? {
                  x: detailOrigin.x - window.innerWidth / 2,
                  y: detailOrigin.y - window.innerHeight / 2,
              }
            : { x: 0, y: 20 };
    const bloomInitial = hasOrigin
        ? {
              opacity: 0,
              scale: modalBloom.originScale,
              x: viewportOffset.x,
              y: viewportOffset.y,
          }
        : {
              opacity: 0,
              scale: modalBloom.fallbackScale,
              x: 0,
              y: modalBloom.fallbackOffsetY,
          };
    const bloomAnimate = { opacity: 1, scale: 1, x: 0, y: 0 };
    const bloomExit = {
        opacity: 0,
        scale: modalBloom.exitScale,
        x: 0,
        y: modalBloom.exitOffsetY,
    };
    const bloomTransition = modalBloom.transition;

    const workspaceClass = isDetailPinned
        ? "flex-1 min-h-0 h-full relative flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:gap-4"
        : "flex-1 min-h-0 h-full relative flex flex-col";

    return (
        <>
            <div className={workspaceClass}>
                <main className="flex-1 min-h-0 h-full relative overflow-hidden flex flex-col">
                    <div className="relative flex-1 min-h-0 h-full">
                        <TorrentTable
                            torrents={torrents}
                            filter={filter}
                            isLoading={isTableLoading}
                            onAction={onAction}
                            onRequestDetails={handleDetailRequest}
                            onSelectionChange={onSelectionChange}
                            optimisticStatuses={optimisticStatuses}
                            disableDetailOpen={Boolean(detailData && !isDetailPinned)}
                        />
                        <AnimatePresence>
                            {isDropActive && (
                                <motion.div
                                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
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
                    </div>
                </main>
                <AnimatePresence>
                    {detailData && isDetailPinned && (
                        <motion.aside
                            key={detailData.id}
                            initial={{ opacity: 0, x: 32 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 32 }}
                            transition={{
                                type: "spring",
                                stiffness: 220,
                                damping: 24,
                            }}
                            className="glass-panel hidden h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-content1/20 bg-content1/80 shadow-2xl backdrop-blur-2xl lg:flex"
                        >
                            <TorrentDetailView
                                torrent={detailData}
                                onClose={handleDetailClose}
                                onFilesToggle={onFilesToggle}
                                onSequentialToggle={onSequentialToggle}
                                onSuperSeedingToggle={onSuperSeedingToggle}
                                onForceTrackerReannounce={
                                    onForceTrackerReannounce
                                }
                                sequentialSupported={sequentialSupported}
                                superSeedingSupported={superSeedingSupported}
                                onAction={onAction}
                                isPinned
                                onTogglePin={toggleDetailPin}
                            />
                        </motion.aside>
                    )}
                </AnimatePresence>
            </div>
            {detailData && !isDetailPinned && (
                <Modal
                    isOpen={isDetailOpen}
                    onOpenChange={(open) => !open && handleDetailClose()}
                    backdrop="blur"
                    placement="center"
                    size="4xl"
                    hideCloseButton
                    classNames={{
                        base: "glass-panel bg-content1/80 backdrop-blur-2xl border border-content1/20 shadow-2xl rounded-2xl flex flex-col overflow-hidden h-auto max-h-[85vh] min-h-[450px]",
                        backdrop: "transition-opacity duration-200 ease-out",
                    }}
                    motionProps={{
                        initial: bloomInitial,
                        animate: bloomAnimate,
                        exit: bloomExit,
                        transition: bloomTransition,
                    }}
                >
                    <ModalContent className="h-full">
                        <TorrentDetailView
                            torrent={detailData}
                            onClose={handleDetailClose}
                            onFilesToggle={onFilesToggle}
                            onSequentialToggle={onSequentialToggle}
                            onSuperSeedingToggle={onSuperSeedingToggle}
                            onForceTrackerReannounce={onForceTrackerReannounce}
                            sequentialSupported={sequentialSupported}
                            superSeedingSupported={superSeedingSupported}
                            onAction={onAction}
                            onTogglePin={toggleDetailPin}
                        />
                    </ModalContent>
                </Modal>
            )}
        </>
    );
}
