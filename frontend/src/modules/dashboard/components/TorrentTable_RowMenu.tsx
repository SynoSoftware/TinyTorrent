import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem,
    cn,
} from "@heroui/react";
import type { CollectionChildren } from "@react-types/shared";
import { GLASS_MENU_SURFACE } from "@/shared/ui/layout/glass-surface";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { ContextMenuVirtualElement } from "@/shared/hooks/ui/useContextMenuPosition";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { SetLocationInlineEditor } from "@/modules/dashboard/components/SetLocationInlineEditor";
import { getSurfaceCaptionKey } from "@/app/utils/setLocation";
import { useResolvedRecoveryClassification } from "@/modules/dashboard/hooks/useResolvedRecoveryClassification";

type RowMenuAction = {
    key: string;
    label: string;
    shortcut?: string;
    disabled?: boolean;
};

const getTorrentKey = (
    entry?: { id?: string | number; hash?: string } | null
) => entry?.id?.toString() ?? entry?.hash ?? "";

type QueueMenuAction = { key: string; label: string };

interface RowMenuViewModel {
    actions: RowMenuAction[];
    queueActions: QueueMenuAction[];
    dataTitle: string;
    showOpenFolder: boolean;
    openFolderDisabled: boolean;
    inlineEditor: {
        visible: boolean;
        caption: string;
        statusMessage?: string;
        isBusy: boolean;
    };
}

export default function TorrentTable_RowMenu({
    contextMenu,
    onClose,
    handleContextMenuAction,
    queueMenuActions,
    getContextMenuShortcut,
    t,
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
    isClipboardSupported?: boolean;
    getEmphasisClassForAction?: (a?: string) => string;
}) {
    return (
        <AnimatePresence>
            {contextMenu ? (
                <TorrentTable_RowMenuInner
                    contextMenu={contextMenu}
                    onClose={onClose}
                    handleContextMenuAction={handleContextMenuAction}
                    queueMenuActions={queueMenuActions}
                    getContextMenuShortcut={getContextMenuShortcut}
                    t={t}
                    isClipboardSupported={isClipboardSupported}
                    getEmphasisClassForAction={getEmphasisClassForAction}
                />
            ) : null}
        </AnimatePresence>
    );
}

