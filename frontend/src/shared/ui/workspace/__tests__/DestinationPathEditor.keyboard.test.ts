import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { DestinationPathEditor } from "@/shared/ui/workspace/DestinationPathEditor";

vi.mock("framer-motion", () => ({
    motion: {
        div: ({
            children,
            ...props
        }: React.HTMLAttributes<HTMLDivElement>) => React.createElement("div", props, children),
    },
}));

vi.mock("@heroui/react", () => {
    const ReactLocal = React;
    const ComboBoxContext = ReactLocal.createContext<{
        inputValue: string;
        onInputChange?: (value: string) => void;
        onSelectionChange?: (selection: string | null) => void;
        setOpen: (open: boolean) => void;
        isOpen: boolean;
    } | null>(null);

    type MockInputProps = {
        id: string;
        placeholder?: string;
        onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
        onBlur?: () => void;
    };

    const Input = ({
        id,
        placeholder,
        onKeyDown,
        onBlur,
    }: MockInputProps) =>
        ReactLocal.createElement(() => {
            const comboBox = ReactLocal.useContext(ComboBoxContext);
            if (!comboBox) {
                throw new Error("combobox_context_missing");
            }
            return ReactLocal.createElement("input", {
                id,
                value: comboBox.inputValue,
                placeholder,
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                    comboBox.onInputChange?.(event.target.value);
                    comboBox.setOpen(true);
                },
                onKeyDown,
                onBlur,
            });
        });

    const ComboBox = ({
        children,
        inputValue,
        onInputChange,
        onSelectionChange,
        onOpenChange,
    }: {
        children: React.ReactNode;
        inputValue: string;
        onInputChange?: (value: string) => void;
        onSelectionChange?: (selection: string | null) => void;
        onOpenChange?: (open: boolean) => void;
    }) => {
        const [isOpen, setIsOpenState] = ReactLocal.useState(false);
        const setOpen = ReactLocal.useCallback((open: boolean) => {
            setIsOpenState(open);
            onOpenChange?.(open);
        }, [onOpenChange]);
        return ReactLocal.createElement(
            ComboBoxContext.Provider,
            {
                value: {
                    inputValue,
                    onInputChange,
                    onSelectionChange,
                    setOpen,
                    isOpen,
                },
            },
            children,
        );
    };
    ComboBox.InputGroup = ({ children, className }: { children: React.ReactNode; className?: string }) =>
        ReactLocal.createElement("div", { className }, children);
    ComboBox.Trigger = ({
        children,
        onPress,
    }: {
        children?: React.ReactNode;
        onPress?: () => void;
    }) =>
        ReactLocal.createElement(() => {
            const comboBox = ReactLocal.useContext(ComboBoxContext);
            if (!comboBox) {
                throw new Error("combobox_context_missing");
            }
            return ReactLocal.createElement(
                "button",
                {
                    type: "button",
                    "aria-label": "toggle suggestions",
                    onClick: () => {
                        comboBox.setOpen(!comboBox.isOpen);
                        onPress?.();
                    },
                },
                children ?? "toggle",
            );
        });
    ComboBox.Popover = ({ children }: { children: React.ReactNode }) =>
        ReactLocal.createElement(() => {
            const comboBox = ReactLocal.useContext(ComboBoxContext);
            if (!comboBox?.isOpen) {
                return null;
            }
            return ReactLocal.createElement("div", null, children);
        });

    const ListBox = ({ children }: { children: React.ReactNode }) =>
        ReactLocal.createElement("div", null, children);
    ListBox.Item = ({
        children,
        id,
    }: {
        children: React.ReactNode;
        id: string;
    }) =>
        ReactLocal.createElement(() => {
            const comboBox = ReactLocal.useContext(ComboBoxContext);
            if (!comboBox) {
                throw new Error("combobox_context_missing");
            }
            return ReactLocal.createElement(
                "button",
                {
                    type: "button",
                    onClick: () => {
                        comboBox.onSelectionChange?.(id);
                        comboBox.setOpen(false);
                    },
                },
                children,
            );
        });
    ListBox.ItemIndicator = () => null;

    return {
        ComboBox,
        Input,
        ListBox,
        useFilter: () => ({
            contains: (text: string, inputValue: string) =>
                text.toLocaleLowerCase().includes(inputValue.toLocaleLowerCase()),
        }),
        Button: ({
            children,
            onPress,
        }: {
            children: React.ReactNode;
            onPress?: () => void;
        }) =>
            ReactLocal.createElement(
                "button",
                {
                    type: "button",
                    onClick: () => onPress?.(),
                },
                children,
            ),
        Tooltip: ({ children }: { children: React.ReactNode }) =>
            ReactLocal.createElement(ReactLocal.Fragment, null, children),
    };
});

