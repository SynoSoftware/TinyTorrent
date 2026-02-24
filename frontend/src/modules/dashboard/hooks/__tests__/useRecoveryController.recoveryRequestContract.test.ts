import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import { useRecoveryController } from "@/modules/dashboard/hooks/useRecoveryController";
import * as recoveryController from "@/services/recovery/recovery-controller";
import * as recoveryGateInterpreter from "@/modules/dashboard/hooks/recoveryGateInterpreter";
import { DevTestAdapter } from "@/app/dev/recovery/adapter";
import {
    cloneDevTorrentDetail,
    createDevScenarioTorrent,
    DEV_TEST_SCENARIOS,
    type DevTestFaultMode,
    type DevTestScenarioId,
} from "@/app/dev/recovery/scenarios";
import type { TorrentDetailEntity } from "@/services/rpc/entities";
import type { RecoveryControllerResult } from "@/modules/dashboard/hooks/useRecoveryController";
import type { TorrentOperationState } from "@/shared/status";
import STATUS from "@/shared/status";
import { resetMissingFilesStore } from "@/services/recovery/missingFilesStore";
import { RECOVERY_ESCALATION_GRACE_MS } from "@/config/logic";

const reportCommandErrorMock = vi.fn();
const showFeedbackMock = vi.fn();

vi.mock("@/app/context/SessionContext", () => ({
    useSession: () => ({
        engineCapabilities: {
            executionModel: "remote",
            hasHostFileSystemAccess: false,
            canCheckFreeSpace: true,
        } as const,
        reportCommandError: reportCommandErrorMock,
    }),
    useUiModeCapabilities: () => ({
        canBrowse: true,
        supportsManual: true,
    }),
}));

vi.mock("@/app/hooks/useActionFeedback", () => ({
    useActionFeedback: () => ({
        showFeedback: showFeedbackMock,
    }),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

type RecoveryControllerRef = {
    current: RecoveryControllerResult | null;
};

type ControllerHarnessProps = {
    controllerRef: RecoveryControllerRef;
    initialDetail: TorrentDetailEntity;
    initialTorrents: TorrentDetailEntity[];
    initialFaultMode: DevTestFaultMode;
    updateOperationOverlays: (updates: Array<{ id: string; operation?: TorrentOperationState }>) => void;
};

function RecoveryControllerHarness({
    controllerRef,
    initialDetail,
    initialTorrents,
    initialFaultMode,
    updateOperationOverlays,
}: ControllerHarnessProps) {
    const adapter = useMemo(() => {
        const instance = new DevTestAdapter(initialDetail, initialFaultMode);
        instance.configure({
            detail: initialDetail,
            faultMode: initialFaultMode,
            verifyFails: false,
        });
        return instance;
    }, [initialDetail, initialFaultMode]);

    const [torrents, setTorrents] = useState<Array<Torrent | TorrentDetail>>([
        ...initialTorrents.map((torrent) => cloneDevTorrentDetail(torrent)),
    ]);
    const [detailData, setDetailData] = useState<TorrentDetail | null>(cloneDevTorrentDetail(initialDetail));
    const pendingDeletionHashesRef = useRef<Set<string>>(new Set());

    const refreshTorrents = useCallback(async () => {
        const next = await adapter.getTorrents();
        setTorrents(next.map((torrent) => cloneDevTorrentDetail(torrent)));
    }, [adapter]);

    const refreshDetailData = useCallback(async () => {
        try {
            const next = await adapter.getTorrentDetails(initialDetail.id);
            setDetailData(cloneDevTorrentDetail(next));
        } catch {
            setDetailData(null);
        }
    }, [adapter, initialDetail.id]);

    const refreshSessionStatsData = useCallback(async () => {
        await adapter.getSessionStats();
    }, [adapter]);

    const clearDetail = useCallback(() => {
        setDetailData(null);
    }, []);

    const dispatch = useCallback(
        async (intent: TorrentIntentExtended): Promise<TorrentDispatchOutcome> => {
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
                    await adapter.setTorrentLocation(String(intent.torrentId), intent.path, intent.moveData ?? false);
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

    const controller = useRecoveryController({
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
        updateOperationOverlays,
    });

    useEffect(() => {
        controllerRef.current = controller;
    }, [controller, controllerRef]);

    return null;
}

type MountedHarness = {
    controllerRef: RecoveryControllerRef;
    torrent: TorrentDetailEntity;
    updateOperationOverlaysMock: ReturnType<typeof vi.fn>;
    cleanup: () => Promise<void>;
};

type MountOptions = {
    scenarioId: DevTestScenarioId;
    faultMode?: DevTestFaultMode;
    mutateTorrent?: (torrent: TorrentDetailEntity) => TorrentDetailEntity;
    additionalTorrents?: TorrentDetailEntity[];
};

const waitForCondition = async (predicate: () => boolean, timeoutMs: number): Promise<void> => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (predicate()) return;
        await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 20);
        });
    }
    throw new Error("wait_for_condition_timeout");
};

const readController = (controllerRef: RecoveryControllerRef): RecoveryControllerResult => {
    if (!controllerRef.current) {
        throw new Error("controller_not_ready");
    }
    return controllerRef.current;
};

