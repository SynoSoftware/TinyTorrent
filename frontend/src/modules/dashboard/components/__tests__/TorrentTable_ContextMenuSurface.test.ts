import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import TorrentTable_ContextMenuSurface from "@/modules/dashboard/components/TorrentTable_ContextMenuSurface";

const dropdownPopoverPropsSpy = vi.hoisted(() => vi.fn());

vi.mock("@heroui/react", () => ({
    DropdownPopover: ({
        children,
        ...props
    }: {
        children?: React.ReactNode;
        [key: string]: unknown;
    }) => {
        dropdownPopoverPropsSpy(props);
        return React.createElement("div", null, children);
    },
}));

describe("TorrentTable_ContextMenuSurface", () => {
    afterEach(() => {
        dropdownPopoverPropsSpy.mockReset();
        document.body.innerHTML = "";
    });

    it("anchors the popover to the provided cursor position", async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        await act(async () => {
            root.render(
                React.createElement(
                    TorrentTable_ContextMenuSurface,
                    {
                        anchorRect: { top: 12, left: 34 },
                        onClose: vi.fn(),
                        className: "menu-surface",
                    },
                    React.createElement("div", null, "menu"),
                ),
            );
        });

        const anchor = container.querySelector('[data-context-menu-anchor="true"]');
        if (!(anchor instanceof HTMLDivElement)) {
            throw new Error("context_menu_anchor_missing");
        }

        expect(anchor.style.position).toBe("fixed");
        expect(anchor.style.top).toBe("12px");
        expect(anchor.style.left).toBe("34px");
        expect(dropdownPopoverPropsSpy).toHaveBeenCalled();

        root.unmount();
        container.remove();
    });
});
