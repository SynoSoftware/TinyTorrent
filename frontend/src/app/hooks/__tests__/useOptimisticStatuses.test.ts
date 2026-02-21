import React, {
    useEffect,
    forwardRef,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { useOptimisticStatuses } from "@/app/hooks/useOptimisticStatuses";
import { STATUS } from "@/shared/status";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";

type HarnessRef = {
    getSnapshot: () => OptimisticStatusMap;
    setTorrents: (next: Torrent[]) => void;
    updateOptimisticStatuses: ReturnType<
        typeof useOptimisticStatuses
    >["updateOptimisticStatuses"];
    updateOperationOverlays: ReturnType<
        typeof useOptimisticStatuses
    >["updateOperationOverlays"];
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

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs = 3000,
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

const OptimisticStatusesHarness = forwardRef<
    HarnessRef,
    { initialTorrents: Torrent[] }
>(({ initialTorrents }, ref) => {
    const [torrents, setTorrents] = useState(initialTorrents);
    const renderCountRef = useRef(0);
    useEffect(() => {
        renderCountRef.current += 1;
    });
    const {
        optimisticStatuses,
        updateOptimisticStatuses,
        updateOperationOverlays,
    } = useOptimisticStatuses(torrents);

    useImperativeHandle(
        ref,
        () => ({
            getSnapshot: () => optimisticStatuses,
            setTorrents,
            updateOptimisticStatuses,
            updateOperationOverlays,
            getRenderCount: () => renderCountRef.current,
        }),
        [
            optimisticStatuses,
            setTorrents,
            updateOperationOverlays,
            updateOptimisticStatuses,
        ],
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

    it("drops overlays for ids outside authoritative torrent ids", async () => {
        const mounted = await mountHarness([
            makeTorrent("t-1", STATUS.torrent.DOWNLOADING),
        ]);
        try {
            const readHarness = () => {
                const harness = mounted.ref.current;
                if (!harness) {
                    throw new Error("harness_missing");
                }
                return harness;
            };

            readHarness().updateOperationOverlays([
                {
                    id: "missing-torrent-id",
                    operation: STATUS.torrentOperation.RELOCATING,
                },
            ]);
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 100);
            });
            expect(
                readHarness().getSnapshot()["missing-torrent-id"],
            ).toBeUndefined();
        } finally {
            mounted.cleanup();
        }
    });

    it("cleans relocating overlays when torrent leaves authoritative list", async () => {
        const mounted = await mountHarness([
            makeTorrent("t-2", STATUS.torrent.PAUSED),
        ]);
        try {
            const readHarness = () => {
                const harness = mounted.ref.current;
                if (!harness) {
                    throw new Error("harness_missing");
                }
                return harness;
            };

            readHarness().updateOperationOverlays([
                    {
                        id: "t-2",
                        operation: STATUS.torrentOperation.RELOCATING,
                    },
                ]);
            await waitForCondition(
                () =>
                    readHarness().getSnapshot()["t-2"]?.operation ===
                    STATUS.torrentOperation.RELOCATING,
            );

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
});
