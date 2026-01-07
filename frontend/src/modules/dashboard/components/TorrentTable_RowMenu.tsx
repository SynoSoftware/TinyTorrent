import React from "react";
import { AnimatePresence } from "framer-motion";
import {
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem,
    Checkbox,
    cn,
} from "@heroui/react";
import { GLASS_MENU_SURFACE } from "@/shared/ui/layout/glass-surface";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { ItemElement } from "@react-types/shared";

type QueueMenuAction = { key: string; label: string };

export default function TorrentTable_RowMenu({
    contextMenu,
    onClose,
    handleContextMenuAction,
    queueMenuActions,
    getContextMenuShortcut,
    t,
}: {
    contextMenu: { virtualElement: any; torrent: Torrent } | null;
    onClose: () => void;
    handleContextMenuAction: (key?: string) => Promise<void>;
    queueMenuActions: QueueMenuAction[];
    getContextMenuShortcut: (key: string) => string | undefined;
    t: (k: string, opts?: any) => string;
}) {
    if (!contextMenu) return null;
    const rect = contextMenu.virtualElement.getBoundingClientRect();
    return (
        <AnimatePresence>
            <Dropdown
                isOpen
                onClose={onClose}
                placement="bottom-start"
                shouldFlip
            >
                <DropdownTrigger>
                    <div
                        style={{
                            position: "fixed",
                            top: rect.top,
                            left: rect.left,
                            width: 0,
                            height: 0,
                        }}
                    />
                </DropdownTrigger>
                <DropdownMenu
                    variant="shadow"
                    className={GLASS_MENU_SURFACE}
                    onAction={(key) => {
                        void handleContextMenuAction(key as string);
                    }}
                >
                    <DropdownItem
                        key="pause"
                        shortcut={getContextMenuShortcut("pause")}
                    >
                        {t("table.actions.pause")}
                    </DropdownItem>
                    <DropdownItem
                        key="resume"
                        shortcut={getContextMenuShortcut("resume")}
                    >
                        {t("table.actions.resume")}
                    </DropdownItem>
                    <DropdownItem
                        key="recheck"
                        shortcut={getContextMenuShortcut("recheck")}
                    >
                        {t("table.actions.recheck")}
                    </DropdownItem>
                    <DropdownItem
                        key="queue-title"
                        isDisabled
                        className="border-t border-content1/20 mt-tight pt-(--p-tight) px-panel text-scaled font-bold uppercase text-foreground/50"
                        style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
                    >
                        {t("table.queue.title")}
                    </DropdownItem>
                    {
                        (
                            <>
                                {queueMenuActions.map((action) => (
                                    <DropdownItem
                                        key={action.key}
                                        className="pl-stage text-sm"
                                        shortcut={getContextMenuShortcut(
                                            action.key as string
                                        )}
                                    >
                                        {action.label}
                                    </DropdownItem>
                                ))}
                            </>
                        ) as unknown as any
                    }
                    <DropdownItem
                        key="data-title"
                        isDisabled
                        className="border-t border-content1/20 mt-tight pt-(--p-tight) px-panel text-scaled font-bold uppercase text-foreground/50"
                        style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
                    >
                        {t("table.data.title")}
                    </DropdownItem>
                    <DropdownItem
                        key="copy-hash"
                        shortcut={getContextMenuShortcut("copy-hash")}
                    >
                        {t("table.actions.copy_hash")}
                    </DropdownItem>
                    <DropdownItem
                        key="copy-magnet"
                        shortcut={getContextMenuShortcut("copy-magnet")}
                    >
                        {t("table.actions.copy_magnet")}
                    </DropdownItem>
                    <DropdownItem key="cols" showDivider>
                        {t("table.column_picker_title")}
                    </DropdownItem>
                </DropdownMenu>
            </Dropdown>
        </AnimatePresence>
    );
}
