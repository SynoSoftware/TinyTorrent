import { useTranslation } from "react-i18next";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { AlertPanel } from "@/shared/ui/layout/AlertPanel";
import { SpeedChart } from "@/modules/dashboard/components/TorrentDetails_Speed_Chart";
import { useEngineSpeedHistory } from "@/shared/hooks/useEngineSpeedHistory";
import { status } from "@/shared/status";
import { details } from "@/shared/ui/layout/glass-surface";

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
    const isChecking = torrentState === status.torrent.checking;
    const { down: downHistory, up: upHistory } = useEngineSpeedHistory(
        String(torrentId),
    );
    const isHistoryEmpty = downHistory.length === 0 && upHistory.length === 0;

    const Content = (
        <>
            {isChecking && (
                <AlertPanel
                    severity="warning"
                    className={details.speedCheckingAlert}
                >
                    {t("labels.status.torrent.checking")}
                </AlertPanel>
            )}
            {isHistoryEmpty && (
                <div className={details.speedCollectingPanel}>
                    {t("torrent_modal.speed.collecting_samples")}
                </div>
            )}

            <div className={details.speedChartHost}>
                <SpeedChart
                    downHistory={downHistory}
                    upHistory={upHistory}
                    isStandalone={isStandalone}
                />
            </div>
        </>
    );

    return (
        <div className={details.speedRoot}>
            {isStandalone ? (
                <GlassPanel className={details.speedStandaloneSurface}>
                    {Content}
                </GlassPanel>
            ) : (
                <div className={details.speedEmbeddedSurface}>{Content}</div>
            )}
        </div>
    );
};
