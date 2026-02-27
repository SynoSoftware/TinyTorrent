import type { TFunction } from "i18next";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { resolveTorrentPath } from "@/modules/dashboard/utils/torrentPaths";
type SetDownloadLocationCommand = (params: {
    torrent: Torrent;
    path: string;
}) => Promise<TorrentCommandOutcome>;

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
    setDownloadLocation,
    t,
}: {
    torrent: Torrent;
    path: string;
    setDownloadLocation: SetDownloadLocationCommand;
    t: TFunction;
}): Promise<void> {
    const requestedPath = path.trim();

    const setLocationOutcome = await setDownloadLocation({
        torrent,
        path: requestedPath,
    });
    if (setLocationOutcome.status !== "success") {
        if (setLocationOutcome.status === "unsupported") {
            throw new Error(t("torrent_modal.controls.not_supported"));
        }
        throw new Error(t("toolbar.feedback.failed"));
    }
}

