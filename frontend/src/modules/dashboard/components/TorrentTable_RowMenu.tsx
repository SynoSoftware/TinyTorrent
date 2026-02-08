import React, { useCallback, useEffect, useMemo } from "react";
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
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import type {
    ContextMenuKey,
    QueueMenuAction,
    TableContextMenu,
    TorrentTableRowMenuViewModel,
} from "@/modules/dashboard/types/torrentTableSurfaces";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { SetLocationInlineEditor } from "@/modules/dashboard/components/SetLocationInlineEditor";
import { getSurfaceCaptionKey } from "@/app/utils/setLocation";
import { useResolvedRecoveryClassification } from "@/modules/dashboard/hooks/useResolvedRecoveryClassification";
import { useTranslation } from "react-i18next";
import { getEmphasisClassForAction } from "@/shared/utils/recoveryFormat";

type RowMenuAction = {
    key: string;
    label: string;
    shortcut?: string;
    disabled?: boolean;
};

const getTorrentKey = (
    entry?: { id?: string | number; hash?: string } | null
) => entry?.id?.toString() ?? entry?.hash ?? "";

const mapRecommendedActionToEmphasis = (
    action?: string
): "setLocation" | "openFolder" | "reDownload" | "pause" | "reannounce" | "forceRecheck" | undefined => {
    switch (action) {
        case "locate":
        case "chooseLocation":
            return "setLocation";
        case "openFolder":
            return "openFolder";
        case "downloadMissing":
            return "reDownload";
        case "retry":
            return "forceRecheck";
        default:
            return undefined;
    }
};

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

export interface TorrentTableRowMenuProps {
    viewModel: TorrentTableRowMenuViewModel;
}

export default function TorrentTable_RowMenu({
    viewModel,
}: TorrentTableRowMenuProps) {
    const {
        contextMenu,
        onClose,
        handleContextMenuAction,
        queueMenuActions,
        getContextMenuShortcut,
        isClipboardSupported,
    } = viewModel;
    return (
        <AnimatePresence>
            {contextMenu ? (
                <TorrentTable_RowMenuInner
                    contextMenu={contextMenu}
                    onClose={onClose}
                    handleContextMenuAction={handleContextMenuAction}
                    queueMenuActions={queueMenuActions}
                    getContextMenuShortcut={getContextMenuShortcut}
                    isClipboardSupported={isClipboardSupported}
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
    isClipboardSupported,
}: {
    contextMenu: TableContextMenu;
    onClose: () => void;
    handleContextMenuAction: (key?: string) => Promise<TorrentCommandOutcome>;
    queueMenuActions: QueueMenuAction[];
    getContextMenuShortcut: (key: ContextMenuKey) => string;
    // TODO(section 20.4): consume centralized clipboard capability state from one
    // authority instead of feature-local probing and threaded booleans.
    isClipboardSupported?: boolean;
}) {
    const { t } = useTranslation();
    const { showFeedback } = useActionFeedback();
    const {
        inlineSetLocationState,
        releaseInlineSetLocation,
        confirmInlineSetLocation,
        handleInlineLocationChange,
        setLocationCapability,
        canOpenFolder,
    } = useRecoveryContext();

    const contextTorrent = contextMenu.torrent;
    const shouldShowOpenFolder = Boolean(canOpenFolder);
    const canSetLocation =
        setLocationCapability.canBrowse || setLocationCapability.supportsManual;
    const classification = useResolvedRecoveryClassification(contextTorrent);
    const primaryEmphasisAction =
        mapRecommendedActionToEmphasis(classification?.recommendedActions?.[0]) ??
        contextMenu.torrent.errorEnvelope?.primaryAction;
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
            openFolderDisabled: !(
                contextTorrent.savePath || contextTorrent.downloadDir
            ),
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

    // TODO(section 20.5): stop inferring close behavior from boolean success; branch on typed outcomes.
    const handleInlineSubmit = useCallback(() => {
        void confirmInlineSetLocation().then((success) => {
            if (success) {
                onClose();
            }
        });
    }, [confirmInlineSetLocation, onClose]);
    const handleInlineCancel = useCallback(() => {
        releaseInlineSetLocation();
        onClose();
    }, [onClose, releaseInlineSetLocation]);
    const handleMenuClose = () => {
        releaseInlineSetLocation();
        onClose();
    };
    const handleMenuActionPress = useCallback(
        async (key?: string) => {
            const outcome = await handleContextMenuAction(key);
            if (outcome.status === "unsupported") {
                showFeedback(t("torrent_modal.controls.not_supported"), "warning");
            } else if (outcome.status === "failed") {
                showFeedback(t("toolbar.feedback.failed"), "danger");
            }
        },
        [handleContextMenuAction, showFeedback, t]
    );
    const handleSetDownloadPath = useCallback(() => {
        if (!canSetLocation) return;
        void handleMenuActionPress("set-download-path");
    }, [canSetLocation, handleMenuActionPress]);

    const menuItems = useMemo<CollectionChildren<object>>(() => {
        const items: Array<React.ReactElement> = [];

        items.push(
            ...rowMenuViewModel.actions.map((item) => (
                <DropdownItem
                    key={item.key}
                    shortcut={item.shortcut}
                    onPress={() => void handleMenuActionPress(item.key)}
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
                    onPress={() => void handleMenuActionPress(action.key)}
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
                        primaryEmphasisAction === "openFolder"
                            ? getEmphasisClassForAction(primaryEmphasisAction)
                            : ""
                    )}
                    onPress={() => void handleMenuActionPress("open-folder")}
                >
                    {t("table.actions.open_folder")}
                </DropdownItem>
            );
        }

        items.push(
            <DropdownItem
                key="set-download-path"
                className={cn(
                    primaryEmphasisAction === "setLocation"
                        ? getEmphasisClassForAction(primaryEmphasisAction)
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
                onPress={() => void handleMenuActionPress("copy-hash")}
            >
                {t("table.actions.copy_hash")}
            </DropdownItem>
        );

        items.push(
            <DropdownItem
                key="copy-magnet"
                isDisabled={isClipboardSupported === false}
                shortcut={getContextMenuShortcut("copy-magnet")}
                onPress={() => void handleMenuActionPress("copy-magnet")}
            >
                {t("table.actions.copy_magnet")}
            </DropdownItem>
        );

        items.push(
            <DropdownItem
                key="remove"
                color="danger"
                shortcut={getContextMenuShortcut("remove")}
                onPress={() => void handleMenuActionPress("remove")}
            >
                {t("table.actions.remove")}
            </DropdownItem>
        );

        items.push(
            <DropdownItem
                key="remove-with-data"
                color="danger"
                shortcut={getContextMenuShortcut("remove-with-data")}
                onPress={() => void handleMenuActionPress("remove-with-data")}
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

        return items as CollectionChildren<object>;
    }, [
        rowMenuViewModel,
        primaryEmphasisAction,
        canSetLocation,
        isClipboardSupported,
        inlineSetLocationState,
        getContextMenuShortcut,
        handleMenuActionPress,
        handleInlineCancel,
        handleInlineLocationChange,
        handleInlineSubmit,
        handleSetDownloadPath,
        t,
    ]);

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

