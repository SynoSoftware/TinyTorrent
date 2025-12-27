import React, { useEffect, useMemo, useState } from "react";
import { Pin, PinOff, X } from "lucide-react";
import { Chip } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
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
export function TorrentDetailView({
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
}: TorrentDetailViewProps & {
    isDetailFullscreen?: boolean;
    onDock?: () => void;
    onPopout?: () => void;
}) {
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

    // Re-bind inspector state when the selected torrent changes so the
    // inspector reloads immediately for new selections (fixes "headless" feeling).
    useEffect(() => {
        // Reset active tab on torrent change to ensure properties reload
        setActive("general");
    }, [torrent?.id]);

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
        /**
         * FLAG: Missing semantic focus token.
         * Per AGENTS.md the inspector container must use a shared focus role/class
         * exported from the token pipeline (constants.json -> index.css -> logic.ts).
         * Do NOT hardcode visual focus styles here; add the token if missing.
         */
        <div
            className={className ?? "h-full min-h-0 flex flex-col"}
            tabIndex={0}
            onKeyDown={handleKey}
        >
            {/* Header Bar: Torrent identity + toolbar */}
            <div className="flex items-center justify-between gap-tools px-tight py-tight relative">
                <div className="flex items-center gap-tools min-w-0">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-tools">
                            <h3 className="truncate font-semibold">
                                {torrent?.name ?? t("general.unknown")}
                            </h3>
                            {torrent && (
                                <Chip
                                    size="md"
                                    variant="shadow"
                                    color={
                                        torrent.state === "seeding"
                                            ? "primary"
                                            : torrent.state === "downloading"
                                            ? "success"
                                            : "warning"
                                    }
                                >
                                    {t(
                                        `torrent_modal.statuses.${torrent.state}`
                                    )}
                                </Chip>
                            )}
                        </div>
                    </div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center text-label tracking-label uppercase text-foreground/40 pointer-events-none">
                    {t("inspector.panel_label")}
                </div>
                <div className="flex items-center gap-tight">
                    {!isDetailFullscreen && onPopout && (
                        <ToolbarIconButton
                            Icon={PinOff}
                            ariaLabel={t("torrent_modal.actions.popout")}
                            onClick={onPopout}
                        />
                    )}

                    {isDetailFullscreen && onDock && (
                        <ToolbarIconButton
                            Icon={Pin}
                            ariaLabel={t("torrent_modal.actions.dock")}
                            onClick={onDock}
                        />
                    )}

                    {onClose && (
                        <ToolbarIconButton
                            Icon={X}
                            ariaLabel={t("torrent_modal.actions.close")}
                            onClick={onClose}
                        />
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
}

export default TorrentDetailView;
