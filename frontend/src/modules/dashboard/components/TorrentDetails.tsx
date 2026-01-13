import { cn } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { GeneralTab } from "./TorrentDetails_General";
import { ContentTab } from "./TorrentDetails_Content";
import { PiecesTab } from "./TorrentDetails_Pieces";
import { SpeedTab } from "./TorrentDetails_Speed";
import { PeersTab } from "./TorrentDetails_Peers";
import { TrackersTab } from "./TorrentDetails_Trackers";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { PeerContextAction } from "./TorrentDetails_Peers";
import type { TorrentPeerEntity } from "@/services/rpc/entities";
import { TorrentDetailHeader } from "./TorrentDetails_Header";
import { useDetailTabs } from "../hooks/useDetailTabs";
import {
    BLOCK_SHADOW,
    GLASS_BLOCK_SURFACE,
} from "@/shared/ui/layout/glass-surface";
import type {
    DetailTab,
    PeerSortStrategy,
} from "@/modules/dashboard/types/torrentDetail";
import type {
    FileExplorerContextAction,
    FileExplorerEntry,
} from "@/shared/ui/workspace/FileExplorerTree";
import type { CapabilityStore } from "@/app/types/capabilities";

export interface TorrentDetailsProps {
    torrent?: TorrentDetail | null;
    className?: string;
    onClose?: () => void;
    onFilesToggle?: (
        indexes: number[],
        wanted: boolean
    ) => void | Promise<void>;
    onFileContextAction?: (
        action: FileExplorerContextAction,
        entry: FileExplorerEntry
    ) => void;
    onPeerContextAction?: (
        action: PeerContextAction,
        peer: TorrentPeerEntity
    ) => void;
    peerSortStrategy?: PeerSortStrategy;
    inspectorTabCommand?: DetailTab | null;
    onInspectorTabCommandHandled?: () => void;
    onSequentialToggle?: (enabled: boolean) => void | Promise<void>;
    onSuperSeedingToggle?: (enabled: boolean) => void | Promise<void>;
    isRecoveryBlocked?: boolean;
    capabilities: CapabilityStore;
    isStandalone?: boolean;
}

/**
 * TorrentDetailView aggregator: composes the per-tab components and wires
 * props through. This restores the inspector UI while preserving per-tab
 * components implemented under `details/tabs/`.
 */
export function TorrentDetails({
    torrent,
    className,
    onFilesToggle,
    onFileContextAction,
    onPeerContextAction,
    peerSortStrategy,
    inspectorTabCommand,
    onInspectorTabCommandHandled,
    onSequentialToggle,
    onSuperSeedingToggle,

    isRecoveryBlocked,
    capabilities,
    isDetailFullscreen = false,
    isStandalone = false,
    onDock,
    onPopout,
    onClose,
}: TorrentDetailsProps & {
    isDetailFullscreen?: boolean;
    onDock?: () => void;
    onPopout?: () => void;
}) {
    const { t } = useTranslation();
    const { active, setActive, handleKeyDown } = useDetailTabs({
        activeTorrentId: torrent?.id,
        inspectorTabCommand,
        onInspectorTabCommandHandled,
    });

    return (
        <div
            className={cn(
                className,

                cn(GLASS_BLOCK_SURFACE, BLOCK_SHADOW),
                isStandalone ? "overflow-y-auto" : null,
                "h-full min-h-0 flex flex-col outline-none rounded-2xl"
            )}
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            {/* Header Bar: Torrent identity + toolbar */}
            <TorrentDetailHeader
                torrent={torrent}
                isDetailFullscreen={isDetailFullscreen}
                isStandalone={isStandalone}
                onDock={onDock}
                onPopout={onPopout}
                onClose={onClose}
                activeTab={active}
                onTabChange={setActive}
            />

            <div className="flex-1 min-h-0 bg-transparent py-tight ">
                {active === "general" && torrent && (
                    <GeneralTab
                        torrent={torrent}
                        downloadDir={torrent.downloadDir ?? ""}
                        sequentialCapability={capabilities.sequentialDownload}
                        superSeedingCapability={capabilities.superSeeding}
                        onSequentialToggle={onSequentialToggle}
                        onSuperSeedingToggle={onSuperSeedingToggle}
                        /* set-location handled via TorrentActionsContext */
                        progressPercent={Math.round(
                            (torrent.progress ?? 0) * 100
                        )}
                        timeRemainingLabel={t("general.unknown")}
                        activePeers={torrent.peers?.length ?? 0}
                        isRecoveryBlocked={isRecoveryBlocked}
                    />
                )}
                {active === "content" && torrent && (
                    <ContentTab
                        files={torrent.files ?? []}
                        emptyMessage={t("torrent_modal.files_empty")}
                        onFilesToggle={onFilesToggle}
                        onFileContextAction={onFileContextAction}
                        /* redownload handled via TorrentActionsContext */
                        torrent={torrent}
                        isStandalone={isStandalone}
                    />
                )}
                {active === "pieces" && torrent && (
                    <PiecesTab
                        piecePercent={torrent.progress ?? 0}
                        pieceCount={torrent.pieceCount}
                        pieceSize={torrent.pieceSize}
                        pieceStates={torrent.pieceStates}
                        pieceAvailability={torrent.pieceAvailability}
                    />
                )}
                {active === "trackers" && torrent && (
                    <TrackersTab
                        trackers={torrent.trackers ?? []}
                        emptyMessage={t("torrent_modal.trackers.empty_backend")}
                        isStandalone={isStandalone}
                    />
                )}
                {active === "peers" && torrent && (
                    <PeersTab
                        peers={torrent.peers ?? []}
                        onPeerContextAction={onPeerContextAction}
                        torrentProgress={torrent.progress ?? 0}
                        sortBySpeed={peerSortStrategy === "speed"}
                        isStandalone={isStandalone}
                    />
                )}
                {active === "speed" && torrent && (
                    <SpeedTab
                        // SpeedTab expects engine-driven histories; pass basic props
                        torrent={torrent}
                        isStandalone={isStandalone}
                    />
                )}
            </div>
        </div>
    );
}

export default TorrentDetails;
