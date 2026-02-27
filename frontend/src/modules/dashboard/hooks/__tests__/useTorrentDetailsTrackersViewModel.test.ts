import React, { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { useTorrentDetailsTrackersViewModel } from "@/modules/dashboard/hooks/useTorrentDetailsTrackersViewModel";
import type { TorrentTrackerEntity } from "@/services/rpc/entities";

const addTrackersMock = vi.fn();
const replaceTrackersMock = vi.fn();
const removeTrackersMock = vi.fn();

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => (key === "labels.unknown" ? "Unknown" : key),
    }),
}));

type HarnessRef = {
    getPeersLabel: () => string;
    getNewTrackers: () => string;
    setNewTrackers: (value: string) => void;
    submitReplace: () => void;
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

const ViewModelHarness = forwardRef<HarnessRef, { trackers: TorrentTrackerEntity[] }>(
    ({ trackers }, ref) => {
        const viewModel = useTorrentDetailsTrackersViewModel({
            targetIds: ["torrent-1"],
            scope: "inspected",
            trackers,
            emptyMessage: "empty",
            serverTime: 0,
            addTrackers: addTrackersMock,
            replaceTrackers: replaceTrackersMock,
            removeTrackers: removeTrackersMock,
        });

        useImperativeHandle(
            ref,
            () => ({
                getPeersLabel: () => viewModel.data.rows[0]?.peersLabel ?? "",
                getNewTrackers: () => viewModel.state.newTrackers,
                setNewTrackers: (value: string) =>
                    viewModel.actions.setNewTrackers(value),
                submitReplace: () => viewModel.actions.submitReplace(),
            }),
            [viewModel],
        );

        return null;
    },
);

const makeTracker = (
    overrides?: Partial<TorrentTrackerEntity>,
): TorrentTrackerEntity => ({
    id: 1,
    announce: "https://tracker.example/announce",
    tier: 0,
    announceState: 0,
    lastAnnounceTime: 0,
    lastAnnounceResult: "",
    lastAnnounceSucceeded: false,
    lastScrapeTime: 0,
    lastScrapeResult: "",
    lastScrapeSucceeded: false,
    seederCount: NaN,
    leecherCount: NaN,
    scrapeState: 0,
    ...overrides,
});

type MountedHarness = {
    ref: React.RefObject<HarnessRef | null>;
    cleanup: () => void;
};

const mountHarness = async (trackers: TorrentTrackerEntity[]): Promise<MountedHarness> => {
    const ref = React.createRef<HarnessRef>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(
        React.createElement(ViewModelHarness, {
            ref,
            trackers,
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

describe("useTorrentDetailsTrackersViewModel", () => {
    beforeEach(() => {
        addTrackersMock.mockReset();
        replaceTrackersMock.mockReset();
        removeTrackersMock.mockReset();
        addTrackersMock.mockResolvedValue({ status: "applied" });
        replaceTrackersMock.mockResolvedValue({ status: "applied" });
        removeTrackersMock.mockResolvedValue({ status: "applied" });
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("renders unknown peer counts when tracker counts are NaN", async () => {
        const mounted = await mountHarness([makeTracker()]);
        try {
            const readHarness = () => {
                const harness = mounted.ref.current;
                if (!harness) {
                    throw new Error("harness_missing");
                }
                return harness;
            };
            expect(readHarness().getPeersLabel()).toBe("Unknown / Unknown");
        } finally {
            mounted.cleanup();
        }
    });

    it("does not dispatch replace when tracker input is empty after trim", async () => {
        const mounted = await mountHarness([makeTracker()]);
        try {
            const readHarness = () => {
                const harness = mounted.ref.current;
                if (!harness) {
                    throw new Error("harness_missing");
                }
                return harness;
            };

            readHarness().setNewTrackers(" \n\t ");
            await waitForCondition(() => readHarness().getNewTrackers() === " \n\t ");

            readHarness().submitReplace();
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 80);
            });
            expect(replaceTrackersMock).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });
});
