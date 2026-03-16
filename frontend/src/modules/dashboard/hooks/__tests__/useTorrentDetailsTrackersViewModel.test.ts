import React, {
    createElement,
    forwardRef,
    useImperativeHandle,
    useRef,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import {
    useTorrentDetailsTrackersViewModel,
} from "@/modules/dashboard/hooks/useTorrentDetailsTrackersViewModel";
import type { TorrentTrackerEntity } from "@/services/rpc/entities";
import { serializeTrackerList } from "@/shared/domain/trackers";

const addTrackersMock = vi.fn();
const removeTrackersMock = vi.fn();
const reannounceMock = vi.fn();
const copyToClipboardMock = vi.fn();

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => {
            if (key === "labels.unknown") {
                return "Unknown";
            }
            if (
                key === "torrent_modal.trackers.selection_summary" &&
                typeof options?.count === "number"
            ) {
                return `${String(options.count)} selected`;
            }
            if (
                key === "torrent_modal.trackers.modal_invalid_url" &&
                typeof options?.value === "string"
            ) {
                return `${key}:${options.value}`;
            }
            return key;
        },
    }),
}));

vi.mock("@/modules/dashboard/hooks/useTorrentClipboard", () => ({
    useTorrentClipboard: () => ({
        copyToClipboard: copyToClipboardMock,
    }),
}));

