import React, {
    createElement,
    forwardRef,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
} from "react";
import type { Row, RowSelectionState } from "@tanstack/react-table";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { torrentTableActions } from "@/modules/dashboard/types/torrentTable";
import { useQueueReorderController } from "@/modules/dashboard/hooks/useQueueReorderController";
import { useTorrentTableContextActions } from "@/modules/dashboard/hooks/useTorrentTableContextActions";
import { useTorrentTableKeyboard } from "@/modules/dashboard/hooks/useTorrentTableKeyboard";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { status } from "@/shared/status";

const useRequiredTorrentActionsMock = vi.fn();
const useTorrentCommandsMock = vi.fn();
const useSelectionMock = vi.fn();
const useUiModeCapabilitiesMock = vi.fn();
const useOpenTorrentFolderMock = vi.fn();

vi.mock("@/app/context/AppCommandContext", async () => {
    const actual =
        await vi.importActual<typeof import("@/app/context/AppCommandContext")>(
            "@/app/context/AppCommandContext",
        );
    return {
        ...actual,
        useRequiredTorrentActions: () => useRequiredTorrentActionsMock(),
        useTorrentCommands: () => useTorrentCommandsMock(),
    };
});

vi.mock("@/app/context/AppShellStateContext", () => ({
    useSelection: () => useSelectionMock(),
}));

vi.mock("@/app/context/SessionContext", () => ({
    useUiModeCapabilities: () => useUiModeCapabilitiesMock(),
}));

vi.mock("@/app/hooks/useOpenTorrentFolder", () => ({
    useOpenTorrentFolder: () => useOpenTorrentFolderMock(),
}));

type ControllerValue = ReturnType<typeof useQueueReorderController>;
type ContextActionsValue = ReturnType<typeof useTorrentTableContextActions>;
type KeyboardValue = ReturnType<typeof useTorrentTableKeyboard>;

type ControllerContextHarnessRef = {
    getController: () => ControllerValue;
    getContextActions: () => ContextActionsValue;
};

type ControllerKeyboardHarnessRef = {
    getController: () => ControllerValue;
    getKeyboard: () => KeyboardValue;
};

type MountedHarness<TRef> = {
    ref: React.RefObject<TRef | null>;
    rerender: (
        renderElement: (ref: React.Ref<TRef>) => React.ReactElement,
    ) => Promise<void>;
    cleanup: () => void;
};

type TestRow = Row<Torrent>;
type ControllerDeps = Parameters<typeof useQueueReorderController>[0];

const dispatchMock = vi.fn();

const makeTorrent = (id: string): Torrent => ({
    id,
    hash: `${id}-hash`,
    name: id,
    state: status.torrent.downloading,
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
});

const makeRow = (id: string): TestRow =>
    ({
        id,
        original: makeTorrent(id),
    } as unknown as TestRow);

const makeSelection = (ids: string[]): RowSelectionState =>
    Object.fromEntries(ids.map((id) => [id, true])) as RowSelectionState;

const flush = () =>
    new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
    });

const makeControllerDeps = (
    rowIds: string[],
    selectedIds: string[],
): ControllerDeps => {
    return {
        sorting: [{ id: "queue", desc: false }],
        queueReorderScopeEnabled: true,
        pendingQueueOrder: null,
        setPendingQueueOrder: vi.fn(),
        serverOrder: rowIds,
        queueOrder: rowIds,
        dropTarget: null,
        rowSelection: makeSelection(selectedIds),
        setRowSelection: vi.fn(),
        anchorIndex: selectedIds.length ? rowIds.indexOf(selectedIds[0]) : null,
        focusIndex:
            selectedIds.length ? rowIds.indexOf(selectedIds[selectedIds.length - 1]) : null,
        beginAnimationSuppression: vi.fn(),
        endAnimationSuppression: vi.fn(),
        markRowDragInteractionComplete: vi.fn(),
        setAnchorIndex: vi.fn(),
        setFocusIndex: vi.fn(),
        setActiveRowId: vi.fn(),
        setDropTarget: vi.fn(),
    };
};

