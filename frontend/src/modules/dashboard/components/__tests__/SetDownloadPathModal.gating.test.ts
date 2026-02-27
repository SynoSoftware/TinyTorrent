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

vi.mock("@/shared/hooks/useDestinationPathValidation", () => ({
    useDestinationPathValidation: (...args: unknown[]) => validationHookMock(...args),
}));

vi.mock("@/shared/ui/layout/ModalEx", () => ({
    ModalEx: (props: unknown) => {
        modalExSpy(props);
        return null;
    },
}));

type ModalExProps = {
    primaryAction?: {
        disabled?: boolean;
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

const renderModal = (allowCreatePath: boolean) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(
        React.createElement(SetDownloadPathModal, {
            isOpen: true,
            initialPath: "C:\\target",
            daemonPathStyle: "windows",
            canPickDirectory: false,
            allowCreatePath,
            onClose: vi.fn(),
            onPickDirectory: async () => null,
            onApply: async () => {},
        }),
    );
    return {
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("SetDownloadPathModal apply gating", () => {
    beforeEach(() => {
        modalExSpy.mockReset();
        validationHookMock.mockReset();
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("keeps Apply disabled for invalid paths when allowCreatePath=false (move:false)", async () => {
        validationHookMock.mockReturnValue(
            makeValidation({
                status: "invalid",
                reason: "invalid_format",
            }),
        );
        const mounted = renderModal(false);
        try {
            await waitForCondition(() => modalExSpy.mock.calls.length > 0);
            expect(latestModalExProps().primaryAction?.disabled).toBe(true);
        } finally {
            mounted.cleanup();
        }
    });

    it("keeps Apply disabled for invalid paths when allowCreatePath=true (move:true)", async () => {
        validationHookMock.mockReturnValue(
            makeValidation({
                status: "invalid",
                reason: "invalid_format",
            }),
        );
        const mounted = renderModal(true);
        try {
            await waitForCondition(() => modalExSpy.mock.calls.length > 0);
            expect(latestModalExProps().primaryAction?.disabled).toBe(true);
        } finally {
            mounted.cleanup();
        }
    });
});
