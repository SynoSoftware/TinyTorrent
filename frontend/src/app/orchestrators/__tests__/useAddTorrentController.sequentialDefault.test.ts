import React, {
    createElement,
    forwardRef,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    type ForwardedRef,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS_CONFIG } from "@/modules/settings/data/config";
import type { AddTorrentCommandOutcome, UseAddTorrentControllerResult } from "@/app/orchestrators/useAddTorrentController";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";

const addModalCallbacks = vi.hoisted(
    () =>
        ({
            onOpenAddTorrentFromFile: null as null | ((file: File) => Promise<AddTorrentCommandOutcome> | void),
        }),
);
const dispatchSpy = vi.hoisted(
    () =>
        vi.fn<
            (intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>
        >(async () => ({ status: "applied" })),
);
const setAddTorrentDefaultsSpy = vi.hoisted(() => vi.fn());
const useDownloadPathsMock = vi.hoisted(() => vi.fn());
const refreshSessionSettingsSpy = vi.hoisted(() => vi.fn(async () => ({})));
const updateSessionSettingsSpy = vi.hoisted(() => vi.fn(async () => {}));
const parseTorrentFileSpy = vi.hoisted(
    () =>
        vi.fn(async () => ({
            ok: true as const,
            metainfoBase64: "base64-metainfo",
        })),
);

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@heroui/toast", () => ({
    addToast: vi.fn(),
    closeToast: vi.fn(),
}));

vi.mock("@/app/hooks/useActionFeedback", () => ({
    useActionFeedback: () => ({
        showFeedback: vi.fn(),
    }),
}));

vi.mock("@/app/hooks/useAddModalState", () => ({
    useAddModalState: ({
        onOpenAddTorrentFromFile,
    }: {
        onOpenAddTorrentFromFile: (file: File) => Promise<AddTorrentCommandOutcome> | void;
    }) => {
        addModalCallbacks.onOpenAddTorrentFromFile = onOpenAddTorrentFromFile;
        return {
            getRootProps: () => ({}),
            getInputProps: () => ({}),
            isDragActive: false,
            open: vi.fn(),
        };
    },
}));

vi.mock("@/app/hooks/useDownloadPaths", () => ({
    useDownloadPaths: useDownloadPathsMock,
}));

vi.mock("@/app/context/PreferencesContext", () => ({
    usePreferences: () => ({
        preferences: {
            addTorrentDefaults: {
                commitMode: "paused",
                showAddDialog: false,
            },
        },
        setAddTorrentDefaults: setAddTorrentDefaultsSpy,
    }),
}));

vi.mock("@/app/context/SessionContext", () => ({
    useSession: () => ({
        refreshSessionSettings: refreshSessionSettingsSpy,
    }),
}));

vi.mock("@/app/providers/engineDomains", () => ({
    useEngineSessionDomain: () => ({
        updateSessionSettings: updateSessionSettingsSpy,
    }),
}));

vi.mock("@/modules/torrent-add/services/torrent-metainfo", () => ({
    parseTorrentFile: parseTorrentFileSpy,
}));

type HarnessRef = {
    getValue: () => UseAddTorrentControllerResult;
};

const flush = () =>
    new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
    });

const mountHarness = async () => {
    const { useAddTorrentController } = await import(
        "@/app/orchestrators/useAddTorrentController"
    );

    const HookHarness = forwardRef(function HookHarness(
        _: object,
        ref: ForwardedRef<HarnessRef>,
    ) {
        const value = useAddTorrentController({
            dispatch: dispatchSpy,
            settingsConfig: {
                ...DEFAULT_SETTINGS_CONFIG,
                download_dir: "D:\\Downloads",
                sequential_download: true,
            },
            torrents: [],
            pendingDeletionHashesRef: { current: new Set<string>() },
            refreshTorrents: async () => undefined,
        });
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

    root.render(createElement(HookHarness, { ref }));
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

describe("useAddTorrentController sequential default", () => {
    beforeEach(() => {
        dispatchSpy.mockClear();
        setAddTorrentDefaultsSpy.mockClear();
        refreshSessionSettingsSpy.mockClear();
        updateSessionSettingsSpy.mockClear();
        useDownloadPathsMock.mockReturnValue({
            history: [],
            remember: vi.fn(),
        });
        parseTorrentFileSpy.mockClear();
        addModalCallbacks.onOpenAddTorrentFromFile = null;
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("initializes the add dialog from the global sequential setting and uses it for direct adds", async () => {
        const mounted = await mountHarness();

        try {
            expect(
                mounted.ref.current?.getValue().addTorrentDefaults.sequentialDownload,
            ).toBe(true);
            expect(addModalCallbacks.onOpenAddTorrentFromFile).toBeTypeOf("function");

            await addModalCallbacks.onOpenAddTorrentFromFile?.(
                new File(["dummy"], "demo.torrent", {
                    type: "application/x-bittorrent",
                }),
            );
            await flush();

            expect(dispatchSpy).toHaveBeenCalledTimes(1);
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "ADD_TORRENT_FROM_FILE",
                    sequentialDownload: true,
                }),
            );
            expect(updateSessionSettingsSpy).not.toHaveBeenCalled();
            expect(refreshSessionSettingsSpy).not.toHaveBeenCalled();
            expect(setAddTorrentDefaultsSpy).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });

    it("uses the session-backed download dir instead of path history", async () => {
        useDownloadPathsMock.mockReturnValue({
            history: ["E:\\HistoryOnly"],
            remember: vi.fn(),
        });

        const mounted = await mountHarness();

        try {
            expect(
                mounted.ref.current?.getValue().addTorrentDefaults.downloadDir,
            ).toBe("D:\\Downloads");
        } finally {
            mounted.cleanup();
        }
    });

    it("updates the default download dir after a confirmed add path change", async () => {
        const mounted = await mountHarness();

        try {
            mounted.ref.current?.getValue().openAddMagnet("magnet:?xt=urn:btih:1234");
            await flush();

            await mounted.ref.current?.getValue().handleTorrentWindowConfirm({
                downloadDir: "E:\\Incoming",
                commitMode: "paused",
                magnetLink: "magnet:?xt=urn:btih:1234",
                filesUnwanted: [],
                priorityHigh: [],
                priorityNormal: [],
                priorityLow: [],
                options: {
                    sequential: true,
                },
            });

            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "ADD_MAGNET_TORRENT",
                    downloadDir: "E:\\Incoming",
                }),
            );
            expect(updateSessionSettingsSpy).toHaveBeenCalledWith({
                "download-dir": "E:\\Incoming",
            });
            expect(refreshSessionSettingsSpy).toHaveBeenCalledTimes(1);
        } finally {
            mounted.cleanup();
        }
    });

    it("skips a default-path write when the confirmed path already matches the default", async () => {
        const mounted = await mountHarness();

        try {
            mounted.ref.current?.getValue().openAddMagnet("magnet:?xt=urn:btih:1234");
            await flush();

            await mounted.ref.current?.getValue().handleTorrentWindowConfirm({
                downloadDir: "D:\\Downloads",
                commitMode: "paused",
                magnetLink: "magnet:?xt=urn:btih:1234",
                filesUnwanted: [],
                priorityHigh: [],
                priorityNormal: [],
                priorityLow: [],
                options: {
                    sequential: true,
                },
            });

            expect(updateSessionSettingsSpy).not.toHaveBeenCalled();
            expect(refreshSessionSettingsSpy).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });
});
