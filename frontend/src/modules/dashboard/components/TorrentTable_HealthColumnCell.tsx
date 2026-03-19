import { cn } from "@heroui/react";
import type { Table } from "@tanstack/react-table";
import { type TFunction } from "i18next";
import { AlertTriangle, Bug, CheckCircle2, CircleOff, Search, type LucideIcon } from "lucide-react";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { OptimisticStatusEntry } from "@/modules/dashboard/types/contracts";
import {
    deriveTorrentDisplayHealth,
    getTorrentHealthGeneralTooltipKey,
    getTorrentHealthLabelKey,
} from "@/modules/dashboard/utils/torrentSwarm";
import { getStatusSpeedHistory } from "@/modules/dashboard/utils/torrentStatus";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { registry } from "@/config/logic";
import { FORM_CONTROL } from "@/shared/ui/layout/glass-surface";
import type { SpeedHistorySnapshot } from "@/shared/hooks/speedHistoryStore";

const { visuals } = registry;

type HealthMeta = {
    icon: LucideIcon;
};

const healthMap: Record<ReturnType<typeof deriveTorrentDisplayHealth>["healthState"], HealthMeta> = {
    healthy: {
        icon: CheckCircle2,
    },
    degraded: {
        icon: AlertTriangle,
    },
    unavailable: {
        icon: CircleOff,
    },
    finding_peers: {
        icon: Search,
    },
    metadata: {
        icon: Search,
    },
    error: {
        icon: Bug,
    },
};

interface TorrentTableHealthColumnCellProps {
    torrent: Torrent;
    table?: Table<Torrent>;
    t: TFunction;
    optimisticStatus?: OptimisticStatusEntry;
}

export function TorrentTable_HealthCell({
    torrent,
    table,
    t,
    optimisticStatus,
}: TorrentTableHealthColumnCellProps) {
    const meta = table?.options?.meta as
        | {
              speedHistoryRef?: {
                  current: Record<
                      string,
                      SpeedHistorySnapshot | Array<number | null>
                  >;
              };
          }
        | undefined;
    const rawHistory = meta?.speedHistoryRef?.current?.[torrent.id];
    const speedHistory = getStatusSpeedHistory(torrent, rawHistory);
    const swarm = deriveTorrentDisplayHealth(
        torrent,
        optimisticStatus,
        speedHistory,
    );
    const label = t(getTorrentHealthLabelKey(swarm.healthState));
    const tooltip = t(getTorrentHealthGeneralTooltipKey(swarm.healthState));
    const conf = healthMap[swarm.healthState];
    const tone = visuals.status.chip.healthTone[swarm.healthState];
    const Icon = conf.icon;

    return (
        <AppTooltip content={tooltip} dense placement="top" native>
            <div className={FORM_CONTROL.statusChipContainer} aria-label={label}>
                <StatusIcon
                    Icon={Icon}
                    size="lg"
                    strokeWidth={visuals.icon.strokeWidthDense}
                    className={cn(FORM_CONTROL.statusChipCurrentIcon, tone)}
                />
            </div>
        </AppTooltip>
    );
}

export default TorrentTable_HealthCell;
