import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { SPLIT_VIEW_CLASS } from "@/shared/ui/layout/glass-surface";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useTranslation } from "react-i18next";
import { AvailabilityHeatmap } from "@/modules/dashboard/components/TorrentDetails_Pieces_Heatmap";
import { PiecesMap } from "@/modules/dashboard/components/TorrentDetails_Pieces_Map";
import { TEXT_ROLE } from "@/config/textRoles";

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
        <PanelGroup direction="vertical" className={SPLIT_VIEW_CLASS.panelGroup}>
            <Panel defaultSize={50} className={SPLIT_VIEW_CLASS.panel} collapsible>
                <GlassPanel className={SPLIT_VIEW_CLASS.surfacePanel}>
                    <div className={SPLIT_VIEW_CLASS.sectionHeader}>
                        <span
                            className={TEXT_ROLE.label}
                        >
                            {t("torrent_modal.tabs.pieces")}
                        </span>
                        <span
                            className={SPLIT_VIEW_CLASS.sectionHeaderMeta}
                        >
                            {t("torrent_modal.piece_map.tooltip_progress", {
                                percent: Math.max(
                                    0,
                                    Math.min(100, piecePercent ?? 0)
                                ),
                            })}
                        </span>
                    </div>

                    <div className={SPLIT_VIEW_CLASS.surfacePanelBody}>
                        <div className={SPLIT_VIEW_CLASS.surfacePanelFill}>
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

            <PanelResizeHandle>
                <div className={SPLIT_VIEW_CLASS.resizeHandle}>
                    <div className={SPLIT_VIEW_CLASS.resizeBar} />
                </div>
            </PanelResizeHandle>

            <Panel defaultSize={50} className={SPLIT_VIEW_CLASS.panel}>
                <GlassPanel className={SPLIT_VIEW_CLASS.surfacePanel}>
                    <div className={SPLIT_VIEW_CLASS.sectionHeader}>
                        <span
                            className={TEXT_ROLE.label}
                        >
                            {t("torrent_modal.availability.label")}
                        </span>
                        <span
                            className={SPLIT_VIEW_CLASS.sectionHeaderCaption}
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
