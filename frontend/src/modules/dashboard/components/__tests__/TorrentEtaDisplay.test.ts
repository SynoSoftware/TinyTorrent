import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { getTorrentEtaDisplay, getTorrentEtaTableDisplay } from "@/modules/dashboard/components/TorrentEtaDisplay";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { status } from "@/shared/status";

const t = ((key: string, params?: Record<string, unknown>) =>
    params?.time ? `${key}:${String(params.time)}` : key) as TFunction;

const makeTorrent = (overrides?: Partial<Torrent>): Torrent =>
    ({
        id: "torrent-1",
        hash: "hash-1",
        name: "Sample torrent",
        state: status.torrent.downloading,
        totalSize: 100,
        progress: 0.5,
        verificationProgress: undefined,
        speed: { down: 0, up: 0 },
        peerSummary: { connected: 0, sending: 0, getting: 0, seeds: 0 },
        eta: 3665,
        ratio: 0,
        uploaded: 0,
        downloaded: 0,
        added: 0,
        ...overrides,
    }) as Torrent;

describe("TorrentEtaDisplay helpers", () => {
    it("keeps detail eta on absolute completion time with relative tooltip", () => {
        const eta = getTorrentEtaDisplay(makeTorrent({ eta: 3900 }), t);

        expect(eta.value).toMatch(/^\d{1,2}:\d{2}/);
        expect(eta.tooltip).toBe("table.eta:1h 5m");
    });

    it("shows remaining duration in the table eta cell and finish time in the tooltip", () => {
        const eta = getTorrentEtaTableDisplay(makeTorrent({ eta: 3900 }), t);

        expect(eta.value).toBe("1h 5m");
        expect(eta.tooltip).toMatch(/^table\.eta:\d{1,2}:\d{2}/);
    });

    it("keeps unavailable eta states aligned between table and detail surfaces", () => {
        const checkingEta = getTorrentEtaTableDisplay(
            makeTorrent({ state: status.torrent.checking, eta: 120 }),
            t,
        );

        expect(checkingEta).toEqual({
            value: "-",
            tooltip: "labels.status.torrent.checking",
        });
    });
});
