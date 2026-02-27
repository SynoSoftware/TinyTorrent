import { useTranslation } from "react-i18next";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { AlertPanel } from "@/shared/ui/layout/AlertPanel";
import { SpeedChart } from "@/modules/dashboard/components/TorrentDetails_Speed_Chart";
import { useEngineSpeedHistory } from "@/shared/hooks/useEngineSpeedHistory";
import { status } from "@/shared/status";
import { DETAILS } from "@/shared/ui/layout/glass-surface";

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
                    className={DETAILS.speedCheckingAlert}
                >
                    {t("labels.status.torrent.checking")}
                </AlertPanel>
            )}
            {isHistoryEmpty && (
                <div className={DETAILS.speedCollectingPanel}>
                    {t("torrent_modal.speed.collecting_samples")}
                </div>
            )}

            <div className={DETAILS.speedChartHost}>
                <SpeedChart
                    downHistory={downHistory}
                    upHistory={upHistory}
                    isStandalone={isStandalone}
                />
            </div>
        </>
    );

    return (
        <div className={DETAILS.speedRoot}>
            {isStandalone ? (
                <GlassPanel className={DETAILS.speedStandaloneSurface}>
                    {Content}
                </GlassPanel>
            ) : (
                <div className={DETAILS.speedEmbeddedSurface}>{Content}</div>
            )}
        </div>
    );
};
