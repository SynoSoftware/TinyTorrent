import { createElement, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { TFunction } from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registry } from "@/config/logic";
import {
    getStatusSpeedHistory,
    getTorrentStatusPresentation,
    resetTorrentStatusRuntimeState,
} from "@/modules/dashboard/utils/torrentStatus";
import { TorrentTable_HealthCell } from "@/modules/dashboard/components/TorrentTable_HealthColumnCell";
import type { TorrentEntity } from "@/services/rpc/entities";
import { status } from "@/shared/status";

vi.mock("@/shared/ui/components/StatusIcon", () => ({
    __esModule: true,
    default: ({
        Icon,
        className,
    }: {
        Icon: { displayName?: string; name?: string };
        className?: string;
    }) =>
        createElement("span", {
            "data-testid": "health-icon",
            "data-icon": Icon.displayName ?? Icon.name ?? "unknown",
            className,
        }),
}));

vi.mock("@heroui/react", async () => {
    const actual = await vi.importActual<typeof import("@heroui/react")>(
        "@heroui/react",
    );
    return {
        ...actual,
        Tooltip: ({ children }: { children: ReactNode }) => children,
    };
});

const t = ((key: string) => key) as unknown as TFunction;
const healthTone = registry.visuals.status.chip.healthTone;
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
    leftUntilDone: 100,
    desiredAvailable: 0,
    metadataPercentComplete: 1,
    webseedsSendingToUs: 0,
    error: 0,
    ...overrides,
});

