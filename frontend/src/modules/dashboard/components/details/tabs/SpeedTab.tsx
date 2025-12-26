// All imports use '@/...' aliases. Magic numbers and UI-owned logic flagged for follow-up refactor.

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
        torrent.id
    );
    return (
        <div className="h-full flex flex-col">
            <GlassPanel className="flex-1 p-stage">
                <SpeedChart
                    downHistory={downHistory}
                    upHistory={upHistory}
                    tick={tick}
                />
            </GlassPanel>
        </div>
    );
};
