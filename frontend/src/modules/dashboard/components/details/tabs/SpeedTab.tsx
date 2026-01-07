import { useTranslation } from "react-i18next";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { SpeedChart } from "@/modules/dashboard/components/details/visualizations/SpeedChart";
import { useEngineSpeedHistory } from "@/shared/hooks/useEngineSpeedHistory";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import { TEXT_ROLES } from "./textRoles";
import { cn } from "@heroui/react";

interface SpeedTabProps {
    torrent: TorrentDetail;
    isStandalone?: boolean;
}

export const SpeedTab = ({ torrent, isStandalone = false }: SpeedTabProps) => {
    const { t } = useTranslation();
    const { down: downHistory, up: upHistory } = useEngineSpeedHistory(
        torrent.id
    );
    const isHistoryEmpty = downHistory.length === 0 && upHistory.length === 0;

    const Content = (
        <>
            <div className="flex items-center justify-between mb-tight shrink-0">
                <div className="flex flex-col">
                    <span className={`${TEXT_ROLES.label} text-foreground/60`}>
                        {t("torrent_modal.tabs.speed")}
                    </span>
                    <span
                        className={`${TEXT_ROLES.secondary} text-foreground/60`}
                    >
                        {t("torrent_modal.speed.stable")}
                    </span>
                </div>
                <span className={`${TEXT_ROLES.secondary} text-foreground/50`}>
                    {t("torrent_modal.speed.download")}
                </span>
            </div>

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
