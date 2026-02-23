import type { RecoveryState, TorrentStatus } from "@/services/rpc/entities";
import type { Torrent } from "@/modules/dashboard/types/torrent";

type RecoveryStateSource = Pick<Torrent, "state" | "errorEnvelope">;

export const getEffectiveRecoveryState = (
    torrent: RecoveryStateSource,
): TorrentStatus | RecoveryState => {
    const recoveryState = torrent.errorEnvelope?.recoveryState;
    return recoveryState && recoveryState !== "ok" ? recoveryState : torrent.state;
};

