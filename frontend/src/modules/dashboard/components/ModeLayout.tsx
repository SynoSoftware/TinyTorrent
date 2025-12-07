import { Modal, ModalContent } from "@heroui/react";
import { TorrentTable, type TorrentTableAction } from "./TorrentTable";
import { TorrentDetailView } from "./TorrentDetailView";
import type { Torrent, TorrentDetail } from "../types/torrent";

interface ModeLayoutProps {
    torrents: Torrent[];
    filter: string;
    isTableLoading: boolean;
    onAction?: (action: TorrentTableAction, torrent: Torrent) => void;
    onRequestDetails?: (torrent: Torrent) => void;
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
}: ModeLayoutProps) {
    const isDetailOpen = Boolean(detailData);

    return (
        <>
        <main className="flex-1 min-h-0 relative overflow-hidden flex flex-col z-10">
                <TorrentTable
                    torrents={torrents}
                    filter={filter}
                    isLoading={isTableLoading}
                    onAction={onAction}
                    onRequestDetails={onRequestDetails}
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
                    variants: {
                        enter: {
                            scale: 1,
                            opacity: 1,
                            transition: { duration: 0.2, ease: "easeOut" },
                        },
                        exit: {
                            scale: 0.95,
                            opacity: 0,
                            transition: { duration: 0.15 },
                        },
                    },
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
