import React, {
    createElement,
    forwardRef,
    useImperativeHandle,
    useId,
    useLayoutEffect,
    useRef,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { useTorrentDetailsPeersViewModel } from "@/modules/dashboard/hooks/useTorrentDetailsPeersViewModel";
import type { TorrentPeerEntity } from "@/services/rpc/entities";

const copyToClipboardMock = vi.fn();

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/modules/dashboard/hooks/useTorrentClipboard", () => ({
    useTorrentClipboard: () => ({
        copyToClipboard: copyToClipboardMock,
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

type HarnessRef = {
    getHeaderLabels: () => string[];
    getRowCount: () => number;
    getRowConnectionLabel: (index: number) => string;
    getRowConnectionDirection: (index: number) => "incoming" | "outgoing";
    getRowConnectionEncrypted: (index: number) => boolean;
    getRowConnectionTooltip: (index: number) => string;
    getRowStateLabel: (index: number) => string;
    getRowStateTooltip: (index: number) => string;
    getRowDownRateLabel: (index: number) => string;
    getRowDownloadedLabel: (index: number) => string;
    openContextMenu: (index: number) => void;
    runCopyIp: () => void;
    getContextAddress: () => string | null;
};

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs = 2000,
) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (predicate()) {
            return;
        }
        await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 20);
        });
    }
    throw new Error("wait_for_condition_timeout");
};

const ViewModelHarness = forwardRef<
    HarnessRef,
    {
        torrentId?: string | number | null;
        peers: TorrentPeerEntity[];
        sortBySpeed?: boolean;
    }
>(({ torrentId = "torrent-1", peers, sortBySpeed = false }, ref) => {
    const hostId = useId();
    const listRef = useRef<HTMLDivElement | null>(null);
    const viewModel = useTorrentDetailsPeersViewModel({
        torrentId,
        peers,
        emptyMessage: "empty",
        listRef,
        sortBySpeed,
    });
    const viewModelRef = useRef(viewModel);

    useLayoutEffect(() => {
        viewModelRef.current = viewModel;
    }, [viewModel]);

    useLayoutEffect(() => {
        const host = document.getElementById(hostId);
        if (!(host instanceof HTMLDivElement)) {
            return;
        }
        listRef.current = host;
        Object.defineProperty(host, "getBoundingClientRect", {
            configurable: true,
            value: () => ({
                width: 640,
                height: 320,
                top: 0,
                left: 0,
                right: 640,
                bottom: 320,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }),
        });
    }, [hostId]);

    useImperativeHandle(
        ref,
        () => ({
            getHeaderLabels: () =>
                viewModelRef.current.table.headerGroups.flatMap((group) =>
                    group.headers.map((header) =>
                        String(header.column.columnDef.header ?? ""),
                    ),
                ),
            getRowCount: () => viewModelRef.current.data.rows.length,
            getRowConnectionLabel: (index: number) =>
                viewModelRef.current.data.rows[index]?.connectionLabel ?? "",
            getRowConnectionDirection: (index: number) =>
                viewModelRef.current.data.rows[index]?.connectionDirection ??
                "outgoing",
            getRowConnectionEncrypted: (index: number) =>
                viewModelRef.current.data.rows[index]?.connectionEncrypted ??
                false,
            getRowConnectionTooltip: (index: number) =>
                viewModelRef.current.data.rows[index]?.connectionTooltip ?? "",
            getRowStateLabel: (index: number) =>
                viewModelRef.current.data.rows[index]?.stateLabel ?? "",
            getRowStateTooltip: (index: number) =>
                viewModelRef.current.data.rows[index]?.stateTooltip ?? "",
            getRowDownRateLabel: (index: number) =>
                viewModelRef.current.data.rows[index]?.downRateLabel ?? "",
            getRowDownloadedLabel: (index: number) =>
                viewModelRef.current.data.rows[index]?.downloadedLabel ?? "",
            openContextMenu: (index: number) => {
                const row = viewModelRef.current.data.rows[index];
                if (!row) {
                    throw new Error("row_missing");
                }
                flushSync(() => {
                    viewModelRef.current.actions.openContextMenu(
                        {
                            clientX: 200,
                            clientY: 120,
                            preventDefault: () => undefined,
                        } as never,
                        row.peer,
                    );
                });
            },
            runCopyIp: () => {
                flushSync(() => {
                    viewModelRef.current.actions.runContextAction("copy_ip");
                });
            },
            getContextAddress: () =>
                viewModelRef.current.state.contextMenu?.peer.address ?? null,
        }),
        [],
    );

    return createElement("div", { id: hostId });
});

