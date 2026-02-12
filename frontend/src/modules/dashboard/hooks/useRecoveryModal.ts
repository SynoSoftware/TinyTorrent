import { useCallback } from "react";
import type { RecoverySessionInfo } from "@/app/context/RecoveryContext";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { RecoveryGateOutcome } from "@/app/types/recoveryGate";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import { useUiModeCapabilities } from "@/app/context/SessionContext";
import type {
    ResumeRecoveryCommandOutcome,
    RetryRecoveryCommandOutcome,
} from "@/modules/dashboard/hooks/useRecoveryController.types";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import { shellAgent } from "@/app/agents/shell-agent";
import {
    RECOVERY_MODAL_RESOLVED_AUTO_CLOSE_DELAY_MS,
    RECOVERY_PICK_PATH_SUCCESS_DELAY_MS,
} from "@/config/logic";

interface UseRecoveryModalParams {
    recoverySession: RecoverySessionInfo | null;
    withRecoveryBusy: <T>(action: () => Promise<T>) => Promise<T>;
    executeRetryFetch: (
        target: Torrent | TorrentDetail,
    ) => Promise<RetryRecoveryCommandOutcome>;
    resolveRecoverySession: (
        torrent: Torrent | TorrentDetail,
        options?: {
            recreateFolder?: boolean;
            notifyDriveDetected?: boolean;
            deferFinalizeMs?: number;
            delayAfterSuccessMs?: number;
        },
    ) => Promise<boolean>;
    dispatch: (
        intent: TorrentIntentExtended,
    ) => Promise<TorrentDispatchOutcome>;
    hasActiveRecoveryRequest: () => boolean;
    abortActiveRecoveryRequest: () => void;
    cancelPendingRecoveryQueue: (result?: RecoveryGateOutcome) => void;
    finalizeRecovery: (result: RecoveryGateOutcome) => void;
    resumeTorrentWithRecovery: (
        torrent: Torrent | TorrentDetail,
    ) => Promise<ResumeRecoveryCommandOutcome>;
}

interface UseRecoveryModalResult {
    handleRecoveryClose: () => void;
    handleRecoveryRetry: () => Promise<void>;
    handleRecoveryAutoRetry: () => Promise<void>;
    handleRecoveryRecreateFolder: () => Promise<void>;
    handleRecoveryPickPath: (path: string) => Promise<void>;
    recoveryRequestBrowse: (
        currentPath?: string | null,
    ) => Promise<
        | { status: "picked"; path: string }
        | { status: "cancelled" }
        | { status: "failed" }
        | null
    >;
    setLocationAndRecover: (
        torrent: Torrent | TorrentDetail,
        path: string,
    ) => Promise<ResumeRecoveryCommandOutcome>;
}

export function useRecoveryModal({
    recoverySession,
    withRecoveryBusy,
    executeRetryFetch,
    resolveRecoverySession,
    dispatch,
    hasActiveRecoveryRequest,
    abortActiveRecoveryRequest,
    cancelPendingRecoveryQueue,
    finalizeRecovery,
    resumeTorrentWithRecovery,
}: UseRecoveryModalParams): UseRecoveryModalResult {
    const { canBrowse } = useUiModeCapabilities();

    const handleRecoveryClose = useCallback(() => {
        if (!hasActiveRecoveryRequest()) return;
        abortActiveRecoveryRequest();
        cancelPendingRecoveryQueue({ status: "cancelled" });
        finalizeRecovery({ status: "cancelled" });
    }, [
        abortActiveRecoveryRequest,
        cancelPendingRecoveryQueue,
        finalizeRecovery,
        hasActiveRecoveryRequest,
    ]);

    const handleRecoveryRetry = useCallback(async () => {
        if (!recoverySession?.torrent) return;
        await withRecoveryBusy(async () => {
            const retryOutcome = await executeRetryFetch(
                recoverySession.torrent,
            );
            if (retryOutcome.shouldCloseModal) {
                handleRecoveryClose();
            }
        });
    }, [
        executeRetryFetch,
        recoverySession,
        handleRecoveryClose,
        withRecoveryBusy,
    ]);

    const handleRecoveryAutoRetry = useCallback(async () => {
        if (!recoverySession?.torrent) return;
        await withRecoveryBusy(async () => {
            await resolveRecoverySession(recoverySession.torrent, {
                notifyDriveDetected:
                    recoverySession.classification.kind === "volumeLoss",
                deferFinalizeMs: RECOVERY_MODAL_RESOLVED_AUTO_CLOSE_DELAY_MS,
            });
        });
    }, [recoverySession, resolveRecoverySession, withRecoveryBusy]);

    const handleRecoveryRecreateFolder = useCallback(async () => {
        if (!recoverySession?.torrent) return;
        await withRecoveryBusy(async () => {
            await resolveRecoverySession(recoverySession.torrent, {
                recreateFolder: true,
            });
        });
    }, [recoverySession, resolveRecoverySession, withRecoveryBusy]);

    const recoveryRequestBrowse = useCallback(
        async (currentPath?: string | null) => {
            if (!canBrowse) return null;
            try {
                const next = await shellAgent.browseDirectory(
                    currentPath ?? undefined,
                );
                if (!next) {
                    return { status: "cancelled" as const };
                }
                return { status: "picked" as const, path: next };
            } catch {
                return { status: "failed" as const };
            }
        },
        [canBrowse],
    );

    const handleRecoveryPickPath = useCallback(
        async (path: string) => {
            if (!recoverySession?.torrent) return;
            await withRecoveryBusy(async () => {
                const outcome = await dispatch(
                    TorrentIntents.ensureAtLocation(
                        recoverySession.torrent.id ??
                            recoverySession.torrent.hash,
                        path,
                    ),
                );
                if (outcome.status !== "applied") return;
                const updatedTorrent: Torrent | TorrentDetail = {
                    ...recoverySession.torrent,
                    downloadDir: path,
                    savePath: path,
                };
                await resolveRecoverySession(updatedTorrent, {
                    delayAfterSuccessMs: RECOVERY_PICK_PATH_SUCCESS_DELAY_MS,
                });
            });
        },
        [dispatch, recoverySession, resolveRecoverySession, withRecoveryBusy],
    );

    const setLocationAndRecover = useCallback(
        async (torrent: Torrent | TorrentDetail, path: string) => {
            const updatedTorrent: Torrent | TorrentDetail = {
                ...torrent,
                downloadDir: path,
                savePath: path,
            };
            return resumeTorrentWithRecovery(updatedTorrent);
        },
        [resumeTorrentWithRecovery],
    );

    return {
        handleRecoveryClose,
        handleRecoveryRetry,
        handleRecoveryAutoRetry,
        handleRecoveryRecreateFolder,
        handleRecoveryPickPath,
        recoveryRequestBrowse,
        setLocationAndRecover,
    };
}
