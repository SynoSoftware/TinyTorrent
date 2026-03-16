import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import SetDownloadPathModal from "@/modules/dashboard/components/SetDownloadPathModal";
import type { DestinationPathValidationResult } from "@/shared/hooks/useDestinationPathValidation";

const modalExSpy = vi.hoisted(() => vi.fn());
const validationHookMock = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/app/context/SessionContext", () => ({
    useSession: () => ({
        daemonPathStyle: "windows",
    }),
}));

vi.mock("@/app/context/AppCommandContext", () => ({
    useTorrentCommands: () => ({
        checkFreeSpace: undefined,
    }),
}));

vi.mock("@/app/hooks/useDownloadPaths", () => ({
    useDownloadPaths: () => ({
        history: [],
    }),
}));

vi.mock("@/shared/hooks/useDestinationPathValidation", () => ({
    useDestinationPathValidation: (...args: unknown[]) => validationHookMock(...args),
}));

vi.mock("@/shared/ui/workspace/DestinationPathEditor", () => ({
    DestinationPathEditor: ({
        onEnter,
    }: {
        onEnter?: () => void;
    }) =>
        React.createElement(
            "button",
            {
                type: "button",
                onClick: () => onEnter?.(),
            },
            "enter-path",
        ),
}));

vi.mock("@/shared/ui/layout/ModalEx", () => ({
    ModalEx: (props: {
        children: React.ReactNode;
        primaryAction?: { onPress: () => void };
    }) => {
        modalExSpy(props);
        return React.createElement(React.Fragment, null, props.children);
    },
}));

type ModalExProps = {
    primaryAction?: {
        onPress: () => void;
    };
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

const makeValidation = (
    overrides?: Partial<DestinationPathValidationResult>,
): DestinationPathValidationResult => ({
    normalizedPath: "C:\\target",
    hasValue: true,
    status: "valid",
    reason: null,
    freeSpace: null,
    probeWarning: "free_space_unavailable",
    isFresh: true,
    ...overrides,
});

const latestModalExProps = (): ModalExProps => {
    const calls = modalExSpy.mock.calls;
    if (calls.length === 0) {
        throw new Error("modal_ex_not_rendered");
    }
    return calls[calls.length - 1][0] as ModalExProps;
};

const renderModal = (onApply: (params: { path: string }) => Promise<void>) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(
        React.createElement(SetDownloadPathModal, {
            isOpen: true,
            initialPath: "C:\\target",
            canPickDirectory: false,
            onClose: vi.fn(),
            onPickDirectory: async () => null,
            onApply,
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

describe("SetDownloadPathModal submit flow", () => {
    beforeEach(() => {
        modalExSpy.mockReset();
        validationHookMock.mockReset();
        validationHookMock.mockReturnValue(makeValidation());
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("submits through requestSubmit when the path editor triggers Enter", async () => {
        const onApply = vi.fn(async () => {});
        const mounted = renderModal(onApply);
        try {
            await waitForCondition(() => mounted.container.querySelector("button") instanceof HTMLButtonElement);
            const trigger = mounted.container.querySelector("button");
            if (!(trigger instanceof HTMLButtonElement)) {
                throw new Error("enter_trigger_missing");
            }

            trigger.click();

            await waitForCondition(() => onApply.mock.calls.length === 1);
            expect(onApply).toHaveBeenCalledWith({ path: "C:\\target" });
        } finally {
            mounted.cleanup();
        }
    });

    it("submits through the same path when the primary action is pressed", async () => {
        const onApply = vi.fn(async () => {});
        const mounted = renderModal(onApply);
        try {
            await waitForCondition(() => modalExSpy.mock.calls.length > 0);

            latestModalExProps().primaryAction?.onPress();

            await waitForCondition(() => onApply.mock.calls.length === 1);
            expect(onApply).toHaveBeenCalledWith({ path: "C:\\target" });
        } finally {
            mounted.cleanup();
        }
    });
});
