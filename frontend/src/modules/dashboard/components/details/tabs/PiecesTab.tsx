import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { useTranslation } from "react-i18next";
import { AvailabilityHeatmap } from "@/modules/dashboard/components/details/visualizations/AvailabilityHeatmap";
import { PiecesMap } from "@/modules/dashboard/components/details/visualizations/PiecesMap";

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
                <PiecesMap
                    percent={piecePercent}
                    pieceCount={pieceCount}
                    pieceSize={pieceSize}
                    pieceStates={pieceStates}
                />
            </GlassPanel>
            <GlassPanel className="flex-1 overflow-hidden p-panel">
                <AvailabilityHeatmap
                    pieceAvailability={pieceAvailability}
                    label={t("torrent_modal.availability.label")}
                    legendRare={t("torrent_modal.availability.legend_rare")}
                    legendCommon={t("torrent_modal.availability.legend_common")}
                    emptyLabel={t("torrent_modal.availability.empty")}
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
