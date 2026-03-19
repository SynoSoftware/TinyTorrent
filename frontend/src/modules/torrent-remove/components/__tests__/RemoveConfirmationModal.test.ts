import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RemoveConfirmationModal from "@/modules/torrent-remove/components/RemoveConfirmationModal";
import type { DeleteIntent } from "@/app/types/workspace";

const checkboxSpy = vi.hoisted(() => vi.fn());

let pendingDeleteMock: DeleteIntent | null = null;
let removeTorrentDefaultsDeleteDataMock = false;

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/app/context/PreferencesContext", () => ({
    usePreferences: () => ({
        preferences: {
            removeTorrentDefaults: {
                deleteData: removeTorrentDefaultsDeleteDataMock,
            },
        },
        updatePreferences: vi.fn(),
    }),
}));

vi.mock("@/modules/torrent-remove/context/DeleteConfirmationContext", () => ({
    useDeleteConfirmationContextOptional: () => ({
        pendingDelete: pendingDeleteMock,
        clearPendingDelete: vi.fn(),
        confirmDelete: vi.fn(async () => ({ status: "success" })),
    }),
}));

vi.mock("@/shared/ui/layout/ModalEx", () => ({
    ModalEx: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("div", null, children),
}));

vi.mock("@heroui/react", () => ({
    Checkbox: ({
        isSelected,
        onValueChange,
        children,
    }: {
        isSelected?: boolean;
        onValueChange?: (value: boolean) => void;
        children?: React.ReactNode;
    }) => {
        checkboxSpy({ isSelected, onValueChange, children });
        return React.createElement(
            "button",
            {
                type: "button",
                "data-testid": "remove-delete-files-checkbox",
                "data-selected": isSelected ? "true" : "false",
                onClick: () => onValueChange?.(!isSelected),
            },
            children,
        );
    },
}));

const latestCheckboxProps = () => {
    const calls = checkboxSpy.mock.calls;
    if (calls.length === 0) {
        throw new Error("checkbox_not_rendered");
    }
    return calls[calls.length - 1][0] as {
        isSelected?: boolean;
    };
};

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

const renderModal = () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    flushSync(() => {
        root.render(React.createElement(RemoveConfirmationModal));
    });

    return {
        rerender: () => {
            flushSync(() => {
                root.render(React.createElement(RemoveConfirmationModal));
            });
        },
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("RemoveConfirmationModal", () => {
    beforeEach(() => {
        checkboxSpy.mockReset();
        removeTorrentDefaultsDeleteDataMock = false;
        pendingDeleteMock = {
            torrents: [
                {
                    id: "torrent-1",
                    hash: "hash-1",
                    name: "Torrent 1",
                    state: "paused",
                    speed: { down: 0, up: 0 },
                    peerSummary: { connected: 0 },
                    totalSize: 1,
                    eta: 0,
                    ratio: 0,
                    uploaded: 0,
                    downloaded: 0,
                    added: 0,
                },
            ],
            action: "remove",
        };
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("keeps the persisted delete-files preference for normal remove requests", async () => {
        removeTorrentDefaultsDeleteDataMock = true;
        const mounted = renderModal();

        try {
            await waitForCondition(() => latestCheckboxProps().isSelected === true);
            expect(latestCheckboxProps().isSelected).toBe(true);

            mounted.rerender();

            await waitForCondition(() => latestCheckboxProps().isSelected === true);
            expect(latestCheckboxProps().isSelected).toBe(true);
        } finally {
            mounted.cleanup();
        }
    });

    it("still forces delete-files on explicit remove-with-data requests", async () => {
        removeTorrentDefaultsDeleteDataMock = false;
        pendingDeleteMock = {
            ...pendingDeleteMock!,
            action: "remove-with-data",
            deleteData: true,
        };

        const mounted = renderModal();

        try {
            await waitForCondition(() => latestCheckboxProps().isSelected === true);
            expect(latestCheckboxProps().isSelected).toBe(true);
        } finally {
            mounted.cleanup();
        }
    });
});
