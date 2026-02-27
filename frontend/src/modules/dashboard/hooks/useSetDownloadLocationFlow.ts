import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
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
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";

export interface UseSetDownloadLocationFlowParams {
    torrent: Torrent | null | undefined;
    setDownloadLocation: (params: {
        torrent: Torrent;
        path: string;
    }) => Promise<TorrentCommandOutcome>;
    dispatchEnsureActive: (
        intent: TorrentIntentExtended,
    ) => Promise<TorrentDispatchOutcome>;
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
    setDownloadLocation,
    dispatchEnsureActive,
}: UseSetDownloadLocationFlowParams): UseSetDownloadLocationFlowResult {
    const { t } = useTranslation();
    const { canPickDirectory, pickDirectory } = useDirectoryPicker();
    const client = useTorrentClient();

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
                dispatchEnsureActive,
                t,
            });
        },
        [
            client,
            dispatchEnsureActive,
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

