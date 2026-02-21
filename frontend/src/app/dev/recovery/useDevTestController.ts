import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type {
    RecoveryConfidence,
    TorrentDetailEntity,
} from "@/services/rpc/entities";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import type {
    DownloadMissingOutcome,
    OpenRecoveryModalOutcome,
    RecoverySessionInfo,
} from "@/app/context/RecoveryContext";
import { STATUS } from "@/shared/status";
import { useRecoveryController } from "@/modules/dashboard/hooks/useRecoveryController";
import { useRecoveryModalViewModel } from "@/app/viewModels/workspaceShell/recoveryViewModels";
import { DevTestAdapter } from "@/app/dev/recovery/adapter";
import {
    cloneDevTorrentDetail,
    createDevScenarioTorrent,
    DEV_TEST_SCENARIOS,
    DEV_RECOVERY_TORRENT_ID,
    devRecoveryScenarioById,
    type DevTestFaultMode,
    type DevTestScenarioId,
} from "@/app/dev/recovery/scenarios";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export type ApplyRecoveryScenarioParams = {
    scenarioId: DevTestScenarioId;
    confidence: RecoveryConfidence;
    faultMode?: DevTestFaultMode;
    verifyFails?: boolean;
};

export type DevTestOpenOutcome =
    | OpenRecoveryModalOutcome
    | { status: "missing_detail" };

export interface DevTestController {
    selectedScenarioId: DevTestScenarioId;
    setSelectedScenarioId: (value: DevTestScenarioId) => void;
    selectedConfidence: RecoveryConfidence;
    setSelectedConfidence: (value: RecoveryConfidence) => void;
    faultMode: DevTestFaultMode;
    setFaultMode: (value: DevTestFaultMode) => void;
    verifyFails: boolean;
    setVerifyFails: (value: boolean) => void;
    lastOpenOutcome: string | null;
    detailData: TorrentDetail | null;
    currentStateLabel: string;
    isModalOpen: boolean;
    recoveryModalViewModel: ReturnType<typeof useRecoveryModalViewModel>;
    applyScenarioPreset: (params: ApplyRecoveryScenarioParams) => Promise<void>;
    applySelectedScenario: () => Promise<void>;
    openRecoveryForCurrentDetail: () => DevTestOpenOutcome;
    openRecoveryForTorrent: (
        torrent: Torrent | TorrentDetail,
    ) => OpenRecoveryModalOutcome;
    setFaultModeLive: (mode: DevTestFaultMode) => Promise<void>;
    getTorrentDetail: (id: string) => Promise<TorrentDetailEntity>;
    closeRecoveryModal: () => void;
    releaseLocationEditor: () => void;
    autoRetryRecovery: () => Promise<void>;
    getRecoverySession: () => RecoverySessionInfo | null;
    isRecoveryBusy: () => boolean;
    isPrimaryActionDisabled: () => boolean;
}

