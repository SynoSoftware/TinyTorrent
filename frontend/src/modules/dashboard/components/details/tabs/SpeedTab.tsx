import { GlassPanel } from "../../../../../shared/ui/layout/GlassPanel";
import { SpeedChart, useTorrentDetailSpeedHistory } from "../../../../../shared/ui/visualizations/SpeedChart";
import type { TorrentDetail } from "../../../../../modules/dashboard/types/torrent";

interface SpeedTabProps {
    torrent: TorrentDetail;
}

export const SpeedTab = ({ torrent }: SpeedTabProps) => {
    const { downHistory, upHistory } = useTorrentDetailSpeedHistory(torrent);
    return (
        <div className="h-full flex flex-col">
            <GlassPanel className="flex-1 p-6">
                <SpeedChart downHistory={downHistory} upHistory={upHistory} />
            </GlassPanel>
        </div>
    );
};