const makePeer = (
    overrides?: Partial<TorrentPeerEntity>,
): TorrentPeerEntity => ({
    address: "203.0.113.40",
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

const mountHarness = async (
    peers: TorrentPeerEntity[],
    sortBySpeed = false,
    torrentId: string | number | null = "torrent-1",
) => {
    const ref = React.createRef<HarnessRef>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(
        createElement(ViewModelHarness, {
            ref,
            torrentId,
            peers,
            sortBySpeed,
        }),
    );
    await waitForCondition(() => Boolean(ref.current), 1200);
    return {
        ref,
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("useTorrentDetailsPeersViewModel", () => {
    beforeEach(() => {
        copyToClipboardMock.mockReset();
        copyToClipboardMock.mockResolvedValue(undefined);
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("builds the final peers table columns and normalizes connection/state labels", async () => {
        const mounted = await mountHarness([
            makePeer({
                rateToClient: 2048,
                bytesToClient: 4096,
                flagStr: "TODEI",
            }),
        ]);

        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            expect(harness.getHeaderLabels()).toEqual([
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
            expect(harness.getRowConnectionLabel(0)).toBe("uTP");
            expect(harness.getRowConnectionDirection(0)).toBe("incoming");
            expect(harness.getRowConnectionEncrypted(0)).toBe(true);
            expect(harness.getRowConnectionTooltip(0)).toBe(
                [
                    "peers.connection.transport: uTP",
                    "peers.connection.direction: peers.connection.incoming",
                    "peers.connection.encryption: peers.connection.encrypted",
                ].join("\n"),
            );
            expect(harness.getRowStateLabel(0)).toBe("peers.state.receiving");
            expect(harness.getRowStateTooltip(0)).toBe(
                [
                    "peers.flags.downloading",
                    "peers.flags.requesting",
                    "peers.flags.peer_requesting",
                    "peers.flags.optimistic",
                ].join("\n"),
            );
            expect(harness.getRowDownRateLabel(0)).toBe("2 KB/s");
            expect(harness.getRowDownloadedLabel(0)).toBe("4 KB");
        } finally {
            mounted.cleanup();
        }
    });

    it("copies only the peer host/ip through the context action", async () => {
        const mounted = await mountHarness([
            makePeer({
                address: "198.51.100.7",
                port: 60000,
            }),
        ]);

        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            harness.openContextMenu(0);
            await waitForCondition(
                () => harness.getContextAddress() === "198.51.100.7",
            );
            harness.runCopyIp();
            await waitForCondition(
                () => copyToClipboardMock.mock.calls.length === 1,
            );

            expect(copyToClipboardMock).toHaveBeenCalledWith("198.51.100.7");
        } finally {
            mounted.cleanup();
        }
    });

    it("filters peers without a real address so row count tracks actual peers", async () => {
        const mounted = await mountHarness([
            makePeer({
                address: "198.51.100.7",
            }),
            makePeer({
                address: "   ",
                port: 0,
                clientName: "",
                flagStr: "",
            }),
        ]);

        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            expect(harness.getRowCount()).toBe(1);
            expect(harness.getRowConnectionLabel(0)).toBe("uTP");
        } finally {
            mounted.cleanup();
        }
    });
});
