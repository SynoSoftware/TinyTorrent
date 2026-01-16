import React, { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem,
    DropdownSection,
    cn,
} from "@heroui/react";
import { GLASS_MENU_SURFACE } from "@/shared/ui/layout/glass-surface";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { ContextMenuVirtualElement } from "@/shared/hooks/ui/useContextMenuPosition";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { SetLocationInlineEditor } from "@/modules/dashboard/components/SetLocationInlineEditor";
import type { SetLocationOutcome } from "@/app/context/RecoveryContext";
import {
    getSetLocationOutcomeMessage,
    getSurfaceCaptionKey,
} from "@/app/utils/setLocation";

const getTorrentKey = (
    entry?: { id?: string | number; hash?: string } | null
) => entry?.id?.toString() ?? entry?.hash ?? "";

type QueueMenuAction = { key: string; label: string };

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
    handleContextMenuAction: (
        key?: string
    ) => Promise<SetLocationOutcome | undefined>;
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
        getLocationOutcome,
        setLocationCapability,
        canOpenFolder,
        connectionMode,
    } = useRecoveryContext();
    // TODO: Ensure all recovery/set-location actions here route through the single recovery gate/state machine; no local sequencing or ad-hoc handling for “set-download-path” should exist.
    // TODO: Replace `connectionMode` usage here with `uiMode = "Full" | "Rpc"` from the capability provider; UI should not branch on tinytorrent-* strings.
    // TODO: Update `getSetLocationOutcomeMessage(...)` to accept uiMode instead of connectionMode.
    if (!contextMenu) return null;
    const shouldShowOpenFolder = canOpenFolder;
    const canSetLocation =
        setLocationCapability.canBrowse || setLocationCapability.supportsManual;
    const inlineStateKey = inlineSetLocationState?.torrentKey ?? "";
    const currentKey = getTorrentKey(contextMenu.torrent);
    const shouldShowInlineEditor =
        inlineSetLocationState?.surface === "context-menu" &&
        inlineStateKey &&
        inlineStateKey === currentKey;
    const inlineIsVerifying =
        inlineSetLocationState?.status === "verifying";
    const inlineStatusMessage = inlineIsVerifying
        ? t("recovery.status.applying_location")
        : undefined;
    const inlineCaption = t(getSurfaceCaptionKey("context-menu"));
    const inlineIsBusy =
        inlineSetLocationState?.status !== "idle" || inlineIsVerifying;
    const outcomeMessage = getSetLocationOutcomeMessage(
        getLocationOutcome("context-menu", inlineStateKey || currentKey),
        "context-menu",
        connectionMode
    );
    const unsupportedMessage =
        outcomeMessage && !shouldShowInlineEditor
            ? t(outcomeMessage.labelKey)
            : null;
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
                    <DropdownItem
                        key="pause"
                        shortcut={getContextMenuShortcut("pause")}
                        onPress={() => void handleContextMenuAction("pause")}
                    >
                        {t("table.actions.pause")}
                    </DropdownItem>
                    <DropdownItem
                        key="resume"
                        shortcut={getContextMenuShortcut("resume")}
                        onPress={() => void handleContextMenuAction("resume")}
                    >
                        {t("table.actions.resume")}
                    </DropdownItem>
                    <DropdownItem
                        key="recheck"
                        shortcut={getContextMenuShortcut("recheck")}
                        onPress={() => void handleContextMenuAction("recheck")}
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
                                onPress={() =>
                                    void handleContextMenuAction(action.key)
                                }
                            >
                                {action.label}
                            </DropdownItem>
                        ))}
                    </DropdownSection>
                    <DropdownItem
                        key="data-title"
                        isDisabled
                        className="border-t border-content1/20 mt-tight pt-tight px-panel text-scaled font-bold uppercase text-foreground/50"
                        style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
                    >
                        {t("table.data.title")}
                    </DropdownItem>
                    {shouldShowOpenFolder ? (
                        <DropdownItem
                            key="open-folder"
                            isDisabled={!contextMenu?.torrent.savePath}
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
                    {shouldShowInlineEditor && inlineSetLocationState ? (
                        <DropdownSection
                            key="set-location-inline"
                            title=""
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
                                    isBusy={inlineIsBusy}
                                    caption={inlineCaption}
                                    statusMessage={inlineStatusMessage}
                                    disableCancel={inlineIsVerifying}
                                    onChange={handleInlineLocationChange}
                                    onSubmit={handleInlineSubmit}
                                    onCancel={handleInlineCancel}
                                />
                            </DropdownItem>
                        </DropdownSection>
                    ) : null}
                    {unsupportedMessage && !shouldShowInlineEditor ? (
                        <DropdownSection
                            key="set-location-unsupported"
                            title=""
                            className="border-t border-content1/20 px-panel pt-panel"
                        >
                            <div className="text-label text-warning/80">
                                {unsupportedMessage}
                            </div>
                        </DropdownSection>
                    ) : null}
                </DropdownMenu>
            </Dropdown>
        </AnimatePresence>
    );
}
