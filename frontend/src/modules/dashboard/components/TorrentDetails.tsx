import { cn } from "@heroui/react";
import { TorrentDetailHeader } from "./TorrentDetails_Header";
import { useTorrentDetailTabCoordinator } from "../hooks/useDetailTabs";
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
    const { detailData: torrent } = viewModel;
    const { statusLabel, tooltip, primaryHint } = useTorrentDetailHeaderStatus({
        torrent,
    });
    const {
        active,
        setActive,
        handleKeyDown,
        activeSurface,
    } = useTorrentDetailTabCoordinator({
        viewModel,
        isRecoveryBlocked: isRecoveryBlocked ?? viewModel.isDetailRecoveryBlocked,
        isStandalone,
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
                {activeSurface}
            </div>
        </div>
    );
}

export default TorrentDetails;
