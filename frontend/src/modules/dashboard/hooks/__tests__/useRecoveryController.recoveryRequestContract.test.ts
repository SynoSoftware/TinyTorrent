import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import { useRecoveryController } from "@/modules/dashboard/hooks/useRecoveryController";
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
    initialFaultMode: DevTestFaultMode;
    updateOperationOverlays: (
        updates: Array<{ id: string; operation?: TorrentOperationState }>,
    ) => void;
};

function RecoveryControllerHarness({
    controllerRef,
    initialDetail,
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
        cloneDevTorrentDetail(initialDetail),
    ]);
    const [detailData, setDetailData] = useState<TorrentDetail | null>(
        cloneDevTorrentDetail(initialDetail),
    );
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
};

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs: number,
): Promise<void> => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (predicate()) return;
        await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 20);
        });
    }
    throw new Error("wait_for_condition_timeout");
};

const readController = (
    controllerRef: RecoveryControllerRef,
): RecoveryControllerResult => {
    if (!controllerRef.current) {
        throw new Error("controller_not_ready");
    }
    return controllerRef.current;
};

const mountHarness = async ({
    scenarioId,
    faultMode,
    mutateTorrent,
}: MountOptions): Promise<MountedHarness> => {
    const scenario =
        DEV_TEST_SCENARIOS.find((item) => item.id === scenarioId) ??
        DEV_TEST_SCENARIOS[0];
    const baseTorrent = createDevScenarioTorrent(scenario, "certain");
    const torrent = mutateTorrent ? mutateTorrent(baseTorrent) : baseTorrent;
    const controllerRef: RecoveryControllerRef = { current: null };
    const updateOperationOverlaysMock = vi.fn();

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(
        React.createElement(RecoveryControllerHarness, {
            controllerRef,
            initialDetail: torrent,
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
        reportCommandErrorMock.mockReset();
        showFeedbackMock.mockReset();
    });

    it("returns not_actionable when error envelope is missing", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        try {
            const controller = readController(mounted.controllerRef);
            const notActionableTorrent = {
                ...mounted.torrent,
                errorEnvelope: undefined,
            };
            const outcome =
                controller.actions.openRecoveryModal(notActionableTorrent);
            expect(outcome).toEqual({ status: "not_actionable" });
        } finally {
            await mounted.cleanup();
        }
    });

    it("returns already_open for the same fingerprint when session is active", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        try {
            const first = readController(
                mounted.controllerRef,
            ).actions.openRecoveryModal(mounted.torrent);
            expect(first.status).toBe("requested");
            if (first.status !== "requested") {
                throw new Error("expected_requested");
            }

            await waitForCondition(
                () =>
                    Boolean(
                        readController(mounted.controllerRef).state.session,
                    ),
                3_000,
            );

            const second = readController(
                mounted.controllerRef,
            ).actions.openRecoveryModal(mounted.torrent);
            expect(second).toEqual({ status: "already_open" });

            readController(mounted.controllerRef).modal.close();
            await expect(first.completion).resolves.toEqual({
                status: "cancelled",
            });
        } finally {
            await mounted.cleanup();
        }
    });

    it("resolves completion as applied for recoverable requests", async () => {
        const mounted = await mountHarness({
            scenarioId: "data_gap",
            faultMode: "ok",
        });
        try {
            const outcome = readController(
                mounted.controllerRef,
            ).actions.openRecoveryModal(mounted.torrent);
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

    it("resolves completion as cancelled when active recovery is closed", async () => {
        const mounted = await mountHarness({
            scenarioId: "path_loss",
            faultMode: "missing",
        });
        try {
            const outcome = readController(
                mounted.controllerRef,
            ).actions.openRecoveryModal(mounted.torrent);
            expect(outcome.status).toBe("requested");
            if (outcome.status !== "requested") {
                throw new Error("expected_requested");
            }

            await waitForCondition(
                () =>
                    Boolean(
                        readController(mounted.controllerRef).state.session,
                    ),
                3_000,
            );
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

            const openOutcome = await controller.setLocation.handler(
                nonRecoveryTorrent,
                {
                    surface: "general-tab",
                    mode: "manual",
                },
            );
            expect(openOutcome).toEqual({ status: "manual_opened" });

            controller.locationEditor.change("D:\\NewDownloadPath");
            const confirmOutcome = await controller.locationEditor.confirm();
            expect(confirmOutcome).toEqual({ status: "submitted" });

            await waitForCondition(
                () =>
                    readController(mounted.controllerRef).locationEditor.state ===
                    null,
                1_500,
            );
            expect(readController(mounted.controllerRef).state.session).toBeNull();
            expect(mounted.updateOperationOverlaysMock).toHaveBeenNthCalledWith(
                1,
                [
                    {
                        id: "dev-recovery-torrent",
                        operation: "relocating",
                    },
                ],
            );
            await waitForCondition(
                () => mounted.updateOperationOverlaysMock.mock.calls.length >= 2,
                1_500,
            );
            expect(
                mounted.updateOperationOverlaysMock.mock.calls,
            ).toEqual(
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
            const openOutcome = await controller.setLocation.handler(
                mounted.torrent,
                {
                    surface: "general-tab",
                    mode: "manual",
                },
            );
            expect(openOutcome).toEqual({ status: "manual_opened" });

            controller.locationEditor.change("D:\\RecoveredDataPath");
            const confirmOutcome = await controller.locationEditor.confirm();
            expect(confirmOutcome).toEqual({ status: "verifying" });

            await waitForCondition(
                () =>
                    readController(mounted.controllerRef).locationEditor.state ===
                    null,
                1_500,
            );
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

            const openOutcome = await controller.setLocation.handler(
                nonRecoveryTorrent,
                {
                    surface: "general-tab",
                    mode: "manual",
                },
            );
            expect(openOutcome).toEqual({ status: "manual_opened" });

            controller.locationEditor.change("relative\\path");
            const confirmOutcome = await controller.locationEditor.confirm();
            expect(confirmOutcome).toEqual({ status: "validation_error" });
            await waitForCondition(
                () =>
                    Boolean(
                        readController(mounted.controllerRef).locationEditor
                            .state?.error,
                    ),
                1_500,
            );
            expect(
                readController(mounted.controllerRef).locationEditor.state
                    ?.error,
            ).toBe(
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
            const outcome = readController(
                mounted.controllerRef,
            ).actions.openRecoveryModal(mounted.torrent);
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
});
