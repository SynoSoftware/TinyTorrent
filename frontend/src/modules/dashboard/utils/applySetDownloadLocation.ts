import type { TFunction } from "i18next";
import STATUS from "@/shared/status";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { watchVerifyCompletion } from "@/services/rpc/verify-watcher";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { resolveTorrentPath } from "@/modules/dashboard/utils/torrentPaths";
import { shouldMoveDataOnSetLocation } from "@/modules/dashboard/domain/torrentRelocation";
import { infraLogger } from "@/shared/utils/infraLogger";

type DispatchIntent = (intent: ReturnType<typeof TorrentIntents.ensureActive>) => Promise<TorrentDispatchOutcome>;
type SetDownloadLocationCommand = (params: {
    torrent: Torrent;
    path: string;
    moveData: boolean;
}) => Promise<TorrentCommandOutcome>;

const wasTorrentRunning = (torrent: Torrent): boolean =>
    torrent.state === STATUS.torrent.DOWNLOADING ||
    torrent.state === STATUS.torrent.SEEDING ||
    torrent.state === STATUS.torrent.CHECKING ||
    torrent.state === STATUS.torrent.QUEUED ||
    torrent.state === STATUS.torrent.STALLED;

export const resolveSetDownloadLocationPath = (
    torrent: Torrent | null | undefined,
): string => (torrent ? resolveTorrentPath(torrent) : "");

export async function pickSetDownloadLocationDirectory({
    currentPath,
    torrent,
    canPickDirectory,
    pickDirectory,
}: {
    currentPath: string;
    torrent: Torrent | null | undefined;
    canPickDirectory: boolean;
    pickDirectory: (basePath?: string) => Promise<string | null>;
}): Promise<string | null> {
    if (!canPickDirectory || !torrent) {
        return null;
    }
    const basePath = currentPath.trim() || resolveSetDownloadLocationPath(torrent) || undefined;
    return pickDirectory(basePath);
}

export async function applySetDownloadLocation({
    torrent,
    path,
    client,
    setDownloadLocation,
    dispatchEnsureActive,
    t,
}: {
    torrent: Torrent;
    path: string;
    client: EngineAdapter;
    setDownloadLocation: SetDownloadLocationCommand;
    dispatchEnsureActive: DispatchIntent;
    t: TFunction;
}): Promise<void> {
    const targetId = torrent.id ?? torrent.hash;
    if (!targetId) {
        throw new Error(t("toolbar.feedback.failed"));
    }

    const requestedPath = path.trim();
    const moveData = shouldMoveDataOnSetLocation(torrent);

    const shouldRestoreRunningState = wasTorrentRunning(torrent);

    const setLocationOutcome = await setDownloadLocation({
        torrent,
        path: requestedPath,
        moveData,
    });
    if (setLocationOutcome.status !== "success") {
        if (setLocationOutcome.status === "unsupported") {
            throw new Error(t("torrent_modal.controls.not_supported"));
        }
        throw new Error(t("toolbar.feedback.failed"));
    }

    const targetKey = String(targetId);
    const runPostSetLocationFlow = async (): Promise<void> => {
        if (!moveData) {
            await client.verify([targetKey]);
            await watchVerifyCompletion(client, targetKey);
        }

        if (shouldRestoreRunningState) {
            const resumeOutcome = await dispatchEnsureActive(TorrentIntents.ensureActive(targetId));
            if (resumeOutcome.status !== "applied") {
                throw new Error(t("toolbar.feedback.failed"));
            }
        }
    };

    // Keep modal flow responsive: post-set-location follow-up is async and can take minutes.
    void runPostSetLocationFlow().catch((error) => {
        infraLogger.warn(
            {
                scope: "set_location",
                event: "post_set_location_flow_failed",
                message: "Post set-location flow failed",
                details: {
                    torrentId: targetKey,
                    moveData,
                    shouldRestoreRunningState,
                },
            },
            error,
        );
    });
}
