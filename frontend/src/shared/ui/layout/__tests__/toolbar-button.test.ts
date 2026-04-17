import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Search } from "lucide-react";

vi.mock("@heroui/react", () => ({
    Button: ({
        children,
        className,
        isDisabled,
        isIconOnly,
        onClick,
        onPress,
        variant,
        ...props
    }: {
        children?: React.ReactNode;
        className?: string;
        isDisabled?: boolean;
        isIconOnly?: boolean;
        onClick?: () => void;
        onPress?: () => void;
        variant?: string;
        [key: string]: unknown;
    }) =>
        React.createElement(
            "button",
            {
                ...props,
                className,
                disabled: isDisabled,
                onClick: onClick ?? onPress,
                type: "button",
            },
            children,
        ),
    cn: (...values: Array<string | false | null | undefined>) =>
        values.filter(Boolean).join(" "),
}));

vi.mock("@/shared/ui/components/AppTooltip", () => ({
    default: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
}));

import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { WindowControlButton } from "@/shared/ui/layout/window-control-button";

describe("toolbar button chrome", () => {
    it("keeps toolbar icon buttons rounded", () => {
        const markup = renderToStaticMarkup(
            React.createElement(ToolbarIconButton, {
                ariaLabel: "Search",
                Icon: Search,
            }),
        );

        expect(markup).toContain("rounded-full");
    });

    it("keeps window control buttons square", () => {
        const markup = renderToStaticMarkup(
            React.createElement(WindowControlButton, {
                ariaLabel: "Close",
                Icon: Search,
            }),
        );

        expect(markup).toContain("rounded-none");
    });
});
