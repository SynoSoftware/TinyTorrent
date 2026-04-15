import { act, createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registry } from "@/config/logic";
import AppTooltip from "@/shared/ui/components/AppTooltip";

vi.mock("@heroui/react", async () => {
    const actual = await vi.importActual<typeof import("@heroui/react")>(
        "@heroui/react",
    );

    return {
        ...actual,
        Tooltip: Object.assign(
            ({
                children,
                isDisabled,
                delay,
                closeDelay,
            }: {
                children: React.ReactNode;
                isDisabled?: boolean;
                delay?: number;
                closeDelay?: number;
            }) =>
                createElement(
                    "div",
                    {
                        "data-testid": "tooltip",
                        "data-disabled": String(Boolean(isDisabled)),
                        "data-delay": String(delay ?? ""),
                        "data-close-delay": String(closeDelay ?? ""),
                    },
                    children,
                ),
            {
                Trigger: ({
                    children,
                    className,
                }: {
                    children?: React.ReactNode;
                    className?: string;
                }) =>
                    createElement(
                        "div",
                        {
                            "data-testid": "tooltip-trigger",
                            "data-class": className ?? "",
                        },
                        children,
                    ),
                Content: ({
                    children,
                    className,
                    placement,
                }: {
                    children?: React.ReactNode;
                    className?: string;
                    placement?: string;
                }) =>
                    createElement(
                        "div",
                        {
                            "data-testid": "tooltip-content",
                            "data-class": className ?? "",
                            "data-placement": placement ?? "",
                        },
                        children,
                    ),
                Arrow: ({
                    className,
                }: {
                    className?: string;
                }) =>
                    createElement("div", {
                        "data-testid": "tooltip-arrow",
                        "data-class": className ?? "",
                    }),
            },
        ),
    };
});

describe("AppTooltip", () => {
    const { ui } = registry;
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        root.unmount();
        container.remove();
        document.body.innerHTML = "";
        vi.useRealTimers();
    });

    it("uses click-through classes and longer defaults on dense surfaces", () => {
        flushSync(() => {
            root.render(
                createElement(
                    AppTooltip,
                    { content: "tip", dense: true },
                    createElement("button", { type: "button" }, "trigger"),
                ),
            );
        });

        const tooltip = container.querySelector("[data-testid='tooltip']");
        expect(tooltip?.getAttribute("data-delay")).toBe(
            String(ui.tooltip.denseDelayMs),
        );
        expect(tooltip?.getAttribute("data-close-delay")).toBe(
            String(ui.tooltip.closeDelayMs),
        );
        expect(
            container
                .querySelector("[data-testid='tooltip-trigger']")
                ?.getAttribute("data-class"),
        ).toContain(
            "pointer-events-none",
        );
        expect(
            container
                .querySelector("[data-testid='tooltip-content']")
                ?.getAttribute("data-class"),
        ).toContain(
            "pointer-events-none",
        );
        expect(
            container
                .querySelector("[data-testid='tooltip-arrow']")
                ?.getAttribute("data-class"),
        ).toContain(
            "pointer-events-none",
        );
    });

    it("suppresses dense tooltips during scroll interaction", () => {
        flushSync(() => {
            root.render(
                createElement(
                    AppTooltip,
                    { content: "tip", dense: true },
                    createElement("button", { type: "button" }, "trigger"),
                ),
            );
        });

        const readDisabled = () =>
            container
                .querySelector("[data-testid='tooltip']")
                ?.getAttribute("data-disabled");

        expect(readDisabled()).toBe("false");

        flushSync(() => {
            window.dispatchEvent(new Event("wheel"));
        });

        expect(readDisabled()).toBe("true");

        flushSync(() => {
            vi.advanceTimersByTime(ui.tooltip.scrollSuppressionMs + 1);
        });

        expect(readDisabled()).toBe("false");
    });

    it("does not suppress standard tooltips during scroll interaction", () => {
        flushSync(() => {
            root.render(
                createElement(
                    AppTooltip,
                    { content: "tip" },
                    createElement("button", { type: "button" }, "trigger"),
                ),
            );
        });

        const readDisabled = () =>
            container
                .querySelector("[data-testid='tooltip']")
                ?.getAttribute("data-disabled");

        flushSync(() => {
            window.dispatchEvent(new Event("wheel"));
        });

        expect(readDisabled()).toBe("false");
    });

    it("suppresses dense tooltips while a menu is open", async () => {
        flushSync(() => {
            root.render(
                createElement(
                    AppTooltip,
                    { content: "tip", dense: true },
                    createElement("button", { type: "button" }, "trigger"),
                ),
            );
        });

        const menu = document.createElement("div");
        menu.setAttribute("role", "menu");

        await act(async () => {
            document.body.appendChild(menu);
            await Promise.resolve();
        });

        expect(
            container
                .querySelector("[data-testid='tooltip']")
                ?.getAttribute("data-disabled"),
        ).toBe("true");

        await act(async () => {
            menu.remove();
            await Promise.resolve();
        });

        expect(
            container
                .querySelector("[data-testid='tooltip']")
                ?.getAttribute("data-disabled"),
        ).toBe("false");
    });

    it("clears pending suppression when operational policy turns off", async () => {
        const readDisabled = () =>
            container
                .querySelector("[data-testid='tooltip']")
                ?.getAttribute("data-disabled");

        await act(async () => {
            root.render(
                createElement(
                    AppTooltip,
                    { content: "tip", dense: true },
                    createElement("button", { type: "button" }, "trigger"),
                ),
            );
        });

        flushSync(() => {
            window.dispatchEvent(new Event("wheel"));
        });

        expect(readDisabled()).toBe("true");

        await act(async () => {
            root.render(
                createElement(
                    AppTooltip,
                    { content: "tip", dense: false },
                    createElement("button", { type: "button" }, "trigger"),
                ),
            );
            await Promise.resolve();
        });

        expect(readDisabled()).toBe("false");

        flushSync(() => {
            vi.advanceTimersByTime(ui.tooltip.scrollSuppressionMs + 1);
        });

        expect(readDisabled()).toBe("false");
    });
});
