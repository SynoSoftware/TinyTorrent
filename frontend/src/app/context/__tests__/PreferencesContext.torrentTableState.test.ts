import React, {
    createElement,
    forwardRef,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    type ForwardedRef,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PreferencesContextValue } from "@/app/context/PreferencesContext";

const PREFERENCES_STORAGE_KEY = "tiny-torrent.preferences.v1";

type HarnessRef = {
    getValue: () => PreferencesContextValue;
};

const flush = () =>
    new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
    });

const ensureStorage = () => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
        value: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => {
                store.set(key, value);
            },
            removeItem: (key: string) => {
                store.delete(key);
            },
            clear: () => {
                store.clear();
            },
        },
        configurable: true,
    });
};

const mountHarness = async () => {
    const preferencesModule = await import("@/app/context/PreferencesContext");
    const { PreferencesProvider, usePreferences } = preferencesModule;
    const ContextHarness = forwardRef(function ContextHarness(
        _: object,
        ref: ForwardedRef<HarnessRef>,
    ) {
        const value = usePreferences();
        const valueRef = useRef(value);

        useLayoutEffect(() => {
            valueRef.current = value;
        }, [value]);

        useImperativeHandle(
            ref,
            () => ({
                getValue: () => valueRef.current,
            }),
            [],
        );

        return createElement("div");
    });
    const ref = React.createRef<HarnessRef>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    root.render(
        createElement(
            PreferencesProvider,
            null,
            createElement(ContextHarness, { ref }),
        ),
    );

    await flush();

    if (!ref.current) {
        throw new Error("harness_missing");
    }

    return {
        ref,
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("PreferencesProvider torrent table state", () => {
    beforeEach(() => {
        ensureStorage();
        window.localStorage.clear();
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("persists column layout and sorting through the shared preferences store", async () => {
        const mounted = await mountHarness();
        const nextState = {
            columnOrder: ["name", "speed", "size", "status"],
            columnVisibility: { eta: false, ratio: false, speed: true },
            columnSizing: { name: 320, speed: 164, size: 112 },
            sorting: [{ id: "queue", desc: false }],
        };

        try {
            mounted.ref.current?.getValue().setTorrentTableState(nextState);
            await flush();

            const stored = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
            expect(stored).not.toBeNull();
            expect(JSON.parse(stored as string).torrentTableState).toEqual(nextState);
        } finally {
            mounted.cleanup();
        }
    });

    it("restores the exact persisted torrent table state from shared preferences", async () => {
        const persistedState = {
            columnOrder: ["size", "name", "speed", "queue"],
            columnVisibility: { added: false, peers: true },
            columnSizing: { size: 144, name: 280 },
            sorting: [{ id: "added", desc: true }],
        };

        window.localStorage.setItem(
            PREFERENCES_STORAGE_KEY,
            JSON.stringify({
                torrentTableState: persistedState,
            }),
        );

        const mounted = await mountHarness();

        try {
            expect(
                mounted.ref.current?.getValue().preferences.torrentTableState,
            ).toEqual(persistedState);
        } finally {
            mounted.cleanup();
        }
    });

    it("persists and restores torrent file tree expansion by torrent key", async () => {
        const mounted = await mountHarness();

        try {
            mounted.ref.current?.getValue().setTorrentFileTreeExpandedIds(
                "hash-123",
                ["folder-a", "folder-a/subfolder-b"],
            );
            await flush();

            const stored = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
            expect(stored).not.toBeNull();
            expect(
                JSON.parse(stored as string).torrentFileTreeExpandedIdsByTorrent,
            ).toEqual({
                "hash-123": ["folder-a", "folder-a/subfolder-b"],
            });
        } finally {
            mounted.cleanup();
        }

        window.localStorage.setItem(
            PREFERENCES_STORAGE_KEY,
            JSON.stringify({
                torrentFileTreeExpandedIdsByTorrent: {
                    "hash-123": ["folder-a", "folder-a/subfolder-b"],
                },
            }),
        );

        const restored = await mountHarness();
        try {
            expect(
                restored.ref.current?.getValue().preferences
                    .torrentFileTreeExpandedIdsByTorrent,
            ).toEqual({
                "hash-123": ["folder-a", "folder-a/subfolder-b"],
            });
        } finally {
            restored.cleanup();
        }
    });

    it("drops the legacy add-dialog sequential default and preserves only supported add defaults", async () => {
        window.localStorage.setItem(
            PREFERENCES_STORAGE_KEY,
            JSON.stringify({
                addTorrentDefaults: {
                    commitMode: "start",
                    sequentialDownload: true,
                    showAddDialog: false,
                },
            }),
        );

        const mounted = await mountHarness();

        try {
            expect(
                mounted.ref.current?.getValue().preferences.addTorrentDefaults,
            ).toEqual({
                commitMode: "start",
                showAddDialog: false,
            });
            expect(
                JSON.parse(
                    window.localStorage.getItem(PREFERENCES_STORAGE_KEY) as string,
                ).addTorrentDefaults,
            ).toEqual({
                commitMode: "start",
                showAddDialog: false,
            });
        } finally {
            mounted.cleanup();
        }
    });
});
