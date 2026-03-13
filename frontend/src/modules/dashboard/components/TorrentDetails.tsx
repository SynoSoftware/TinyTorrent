import { cn } from "@heroui/react";
import { TorrentDetailHeader } from "@/modules/dashboard/components/TorrentDetails_Header";
import { useTorrentDetailTabCoordinator } from "@/modules/dashboard/hooks/useDetailTabs";
import { useTorrentDetailHeaderStatus } from "@/modules/dashboard/hooks/useTorrentDetailHeaderStatus";
import { DETAILS } from "@/shared/ui/layout/glass-surface";
import type { DashboardDetailViewModel } from "@/app/viewModels/useAppViewModel";
import { sanitizeDomIdToken } from "@/shared/utils/dom";

export interface TorrentDetailsProps {
    viewModel: DashboardDetailViewModel;
    className?: string;
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
    const tabDomIdPrefix = sanitizeDomIdToken(
        String(torrent?.id ?? torrent?.hash ?? "inspector"),
    );
    const { statusLabel, tooltip, primaryHint } = useTorrentDetailHeaderStatus({
        torrent,
        optimisticStatus: viewModel.optimisticStatus,
    });
    const {
        active,
        setActive,
        handleKeyDown,
        activeSurface,
        tabs,
        headerActions,
    } =
        useTorrentDetailTabCoordinator({
            viewModel,
            isStandalone,
            isDetailFullscreen,
        });

    return (
        <div
            className={cn(
                className,
                DETAILS.root,
                isStandalone ? DETAILS.rootStandalone : null,
            )}
            tabIndex={0}
            data-detail-host="true"
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
                tabs={tabs}
                headerActions={headerActions}
                statusLabel={statusLabel}
                statusTooltip={tooltip}
                primaryHint={primaryHint}
            />

            <div
                id={`${tabDomIdPrefix}-panel-${active}`}
                className={DETAILS.body}
                role="tabpanel"
                aria-labelledby={`${tabDomIdPrefix}-tab-${active}`}
            >
                {activeSurface}
            </div>
        </div>
    );
}

export default TorrentDetails;
