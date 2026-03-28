import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { useSession } from "@/app/context/SessionContext";
import { useEngineSessionDomain } from "@/app/providers/engineDomains";
import {
    applySetDownloadLocation,
    pickSetDownloadLocationDirectory,
    resolveSetDownloadLocationPath,
} from "@/modules/dashboard/utils/applySetDownloadLocation";
import {
    resolveSetDownloadLocationPolicy,
    type SetDownloadLocationPolicy,
} from "@/modules/dashboard/domain/torrentRelocation";
import { useDownloadPaths } from "@/app/hooks/useDownloadPaths";
import { useDirectoryPicker } from "@/app/hooks/useDirectoryPicker";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";

export interface UseSetDownloadLocationFlowParams {
    torrent: Torrent | null | undefined;
    setDownloadLocation: (params: {
        torrent: Torrent;
        path: string;
    }) => Promise<TorrentCommandOutcome>;
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
}: UseSetDownloadLocationFlowParams): UseSetDownloadLocationFlowResult {
    const { t } = useTranslation();
    const {
        refreshSessionSettings,
        sessionSettings,
    } = useSession();
    const sessionDomain = useEngineSessionDomain();
    const { canPickDirectory, pickDirectory } = useDirectoryPicker();
    const { remember } = useDownloadPaths();

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
                setDownloadLocation,
                t,
            });
            const nextDownloadDir = path.trim();
            remember(nextDownloadDir);
            if (
                !nextDownloadDir ||
                nextDownloadDir === sessionSettings?.["download-dir"]?.trim()
            ) {
                return;
            }
            try {
                await sessionDomain.updateSessionSettings({
                    "download-dir": nextDownloadDir,
                });
                await refreshSessionSettings();
            } catch {
                // Keep the relocate action successful even if the default path sync fails.
            }
        },
        [
            remember,
            refreshSessionSettings,
            setDownloadLocation,
            sessionDomain,
            sessionSettings,
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

