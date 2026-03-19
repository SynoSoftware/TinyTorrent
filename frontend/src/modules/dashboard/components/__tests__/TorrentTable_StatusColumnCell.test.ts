import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { TFunction } from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TorrentTable_StatusCell } from "@/modules/dashboard/components/TorrentTable_StatusColumnCell";
import { registry } from "@/config/logic";
import { resetTorrentStatusRuntimeState } from "@/modules/dashboard/utils/torrentStatus";
import type { TorrentEntity } from "@/services/rpc/entities";
import { status } from "@/shared/status";

vi.mock("@/shared/ui/components/StatusIcon", () => ({
    __esModule: true,
    default: ({
        Icon,
    }: {
        Icon: { displayName?: string; name?: string };
    }) =>
        createElement("span", {
            "data-testid": "status-icon",
            "data-icon": Icon.displayName ?? Icon.name ?? "unknown",
        }),
}));

const t = ((key: string) => key) as unknown as TFunction;
const stalledObservationWindowMs =
    registry.timing.ui.stalledActivityHistoryWindow *
    registry.timing.heartbeat.detailMs;
const startupGraceMs = registry.timing.ui.startupStalledGraceMs;

const makeTorrent = (
    overrides: Partial<TorrentEntity> = {},
): TorrentEntity => ({
    id: "torrent-1",
    hash: "hash-1",
    name: "Torrent 1",
    state: status.torrent.downloading,
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0, getting: 0, sending: 0 },
    totalSize: 100,
    eta: -1,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 1,
    ...overrides,
});

const makeTableMeta = (torrentId: string, history: Array<number | null>) =>
    ({
        options: {
            meta: {
                speedHistoryRef: {
                    current: {
                        [torrentId]: history,
                    },
                },
            },
        },
    }) as never;

describe("TorrentTable_StatusCell", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-18T12:00:00Z"));
        resetTorrentStatusRuntimeState();
    });

    afterEach(() => {
        resetTorrentStatusRuntimeState();
        vi.useRealTimers();
        document.body.innerHTML = "";
    });

    it("keeps the upload icon for active seeding", () => {
        const torrent = makeTorrent({
            state: status.torrent.seeding,
            speed: { down: 0, up: 1024 },
        });
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(TorrentTable_StatusCell, {
                        torrent,
                        t,
                        table: makeTableMeta(torrent.id, [512, 256, 128]),
                    }),
                );
            });

            expect(
                container.querySelector("[data-testid='status-icon']")?.getAttribute(
                    "data-icon",
                ),
            ).toBe("ArrowUp");
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("uses the idle seeding visual without marking the torrent stalled", () => {
        const torrent = makeTorrent({
            state: status.torrent.seeding,
        });
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(TorrentTable_StatusCell, {
                        torrent,
                        t,
                        table: makeTableMeta(
                            torrent.id,
                            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                        ),
                        }),
                );
            });
            vi.advanceTimersByTime(stalledObservationWindowMs);
            flushSync(() => {
                root.render(
                    createElement(TorrentTable_StatusCell, {
                        torrent,
                        t,
                        table: makeTableMeta(
                            torrent.id,
                            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                        ),
                        optimisticStatus: undefined,
                    }),
                );
            });

            expect(
                container.querySelector("[data-testid='status-icon']")?.getAttribute(
                    "data-icon",
                ),
            ).toBe("Loader");
            expect(container.textContent).toContain("table.status_seed");
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("uses loader during startup connecting grace for idle downloads", () => {
        const torrent = makeTorrent({
            state: status.torrent.downloading,
        });
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(TorrentTable_StatusCell, {
                        torrent,
                        t,
                        table: makeTableMeta(
                            torrent.id,
                            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                        ),
                    }),
                );
            });

            expect(
                container.querySelector("[data-testid='status-icon']")?.getAttribute(
                    "data-icon",
                ),
            ).toBe("Loader");
            expect(container.textContent).toContain("labels.status.torrent.connecting");
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("keeps wifi-off for stalled downloads", () => {
        const torrent = makeTorrent({
            state: status.torrent.downloading,
        });
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(TorrentTable_StatusCell, {
                        torrent,
                        t,
                        table: makeTableMeta(
                            torrent.id,
                            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                        ),
                        }),
                );
            });
            vi.advanceTimersByTime(startupGraceMs + stalledObservationWindowMs);
            flushSync(() => {
                root.render(
                    createElement(TorrentTable_StatusCell, {
                        torrent,
                        t,
                        table: makeTableMeta(
                            torrent.id,
                            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                        ),
                    }),
                );
            });

            expect(
                container.querySelector("[data-testid='status-icon']")?.getAttribute(
                    "data-icon",
                ),
            ).toBe("WifiOff");
        } finally {
            root.unmount();
            container.remove();
        }
    });

});
