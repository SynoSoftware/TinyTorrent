import React, {
    act,
    createElement,
    forwardRef,
    useImperativeHandle,
    type Ref,
} from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import { useTorrentSpeedHistory } from "@/modules/dashboard/hooks/useTorrentSpeedHistory";
import { registry } from "@/config/logic";
import type { TorrentEntity } from "@/services/rpc/entities";

const { performance } = registry;

type HarnessRef = {
    read: () => Record<string, { down: number[]; up: number[] }>;
};

const makeTorrent = (
    id: string,
    down: number,
    up: number,
): TorrentEntity => ({
    id,
    hash: `hash-${id}`,
    name: `torrent-${id}`,
    state: "downloading",
    speed: { down, up },
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
    timeoutMs = 1000,
) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (predicate()) {
            return;
        }
        await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 10);
        });
    }
    throw new Error("wait_for_condition_timeout");
};

const Harness = forwardRef(function Harness(
    { torrents }: { torrents: TorrentEntity[] },
    ref: Ref<HarnessRef>,
) {
    const historyRef = useTorrentSpeedHistory(torrents);

    useImperativeHandle(ref, () => ({
        read: () => historyRef.current,
    }));

    return createElement("div");
});

describe("useTorrentSpeedHistory", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("keeps bounded local histories and prunes removed torrents", async () => {
        const ref = React.createRef<HarnessRef>();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        await act(async () => {
            root.render(createElement(Harness, { ref, torrents: [] }));
        });
        await waitForCondition(() => Boolean(ref.current));

        await act(async () => {
            root.render(
                createElement(Harness, {
                    ref,
                    torrents: [makeTorrent("a", 10, 3), makeTorrent("b", 4, 1)],
                }),
            );
        });

        await waitForCondition(() => {
            const snapshot = ref.current?.read();
            return Boolean(snapshot && snapshot.a && snapshot.b);
        });

        await act(async () => {
            root.render(
                createElement(Harness, {
                    ref,
                    torrents: [makeTorrent("a", 20, 6)],
                }),
            );
        });

        await waitForCondition(() => {
            const snapshot = ref.current?.read();
            return Boolean(snapshot && snapshot.a?.down.at(-1) === 20);
        });

        const snapshot = ref.current?.read();
        expect(snapshot?.a.down).toEqual([10, 20]);
        expect(snapshot?.a.up).toEqual([3, 6]);
        expect(snapshot?.b).toBeUndefined();

        for (
            let index = 0;
            index < performance.historyDataPoints + 5;
            index += 1
        ) {
            await act(async () => {
                root.render(
                    createElement(Harness, {
                        ref,
                        torrents: [makeTorrent("a", index, index + 1)],
                    }),
                );
            });
        }

        await waitForCondition(() => {
            const current = ref.current?.read().a;
            return Boolean(
                current &&
                    current.down.length === performance.historyDataPoints &&
                    current.up.length === performance.historyDataPoints,
            );
        });

        const bounded = ref.current?.read().a;
        expect(bounded?.down).toHaveLength(performance.historyDataPoints);
        expect(bounded?.up).toHaveLength(performance.historyDataPoints);

        await act(async () => {
            root.unmount();
        });
        container.remove();
    });
});
