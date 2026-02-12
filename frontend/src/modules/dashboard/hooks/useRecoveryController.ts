import {
    useCallback,
    useMemo,
} from "react";
import type { MutableRefObject } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import {
    clearVerifyGuardEntry,
} from "@/services/recovery/recovery-controller";
import {
    clearProbe as clearCachedProbe,
} from "@/services/recovery/missingFilesStore";
import type {
    LocationEditorState,
    OpenRecoveryModalOutcome,
    RecoverySessionInfo,
    SetLocationConfirmOutcome,
    SetLocationCapability,
    SetLocationOptions,
    SetLocationOutcome,
} from "@/app/context/RecoveryContext";
import { useUiModeCapabilities } from "@/app/context/SessionContext";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import { getRecoveryFingerprint } from "@/app/domain/recoveryUtils";
import { useRecoveryModal } from "@/modules/dashboard/hooks/useRecoveryModal";
import { useLocationEditor } from "@/modules/dashboard/hooks/useLocationEditor";
import { useRecoveryActions } from "@/modules/dashboard/hooks/useRecoveryActions";
import { useRecoveryState } from "@/modules/dashboard/hooks/useRecoveryState";
import { isActionableRecoveryErrorClass } from "@/services/recovery/errorClassificationGuards";
import type {
    RecoverySessionViewState,
    ResumeRecoveryCommandOutcome,
    RetryRecoveryCommandOutcome,
} from "@/modules/dashboard/hooks/useRecoveryController.types";

export type {
    ResumeRecoveryCommandOutcome,
    RetryRecoveryCommandOutcome,
} from "@/modules/dashboard/hooks/useRecoveryController.types";

interface RecoveryControllerServices {
    client: EngineAdapter;
}

interface RecoveryControllerData {
    torrents: Array<Torrent | TorrentDetail>;
    detailData: TorrentDetail | null;
}

interface RecoveryControllerRefreshDeps {
    refreshTorrents: () => Promise<void>;
    refreshSessionStatsData: () => Promise<void>;
    refreshDetailData: () => Promise<void>;
    clearDetail: () => void;
    pendingDeletionHashesRef: MutableRefObject<Set<string>>;
}

interface UseRecoveryControllerParams {
    services: RecoveryControllerServices;
    data: RecoveryControllerData;
    refresh: RecoveryControllerRefreshDeps;
    dispatch: (
        intent: TorrentIntentExtended,
    ) => Promise<TorrentDispatchOutcome>;
}

interface RecoveryModalActions {
    close: () => void;
    retry: () => Promise<void>;
    autoRetry: () => Promise<void>;
    recreateFolder: () => Promise<void>;
    pickPath: (path: string) => Promise<void>;
}

interface LocationEditorControls {
    state: LocationEditorState | null;
    cancel: () => void;
    release: () => void;
    confirm: () => Promise<SetLocationConfirmOutcome>;
    change: (value: string) => void;
}

interface RecoveryActions {
    executeRedownload: (
        target: Torrent | TorrentDetail,
        options?: { recreateFolder?: boolean },
    ) => Promise<void>;
    executeRetryFetch: (
        target: Torrent | TorrentDetail,
    ) => Promise<RetryRecoveryCommandOutcome>;
    resumeTorrentWithRecovery: (
        torrent: Torrent | TorrentDetail,
    ) => Promise<ResumeRecoveryCommandOutcome>;
    handlePrepareDelete: (torrent: Torrent, deleteData?: boolean) => void;
    getRecoverySessionForKey: (
        torrentKey: string | null,
    ) => RecoverySessionInfo | null;
    openRecoveryModal: (
        torrent: Torrent | TorrentDetail,
    ) => OpenRecoveryModalOutcome;
}

export interface RecoveryControllerResult {
    state: RecoverySessionViewState;
    modal: RecoveryModalActions;
    locationEditor: LocationEditorControls;
    setLocation: {
        capability: SetLocationCapability;
        handler: (
            torrent: Torrent | TorrentDetail,
            options?: SetLocationOptions,
        ) => Promise<SetLocationOutcome>;
    };
    actions: RecoveryActions;
}