const ControllerContextHarness = forwardRef<
    ControllerContextHarnessRef,
    {
        controllerDeps: ControllerDeps;
        contextTorrent: Torrent;
        closeContextMenu: () => void;
    }
>(({ controllerDeps, contextTorrent, closeContextMenu }, ref) => {
    const controller = useQueueReorderController(controllerDeps);
    const contextActions = useTorrentTableContextActions({
        contextTorrent,
        copyToClipboard: vi.fn(async () => ({ status: "copied" }) as const),
        buildMagnetLink: (torrent) => `magnet:?xt=urn:btih:${torrent.hash}`,
        closeContextMenu,
        sequentialDownloadCapability: "supported",
        executeQueueAction: controller.executeQueueAction,
    });
    const valueRef = useRef({ controller, contextActions });

    useLayoutEffect(() => {
        valueRef.current = { controller, contextActions };
    }, [controller, contextActions]);

    useImperativeHandle(
        ref,
        () => ({
            getController: () => valueRef.current.controller,
            getContextActions: () => valueRef.current.contextActions,
        }),
        [],
    );

    return createElement("div");
});

const ControllerKeyboardHarness = forwardRef<
    ControllerKeyboardHarnessRef,
    {
        controllerDeps: ControllerDeps;
        rowIds: string[];
    }
>(({ controllerDeps, rowIds }, ref) => {
    const controller = useQueueReorderController(controllerDeps);
    const keyboard = useTorrentTableKeyboard({
        table: {
            getRowModel: () => ({
                rows: rowIds.map(makeRow),
            }),
        },
        rowVirtualizer: {
            scrollToIndex: vi.fn(),
        },
        anchorIndex: controllerDeps.anchorIndex,
        focusIndex: controllerDeps.focusIndex,
        setRowSelection: vi.fn(),
        setAnchorIndex: vi.fn(),
        setFocusIndex: vi.fn(),
        setActiveId: vi.fn(),
        selectAllRows: vi.fn(),
        executeQueueAction: controller.executeQueueAction,
    });
    const valueRef = useRef({ controller, keyboard });

    useLayoutEffect(() => {
        valueRef.current = { controller, keyboard };
    }, [controller, keyboard]);

    useImperativeHandle(
        ref,
        () => ({
            getController: () => valueRef.current.controller,
            getKeyboard: () => valueRef.current.keyboard,
        }),
        [],
    );

    return createElement("div");
});

