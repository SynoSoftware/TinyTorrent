import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOTKEY_COMMAND_ID } from "@/app/commandCatalog";
import { GlobalHotkeysHost } from "@/app/components/GlobalHotkeysHost";
import { STATUS } from "@/shared/status";
import type { Torrent } from "@/modules/dashboard/types/torrent";

const useHotkeysMock = vi.fn();
const useSelectionMock = vi.fn();
const useFocusStateMock = vi.fn();
const useTorrentCommandsMock = vi.fn();
const createGlobalHotkeyBindingsMock = vi.fn();

const TEST_TORRENT: Torrent = {
    id: "torrent-a",
    hash: "hash-a",
    name: "A",
    state: STATUS.torrent.DOWNLOADING,
    speed: {
        down: 0,
        up: 0,
    },
    peerSummary: {
        connected: 0,
    },
    totalSize: 0,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
};

vi.mock("react-hotkeys-hook", () => ({
    useHotkeys: (...args: unknown[]) => useHotkeysMock(...args),
}));

vi.mock("@/app/context/AppShellStateContext", () => ({
    useSelection: () => useSelectionMock(),
    useFocusState: () => useFocusStateMock(),
}));

vi.mock("@/app/context/AppCommandContext", () => ({
    useTorrentCommands: () => useTorrentCommandsMock(),
}));

vi.mock("@/app/commandRegistry", () => ({
    createGlobalHotkeyBindings: (...args: unknown[]) => createGlobalHotkeyBindingsMock(...args),
}));

describe("GlobalHotkeysHost", () => {
    beforeEach(() => {
        useHotkeysMock.mockReset();
        useSelectionMock.mockReset();
        useFocusStateMock.mockReset();
        useTorrentCommandsMock.mockReset();
        createGlobalHotkeyBindingsMock.mockReset();
    });

    it("wires controller + setters into command registry and registers all hotkeys", () => {
        const setSelectedIds = vi.fn();
        const setActiveId = vi.fn();
        const setActivePart = vi.fn();
        const handleBulkAction = vi.fn();
        const handleTorrentAction = vi.fn();
        const handleRequestDetails = vi.fn();
        const handleCloseDetail = vi.fn();

        useSelectionMock.mockReturnValue({
            selectedIds: ["torrent-a"],
            activeId: "torrent-a",
            setSelectedIds,
            setActiveId,
        });
        useFocusStateMock.mockReturnValue({ setActivePart });
        useTorrentCommandsMock.mockReturnValue({
            handleBulkAction,
            handleTorrentAction,
        });

        const bindings = {
            [HOTKEY_COMMAND_ID.SelectAll]: {
                keys: "ctrl+a",
                handler: vi.fn(),
                options: { scopes: "dashboard" },
            },
            [HOTKEY_COMMAND_ID.Remove]: {
                keys: "delete",
                handler: vi.fn(),
                options: { scopes: "dashboard" },
            },
            [HOTKEY_COMMAND_ID.ShowDetails]: {
                keys: "enter",
                handler: vi.fn(),
                options: { scopes: "dashboard" },
            },
            [HOTKEY_COMMAND_ID.ToggleInspector]: {
                keys: "ctrl+i",
                handler: vi.fn(),
                options: { scopes: "dashboard" },
            },
            [HOTKEY_COMMAND_ID.TogglePause]: {
                keys: "space",
                handler: vi.fn(),
                options: { scopes: "dashboard" },
            },
            [HOTKEY_COMMAND_ID.Recheck]: {
                keys: "r",
                handler: vi.fn(),
                options: { scopes: "dashboard" },
            },
            [HOTKEY_COMMAND_ID.RemoveWithData]: {
                keys: "shift+delete",
                handler: vi.fn(),
                options: { scopes: "dashboard" },
            },
        };
        createGlobalHotkeyBindingsMock.mockReturnValue(bindings);

        renderToString(
            React.createElement(GlobalHotkeysHost, {
                torrents: [TEST_TORRENT],
                selectedTorrents: [TEST_TORRENT],
                detailData: null,
                handleRequestDetails,
                handleCloseDetail,
            }),
        );

        expect(createGlobalHotkeyBindingsMock).toHaveBeenCalledTimes(1);
        const call = createGlobalHotkeyBindingsMock.mock.calls[0]?.[0] as {
            setSelectedIds: unknown;
            setActiveId: unknown;
            setActivePart: unknown;
            controller: Record<string, unknown>;
        };
        expect(call.setSelectedIds).toBe(setSelectedIds);
        expect(call.setActiveId).toBe(setActiveId);
        expect(call.setActivePart).toBe(setActivePart);
        expect(call.controller.handleBulkAction).toBe(handleBulkAction);
        expect(call.controller.handleTorrentAction).toBe(handleTorrentAction);
        expect(call.controller.handleRequestDetails).toBe(handleRequestDetails);
        expect(call.controller.handleCloseDetail).toBe(handleCloseDetail);

        expect(useHotkeysMock).toHaveBeenCalledTimes(7);
        expect(useHotkeysMock.mock.calls.map((entry) => entry[0])).toEqual([
            bindings[HOTKEY_COMMAND_ID.SelectAll].keys,
            bindings[HOTKEY_COMMAND_ID.Remove].keys,
            bindings[HOTKEY_COMMAND_ID.ShowDetails].keys,
            bindings[HOTKEY_COMMAND_ID.ToggleInspector].keys,
            bindings[HOTKEY_COMMAND_ID.TogglePause].keys,
            bindings[HOTKEY_COMMAND_ID.Recheck].keys,
            bindings[HOTKEY_COMMAND_ID.RemoveWithData].keys,
        ]);
    });
});
