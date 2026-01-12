import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useCallback,
} from "react";
import type { ReactNode } from "react";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { useTransmissionSession } from "@/app/hooks/useTransmissionSession";
import { useTorrentData } from "@/modules/dashboard/hooks/useTorrentData";
import { useTorrentDetail } from "@/modules/dashboard/hooks/useTorrentDetail";
import { useSessionStats } from "@/app/hooks/useSessionStats";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import { useRecoveryGate } from "@/app/context/RecoveryGateContext";
import { useTorrentActions } from "@/modules/dashboard/hooks/useTorrentActions";
import { useTranslation } from "react-i18next";
import { NativeShell } from "@/app/runtime";
import { STATUS } from "@/shared/status";
import { useLifecycle } from "@/app/context/LifecycleContext";

export interface TorrentActions {
    executeTorrentAction: (
        action: TorrentTableAction,
        torrent: Torrent,
        options?: { deleteData?: boolean }
    ) => Promise<void>;
    handleOpenFolder: (torrent: Torrent) => Promise<void>;
    executeBulkRemove: (ids: string[], deleteData: boolean) => Promise<void>;
    setLocation: (torrent: any) => Promise<void>;
    redownload: (
        torrent: any,
        options?: { recreateFolder?: boolean }
    ) => Promise<void>;
    resume: (torrent: any) => Promise<void>;
    // Optional recovery helpers (may be undefined depending on host)
    pickPath?: (torrent: Torrent, path: string) => Promise<void>;
    browse?: (
        torrent: Torrent,
        current?: string | null
    ) => Promise<string | null>;
    recreate?: (torrent: Torrent) => Promise<void>;
}

const TorrentActionsContext = createContext<TorrentActions | null>(null);

