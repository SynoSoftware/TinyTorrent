import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PiecesMap } from "@/modules/dashboard/components/TorrentDetails_Pieces_Map";
import { normalizePiecePercent } from "@/modules/dashboard/hooks/utils/canvasUtils";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { SPLIT } from "@/shared/ui/layout/glass-surface";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";

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
    const [showPersistentHud, setShowPersistentHud] = useState(true);
    const displayProgressPercent = Math.round(normalizePiecePercent(piecePercent) * 100);

    return (
        <GlassPanel className={`${SPLIT.surfacePanel} p-none`}>
            <div className={`${SPLIT.sectionHeader} px-panel pt-panel`}>
                <span className={SPLIT.sectionHeaderCaption}>
                    {t("torrent_modal.piece_map.surface_title")}
                </span>
                <div className={SPLIT.sectionHeaderActions}>
                    <span className={SPLIT.sectionHeaderMeta}>
                        {t("torrent_modal.piece_map.tooltip_progress", {
                            percent: displayProgressPercent,
                        })}
                    </span>
                    <ToolbarIconButton
                        Icon={showPersistentHud ? EyeOff : Eye}
                        ariaLabel={
                            showPersistentHud
                                ? t("torrent_modal.piece_map.hide_hud")
                                : t("torrent_modal.piece_map.show_hud")
                        }
                        onPress={() => setShowPersistentHud((current) => !current)}
                        className={SPLIT.sectionHeaderIconButton}
                        iconSize="sm"
                    />
                </div>
            </div>

            <div className={SPLIT.surfacePanelBody}>
                <div className={SPLIT.surfacePanelFill}>
                    <PiecesMap
                        percent={piecePercent}
                        pieceCount={pieceCount}
                        pieceSize={pieceSize}
                        pieceStates={pieceStates}
                        pieceAvailability={pieceAvailability}
                        showPersistentHud={showPersistentHud}
                    />
                </div>
            </div>
        </GlassPanel>
    );
};
