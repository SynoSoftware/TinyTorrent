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

    type MockAutocompleteProps = {
        id: string;
        inputValue: string;
        items: Array<{ key: string; label: string }>;
        placeholder?: string;
        isDisabled?: boolean;
        onInputChange?: (value: string) => void;
        onSelectionChange?: (selection: string | null) => void;
        onOpenChange?: (open: boolean) => void;
        onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    };

    const Autocomplete = ({
        id,
        inputValue,
        items,
        placeholder,
        isDisabled,
        onInputChange,
        onSelectionChange,
        onOpenChange,
        onKeyDown,
    }: MockAutocompleteProps) => {
        const [isOpen, setIsOpen] = ReactLocal.useState(items.length > 0);
        const [closedBySelection, setClosedBySelection] = ReactLocal.useState(false);

        ReactLocal.useEffect(() => {
            const nextOpen = items.length > 0 && !closedBySelection;
            setIsOpen(nextOpen);
            onOpenChange?.(nextOpen);
        }, [closedBySelection, items, onOpenChange]);
        return ReactLocal.createElement(
            "div",
            null,
            ReactLocal.createElement("input", {
                id,
                value: inputValue,
                placeholder,
                disabled: isDisabled,
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                    setClosedBySelection(false);
                    onInputChange?.(event.target.value);
                },
                onKeyDown,
            }),
            isOpen ? items.map((item) =>
                ReactLocal.createElement(
                    "button",
                    {
                        key: item.key,
                        type: "button",
                        onClick: () => {
                            setClosedBySelection(true);
                            setIsOpen(false);
                            onOpenChange?.(false);
                            onSelectionChange?.(item.key);
                        },
                    },
                    item.label,
                ),
            ) : null,
        );
    };

    return {
        Autocomplete,
        AutocompleteItem: ({ children }: { children: React.ReactNode }) =>
            ReactLocal.createElement(ReactLocal.Fragment, null, children),
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

            input.dispatchEvent(
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
            await waitForCondition(
                () => mounted.container.querySelectorAll("button").length > 0,
            );
            const selectionButton = Array.from(
                mounted.container.querySelectorAll("button"),
            ).find((button) => button.textContent === "C:\\Downloads");
            if (!(selectionButton instanceof HTMLButtonElement)) {
                throw new Error("selection_button_missing");
            }

            selectionButton.click();
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 0);
            });
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
