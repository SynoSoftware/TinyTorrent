import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { PeersTab } from "@/modules/dashboard/components/TorrentDetails_Peers";
import type { TorrentPeerEntity } from "@/services/rpc/entities";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/modules/dashboard/hooks/useTorrentClipboard", () => ({
    useTorrentClipboard: () => ({
        copyToClipboard: vi.fn(),
    }),
}));

vi.mock("@/shared/hooks/useLayoutMetrics", () => ({
    __esModule: true,
    default: () => ({
        rowHeight: 34,
        fileContextMenuMargin: 8,
        fileContextMenuWidth: 220,
    }),
}));

const makePeer = (
    overrides?: Partial<TorrentPeerEntity>,
): TorrentPeerEntity => ({
    address: "203.0.113.41",
    port: 51413,
    clientIsChoking: false,
    clientIsInterested: true,
    peerIsChoking: false,
    peerIsInterested: true,
    isDownloadingFrom: true,
    isEncrypted: true,
    isIncoming: true,
    isUploadingTo: false,
    isUtp: true,
    clientName: "Transmission 4.0.6",
    bytesToClient: 0,
    bytesToPeer: 0,
    rateToClient: 0,
    rateToPeer: 0,
    progress: 0,
    flagStr: "TDEI",
    ...overrides,
});

describe("PeersTab", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("renders the peers tab as a single sortable table without the old map layout", () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(PeersTab, {
                        torrentId: "torrent-1",
                        peers: [makePeer()],
                        emptyMessage: "empty",
                    }),
                );
            });

            const table = container.querySelector("table");
            expect(table).not.toBeNull();

            const headers = Array.from(container.querySelectorAll("th")).map(
                (node) => node.textContent?.trim() ?? "",
            );
            expect(headers).toEqual([
                "peers.columns.ip_address",
                "peers.columns.port",
                "peers.columns.connection",
                "peers.columns.state",
                "peers.columns.client",
                "peers.columns.progress",
                "peers.columns.down_speed",
                "peers.columns.up_speed",
                "peers.columns.downloaded",
                "peers.columns.uploaded",
            ]);
            expect(container.textContent).not.toContain("HUD");

            const firstRowCells = container.querySelectorAll("tbody tr td");
            expect(firstRowCells[3]?.textContent?.trim() ?? "").toBe(
                "peers.state.receiving",
            );
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("renders only real peers and does not show blank fallback rows", () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(PeersTab, {
                        torrentId: "torrent-1",
                        peers: [
                            makePeer({
                                address: "203.0.113.41",
                            }),
                            makePeer({
                                address: "198.51.100.9",
                                port: 60000,
                            }),
                            makePeer({
                                address: " ",
                                port: 0,
                                clientName: "",
                                flagStr: "",
                            }),
                        ],
                        emptyMessage: "empty",
                    }),
                );
            });

            const rows = Array.from(container.querySelectorAll("tbody tr"));
            expect(rows).toHaveLength(2);
            expect(container.textContent).toContain("203.0.113.41");
            expect(container.textContent).toContain("198.51.100.9");
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("replaces the rendered peer rows when the active torrent changes", () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(PeersTab, {
                        torrentId: "torrent-a",
                        peers: [makePeer({ address: "203.0.113.41" })],
                        emptyMessage: "empty",
                    }),
                );
            });

            expect(container.textContent).toContain("203.0.113.41");

            flushSync(() => {
                root.render(
                    createElement(PeersTab, {
                        torrentId: "torrent-b",
                        peers: [makePeer({ address: "198.51.100.9" })],
                        emptyMessage: "empty",
                    }),
                );
            });

            expect(container.textContent).toContain("198.51.100.9");
            expect(container.textContent).not.toContain("203.0.113.41");
        } finally {
            root.unmount();
            container.remove();
        }
    });
});
