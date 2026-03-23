import { createElement, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { TFunction } from "i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TORRENTTABLE_COLUMN_DEFS } from "@/modules/dashboard/components/TorrentTable_ColumnDefs";
import type { TorrentEntity } from "@/services/rpc/entities";
import { status } from "@/shared/status";

vi.mock("@heroui/react", async () => {
    const actual = await vi.importActual<typeof import("@heroui/react")>(
        "@heroui/react",
    );
    return {
        ...actual,
        Tooltip: ({ children }: { children: ReactNode }) => children,
    };
});

vi.mock("@/shared/utils/format", async () => {
    const actual = await vi.importActual<typeof import("@/shared/utils/format")>(
        "@/shared/utils/format",
    );
    return {
        ...actual,
        formatDate: (timestamp: number) => `date:${timestamp}`,
        formatRelativeTime: (timestamp?: number) =>
            `relative:${timestamp ?? "missing"}`,
    };
});

const t = ((key: string) =>
    key === "torrent_modal.general.values.not_completed"
        ? "Not completed"
        : key) as unknown as TFunction;

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

describe("TORRENTTABLE_COLUMN_DEFS.completedOn", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("sorts incomplete torrents before completed ones", () => {
        const incomplete = makeTorrent();
        const completed = makeTorrent({ doneDate: 1_700_000_000 });

        expect(TORRENTTABLE_COLUMN_DEFS.completedOn.sortAccessor?.(incomplete)).toBe(0);
        expect(TORRENTTABLE_COLUMN_DEFS.completedOn.sortAccessor?.(completed)).toBe(
            1_700_000_000,
        );
    });

    it("renders a fallback label when the torrent is not completed", () => {
        const torrent = makeTorrent();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(
                        "div",
                        null,
                        TORRENTTABLE_COLUMN_DEFS.completedOn.render({
                            torrent,
                            t,
                            isSelected: false,
                            table: {} as never,
                            optimisticStatus: undefined,
                        }),
                    ),
                );
            });

            expect(container.textContent?.trim()).toBe("Not completed");
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("renders the formatted completion date when available", () => {
        const torrent = makeTorrent({ doneDate: 1_700_000_000 });
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(
                        "div",
                        null,
                        TORRENTTABLE_COLUMN_DEFS.completedOn.render({
                            torrent,
                            t,
                            isSelected: false,
                            table: {} as never,
                            optimisticStatus: undefined,
                        }),
                    ),
                );
            });

            expect(container.textContent?.trim()).toBe("relative:1700000000");
        } finally {
            root.unmount();
            container.remove();
        }
    });
});
