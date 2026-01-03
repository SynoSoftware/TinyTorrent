import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { useTranslation } from "react-i18next";
import { AvailabilityHeatmap } from "@/modules/dashboard/components/details/visualizations/AvailabilityHeatmap";
import { PiecesMap } from "@/modules/dashboard/components/details/visualizations/PiecesMap";
import { TEXT_ROLES } from "./textRoles";

interface PiecesTabProps {
    piecePercent: number;
    pieceCount?: number;
    pieceSize?: number;
    pieceStates?: number[];
    pieceAvailability?: number[];
}

export const PiecesTab = ({
    piecePercent,
    pieceCount,
    pieceSize,
    pieceStates,
    pieceAvailability,
}: PiecesTabProps) => {
    const { t } = useTranslation();

    return (
        <div className="h-full flex flex-col gap-panel">
            <GlassPanel className="flex-1 overflow-hidden p-panel">
                <div className="flex items-center justify-between mb-tight">
                    <span className={`${TEXT_ROLES.label} text-foreground/60`}>
                        {t("torrent_modal.tabs.pieces")}
                    </span>
                    <span className={`${TEXT_ROLES.secondary} text-foreground/60`}>
                        {t("torrent_modal.piece_map.tooltip_progress", {
                            percent: Math.max(0, Math.min(100, piecePercent ?? 0)),
                        })}
                    </span>
                </div>
                <PiecesMap
                    percent={piecePercent}
                    pieceCount={pieceCount}
                    pieceSize={pieceSize}
                    pieceStates={pieceStates}
                />
            </GlassPanel>
            <GlassPanel className="flex-1 overflow-hidden p-panel">
                <div className="flex items-center justify-between mb-tight">
                    <span className={`${TEXT_ROLES.label} text-foreground/60`}>
                        {t("torrent_modal.availability.label")}
                    </span>
                    <span className={`${TEXT_ROLES.helper} text-foreground/50`}>
                        {t("torrent_modal.availability.legend_common")}
                    </span>
                </div>
                <AvailabilityHeatmap
                    pieceAvailability={pieceAvailability}
                    label={t("torrent_modal.availability.label")}
                    legendRare={t("torrent_modal.availability.legend_rare")}
                    legendCommon={t("torrent_modal.availability.legend_common")}
                    emptyLabel={t(
                        "torrent_modal.availability.backend_missing"
                    )}
                    formatTooltip={(piece, peers) =>
                        t("torrent_modal.availability.tooltip", {
                            piece,
                            peers,
                        })
                    }
                />
            </GlassPanel>
        </div>
    );
};
