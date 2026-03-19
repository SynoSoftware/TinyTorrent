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
const ZERO_HISTORY = new Array(performance.historyDataPoints).fill(0);

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

    it("seeds fixed-length zero histories, shifts by one sample, appends idle zeroes, and prunes removed torrents", async () => {
        const ref = React.createRef<HarnessRef>();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        await act(async () => {
            root.render(createElement(Harness, { ref, torrents: [] }));
        });
        expect(ref.current?.read()).toEqual({});

        await act(async () => {
            root.render(
                createElement(Harness, {
                    ref,
                    torrents: [makeTorrent("a", 10, 3), makeTorrent("b", 4, 1)],
                }),
            );
        });

        const seeded = ref.current?.read();
        expect(seeded?.a.down).toHaveLength(performance.historyDataPoints);
        expect(seeded?.a.up).toHaveLength(performance.historyDataPoints);
        expect(seeded?.b.down).toHaveLength(performance.historyDataPoints);
        expect(seeded?.b.up).toHaveLength(performance.historyDataPoints);
        expect(seeded?.a.down).toEqual(ZERO_HISTORY);
        expect(seeded?.a.up).toEqual(ZERO_HISTORY);
        expect(seeded?.b.down).toEqual(ZERO_HISTORY);
        expect(seeded?.b.up).toEqual(ZERO_HISTORY);

        await act(async () => {
            root.render(
                createElement(Harness, {
                    ref,
                    torrents: [makeTorrent("a", 20, 6)],
                }),
            );
        });

        const advanced = ref.current?.read();
        expect(advanced?.a.down).toHaveLength(performance.historyDataPoints);
        expect(advanced?.a.up).toHaveLength(performance.historyDataPoints);
        expect(advanced?.a.down.slice(0, -1)).toEqual(
            ZERO_HISTORY.slice(1),
        );
        expect(advanced?.a.up.slice(0, -1)).toEqual(
            ZERO_HISTORY.slice(1),
        );
        expect(advanced?.a.down.at(-1)).toBe(20);
        expect(advanced?.a.up.at(-1)).toBe(6);
        expect(advanced?.b).toBeUndefined();

        await act(async () => {
            root.render(
                createElement(Harness, {
                    ref,
                    torrents: [makeTorrent("a", 0, 0)],
                }),
            );
        });

        const idled = ref.current?.read();
        expect(idled?.a.down).toHaveLength(performance.historyDataPoints);
        expect(idled?.a.up).toHaveLength(performance.historyDataPoints);
        expect(idled?.a.down.slice(-2)).toEqual([20, 0]);
        expect(idled?.a.up.slice(-2)).toEqual([6, 0]);

        await act(async () => {
            root.unmount();
        });
        container.remove();
    });
});
