import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { BufferedInput } from "@/modules/settings/components/BufferedInput";

vi.mock("@heroui/react", () => ({
    Input: ({
        value,
        onChange,
        onBlur,
        onKeyDown,
        ...props
    }: React.InputHTMLAttributes<HTMLInputElement>) =>
        React.createElement("input", {
            ...props,
            value,
            onInput: onChange,
            onChange,
            onBlur,
            onKeyDown,
        }),
}));

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

const mountInput = ({
    value = "123",
    onValueChange,
    onCommit,
    onRevert,
}: {
    value?: string;
    onValueChange?: (next: string) => void;
    onCommit: (next: string) => void;
    onRevert?: () => void;
}) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(
        React.createElement(BufferedInput, {
            value,
            onValueChange: onValueChange ?? vi.fn(),
            onCommit,
            onRevert,
            "aria-label": "Buffered input",
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

describe("BufferedInput", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("emits draft changes through onValueChange", async () => {
        const onValueChange = vi.fn();
        const mounted = mountInput({
            onValueChange,
            onCommit: vi.fn(),
        });
        try {
            await waitForCondition(
                () =>
                    mounted.container.querySelector("input") instanceof
                    HTMLInputElement,
            );
            const input = mounted.container.querySelector("input");
            if (!(input instanceof HTMLInputElement)) {
                throw new Error("input_missing");
            }

            input.value = "456";
            input.dispatchEvent(new Event("input", { bubbles: true }));

            expect(onValueChange).toHaveBeenCalledWith("456");
        } finally {
            mounted.cleanup();
        }
    });

    it("commits the current prop value on blur", async () => {
        const onCommit = vi.fn();
        const mounted = mountInput({ onCommit });
        try {
            await waitForCondition(
                () =>
                    mounted.container.querySelector("input") instanceof
                    HTMLInputElement,
            );
            const input = mounted.container.querySelector("input");
            if (!(input instanceof HTMLInputElement)) {
                throw new Error("input_missing");
            }

            input.focus();
            input.blur();

            expect(onCommit).toHaveBeenCalledWith("123");
        } finally {
            mounted.cleanup();
        }
    });

    it("commits the current prop value on Enter", async () => {
        const onCommit = vi.fn();
        const mounted = mountInput({ onCommit });
        try {
            await waitForCondition(
                () =>
                    mounted.container.querySelector("input") instanceof
                    HTMLInputElement,
            );
            const input = mounted.container.querySelector("input");
            if (!(input instanceof HTMLInputElement)) {
                throw new Error("input_missing");
            }

            input.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                }),
            );

            expect(onCommit).toHaveBeenCalledWith("123");
        } finally {
            mounted.cleanup();
        }
    });

    it("reverts on Escape without committing the stale draft on blur", async () => {
        const onCommit = vi.fn();
        const onRevert = vi.fn();
        const mounted = mountInput({ onCommit, onRevert });
        try {
            await waitForCondition(
                () =>
                    mounted.container.querySelector("input") instanceof
                    HTMLInputElement,
            );
            const input = mounted.container.querySelector("input");
            if (!(input instanceof HTMLInputElement)) {
                throw new Error("input_missing");
            }

            input.focus();
            input.value = "999";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Escape",
                    bubbles: true,
                    cancelable: true,
                }),
            );

            expect(onRevert).toHaveBeenCalledTimes(1);
            expect(onCommit).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });
});
