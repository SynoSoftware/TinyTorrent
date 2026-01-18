// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem,
    cn,
} from "@heroui/react";
import { GLASS_MENU_SURFACE } from "@/shared/ui/layout/glass-surface";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { ContextMenuVirtualElement } from "@/shared/hooks/ui/useContextMenuPosition";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { SetLocationInlineEditor } from "@/modules/dashboard/components/SetLocationInlineEditor";
import { getSurfaceCaptionKey } from "@/app/utils/setLocation";
import { useMissingFilesClassification } from "@/services/recovery/missingFilesStore";
import { resolveRecoveryClassification } from "@/modules/dashboard/utils/recoveryClassification";

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
        getRecoverySessionForKey,
    } = useRecoveryContext();
    // TODO: Ensure all recovery/set-location actions here route through the single recovery gate/state machine; no local sequencing or ad-hoc handling for “set-download-path” should exist.
    // TODO: Replace `connectionMode` usage here with `uiMode = "Full" | "Rpc"` from the capability provider; UI should not branch on tinytorrent-* strings.
    // TODO: Update `getSetLocationOutcomeMessage(...)` to accept uiMode instead of connectionMode.
    if (!contextMenu) return null;
    const shouldShowOpenFolder = canOpenFolder;
    const canSetLocation =
        setLocationCapability.canBrowse || setLocationCapability.supportsManual;
    const torrentKey = getTorrentKey(contextMenu.torrent);
    const sessionClassification =
        getRecoverySessionForKey(torrentKey)?.classification ?? null;
    const storedClassification = useMissingFilesClassification(
        contextMenu.torrent.id ?? contextMenu.torrent.hash ?? undefined
    );
    const classification = useMemo(
        () =>
            resolveRecoveryClassification({
                sessionClassification,
                storedClassification,
            }),
        [sessionClassification, storedClassification]
    );
    const showUnknownConfidence = classification?.confidence === "unknown";
    const inlineStateKey = inlineSetLocationState?.torrentKey ?? "";
    const currentKey = getTorrentKey(contextMenu.torrent);
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
            openFolderDisabled: !contextMenu?.torrent?.savePath,
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
        contextMenu,
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
    // TODO: Inline editor UX: ensure outcome/confidence messaging aligns with Recovery UX spec (“Location unavailable” on unknown) and avoid closing the menu until recovery gate reports completion.
    const rect = contextMenu.virtualElement.getBoundingClientRect();
    return (
        <AnimatePresence>
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
                    {/* @ts-expect-error DropdownMenu expects a CollectionElement<object> */}
                    {rowMenuViewModel.actions.map((item) => (
                        <DropdownItem
                            key={item.key}
                            shortcut={item.shortcut}
                            onPress={() => void handleContextMenuAction(item.key)}
                            isDisabled={item.disabled}
                        >
                            {item.label}
                        </DropdownItem>
                    ))}
                    <div
                        key="queue-section"
                        className="border-t border-content1/20 px-panel pt-panel"
                    >
                        <div className="text-xs uppercase tracking-tight text-foreground/50">
                            {rowMenuViewModel.dataTitle}
                        </div>
                        {rowMenuViewModel.queueActions.map((action) => (
                            <DropdownItem
                                key={action.key}
                                className="pl-stage text-sm"
                                shortcut={getContextMenuShortcut(action.key)}
                                onPress={() =>
                                    void handleContextMenuAction(action.key)
                                }
                            >
                                {action.label}
                            </DropdownItem>
                        ))}
                    </div>
                    <DropdownItem
                        key="data-title"
                        isDisabled
                        className="border-t border-content1/20 mt-tight pt-tight px-panel text-scaled font-bold uppercase text-foreground/50"
                        style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
                    >
                        {t("table.data.title")}
                    </DropdownItem>
                    {rowMenuViewModel.showOpenFolder ? (
                        <DropdownItem
                            key="open-folder"
                            isDisabled={rowMenuViewModel.openFolderDisabled}
                            className={cn(
                                contextMenu?.torrent.errorEnvelope
                                    ?.primaryAction === "openFolder"
                                    ? getEmphasisClassForAction?.(
                                          contextMenu?.torrent.errorEnvelope
                                              ?.primaryAction
                                      )
                                    : ""
                            )}
                            onPress={() =>
                                void handleContextMenuAction("open-folder")
                            }
                        >
                            {t("table.actions.open_folder")}
                        </DropdownItem>
                    ) : null}
                    <DropdownItem
                        key="set-download-path"
                        className={cn(
                            contextMenu?.torrent.errorEnvelope
                                ?.primaryAction === "setLocation"
                                ? getEmphasisClassForAction?.(
                                      contextMenu?.torrent.errorEnvelope
                                          ?.primaryAction
                                  )
                                : ""
                        )}
                        isDisabled={!canSetLocation}
                        onPress={handleSetDownloadPath}
                        textValue={t("table.actions.set_download_path")}
                    >
                        {t("table.actions.set_download_path")}
                    </DropdownItem>
                    <DropdownItem
                        key="copy-hash"
                        isDisabled={isClipboardSupported === false}
                        shortcut={getContextMenuShortcut("copy-hash")}
                        onPress={() =>
                            void handleContextMenuAction("copy-hash")
                        }
                    >
                        {t("table.actions.copy_hash")}
                    </DropdownItem>
                    <DropdownItem
                        key="copy-magnet"
                        isDisabled={isClipboardSupported === false}
                        shortcut={getContextMenuShortcut("copy-magnet")}
                        onPress={() =>
                            void handleContextMenuAction("copy-magnet")
                        }
                    >
                        {t("table.actions.copy_magnet")}
                    </DropdownItem>
                    <DropdownItem
                        key="remove"
                        color="danger"
                        shortcut={getContextMenuShortcut("remove")}
                        onPress={() => void handleContextMenuAction("remove")}
                    >
                        {t("table.actions.remove")}
                    </DropdownItem>
                    <DropdownItem
                        key="remove-with-data"
                        color="danger"
                        shortcut={getContextMenuShortcut("remove-with-data")}
                        onPress={() =>
                            void handleContextMenuAction("remove-with-data")
                        }
                    >
                        {t("table.actions.remove_with_data")}
                    </DropdownItem>
                    {rowMenuViewModel.inlineEditor.visible &&
                    inlineSetLocationState ? (
                        <div
                            key="set-location-inline"
                            className="border-t border-content1/20 px-panel pt-panel"
                        >
                            <DropdownItem
                                key="inline-editor-wrapper"
                                className="p-0"
                                role="presentation"
                                textValue={t("table.actions.set_download_path")}
                            >
                                <SetLocationInlineEditor
                                    value={inlineSetLocationState.inputPath}
                                    error={inlineSetLocationState.error}
                                    isBusy={rowMenuViewModel.inlineEditor.isBusy}
                                    caption={rowMenuViewModel.inlineEditor.caption}
                                    statusMessage={
                                        rowMenuViewModel.inlineEditor.statusMessage
                                    }
                                    disableCancel={
                                        rowMenuViewModel.inlineEditor.isBusy
                                    }
                                    onChange={handleInlineLocationChange}
                                    onSubmit={handleInlineSubmit}
                                    onCancel={handleInlineCancel}
                                />
                            </DropdownItem>
                        </div>
                    ) : null}
                </DropdownMenu>
            </Dropdown>
        </AnimatePresence>
    );
}
