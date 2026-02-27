import { describe, expect, it, vi } from "vitest";
import { createTorrentDispatch } from "@/app/actions/torrentDispatch";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { status } from "@/shared/status";

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs = 2000,
) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (predicate()) {
            return;
        }
        await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 20);
        });
    }
    throw new Error("wait_for_condition_timeout");
};

const createMockClient = (commandLog: string[]): EngineAdapter => ({
    getTorrents: vi.fn(async () => []),
    getTorrentDetails: vi.fn(async () => {
        throw new Error("not_used_in_this_test");
    }),
    getSessionStats: vi.fn(async () => ({
        downloadSpeed: 0,
        uploadSpeed: 0,
        torrentCount: 0,
        activeTorrentCount: 0,
        pausedTorrentCount: 0,
    })),
    addTorrent: vi.fn(async () => ({
        id: "added-id",
        rpcId: 1,
    })),
    pause: vi.fn(async (ids: string[]) => {
        commandLog.push(`pause:${ids.join(",")}`);
    }),
    resume: vi.fn(async (ids: string[]) => {
        commandLog.push(`resume:${ids.join(",")}`);
    }),
    startNow: vi.fn(async (ids: string[]) => {
        commandLog.push(`start-now:${ids.join(",")}`);
    }),
    remove: vi.fn(async (ids: string[], deleteData: boolean) => {
        commandLog.push(`remove:${ids.join(",")}:${String(deleteData)}`);
    }),
    verify: vi.fn(async (ids: string[]) => {
        commandLog.push(`verify:${ids.join(",")}`);
    }),
    addTrackers: vi.fn(async (ids: string[], trackers: string[]) => {
        commandLog.push(`tracker-add:${ids.join(",")}:${trackers.join("|")}`);
    }),
    removeTrackers: vi.fn(async (ids: string[], trackerIds: number[]) => {
        commandLog.push(
            `tracker-remove:${ids.join(",")}:${trackerIds.join("|")}`,
        );
    }),
    replaceTrackers: vi.fn(async (ids: string[], trackers: string[]) => {
        commandLog.push(
            `tracker-replace:${ids.join(",")}:${trackers.join("|")}`,
        );
    }),
    moveToTop: vi.fn(async () => {}),
    moveUp: vi.fn(async () => {}),
    moveDown: vi.fn(async () => {}),
    moveToBottom: vi.fn(async () => {}),
    updateFileSelection: vi.fn(async () => {}),
    setTorrentLocation: vi.fn(
        async (id: string, location: string, moveData?: boolean) => {
            commandLog.push(
                `set-location:${id}:${location}:${String(moveData ?? true)}`,
            );
        },
    ),
    subscribeToHeartbeat: vi.fn(() => ({
        unsubscribe: () => undefined,
    })),
    destroy: vi.fn(),
});