const mountHarness = async ({
    scenarioId,
    faultMode,
    mutateTorrent,
    additionalTorrents,
}: MountOptions): Promise<MountedHarness> => {
    const scenario = DEV_TEST_SCENARIOS.find((item) => item.id === scenarioId) ?? DEV_TEST_SCENARIOS[0];
    const baseTorrent = createDevScenarioTorrent(scenario, "certain");
    const torrent = mutateTorrent ? mutateTorrent(baseTorrent) : baseTorrent;
    const initialTorrents = [torrent, ...(additionalTorrents ?? [])];
    const controllerRef: RecoveryControllerRef = { current: null };
    const updateOperationOverlaysMock = vi.fn();

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(
        React.createElement(RecoveryControllerHarness, {
            controllerRef,
            initialDetail: torrent,
            initialTorrents,
            initialFaultMode: faultMode ?? scenario.faultMode,
            updateOperationOverlays: updateOperationOverlaysMock,
        }),
    );
    await waitForCondition(() => controllerRef.current !== null, 1_500);

    return {
        controllerRef,
        torrent,
        updateOperationOverlaysMock,
        cleanup: async () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("useRecoveryController request contract", () => {
    afterEach(() => {
        recoveryController.resetRecoveryControllerState();
        resetMissingFilesStore();
        reportCommandErrorMock.mockReset();
        showFeedbackMock.mockReset();
    });

    it("returns not_actionable when error envelope is missing", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                state: STATUS.torrent.PAUSED,
            }),
        });
        try {
            const controller = readController(mounted.controllerRef);
            const notActionableTorrent = {
                ...mounted.torrent,
                errorEnvelope: undefined,
            };
            const outcome = controller.actions.openRecoveryModal(notActionableTorrent);
            expect(outcome).toEqual({ status: "not_actionable" });
        } finally {
            await mounted.cleanup();
        }
    });

    it("opens the manual location editor when force-workbench recovery is requested", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        try {
            const controller = readController(mounted.controllerRef);
            const outcome = controller.actions.openRecoveryModal(mounted.torrent, {
                forceWorkbench: true,
            });
            expect(outcome.status).toBe("requested");
            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session), 1_500);
            await waitForCondition(
                () => Boolean(readController(mounted.controllerRef).locationEditor.state),
                1_500,
            );
            const editorState = readController(mounted.controllerRef).locationEditor.state;
            expect(editorState?.surface).toBe("recovery-modal");
            expect(editorState?.status).toBe("idle");
            if (outcome.status === "requested") {
                readController(mounted.controllerRef).modal.close();
                await expect(outcome.completion).resolves.toEqual({
                    status: "cancelled",
                });
            }
        } finally {
            await mounted.cleanup();
        }
    });

    it("routes request disposition through the recovery gate interpreter", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        const determineDispositionSpy = vi.spyOn(recoveryGateInterpreter, "determineDisposition");
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => ({
                status: "needsModal",
                classification: {
                    ...params.classification,
                    confidence: "certain",
                    escalationSignal: "none",
                },
                blockingOutcome: {
                    kind: "blocked",
                    reason: "missing",
                    message: "path_check_failed",
                },
            }));
        try {
            const outcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(outcome.status).toBe("requested");
            await waitForCondition(() => determineDispositionSpy.mock.calls.length > 0, 1_500);
            expect(determineDispositionSpy).toHaveBeenCalled();
            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session), 1_500);
            readController(mounted.controllerRef).modal.close();
            if (outcome.status === "requested") {
                await expect(outcome.completion).resolves.toEqual({
                    status: "cancelled",
                });
            }
        } finally {
            determineDispositionSpy.mockRestore();
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("returns already_open for the same fingerprint when session is active", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        try {
            const first = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(first.status).toBe("requested");
            if (first.status !== "requested") {
                throw new Error("expected_requested");
            }

            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session), 3_000);

            const second = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(second).toEqual({ status: "already_open" });

            readController(mounted.controllerRef).modal.close();
            await expect(first.completion).resolves.toEqual({
                status: "cancelled",
            });
        } finally {
            await mounted.cleanup();
        }
    });

    it("queues distinct recovery sessions and promotes the next one after close", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => ({
                status: "needsModal",
                classification: {
                    ...params.classification,
                    confidence: "certain",
                    escalationSignal: "none",
                },
                blockingOutcome: {
                    kind: "blocked",
                    reason: "missing",
                    message: "path_check_failed",
                },
            }));
        try {
            const controller = readController(mounted.controllerRef);
            const secondTorrent: TorrentDetail = {
                ...mounted.torrent,
                id: "dev-recovery-torrent-2",
                hash: "dev-recovery-hash-2",
                name: "Recovery Sample 2",
                errorEnvelope: mounted.torrent.errorEnvelope
                    ? {
                          ...mounted.torrent.errorEnvelope,
                          fingerprint: "dev-recovery-fingerprint-2",
                      }
                    : undefined,
            };

            const first = controller.actions.openRecoveryModal(mounted.torrent);
            const second = controller.actions.openRecoveryModal(secondTorrent);
            expect(first.status).toBe("requested");
            expect(second.status).toBe("requested");

            await waitForCondition(
                () => readController(mounted.controllerRef).state.session?.torrent.id === mounted.torrent.id,
                1_500,
            );
            await waitForCondition(() => readController(mounted.controllerRef).state.queuedCount === 1, 1_500);
            expect(readController(mounted.controllerRef).state.queuedItems[0]?.torrentName).toBe("Recovery Sample 2");

            readController(mounted.controllerRef).modal.close();
            if (first.status === "requested") {
                await expect(first.completion).resolves.toEqual({
                    status: "cancelled",
                });
            }

            await waitForCondition(
                () => readController(mounted.controllerRef).state.session?.torrent.id === "dev-recovery-torrent-2",
                1_500,
            );
            expect(readController(mounted.controllerRef).state.queuedCount).toBe(0);

            readController(mounted.controllerRef).modal.close();
            if (second.status === "requested") {
                await expect(second.completion).resolves.toEqual({
                    status: "cancelled",
                });
            }
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("queues batched decision-required recovery requests one-at-a-time without modal cascade", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => ({
                status: "needsModal",
                classification: {
                    ...params.classification,
                    confidence: "certain",
                    escalationSignal: "none",
                },
                blockingOutcome: {
                    kind: "blocked",
                    reason: "missing",
                    message: "path_check_failed",
                },
            }));
        try {
            const controller = readController(mounted.controllerRef);
            const secondTorrent: TorrentDetail = {
                ...mounted.torrent,
                id: "dev-recovery-torrent-2",
                hash: "dev-recovery-hash-2",
                name: "Recovery Sample 2",
                errorEnvelope: mounted.torrent.errorEnvelope
                    ? {
                          ...mounted.torrent.errorEnvelope,
                          errorClass: "permissionDenied",
                          fingerprint: "dev-recovery-fingerprint-2",
                      }
                    : undefined,
            };
            const thirdTorrent: TorrentDetail = {
                ...mounted.torrent,
                id: "dev-recovery-torrent-3",
                hash: "dev-recovery-hash-3",
                name: "Recovery Sample 3",
                errorEnvelope: mounted.torrent.errorEnvelope
                    ? {
                          ...mounted.torrent.errorEnvelope,
                          errorClass: "unknown",
                          fingerprint: "dev-recovery-fingerprint-3",
                      }
                    : undefined,
            };

            const first = controller.actions.openRecoveryModal(mounted.torrent);
            const second = controller.actions.openRecoveryModal(secondTorrent);
            const third = controller.actions.openRecoveryModal(thirdTorrent);
            expect(first.status).toBe("requested");
            expect(second.status).toBe("requested");
            expect(third.status).toBe("requested");

            await waitForCondition(
                () => readController(mounted.controllerRef).state.session?.torrent.id === mounted.torrent.id,
                1_500,
            );
            expect(readController(mounted.controllerRef).state.queuedCount).toBe(2);

            readController(mounted.controllerRef).modal.close();
            if (first.status === "requested") {
                await expect(first.completion).resolves.toEqual({
                    status: "cancelled",
                });
            }

            await waitForCondition(
                () => readController(mounted.controllerRef).state.session?.torrent.id === "dev-recovery-torrent-2",
                1_500,
            );
            expect(readController(mounted.controllerRef).state.queuedCount).toBe(1);

            readController(mounted.controllerRef).modal.close();
            if (second.status === "requested") {
                await expect(second.completion).resolves.toEqual({
                    status: "cancelled",
                });
            }

            await waitForCondition(
                () => readController(mounted.controllerRef).state.session?.torrent.id === "dev-recovery-torrent-3",
                1_500,
            );
            expect(readController(mounted.controllerRef).state.queuedCount).toBe(0);

            readController(mounted.controllerRef).modal.close();
            if (third.status === "requested") {
                await expect(third.completion).resolves.toEqual({
                    status: "cancelled",
                });
            }
            await waitForCondition(() => readController(mounted.controllerRef).state.session === null, 1_500);
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("applies escalation grace then returns blocked without opening decision modal", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          recoveryConfidence: "likely",
                      }
                    : undefined,
            }),
        });
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => ({
                status: "needsModal",
                classification: {
                    ...params.classification,
                    confidence: "likely",
                    escalationSignal: "none",
                    recommendedActions: ["downloadMissing"],
                },
                blockingOutcome: {
                    kind: "blocked",
                    reason: "missing",
                    message: "path_check_failed",
                },
            }));
        try {
            const outcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(outcome.status).toBe("requested");
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.modal.in_progress", "info", 500);
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 150);
            });
            expect(readController(mounted.controllerRef).state.session).toBeNull();
            if (outcome.status === "requested") {
                await expect(outcome.completion).resolves.toEqual({
                    status: "failed",
                    reason: "dispatch_not_applied",
                });
            }
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.status.blocked", "warning");
            const blockedFeedbackCalls = showFeedbackMock.mock.calls.filter(
                (call) => call[0] === "recovery.status.blocked" && call[1] === "warning",
            );
            expect(blockedFeedbackCalls).toHaveLength(1);
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("opens decision modal immediately when certainty requires explicit location choice", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          recoveryConfidence: "likely",
                      }
                    : undefined,
            }),
        });
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => ({
                status: "needsModal",
                classification: {
                    ...params.classification,
                    confidence: "certain",
                    recommendedActions: ["chooseLocation"],
                },
                blockingOutcome: {
                    kind: "blocked",
                    reason: "missing",
                    message: "path_check_failed",
                },
            }));
        try {
            const outcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(outcome.status).toBe("requested");
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.modal.in_progress", "info", 500);

            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session), 350);

            readController(mounted.controllerRef).modal.close();
            if (outcome.status === "requested") {
                await expect(outcome.completion).resolves.toEqual({
                    status: "cancelled",
                });
            }
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("opens decision modal immediately when certainty has conflicting recovery actions", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          recoveryConfidence: "likely",
                      }
                    : undefined,
            }),
        });
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => ({
                status: "needsModal",
                classification: {
                    ...params.classification,
                    escalationSignal: "conflict",
                    recommendedActions: ["locate", "downloadMissing"],
                },
                blockingOutcome: {
                    kind: "blocked",
                    reason: "missing",
                    message: "path_check_failed",
                },
            }));
        try {
            const outcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(outcome.status).toBe("requested");
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.modal.in_progress", "info", 500);

            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session), 350);

            readController(mounted.controllerRef).modal.close();
            if (outcome.status === "requested") {
                await expect(outcome.completion).resolves.toEqual({
                    status: "cancelled",
                });
            }
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("returns blocked without opening modal when conflicting actions exist without certainty", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          recoveryConfidence: "likely",
                      }
                    : undefined,
            }),
        });
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => ({
                status: "needsModal",
                classification: {
                    ...params.classification,
                    confidence: "likely",
                    escalationSignal: "none",
                    recommendedActions: ["locate", "downloadMissing"],
                },
                blockingOutcome: {
                    kind: "blocked",
                    reason: "missing",
                    message: "path_check_failed",
                },
            }));
        try {
            const outcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(outcome.status).toBe("requested");
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.modal.in_progress", "info", 500);

            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 150);
            });
            expect(readController(mounted.controllerRef).state.session).toBeNull();
            if (outcome.status === "requested") {
                await expect(outcome.completion).resolves.toEqual({
                    status: "failed",
                    reason: "dispatch_not_applied",
                });
            }
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.status.blocked", "warning");
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("does not open modal when recovery resolves before grace window", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          recoveryConfidence: "likely",
                      }
                    : undefined,
            }),
        });
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => ({
                status: "resolved",
                classification: params.classification,
                log: "all_verified_resuming",
            }));
        try {
            const outcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(outcome.status).toBe("requested");
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.modal.in_progress", "info", 500);

            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 150);
            });
            expect(readController(mounted.controllerRef).state.session).toBeNull();

            if (outcome.status === "requested") {
                await expect(outcome.completion).resolves.toEqual({
                    status: "applied",
                });
            }
            expect(readController(mounted.controllerRef).state.session).toBeNull();
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("returns blocked without opening modal when grace expires with no decision", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          recoveryConfidence: "likely",
                      }
                    : undefined,
            }),
        });
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => ({
                status: "noop",
                classification: params.classification,
            }));
        try {
            const outcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(outcome.status).toBe("requested");
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.modal.in_progress", "info", 500);

            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 150);
            });
            expect(readController(mounted.controllerRef).state.session).toBeNull();

            if (outcome.status === "requested") {
                await expect(outcome.completion).resolves.toEqual({
                    status: "failed",
                    reason: "dispatch_not_applied",
                });
            }
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.status.blocked", "warning");
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("treats disk-full needsModal as blocked without opening modal", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          recoveryConfidence: "likely",
                      }
                    : undefined,
            }),
        });
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => ({
                status: "needsModal",
                classification: params.classification,
                blockingOutcome: {
                    kind: "blocked",
                    reason: "disk-full",
                    message: "insufficient_free_space",
                },
            }));
        try {
            const outcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(outcome.status).toBe("requested");
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.modal.in_progress", "info", 500);

            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 150);
            });
            expect(readController(mounted.controllerRef).state.session).toBeNull();

            if (outcome.status === "requested") {
                await expect(outcome.completion).resolves.toEqual({
                    status: "failed",
                    reason: "dispatch_not_applied",
                });
            }
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.status.blocked", "warning");
            expect(readController(mounted.controllerRef).state.queuedCount).toBe(0);
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("resolves completion as applied for recoverable requests", async () => {
        const mounted = await mountHarness({
            scenarioId: "data_gap",
            faultMode: "ok",
        });
        try {
            const outcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(outcome.status).toBe("requested");
            if (outcome.status !== "requested") {
                throw new Error("expected_requested");
            }

            await expect(outcome.completion).resolves.toEqual({
                status: "applied",
            });
        } finally {
            await mounted.cleanup();
        }
    });

    it("suppresses per-torrent resume feedback when requested for bulk UX", async () => {
        const mounted = await mountHarness({
            scenarioId: "data_gap",
            faultMode: "ok",
        });
        try {
            showFeedbackMock.mockReset();
            const outcome = await readController(mounted.controllerRef).actions.resumeTorrentWithRecovery(
                mounted.torrent,
                {
                    suppressFeedback: true,
                },
            );
            expect(outcome.status).toBe("applied");
            expect(showFeedbackMock).not.toHaveBeenCalledWith("recovery.modal.in_progress", "info", 500);
            expect(showFeedbackMock).not.toHaveBeenCalledWith("recovery.feedback.download_resumed", "info");
            expect(showFeedbackMock).not.toHaveBeenCalledWith("recovery.feedback.all_verified_resuming", "info");
        } finally {
            await mounted.cleanup();
        }
    });

    it("resolves completion as cancelled when active recovery is closed", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        try {
            const outcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(outcome.status).toBe("requested");
            if (outcome.status !== "requested") {
                throw new Error("expected_requested");
            }

            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session), 3_000);
            readController(mounted.controllerRef).modal.close();
            await expect(outcome.completion).resolves.toEqual({
                status: "cancelled",
            });
        } finally {
            await mounted.cleanup();
        }
    });

    it("manual set-location outside recovery submits immediately", async () => {
        const mounted = await mountHarness({
            scenarioId: "data_gap",
            faultMode: "ok",
        });
        try {
            const controller = readController(mounted.controllerRef);
            const nonRecoveryTorrent = {
                ...mounted.torrent,
                errorEnvelope: mounted.torrent.errorEnvelope
                    ? {
                          ...mounted.torrent.errorEnvelope,
                          errorClass: "none" as const,
                          recoveryState: "ok" as const,
                      }
                    : undefined,
            };

            const openOutcome = await controller.setLocation.handler(nonRecoveryTorrent, {
                surface: "general-tab",
                mode: "manual",
            });
            expect(openOutcome).toEqual({ status: "manual_opened" });

            controller.locationEditor.change("D:\\NewDownloadPath");
            const confirmOutcome = await controller.locationEditor.confirm();
            expect(confirmOutcome).toEqual({ status: "submitted" });

            await waitForCondition(() => readController(mounted.controllerRef).locationEditor.state === null, 1_500);
            expect(readController(mounted.controllerRef).state.session).toBeNull();
            expect(mounted.updateOperationOverlaysMock.mock.calls).toEqual(
                expect.arrayContaining([
                    [
                        [
                            {
                                id: "dev-recovery-torrent",
                                operation: "relocating",
                            },
                        ],
                    ],
                ]),
            );
            await waitForCondition(() => mounted.updateOperationOverlaysMock.mock.calls.length >= 2, 1_500);
            expect(mounted.updateOperationOverlaysMock.mock.calls).toEqual(
                expect.arrayContaining([
                    [
                        [
                            {
                                id: "dev-recovery-torrent",
                            },
                        ],
                    ],
                ]),
            );
        } finally {
            await mounted.cleanup();
        }
    });

    it("manual set-location on recoverable torrents enters verifying flow", async () => {
        const mounted = await mountHarness({
            scenarioId: "data_gap",
            faultMode: "ok",
        });
        try {
            const controller = readController(mounted.controllerRef);
            const openOutcome = await controller.setLocation.handler(mounted.torrent, {
                surface: "general-tab",
                mode: "manual",
            });
            expect(openOutcome).toEqual({ status: "manual_opened" });

            controller.locationEditor.change("D:\\RecoveredDataPath");
            const confirmOutcome = await controller.locationEditor.confirm();
            expect(confirmOutcome).toEqual({ status: "verifying" });

            await waitForCondition(() => readController(mounted.controllerRef).locationEditor.state === null, 1_500);
        } finally {
            await mounted.cleanup();
        }
    });

    it("moves the manual editor to recovery-modal surface when force-workbench is requested for the same torrent", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        try {
            const controller = readController(mounted.controllerRef);
            const manualOutcome = await controller.setLocation.handler(mounted.torrent, {
                surface: "general-tab",
                mode: "manual",
            });
            expect(manualOutcome).toEqual({ status: "manual_opened" });
            await waitForCondition(
                () => Boolean(readController(mounted.controllerRef).locationEditor.state),
                1_500,
            );
            expect(readController(mounted.controllerRef).locationEditor.state?.surface).toBe(
                "general-tab",
            );

            const recoveryOutcome = controller.actions.openRecoveryModal(mounted.torrent, {
                forceWorkbench: true,
            });
            expect(recoveryOutcome.status).toBe("requested");
            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session), 1_500);
            await waitForCondition(
                () =>
                    readController(mounted.controllerRef).locationEditor.state
                        ?.surface === "recovery-modal",
                1_500,
            );
            if (recoveryOutcome.status === "requested") {
                readController(mounted.controllerRef).modal.close();
                await expect(recoveryOutcome.completion).resolves.toEqual({
                    status: "cancelled",
                });
            }
        } finally {
            await mounted.cleanup();
        }
    });

    it("manual set-location rejects non-absolute paths", async () => {
        const mounted = await mountHarness({
            scenarioId: "data_gap",
            faultMode: "ok",
        });
        try {
            const controller = readController(mounted.controllerRef);
            const nonRecoveryTorrent = {
                ...mounted.torrent,
                errorEnvelope: mounted.torrent.errorEnvelope
                    ? {
                          ...mounted.torrent.errorEnvelope,
                          errorClass: "none" as const,
                          recoveryState: "ok" as const,
                      }
                    : undefined,
            };

            const openOutcome = await controller.setLocation.handler(nonRecoveryTorrent, {
                surface: "general-tab",
                mode: "manual",
            });
            expect(openOutcome).toEqual({ status: "manual_opened" });

            controller.locationEditor.change("relative\\path");
            const confirmOutcome = await controller.locationEditor.confirm();
            expect(confirmOutcome).toEqual({ status: "validation_error" });
            await waitForCondition(
                () => Boolean(readController(mounted.controllerRef).locationEditor.state?.error),
                1_500,
            );
            expect(readController(mounted.controllerRef).locationEditor.state?.error).toBe(
                "set_location.reason.absolute_path_required",
            );
        } finally {
            await mounted.cleanup();
        }
    });

    it("resolves completion as failed for invalid targets", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                id: "",
                hash: "",
            }),
        });
        try {
            const outcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(outcome.status).toBe("requested");
            if (outcome.status !== "requested") {
                throw new Error("expected_requested");
            }

            await expect(outcome.completion).resolves.toEqual({
                status: "failed",
                reason: "invalid_target",
            });
        } finally {
            await mounted.cleanup();
        }
    });

    it("reuses the same in-flight recovery for deduped download-missing calls", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        try {
            const controller = readController(mounted.controllerRef);
            const first = controller.actions.executeDownloadMissing(mounted.torrent);
            const deduped = controller.actions.executeDownloadMissing(mounted.torrent);
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.modal.in_progress", "info", 500);
            expect(mounted.updateOperationOverlaysMock).toHaveBeenCalledWith([
                {
                    id: "dev-recovery-torrent",
                    operation: "recovering",
                },
            ]);

            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session), 1_500);
            readController(mounted.controllerRef).modal.close();

            await expect(first).resolves.toEqual({
                status: "not_required",
                reason: "operation_cancelled",
            });
            await expect(deduped).resolves.toEqual({
                status: "not_required",
                reason: "operation_cancelled",
            });
            expect(mounted.updateOperationOverlaysMock.mock.calls).toEqual(
                expect.arrayContaining([[[{ id: "dev-recovery-torrent" }]]]),
            );
            expect(showFeedbackMock).not.toHaveBeenCalledWith("recovery.feedback.recovery_busy", "info");
        } finally {
            await mounted.cleanup();
        }
    });

    it("reuses active recovery promise when download-missing is pressed during set-location recovery", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        try {
            const controller = readController(mounted.controllerRef);
            const updatedTorrent: TorrentDetail = {
                ...mounted.torrent,
                downloadDir: "D:\\RecoveredDataPath",
                savePath: "D:\\RecoveredDataPath",
            };
            const activeRecovery = controller.actions.resumeTorrentWithRecovery(updatedTorrent);
            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session), 1_500);
            showFeedbackMock.mockReset();

            const deduped = controller.actions.executeDownloadMissing(mounted.torrent);
            expect(readController(mounted.controllerRef).state.queuedCount).toBe(0);

            readController(mounted.controllerRef).modal.close();
            await expect(deduped).resolves.toEqual({
                status: "not_required",
                reason: "operation_cancelled",
            });
            await expect(activeRecovery).resolves.toEqual({
                status: "cancelled",
            });
            expect(showFeedbackMock).not.toHaveBeenCalledWith("recovery.feedback.recovery_busy", "info");
        } finally {
            await mounted.cleanup();
        }
    });

    it("gates modal auto-retry attempts by retry cooldown", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => ({
                status: "needsModal",
                classification: {
                    ...params.classification,
                    confidence: "certain",
                    escalationSignal: "none",
                },
                blockingOutcome: {
                    kind: "blocked",
                    reason: "missing",
                    message: "path_check_failed",
                },
            }));
        try {
            const openOutcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(openOutcome.status).toBe("requested");

            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session), 1_500);
            await readController(mounted.controllerRef).modal.autoRetry();
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 75);
            });
            const callCountAfterFirstAutoRetry = recoverMissingFilesSpy.mock.calls.length;
            expect(callCountAfterFirstAutoRetry).toBeGreaterThan(0);

            await readController(mounted.controllerRef).modal.autoRetry();
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 75);
            });
            expect(recoverMissingFilesSpy.mock.calls.length).toBe(callCountAfterFirstAutoRetry);
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("updates the active recovery session when retry/recheck computes needsModal", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        let recoverMissingFilesSpy: ReturnType<typeof vi.spyOn> | null = null;
        try {
            const initialController = readController(mounted.controllerRef);
            const openOutcome = initialController.actions.openRecoveryModal(mounted.torrent);
            expect(openOutcome.status).toBe("requested");

            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session), 1_500);
            const sessionBeforeRetry = readController(mounted.controllerRef).state.session;
            expect(sessionBeforeRetry?.outcome.kind).toBe("needs-user-decision");

            recoverMissingFilesSpy = vi
                .spyOn(recoveryController, "recoverMissingFiles")
                .mockImplementation(async (params) => ({
                    status: "needsModal",
                    classification: params.classification,
                    blockingOutcome: {
                        kind: "blocked",
                        reason: "unwritable",
                        message: "path_access_denied",
                    },
                }));

            showFeedbackMock.mockReset();
            await readController(mounted.controllerRef).modal.retry();
            await waitForCondition(() => (recoverMissingFilesSpy?.mock.calls.length ?? 0) > 0, 1_500);
            await waitForCondition(
                () => readController(mounted.controllerRef).state.session?.outcome !== sessionBeforeRetry?.outcome,
                1_500,
            );

            const sessionAfterRetry = readController(mounted.controllerRef).state.session;
            expect(sessionAfterRetry).not.toBeNull();
            expect(sessionAfterRetry?.outcome).toMatchObject({
                kind: "needs-user-decision",
            });
            expect(sessionAfterRetry?.outcome).not.toBe(sessionBeforeRetry?.outcome);
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.feedback.retry_failed", "warning");

            readController(mounted.controllerRef).modal.close();
        } finally {
            recoverMissingFilesSpy?.mockRestore();
            await mounted.cleanup();
        }
    });

    it("surfaces retry feedback when retry probe returns no blocking outcome", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        let recoverMissingFilesSpy: ReturnType<typeof vi.spyOn> | null = null;
        try {
            const initialController = readController(mounted.controllerRef);
            const openOutcome = initialController.actions.openRecoveryModal(mounted.torrent);
            expect(openOutcome.status).toBe("requested");
            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session), 1_500);

            recoverMissingFilesSpy = vi
                .spyOn(recoveryController, "recoverMissingFiles")
                .mockImplementation(async (params) => ({
                    status: "noop",
                    classification: params.classification,
                }));

            showFeedbackMock.mockReset();
            await readController(mounted.controllerRef).modal.retry();

            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.feedback.retry_failed", "warning");
            expect(readController(mounted.controllerRef).state.session).not.toBeNull();
        } finally {
            recoverMissingFilesSpy?.mockRestore();
            await mounted.cleanup();
        }
    });

    it("keeps cancellation feedback silent after the initial in-progress signal for modal resume", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        try {
            const outcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(outcome.status).toBe("requested");
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.modal.in_progress", "info", 500);
            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session), 1_500);

            showFeedbackMock.mockReset();
            readController(mounted.controllerRef).modal.close();
            if (outcome.status === "requested") {
                await expect(outcome.completion).resolves.toEqual({
                    status: "cancelled",
                });
            }
            expect(showFeedbackMock).not.toHaveBeenCalled();
        } finally {
            await mounted.cleanup();
        }
    });

    it("keeps cancellation feedback silent after the initial in-progress signal for download-missing", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        try {
            const completion = readController(mounted.controllerRef).actions.executeDownloadMissing(mounted.torrent);
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.modal.in_progress", "info", 500);
            await waitForCondition(() => Boolean(readController(mounted.controllerRef).state.session), 1_500);
            showFeedbackMock.mockReset();

            readController(mounted.controllerRef).modal.close();
            await expect(completion).resolves.toEqual({
                status: "not_required",
                reason: "operation_cancelled",
            });
            expect(showFeedbackMock).not.toHaveBeenCalled();
        } finally {
            await mounted.cleanup();
        }
    });

    it("shows set-location editor state within escalation threshold for manual mode", async () => {
        const mounted = await mountHarness({
            scenarioId: "data_gap",
            faultMode: "ok",
        });
        try {
            const controller = readController(mounted.controllerRef);
            const start = Date.now();
            const outcome = await controller.setLocation.handler(mounted.torrent, {
                surface: "general-tab",
                mode: "manual",
            });
            const elapsedMs = Date.now() - start;

            expect(outcome).toEqual({ status: "manual_opened" });
            await waitForCondition(() => Boolean(readController(mounted.controllerRef).locationEditor.state), 1_500);
            expect(elapsedMs).toBeLessThanOrEqual(RECOVERY_ESCALATION_GRACE_MS);
        } finally {
            await mounted.cleanup();
        }
    });

    it("runs background recovery pass for permission-denied errors without opening a decision modal", async () => {
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => ({
                status: "noop",
                classification: params.classification,
            }));
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                state: STATUS.torrent.ERROR,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          errorClass: "permissionDenied",
                          recoveryState: "blocked",
                      }
                    : undefined,
            }),
        });
        try {
            await waitForCondition(() => recoverMissingFilesSpy.mock.calls.length > 0, 1_500);
            expect(readController(mounted.controllerRef).state.session).toBeNull();
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("runs background recovery pass for unknown recovery errors without opening a decision modal", async () => {
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => ({
                status: "noop",
                classification: params.classification,
            }));
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                state: STATUS.torrent.ERROR,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          errorClass: "unknown",
                          recoveryState: "blocked",
                      }
                    : undefined,
            }),
        });
        try {
            await waitForCondition(() => recoverMissingFilesSpy.mock.calls.length > 0, 1_500);
            expect(readController(mounted.controllerRef).state.session).toBeNull();
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("auto-continues disk-full background recovery when a later pass resolves", async () => {
        let callCount = 0;
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => {
                callCount += 1;
                if (callCount === 1) {
                    return {
                        status: "noop",
                        classification: params.classification,
                    };
                }
                return {
                    status: "resolved",
                    classification: params.classification,
                    log: "all_verified_resuming",
                };
            });
        const realNow = Date.now.bind(Date);
        let nowOffsetMs = 0;
        const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => realNow() + nowOffsetMs);
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                state: STATUS.torrent.ERROR,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          errorClass: "diskFull",
                          recoveryState: "blocked",
                      }
                    : undefined,
            }),
        });
        try {
            await waitForCondition(() => recoverMissingFilesSpy.mock.calls.length >= 1, 1_500);
            expect(readController(mounted.controllerRef).state.session).toBeNull();
            expect(mounted.updateOperationOverlaysMock).toHaveBeenCalledWith([
                {
                    id: "dev-recovery-torrent",
                    operation: "recovering",
                },
            ]);

            nowOffsetMs = 30_000;
            await waitForCondition(() => recoverMissingFilesSpy.mock.calls.length >= 2, 6_500);
            await waitForCondition(() => {
                return mounted.updateOperationOverlaysMock.mock.calls.some(
                    (entry) =>
                        Array.isArray(entry[0]) &&
                        entry[0].some(
                            (update) => update?.id === "dev-recovery-torrent" && update.operation === undefined,
                        ),
                );
            }, 1_500);
            expect(readController(mounted.controllerRef).state.session).toBeNull();
        } finally {
            dateNowSpy.mockRestore();
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("stops missing-files background retry after user pause invalidates ownership", async () => {
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => ({
                status: "noop",
                classification: params.classification,
            }));
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                state: STATUS.torrent.ERROR,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          errorClass: "missingFiles",
                          recoveryState: "blocked",
                      }
                    : undefined,
            }),
        });
        try {
            await waitForCondition(() => recoverMissingFilesSpy.mock.calls.length >= 1, 1_500);
            expect(mounted.updateOperationOverlaysMock).toHaveBeenCalledWith([
                {
                    id: "dev-recovery-torrent",
                    operation: "recovering",
                },
            ]);

            readController(mounted.controllerRef).actions.markTorrentPausedByUser(mounted.torrent);
            const callCountAfterPause = recoverMissingFilesSpy.mock.calls.length;
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 4_500);
            });
            expect(recoverMissingFilesSpy.mock.calls.length).toBe(callCountAfterPause);
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("handles mixed actionable classes with disk-full blocked guidance and background auto-continuation", async () => {
        const pathLossScenario =
            DEV_TEST_SCENARIOS.find((scenario) => scenario.id === "path_loss") ?? DEV_TEST_SCENARIOS[0];
        const template = createDevScenarioTorrent(pathLossScenario, "certain");
        const permissionTorrent: TorrentDetailEntity = {
            ...template,
            id: "permission-torrent",
            hash: "permission-hash",
            name: "Permission Torrent",
            state: STATUS.torrent.ERROR,
            errorEnvelope: {
                errorClass: "permissionDenied",
                errorMessage: "access_denied",
                lastErrorAt: Date.now(),
                recoveryState: "blocked",
                recoveryActions: [],
            },
        };
        const unknownTorrent: TorrentDetailEntity = {
            ...template,
            id: "unknown-torrent",
            hash: "unknown-hash",
            name: "Unknown Torrent",
            state: STATUS.torrent.ERROR,
            errorEnvelope: {
                errorClass: "unknown",
                errorMessage: "unknown_error",
                lastErrorAt: Date.now(),
                recoveryState: "blocked",
                recoveryActions: [],
            },
        };
        const callCountsById = new Map<string, number>();
        let allowDiskFullResolve = false;
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => {
                const torrentId = String(params.torrent.id ?? params.torrent.hash ?? "");
                callCountsById.set(torrentId, (callCountsById.get(torrentId) ?? 0) + 1);
                if (torrentId === "dev-recovery-torrent") {
                    if (allowDiskFullResolve) {
                        return {
                            status: "resolved",
                            classification: params.classification,
                            log: "all_verified_resuming",
                        };
                    }
                    return {
                        status: "needsModal",
                        classification: {
                            ...params.classification,
                            confidence: "likely",
                            escalationSignal: "none",
                        },
                        blockingOutcome: {
                            kind: "blocked",
                            reason: "disk-full",
                            message: "disk_full",
                        },
                    };
                }
                return {
                    status: "noop",
                    classification: params.classification,
                };
            });
        const realNow = Date.now.bind(Date);
        let nowOffsetMs = 0;
        const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => realNow() + nowOffsetMs);
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                state: STATUS.torrent.ERROR,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          errorClass: "diskFull",
                          recoveryState: "blocked",
                      }
                    : undefined,
            }),
            additionalTorrents: [permissionTorrent, unknownTorrent],
        });
        try {
            const openOutcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(openOutcome.status).toBe("requested");
            if (openOutcome.status === "requested") {
                await expect(openOutcome.completion).resolves.toEqual({
                    status: "failed",
                    reason: "dispatch_not_applied",
                });
            }

            await waitForCondition(
                () => callCountsById.has("permission-torrent") && callCountsById.has("unknown-torrent"),
                1_500,
            );
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.status.blocked", "warning");
            expect(readController(mounted.controllerRef).state.session).toBeNull();

            allowDiskFullResolve = true;
            nowOffsetMs = 30_000;
            await waitForCondition(() => (callCountsById.get("dev-recovery-torrent") ?? 0) >= 2, 6_500);
            await waitForCondition(() => {
                return mounted.updateOperationOverlaysMock.mock.calls.some(
                    (entry) =>
                        Array.isArray(entry[0]) &&
                        entry[0].some(
                            (update) => update?.id === "dev-recovery-torrent" && update.operation === undefined,
                        ),
                );
            }, 1_500);
            expect(readController(mounted.controllerRef).state.session).toBeNull();
        } finally {
            dateNowSpy.mockRestore();
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("keeps disk-full background re-eval active while another decision modal is open and auto-continues on resolve", async () => {
        const pathLossScenario =
            DEV_TEST_SCENARIOS.find((scenario) => scenario.id === "path_loss") ?? DEV_TEST_SCENARIOS[0];
        const template = createDevScenarioTorrent(pathLossScenario, "certain");
        const diskTorrent: TorrentDetailEntity = {
            ...template,
            id: "disk-torrent",
            hash: "disk-hash",
            name: "Disk Torrent",
            state: STATUS.torrent.ERROR,
            errorEnvelope: {
                errorClass: "diskFull",
                errorMessage: "disk_full",
                lastErrorAt: Date.now(),
                recoveryState: "blocked",
                recoveryActions: [],
            },
        };
        const unknownTorrent: TorrentDetailEntity = {
            ...template,
            id: "unknown-torrent-modal-open",
            hash: "unknown-hash-modal-open",
            name: "Unknown Torrent",
            state: STATUS.torrent.ERROR,
            errorEnvelope: {
                errorClass: "unknown",
                errorMessage: "unknown_error",
                lastErrorAt: Date.now(),
                recoveryState: "blocked",
                recoveryActions: [],
            },
        };
        const callCountsById = new Map<string, number>();
        let allowDiskResolve = false;
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => {
                const torrentId = String(params.torrent.id ?? params.torrent.hash ?? "");
                callCountsById.set(torrentId, (callCountsById.get(torrentId) ?? 0) + 1);
                if (torrentId === "permission-torrent") {
                    return {
                        status: "needsModal",
                        classification: {
                            ...params.classification,
                            confidence: "certain",
                            escalationSignal: "none",
                        },
                        blockingOutcome: {
                            kind: "blocked",
                            reason: "unwritable",
                            message: "path_access_denied",
                        },
                    };
                }
                if (torrentId === "disk-torrent") {
                    if (allowDiskResolve) {
                        return {
                            status: "resolved",
                            classification: params.classification,
                            log: "all_verified_resuming",
                        };
                    }
                    return {
                        status: "needsModal",
                        classification: {
                            ...params.classification,
                            confidence: "likely",
                            escalationSignal: "none",
                        },
                        blockingOutcome: {
                            kind: "blocked",
                            reason: "disk-full",
                            message: "disk_full",
                        },
                    };
                }
                return {
                    status: "noop",
                    classification: params.classification,
                };
            });
        const realNow = Date.now.bind(Date);
        let nowOffsetMs = 0;
        const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => realNow() + nowOffsetMs);
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                id: "permission-torrent",
                hash: "permission-hash",
                name: "Permission Torrent",
                state: STATUS.torrent.ERROR,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          errorClass: "permissionDenied",
                          recoveryState: "needsUserAction",
                          recoveryConfidence: "certain",
                      }
                    : undefined,
            }),
            additionalTorrents: [diskTorrent, unknownTorrent],
        });
        try {
            const diskBlockedOutcome = readController(mounted.controllerRef).actions.openRecoveryModal(diskTorrent);
            expect(diskBlockedOutcome.status).toBe("requested");
            if (diskBlockedOutcome.status === "requested") {
                await expect(diskBlockedOutcome.completion).resolves.toEqual({
                    status: "failed",
                    reason: "dispatch_not_applied",
                });
            }
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.status.blocked", "warning");
            expect(readController(mounted.controllerRef).state.session).toBeNull();

            showFeedbackMock.mockReset();
            const permissionOutcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(permissionOutcome.status).toBe("requested");
            await waitForCondition(
                () => readController(mounted.controllerRef).state.session?.torrent.id === "permission-torrent",
                1_500,
            );
            await waitForCondition(() => callCountsById.has("unknown-torrent-modal-open"), 1_500);

            const diskCallCountBeforeModalPass = callCountsById.get("disk-torrent") ?? 0;
            allowDiskResolve = true;
            nowOffsetMs = 30_000;
            await waitForCondition(
                () => (callCountsById.get("disk-torrent") ?? 0) > diskCallCountBeforeModalPass,
                6_500,
            );
            await waitForCondition(() => {
                return mounted.updateOperationOverlaysMock.mock.calls.some(
                    (entry) =>
                        Array.isArray(entry[0]) &&
                        entry[0].some((update) => update?.id === "disk-torrent" && update.operation === undefined),
                );
            }, 1_500);
            expect(readController(mounted.controllerRef).state.session?.torrent.id).toBe("permission-torrent");
            expect(readController(mounted.controllerRef).state.queuedCount).toBe(0);

            readController(mounted.controllerRef).modal.close();
            if (permissionOutcome.status === "requested") {
                await expect(permissionOutcome.completion).resolves.toEqual({
                    status: "cancelled",
                });
            }
        } finally {
            dateNowSpy.mockRestore();
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("keeps retry scheduling bounded during rapid resolve-flip-resolve transitions within a cooldown window", async () => {
        let callCount = 0;
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => {
                callCount += 1;
                if (callCount === 1) {
                    return {
                        status: "noop",
                        classification: params.classification,
                    };
                }
                if (callCount === 2) {
                    return {
                        status: "resolved",
                        classification: params.classification,
                        log: "all_verified_resuming",
                    };
                }
                if (callCount === 3) {
                    return {
                        status: "noop",
                        classification: params.classification,
                    };
                }
                return {
                    status: "resolved",
                    classification: params.classification,
                    log: "all_verified_resuming",
                };
            });
        const realNow = Date.now.bind(Date);
        let nowOffsetMs = 0;
        const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => realNow() + nowOffsetMs);
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                state: STATUS.torrent.ERROR,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          errorClass: "unknown",
                          recoveryState: "blocked",
                      }
                    : undefined,
            }),
        });
        try {
            await waitForCondition(() => callCount >= 1, 1_500);

            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 4_500);
            });
            expect(callCount).toBe(1);

            nowOffsetMs = 30_000;
            await waitForCondition(() => callCount >= 2, 6_500);
            await waitForCondition(() => callCount >= 3, 6_500);

            const countAfterThirdPass = callCount;
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 4_500);
            });
            expect(callCount).toBe(countAfterThirdPass);

            nowOffsetMs = 60_000;
            await waitForCondition(() => callCount >= 4, 6_500);
            expect(readController(mounted.controllerRef).state.session).toBeNull();
        } finally {
            dateNowSpy.mockRestore();
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    }, 25_000);

    it("deduplicates repeated resume requests for the same fingerprint during in-flight recovery", async () => {
        let releaseRecovery: () => void = () => {};
        let sharedPending: Promise<Awaited<ReturnType<typeof recoveryController.recoverMissingFiles>>> | null = null;
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => {
                if (!sharedPending) {
                    sharedPending = new Promise((resolve) => {
                        releaseRecovery = () => {
                            resolve({
                                status: "resolved",
                                classification: params.classification,
                                log: "all_verified_resuming",
                            });
                        };
                    });
                }
                return sharedPending;
            });
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                state: STATUS.torrent.PAUSED,
            }),
        });
        try {
            const controller = readController(mounted.controllerRef);
            const first = controller.actions.resumeTorrentWithRecovery(mounted.torrent, { suppressFeedback: true });
            const second = controller.actions.resumeTorrentWithRecovery(mounted.torrent, { suppressFeedback: true });
            const third = controller.actions.resumeTorrentWithRecovery(mounted.torrent, { suppressFeedback: true });
            await waitForCondition(() => recoverMissingFilesSpy.mock.calls.length >= 1, 1_500);
            releaseRecovery();
            await expect(first).resolves.toEqual({ status: "applied" });
            await expect(second).resolves.toEqual({ status: "applied" });
            await expect(third).resolves.toEqual({ status: "applied" });
            expect(recoverMissingFilesSpy).toHaveBeenCalledTimes(1);
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("deduplicates resume spam during an active retry cycle without duplicate modal opens", async () => {
        let resolveRetryCycle: () => void = () => {};
        let sharedPending: Promise<Awaited<ReturnType<typeof recoveryController.recoverMissingFiles>>> | null = null;
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => {
                if (!sharedPending) {
                    sharedPending = new Promise((resolve) => {
                        resolveRetryCycle = () => {
                            resolve({
                                status: "resolved",
                                classification: params.classification,
                                log: "all_verified_resuming",
                            });
                        };
                    });
                }
                return sharedPending;
            });
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                state: STATUS.torrent.ERROR,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          errorClass: "unknown",
                          recoveryState: "blocked",
                      }
                    : undefined,
            }),
        });
        try {
            await waitForCondition(() => recoverMissingFilesSpy.mock.calls.length >= 1, 1_500);
            const controller = readController(mounted.controllerRef);
            const spammedPromises = Array.from({ length: 6 }, () =>
                controller.actions.resumeTorrentWithRecovery(mounted.torrent, {
                    suppressFeedback: true,
                }),
            );
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 150);
            });
            expect(recoverMissingFilesSpy.mock.calls.length).toBeLessThanOrEqual(2);
            resolveRetryCycle();
            const spammed = await Promise.all(spammedPromises);
            expect(spammed.every((outcome) => outcome.status === "applied")).toBe(true);
            expect(readController(mounted.controllerRef).state.session).toBeNull();
            expect(readController(mounted.controllerRef).state.queuedCount).toBe(0);
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("surfaces blocked feedback and clears in-flight recovery guards when a mid-cycle recovery call rejects", async () => {
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async () => {
                throw new Error("mid_cycle_recovery_failure");
            });
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                state: STATUS.torrent.PAUSED,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          recoveryConfidence: "likely",
                      }
                    : undefined,
            }),
        });
        try {
            const first = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(first.status).toBe("requested");
            if (first.status === "requested") {
                await expect(first.completion).resolves.toEqual({
                    status: "failed",
                    reason: "dispatch_not_applied",
                });
            }
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.modal.in_progress", "info", 500);
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.status.blocked", "warning");
            expect(readController(mounted.controllerRef).state.session).toBeNull();

            const callsAfterFirstAction = recoverMissingFilesSpy.mock.calls.length;
            const second = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(second.status).toBe("requested");
            if (second.status === "requested") {
                await expect(second.completion).resolves.toEqual({
                    status: "failed",
                    reason: "dispatch_not_applied",
                });
            }
            expect(recoverMissingFilesSpy.mock.calls.length).toBeGreaterThan(callsAfterFirstAction);
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("does not let stale background retry timestamps block a user-initiated recovery attempt", async () => {
        let callCount = 0;
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => {
                callCount += 1;
                if (callCount === 1) {
                    return {
                        status: "noop",
                        classification: params.classification,
                    };
                }
                return {
                    status: "resolved",
                    classification: params.classification,
                    log: "all_verified_resuming",
                };
            });
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                state: STATUS.torrent.ERROR,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          errorClass: "unknown",
                          recoveryState: "blocked",
                          recoveryConfidence: "likely",
                      }
                    : undefined,
            }),
        });
        try {
            await waitForCondition(() => callCount >= 1, 1_500);

            const userOutcome = readController(mounted.controllerRef).actions.openRecoveryModal(mounted.torrent);
            expect(userOutcome.status).toBe("requested");
            await waitForCondition(() => callCount >= 2, 1_500);
            if (userOutcome.status === "requested") {
                await expect(userOutcome.completion).resolves.toEqual({
                    status: "applied",
                });
            }
            expect(showFeedbackMock).toHaveBeenCalledWith("recovery.modal.in_progress", "info", 500);
            expect(readController(mounted.controllerRef).state.session).toBeNull();
        } finally {
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });

    it("continues background retry after transient recovery exceptions and resolves on the next eligible pass", async () => {
        let callCount = 0;
        const recoverMissingFilesSpy = vi
            .spyOn(recoveryController, "recoverMissingFiles")
            .mockImplementation(async (params) => {
                callCount += 1;
                if (callCount === 1) {
                    throw new Error("transient_background_failure");
                }
                return {
                    status: "resolved",
                    classification: params.classification,
                    log: "all_verified_resuming",
                };
            });
        const realNow = Date.now.bind(Date);
        let nowOffsetMs = 0;
        const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => realNow() + nowOffsetMs);
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
            mutateTorrent: (torrent) => ({
                ...torrent,
                state: STATUS.torrent.ERROR,
                errorEnvelope: torrent.errorEnvelope
                    ? {
                          ...torrent.errorEnvelope,
                          errorClass: "unknown",
                          recoveryState: "blocked",
                      }
                    : undefined,
            }),
        });
        try {
            await waitForCondition(() => recoverMissingFilesSpy.mock.calls.length >= 1, 1_500);
            expect(readController(mounted.controllerRef).state.session).toBeNull();
            expect(mounted.updateOperationOverlaysMock).toHaveBeenCalledWith([
                {
                    id: "dev-recovery-torrent",
                    operation: "recovering",
                },
            ]);

            nowOffsetMs = 30_000;
            await waitForCondition(() => recoverMissingFilesSpy.mock.calls.length >= 2, 6_500);
            await waitForCondition(() => {
                return mounted.updateOperationOverlaysMock.mock.calls.some(
                    (entry) =>
                        Array.isArray(entry[0]) &&
                        entry[0].some(
                            (update) => update?.id === "dev-recovery-torrent" && update.operation === undefined,
                        ),
                );
            }, 1_500);
            expect(readController(mounted.controllerRef).state.session).toBeNull();
        } finally {
            dateNowSpy.mockRestore();
            recoverMissingFilesSpy.mockRestore();
            await mounted.cleanup();
        }
    });
});