export function useDevTestController({
    t,
}: {
    t: TranslateFn;
}): DevTestController {
    const [selectedScenarioId, setSelectedScenarioId] =
        useState<DevTestScenarioId>("path_loss");
    const [selectedConfidence, setSelectedConfidence] =
        useState<RecoveryConfidence>("certain");
    const [faultMode, setFaultMode] = useState<DevTestFaultMode>("missing");
    const [verifyFails, setVerifyFails] = useState<boolean>(false);
    const [lastOpenOutcome, setLastOpenOutcome] = useState<string | null>(null);

    const initialScenario =
        DEV_TEST_SCENARIOS.find((item) => item.id === "path_loss") ??
        DEV_TEST_SCENARIOS[0];
    const initialTorrent = useMemo(
        () => createDevScenarioTorrent(initialScenario, "certain"),
        [initialScenario],
    );
    const adapter = useMemo(() => {
        const instance = new DevTestAdapter(
            initialTorrent,
            initialScenario.faultMode,
        );
        instance.configure({
            detail: initialTorrent,
            faultMode: initialScenario.faultMode,
            verifyFails: Boolean(initialScenario.verifyFailsByDefault),
        });
        return instance;
    }, [initialScenario, initialTorrent]);

    const [torrents, setTorrents] = useState<Array<Torrent | TorrentDetail>>([
        cloneDevTorrentDetail(initialTorrent),
    ]);
    const [detailData, setDetailData] = useState<TorrentDetail | null>(
        cloneDevTorrentDetail(initialTorrent),
    );
    const pendingDeletionHashesRef = useRef<Set<string>>(new Set());

    const refreshTorrents = useCallback(async () => {
        const next = await adapter.getTorrents();
        setTorrents(next.map((torrent) => cloneDevTorrentDetail(torrent)));
    }, [adapter]);

    const refreshDetailData = useCallback(async () => {
        try {
            const next = await adapter.getTorrentDetails(
                DEV_RECOVERY_TORRENT_ID,
            );
            setDetailData(cloneDevTorrentDetail(next));
        } catch {
            setDetailData(null);
        }
    }, [adapter]);

    const refreshSessionStatsData = useCallback(async () => {
        // Keep recovery controller wiring aligned with production flow:
        // session stats refresh is a real async call, not a silent no-op.
        await adapter.getSessionStats();
    }, [adapter]);

    const clearDetail = useCallback(() => {
        setDetailData(null);
    }, []);

    const dispatch = useCallback(
        async (
            intent: TorrentIntentExtended,
        ): Promise<TorrentDispatchOutcome> => {
            try {
                if (intent.type === "ENSURE_TORRENT_ACTIVE") {
                    await adapter.resume([String(intent.torrentId)]);
                    await refreshTorrents();
                    await refreshDetailData();
                    return { status: "applied" };
                }
                if (intent.type === "ENSURE_TORRENT_AT_LOCATION") {
                    if (!adapter.setTorrentLocation) {
                        return {
                            status: "unsupported",
                            reason: "method_missing",
                        };
                    }
                    await adapter.setTorrentLocation(
                        String(intent.torrentId),
                        intent.path,
                        intent.moveData ?? false,
                    );
                    await refreshTorrents();
                    await refreshDetailData();
                    return { status: "applied" };
                }
                return {
                    status: "unsupported",
                    reason: "intent_unsupported",
                };
            } catch {
                return {
                    status: "failed",
                    reason: "execution_failed",
                };
            }
        },
        [adapter, refreshDetailData, refreshTorrents],
    );

    const recovery = useRecoveryController({
        services: { client: adapter },
        data: { torrents, detailData },
        refresh: {
            refreshTorrents,
            refreshSessionStatsData,
            refreshDetailData,
            clearDetail,
            pendingDeletionHashesRef,
        },
        dispatch,
        updateOperationOverlays: () => {},
    });

    const handleDownloadMissing = useCallback(
        async (
            torrent: Torrent,
            options?: { recreateFolder?: boolean },
        ): Promise<DownloadMissingOutcome> => {
            const outcome = await recovery.actions.executeDownloadMissing(
                torrent,
                options,
            );
            await refreshTorrents();
            await refreshDetailData();
            return outcome;
        },
        [recovery.actions, refreshDetailData, refreshTorrents],
    );

    const recoveryModalViewModel = useRecoveryModalViewModel({
        t,
        recoverySession: recovery.state.session,
        isBusy: recovery.state.isBusy,
        onClose: recovery.modal.close,
        onRecreate: recovery.modal.recreateFolder,
        onAutoRetry: recovery.modal.autoRetry,
        locationEditor: recovery.locationEditor,
        setLocationCapability: recovery.setLocation.capability,
        handleSetLocation: recovery.setLocation.handler,
        handleDownloadMissing,
        queuedCount: recovery.state.queuedCount,
        queuedItems: recovery.state.queuedItems,
    });

    const recoverySessionRef = useRef(recovery.state.session);
    const recoveryBusyRef = useRef(recovery.state.isBusy);
    const recoveryModalViewModelRef = useRef(recoveryModalViewModel);
    const detailDataRef = useRef(detailData);

    useEffect(() => {
        recoverySessionRef.current = recovery.state.session;
    }, [recovery.state.session]);

    useEffect(() => {
        recoveryBusyRef.current = recovery.state.isBusy;
    }, [recovery.state.isBusy]);

    useEffect(() => {
        recoveryModalViewModelRef.current = recoveryModalViewModel;
    }, [recoveryModalViewModel]);

    useEffect(() => {
        detailDataRef.current = detailData;
    }, [detailData]);

    const applyScenarioPreset = useCallback(
        async (params: ApplyRecoveryScenarioParams) => {
            const scenario =
                devRecoveryScenarioById.get(params.scenarioId) ??
                DEV_TEST_SCENARIOS[0];
            const nextFaultMode = params.faultMode ?? scenario.faultMode;
            const nextVerifyFails =
                params.verifyFails ?? Boolean(scenario.verifyFailsByDefault);
            const nextTorrent = createDevScenarioTorrent(
                scenario,
                params.confidence,
            );

            setSelectedScenarioId(params.scenarioId);
            setSelectedConfidence(params.confidence);
            setFaultMode(nextFaultMode);
            setVerifyFails(nextVerifyFails);

            adapter.configure({
                detail: nextTorrent,
                faultMode: nextFaultMode,
                verifyFails: nextVerifyFails,
            });
            recovery.locationEditor.release();
            recovery.modal.close();
            await refreshTorrents();
            setDetailData(cloneDevTorrentDetail(nextTorrent));
            setLastOpenOutcome(null);
        },
        [adapter, recovery.locationEditor, recovery.modal, refreshTorrents],
    );

    const applySelectedScenario = useCallback(async () => {
        await applyScenarioPreset({
            scenarioId: selectedScenarioId,
            confidence: selectedConfidence,
            faultMode,
            verifyFails,
        });
    }, [
        applyScenarioPreset,
        faultMode,
        selectedConfidence,
        selectedScenarioId,
        verifyFails,
    ]);

    const openRecoveryForTorrent = useCallback(
        (torrent: Torrent | TorrentDetail): OpenRecoveryModalOutcome => {
            const outcome = recovery.actions.openRecoveryModal(torrent);
            setLastOpenOutcome(outcome.status);
            return outcome;
        },
        [recovery.actions],
    );

    const openRecoveryForCurrentDetail = useCallback((): DevTestOpenOutcome => {
        const currentDetail = detailDataRef.current;
        if (!currentDetail) {
            return { status: "missing_detail" };
        }
        return openRecoveryForTorrent(currentDetail);
    }, [openRecoveryForTorrent]);

    const setFaultModeLive = useCallback(
        async (mode: DevTestFaultMode) => {
            adapter.setFaultMode(mode);
            setFaultMode(mode);
            await refreshTorrents();
            await refreshDetailData();
        },
        [adapter, refreshDetailData, refreshTorrents],
    );

    const getTorrentDetail = useCallback(
        async (id: string) => adapter.getTorrentDetails(id),
        [adapter],
    );

    const getRecoverySession = useCallback(
        () => recoverySessionRef.current,
        [],
    );

    const isRecoveryBusy = useCallback(() => recoveryBusyRef.current, []);

    const isPrimaryActionDisabled = useCallback(
        () => recoveryModalViewModelRef.current.primaryAction.isDisabled,
        [],
    );

    return {
        selectedScenarioId,
        setSelectedScenarioId,
        selectedConfidence,
        setSelectedConfidence,
        faultMode,
        setFaultMode,
        verifyFails,
        setVerifyFails,
        lastOpenOutcome,
        detailData,
        currentStateLabel: detailData?.state ?? STATUS.torrent.PAUSED,
        isModalOpen: Boolean(recovery.state.session),
        recoveryModalViewModel,
        applyScenarioPreset,
        applySelectedScenario,
        openRecoveryForCurrentDetail,
        openRecoveryForTorrent,
        setFaultModeLive,
        getTorrentDetail,
        closeRecoveryModal: recovery.modal.close,
        releaseLocationEditor: recovery.locationEditor.release,
        autoRetryRecovery: recovery.modal.autoRetry,
        getRecoverySession,
        isRecoveryBusy,
        isPrimaryActionDisabled,
    };
}
