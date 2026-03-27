import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { useTorrentDetailTabCoordinator } from "@/modules/dashboard/hooks/useDetailTabs";
import type { DashboardDetailViewModel } from "@/app/viewModels/useAppViewModel";
import type {
    TorrentDetailEntity,
    TorrentPeerEntity,
} from "@/services/rpc/entities";
import { commandOutcome } from "@/app/context/AppCommandContext";

let inspectorTabMock: "general" | "pieces" | "trackers" | "peers" = "trackers";
const setInspectorTabMock = vi.fn();

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/app/context/PreferencesContext", () => ({
    usePreferences: () => ({
        preferences: {
            inspectorTab: inspectorTabMock,
        },
        setInspectorTab: setInspectorTabMock,
    }),
}));

vi.mock("@/app/hooks/useActionFeedback", () => ({
    useActionFeedback: () => ({
        showFeedback: () => undefined,
    }),
}));

vi.mock("@/modules/dashboard/components/TorrentDetails_General", () => ({
    GeneralTab: () => null,
}));

vi.mock("@/modules/dashboard/components/TorrentDetails_Content", () => ({
    ContentTab: () => null,
}));

vi.mock("@/modules/dashboard/components/TorrentDetails_Pieces", () => ({
    PiecesTab: () => null,
}));

vi.mock("@/modules/dashboard/components/TorrentDetails_Peers", () => ({
    PeersTab: ({
        peers,
        emptyMessage,
    }: {
        peers: TorrentPeerEntity[];
        emptyMessage: string;
    }) =>
        createElement(
            "div",
            {
                "data-testid": "peers-surface",
            },
            peers.length > 0
                ? peers.map((peer) => peer.address).join(",")
                : emptyMessage,
        ),
}));

vi.mock("@/modules/dashboard/components/TorrentDetails_Speed", () => ({
    SpeedTab: () => null,
}));

vi.mock("@/modules/dashboard/components/TorrentDetails_Trackers", () => ({
    TrackersTab: ({
        viewModel,
    }: {
        viewModel: {
            labels: {
                emptyMessage: string;
            };
            data: {
                rows: Array<{
                    announce: string;
                }>;
            };
        } | null;
    }) =>
        createElement(
            "div",
            {
                "data-testid": "trackers-surface",
            },
            !viewModel
                ? "torrent_modal.loading"
                : viewModel.data.rows.length > 0
                ? viewModel.data.rows
                      .map((tracker) => tracker.announce)
                      .join(",")
                : viewModel.labels.emptyMessage,
        ),
}));

const makeDetail = (): TorrentDetailEntity => ({
    id: "torrent-1",
    hash: "hash-1",
    name: "ubuntu.iso",
    state: "paused",
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0 },
    totalSize: 1,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
});

const createViewModel = (
    detailData: TorrentDetailEntity | null,
): DashboardDetailViewModel => ({
    detailData,
    optimisticStatus: undefined,
    handleRequestDetails: async () => undefined,
    closeDetail: () => undefined,
    tabs: {
        navigation: {
            inspectorTabCommand: null,
            onInspectorTabCommandHandled: () => undefined,
        },
        general: {
            sequentialDownloadCapability: "supported",
            handleTorrentAction: async () => commandOutcome.noSelection(),
            handleSequentialToggle: async () => undefined,
            setLocation: {
                policy: {
                    actionLabelKey: "table.actions.set_download_path",
                    modalTitleKey: "modals.set_download_location.title",
                    locationMode: "move",
                    allowCreatePath: true,
                },
                currentPath: "",
                canPickDirectory: false,
                pickDirectoryForSetDownloadPath: async () => null,
                applySetDownloadPath: async () => undefined,
            },
        },
        content: {
            handleFileSelectionChange: async () => undefined,
            handleFilePriorityChange: async () => undefined,
        },
        trackers: {
            torrentId: detailData?.id ?? null,
            addTrackers: async () => ({ status: "applied" }),
            removeTrackers: async () => ({ status: "applied" }),
            setTrackerList: async () => ({ status: "applied" }),
            reannounce: async () => ({ status: "applied" }),
        },
        peers: {
            peerSortStrategy: "client",
            handlePeerContextAction: undefined,
        },
    },
});

