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
    Modal: ({
        children,
        ...props
    }: {
        children?: React.ReactNode;
        [key: string]: unknown;
    }) => {
        modalSpy(props);
        return React.createElement("div", null, children);
    },
    ModalBody: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("div", null, children),
    ModalContent: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("div", null, children),
    ModalFooter: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("div", null, children),
    ModalHeader: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("div", null, children),
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
    MODAL: {
        compactClassNames: {},
        baseClassNames: {},
        dialogFooter: "dialog-footer",
        footerEnd: "footer-end",
        dialogBody: "dialog-body",
        dialogBodyFlush: "dialog-body-flush",
        dialogFooterGroup: "dialog-footer-group",
        dialogHeader: "dialog-header",
        dialogHeaderLead: "dialog-header-lead",
        headerLeadPrimaryIcon: "header-icon",
        headerTitleWrap: "header-title-wrap",
    },
}));

type ModalPropsSnapshot = {
    isDismissable?: boolean;
    onOpenChange?: (open: boolean) => void;
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

const latestModalProps = (): ModalPropsSnapshot => {
    const calls = modalSpy.mock.calls;
    if (calls.length === 0) {
        throw new Error("modal_not_rendered");
    }
    return calls[calls.length - 1][0] as ModalPropsSnapshot;
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
            const modalProps = latestModalProps();
            expect(modalProps.isDismissable).toBe(false);

            modalProps.onOpenChange?.(false);

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
            const modalProps = latestModalProps();
            expect(modalProps.isDismissable).toBe(true);

            modalProps.onOpenChange?.(false);

            expect(onClose).toHaveBeenCalledTimes(1);
        } finally {
            mounted.cleanup();
        }
    });
});
