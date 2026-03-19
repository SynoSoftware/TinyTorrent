import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { useTorrentDetailTabCoordinator } from "@/modules/dashboard/hooks/useDetailTabs";
import type { DashboardDetailViewModel } from "@/app/viewModels/useAppViewModel";
import type { TorrentDetailEntity } from "@/services/rpc/entities";
import { commandOutcome } from "@/app/context/AppCommandContext";

let inspectorTabMock: "general" | "pieces" | "trackers" | "peers" = "trackers";
const setInspectorTabMock = vi.fn();
const tMock = (key: string) => key;
const showFeedbackMock = vi.fn();

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: tMock,
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
        showFeedback: showFeedbackMock,
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

vi.mock("@/modules/dashboard/hooks/useTorrentClipboard", () => ({
    useTorrentClipboard: () => ({
        copyToClipboard: vi.fn(async () => undefined),
    }),
}));

vi.mock("@/shared/ui/components/AppTooltip", () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) =>
        createElement("div", null, children),
}));

vi.mock("@/shared/ui/layout/ModalEx", () => ({
    ModalEx: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
        open ? createElement("div", null, children) : null,
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
    trackers: [
        {
            id: 11,
            announce: "https://tracker.example/announce",
            tier: 0,
            announceState: 0,
            downloadCount: 0,
            hasAnnounced: false,
            hasScraped: false,
            isBackup: false,
            lastAnnouncePeerCount: 0,
            lastAnnounceResult: "",
            lastAnnounceSucceeded: false,
            lastAnnounceTime: 0,
            lastAnnounceTimedOut: false,
            lastScrapeResult: "",
            lastScrapeSucceeded: false,
            lastScrapeTime: 0,
            lastScrapeTimedOut: false,
            leecherCount: 0,
            nextAnnounceTime: 0,
            scrapeState: 0,
            seederCount: 0,
            sitename: "",
            host: "tracker.example",
        },
    ],
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

function RuntimeHarness({
    viewModel,
    onRender,
}: {
    viewModel: DashboardDetailViewModel;
    onRender: () => void;
}) {
    onRender();
    const coordinator = useTorrentDetailTabCoordinator({
        viewModel,
        isStandalone: false,
        isDetailFullscreen: false,
    });
    return createElement(
        "div",
        null,
        createElement("div", { "data-testid": "surface" }, coordinator.activeSurface),
        createElement(
            "div",
            { "data-testid": "actions" },
            coordinator.headerActions.map((action) => action.ariaLabel).join("|"),
        ),
    );
}

describe("useTorrentDetailTabCoordinator trackers runtime", () => {
    afterEach(() => {
        document.body.innerHTML = "";
        setInspectorTabMock.mockReset();
        showFeedbackMock.mockReset();
        inspectorTabMock = "trackers";
    });

    it("settles after opening the trackers tab instead of rerendering indefinitely", async () => {
        const viewModel = createViewModel(makeDetail());
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);
        let renderCount = 0;

        try {
            flushSync(() => {
                root.render(
                    createElement(RuntimeHarness, {
                        viewModel,
                        onRender: () => {
                            renderCount += 1;
                        },
                    }),
                );
            });

            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 100);
            });

            expect(renderCount).toBeLessThan(20);
            expect(container.textContent).toContain(
                "https://tracker.example/announce",
            );
            expect(container.textContent).toContain(
                "torrent_modal.trackers.add_action",
            );
        } finally {
            root.unmount();
            container.remove();
        }
    });
});
