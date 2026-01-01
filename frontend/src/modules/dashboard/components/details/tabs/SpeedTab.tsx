// All imports use '@/...' aliases. Magic numbers and UI-owned logic flagged for follow-up refactor.

import { useTranslation } from "react-i18next";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { SpeedChart } from "@/modules/dashboard/components/details/visualizations/SpeedChart";
import { useEngineSpeedHistory } from "@/shared/hooks/useEngineSpeedHistory";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import { TEXT_ROLES } from "./textRoles";

interface SpeedTabProps {
    torrent: TorrentDetail;
}

export const SpeedTab = ({ torrent }: SpeedTabProps) => {
    const { t } = useTranslation();
    const { down: downHistory, up: upHistory } = useEngineSpeedHistory(
        torrent.id
    );
    return (
        <div className="h-full flex flex-col">
            <GlassPanel className="flex-1 p-stage">
                <div className="flex items-center justify-between mb-tight">
                    <div className="flex flex-col">
                        <span className={`${TEXT_ROLES.label} text-foreground/60`}>
                            {t("torrent_modal.tabs.speed")}
                        </span>
                        <span className={`${TEXT_ROLES.secondary} text-foreground/60`}>
                            {t("torrent_modal.speed.stable")}
                        </span>
                    </div>
                    <span className={`${TEXT_ROLES.secondary} text-foreground/50`}>
                        {t("torrent_modal.speed.download")}
                    </span>
                </div>
                <SpeedChart
                    downHistory={downHistory}
                    upHistory={upHistory}
                />
            </GlassPanel>
        </div>
    );
};