function CoordinatorHarness({
    viewModel,
}: {
    viewModel: DashboardDetailViewModel;
}) {
    const coordinator = useTorrentDetailTabCoordinator({
        viewModel,
        isStandalone: false,
        isDetailFullscreen: false,
    });
    return createElement("div", null, coordinator.activeSurface);
}

function HeaderActionsHarness({
    viewModel,
}: {
    viewModel: DashboardDetailViewModel;
}) {
    const coordinator = useTorrentDetailTabCoordinator({
        viewModel,
        isStandalone: false,
        isDetailFullscreen: false,
    });

    return createElement(
        "div",
        { "data-testid": "header-actions" },
        coordinator.headerActions
            .map(
                (action) =>
                    `${action.ariaLabel}:${action.icon.displayName ?? action.icon.name ?? "unknown"}`,
            )
            .join("|"),
    );
}

describe("useTorrentDetailTabCoordinator trackers tab", () => {
    afterEach(() => {
        document.body.innerHTML = "";
        setInspectorTabMock.mockReset();
        inspectorTabMock = "trackers";
    });

    it("updates the active trackers surface when tracker data arrives without requiring a tab switch", () => {
        const detail = makeDetail();
        const viewModel = createViewModel(detail);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(createElement(CoordinatorHarness, { viewModel }));
            });

            expect(container.textContent).toContain("torrent_modal.loading");

            detail.trackers = [
                {
                    announce: "https://tracker.example/announce",
                    tier: 0,
                    lastAnnounceTime: 0,
                    lastAnnounceResult: "",
                    lastAnnounceSucceeded: false,
                    lastScrapeTime: 0,
                    lastScrapeResult: "",
                    lastScrapeSucceeded: false,
                    seederCount: 0,
                    leecherCount: 0,
                },
            ];

            flushSync(() => {
                root.render(createElement(CoordinatorHarness, { viewModel }));
            });

            expect(container.textContent).toContain(
                "https://tracker.example/announce",
            );
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("derives trackers header actions in the coordinator without child registration", () => {
        const detail = {
            ...makeDetail(),
            trackers: [
                {
                    announce: "https://tracker.example/announce",
                    tier: 0,
                    lastAnnounceTime: 0,
                    lastAnnounceResult: "",
                    lastAnnounceSucceeded: false,
                    lastScrapeTime: 0,
                    lastScrapeResult: "",
                    lastScrapeSucceeded: false,
                    seederCount: 0,
                    leecherCount: 0,
                },
            ],
        } satisfies TorrentDetailEntity;
        const viewModel = createViewModel(detail);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(createElement(HeaderActionsHarness, { viewModel }));
            });

            expect(container.textContent).toContain(
                "torrent_modal.trackers.add_action:Plus",
            );
            expect(container.textContent).toContain(
                "torrent_modal.trackers.reannounce_action:RefreshCcw",
            );
            expect(container.textContent).toContain(
                "torrent_modal.trackers.copy_all_action:Copy",
            );
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("suppresses trackers header actions while the tab is still loading", () => {
        const detail = makeDetail();
        const viewModel = createViewModel(detail);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(createElement(HeaderActionsHarness, { viewModel }));
            });

            expect(container.textContent).toBe("");
        } finally {
            root.unmount();
            container.remove();
        }
    });
});

