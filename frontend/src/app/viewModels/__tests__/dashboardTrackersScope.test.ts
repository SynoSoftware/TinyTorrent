import React, { createElement, forwardRef, useImperativeHandle } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { useDashboardViewModel } from "@/app/viewModels/workspaceShell/shellViewModelBuilders";
import type { TorrentDetailEntity } from "@/services/rpc/entities";
import { commandOutcome } from "@/app/context/AppCommandContext";

type HarnessRef = {
    getTrackerTorrentId: () => string | number | null;
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

const detailTorrent: TorrentDetailEntity = {
    id: "torrent-inspected",
    hash: "hash-inspected",
    name: "ubuntu.iso",
    state: "paused",
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0 },
    totalSize: 1024,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
    trackers: [],
};

const ViewModelHarness = forwardRef<HarnessRef>((_, ref) => {
    const viewModel = useDashboardViewModel({
        workspaceStyle: "classic",
        filter: "all",
        searchQuery: "",
        isDragActive: false,
        tableWatermarkEnabled: false,
        torrents: [],
        ghostTorrents: [],
        isInitialLoadFinished: true,
        optimisticStatuses: {},
        removedIds: new Set<string>(),
        selectedIds: ["torrent-a", "torrent-b", "torrent-c"],
        detailData: detailTorrent,
        peerSortStrategy: "client",
        inspectorTabCommand: null,
        canSetLocation: false,
        generalSetLocation: {
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
        handleRequestDetails: async () => undefined,
        closeDetail: () => undefined,
        handleTorrentAction: async () => commandOutcome.noSelection(),
        handleFileSelectionChange: async () => undefined,
        addTrackers: vi.fn(async () => ({ status: "applied" as const })),
        removeTrackers: vi.fn(async () => ({ status: "applied" as const })),
        reannounceTrackers: vi.fn(async () => ({ status: "applied" as const })),
        setInspectorTabCommand: () => undefined,
        capabilities: {} as never,
    });

    useImperativeHandle(
        ref,
        () => ({
            getTrackerTorrentId: () => viewModel.detail.tabs.trackers.torrentId,
        }),
        [viewModel],
    );

    return null;
});

describe("dashboard trackers surface", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("targets only the inspected torrent even when the table selection contains multiple ids", async () => {
        const ref = React.createRef<HarnessRef>();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);
        root.render(createElement(ViewModelHarness, { ref }));

        try {
            await waitForCondition(() => Boolean(ref.current));
            expect(ref.current?.getTrackerTorrentId()).toBe("torrent-inspected");
        } finally {
            root.unmount();
            container.remove();
        }
    });
});
