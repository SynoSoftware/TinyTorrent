import { cn } from "@heroui/react";
import { TorrentDetailHeader } from "@/modules/dashboard/components/TorrentDetails_Header";
import { useTorrentDetailTabCoordinator } from "@/modules/dashboard/hooks/useDetailTabs";
import { useTorrentDetailHeaderStatus } from "@/modules/dashboard/hooks/useTorrentDetailHeaderStatus";
import {
    DETAIL_VIEW_CLASS,
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
                DETAIL_VIEW_CLASS.root,
                isStandalone ? DETAIL_VIEW_CLASS.rootStandalone : null,
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

            <div className={DETAIL_VIEW_CLASS.body}>
                {activeSurface}
            </div>
        </div>
    );
}

export default TorrentDetails;
