import React, { useRef } from "react";
import { DropdownPopover } from "@heroui/react";

type ContextMenuAnchorRect = {
    top: number;
    left: number;
};

export interface TorrentTableContextMenuSurfaceProps {
    anchorRect: ContextMenuAnchorRect | null;
    className?: string;
    onClose: () => void;
    children?: React.ReactNode;
}

export default function TorrentTable_ContextMenuSurface({
    anchorRect,
    className,
    onClose,
    children,
}: TorrentTableContextMenuSurfaceProps) {
    const triggerRef = useRef<HTMLDivElement | null>(null);

    if (!anchorRect) {
        return null;
    }

    return (
        <>
            <div
                ref={triggerRef}
                aria-hidden="true"
                data-context-menu-anchor="true"
                style={{
                    position: "fixed",
                    top: anchorRect.top,
                    left: anchorRect.left,
                    width: 1,
                    height: 1,
                    pointerEvents: "none",
                }}
            />
            <DropdownPopover
                triggerRef={triggerRef}
                isOpen
                offset={0}
                placement="bottom start"
                className={className}
                onOpenChange={(isOpen) => {
                    if (!isOpen) {
                        onClose();
                    }
                }}
            >
                {children}
            </DropdownPopover>
        </>
    );
}