export function TorrentActionsProvider({ children }: { children: ReactNode }) {
    const client = useTorrentClient();
    const lifecycle = useLifecycle();
    const {
        rpcStatus,
        reportCommandError,
        markTransportConnected,
        reportReadError,
    } = useTransmissionSession(client);
    const isMountedRef = useRef(true);
    useEffect(
        () => () => {
            isMountedRef.current = false;
        },
        []
    );

    const pollingIntervalMs = 1500;
    const { refresh: refreshTorrents, queueActions } = useTorrentData({
        client,
        sessionReady: rpcStatus === STATUS.connection.CONNECTED,
        pollingIntervalMs,
        markTransportConnected,
        reportReadError,
    });

    const { refreshDetailData } = useTorrentDetail({
        torrentClient: client,
        reportReadError,
        isMountedRef,
        sessionReady: rpcStatus === STATUS.connection.CONNECTED,
    });

    const { refreshSessionStatsData } = useSessionStats({
        torrentClient: client,
        reportReadError,
        isMountedRef,
        sessionReady: rpcStatus === STATUS.connection.CONNECTED,
    });

    const { showFeedback } = useActionFeedback();
    const recovery = useRecoveryGate();
    const { t } = useTranslation();

    const { handleTorrentAction, handleOpenFolder, executeBulkRemove } =
        useTorrentActions({
            torrentClient: client,
            queueActions,
            refreshTorrents,
            refreshDetailData,
            refreshSessionStatsData,
            reportCommandError,
            isMountedRef,
            requestRecovery: recovery?.requestRecovery,
            showFeedback,
        });

    const pickPath = useCallback(
        async (torrent: any, path: string) => {
            try {
                await client.setTorrentLocation?.(torrent.id, path, false);
            } catch (err) {
                reportCommandError?.(err);
                throw err;
            }
            try {
                await client.resume?.([torrent.id]);
            } catch {}
            await refreshTorrents();
            await refreshSessionStatsData();
            await refreshDetailData();
        },
        [
            client,
            reportCommandError,
            refreshTorrents,
            refreshSessionStatsData,
            refreshDetailData,
        ]
    );

    const setLocation = useCallback(
        async (torrent: any) => {
            if (!torrent) return;
            try {
                // Ask recovery gate first for setLocation-sensitive torrents
                if (recovery?.requestRecovery) {
                    const gateResult = await recovery.requestRecovery({
                        torrent,
                        action: "setLocation",
                    });
                    if (gateResult && gateResult.status !== "continue") {
                        if (gateResult.status === "handled") {
                            showFeedback(
                                t("recovery.feedback.download_resumed"),
                                "info"
                            );
                            await refreshTorrents();
                            await refreshSessionStatsData();
                            await refreshDetailData();
                        }
                        return;
                    }
                }

                // Open folder picker (native if available)
                const picked = NativeShell.isAvailable
                    ? await NativeShell.openFolderDialog(
                          torrent.savePath ?? undefined
                      )
                    : null;
                if (!picked) return;

                try {
                    const controllerPick =
                        recovery?.recoveryCallbacks?.handlePickPath;
                    if (controllerPick) {
                        const out = await controllerPick(picked);
                        if (out.kind === "error") {
                            reportCommandError?.(
                                out.message ??
                                    "setTorrentLocation failed via controller"
                            );
                            return;
                        }
                    } else {
                        await client.setTorrentLocation?.(
                            torrent.id,
                            picked,
                            false
                        );
                    }
                } catch (err) {
                    reportCommandError?.(err);
                    throw err;
                }

                try {
                    await client.resume?.([torrent.id]);
                } catch {}

                await refreshTorrents();
                await refreshSessionStatsData();
                await refreshDetailData();
            } catch (err) {
                // Report and rethrow for upstream handlers
                reportCommandError?.(err);
                throw err;
            }
        },
        [
            client,
            recovery,
            showFeedback,
            t,
            reportCommandError,
            refreshTorrents,
            refreshSessionStatsData,
            refreshDetailData,
        ]
    );

    const _browseImpl = useCallback(
        async (_torrent: any, current?: string | null) => {
            try {
                return (
                    (await NativeShell.openFolderDialog(
                        current ?? undefined
                    )) ?? null
                );
            } catch {
                return null;
            }
        },
        []
    );
    const browse = NativeShell.isAvailable ? _browseImpl : undefined;

    const recreate = useCallback(
        async (torrent: any) => {
            try {
                if (recovery?.requestRecovery) {
                    const gateResult = await recovery.requestRecovery({
                        torrent,
                        action: "redownload",
                    });
                    if (gateResult && gateResult.status !== "continue") {
                        if (gateResult.status === "handled") {
                            showFeedback(
                                t("recovery.feedback.download_resumed"),
                                "info"
                            );
                            await refreshTorrents();
                            await refreshSessionStatsData();
                            await refreshDetailData();
                        }
                        return;
                    }
                }
            } catch (err) {
                reportCommandError?.(err);
            }
        },
        [
            recovery,
            showFeedback,
            t,
            refreshTorrents,
            refreshSessionStatsData,
            refreshDetailData,
            reportCommandError,
        ]
    );

    const redownloadInFlightRef = useRef<Set<string>>(new Set());

    const redownload = useCallback(
        async (torrent: any) => {
            if (!torrent) return;
            const key =
                torrent.errorEnvelope?.fingerprint ??
                String(torrent.id ?? torrent.hash);
            if (redownloadInFlightRef.current.has(key)) return;
            redownloadInFlightRef.current.add(key);
            try {
                if (!recovery?.requestRecovery) {
                    return;
                }
                const gateResult = await recovery.requestRecovery({
                    torrent,
                    action: "redownload",
                });
                if (gateResult && gateResult.status !== "continue") {
                    if (gateResult.status === "handled") {
                        showFeedback(
                            t("recovery.feedback.download_resumed"),
                            "info"
                        );
                        await refreshTorrents();
                        await refreshSessionStatsData();
                        await refreshDetailData();
                    }
                    return;
                }
            } catch (err) {
                reportCommandError?.(err);
            } finally {
                redownloadInFlightRef.current.delete(key);
            }
        },
        [
            recovery,
            showFeedback,
            t,
            refreshTorrents,
            refreshSessionStatsData,
            refreshDetailData,
            reportCommandError,
        ]
    );

    const resume = useCallback(
        async (torrent: any) => {
            if (!torrent) return;
            try {
                await handleTorrentAction("resume", torrent);
            } catch (err) {
                reportCommandError?.(err);
                throw err;
            }
        },
        [handleTorrentAction, reportCommandError]
    );

    const value: TorrentActions = useMemo(
        () => ({
            executeTorrentAction: handleTorrentAction,
            handleOpenFolder,
            executeBulkRemove,
            setLocation,
            redownload,
            resume,
            pickPath,
            browse,
            recreate,
        }),
        [
            handleTorrentAction,
            handleOpenFolder,
            executeBulkRemove,
            setLocation,
            redownload,
            resume,
            pickPath,
            browse,
            recreate,
        ]
    );

    // Provider owns action implementations; no global mutable escape hatch.

    return (
        <TorrentActionsContext.Provider value={value}>
            {children}
        </TorrentActionsContext.Provider>
    );
}

export function useTorrentActionsContext(): TorrentActions {
    const ctx = useContext(TorrentActionsContext);
    if (!ctx) {
        throw new Error(
            "useTorrentActionsContext must be used within TorrentActionsProvider"
        );
    }
    return ctx;
}

export default TorrentActionsContext;
