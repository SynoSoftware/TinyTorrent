import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { Table } from "@tanstack/react-table";
import { registry } from "@/config/logic";

import { TorrentTable_SpeedCell } from "@/modules/dashboard/components/TorrentTable_SpeedColumnCell";
import type { TorrentEntity } from "@/services/rpc/entities";

const { performance } = registry;

const makeTorrent = (overrides: Partial<TorrentEntity> = {}): TorrentEntity => ({
    id: "torrent-1",
    hash: "hash-1",
    name: "Torrent 1",
    state: "seeding",
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0 },
    totalSize: 0,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 1,
    ...overrides,
});

describe("TorrentTable_SpeedCell", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("draws a flat sparkline on first render from a zero-seeded fixed buffer", () => {
        const torrent = makeTorrent();
        const seededDownHistory = new Array(performance.historyDataPoints).fill(0);
        const seededUpHistory = new Array(performance.historyDataPoints).fill(0);
        const table = {
            options: {
                meta: {
                    speedHistoryRef: {
                        current: {
                            "torrent-1": {
                                down: seededDownHistory,
                                up: seededUpHistory,
                            },
                        },
                    },
                    rowHeight: 32,
                },
            },
        } as unknown as Table<TorrentEntity>;

        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(TorrentTable_SpeedCell, {
                        torrent,
                        table,
                    }),
                );
            });

            expect(container.querySelector("svg")).not.toBeNull();
            expect(container.querySelector("path")?.getAttribute("d")).toContain("C");
            expect(container.textContent).toContain("0 B/s");
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("can render from a direct speed history snapshot without table metadata", () => {
        const torrent = makeTorrent();
        const seededDownHistory = new Array(performance.historyDataPoints).fill(0);
        const seededUpHistory = new Array(performance.historyDataPoints).fill(0);

        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(TorrentTable_SpeedCell, {
                        torrent,
                        speedHistory: {
                            down: seededDownHistory,
                            up: seededUpHistory,
                        },
                    }),
                );
            });

            expect(container.querySelector("svg")).not.toBeNull();
            expect(container.textContent).toContain("0 B/s");
        } finally {
            root.unmount();
            container.remove();
        }
    });
});
