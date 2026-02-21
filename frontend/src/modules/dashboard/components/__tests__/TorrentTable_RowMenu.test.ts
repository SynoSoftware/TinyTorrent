import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import TorrentTable_RowMenu from "@/modules/dashboard/components/TorrentTable_RowMenu";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableRowMenuViewModel } from "@/modules/dashboard/types/torrentTableSurfaces";
import STATUS from "@/shared/status";

const useResolvedRecoveryClassificationMock = vi.fn();
const showFeedbackMock = vi.fn();

vi.mock("framer-motion", () => ({
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
}));

vi.mock("@heroui/react", () => {
    type BaseProps = {
        children?: React.ReactNode;
        className?: string;
        style?: React.CSSProperties;
        onPress?: () => void;
        isDisabled?: boolean;
    };
    const Dropdown = ({ children }: BaseProps) =>
        React.createElement("div", null, children);
    const DropdownTrigger = ({ children }: BaseProps) =>
        React.createElement("div", null, children);
    const DropdownMenu = ({ children }: BaseProps) =>
        React.createElement("ul", null, children);
    const DropdownItem = ({ children, isDisabled }: BaseProps) =>
        React.createElement(
            "li",
            { "data-disabled": String(Boolean(isDisabled)) },
            children,
        );
    const cn = (...classNames: Array<string | false | null | undefined>) =>
        classNames.filter(Boolean).join(" ");
    return {
        Dropdown,
        DropdownTrigger,
        DropdownMenu,
        DropdownItem,
        cn,
    };
});

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/app/context/SessionContext", () => ({
    useUiModeCapabilities: () => ({
        clipboardWriteSupported: true,
    }),
}));

vi.mock("@/app/hooks/useActionFeedback", () => ({
    useActionFeedback: () => ({
        showFeedback: showFeedbackMock,
    }),
}));

vi.mock("@/app/context/RecoveryContext", () => ({
    useRecoveryContext: () => ({
        setLocationCapability: {
            canBrowse: true,
            supportsManual: false,
        },
        canOpenFolder: true,
        isDownloadMissingInFlight: () => false,
    }),
}));

vi.mock("@/modules/dashboard/hooks/useResolvedRecoveryClassification", () => ({
    useResolvedRecoveryClassification: (...args: unknown[]) =>
        useResolvedRecoveryClassificationMock(...args),
}));

const makeTorrent = (
    state: Torrent["state"] = STATUS.torrent.PAUSED,
): Torrent => ({
    id: "torrent-a",
    hash: "hash-a",
    name: "A",
    state,
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0 },
    totalSize: 1,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
});

const makeRect = (): DOMRect =>
    ({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 10,
        right: 10,
        bottom: 10,
        left: 10,
        toJSON: () => ({}),
    }) as DOMRect;

const makeViewModel = (torrent: Torrent): TorrentTableRowMenuViewModel => ({
    contextMenu: {
        virtualElement: {
            x: 10,
            y: 10,
            getBoundingClientRect: makeRect,
        },
        torrent,
    },
    onClose: vi.fn(),
    handleContextMenuAction: async () => ({ status: "success" }),
    queueMenuActions: [],
    getContextMenuShortcut: () => "",
});

describe("TorrentTable_RowMenu", () => {
    beforeEach(() => {
        useResolvedRecoveryClassificationMock.mockReset();
        showFeedbackMock.mockReset();
        useResolvedRecoveryClassificationMock.mockReturnValue(null);
    });

    it("shows enabled 'Download missing' for missing-files torrents even without classification", () => {
        const viewModel = makeViewModel(makeTorrent(STATUS.torrent.MISSING_FILES));
        const html = renderToString(
            React.createElement(TorrentTable_RowMenu, {
                viewModel,
            }),
        );

        expect(html).toContain("recovery.action_download");
        const match = html.match(
            /data-disabled="(true|false)">recovery\.action_download</,
        );
        expect(match?.[1]).toBe("false");
    });
});
