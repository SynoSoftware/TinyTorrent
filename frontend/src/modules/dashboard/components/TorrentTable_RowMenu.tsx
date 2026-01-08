import React from "react";
import { AnimatePresence } from "framer-motion";
import {
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem,
    DropdownSection,
    Checkbox,
    cn,
} from "@heroui/react";
import { GLASS_MENU_SURFACE } from "@/shared/ui/layout/glass-surface";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { ItemElement } from "@react-types/shared";
import type { ContextMenuVirtualElement } from "@/shared/hooks/ui/useContextMenuPosition";

type QueueMenuAction = { key: string; label: string };

export default function TorrentTable_RowMenu({
    contextMenu,
    onClose,
    handleContextMenuAction,
    queueMenuActions,
    getContextMenuShortcut,
    t,
    onOpenFolder,
    onSetLocation,
    isClipboardSupported,
    getEmphasisClassForAction,
}: {
    contextMenu: {
        virtualElement: ContextMenuVirtualElement;
        torrent: Torrent;
    } | null;
    onClose: () => void;
    handleContextMenuAction: (key?: string) => Promise<void>;
    queueMenuActions: QueueMenuAction[];
    getContextMenuShortcut: (key: string) => string | undefined;
    t: (k: string, opts?: Record<string, unknown>) => string;
    onOpenFolder?: (t: Torrent) => Promise<void>;
    onSetLocation?: (t: Torrent) => Promise<void> | void;
    isClipboardSupported?: boolean;
    getEmphasisClassForAction?: (a?: string) => string;
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
                    <DropdownSection
                        key="queue-section"
                        title={t("table.queue.title")}
                    >
                        {queueMenuActions.map((action) => (
                            <DropdownItem
                                key={action.key}
                                className="pl-stage text-sm"
                                shortcut={getContextMenuShortcut(action.key)}
                            >
                                {action.label}
                            </DropdownItem>
                        ))}
                    </DropdownSection>
                    <DropdownItem
                        key="data-title"
                        isDisabled
                        className="border-t border-content1/20 mt-tight pt-(--p-tight) px-panel text-scaled font-bold uppercase text-foreground/50"
                        style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
                    >
                        {t("table.data.title")}
                    </DropdownItem>
                    <DropdownItem
                        key="open-folder"
                        isDisabled={
                            !onOpenFolder || !contextMenu?.torrent.savePath
                        }
                        className={cn(
                            contextMenu?.torrent.errorEnvelope
                                ?.primaryAction === "openFolder"
                                ? getEmphasisClassForAction?.(
                                      contextMenu?.torrent.errorEnvelope
                                          ?.primaryAction
                                  )
                                : ""
                        )}
                    >
                        {t("table.actions.open_folder")}
                    </DropdownItem>
                    <DropdownItem
                        key="set-download-path"
                        isDisabled={!onSetLocation}
                        className={cn(
                            contextMenu?.torrent.errorEnvelope
                                ?.primaryAction === "setLocation"
                                ? getEmphasisClassForAction?.(
                                      contextMenu?.torrent.errorEnvelope
                                          ?.primaryAction
                                  )
                                : ""
                        )}
                    >
                        {t("table.actions.set_download_path")}
                    </DropdownItem>
                    <DropdownItem
                        key="copy-hash"
                        isDisabled={isClipboardSupported === false}
                        shortcut={getContextMenuShortcut("copy-hash")}
                    >
                        {t("table.actions.copy_hash")}
                    </DropdownItem>
                    <DropdownItem
                        key="copy-magnet"
                        isDisabled={isClipboardSupported === false}
                        shortcut={getContextMenuShortcut("copy-magnet")}
                    >
                        {t("table.actions.copy_magnet")}
                    </DropdownItem>
                    <DropdownItem
                        key="remove"
                        color="danger"
                        shortcut={getContextMenuShortcut("remove")}
                    >
                        {t("table.actions.remove")}
                    </DropdownItem>
                    <DropdownItem
                        key="remove-with-data"
                        color="danger"
                        shortcut={getContextMenuShortcut("remove-with-data")}
                    >
                        {t("table.actions.remove_with_data")}
                    </DropdownItem>
                    <DropdownItem key="cols" showDivider>
                        {t("table.column_picker_title")}
                    </DropdownItem>
                </DropdownMenu>
            </Dropdown>
        </AnimatePresence>
    );
}