describe("useTorrentDetailTabCoordinator peers tab", () => {
    it("updates the active peers surface when peer data arrives without requiring a tab switch", () => {
        inspectorTabMock = "peers";
        const detail = makeDetail();
        const viewModel = createViewModel(detail);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(createElement(CoordinatorHarness, { viewModel }));
            });

            expect(container.textContent).toContain("torrent_modal.loading");

            detail.peers = [
                {
                    address: "203.0.113.8",
                    port: 51413,
                    clientIsChoking: false,
                    clientIsInterested: true,
                    peerIsChoking: false,
                    peerIsInterested: true,
                    isDownloadingFrom: true,
                    isEncrypted: false,
                    isIncoming: false,
                    isUploadingTo: false,
                    isUtp: true,
                    clientName: "Transmission 4.0.6",
                    bytesToClient: 0,
                    bytesToPeer: 0,
                    rateToClient: 0,
                    rateToPeer: 0,
                    progress: 0,
                    flagStr: "T",
                },
            ];

            flushSync(() => {
                root.render(createElement(CoordinatorHarness, { viewModel }));
            });

            expect(container.textContent).toContain("203.0.113.8");
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("switches the active peers surface to the newly selected torrent", () => {
        inspectorTabMock = "peers";
        const detailA = {
            ...makeDetail(),
            id: "torrent-a",
            hash: "hash-a",
            peers: [
                {
                    address: "203.0.113.8",
                    port: 51413,
                    clientIsChoking: false,
                    clientIsInterested: true,
                    peerIsChoking: false,
                    peerIsInterested: true,
                    isDownloadingFrom: true,
                    isEncrypted: false,
                    isIncoming: false,
                    isUploadingTo: false,
                    isUtp: true,
                    clientName: "Transmission 4.0.6",
                    bytesToClient: 0,
                    bytesToPeer: 0,
                    rateToClient: 0,
                    rateToPeer: 0,
                    progress: 0,
                    flagStr: "T",
                },
            ],
        } satisfies TorrentDetailEntity;
        const detailB = {
            ...makeDetail(),
            id: "torrent-b",
            hash: "hash-b",
            peers: [
                {
                    address: "198.51.100.19",
                    port: 60000,
                    clientIsChoking: false,
                    clientIsInterested: true,
                    peerIsChoking: false,
                    peerIsInterested: true,
                    isDownloadingFrom: true,
                    isEncrypted: false,
                    isIncoming: false,
                    isUploadingTo: false,
                    isUtp: true,
                    clientName: "Transmission 4.0.6",
                    bytesToClient: 0,
                    bytesToPeer: 0,
                    rateToClient: 0,
                    rateToPeer: 0,
                    progress: 0,
                    flagStr: "T",
                },
            ],
        } satisfies TorrentDetailEntity;
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(
                    createElement(CoordinatorHarness, {
                        viewModel: createViewModel(detailA),
                    }),
                );
            });

            expect(container.textContent).toContain("203.0.113.8");

            flushSync(() => {
                root.render(
                    createElement(CoordinatorHarness, {
                        viewModel: createViewModel(detailB),
                    }),
                );
            });

            expect(container.textContent).toContain("198.51.100.19");
            expect(container.textContent).not.toContain("203.0.113.8");
        } finally {
            root.unmount();
            container.remove();
        }
    });

    afterEach(() => {
        document.body.innerHTML = "";
        setInspectorTabMock.mockReset();
        inspectorTabMock = "peers";
    });
});

describe("useTorrentDetailTabCoordinator pieces tab header actions", () => {
    afterEach(() => {
        document.body.innerHTML = "";
        setInspectorTabMock.mockReset();
        inspectorTabMock = "pieces";
    });

    it("shows visibility and sequential toggle actions when sequential download is supported", () => {
        inspectorTabMock = "pieces";
        const detail = {
            ...makeDetail(),
            sequentialDownload: true,
        } satisfies TorrentDetailEntity;
        const viewModel = createViewModel(detail);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(createElement(HeaderActionsHarness, { viewModel }));
            });

            expect(container.textContent).toContain("torrent_modal.piece_map.hide_hud");
            expect(container.textContent).toContain("torrent_modal.piece_map.switch_to_random");
            expect(container.textContent).toContain("Shuffle");
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it("omits the sequential toggle when the capability is unsupported", () => {
        inspectorTabMock = "pieces";
        const detail = {
            ...makeDetail(),
            sequentialDownload: false,
        } satisfies TorrentDetailEntity;
        const viewModel = createViewModel(detail);
        viewModel.tabs.general.sequentialDownloadCapability = "unsupported";
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        try {
            flushSync(() => {
                root.render(createElement(HeaderActionsHarness, { viewModel }));
            });

            expect(container.textContent).toContain("torrent_modal.piece_map.hide_hud");
            expect(container.textContent).not.toContain("sequential_download");
        } finally {
            root.unmount();
            container.remove();
        }
    });
});
