import { cn } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { GeneralTab } from "./TorrentDetails_General";
import { ContentTab } from "./TorrentDetails_Content";
import { PiecesTab } from "./TorrentDetails_Pieces";
import { SpeedTab } from "./TorrentDetails_Speed";
import { PeersTab } from "./TorrentDetails_Peers";
import { TrackersTab } from "./TorrentDetails_Trackers";
import { TorrentDetailHeader } from "./TorrentDetails_Header";
import { useDetailTabs } from "../hooks/useDetailTabs";
import { useTorrentDetailHeaderStatus } from "../hooks/useTorrentDetailHeaderStatus";
import {
    BLOCK_SHADOW,
    GLASS_BLOCK_SURFACE,
} from "@/shared/ui/layout/glass-surface";
import type { DashboardDetailViewModel } from "@/app/viewModels/useAppViewModel";

export interface TorrentDetailsProps {
    viewModel: DashboardDetailViewModel;
    className?: string;
    isRecoveryBlocked?: boolean;
    isStandalone?: boolean;
    isDetailFullscreen?: boolean;
    onDock?: () => void;
    onPopout?: () => void;
    onClose?: () => void;
}

/**
 * TorrentDetailView aggregator: composes the per-tab components and wires
 * props through. This restores the inspector UI while preserving per-tab
 * components implemented under `details/tabs/`.
 */
export function TorrentDetails({
    viewModel,
    className,
    isRecoveryBlocked,
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
    const {
        detailData: torrent,
        handleFileSelectionChange,
        handleEnsureValid,
        handleEnsureDataPresent,
        handleEnsureAtLocation,
        peerSortStrategy,
        inspectorTabCommand,
        onInspectorTabCommandHandled,
        isDetailRecoveryBlocked,
        handlePeerContextAction,
    } = viewModel;
    const { statusLabel, tooltip, primaryHint } = useTorrentDetailHeaderStatus({
        torrent,
    });
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
                statusLabel={statusLabel}
                statusTooltip={tooltip}
                primaryHint={primaryHint}
            />

            <div className="flex-1 min-h-0 bg-transparent py-tight ">
                {active === "general" && torrent && (
                    <GeneralTab
                        torrent={torrent}
                        downloadDir={torrent.downloadDir ?? ""}
                        activePeers={torrent.peers?.length ?? 0}
                        isRecoveryBlocked={isRecoveryBlocked}
                    />
                )}
                {active === "content" && torrent && (
                    <ContentTab
                        files={torrent.files ?? []}
                        emptyMessage={t("torrent_modal.files_empty")}
                        onFilesToggle={handleFileSelectionChange}
                        onRecheck={
                            torrent.id ?? torrent.hash
                                ? () =>
                                      void handleEnsureValid?.(
                                          torrent.id ?? torrent.hash
                                      )
                                : undefined
                        }
                        onDownloadMissing={
                            torrent.id ?? torrent.hash
                                ? () =>
                                      void handleEnsureDataPresent?.(
                                          torrent.id ?? torrent.hash
                                      )
                                : undefined
                        }
                        onOpenFolder={
                            (torrent.id ?? torrent.hash) &&
                            torrent.savePath &&
                            torrent.savePath.trim().length > 0
                                ? () =>
                                      void handleEnsureAtLocation?.(
                                          torrent.id ?? torrent.hash,
                                          torrent.savePath ?? ""
                                      )
                                : undefined
                        }
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
                        onPeerContextAction={handlePeerContextAction}
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
