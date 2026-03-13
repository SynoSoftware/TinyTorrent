import { PiecesMap } from "@/modules/dashboard/components/TorrentDetails_Pieces_Map";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { TABLE } from "@/shared/ui/layout/glass-surface";

interface PiecesTabProps {
    piecePercent: number;
    pieceCount?: number;
    pieceSize?: number;
    pieceStates?: number[];
    pieceAvailability?: number[];
    showPersistentHud: boolean;
}

export const PiecesTab = ({
    piecePercent,
    pieceCount,
    pieceSize,
    pieceStates,
    pieceAvailability,
    showPersistentHud,
}: PiecesTabProps) => {
    return (
        <GlassPanel className={`${TABLE.detailsContentPanel} h-full`}>
            <div className={TABLE.detailsContentListHost}>
                <PiecesMap
                    percent={piecePercent}
                    pieceCount={pieceCount}
                    pieceSize={pieceSize}
                    pieceStates={pieceStates}
                    pieceAvailability={pieceAvailability}
                    showPersistentHud={showPersistentHud}
                />
            </div>
        </GlassPanel>
    );
};
