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
import { DevRecoveryAdapter } from "@/app/dev/recovery/adapter";
import {
    cloneDevTorrentDetail,
    createDevScenarioTorrent,
    DEV_RECOVERY_SCENARIOS,
    type DevRecoveryFaultMode,
    type DevRecoveryScenarioId,
} from "@/app/dev/recovery/scenarios";
import type { TorrentDetailEntity } from "@/services/rpc/entities";
import type { RecoveryControllerResult } from "@/modules/dashboard/hooks/useRecoveryController";

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
    initialFaultMode: DevRecoveryFaultMode;
};

function RecoveryControllerHarness({
    controllerRef,
    initialDetail,
    initialFaultMode,
}: ControllerHarnessProps) {
    const adapter = useMemo(() => {
        const instance = new DevRecoveryAdapter(initialDetail, initialFaultMode);
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
                    await adapter.setTorrentLocation(
                        String(intent.torrentId),
                        intent.path,
                        false,
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
    });

    useEffect(() => {
        controllerRef.current = controller;
    }, [controller, controllerRef]);

    return null;
}

type MountedHarness = {
    controllerRef: RecoveryControllerRef;
    torrent: TorrentDetailEntity;
    cleanup: () => Promise<void>;
};

type MountOptions = {
    scenarioId: DevRecoveryScenarioId;
    faultMode?: DevRecoveryFaultMode;
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
        DEV_RECOVERY_SCENARIOS.find((item) => item.id === scenarioId) ??
        DEV_RECOVERY_SCENARIOS[0];
    const baseTorrent = createDevScenarioTorrent(scenario, "certain");
    const torrent = mutateTorrent ? mutateTorrent(baseTorrent) : baseTorrent;
    const controllerRef: RecoveryControllerRef = { current: null };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(
        React.createElement(RecoveryControllerHarness, {
            controllerRef,
            initialDetail: torrent,
            initialFaultMode: faultMode ?? scenario.faultMode,
        }),
    );
    await waitForCondition(() => controllerRef.current !== null, 1_500);

    return {
        controllerRef,
        torrent,
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
            const outcome = controller.actions.openRecoveryModal(notActionableTorrent);
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
                () => Boolean(readController(mounted.controllerRef).state.session),
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
                () => Boolean(readController(mounted.controllerRef).state.session),
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
