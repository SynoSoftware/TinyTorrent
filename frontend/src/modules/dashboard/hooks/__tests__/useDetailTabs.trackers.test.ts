import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { useTorrentDetailTabCoordinator } from "@/modules/dashboard/hooks/useDetailTabs";
import type { DashboardDetailViewModel } from "@/app/viewModels/useAppViewModel";
import type { TorrentDetailEntity, TorrentTrackerEntity } from "@/services/rpc/entities";
import { commandOutcome } from "@/app/context/AppCommandContext";

let inspectorTabMock: "general" | "pieces" | "trackers" = "trackers";
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
    PeersTab: () => null,
}));

vi.mock("@/modules/dashboard/components/TorrentDetails_Speed", () => ({
    SpeedTab: () => null,
}));

vi.mock("@/modules/dashboard/components/TorrentDetails_Trackers", () => ({
    TrackersTab: ({
        trackers,
        emptyMessage,
        commands,
    }: {
        trackers: TorrentTrackerEntity[];
        emptyMessage: string;
        commands: DashboardDetailViewModel["tabs"]["trackers"];
    }) =>
        createElement(
            "div",
            {
                "data-testid": "trackers-surface",
                "data-torrent-id": String(commands.torrentId ?? ""),
            },
            trackers.length > 0
                ? trackers.map((tracker) => tracker.announce).join(",")
                : emptyMessage,
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
});
