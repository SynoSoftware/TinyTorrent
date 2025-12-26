/*
 AGENTS-TODO: This file still uses relative imports and may contain magic numbers.
 - Convert relative imports to '@/...' aliases per AGENTS.md §13.6.
 - Move any visual magic numbers to config/constants.json and expose via logic.ts.
 - Ensure no UI-owned timers or business logic remain in UI components.
 */

import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { SpeedChart } from "@/modules/dashboard/components/details/visualizations/SpeedChart";
import { useEngineSpeedHistory } from "@/shared/hooks/useEngineSpeedHistory";
import { useEngineHeartbeat } from "@/shared/hooks/useEngineHeartbeat";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";

interface SpeedTabProps {
    torrent: TorrentDetail;
}

export const SpeedTab = ({ torrent }: SpeedTabProps) => {
    const { tick } = useEngineHeartbeat({
        mode: "detail",
        detailId: torrent.id,
    });
    const { down: downHistory, up: upHistory } = useEngineSpeedHistory(
        torrent.id,
        tick
    );
    return (
        <div className="h-full flex flex-col">
            <GlassPanel className="flex-1 p-6">
                <SpeedChart
                    downHistory={downHistory}
                    upHistory={upHistory}
                    tick={tick}
                />
            </GlassPanel>
        </div>
    );
};
