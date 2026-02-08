import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useTranslation } from "react-i18next";
import { AvailabilityHeatmap } from "@/modules/dashboard/components/TorrentDetails_Pieces_Heatmap";
import { PiecesMap } from "@/modules/dashboard/components/TorrentDetails_Pieces_Map";
import { TEXT_ROLES } from "@/modules/dashboard/hooks/utils/textRoles";

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
        <PanelGroup direction="vertical" className="flex-1 min-h-0">
            <Panel defaultSize={50} className="min-h-0" collapsible>
                <GlassPanel className="h-full w-full relative overflow-hidden p-panel">
                    <div className="flex items-center justify-between mb-tight shrink-0">
                        <span
                            className={`${TEXT_ROLES.label} text-foreground/60`}
                        >
                            {t("torrent_modal.tabs.pieces")}
                        </span>
                        <span
                            className={`${TEXT_ROLES.secondary} text-foreground/60`}
                        >
                            {t("torrent_modal.piece_map.tooltip_progress", {
                                percent: Math.max(
                                    0,
                                    Math.min(100, piecePercent ?? 0)
                                ),
                            })}
                        </span>
                    </div>

                    <div className="h-full w-full relative">
                        <div className="absolute inset-0 flex">
                            <PiecesMap
                                percent={piecePercent}
                                pieceCount={pieceCount}
                                pieceSize={pieceSize}
                                pieceStates={pieceStates}
                            />
                        </div>
                    </div>
                </GlassPanel>
            </Panel>

            <PanelResizeHandle className="h-2 bg-content1 hover:bg-primary cursor-row-resize" />

            <Panel defaultSize={50} className="min-h-0">
                <GlassPanel className="flex-1 overflow-hidden p-panel">
                    <div className="flex items-center justify-between mb-tight">
                        <span
                            className={`${TEXT_ROLES.label} text-foreground/60`}
                        >
                            {t("torrent_modal.availability.label")}
                        </span>
                        <span
                            className={`${TEXT_ROLES.helper} text-foreground/50`}
                        >
                            {t("torrent_modal.availability.legend_common")}
                        </span>
                    </div>
                    <AvailabilityHeatmap
                        pieceAvailability={pieceAvailability}
                        label={t("torrent_modal.availability.label")}
                        legendRare={t("torrent_modal.availability.legend_rare")}
                        legendCommon={t(
                            "torrent_modal.availability.legend_common"
                        )}
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
            </Panel>
        </PanelGroup>
    );
};
