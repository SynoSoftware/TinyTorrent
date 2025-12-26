import React, { useEffect, useMemo, useState } from "react";
import { Dock, PictureInPicture as Popout, X } from "lucide-react";
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
import type {
    FileExplorerContextAction,
    FileExplorerEntry,
} from "@/shared/ui/workspace/FileExplorerTree";

export type DetailTab =
    | "general"
    | "content"
    | "pieces"
    | "speed"
    | "peers"
    | "trackers";

export type PeerSortStrategy = string;

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
    sequentialSupported?: boolean;
    superSeedingSupported?: boolean;
}

/**
 * TorrentDetailView aggregator: composes the per-tab components and wires
 * props through. This restores the inspector UI while preserving per-tab
 * components implemented under `details/tabs/`.
 */
export const TorrentDetailView: React.FC<
    TorrentDetailViewProps & {
        isDetailFullscreen?: boolean;
        onDock?: () => void;
        onPopout?: () => void;
    }
> = ({
    torrent,
    className,
    onFilesToggle,
    onFileContextAction,
    onPeerContextAction,
    inspectorTabCommand,
    onInspectorTabCommandHandled,
    onSequentialToggle,
    onSuperSeedingToggle,
    onForceTrackerReannounce,
    sequentialSupported,
    superSeedingSupported,
    isDetailFullscreen = false,
    onDock,
    onPopout,
    onClose,
}) => {
    const { t } = useTranslation();
    const [active, setActive] = useState<DetailTab>("general");

    // If an external command targets a specific tab, honour it and notify
    useEffect(() => {
        if (inspectorTabCommand && inspectorTabCommand !== active) {
            setActive(inspectorTabCommand);
            onInspectorTabCommandHandled?.();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inspectorTabCommand, onInspectorTabCommandHandled]);

    // torrent is already strictly typed as TorrentDetail | null | undefined

    const tabs = useMemo(
        () =>
            [
                "general",
                "content",
                "pieces",
                "trackers",
                "peers",
                "speed",
            ] as DetailTab[],
        []
    );

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowRight") {
            const idx = tabs.indexOf(active);
            setActive(tabs[(idx + 1) % tabs.length]);
            e.preventDefault();
        } else if (e.key === "ArrowLeft") {
            const idx = tabs.indexOf(active);
            setActive(tabs[(idx - 1 + tabs.length) % tabs.length]);
            e.preventDefault();
        } else if (e.key === "Home") {
            setActive(tabs[0]);
            e.preventDefault();
        } else if (e.key === "End") {
            setActive(tabs[tabs.length - 1]);
            e.preventDefault();
        }
    };

    return (
        <div
            className={className ?? "h-full min-h-0 flex flex-col"}
            tabIndex={0}
            onKeyDown={handleKey}
        >
            <div className="flex items-center justify-between gap-tools px-tight py-tight">
                <div className="flex items-center gap-tools">
                    {tabs.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            aria-pressed={active === tab}
                            onClick={() => setActive(tab)}
                            className={`px-3 py-1 rounded-full text-scaled ${
                                active === tab
                                    ? "bg-primary/20"
                                    : "bg-transparent"
                            }`}
                        >
                            {t(`inspector.tab.${tab}`) as unknown as string}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1">
                    {/* Popout: only when not fullscreen/modal and handler exists */}
                    {!isDetailFullscreen && onPopout && (
                        <button
                            type="button"
                            className="p-1 rounded hover:bg-primary/10"
                            aria-label="Popout"
                            onClick={onPopout}
                        >
                            <Popout size={18} />
                        </button>
                    )}
                    {/* Dock: only when fullscreen/modal and handler exists */}
                    {isDetailFullscreen && onDock && (
                        <button
                            type="button"
                            className="p-1 rounded hover:bg-primary/10"
                            aria-label="Dock"
                            onClick={onDock}
                        >
                            <Dock size={18} />
                        </button>
                    )}
                    {/* Close: unchanged */}
                    {onClose && (
                        <button
                            type="button"
                            className="p-1 rounded hover:bg-primary/10"
                            aria-label="Close"
                            onClick={onClose}
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
                {active === "general" && torrent && (
                    <GeneralTab
                        torrent={torrent}
                        downloadDir={torrent.downloadDir ?? ""}
                        sequentialSupported={sequentialSupported}
                        superSeedingSupported={superSeedingSupported}
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
                        emptyMessage={t("torrent_modal.trackers.empty")}
                    />
                )}
                {active === "peers" && torrent && (
                    <PeersTab
                        peers={torrent.peers ?? []}
                        onPeerContextAction={onPeerContextAction}
                        torrentProgress={torrent.progress ?? 0}
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
};

export default TorrentDetailView;
