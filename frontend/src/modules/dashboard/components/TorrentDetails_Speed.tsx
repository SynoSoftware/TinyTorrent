import { useTranslation } from "react-i18next";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { SpeedChart } from "@/modules/dashboard/components/TorrentDetails_Speed_Chart";
import { useTorrentDetailsSpeedViewModel } from "@/modules/dashboard/hooks/useTorrentDetailsSpeedViewModel";

interface SpeedTabProps {
    torrentId: string | number;
    torrentState?: string;
    isStandalone?: boolean;
}

export const SpeedTab = ({
    torrentId,
    torrentState,
    isStandalone = false,
}: SpeedTabProps) => {
    const { t } = useTranslation();
    const { isChecking, downHistory, upHistory, isHistoryEmpty } =
        useTorrentDetailsSpeedViewModel({
            torrentId,
            torrentState,
        });

    const Content = (
        <>
            {isChecking && (
                <div className="mb-tight shrink-0 rounded-2xl border border-warning/30 bg-warning/10 p-panel text-scaled text-warning">
                    {t("labels.status.torrent.checking")}
                </div>
            )}
            {isHistoryEmpty && (
                <div className="mb-tight shrink-0 rounded-2xl border border-content1/20 bg-background/20 p-panel text-scaled text-foreground/50">
                    {t("torrent_modal.speed.collecting_samples")}
                </div>
            )}

            <div className="flex-1 min-h-0">
                <SpeedChart
                    downHistory={downHistory}
                    upHistory={upHistory}
                    isStandalone={isStandalone}
                />
            </div>
        </>
    );

    return (
        <div className="h-full flex flex-col">
            {isStandalone ? (
                <GlassPanel className="flex-1 p-stage flex flex-col min-h-0">
                    {Content}
                </GlassPanel>
            ) : (
                <div className="flex-1 p-stage flex flex-col min-h-0 h-full">
                    {Content}
                </div>
            )}
        </div>
    );
};
