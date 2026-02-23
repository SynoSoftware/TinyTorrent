import { useCallback } from "react";
import type { RecoverySessionInfo } from "@/app/context/RecoveryContext";
import type { SetLocationExecutionMode } from "@/app/context/RecoveryContext";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { RecoveryGateOutcome } from "@/app/types/recoveryGate";
import { useUiModeCapabilities } from "@/app/context/SessionContext";
import type { ResumeRecoveryCommandOutcome, RetryRecoveryCommandOutcome } from "@/modules/dashboard/hooks/useRecoveryController.types";
import { shellAgent } from "@/app/agents/shell-agent";
import { RECOVERY_PICK_PATH_SUCCESS_DELAY_MS } from "@/config/logic";

interface UseRecoveryModalParams {
    recoverySession: RecoverySessionInfo | null;
    withRecoveryBusy: <T>(action: () => Promise<T>) => Promise<T>;
    executeRetryFetch: (target: Torrent | TorrentDetail) => Promise<RetryRecoveryCommandOutcome>;
    executeCooldownGatedAutoRetry: (
        target: Torrent | TorrentDetail,
    ) => Promise<void>;
    applyTorrentLocation: (
        torrent: Torrent | TorrentDetail,
        path: string,
        moveData: boolean,
    ) => Promise<ResumeRecoveryCommandOutcome>;
    resolveRecoverySession: (
        torrent: Torrent | TorrentDetail,
        options?: {
            recreateFolder?: boolean;
            notifyDriveDetected?: boolean;
            deferFinalizeMs?: number;
            delayAfterSuccessMs?: number;
        },
    ) => Promise<boolean>;
    hasActiveRecoveryRequest: () => boolean;
    abortActiveRecoveryRequest: () => void;
    finalizeRecovery: (result: RecoveryGateOutcome) => void;
    resumeTorrentWithRecovery: (
        torrent: Torrent | TorrentDetail,
        uiOptions?: { suppressFeedback?: boolean },
    ) => Promise<ResumeRecoveryCommandOutcome>;
}

interface UseRecoveryModalResult {
    handleRecoveryClose: () => void;
    handleRecoveryRetry: () => Promise<void>;
    handleRecoveryAutoRetry: () => Promise<void>;
    handleRecoveryRecreateFolder: () => Promise<void>;
    handleRecoveryPickPath: (path: string) => Promise<void>;
    recoveryRequestBrowse: (currentPath?: string | null) => Promise<{ status: "picked"; path: string } | { status: "cancelled" } | { status: "failed" } | null>;
    setLocationAndRecover: (
        torrent: Torrent | TorrentDetail,
        path: string,
        mode: SetLocationExecutionMode,
    ) => Promise<ResumeRecoveryCommandOutcome>;
}

export function useRecoveryModal({
    recoverySession,
    withRecoveryBusy,
    executeRetryFetch,
    executeCooldownGatedAutoRetry,
    applyTorrentLocation,
    resolveRecoverySession,
    hasActiveRecoveryRequest,
    abortActiveRecoveryRequest,
    finalizeRecovery,
    resumeTorrentWithRecovery,
}: UseRecoveryModalParams): UseRecoveryModalResult {
    const { canBrowse } = useUiModeCapabilities();

    const handleRecoveryClose = useCallback(() => {
        if (!hasActiveRecoveryRequest()) return;
        abortActiveRecoveryRequest();
        finalizeRecovery({ status: "cancelled" });
    }, [abortActiveRecoveryRequest, finalizeRecovery, hasActiveRecoveryRequest]);

    const handleRecoveryRetry = useCallback(async () => {
        if (!recoverySession?.torrent) return;
        await withRecoveryBusy(async () => {
            const retryOutcome = await executeRetryFetch(recoverySession.torrent);
            if (retryOutcome.shouldCloseModal) {
                handleRecoveryClose();
            }
        });
    }, [executeRetryFetch, recoverySession, handleRecoveryClose, withRecoveryBusy]);

    const handleRecoveryAutoRetry = useCallback(async () => {
        if (!recoverySession?.torrent) return;
        await executeCooldownGatedAutoRetry(recoverySession.torrent);
    }, [executeCooldownGatedAutoRetry, recoverySession]);

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
                const next = await shellAgent.browseDirectory(currentPath ?? undefined);
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
                // Build a torrent snapshot that points to the new path.
                // resolveRecoverySession → recoverMissingFiles will call
                // setTorrentLocation on the engine using this path.
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
        [recoverySession, resolveRecoverySession, withRecoveryBusy],
    );

    const setLocationAndRecover = useCallback(
        async (
            torrent: Torrent | TorrentDetail,
            path: string,
            mode: SetLocationExecutionMode,
        ): Promise<ResumeRecoveryCommandOutcome> => {
            if (mode === "move_data") {
                return applyTorrentLocation(torrent, path, true);
            }
            const updatedTorrent: Torrent | TorrentDetail = {
                ...torrent,
                downloadDir: path,
                savePath: path,
            };
            const outcome = await resumeTorrentWithRecovery(updatedTorrent);
            if (outcome.status !== "applied") {
                return outcome;
            }
            return {
                status: "applied",
                awaitingRecovery: true,
            };
        },
        [applyTorrentLocation, resumeTorrentWithRecovery],
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