type HarnessRef = {
    getRowCount: () => number;
    getRowAnnounce: (index: number) => string;
    getRowStatusLabel: (index: number) => string;
    getRowDownloadCountLabel: (index: number) => string;
    getSelectionCount: () => number;
    getCanRemove: () => boolean;
    clickRow: (
        index: number,
        modifiers?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
    ) => void;
    keyDown: (
        key: string,
        modifiers?: { ctrlKey?: boolean; metaKey?: boolean },
    ) => void;
    openAddModal: () => void;
    isEditorOpen: () => boolean;
    setEditorValue: (value: string) => void;
    submitEditor: () => Promise<void>;
    getEditorError: () => string | null;
    copyAllTrackers: () => Promise<void>;
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
    { trackers: TorrentTrackerEntity[]; version: number }
>(({ trackers }, ref) => {
        const listRef = useRef<HTMLDivElement | null>(null);
        const viewModel = useTorrentDetailsTrackersViewModel({
            torrentId: "torrent-1",
            torrentName: "Ubuntu ISO",
            trackers,
            emptyMessage: "empty",
            listRef,
            addTrackers: addTrackersMock,
            removeTrackers: removeTrackersMock,
            reannounce: reannounceMock,
        });
        const viewModelRef = useRef(viewModel);
        viewModelRef.current = viewModel;

        useImperativeHandle(
            ref,
            () => ({
                getRowCount: () => viewModelRef.current.data.rows.length,
                getRowAnnounce: (index: number) =>
                    viewModelRef.current.data.rows[index]?.announce ?? "",
                getRowStatusLabel: (index: number) =>
                    viewModelRef.current.data.rows[index]?.statusLabel ?? "",
                getRowDownloadCountLabel: (index: number) =>
                    viewModelRef.current.data.rows[index]?.downloadCountLabel ?? "",
                getSelectionCount: () => viewModelRef.current.state.selectedCount,
                getCanRemove: () => viewModelRef.current.state.canRemove,
                clickRow: (index, modifiers) => {
                    const row = viewModelRef.current.data.rows[index];
                    if (!row) {
                        throw new Error("row_missing");
                    }
                    flushSync(() => {
                        viewModelRef.current.actions.handleRowClick(
                            {
                                ctrlKey: Boolean(modifiers?.ctrlKey),
                                metaKey: Boolean(modifiers?.metaKey),
                                shiftKey: Boolean(modifiers?.shiftKey),
                            } as never,
                            row.key,
                            row.index,
                        );
                    });
                },
                keyDown: (key, modifiers) => {
                    flushSync(() => {
                        viewModelRef.current.actions.handleListKeyDown({
                            key,
                            ctrlKey: Boolean(modifiers?.ctrlKey),
                            metaKey: Boolean(modifiers?.metaKey),
                            preventDefault: () => undefined,
                        } as never);
                    });
                },
                openAddModal: () => {
                    flushSync(() => {
                        viewModelRef.current.actions.openAddModal();
                    });
                },
                isEditorOpen: () => viewModelRef.current.state.editor.isOpen,
                setEditorValue: (value: string) => {
                    flushSync(() => {
                        viewModelRef.current.actions.setEditorValue(value);
                    });
                },
                submitEditor: () => viewModelRef.current.actions.submitEditor(),
                getEditorError: () => viewModelRef.current.state.editor.error,
                copyAllTrackers: () =>
                    viewModelRef.current.actions.copyAllTrackers(),
            }),
            [],
        );

        return createElement("div", { ref: listRef });
    },
);

const makeTracker = (
    overrides?: Partial<TorrentTrackerEntity>,
): TorrentTrackerEntity => ({
    id: 1,
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
    ...overrides,
});

type MountedHarness = {
    ref: React.RefObject<HarnessRef | null>;
    rerender: (trackers: TorrentTrackerEntity[]) => void;
    cleanup: () => void;
};

const mountHarness = async (
    trackers: TorrentTrackerEntity[],
): Promise<MountedHarness> => {
    const ref = React.createRef<HarnessRef>();
    let version = 0;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(
        createElement(ViewModelHarness, {
            ref,
            trackers,
            version,
        }),
    );
    await waitForCondition(() => Boolean(ref.current), 1200);
    return {
        ref,
        rerender: (nextTrackers: TorrentTrackerEntity[]) => {
            version += 1;
            flushSync(() => {
                root.render(
                    createElement(ViewModelHarness, {
                        ref,
                        trackers: nextTrackers,
                        version,
                    }),
                );
            });
        },
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("useTorrentDetailsTrackersViewModel", () => {
    beforeEach(() => {
        addTrackersMock.mockReset();
        removeTrackersMock.mockReset();
        reannounceMock.mockReset();
        copyToClipboardMock.mockReset();
        addTrackersMock.mockResolvedValue({ status: "applied" });
        removeTrackersMock.mockResolvedValue({ status: "applied" });
        reannounceMock.mockResolvedValue({ status: "applied" });
        copyToClipboardMock.mockResolvedValue(undefined);
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("maps timeout tracker status and renders the downloaded count", async () => {
        const mounted = await mountHarness([
            makeTracker({
                lastAnnounceTimedOut: true,
                downloadCount: 7,
            }),
        ]);
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }
            expect(harness.getRowStatusLabel(0)).toBe(
                "torrent_modal.trackers.status_timeout",
            );
            expect(harness.getRowDownloadCountLabel(0)).toBe("7");
        } finally {
            mounted.cleanup();
        }
    });

    it("rebuilds tracker rows when tracker data arrives while the same tab instance stays mounted", async () => {
        const mounted = await mountHarness([]);
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            expect(harness.getRowCount()).toBe(0);

            mounted.rerender([
                makeTracker({
                    id: 7,
                    announce: "https://tracker-live.example/announce",
                    downloadCount: 12,
                }),
            ]);

            await waitForCondition(() => harness.getRowCount() === 1);

            expect(harness.getRowAnnounce(0)).toBe(
                "https://tracker-live.example/announce",
            );
            expect(harness.getRowDownloadCountLabel(0)).toBe("12");
        } finally {
            mounted.cleanup();
        }
    });

    it("uses the explicit status mapping contract for success, waiting, queued, backup, and never-announced trackers", async () => {
        const mounted = await mountHarness([
            makeTracker({
                id: 1,
                announce: "https://tracker-success/announce",
                tier: 0,
                hasAnnounced: true,
                lastAnnounceSucceeded: true,
                lastAnnounceTime: 100,
            }),
            makeTracker({
                id: 2,
                announce: "https://tracker-waiting/announce",
                tier: 1,
                announceState: 1,
            }),
            makeTracker({
                id: 3,
                announce: "https://tracker-queued/announce",
                tier: 2,
                announceState: 2,
            }),
            makeTracker({
                id: 4,
                announce: "https://tracker-backup/announce",
                tier: 3,
                isBackup: true,
            }),
            makeTracker({
                id: 5,
                announce: "https://tracker-idle/announce",
                tier: 4,
                hasAnnounced: false,
                lastAnnounceTime: 0,
            }),
        ]);
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            expect(harness.getRowStatusLabel(0)).toBe(
                "torrent_modal.trackers.status_working",
            );
            expect(harness.getRowStatusLabel(1)).toBe(
                "torrent_modal.trackers.status_waiting",
            );
            expect(harness.getRowStatusLabel(2)).toBe(
                "torrent_modal.trackers.status_queued",
            );
            expect(harness.getRowStatusLabel(3)).toBe(
                "torrent_modal.trackers.status_backup",
            );
            expect(harness.getRowStatusLabel(4)).toBe(
                "torrent_modal.trackers.status_not_contacted",
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("removes a shift-selected tracker range with the Delete key", async () => {
        const mounted = await mountHarness([
            makeTracker({ id: 11, announce: "https://tracker-a/announce" }),
            makeTracker({ id: 22, announce: "https://tracker-b/announce" }),
            makeTracker({ id: 33, announce: "https://tracker-c/announce" }),
        ]);
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            harness.clickRow(0);
            harness.clickRow(2, { shiftKey: true });
            await waitForCondition(() => harness.getSelectionCount() === 3);

            expect(harness.getCanRemove()).toBe(true);

            harness.keyDown("Delete");
            await waitForCondition(() => removeTrackersMock.mock.calls.length === 1);

            expect(removeTrackersMock).toHaveBeenCalledWith(
                "torrent-1",
                [11, 22, 33],
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("keeps add modal open and blocks submit when all URLs are invalid", async () => {
        const mounted = await mountHarness([makeTracker()]);
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            harness.openAddModal();
            await waitForCondition(() => harness.isEditorOpen());
            harness.setEditorValue("notaurl");
            await harness.submitEditor();
            await waitForCondition(
                () =>
                    harness.getEditorError() ===
                    "torrent_modal.trackers.modal_invalid_url:notaurl",
            );

            expect(harness.getEditorError()).toBe(
                "torrent_modal.trackers.modal_invalid_url:notaurl",
            );
            expect(addTrackersMock).not.toHaveBeenCalled();
            expect(harness.isEditorOpen()).toBe(true);
        } finally {
            mounted.cleanup();
        }
    });

    it("blocks add when every submitted tracker already exists on the torrent", async () => {
        const mounted = await mountHarness([
            makeTracker({
                id: 1,
                announce: "https://tracker-a/announce",
            }),
            makeTracker({
                id: 2,
                announce: "https://tracker-b/announce",
            }),
        ]);
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            harness.openAddModal();
            await waitForCondition(() => harness.isEditorOpen());
            harness.setEditorValue("https://tracker-a/announce");
            await harness.submitEditor();
            await waitForCondition(
                () =>
                    harness.getEditorError() ===
                    "torrent_modal.trackers.modal_no_new",
            );

            expect(addTrackersMock).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });

    it("normalizes multiline tracker input before dispatching add", async () => {
        const mounted = await mountHarness([makeTracker()]);
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            harness.openAddModal();
            await waitForCondition(() => harness.isEditorOpen());
            harness.setEditorValue(
                "  https://tracker-a/announce  \n\nhttps://tracker-b/announce\r\nhttps://tracker-a/announce",
            );
            await harness.submitEditor();
            await waitForCondition(() => addTrackersMock.mock.calls.length === 1);

            expect(addTrackersMock).toHaveBeenCalledWith("torrent-1", [
                "https://tracker-a/announce",
                "https://tracker-b/announce",
            ]);
        } finally {
            mounted.cleanup();
        }
    });

    it("copies all trackers grouped by tier", async () => {
        const mounted = await mountHarness([
            makeTracker({
                id: 1,
                announce: "https://tracker-a/announce",
                tier: 0,
            }),
            makeTracker({
                id: 2,
                announce: "https://tracker-b/announce",
                tier: 0,
            }),
            makeTracker({
                id: 3,
                announce: "https://tracker-c/announce",
                tier: 1,
            }),
        ]);
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            await harness.copyAllTrackers();

            expect(copyToClipboardMock).toHaveBeenCalledWith(
                "https://tracker-a/announce\nhttps://tracker-b/announce\n\nhttps://tracker-c/announce",
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("copies the active row URL on Ctrl/Cmd+C even when multiple rows are selected", async () => {
        const mounted = await mountHarness([
            makeTracker({ id: 11, announce: "https://tracker-a/announce" }),
            makeTracker({ id: 22, announce: "https://tracker-b/announce" }),
        ]);
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            harness.clickRow(0);
            harness.clickRow(1, { ctrlKey: true });
            await waitForCondition(() => harness.getSelectionCount() === 2);

            harness.keyDown("c", { ctrlKey: true });
            await waitForCondition(() => copyToClipboardMock.mock.calls.length > 0);

            expect(copyToClipboardMock).toHaveBeenLastCalledWith(
                "https://tracker-b/announce",
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("preserves selection across tracker refresh reordering when tracker identity is stable", async () => {
        const mounted = await mountHarness([
            makeTracker({ id: 11, announce: "https://tracker-a/announce", tier: 0 }),
            makeTracker({ id: 22, announce: "https://tracker-b/announce", tier: 0 }),
        ]);
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            harness.clickRow(1);
            await waitForCondition(() => harness.getSelectionCount() === 1);

            mounted.rerender([
                makeTracker({ id: 22, announce: "https://tracker-b/announce", tier: 0 }),
                makeTracker({ id: 11, announce: "https://tracker-a/announce", tier: 0 }),
            ]);
            await waitForCondition(() => harness.getSelectionCount() === 1);

            harness.keyDown("c", { ctrlKey: true });
            await waitForCondition(() => copyToClipboardMock.mock.calls.length > 0);

            expect(copyToClipboardMock).toHaveBeenLastCalledWith(
                "https://tracker-b/announce",
            );
        } finally {
            mounted.cleanup();
        }
    });
});

describe("serializeTrackerList", () => {
    it("serializes tiers with blank lines between tracker groups", () => {
        expect(
            serializeTrackerList([
                makeTracker({
                    id: 10,
                    announce: "https://tracker-z/announce",
                    tier: 1,
                }),
                makeTracker({
                    id: 11,
                    announce: "https://tracker-a/announce",
                    tier: 0,
                }),
                makeTracker({
                    id: 12,
                    announce: "https://tracker-b/announce",
                    tier: 1,
                }),
            ]),
        ).toBe(
            "https://tracker-a/announce\n\nhttps://tracker-z/announce\nhttps://tracker-b/announce",
        );
    });
});