vi.mock("@/shared/ui/workspace/DiskSpaceGauge", () => ({
    DiskSpaceGauge: () => null,
}));

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

function Harness({
    onEnter,
}: {
    onEnter: () => void;
}) {
    const [value, setValue] = useState("C:\\Downloads");

    return React.createElement(DestinationPathEditor, {
        id: "destination-path",
        value,
        history: ["C:\\Downloads"],
        ariaLabel: "Destination",
        placeholder: "Enter path",
        onValueChange: setValue,
        onEnter,
        label: "Path",
    });
}

const mountHarness = (onEnter: () => void) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(React.createElement(Harness, { onEnter }));
    return {
        container,
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("DestinationPathEditor keyboard handling", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("does not submit while suggestions are open", async () => {
        const onEnter = vi.fn();
        const mounted = mountHarness(onEnter);
        try {
            await waitForCondition(() => mounted.container.querySelector("input") instanceof HTMLInputElement);
            const input = mounted.container.querySelector("input");
            if (!(input instanceof HTMLInputElement)) {
                throw new Error("input_missing");
            }
            const toggleButton = Array.from(mounted.container.querySelectorAll("button")).find(
                (button) => button.getAttribute("aria-label") === "toggle suggestions",
            );
            if (!(toggleButton instanceof HTMLButtonElement)) {
                throw new Error("toggle_button_missing");
            }

            toggleButton.click();
            await waitForCondition(
                () =>
                    Array.from(mounted.container.querySelectorAll("button")).some(
                        (button) => button.textContent?.includes("C:\\Downloads"),
                    ),
            );

            const activeInput = mounted.container.querySelector("input");
            if (!(activeInput instanceof HTMLInputElement)) {
                throw new Error("input_missing_after_selection");
            }
            activeInput.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                }),
            );

            expect(onEnter).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });

    it("submits after the suggestion list has been closed by selection", async () => {
        const onEnter = vi.fn();
        const mounted = mountHarness(onEnter);
        try {
            await waitForCondition(() => mounted.container.querySelector("input") instanceof HTMLInputElement);
            const input = mounted.container.querySelector("input");
            if (!(input instanceof HTMLInputElement)) {
                throw new Error("input_missing");
            }
            const toggleButton = Array.from(mounted.container.querySelectorAll("button")).find(
                (button) => button.getAttribute("aria-label") === "toggle suggestions",
            );
            if (!(toggleButton instanceof HTMLButtonElement)) {
                throw new Error("toggle_button_missing");
            }

            toggleButton.click();
            await waitForCondition(
                () =>
                    Array.from(mounted.container.querySelectorAll("button")).some(
                        (button) => button.textContent?.includes("C:\\Downloads"),
                    ),
            );
            const selectionButton = Array.from(
                mounted.container.querySelectorAll("button"),
            ).find((button) => button.textContent?.includes("C:\\Downloads"));
            if (!(selectionButton instanceof HTMLButtonElement)) {
                throw new Error("selection_button_missing");
            }

            selectionButton.click();
            await waitForCondition(
                () =>
                    !Array.from(mounted.container.querySelectorAll("button")).some(
                        (button) => button.textContent?.includes("C:\\Downloads"),
                    ),
            );
            input.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                }),
            );

            expect(onEnter).toHaveBeenCalledTimes(1);
        } finally {
            mounted.cleanup();
        }
    });
});
