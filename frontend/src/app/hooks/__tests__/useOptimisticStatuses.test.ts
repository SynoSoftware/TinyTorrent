import React, { useEffect, forwardRef, useImperativeHandle, useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { useOptimisticStatuses } from "@/app/hooks/useOptimisticStatuses";
import { status } from "@/shared/status";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/contracts";

type HarnessRef = {
    getSnapshot: () => OptimisticStatusMap;
    setTorrents: (next: Torrent[]) => void;
    updateOptimisticStatuses: ReturnType<typeof useOptimisticStatuses>["updateOptimisticStatuses"];
    getRenderCount: () => number;
};

const makeTorrent = (id: string, state: Torrent["state"]): Torrent => ({
    id,
    hash: `hash-${id}`,
    name: `Torrent ${id}`,
    state,
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0 },
    totalSize: 0,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
});

const waitForCondition = async (predicate: () => boolean, timeoutMs = 3000) => {
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

const OptimisticStatusesHarness = forwardRef<HarnessRef, { initialTorrents: Torrent[] }>(({ initialTorrents }, ref) => {
    const [torrents, setTorrents] = useState(initialTorrents);
    const renderCountRef = useRef(0);
    useEffect(() => {
        renderCountRef.current += 1;
    });
    const { optimisticStatuses, updateOptimisticStatuses } = useOptimisticStatuses(torrents);

    useImperativeHandle(
        ref,
        () => ({
            getSnapshot: () => optimisticStatuses,
            setTorrents,
            updateOptimisticStatuses,
            getRenderCount: () => renderCountRef.current,
        }),
        [optimisticStatuses, setTorrents, updateOptimisticStatuses],
    );

    return null;
});

type MountedHarness = {
    ref: React.RefObject<HarnessRef | null>;
    cleanup: () => void;
};

const mountHarness = async (initialTorrents: Torrent[]): Promise<MountedHarness> => {
    const ref = React.createRef<HarnessRef>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(
        React.createElement(OptimisticStatusesHarness, {
            ref,
            initialTorrents,
        }),
    );
    await waitForCondition(() => Boolean(ref.current), 1500);
    return {
        ref,
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("useOptimisticStatuses", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("drops optimistic statuses for ids outside authoritative torrent ids", async () => {
        const mounted = await mountHarness([makeTorrent("t-1", status.torrent.downloading)]);
        try {
            const readHarness = () => {
                const harness = mounted.ref.current;
                if (!harness) {
                    throw new Error("harness_missing");
                }
                return harness;
            };

            readHarness().updateOptimisticStatuses([
                {
                    id: "missing-torrent-id",
                    state: status.torrent.checking,
                },
            ]);
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 100);
            });
            expect(readHarness().getSnapshot()["missing-torrent-id"]).toBeUndefined();
        } finally {
            mounted.cleanup();
        }
    });

    it("cleans optimistic entries when torrent leaves authoritative list", async () => {
        const mounted = await mountHarness([makeTorrent("t-2", status.torrent.paused)]);
        try {
            const readHarness = () => {
                const harness = mounted.ref.current;
                if (!harness) {
                    throw new Error("harness_missing");
                }
                return harness;
            };

            readHarness().updateOptimisticStatuses([
                {
                    id: "t-2",
                    state: status.torrent.checking,
                },
            ]);
            await waitForCondition(() => readHarness().getSnapshot()["t-2"]?.state === status.torrent.checking);

            const rendersBeforeRemoval = readHarness().getRenderCount();
            readHarness().setTorrents([]);
            await waitForCondition(() => !readHarness().getSnapshot()["t-2"]);

            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 400);
            });
            const rendersAfterRemoval = readHarness().getRenderCount();
            expect(rendersAfterRemoval - rendersBeforeRemoval).toBeLessThan(8);
        } finally {
            mounted.cleanup();
        }
    });

    it("keeps pause optimism until paused is confirmed", async () => {
        const mounted = await mountHarness([makeTorrent("t-3", status.torrent.downloading)]);
        try {
            const readHarness = () => {
                const harness = mounted.ref.current;
                if (!harness) {
                    throw new Error("harness_missing");
                }
                return harness;
            };

            readHarness().updateOptimisticStatuses([
                {
                    id: "t-3",
                    state: status.torrent.paused,
                },
            ]);
            await waitForCondition(
                () => readHarness().getSnapshot()["t-3"]?.state === status.torrent.paused,
            );

            readHarness().setTorrents([makeTorrent("t-3", status.torrent.downloading)]);
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 120);
            });
            expect(readHarness().getSnapshot()["t-3"]?.state).toBe(status.torrent.paused);

            readHarness().setTorrents([makeTorrent("t-3", status.torrent.paused)]);
            await waitForCondition(() => !readHarness().getSnapshot()["t-3"]);
        } finally {
            mounted.cleanup();
        }
    });

    it("expires non-checking optimism when engine state never confirms it", async () => {
        const mounted = await mountHarness([makeTorrent("t-4", status.torrent.downloading)]);
        try {
            const readHarness = () => {
                const harness = mounted.ref.current;
                if (!harness) {
                    throw new Error("harness_missing");
                }
                return harness;
            };

            readHarness().updateOptimisticStatuses([
                {
                    id: "t-4",
                    state: status.torrent.paused,
                },
            ]);
            await waitForCondition(
                () => readHarness().getSnapshot()["t-4"]?.state === status.torrent.paused,
            );

            await waitForCondition(() => !readHarness().getSnapshot()["t-4"], 6500);
        } finally {
            mounted.cleanup();
        }
    }, 12000);
});


