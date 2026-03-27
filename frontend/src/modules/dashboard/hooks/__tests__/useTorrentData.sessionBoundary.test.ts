import React, {
    createElement,
    forwardRef,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
} from "react";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { useTorrentData } from "@/modules/dashboard/hooks/useTorrentData";
import { status } from "@/shared/status";
import type { TorrentEntity } from "@/services/rpc/entities";

const subscribeTableMock = vi.fn();
const reportReadErrorMock = vi.fn();

vi.mock("@/app/providers/engineDomains", () => ({
    useEngineHeartbeatDomain: () => ({
        subscribeTable: subscribeTableMock,
    }),
}));

vi.mock("@/app/context/SessionContext", () => ({
    useSession: () => ({
        reportReadError: reportReadErrorMock,
    }),
}));

type HarnessRef = {
    getSnapshot: () => {
        torrents: TorrentEntity[];
        ghostTorrents: TorrentEntity[];
        isInitialLoadFinished: boolean;
    };
    addGhostTorrent: (id: string) => void;
};

type HookHarnessProps = {
    sessionReady: boolean;
};

const makeTorrent = (id: string): TorrentEntity =>
    ({
        id,
        hash: `hash-${id}`,
        name: `torrent-${id}`,
        progress: 0.5,
        verificationProgress: 0.5,
        state: status.torrent.downloading,
        speed: { down: 100, up: 20 },
        peerSummary: {
            connected: 1,
            total: 2,
            sending: 1,
            getting: 1,
            seeds: 0,
        },
        totalSize: 1000,
        eta: 10,
        queuePosition: 0,
        ratio: 0.2,
        uploaded: 20,
        downloaded: 100,
        leftUntilDone: 900,
        sizeWhenDone: 1000,
        desiredAvailable: 1000,
        error: 0,
        errorString: "",
        metadataPercentComplete: 1,
        isFinished: false,
        isStalled: false,
        webseedsSendingToUs: 0,
        peersFrom: {
            cache: 0,
            dht: 0,
            incoming: 0,
            lpd: 0,
            ltep: 0,
            pex: 0,
            tracker: 0,
        },
        sequentialDownload: false,
        superSeeding: false,
        added: 1,
        savePath: "C:\\downloads",
    }) as TorrentEntity;

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

const HookHarness = forwardRef<HarnessRef, HookHarnessProps>(
    ({ sessionReady }, ref) => {
        const viewModel = useTorrentData({
            client: {} as never,
            sessionReady,
            pollingIntervalMs: 1000,
        });
        const viewModelRef = useRef(viewModel);

        useLayoutEffect(() => {
            viewModelRef.current = viewModel;
        }, [viewModel]);

        useImperativeHandle(ref, () => ({
            getSnapshot: () => ({
                torrents: viewModelRef.current.torrents,
                ghostTorrents: viewModelRef.current.ghostTorrents,
                isInitialLoadFinished: viewModelRef.current.isInitialLoadFinished,
            }),
            addGhostTorrent: (id: string) => {
                viewModelRef.current.addGhostTorrent({
                    id,
                    label: id,
                });
            },
        }));

        return createElement("div");
    },
);

type MountedHarness = {
    ref: React.RefObject<HarnessRef | null>;
    rerender: (sessionReady: boolean) => void;
    cleanup: () => void;
};

const mountHarness = async (sessionReady: boolean): Promise<MountedHarness> => {
    const ref = React.createRef<HarnessRef>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const render = (nextSessionReady: boolean) =>
        root.render(createElement(HookHarness, { ref, sessionReady: nextSessionReady }));
    render(sessionReady);
    await waitForCondition(() => Boolean(ref.current));
    return {
        ref,
        rerender: (nextSessionReady) => {
            flushSync(() => {
                render(nextSessionReady);
            });
        },
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("useTorrentData session boundary reset", () => {
    beforeEach(() => {
        subscribeTableMock.mockReset();
        reportReadErrorMock.mockReset();
        subscribeTableMock.mockReturnValue({
            unsubscribe: vi.fn(),
        });
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("clears torrent and ghost state when the session disconnects", async () => {
        const mounted = await mountHarness(true);
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            const subscriptionArgs = subscribeTableMock.mock.calls[0]?.[0] as
                | {
                      onUpdate: (payload: {
                          torrents: TorrentEntity[];
                          changedIds: string[];
                          timestampMs: number;
                      }) => void;
                  }
                | undefined;
            if (!subscriptionArgs) {
                throw new Error("subscription_missing");
            }

            flushSync(() => {
                subscriptionArgs.onUpdate({
                    torrents: [makeTorrent("t-1")],
                    changedIds: ["t-1"],
                    timestampMs: Date.now(),
                });
                harness.addGhostTorrent("ghost-1");
            });

            await waitForCondition(() => {
                const snapshot = harness.getSnapshot();
                return (
                    snapshot.torrents.length === 1 &&
                    snapshot.ghostTorrents.length === 1 &&
                    snapshot.isInitialLoadFinished
                );
            });

            mounted.rerender(false);

            await waitForCondition(() => {
                const snapshot = harness.getSnapshot();
                return (
                    snapshot.torrents.length === 0 &&
                    snapshot.ghostTorrents.length === 0 &&
                    snapshot.isInitialLoadFinished === false
                );
            });
        } finally {
            mounted.cleanup();
        }
    });
});
