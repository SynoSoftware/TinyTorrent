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

const t = ((key: string) => key) as unknown as TFunction;

const makeTorrent = (
    overrides: Partial<TorrentEntity> = {},
): TorrentEntity => ({
    id: "torrent-1",
    hash: "hash-1",
    name: "Torrent 1",
    state: status.torrent.downloading,
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 5, getting: 2, sending: 3, seeds: 7 },
    totalSize: 100,
    eta: -1,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 1,
    ...overrides,
});

describe("TORRENTTABLE_COLUMN_DEFS.peers", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("renders only the connected peer count in the visible cell", () => {
        const torrent = makeTorrent();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement("div", null, TORRENTTABLE_COLUMN_DEFS.peers.render({
                        torrent,
                        t,
                        isSelected: false,
                        table: {} as never,
                        optimisticStatus: undefined,
                    })),
                );
            });

            expect(container.textContent?.trim()).toBe("5");
            expect(container.textContent).not.toContain("2");
            expect(container.textContent).not.toContain("3");
            expect(container.textContent).not.toContain("7");
        } finally {
            root.unmount();
            container.remove();
        }
    });
});
