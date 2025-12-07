import { Modal, ModalContent } from "@heroui/react";
import { useLayoutEffect, useState } from "react";
import { TorrentTable, type TorrentTableAction } from "./TorrentTable";
import { TorrentDetailView } from "./TorrentDetailView";
import type { Torrent, TorrentDetail } from "../types/torrent";
import { INTERACTION_CONFIG } from "../../../config/interaction";

const { modalBloom } = INTERACTION_CONFIG;

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
    onSelectionChange,
}: ModeLayoutProps) {
    const isDetailOpen = Boolean(detailData);
    const [detailOrigin, setDetailOrigin] = useState<{
        x: number;
        y: number;
    } | null>(null);

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

    return (
        <>
            <main className="flex-1 min-h-0 relative overflow-hidden flex flex-col z-10">
                <TorrentTable
                    torrents={torrents}
                    filter={filter}
                    isLoading={isTableLoading}
                    onAction={onAction}
                    onRequestDetails={onRequestDetails}
                    onSelectionChange={onSelectionChange}
                />
            </main>
            <Modal
                isOpen={isDetailOpen}
                onOpenChange={(open) => !open && onCloseDetail()}
                backdrop="blur"
                placement="center"
                size="4xl"
                hideCloseButton
                classNames={{
                    base: "bg-content1/80 backdrop-blur-2xl border border-content1/20 shadow-2xl rounded-2xl flex flex-col overflow-hidden h-auto max-h-[85vh] min-h-[450px]",
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
                        onClose={onCloseDetail}
                        onFilesToggle={onFilesToggle}
                        onSequentialToggle={onSequentialToggle}
                        onSuperSeedingToggle={onSuperSeedingToggle}
                        onForceTrackerReannounce={onForceTrackerReannounce}
                        sequentialSupported={sequentialSupported}
                        superSeedingSupported={superSeedingSupported}
                        onAction={onAction}
                    />
                </ModalContent>
            </Modal>
        </>
    );
}
