import { describe, expect, it, vi } from "vitest";
import { dispatchTorrentAction } from "@/app/utils/torrentActionDispatcher";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";

const makeTorrent = (overrides?: Partial<Torrent>): Torrent =>
    ({
        id: "torrent-1",
        hash: "hash-1",
        name: "Sample",
        ...overrides,
    }) as Torrent;

describe("torrentActionDispatcher", () => {
    it("maps resume applied outcome to success", async () => {
        const dispatch = vi.fn(
            async (intent: unknown): Promise<TorrentDispatchOutcome> => {
                void intent;
                return {
                    status: "applied",
                };
            },
        );
        const resume = vi.fn(async () => ({ status: "applied" as const }));

        const outcome = await dispatchTorrentAction({
            action: "resume",
            torrent: makeTorrent(),
            dispatch,
            resume,
        });

        expect(outcome).toEqual({ status: "success" });
        expect(resume).toHaveBeenCalledTimes(1);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("maps resume cancelled outcome to canceled operation_cancelled", async () => {
        const dispatch = vi.fn(
            async (intent: unknown): Promise<TorrentDispatchOutcome> => {
                void intent;
                return {
                    status: "applied",
                };
            },
        );
        const resume = vi.fn(async () => ({ status: "cancelled" as const }));

        const outcome = await dispatchTorrentAction({
            action: "resume",
            torrent: makeTorrent(),
            dispatch,
            resume,
        });

        expect(outcome).toEqual({
            status: "canceled",
            reason: "operation_cancelled",
        });
        expect(resume).toHaveBeenCalledTimes(1);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("maps resume failed outcome to failed execution_failed", async () => {
        const dispatch = vi.fn(
            async (intent: unknown): Promise<TorrentDispatchOutcome> => {
                void intent;
                return {
                    status: "applied",
                };
            },
        );
        const resume = vi.fn(async () => ({
            status: "failed" as const,
            reason: "dispatch_not_applied" as const,
        }));

        const outcome = await dispatchTorrentAction({
            action: "resume",
            torrent: makeTorrent(),
            dispatch,
            resume,
        });

        expect(outcome).toEqual({
            status: "failed",
            reason: "execution_failed",
        });
        expect(resume).toHaveBeenCalledTimes(1);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("falls back to failed when resume callback throws", async () => {
        const dispatch = vi.fn(
            async (intent: unknown): Promise<TorrentDispatchOutcome> => {
                void intent;
                return {
                    status: "applied",
                };
            },
        );
        const resume = vi.fn(async () => {
            throw new Error("resume failed");
        });

        const outcome = await dispatchTorrentAction({
            action: "resume",
            torrent: makeTorrent(),
            dispatch,
            resume,
        });

        expect(outcome).toEqual({
            status: "failed",
            reason: "execution_failed",
        });
    });

    it("uses dispatch path when custom resume handler is absent", async () => {
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
        expect(firstCall).toBeDefined();
        const intent = (firstCall?.[0] ?? {}) as { type?: string };
        expect(intent.type).toBe("ENSURE_TORRENT_ACTIVE");
    });
});