function TorrentTable_RowMenuInner({
    contextMenu,
    onClose,
    handleContextMenuAction,
    queueMenuActions,
    getContextMenuShortcut,
    t,
    isClipboardSupported,
    getEmphasisClassForAction,
}: {
    contextMenu: {
        virtualElement: ContextMenuVirtualElement;
        torrent: Torrent;
    };
    onClose: () => void;
    handleContextMenuAction: (key?: string) => Promise<void>;
    queueMenuActions: QueueMenuAction[];
    getContextMenuShortcut: (key: string) => string | undefined;
    t: (k: string, opts?: Record<string, unknown>) => string;
    isClipboardSupported?: boolean;
    getEmphasisClassForAction?: (a?: string) => string;
}) {
    // TODO: ViewModel boundary: this component should be a pure View.
    // TODO: Replace this inline prop-bag (translator + callbacks + capability checks) with a single `RowMenuViewModel`:
    // TODO: - `items`: prebuilt menu items with ids/labels/shortcuts/enabled/emphasis
    // TODO: - `setLocation`: { canSetLocation, inlineEditorState, outcomeMessageKey, onOpen, onChange, onSubmit, onCancel }
    // TODO: - `clipboard`: { supported }
    // TODO: This removes local decision logic and prevents regressions when AI edits only one surface.
    const {
        inlineSetLocationState,
        releaseInlineSetLocation,
        confirmInlineSetLocation,
        handleInlineLocationChange,
        setLocationCapability,
        canOpenFolder,
    } = useRecoveryContext();

    const contextTorrent = contextMenu.torrent;
    const torrentKey = getTorrentKey(contextTorrent);
    const shouldShowOpenFolder = Boolean(canOpenFolder);
    const canSetLocation =
        setLocationCapability.canBrowse || setLocationCapability.supportsManual;
    // TODO: Ensure all recovery/set-location actions here route through the single recovery gate/state machine; no local sequencing or ad-hoc handling for “set-download-path” should exist.
    const classification = useResolvedRecoveryClassification(contextTorrent);
    const showUnknownConfidence = classification?.confidence === "unknown";
    const inlineStateKey = inlineSetLocationState?.torrentKey ?? "";
    const currentKey = getTorrentKey(contextTorrent);
    const shouldShowInlineEditor = Boolean(
        inlineSetLocationState?.surface === "context-menu" &&
            inlineStateKey &&
            inlineStateKey === currentKey
    );
    const inlineIsVerifying =
        inlineSetLocationState?.status === "verifying";
    const inlineStatusMessage = inlineIsVerifying
        ? t("recovery.status.applying_location")
        : showUnknownConfidence
        ? t("recovery.inline_fallback")
        : undefined;
    const inlineCaption = t(getSurfaceCaptionKey("context-menu"));
    const inlineIsBusy =
        inlineSetLocationState?.status !== "idle" || inlineIsVerifying;

    // If this menu unmounts (e.g. parent clears `contextMenu`) while an inline edit is open,
    // ensure we release the inline session so it doesn't leak across reopens.
    useEffect(() => {
        return () => {
            if (inlineSetLocationState?.surface === "context-menu") {
                releaseInlineSetLocation();
            }
        };
    }, [inlineSetLocationState?.surface, releaseInlineSetLocation]);

    const rowMenuViewModel = useMemo<RowMenuViewModel>(() => {
        const baseActions: RowMenuAction[] = [
            {
                key: "pause",
                label: t("table.actions.pause"),
                shortcut: getContextMenuShortcut("pause"),
            },
            {
                key: "resume",
                label: t("table.actions.resume"),
                shortcut: getContextMenuShortcut("resume"),
            },
            {
                key: "recheck",
                label: t("table.actions.recheck"),
                shortcut: getContextMenuShortcut("recheck"),
            },
        ];

        return {
            actions: baseActions,
            queueActions: queueMenuActions,
            dataTitle: t("table.data.title"),
            showOpenFolder: shouldShowOpenFolder,
            openFolderDisabled: !(contextTorrent.savePath || contextTorrent.downloadDir),
            inlineEditor: {
                visible: shouldShowInlineEditor,
                caption: inlineCaption,
                statusMessage: inlineStatusMessage,
                isBusy: inlineIsBusy,
            },
        };
    }, [
        t,
        queueMenuActions,
        getContextMenuShortcut,
        shouldShowOpenFolder,
        contextTorrent,
        inlineCaption,
        inlineStatusMessage,
        inlineIsBusy,
        shouldShowInlineEditor,
    ]);

    const handleInlineSubmit = () => {
        void confirmInlineSetLocation().then((success) => {
            if (success) {
                onClose();
            }
        });
    };
    const handleInlineCancel = () => {
        releaseInlineSetLocation();
        onClose();
    };
    const handleMenuClose = () => {
        releaseInlineSetLocation();
        onClose();
    };
    const handleSetDownloadPath = () => {
        if (!canSetLocation) return;
        void handleContextMenuAction("set-download-path");
    };

    const menuItems = useMemo<CollectionChildren<object>>(() => {
        const items: Array<React.ReactElement> = [];

        items.push(
            ...rowMenuViewModel.actions.map((item) => (
                <DropdownItem
                    key={item.key}
                    shortcut={item.shortcut}
                    onPress={() => void handleContextMenuAction(item.key)}
                    isDisabled={item.disabled}
                >
                    {item.label}
                </DropdownItem>
            ))
        );

        items.push(
            <DropdownItem
                key="queue-heading"
                isDisabled
                className="border-t border-content1/20 px-panel pt-panel text-xs uppercase tracking-tight text-foreground/50"
            >
                {rowMenuViewModel.dataTitle}
            </DropdownItem>
        );

        items.push(
            ...rowMenuViewModel.queueActions.map((action) => (
                <DropdownItem
                    key={action.key}
                    className="pl-stage text-sm"
                    shortcut={getContextMenuShortcut(action.key)}
                    onPress={() => void handleContextMenuAction(action.key)}
                >
                    {action.label}
                </DropdownItem>
            ))
        );

        items.push(
            <DropdownItem
                key="data-title"
                isDisabled
                className="border-t border-content1/20 mt-tight pt-tight px-panel text-scaled font-bold uppercase text-foreground/50"
                style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
            >
                {t("table.data.title")}
            </DropdownItem>
        );

        if (rowMenuViewModel.showOpenFolder) {
            items.push(
                <DropdownItem
                    key="open-folder"
                    isDisabled={rowMenuViewModel.openFolderDisabled}
                    className={cn(
                        contextMenu.torrent.errorEnvelope?.primaryAction ===
                            "openFolder"
                            ? getEmphasisClassForAction?.(
                                  contextMenu.torrent.errorEnvelope?.primaryAction
                              )
                            : ""
                    )}
                    onPress={() => void handleContextMenuAction("open-folder")}
                >
                    {t("table.actions.open_folder")}
                </DropdownItem>
            );
        }

        items.push(
            <DropdownItem
                key="set-download-path"
                className={cn(
                    contextMenu.torrent.errorEnvelope?.primaryAction ===
                        "setLocation"
                        ? getEmphasisClassForAction?.(
                              contextMenu.torrent.errorEnvelope?.primaryAction
                          )
                        : ""
                )}
                isDisabled={!canSetLocation}
                onPress={handleSetDownloadPath}
                textValue={t("table.actions.set_download_path")}
            >
                {t("table.actions.set_download_path")}
            </DropdownItem>
        );

        items.push(
            <DropdownItem
                key="copy-hash"
                isDisabled={isClipboardSupported === false}
                shortcut={getContextMenuShortcut("copy-hash")}
                onPress={() => void handleContextMenuAction("copy-hash")}
            >
                {t("table.actions.copy_hash")}
            </DropdownItem>
        );

        items.push(
            <DropdownItem
                key="copy-magnet"
                isDisabled={isClipboardSupported === false}
                shortcut={getContextMenuShortcut("copy-magnet")}
                onPress={() => void handleContextMenuAction("copy-magnet")}
            >
                {t("table.actions.copy_magnet")}
            </DropdownItem>
        );

        items.push(
            <DropdownItem
                key="remove"
                color="danger"
                shortcut={getContextMenuShortcut("remove")}
                onPress={() => void handleContextMenuAction("remove")}
            >
                {t("table.actions.remove")}
            </DropdownItem>
        );

        items.push(
            <DropdownItem
                key="remove-with-data"
                color="danger"
                shortcut={getContextMenuShortcut("remove-with-data")}
                onPress={() => void handleContextMenuAction("remove-with-data")}
            >
                {t("table.actions.remove_with_data")}
            </DropdownItem>
        );

        if (rowMenuViewModel.inlineEditor.visible && inlineSetLocationState) {
            items.push(
                <DropdownItem
                    key="set-location-inline"
                    className="border-t border-content1/20 p-0"
                    role="presentation"
                    textValue={t("table.actions.set_download_path")}
                >
                    <div className="px-panel pt-panel">
                        <SetLocationInlineEditor
                            value={inlineSetLocationState.inputPath}
                            error={inlineSetLocationState.error}
                            isBusy={rowMenuViewModel.inlineEditor.isBusy}
                            caption={rowMenuViewModel.inlineEditor.caption}
                            statusMessage={
                                rowMenuViewModel.inlineEditor.statusMessage
                            }
                            disableCancel={rowMenuViewModel.inlineEditor.isBusy}
                            onChange={handleInlineLocationChange}
                            onSubmit={handleInlineSubmit}
                            onCancel={handleInlineCancel}
                        />
                    </div>
                </DropdownItem>
            );
        }

        return items as unknown as CollectionChildren<object>;
    }, [
        rowMenuViewModel,
        canSetLocation,
        isClipboardSupported,
        inlineSetLocationState,
        getContextMenuShortcut,
        getEmphasisClassForAction,
        handleContextMenuAction,
        handleInlineCancel,
        handleInlineLocationChange,
        handleInlineSubmit,
        handleSetDownloadPath,
        t,
    ]);

    // TODO: Inline editor UX: ensure outcome/confidence messaging aligns with Recovery UX spec (“Location unavailable” on unknown) and avoid closing the menu until recovery gate reports completion.
    const rect = contextMenu.virtualElement.getBoundingClientRect();
    if (!rect) return null;
    return (
        <Dropdown
            isOpen
            onClose={handleMenuClose}
            placement="bottom-start"
            shouldBlockScroll={false}
            shouldFlip
            closeOnSelect={false}
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
            <DropdownMenu variant="shadow" className={GLASS_MENU_SURFACE}>
                {menuItems}
            </DropdownMenu>
        </Dropdown>
    );
}