const mountHarness = async <TRef,>(
    renderElement: (ref: React.Ref<TRef>) => React.ReactElement,
): Promise<MountedHarness<TRef>> => {
    const ref = React.createRef<TRef>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const render = async (
        nextRenderElement: (ref: React.Ref<TRef>) => React.ReactElement,
    ) => {
        root.render(nextRenderElement(ref));
        await flush();
    };

    await render(renderElement);

    if (!ref.current) {
        throw new Error("harness_missing");
    }

    return {
        ref,
        rerender: render,
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("useQueueReorderController integration", () => {
    beforeEach(() => {
        dispatchMock.mockReset();
        dispatchMock.mockResolvedValue({ status: "applied" });
        useRequiredTorrentActionsMock.mockReset();
        useRequiredTorrentActionsMock.mockReturnValue({
            dispatch: dispatchMock,
        });
        useTorrentCommandsMock.mockReset();
        useTorrentCommandsMock.mockReturnValue({
            handleTorrentAction: vi.fn(),
            handleBulkAction: vi.fn(),
            setSequentialDownload: vi.fn(),
        });
        useSelectionMock.mockReset();
        useSelectionMock.mockReturnValue({
            selectedIds: ["row-2", "row-4"],
            setSelectedIds: vi.fn(),
            activeId: "row-2",
            setActiveId: vi.fn(),
        });
        useUiModeCapabilitiesMock.mockReset();
        useUiModeCapabilitiesMock.mockReturnValue({
            canOpenFolder: true,
        });
        useOpenTorrentFolderMock.mockReset();
        useOpenTorrentFolderMock.mockResolvedValue({ status: "unsupported" });
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("dispatches a minimal semantic queue reorder intent from the controller", async () => {
        const rowIds = ["row-1", "row-2", "row-3", "row-4", "row-5"];
        const mounted = await mountHarness<ControllerKeyboardHarnessRef>(
            (ref) =>
                createElement(ControllerKeyboardHarness, {
                    ref,
                    controllerDeps: makeControllerDeps(rowIds, [
                        "row-2",
                        "row-4",
                    ]),
                    rowIds,
                }),
        );

        try {
            const controller = mounted.ref.current?.getController();
            if (!controller) {
                throw new Error("controller_missing");
            }

            const outcome = await controller.executeQueueAction(
                torrentTableActions.queueMoveTop,
                { rowId: "row-4" },
            );

            expect(outcome).toEqual({ status: "success" });
            expect(dispatchMock).toHaveBeenCalledWith({
                type: "QUEUE_REORDER",
                torrentIds: ["row-2", "row-4"],
                queueOrder: ["row-1", "row-2", "row-3", "row-4", "row-5"],
                targetInsertionIndex: 0,
            });
        } finally {
            mounted.cleanup();
        }
    });

    it("routes context-menu queue actions through the same semantic controller path", async () => {
        const rowIds = ["row-1", "row-2", "row-3", "row-4", "row-5"];
        const closeContextMenu = vi.fn();
        const mounted = await mountHarness<ControllerContextHarnessRef>(
            (ref) =>
                createElement(ControllerContextHarness, {
                    ref,
                    controllerDeps: makeControllerDeps(rowIds, [
                        "row-2",
                        "row-4",
                    ]),
                    contextTorrent: makeTorrent("row-4"),
                    closeContextMenu,
                }),
        );

        try {
            const controller = mounted.ref.current?.getController();
            const contextActions = mounted.ref.current?.getContextActions();
            if (!controller || !contextActions) {
                throw new Error("harness_missing");
            }

            await controller.executeQueueAction(torrentTableActions.queueMoveTop, {
                rowId: "row-4",
            });
            const directIntent = dispatchMock.mock.calls[0]?.[0];
            dispatchMock.mockClear();

            const outcome = await contextActions.handleContextMenuAction(
                torrentTableActions.queueMoveTop,
            );

            expect(outcome).toEqual({ status: "success" });
            expect(dispatchMock).toHaveBeenCalledWith(directIntent);
            expect(closeContextMenu).toHaveBeenCalledTimes(1);
            expect(
                useTorrentCommandsMock.mock.results[0]?.value.handleBulkAction,
            ).not.toHaveBeenCalled();
            expect(
                useTorrentCommandsMock.mock.results[0]?.value.handleTorrentAction,
            ).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });

    it("routes keyboard queue shortcuts through the same semantic controller path", async () => {
        const rowIds = ["row-1", "row-2", "row-3", "row-4", "row-5"];
        const mounted = await mountHarness<ControllerKeyboardHarnessRef>(
            (ref) =>
                createElement(ControllerKeyboardHarness, {
                    ref,
                    controllerDeps: makeControllerDeps(rowIds, [
                        "row-2",
                        "row-4",
                    ]),
                    rowIds,
                }),
        );

        try {
            const controller = mounted.ref.current?.getController();
            const keyboard = mounted.ref.current?.getKeyboard();
            if (!controller || !keyboard) {
                throw new Error("harness_missing");
            }

            await controller.executeQueueAction(torrentTableActions.queueMoveTop);
            const directIntent = dispatchMock.mock.calls[0]?.[0];
            dispatchMock.mockClear();

            const preventDefault = vi.fn();
            keyboard.handleKeyDown({
                key: "Home",
                ctrlKey: true,
                altKey: false,
                shiftKey: false,
                metaKey: false,
                preventDefault,
                nativeEvent: {
                    key: "Home",
                    ctrlKey: true,
                    altKey: false,
                    shiftKey: false,
                    metaKey: false,
                },
            } as never);
            await flush();

            expect(preventDefault).toHaveBeenCalledTimes(1);
            expect(dispatchMock).toHaveBeenCalledWith(directIntent);
        } finally {
            mounted.cleanup();
        }
    });

    it("uses the current optimistic queue order for follow-up queue actions", async () => {
        const currentQueueOrder = [
            "row-1",
            "row-3",
            "row-4",
            "row-2",
            "row-5",
        ];
        const deps = makeControllerDeps(currentQueueOrder, ["row-2"]);
        deps.pendingQueueOrder = currentQueueOrder;
        deps.serverOrder = ["row-1", "row-2", "row-3", "row-4", "row-5"];
        deps.queueOrder = currentQueueOrder;

        const mounted = await mountHarness<ControllerKeyboardHarnessRef>(
            (ref) =>
                createElement(ControllerKeyboardHarness, {
                    ref,
                    controllerDeps: deps,
                    rowIds: currentQueueOrder,
                }),
        );

        try {
            const controller = mounted.ref.current?.getController();
            if (!controller) {
                throw new Error("controller_missing");
            }

            const outcome = await controller.executeQueueAction(
                torrentTableActions.queueMoveUp,
                { rowId: "row-2" },
            );

            expect(outcome).toEqual({ status: "success" });
            expect(dispatchMock).toHaveBeenLastCalledWith({
                type: "QUEUE_REORDER",
                torrentIds: ["row-2"],
                queueOrder: currentQueueOrder,
                targetInsertionIndex: 2,
            });
        } finally {
            mounted.cleanup();
        }
    });

    it("clears optimistic queue order when refreshed backend order diverges from the target", async () => {
        const rowIds = ["row-1", "row-2", "row-3", "row-4", "row-5"];
        const pendingQueueOrder = [
            "row-1",
            "row-3",
            "row-2",
            "row-4",
            "row-5",
        ];
        const mismatchedServerOrder = [
            "row-1",
            "row-4",
            "row-2",
            "row-3",
            "row-5",
        ];
        const deps = makeControllerDeps(rowIds, ["row-2"]);

        const mounted = await mountHarness<ControllerKeyboardHarnessRef>(
            (ref) =>
                createElement(ControllerKeyboardHarness, {
                    ref,
                    controllerDeps: deps,
                    rowIds,
                }),
        );

        try {
            const controller = mounted.ref.current?.getController();
            if (!controller) {
                throw new Error("controller_missing");
            }

            await controller.executeQueueAction(torrentTableActions.queueMoveDown, {
                rowId: "row-2",
            });

            deps.pendingQueueOrder = pendingQueueOrder;
            deps.queueOrder = pendingQueueOrder;

            await mounted.rerender((ref) =>
                createElement(ControllerKeyboardHarness, {
                    ref,
                    controllerDeps: deps,
                    rowIds: pendingQueueOrder,
                }),
            );

            deps.serverOrder = mismatchedServerOrder;

            await mounted.rerender((ref) =>
                createElement(ControllerKeyboardHarness, {
                    ref,
                    controllerDeps: deps,
                    rowIds: pendingQueueOrder,
                }),
            );

            expect(deps.setPendingQueueOrder).toHaveBeenCalledTimes(2);
            expect(deps.setPendingQueueOrder).toHaveBeenNthCalledWith(
                1,
                pendingQueueOrder,
            );
            expect(deps.setPendingQueueOrder).toHaveBeenNthCalledWith(2, null);
        } finally {
            mounted.cleanup();
        }
    });
});
