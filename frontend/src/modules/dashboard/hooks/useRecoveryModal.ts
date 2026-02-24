import { useCallback } from "react";
import type { RecoverySessionInfo } from "@/app/context/RecoveryContext";
import type { SetLocationExecutionMode } from "@/app/context/RecoveryContext";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { RecoveryGateOutcome } from "@/app/types/recoveryGate";
import type { ResumeRecoveryCommandOutcome, RetryRecoveryCommandOutcome } from "@/modules/dashboard/hooks/useRecoveryController.types";

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
    hasActiveRecoveryRequest: () => boolean;
    abortActiveRecoveryRequest: () => void;
    finalizeRecovery: (result: RecoveryGateOutcome) => void;
    resumeTorrentWithRecovery: (
        torrent: Torrent | TorrentDetail,
        uiOptions?: { suppressFeedback?: boolean; bypassActiveRequestDedup?: boolean },
    ) => Promise<ResumeRecoveryCommandOutcome>;
}

interface UseRecoveryModalResult {
    handleRecoveryClose: () => void;
    handleRecoveryRetry: () => Promise<void>;
    handleRecoveryAutoRetry: () => Promise<void>;
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
    hasActiveRecoveryRequest,
    abortActiveRecoveryRequest,
    finalizeRecovery,
    resumeTorrentWithRecovery,
}: UseRecoveryModalParams): UseRecoveryModalResult {
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
            const outcome = await resumeTorrentWithRecovery(updatedTorrent, {
                suppressFeedback: true,
                bypassActiveRequestDedup: true,
            });
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
        setLocationAndRecover,
    };
}