describe("torrentDispatch command flow", () => {
    it("dispatches paused -> recheck -> resume without local blocking", async () => {
        const commandLog: string[] = [];
        const refreshTorrents = vi.fn(async () => {});
        const refreshSessionStatsData = vi.fn(async () => {});
        const refreshDetailData = vi.fn(async () => {});
        const dispatch = createTorrentDispatch({
            client: createMockClient(commandLog),
            refreshTorrents,
            refreshSessionStatsData,
            refreshDetailData,
        });

        const recheckOutcome = await dispatch(TorrentIntents.ensureValid("t-1"));
        const resumeOutcome = await dispatch(TorrentIntents.ensureActive("t-1"));

        expect(recheckOutcome).toEqual({ status: "applied" });
        expect(resumeOutcome).toEqual({ status: "applied" });
        expect(commandLog).toEqual(["verify:t-1", "resume:t-1"]);
        expect(refreshTorrents).toHaveBeenCalledTimes(2);
        expect(refreshSessionStatsData).toHaveBeenCalledTimes(2);
        expect(refreshDetailData).toHaveBeenCalledTimes(2);
    });

    it("dispatches downloading -> recheck -> pause without local blocking", async () => {
        const commandLog: string[] = [];
        const refreshTorrents = vi.fn(async () => {});
        const refreshSessionStatsData = vi.fn(async () => {});
        const refreshDetailData = vi.fn(async () => {});
        const dispatch = createTorrentDispatch({
            client: createMockClient(commandLog),
            refreshTorrents,
            refreshSessionStatsData,
            refreshDetailData,
        });

        const recheckOutcome = await dispatch(TorrentIntents.ensureValid("t-2"));
        const pauseOutcome = await dispatch(TorrentIntents.ensurePaused("t-2"));

        expect(recheckOutcome).toEqual({ status: "applied" });
        expect(pauseOutcome).toEqual({ status: "applied" });
        expect(commandLog).toEqual(["verify:t-2", "pause:t-2"]);
        expect(refreshTorrents).toHaveBeenCalledTimes(2);
        expect(refreshSessionStatsData).toHaveBeenCalledTimes(2);
        expect(refreshDetailData).toHaveBeenCalledTimes(2);
    });

    it("dispatches bulk recheck then bulk pause with full target set", async () => {
        const commandLog: string[] = [];
        const dispatch = createTorrentDispatch({
            client: createMockClient(commandLog),
            refreshTorrents: async () => {},
            refreshSessionStatsData: async () => {},
            refreshDetailData: async () => {},
        });

        const ids = ["t-a", "t-b", "t-c"];
        const recheckOutcome = await dispatch(
            TorrentIntents.ensureSelectionValid(ids),
        );
        const pauseOutcome = await dispatch(
            TorrentIntents.ensureSelectionPaused(ids),
        );

        expect(recheckOutcome).toEqual({ status: "applied" });
        expect(pauseOutcome).toEqual({ status: "applied" });
        expect(commandLog).toEqual([
            "verify:t-a,t-b,t-c",
            "pause:t-a,t-b,t-c",
        ]);
    });

    it("dispatches set-location with explicit locate mode", async () => {
        const commandLog: string[] = [];
        const dispatch = createTorrentDispatch({
            client: createMockClient(commandLog),
            refreshTorrents: async () => {},
            refreshSessionStatsData: async () => {},
            refreshDetailData: async () => {},
        });

        const outcome = await dispatch(
            TorrentIntents.ensureAtLocation("t-loc-1", "D:\\Download", "locate"),
        );

        expect(outcome).toEqual({ status: "applied" });
        await waitForCondition(() => commandLog.includes("verify:t-loc-1"));
        expect(commandLog).toEqual([
            "set-location:t-loc-1:D:\\Download:false",
            "verify:t-loc-1",
        ]);
    });

    it("owns locate follow-up inside dispatch", async () => {
        const commandLog: string[] = [];
        let detailReadCount = 0;
        const refreshTorrents = vi.fn(async () => {});
        const refreshSessionStatsData = vi.fn(async () => {});
        const refreshDetailData = vi.fn(async () => {});
        const client = createMockClient(commandLog);
        client.getTorrentDetails = vi.fn(async () => {
            detailReadCount += 1;
            return {
                id: "t-loc-followup",
                hash: "h-loc-followup",
                name: "follow-up",
                state:
                    detailReadCount === 1
                        ? status.torrent.checking
                        : status.torrent.paused,
                speed: { down: 0, up: 0 },
                peerSummary: { connected: 0 },
                totalSize: 0,
                eta: 0,
                ratio: 0,
                uploaded: 0,
                downloaded: 0,
                leftUntilDone: 0,
                added: Date.now(),
            };
        });
        const dispatch = createTorrentDispatch({
            client,
            refreshTorrents,
            refreshSessionStatsData,
            refreshDetailData,
        });

        const outcome = await dispatch(
            TorrentIntents.ensureAtLocation(
                "t-loc-followup",
                "G:\\Download",
                "locate",
                true,
            ),
        );

        expect(outcome).toEqual({ status: "applied" });
        await waitForCondition(
            () =>
                commandLog.includes("verify:t-loc-followup") &&
                commandLog.includes("resume:t-loc-followup"),
        );
        expect(commandLog).toEqual([
            "set-location:t-loc-followup:G:\\Download:false",
            "verify:t-loc-followup",
            "resume:t-loc-followup",
        ]);
        expect(refreshTorrents).toHaveBeenCalledTimes(2);
        expect(refreshDetailData).toHaveBeenCalledTimes(2);
        expect(refreshSessionStatsData).toHaveBeenCalledTimes(2);
    });

    it("dispatches single start-now intent using adapter startNow", async () => {
        const commandLog: string[] = [];
        const dispatch = createTorrentDispatch({
            client: createMockClient(commandLog),
            refreshTorrents: async () => {},
            refreshSessionStatsData: async () => {},
            refreshDetailData: async () => {},
        });

        const outcome = await dispatch(TorrentIntents.ensureActiveNow("t-now"));

        expect(outcome).toEqual({ status: "applied" });
        expect(commandLog).toEqual(["start-now:t-now"]);
    });

    it("dispatches bulk start-now intent using adapter startNow", async () => {
        const commandLog: string[] = [];
        const dispatch = createTorrentDispatch({
            client: createMockClient(commandLog),
            refreshTorrents: async () => {},
            refreshSessionStatsData: async () => {},
            refreshDetailData: async () => {},
        });

        const outcome = await dispatch(
            TorrentIntents.ensureSelectionActiveNow(["t-1", "t-2"]),
        );

        expect(outcome).toEqual({ status: "applied" });
        expect(commandLog).toEqual(["start-now:t-1,t-2"]);
    });

    it("dispatches set-location with explicit move mode", async () => {
        const commandLog: string[] = [];
        const dispatch = createTorrentDispatch({
            client: createMockClient(commandLog),
            refreshTorrents: async () => {},
            refreshSessionStatsData: async () => {},
            refreshDetailData: async () => {},
        });

        const outcome = await dispatch(
            TorrentIntents.ensureAtLocation("t-loc-2", "E:\\Download", "move"),
        );

        expect(outcome).toEqual({ status: "applied" });
        expect(commandLog).toEqual([
            "set-location:t-loc-2:E:\\Download:true",
        ]);
    });

    it("returns unsupported when set-location RPC method is missing", async () => {
        const commandLog: string[] = [];
        const client = createMockClient(commandLog);
        delete (
            client as {
                setTorrentLocation?: EngineAdapter["setTorrentLocation"];
            }
        ).setTorrentLocation;
        const dispatch = createTorrentDispatch({
            client,
            refreshTorrents: async () => {},
            refreshSessionStatsData: async () => {},
            refreshDetailData: async () => {},
        });

        const outcome = await dispatch(
            TorrentIntents.ensureAtLocation("t-loc-3", "F:\\Download", "move"),
        );

        expect(outcome).toEqual({
            status: "unsupported",
            reason: "method_missing",
        });
    });

    it("returns unsupported when start-now RPC method is missing", async () => {
        const commandLog: string[] = [];
        const client = createMockClient(commandLog);
        delete (client as { startNow?: EngineAdapter["startNow"] }).startNow;
        const dispatch = createTorrentDispatch({
            client,
            refreshTorrents: async () => {},
            refreshSessionStatsData: async () => {},
            refreshDetailData: async () => {},
        });

        const outcome = await dispatch(TorrentIntents.ensureActiveNow("t-now"));

        expect(outcome).toEqual({
            status: "unsupported",
            reason: "method_missing",
        });
    });

    it("dispatches add tracker mutation through adapter", async () => {
        const commandLog: string[] = [];
        const dispatch = createTorrentDispatch({
            client: createMockClient(commandLog),
            refreshTorrents: async () => {},
            refreshSessionStatsData: async () => {},
            refreshDetailData: async () => {},
        });

        const outcome = await dispatch(
            TorrentIntents.torrentAddTracker(["t-1", "t-2"], [
                "https://tracker-a/announce",
                "https://tracker-b/announce",
            ]),
        );

        expect(outcome).toEqual({ status: "applied" });
        expect(commandLog).toEqual([
            "tracker-add:t-1,t-2:https://tracker-a/announce|https://tracker-b/announce",
        ]);
    });

    it("dispatches remove tracker mutation through adapter", async () => {
        const commandLog: string[] = [];
        const dispatch = createTorrentDispatch({
            client: createMockClient(commandLog),
            refreshTorrents: async () => {},
            refreshSessionStatsData: async () => {},
            refreshDetailData: async () => {},
        });

        const outcome = await dispatch(
            TorrentIntents.torrentRemoveTracker(["t-1"], [11, 22]),
        );

        expect(outcome).toEqual({ status: "applied" });
        expect(commandLog).toEqual(["tracker-remove:t-1:11|22"]);
    });

    it("dispatches replace trackers mutation through adapter", async () => {
        const commandLog: string[] = [];
        const dispatch = createTorrentDispatch({
            client: createMockClient(commandLog),
            refreshTorrents: async () => {},
            refreshSessionStatsData: async () => {},
            refreshDetailData: async () => {},
        });

        const outcome = await dispatch(
            TorrentIntents.torrentReplaceTrackers(["t-7"], [
                "https://tracker-c/announce",
            ]),
        );

        expect(outcome).toEqual({ status: "applied" });
        expect(commandLog).toEqual(["tracker-replace:t-7:https://tracker-c/announce"]);
    });

    it("returns unsupported when tracker remove method is missing", async () => {
        const commandLog: string[] = [];
        const client = createMockClient(commandLog);
        delete (
            client as { removeTrackers?: EngineAdapter["removeTrackers"] }
        ).removeTrackers;
        const dispatch = createTorrentDispatch({
            client,
            refreshTorrents: async () => {},
            refreshSessionStatsData: async () => {},
            refreshDetailData: async () => {},
        });

        const outcome = await dispatch(
            TorrentIntents.torrentRemoveTracker(["t-1"], [99]),
        );

        expect(outcome).toEqual({
            status: "unsupported",
            reason: "method_missing",
        });
    });
});