describe("TorrentTable_HealthCell", () => {
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

    it("shows healthy for torrents whose remaining data is fully reachable", () => {
        const torrent = makeTorrent({
            desiredAvailable: 100,
            peerSummary: { connected: 2, getting: 1, sending: 0 },
        });
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(TorrentTable_HealthCell, {
                        torrent,
                        t,
                        table: {} as never,
                    }),
                );
            });

            expect(
                container
                    .querySelector("[aria-label='torrent_modal.swarm.states.healthy']")
                    ?.getAttribute("aria-label"),
            ).toBe("torrent_modal.swarm.states.healthy");
            expect(container.innerHTML).toContain(healthTone.healthy);
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("shows warning health when some remaining data is reachable", () => {
        const torrent = makeTorrent({
            added: Math.floor(Date.now() / 1000) - 120,
            desiredAvailable: 40,
            peerSummary: { connected: 2, getting: 1, sending: 0 },
        });
        const rawHistory = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const speedHistory = getStatusSpeedHistory(torrent, rawHistory);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            getTorrentStatusPresentation(torrent, t, undefined, speedHistory);
            vi.advanceTimersByTime(startupGraceMs + 1);
            flushSync(() => {
                root.render(
                    createElement(TorrentTable_HealthCell, {
                        torrent,
                        t,
                        table: {
                            options: {
                                meta: {
                                    speedHistoryRef: {
                                        current: {
                                            [torrent.id]: rawHistory,
                                        },
                                    },
                                },
                            },
                        } as never,
                    }),
                );
            });

            expect(
                container
                    .querySelector("[aria-label='torrent_modal.swarm.states.degraded']")
                    ?.getAttribute("aria-label"),
            ).toBe("torrent_modal.swarm.states.degraded");
            expect(container.innerHTML).toContain(healthTone.degraded);
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("shows degraded health when peers are connected but not sending remaining data", () => {
        const torrent = makeTorrent({
            added: Math.floor(Date.now() / 1000) - 120,
            desiredAvailable: 100,
            peerSummary: { connected: 1, getting: 0, sending: 0 },
        });
        const rawHistory = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const speedHistory = getStatusSpeedHistory(torrent, rawHistory);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            getTorrentStatusPresentation(torrent, t, undefined, speedHistory);
            vi.advanceTimersByTime(startupGraceMs + 1);
            flushSync(() => {
                root.render(
                    createElement(TorrentTable_HealthCell, {
                        torrent,
                        t,
                        table: {
                            options: {
                                meta: {
                                    speedHistoryRef: {
                                        current: {
                                            [torrent.id]: rawHistory,
                                        },
                                    },
                                },
                            },
                        } as never,
                    }),
                );
            });

            expect(
                container
                    .querySelector("[aria-label='torrent_modal.swarm.states.degraded']")
                    ?.getAttribute("aria-label"),
            ).toBe("torrent_modal.swarm.states.degraded");
            expect(container.innerHTML).toContain(healthTone.degraded);
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("shows healthy during connecting when all remaining bytes are reachable", () => {
        const torrent = makeTorrent({
            desiredAvailable: 100,
            peerSummary: { connected: 1, getting: 0, sending: 0 },
        });
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(TorrentTable_HealthCell, {
                        torrent,
                        t,
                        table: {
                            options: {
                                meta: {
                                    speedHistoryRef: {
                                        current: {
                                            [torrent.id]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                                        },
                                    },
                                },
                            },
                        } as never,
                    }),
                );
            });

            expect(
                container
                    .querySelector("[aria-label='torrent_modal.swarm.states.healthy']")
                    ?.getAttribute("aria-label"),
            ).toBe("torrent_modal.swarm.states.healthy");
            expect(container.innerHTML).toContain(healthTone.healthy);
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("shows finding peers during connecting when remaining bytes are not fully reachable", () => {
        const torrent = makeTorrent({
            desiredAvailable: 40,
            peerSummary: { connected: 1, getting: 0, sending: 0 },
        });
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(TorrentTable_HealthCell, {
                        torrent,
                        t,
                        table: {
                            options: {
                                meta: {
                                    speedHistoryRef: {
                                        current: {
                                            [torrent.id]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                                        },
                                    },
                                },
                            },
                        } as never,
                    }),
                );
            });

            expect(
                container
                    .querySelector("[aria-label='torrent_modal.swarm.states.finding_peers']")
                    ?.getAttribute("aria-label"),
            ).toBe("torrent_modal.swarm.states.finding_peers");
            expect(container.innerHTML).toContain(healthTone.finding_peers);
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("shows finding peers with secondary health tone while no sources are connected", () => {
        const torrent = makeTorrent();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(TorrentTable_HealthCell, {
                        torrent,
                        t,
                        table: {} as never,
                    }),
                );
            });

            expect(
                container
                    .querySelector("[aria-label='torrent_modal.swarm.states.finding_peers']")
                    ?.getAttribute("aria-label"),
            ).toBe("torrent_modal.swarm.states.finding_peers");
            expect(container.innerHTML).toContain(healthTone.finding_peers);
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("shows danger health when no remaining data is reachable from connected peers", () => {
        const torrent = makeTorrent({
            added: Math.floor(Date.now() / 1000) - 120,
            peerSummary: { connected: 3, getting: 0, sending: 0 },
        });
        const rawHistory = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const speedHistory = getStatusSpeedHistory(torrent, rawHistory);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            getTorrentStatusPresentation(torrent, t, undefined, speedHistory);
            vi.advanceTimersByTime(startupGraceMs + 1);
            flushSync(() => {
                root.render(
                    createElement(TorrentTable_HealthCell, {
                        torrent,
                        t,
                        table: {
                            options: {
                                meta: {
                                    speedHistoryRef: {
                                        current: {
                                            [torrent.id]: rawHistory,
                                        },
                                    },
                                },
                            },
                        } as never,
                    }),
                );
            });

            expect(
                container
                    .querySelector("[aria-label='torrent_modal.swarm.states.unavailable']")
                    ?.getAttribute("aria-label"),
            ).toBe("torrent_modal.swarm.states.unavailable");
            expect(container.innerHTML).toContain(healthTone.unavailable);
        } finally {
            root.unmount();
            container.remove();
        }
    });
});
