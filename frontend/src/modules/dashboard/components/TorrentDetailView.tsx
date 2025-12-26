import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GeneralTab } from "./details/tabs/GeneralTab";
import { ContentTab } from "./details/tabs/ContentTab";
import { PiecesTab } from "./details/tabs/PiecesTab";
import { SpeedTab } from "./details/tabs/SpeedTab";
import { PeersTab } from "./details/tabs/PeersTab";
import { TrackersTab } from "./details/tabs/TrackersTab";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";

export type DetailTab =
    | "general"
    | "content"
    | "pieces"
    | "speed"
    | "peers"
    | "trackers";

export type PeerSortStrategy = string;

export interface TorrentDetailViewProps {
    torrent?: TorrentDetail | null | unknown;
    className?: string;
    onClose?: () => void;
    onFilesToggle?: (
        indexes: number[],
        wanted: boolean
    ) => void | Promise<void>;
    onFileContextAction?: (action: any, entry: any) => void;
    onPeerContextAction?: (action: any, peer: any) => void;
    peerSortStrategy?: PeerSortStrategy;
    inspectorTabCommand?: DetailTab | null;
    onInspectorTabCommandHandled?: () => void;
    onSequentialToggle?: (enabled: boolean) => void | Promise<void>;
    onSuperSeedingToggle?: (enabled: boolean) => void | Promise<void>;
    onForceTrackerReannounce?: () => void | Promise<void>;
    sequentialSupported?: boolean;
    superSeedingSupported?: boolean;
    isFullscreen?: boolean;
    onDock?: () => void;
    onPopout?: () => void;
}

/**
 * TorrentDetailView aggregator: composes the per-tab components and wires
 * props through. This restores the inspector UI while preserving per-tab
 * components implemented under `details/tabs/`.
 */
export const TorrentDetailView: React.FC<TorrentDetailViewProps> = (props) => {
    const { t } = useTranslation();
    const [active, setActive] = useState<DetailTab>("general");

    // If an external command targets a specific tab, honour it and notify
    useEffect(() => {
        if (props.inspectorTabCommand) {
            setActive(props.inspectorTabCommand);
            props.onInspectorTabCommandHandled?.();
        }
    }, [props.inspectorTabCommand, props.onInspectorTabCommandHandled]);

    const torrent = props.torrent as TorrentDetail | undefined | null;

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
            className={props.className ?? "h-full min-h-0 flex flex-col"}
            tabIndex={0}
            onKeyDown={handleKey}
        >
            <div className="flex items-center gap-2 px-3 py-2">
                {tabs.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        aria-pressed={active === tab}
                        onClick={() => setActive(tab)}
                        className={`px-3 py-1 rounded-full text-scaled ${
                            active === tab ? "bg-primary/20" : "bg-transparent"
                        }`}
                    >
                        {t(`inspector.tab.${tab}`) as unknown as string}
                    </button>
                ))}
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
                {active === "general" && torrent && (
                    <GeneralTab
                        torrent={torrent}
                        downloadDir={torrent.downloadDir ?? ""}
                        sequentialSupported={props.sequentialSupported}
                        superSeedingSupported={props.superSeedingSupported}
                        onSequentialToggle={props.onSequentialToggle}
                        onSuperSeedingToggle={props.onSuperSeedingToggle}
                        onForceTrackerReannounce={
                            props.onForceTrackerReannounce
                        }
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
                        onFilesToggle={props.onFilesToggle}
                        onFileContextAction={props.onFileContextAction}
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
                        onPeerContextAction={(a, p) =>
                            props.onPeerContextAction?.(a as any, p as any)
                        }
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
