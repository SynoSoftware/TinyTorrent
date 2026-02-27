import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import STATUS from "@/shared/status";
import TorrentTable_RowMenu from "@/modules/dashboard/components/TorrentTable_RowMenu";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableRowMenuViewModel } from "@/modules/dashboard/types/torrentTableSurfaces";

const setDownloadPathModalSpy = vi.hoisted(() => vi.fn());
const showFeedbackMock = vi.fn();
const dispatchMock = vi.fn();
const setDownloadLocationMock = vi.fn();
const pickDirectoryMock = vi.fn();

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("framer-motion", () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
        React.createElement(React.Fragment, null, children)
    ),
}));

vi.mock("@heroui/react", () => ({
    Dropdown: ({ children }: { children: React.ReactNode }) => (
        React.createElement("div", null, children)
    ),
    DropdownTrigger: ({ children }: { children: React.ReactNode }) => (
        React.createElement("div", null, children)
    ),
    DropdownMenu: ({ children }: { children: React.ReactNode }) => (
        React.createElement("div", null, children)
    ),
    DropdownItem: ({
        children,
        onPress,
        isDisabled,
    }: {
        children: React.ReactNode;
        onPress?: () => void;
        isDisabled?: boolean;
    }) =>
        React.createElement(
            "button",
            {
                type: "button",
                disabled: Boolean(isDisabled),
                onClick: () => onPress?.(),
            },
            children,
        ),
    cn: (...parts: Array<string | undefined>) => parts.filter(Boolean).join(" "),
}));

vi.mock("@/modules/dashboard/components/SetDownloadPathModal", () => ({
    default: (props: unknown) => {
        setDownloadPathModalSpy(props);
        return null;
    },
}));

vi.mock("@/app/hooks/useActionFeedback", () => ({
    useActionFeedback: () => ({
        showFeedback: showFeedbackMock,
    }),
}));

vi.mock("@/app/context/AppCommandContext", () => ({
    useRequiredTorrentActions: () => ({
        dispatch: dispatchMock,
    }),
    useTorrentCommands: () => ({
        setDownloadLocation: setDownloadLocationMock,
    }),
}));

vi.mock("@/app/context/SessionContext", () => ({
    useSession: () => ({
        daemonPathStyle: "windows",
    }),
    useUiModeCapabilities: () => ({
        canOpenFolder: true,
        clipboardWriteSupported: true,
    }),
}));

vi.mock("@/app/providers/TorrentClientProvider", () => ({
    useTorrentClient: () => ({}),
}));

vi.mock("@/app/hooks/useDirectoryPicker", () => ({
    useDirectoryPicker: () => ({
        canPickDirectory: true,
        pickDirectory: pickDirectoryMock,
    }),
}));

type SetDownloadModalProps = {
    isOpen: boolean;
    allowCreatePath: boolean;
};

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

const makeTorrent = (overrides?: Partial<Torrent>): Torrent => ({
    id: "torrent-1",
    hash: "hash-1",
    name: "Torrent",
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

const makeViewModel = (torrent: Torrent): TorrentTableRowMenuViewModel => ({
    contextMenu: {
        virtualElement: {
            x: 10,
            y: 10,
            getBoundingClientRect: () => new DOMRect(10, 10, 1, 1),
        },
        torrent,
    },
    onClose: vi.fn(),
    handleContextMenuAction: async () =>
        ({ status: "success" }) as const,
    queueMenuActions: [],
    getContextMenuShortcut: () => "",
});

const getLatestModalProps = (): SetDownloadModalProps => {
    const calls = setDownloadPathModalSpy.mock.calls;
    if (calls.length === 0) {
        throw new Error("set_download_modal_not_rendered");
    }
    return calls[calls.length - 1][0] as SetDownloadModalProps;
};

const mountRowMenu = (viewModel: TorrentTableRowMenuViewModel) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(
        React.createElement(TorrentTable_RowMenu, {
            viewModel,
        }),
    );
    return {
        container,
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("TorrentTable_RowMenu set-location modal wiring", () => {
    beforeEach(() => {
        setDownloadPathModalSpy.mockReset();
        showFeedbackMock.mockReset();
        dispatchMock.mockReset();
        setDownloadLocationMock.mockReset();
        pickDirectoryMock.mockReset();
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("passes allowCreatePath=true for move:true torrents", async () => {
        const torrent = makeTorrent({
            error: 0,
            sizeWhenDone: 1000,
        });
        const mounted = mountRowMenu(makeViewModel(torrent));
        try {
            await waitForCondition(() => setDownloadPathModalSpy.mock.calls.length > 0);
            const setLocationButton = Array.from(
                mounted.container.querySelectorAll("button"),
            ).find((button) => button.textContent === "table.actions.set_download_path");
            if (!setLocationButton) {
                throw new Error("set_location_button_missing");
            }
            setLocationButton.click();

            await waitForCondition(() => getLatestModalProps().isOpen === true);
            const latest = getLatestModalProps();
            expect(latest.isOpen).toBe(true);
            expect(latest.allowCreatePath).toBe(true);
        } finally {
            mounted.cleanup();
        }
    });

    it("passes allowCreatePath=false for move:false locate-files torrents", async () => {
        const torrent = makeTorrent({
            error: 3,
            sizeWhenDone: 1000,
            errorString: "no data found in path",
        });
        const mounted = mountRowMenu(makeViewModel(torrent));
        try {
            await waitForCondition(() => setDownloadPathModalSpy.mock.calls.length > 0);
            const setLocationButton = Array.from(
                mounted.container.querySelectorAll("button"),
            ).find((button) => button.textContent === "table.actions.locate_files");
            if (!setLocationButton) {
                throw new Error("locate_files_button_missing");
            }
            setLocationButton.click();

            await waitForCondition(() => getLatestModalProps().isOpen === true);
            const latest = getLatestModalProps();
            expect(latest.isOpen).toBe(true);
            expect(latest.allowCreatePath).toBe(false);
        } finally {
            mounted.cleanup();
        }
    });
});
