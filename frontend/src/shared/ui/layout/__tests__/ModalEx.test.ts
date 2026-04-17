import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { ModalEx } from "@/shared/ui/layout/ModalEx";

const modalSpy = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@heroui/react", () => ({
    Button: ({
        children,
        onPress,
    }: {
        children?: React.ReactNode;
        onPress?: () => void;
    }) =>
        React.createElement(
            "button",
            { type: "button", onClick: onPress },
            children,
        ),
    Modal: Object.assign(
        ({
            children,
            ...props
        }: {
            children?: React.ReactNode;
            [key: string]: unknown;
        }) => {
            modalSpy({ type: "root", ...props });
            return React.createElement("div", null, children);
        },
        {
            Backdrop: ({
                children,
                ...props
            }: {
                children?: React.ReactNode;
                [key: string]: unknown;
            }) => {
                modalSpy({ type: "backdrop", ...props });
                return React.createElement("div", null, children);
            },
            Container: ({
                children,
                ...props
            }: {
                children?: React.ReactNode;
                [key: string]: unknown;
            }) => {
                modalSpy({ type: "container", ...props });
                return React.createElement("div", { "data-slot": "container" }, children);
            },
            Dialog: ({
                children,
                ...props
            }: {
                children?: React.ReactNode;
                [key: string]: unknown;
            }) => {
                modalSpy({ type: "dialog", ...props });
                return React.createElement("div", { "data-slot": "dialog" }, children);
            },
            Header: ({ children }: { children?: React.ReactNode }) =>
                React.createElement("div", { "data-slot": "header" }, children),
            Body: ({ children }: { children?: React.ReactNode }) =>
                React.createElement("div", { "data-slot": "body" }, children),
            Footer: ({ children }: { children?: React.ReactNode }) =>
                React.createElement("div", { "data-slot": "footer" }, children),
        },
    ),
    cn: (...values: Array<string | false | null | undefined>) =>
        values.filter(Boolean).join(" "),
}));

vi.mock("@/shared/ui/layout/toolbar-button", () => ({
    ICON_SIZE_CLASSES: { lg: "icon-lg" },
    ToolbarIconButton: ({
        ariaLabel,
        onPress,
        isDisabled,
    }: {
        ariaLabel: string;
        onPress: () => void;
        isDisabled?: boolean;
    }) =>
        React.createElement("button", {
            type: "button",
            "aria-label": ariaLabel,
            disabled: isDisabled,
            onClick: onPress,
        }),
}));

vi.mock("@/shared/ui/layout/glass-surface", () => ({
    modal: {
        surface: {
            base: "modal-base",
        },
        placement: {
            center: "fixed inset-0 flex w-screen h-screen items-center justify-center",
        },
        chrome: { header: "dialog-header", footer: "dialog-footer" },
        layout: {
            body: "dialog-body",
            bodyFlush: "dialog-body-flush",
            frame: "content-wrapper",
        },
    },
    details: {
        generalMetricContent: "metric-content",
    },
    form: {
        inputActionRow: "footer-actions",
    },
}));

type ModalBackdropPropsSnapshot = {
    isDismissable?: boolean;
};

type ModalRootPropsSnapshot = {
    onOpenChange?: (open: boolean) => void;
};

type ModalSlotPropsSnapshot = {
    className?: string;
    scroll?: string;
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

const latestBackdropProps = (): ModalBackdropPropsSnapshot => {
    const calls = modalSpy.mock.calls
        .map((call) => call[0] as { type?: string } & ModalBackdropPropsSnapshot)
        .filter((call) => call.type === "backdrop");
    if (calls.length === 0) {
        throw new Error("modal_backdrop_not_rendered");
    }
    return calls[calls.length - 1];
};

const latestRootProps = (): ModalRootPropsSnapshot => {
    const calls = modalSpy.mock.calls
        .map((call) => call[0] as { type?: string } & ModalRootPropsSnapshot)
        .filter((call) => call.type === "root");
    if (calls.length === 0) {
        throw new Error("modal_root_not_rendered");
    }
    return calls[calls.length - 1];
};

const latestSlotProps = (slot: "container" | "dialog"): ModalSlotPropsSnapshot => {
    const calls = modalSpy.mock.calls
        .map((call) => call[0] as { type?: string } & ModalSlotPropsSnapshot)
        .filter((call) => call.type === slot);
    if (calls.length === 0) {
        throw new Error(`modal_${slot}_not_rendered`);
    }
    return calls[calls.length - 1];
};

const renderModal = (props?: Partial<React.ComponentProps<typeof ModalEx>>) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const modalProps: React.ComponentProps<typeof ModalEx> = {
        open: true,
        onClose: vi.fn(),
        title: "Test modal",
        children: React.createElement("div", null, "Body"),
        ...props,
    };
    root.render(React.createElement(ModalEx, modalProps));
    return {
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("ModalEx overlay dismissal", () => {
    beforeEach(() => {
        modalSpy.mockReset();
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("does not allow overlay dismissal by default", async () => {
        const onClose = vi.fn();
        const mounted = renderModal({ onClose });
        try {
            await waitForCondition(() => modalSpy.mock.calls.length > 0);
            expect(latestBackdropProps().isDismissable).toBe(false);

            latestRootProps().onOpenChange?.(false);

            expect(onClose).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });

    it("supports explicit overlay dismissal when opted in", async () => {
        const onClose = vi.fn();
        const mounted = renderModal({
            onClose,
            allowOverlayDismiss: true,
        });
        try {
            await waitForCondition(() => modalSpy.mock.calls.length > 0);
            expect(latestBackdropProps().isDismissable).toBe(true);

            latestRootProps().onOpenChange?.(false);

            expect(onClose).toHaveBeenCalledTimes(1);
        } finally {
            mounted.cleanup();
        }
    });

    it("applies the surface class to the dialog instead of the container", async () => {
        const mounted = renderModal({
            primaryAction: {
                label: "Confirm",
                onPress: vi.fn(),
            },
        });
        try {
            await waitForCondition(() => modalSpy.mock.calls.length > 0);
            expect(latestSlotProps("container").className).toBe(
                "fixed inset-0 flex w-screen h-screen items-center justify-center",
            );
            expect(latestSlotProps("container").scroll).toBe("outside");
            expect(latestSlotProps("dialog").className).toBe("modal-base");

            const dialog = document.querySelector('[data-slot="dialog"]');
            const contentWrapper = dialog?.firstElementChild;
            expect(contentWrapper?.className).toBe("content-wrapper");
            expect(contentWrapper?.children[0]?.getAttribute("data-slot")).toBe("header");
            expect(contentWrapper?.children[1]?.getAttribute("data-slot")).toBe("body");
            expect(contentWrapper?.children[2]?.getAttribute("data-slot")).toBe("footer");
        } finally {
            mounted.cleanup();
        }
    });
});
