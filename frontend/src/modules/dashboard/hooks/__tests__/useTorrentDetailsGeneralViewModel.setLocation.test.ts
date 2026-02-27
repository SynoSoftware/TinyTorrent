import React, { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import STATUS from "@/shared/status";
import { useTorrentDetailsGeneralViewModel } from "@/modules/dashboard/hooks/useTorrentDetailsGeneralViewModel";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";

const handleTorrentActionMock = vi.fn();
const setDownloadLocationMock = vi.fn();
const dispatchMock = vi.fn();
const pickDirectoryMock = vi.fn();

vi.mock("@/app/context/AppCommandContext", () => ({
    useTorrentCommands: () => ({
        handleTorrentAction: handleTorrentActionMock,
        setDownloadLocation: setDownloadLocationMock,
    }),
    useRequiredTorrentActions: () => ({
        dispatch: dispatchMock,
    }),
}));

vi.mock("react-i18next", () => ({
    initReactI18next: {
        type: "3rdParty",
        init: () => {
            // no-op test shim
        },
    },
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/app/providers/TorrentClientProvider", () => ({
    useTorrentClient: () => ({
        setTorrentLocation: vi.fn(),
    }),
}));

vi.mock("@/app/context/SessionContext", () => ({
    useSession: () => ({
        daemonPathStyle: "posix",
    }),
}));

vi.mock("@/app/hooks/useDirectoryPicker", () => ({
    useDirectoryPicker: () => ({
        canPickDirectory: true,
        pickDirectory: pickDirectoryMock,
    }),
}));

type HarnessRef = {
    getAllowCreatePath: () => boolean;
    getActionLabelKey: () => string;
    getModalTitleKey: () => string;
};

const ViewModelHarness = forwardRef<
    HarnessRef,
    { torrent: TorrentDetail }
>(({ torrent }, ref) => {
    const vm = useTorrentDetailsGeneralViewModel({
        torrent,
    });

    useImperativeHandle(
        ref,
        () => ({
            getAllowCreatePath: () => vm.allowCreateSetLocationPath,
            getActionLabelKey: () => vm.setDownloadLocationActionLabelKey,
            getModalTitleKey: () => vm.setDownloadLocationModalTitleKey,
        }),
        [vm],
    );

    return null;
});

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs = 2000,
) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (predicate()) return;
        await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 20);
        });
    }
    throw new Error("wait_for_condition_timeout");
};

const makeTorrent = (overrides?: Partial<TorrentDetail>): TorrentDetail => ({
    id: "torrent-1",
    hash: "hash-1",
    name: "Test torrent",
    state: STATUS.torrent.PAUSED,
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0 },
    totalSize: 1000,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
    ...overrides,
});

type MountedHarness = {
    ref: React.RefObject<HarnessRef | null>;
    cleanup: () => void;
};

const mountHarness = async (
    torrent: TorrentDetail,
): Promise<MountedHarness> => {
    const ref = React.createRef<HarnessRef>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(
        React.createElement(ViewModelHarness, {
            ref,
            torrent,
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

describe("useTorrentDetailsGeneralViewModel set-location flags", () => {
    beforeEach(() => {
        handleTorrentActionMock.mockReset();
        setDownloadLocationMock.mockReset();
        dispatchMock.mockReset();
        pickDirectoryMock.mockReset();
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("enables create-path mode (move:true) for normal set-location", async () => {
        const torrent = makeTorrent({
            error: 0,
            sizeWhenDone: 1000,
        });
        const mounted = await mountHarness(torrent);
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }
            expect(harness.getAllowCreatePath()).toBe(true);
            expect(harness.getActionLabelKey()).toBe("table.actions.set_download_path");
            expect(harness.getModalTitleKey()).toBe("modals.set_download_location.title");
        } finally {
            mounted.cleanup();
        }
    });

    it("disables create-path mode (move:false) for locate-files mode", async () => {
        const torrent = makeTorrent({
            error: 3,
            sizeWhenDone: 1000,
            errorString: "No data found on local disk",
        });
        const mounted = await mountHarness(torrent);
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }
            expect(harness.getAllowCreatePath()).toBe(false);
            expect(harness.getActionLabelKey()).toBe("table.actions.locate_files");
            expect(harness.getModalTitleKey()).toBe("modals.locate_files.title");
        } finally {
            mounted.cleanup();
        }
    });
});
