import { useEngineSpeedHistory } from "@/shared/hooks/useEngineSpeedHistory";
import STATUS from "@/shared/status";

interface UseTorrentDetailsSpeedViewModelParams {
    torrentId: string | number;
    torrentState?: string;
}

interface TorrentDetailsSpeedViewModel {
    isChecking: boolean;
    downHistory: number[];
    upHistory: number[];
    isHistoryEmpty: boolean;
}

export function useTorrentDetailsSpeedViewModel({
    torrentId,
    torrentState,
}: UseTorrentDetailsSpeedViewModelParams): TorrentDetailsSpeedViewModel {
    const isChecking = torrentState === STATUS.torrent.CHECKING;
    const { down: downHistory, up: upHistory } = useEngineSpeedHistory(
        String(torrentId),
    );
    const isHistoryEmpty = downHistory.length === 0 && upHistory.length === 0;

    return {
        isChecking,
        downHistory,
        upHistory,
        isHistoryEmpty,
    };
}