export function useRecoveryController({
    services,
    data,
    refresh,
    dispatch,
}: UseRecoveryControllerParams): RecoveryControllerResult {
    const { client } = services;

    const { canBrowse, supportsManual } = useUiModeCapabilities();
    const setLocationCapability = useMemo(
        () => ({ canBrowse, supportsManual }),
        [canBrowse, supportsManual],
    );
    const { torrents, detailData } = data;
    const {
        refreshTorrents,
        refreshSessionStatsData,
        refreshDetailData,
        clearDetail,
        pendingDeletionHashesRef,
    } = refresh;

    const recoveryStateController = useRecoveryState({
        torrents,
        detailData,
    });
    const {
        state: recoveryState,
        recoverySession,
        withRecoveryBusy,
        finalizeRecovery,
        cancelPendingRecoveryQueue,
        cancelRecoveryForFingerprint,
        isRecoverySessionActive,
        hasActiveRecoveryRequest,
        abortActiveRecoveryRequest,
    } = recoveryStateController;

    const {
        resolveRecoverySession,
        resumeTorrentWithRecovery,
        executeRedownload,
        executeRetryFetch,
    } = useRecoveryActions({
        client,
        torrents,
        detailData,
        dispatch,
        refreshTorrents,
        refreshSessionStatsData,
        refreshDetailData,
        recoveryState: recoveryStateController,
    });

    const {
        handleRecoveryClose,
        handleRecoveryRetry,
        handleRecoveryAutoRetry,
        handleRecoveryRecreateFolder,
        handleRecoveryPickPath,
        recoveryRequestBrowse,
        setLocationAndRecover,
    } = useRecoveryModal({
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
    });

    const {
        setLocationEditorState,
        cancelSetLocationEditor,
        releaseSetLocationEditor,
        confirmSetLocation,
        handleSetLocationInputChange,
        handleSetLocation,
    } = useLocationEditor({
        torrents,
        detailData,
        recoverySession,
        recoveryRequestBrowse,
        setLocationAndRecover,
    });
    const handlePrepareDelete = useCallback(
        (torrent: Torrent, deleteData = false) => {
            void deleteData;
            const targetId = torrent.id ?? torrent.hash;
            const key = getRecoveryFingerprint(torrent);
            if (!targetId || !key) return;
            const normalizedHash = torrent.hash?.toLowerCase();
            if (normalizedHash) {
                pendingDeletionHashesRef.current.add(normalizedHash);
            }
            if (detailData && getRecoveryFingerprint(detailData) === key) {
                clearDetail();
            }
            clearVerifyGuardEntry(key);
            clearCachedProbe(key);
            cancelRecoveryForFingerprint(key, { status: "cancelled" });
        },
        [
            cancelRecoveryForFingerprint,
            clearDetail,
            detailData,
            pendingDeletionHashesRef,
        ],
    );

    const getRecoverySessionForKey = useCallback(
        (torrentKey: string | null) => {
            if (!torrentKey || !recoverySession) return null;
            const sessionKey = getRecoveryFingerprint(recoverySession.torrent);
            if (!sessionKey) return null;
            return sessionKey === torrentKey ? recoverySession : null;
        },
        [recoverySession],
    );

    const openRecoveryModal = useCallback(
        (torrent: Torrent | TorrentDetail): OpenRecoveryModalOutcome => {
            const envelope = torrent.errorEnvelope;
            if (!envelope || !isActionableRecoveryErrorClass(envelope.errorClass)) {
                return { status: "not_actionable" };
            }

            const fingerprint = getRecoveryFingerprint(torrent);
            if (isRecoverySessionActive(fingerprint)) {
                return { status: "already_open" };
            }
            // Reuse the same recovery gate path as all resume entry points:
            // auto-recover when possible, show/queue modal only when required.
            const completion = resumeTorrentWithRecovery(torrent);
            return {
                status: "requested",
                completion,
            };
        },
        [isRecoverySessionActive, resumeTorrentWithRecovery],
    );

    return {
        state: recoveryState,
        modal: {
            close: handleRecoveryClose,
            retry: handleRecoveryRetry,
            autoRetry: handleRecoveryAutoRetry,
            recreateFolder: handleRecoveryRecreateFolder,
            pickPath: handleRecoveryPickPath,
        },
        locationEditor: {
            state: setLocationEditorState,
            cancel: cancelSetLocationEditor,
            release: releaseSetLocationEditor,
            confirm: confirmSetLocation,
            change: handleSetLocationInputChange,
        },
        setLocation: {
            capability: setLocationCapability,
            handler: handleSetLocation,
        },
        actions: {
            executeRedownload,
            executeRetryFetch,
            resumeTorrentWithRecovery,
            handlePrepareDelete,
            getRecoverySessionForKey,
            openRecoveryModal,
        },
    };
}

export default useRecoveryController;
