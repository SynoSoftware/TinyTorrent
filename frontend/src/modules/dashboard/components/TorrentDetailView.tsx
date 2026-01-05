import { cn } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { GeneralTab } from "./details/tabs/GeneralTab";
import { ContentTab } from "./details/tabs/ContentTab";
import { PiecesTab } from "./details/tabs/PiecesTab";
import { SpeedTab } from "./details/tabs/SpeedTab";
import { PeersTab } from "./details/tabs/PeersTab";
import { TrackersTab } from "./details/tabs/TrackersTab";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { PeerContextAction } from "./details/tabs/PeersTab";
import type { TorrentPeerEntity } from "@/services/rpc/entities";
import { TorrentDetailHeader } from "./details/TorrentDetailHeader";
import { useDetailTabs, DETAIL_TABS } from "./details/useDetailTabs";
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

export interface TorrentDetailViewProps {
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
    onForceTrackerReannounce?: () => void | Promise<void>;
    capabilities: CapabilityStore;
}

/**
 * TorrentDetailView aggregator: composes the per-tab components and wires
 * props through. This restores the inspector UI while preserving per-tab
 * components implemented under `details/tabs/`.
 */
export function TorrentDetailView({
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
    onForceTrackerReannounce,
    capabilities,
    isDetailFullscreen = false,
    onDock,
    onPopout,
    onClose,
}: TorrentDetailViewProps & {
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
                GLASS_BLOCK_SURFACE,
                BLOCK_SHADOW,
                "h-full min-h-0 flex flex-col outline-none"
            )}
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            {/* Header Bar: Torrent identity + toolbar */}
            <TorrentDetailHeader
                torrent={torrent}
                isDetailFullscreen={isDetailFullscreen}
                onDock={onDock}
                onPopout={onPopout}
                onClose={onClose}
                activeTab={active}
                onTabChange={setActive}
            />

            <div className="flex-1 min-h-0 overflow-y-auto bg-transparent">
                {active === "general" && torrent && (
                    <GeneralTab
                        torrent={torrent}
                        downloadDir={torrent.downloadDir ?? ""}
                        sequentialCapability={capabilities.sequentialDownload}
                        superSeedingCapability={capabilities.superSeeding}
                        onSequentialToggle={onSequentialToggle}
                        onSuperSeedingToggle={onSuperSeedingToggle}
                        onForceTrackerReannounce={onForceTrackerReannounce}
                        progressPercent={Math.round(
                            (torrent.progress ?? 0) * 100
                        )}
                        timeRemainingLabel={t("general.unknown")}
                        activePeers={torrent.peers?.length ?? 0}
                    />
                )}
                {active === "content" && torrent && (
                    <ContentTab
                        files={torrent.files ?? []}
                        emptyMessage={t("torrent_modal.files_empty")}
                        onFilesToggle={onFilesToggle}
                        onFileContextAction={onFileContextAction}
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
                    />
                )}
                {active === "peers" && torrent && (
                    <PeersTab
                        peers={torrent.peers ?? []}
                        onPeerContextAction={onPeerContextAction}
                        torrentProgress={torrent.progress ?? 0}
                        sortBySpeed={peerSortStrategy === "speed"}
                    />
                )}
                {active === "speed" && torrent && (
                    <SpeedTab
                        // SpeedTab expects engine-driven histories; pass basic props
                        torrent={torrent}
                    />
                )}
            </div>
        </div>
    );
}

export default TorrentDetailView;
