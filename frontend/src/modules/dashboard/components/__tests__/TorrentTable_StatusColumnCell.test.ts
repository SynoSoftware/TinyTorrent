import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { TFunction } from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TorrentTable_StatusCell } from "@/modules/dashboard/components/TorrentTable_StatusColumnCell";
import { registry } from "@/config/logic";
import { resetTorrentStatusRuntimeState } from "@/modules/dashboard/utils/torrentStatus";
import type { TorrentEntity } from "@/services/rpc/entities";
import type { OptimisticStatusEntry } from "@/modules/dashboard/types/contracts";
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
    leftUntilDone: 100,
    desiredAvailable: 0,
    metadataPercentComplete: 1,
    webseedsSendingToUs: 0,
    error: 0,
    ...overrides,
});

const makeTableMeta = (
    torrentId: string,
    history: Array<number | null>,
) =>
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

const renderStatusCell = ({
    torrent,
    history,
    optimisticStatus,
}: {
    torrent: TorrentEntity;
    history: Array<number | null>;
    optimisticStatus?: OptimisticStatusEntry;
}) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    const render = (nextTorrent = torrent) => {
        flushSync(() => {
            root.render(
                createElement(TorrentTable_StatusCell, {
                    torrent: nextTorrent,
                    t,
                    table: makeTableMeta(nextTorrent.id, history),
                    optimisticStatus,
                }),
            );
        });
    };

    const getTooltip = () =>
        (container.querySelector("[title]") as HTMLElement | null)?.getAttribute("title");
    const getIcons = () => container.querySelectorAll("[data-testid='status-icon']");

    render();

    return {
        container,
        render,
        getTooltip,
        getIcons,
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

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
            desiredAvailable: 100,
            peerSummary: { connected: 2, getting: 1, sending: 0 },
        });
        const rendered = renderStatusCell({
            torrent,
            history: [512, 256, 128],
        });

        try {
            expect(
                rendered.getIcons()[0]?.getAttribute("data-icon"),
            ).toBe("ArrowUp");
            expect(
                rendered.getIcons()[1]?.getAttribute("data-icon"),
            ).toMatch(/CheckCircle2|CircleCheck/);
            expect(rendered.getTooltip()).toContain(
                "table.status_seed",
            );
            expect(rendered.getTooltip()).toContain(
                "table.status_tooltip.availability.fully_available",
            );
            expect(rendered.getTooltip()).not.toContain("\n\n");
            expect(rendered.getIcons()).toHaveLength(2);
        } finally {
            rendered.cleanup();
        }
    });

    it("uses the idle seeding visual without marking the torrent stalled", () => {
        const torrent = makeTorrent({
            state: status.torrent.seeding,
        });
        const rendered = renderStatusCell({
            torrent,
            history: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        });

        try {
            vi.advanceTimersByTime(stalledObservationWindowMs);
            rendered.render();

            expect(
                rendered.getIcons()[0]?.getAttribute("data-icon"),
            ).toBe("Loader");
            expect(rendered.container.textContent).toContain("table.status_seed");
            expect(rendered.getTooltip()).toContain(
                "table.status_tooltip.detail.idle_seeding_disconnected",
            );
            expect(rendered.getTooltip()).toContain("\n\n");
        } finally {
            rendered.cleanup();
        }
    });

    it("uses loader during startup connecting grace for idle downloads", () => {
        const torrent = makeTorrent({
            state: status.torrent.downloading,
        });
        const rendered = renderStatusCell({
            torrent,
            history: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        });

        try {
            expect(
                rendered.getIcons()[0]?.getAttribute("data-icon"),
            ).toBe("Loader");
            expect(rendered.container.textContent).toContain(
                "labels.status.torrent.connecting",
            );
        } finally {
            rendered.cleanup();
        }
    });

    it("shows the warning health icon when only some remaining data is reachable", () => {
        const torrent = makeTorrent({
            added: Math.floor(Date.now() / 1000) - 120,
            desiredAvailable: 40,
            peerSummary: { connected: 2, getting: 1, sending: 0 },
        });
        const rendered = renderStatusCell({
            torrent,
            history: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        });

        try {
            vi.advanceTimersByTime(startupGraceMs + 1);
            rendered.render();

            expect(
                rendered.getIcons()[1]?.getAttribute("data-icon"),
            ).toMatch(/AlertTriangle|TriangleAlert/);
            expect(rendered.getTooltip()).toContain(
                "table.status_tooltip.availability.degraded",
            );
            expect(rendered.getTooltip()).toContain(
                "table.status_tooltip.detail.stalled_connected",
            );
            expect(rendered.getTooltip()).toContain("\n\n");
        } finally {
            rendered.cleanup();
        }
    });

    it("shows the finding-peers health icon while no sources are connected", () => {
        const torrent = makeTorrent();
        const rendered = renderStatusCell({
            torrent,
            history: [0, 0, 0],
        });

        try {
            expect(
                rendered.getIcons()[1]?.getAttribute("data-icon"),
            ).toBe("Search");
            expect(rendered.getTooltip()).toContain(
                "table.status_tooltip.availability.finding_peers",
            );
        } finally {
            rendered.cleanup();
        }
    });

    it("keeps wifi-off for stalled downloads", () => {
        const torrent = makeTorrent({
            state: status.torrent.downloading,
        });
        const rendered = renderStatusCell({
            torrent,
            history: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        });

        try {
            vi.advanceTimersByTime(startupGraceMs + stalledObservationWindowMs);
            rendered.render();

            expect(
                rendered.getIcons()[0]?.getAttribute("data-icon"),
            ).toBe("WifiOff");
        } finally {
            rendered.cleanup();
        }
    });

    it("shows the unavailable health icon when no remaining data is reachable from connected peers", () => {
        const torrent = makeTorrent({
            added: Math.floor(Date.now() / 1000) - 120,
            peerSummary: { connected: 3, getting: 0, sending: 0 },
        });
        const rendered = renderStatusCell({
            torrent,
            history: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        });

        try {
            vi.advanceTimersByTime(startupGraceMs + 1);
            rendered.render();

            expect(
                rendered.getIcons()[1]?.getAttribute("data-icon"),
            ).toBe("CircleOff");
            expect(rendered.getTooltip()).toContain(
                "table.status_tooltip.availability.unavailable",
            );
        } finally {
            rendered.cleanup();
        }
    });

});
