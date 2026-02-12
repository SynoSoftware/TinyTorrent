import { useTranslation } from "react-i18next";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { AlertPanel } from "@/shared/ui/layout/AlertPanel";
import { SpeedChart } from "@/modules/dashboard/components/TorrentDetails_Speed_Chart";
import { useEngineSpeedHistory } from "@/shared/hooks/useEngineSpeedHistory";
import STATUS from "@/shared/status";
import { DETAIL_VIEW_CLASS } from "@/shared/ui/layout/glass-surface";

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
    const isChecking = torrentState === STATUS.torrent.CHECKING;
    const { down: downHistory, up: upHistory } = useEngineSpeedHistory(
        String(torrentId),
    );
    const isHistoryEmpty = downHistory.length === 0 && upHistory.length === 0;

    const Content = (
        <>
            {isChecking && (
                <AlertPanel
                    severity="warning"
                    className={DETAIL_VIEW_CLASS.speedCheckingAlert}
                >
                    {t("labels.status.torrent.checking")}
                </AlertPanel>
            )}
            {isHistoryEmpty && (
                <div className={DETAIL_VIEW_CLASS.speedCollectingPanel}>
                    {t("torrent_modal.speed.collecting_samples")}
                </div>
            )}

            <div className={DETAIL_VIEW_CLASS.speedChartHost}>
                <SpeedChart
                    downHistory={downHistory}
                    upHistory={upHistory}
                    isStandalone={isStandalone}
                />
            </div>
        </>
    );

    return (
        <div className={DETAIL_VIEW_CLASS.speedRoot}>
            {isStandalone ? (
                <GlassPanel className={DETAIL_VIEW_CLASS.speedStandaloneSurface}>
                    {Content}
                </GlassPanel>
            ) : (
                <div className={DETAIL_VIEW_CLASS.speedEmbeddedSurface}>
                    {Content}
                </div>
            )}
        </div>
    );
};
