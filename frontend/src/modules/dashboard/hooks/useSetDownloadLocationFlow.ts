import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import {
    applySetDownloadLocation,
    pickSetDownloadLocationDirectory,
    resolveSetDownloadLocationPath,
} from "@/modules/dashboard/utils/applySetDownloadLocation";
import {
    resolveSetDownloadLocationPolicy,
    type SetDownloadLocationPolicy,
} from "@/modules/dashboard/domain/torrentRelocation";
import { useDirectoryPicker } from "@/app/hooks/useDirectoryPicker";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { useRequiredTorrentActions, useTorrentCommands } from "@/app/context/AppCommandContext";

export interface UseSetDownloadLocationFlowParams {
    torrent: Torrent | null | undefined;
}

export interface UseSetDownloadLocationFlowResult {
    policy: SetDownloadLocationPolicy;
    currentPath: string;
    canPickDirectory: boolean;
    pickDirectoryForSetDownloadPath: (currentPath: string) => Promise<string | null>;
    applySetDownloadPath: (params: { path: string }) => Promise<void>;
}

export function useSetDownloadLocationFlow({
    torrent,
}: UseSetDownloadLocationFlowParams): UseSetDownloadLocationFlowResult {
    const { t } = useTranslation();
    const { canPickDirectory, pickDirectory } = useDirectoryPicker();
    const client = useTorrentClient();
    const { setDownloadLocation } = useTorrentCommands();
    const { dispatch } = useRequiredTorrentActions();

    const policy = useMemo(
        () => resolveSetDownloadLocationPolicy(torrent ?? {}),
        [torrent],
    );
    const currentPath = useMemo(
        () => resolveSetDownloadLocationPath(torrent),
        [torrent],
    );

    const pickDirectoryForSetDownloadPath = useCallback(
        async (currentInput: string): Promise<string | null> =>
            pickSetDownloadLocationDirectory({
                currentPath: currentInput,
                torrent,
                canPickDirectory,
                pickDirectory,
            }),
        [canPickDirectory, pickDirectory, torrent],
    );

    const applySetDownloadPath = useCallback(
        async ({ path }: { path: string }) => {
            if (!torrent) {
                throw new Error(t("toolbar.feedback.failed"));
            }
            await applySetDownloadLocation({
                torrent,
                path,
                client,
                setDownloadLocation,
                dispatchEnsureActive: dispatch,
                t,
            });
        },
        [
            client,
            dispatch,
            setDownloadLocation,
            t,
            torrent,
        ],
    );

    return {
        policy,
        currentPath,
        canPickDirectory,
        pickDirectoryForSetDownloadPath,
        applySetDownloadPath,
    };
}
