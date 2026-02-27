import { describe, expect, it, vi } from "vitest";
import {
    dispatchTorrentAction,
    dispatchTorrentSelectionAction,
} from "@/app/utils/torrentActionDispatcher";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";

const makeTorrent = (overrides?: Partial<Torrent>): Torrent =>
    ({
        id: "torrent-1",
        hash: "hash-1",
        name: "Sample",
        ...overrides,
    }) as Torrent;

describe("torrentActionDispatcher", () => {
    it("maps resume to ENSURE_TORRENT_ACTIVE", async () => {
        const dispatch = vi.fn(
            async (intent: unknown): Promise<TorrentDispatchOutcome> => {
                void intent;
                return {
                    status: "applied",
                };
            },
        );

        const outcome = await dispatchTorrentAction({
            action: "resume",
            torrent: makeTorrent(),
            dispatch,
        });

        expect(outcome).toEqual({ status: "success" });
        expect(dispatch).toHaveBeenCalledTimes(1);
        const firstCall = dispatch.mock.calls[0];
        const intent = (firstCall?.[0] ?? {}) as { type?: string };
        expect(intent.type).toBe("ENSURE_TORRENT_ACTIVE");
    });

    it("maps start-now action to ENSURE_TORRENT_ACTIVE_NOW", async () => {
        const dispatch = vi.fn(
            async (intent: unknown): Promise<TorrentDispatchOutcome> => {
                void intent;
                return {
                    status: "applied",
                };
            },
        );

        const outcome = await dispatchTorrentAction({
            action: "resume-now",
            torrent: makeTorrent(),
            dispatch,
        });

        expect(outcome).toEqual({ status: "success" });
        expect(dispatch).toHaveBeenCalledTimes(1);
        const firstCall = dispatch.mock.calls[0];
        const intent = (firstCall?.[0] ?? {}) as { type?: string };
        expect(intent.type).toBe("ENSURE_TORRENT_ACTIVE_NOW");
    });

    it("maps pause action to ENSURE_TORRENT_PAUSED", async () => {
        const dispatch = vi.fn(
            async (intent: unknown): Promise<TorrentDispatchOutcome> => {
                void intent;
                return {
                    status: "applied",
                };
            },
        );

        const outcome = await dispatchTorrentAction({
            action: "pause",
            torrent: makeTorrent(),
            dispatch,
        });

        expect(outcome).toEqual({ status: "success" });
        expect(dispatch).toHaveBeenCalledTimes(1);
        const firstCall = dispatch.mock.calls[0];
        const intent = (firstCall?.[0] ?? {}) as { type?: string };
        expect(intent.type).toBe("ENSURE_TORRENT_PAUSED");
    });

    it("returns unsupported when no torrent key exists", async () => {
        const dispatch = vi.fn(
            async (_intent: unknown): Promise<TorrentDispatchOutcome> => ({
                status: "applied",
            }),
        );

        const outcome = await dispatchTorrentAction({
            action: "pause",
            torrent: makeTorrent({ id: undefined, hash: "" }),
            dispatch,
        });

        expect(outcome).toEqual({
            status: "unsupported",
            reason: "action_not_supported",
        });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("bulk resume maps to ENSURE_SELECTION_ACTIVE", async () => {
        const dispatch = vi.fn(
            async (intent: unknown): Promise<TorrentDispatchOutcome> => {
                void intent;
                return {
                    status: "applied",
                };
            },
        );

        const ids = ["torrent-a", "torrent-b"];
        const outcome = await dispatchTorrentSelectionAction({
            action: "resume",
            ids,
            dispatch,
        });

        expect(outcome).toEqual({ status: "success" });
        expect(dispatch).toHaveBeenCalledTimes(1);
        const firstCall = dispatch.mock.calls[0];
        const intent = (firstCall?.[0] ?? {}) as {
            type?: string;
            torrentIds?: string[];
        };
        expect(intent.type).toBe("ENSURE_SELECTION_ACTIVE");
        expect(intent.torrentIds).toEqual(ids);
    });
});

