import React, { createElement, forwardRef, useImperativeHandle } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDetailControls } from "@/modules/dashboard/hooks/useDetailControls";
import { TorrentIntents, type TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import { status } from "@/shared/status";
import type { TransmissionPriority, TorrentDetailEntity } from "@/services/rpc/entities";

const showFeedbackMock = vi.fn();

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/app/hooks/useActionFeedback", () => ({
    useActionFeedback: () => ({
        showFeedback: showFeedbackMock,
    }),
}));

type HarnessRef = {
    handleFileSelectionChange: (indexes: number[], wanted: boolean) => Promise<void>;
    handleFilePriorityChange: (indexes: number[], priority: TransmissionPriority) => Promise<void>;
};

interface HarnessProps {
    detailData: TorrentDetailEntity;
    mutateDetail: (updater: (current: TorrentDetailEntity) => TorrentDetailEntity | null) => void;
    dispatch: (intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>;
}

const makeDetail = (): TorrentDetailEntity => ({
    id: "torrent-1",
    hash: "hash-1",
    name: "torrent-1",
    state: status.torrent.seeding,
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0 },
    totalSize: 2,
    eta: -1,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
    files: [
        { index: 0, name: "folder/file-1.bin", wanted: false, priority: 0, length: 1 },
        { index: 1, name: "folder/file-2.bin", wanted: false, priority: 0, length: 1 },
    ],
});

const HookHarness = forwardRef<HarnessRef, HarnessProps>(({ detailData, mutateDetail, dispatch }, ref) => {
    const controls = useDetailControls({
        detailData,
        mutateDetail,
        capabilities: {
            sequentialDownload: "supported",
            superSeeding: "supported",
        },
        dispatch,
        registerPendingFilePriority: () => 1,
        clearPendingFilePriority: () => undefined,
    });

    useImperativeHandle(ref, () => ({
        handleFileSelectionChange: controls.handleFileSelectionChange,
        handleFilePriorityChange: controls.handleFilePriorityChange,
    }));

    return createElement("div");
});

type MountedHarness = {
    ref: React.RefObject<HarnessRef | null>;
    cleanup: () => void;
};

const mountHarness = (props: HarnessProps): MountedHarness => {
    const ref = React.createRef<HarnessRef>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    flushSync(() => {
        root.render(createElement(HookHarness, { ref, ...props }));
    });
    return {
        ref,
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("useDetailControls file selection", () => {
    beforeEach(() => {
        showFeedbackMock.mockReset();
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("dispatches setFilesWanted once for all valid folder descendant indexes", async () => {
        const dispatch = vi.fn(async () => ({ status: "applied" } as const));
        const mutateDetail = vi.fn();
        const mounted = mountHarness({
            detailData: makeDetail(),
            mutateDetail,
            dispatch,
        });

        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            await harness.handleFileSelectionChange([0, 1], true);

            expect(dispatch).toHaveBeenCalledTimes(1);
            expect(dispatch).toHaveBeenCalledWith(
                TorrentIntents.setFilesWanted("torrent-1", [0, 1], true),
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("does not dispatch anything when every requested file is unwanted", async () => {
        const dispatch = vi
            .fn<(_intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>>()
            .mockResolvedValue({ status: "applied" } as const);
        const mutateDetail = vi.fn();
        const mounted = mountHarness({
            detailData: makeDetail(),
            mutateDetail,
            dispatch,
        });

        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            await harness.handleFilePriorityChange([0, 1], 0);

            expect(dispatch).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });

    it("dispatches file priority only for the wanted subset", async () => {
        const dispatch = vi
            .fn<(_intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>>()
            .mockResolvedValue({ status: "applied" } as const);
        const mutateDetail = vi.fn();
        const detailData = makeDetail();
        detailData.files = [
            { index: 0, name: "folder/file-1.bin", wanted: true, priority: 1, length: 1 },
            { index: 1, name: "folder/file-2.bin", wanted: false, priority: 1, length: 1 },
        ];
        const mounted = mountHarness({
            detailData,
            mutateDetail,
            dispatch,
        });

        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            await harness.handleFilePriorityChange([0, 1], 0);

            expect(dispatch).toHaveBeenCalledTimes(1);
            expect(dispatch).toHaveBeenCalledWith(
                TorrentIntents.setFilesPriority("torrent-1", [0], 0),
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("does not dispatch file priority when the wanted subset already has the requested priority", async () => {
        const dispatch = vi
            .fn<(_intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>>()
            .mockResolvedValue({ status: "applied" } as const);
        const mutateDetail = vi.fn();
        const detailData = makeDetail();
        detailData.files = [
            { index: 0, name: "folder/file-1.bin", wanted: true, priority: 0, length: 1 },
            { index: 1, name: "folder/file-2.bin", wanted: false, priority: 1, length: 1 },
        ];
        const mounted = mountHarness({
            detailData,
            mutateDetail,
            dispatch,
        });

        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            await harness.handleFilePriorityChange([0, 1], 0);

            expect(dispatch).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });
});
