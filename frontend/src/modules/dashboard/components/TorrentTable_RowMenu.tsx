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
import {
    MENU_CLASS,
} from "@/shared/ui/layout/glass-surface";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import type {
    ContextMenuKey,
    QueueMenuAction,
    TableContextMenu,
    TorrentTableRowMenuViewModel,
} from "@/modules/dashboard/types/torrentTableSurfaces";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { SetLocationEditor } from "@/modules/dashboard/components/SetLocationEditor";
import { getSurfaceCaptionKey } from "@/app/utils/setLocation";
import { useResolvedRecoveryClassification } from "@/modules/dashboard/hooks/useResolvedRecoveryClassification";
import { useTranslation } from "react-i18next";
import { getEmphasisClassForAction } from "@/shared/utils/recoveryFormat";
import { useUiModeCapabilities } from "@/app/context/SessionContext";
import { getRecoveryFingerprint } from "@/app/domain/recoveryUtils";
import { SURFACE_BORDER } from "@/config/logic";
import type { RecoveryAction } from "@/services/rpc/entities";
import type { RecoveryRecommendedAction } from "@/services/recovery/recovery-controller";

type RowMenuAction = {
    key: string;
    label: string;
    shortcut?: string;
    disabled?: boolean;
};

const RECOVERY_RECOMMENDED_TO_EMPHASIS_ACTION = {
    locate: "setLocation",
    chooseLocation: "setLocation",
    openFolder: "openFolder",
    downloadMissing: "reDownload",
    retry: "forceRecheck",
} satisfies Record<RecoveryRecommendedAction, RecoveryAction>;

const mapRecommendedActionToEmphasis = (
    action?: RecoveryRecommendedAction,
): RecoveryAction | undefined =>
    action ? RECOVERY_RECOMMENDED_TO_EMPHASIS_ACTION[action] : undefined;

interface RowMenuViewModel {
    actions: RowMenuAction[];
    queueActions: QueueMenuAction[];
    dataTitle: string;
    showOpenFolder: boolean;
    openFolderDisabled: boolean;
    locationEditor: {
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
}: {
    contextMenu: TableContextMenu;
    onClose: () => void;
    handleContextMenuAction: (key?: string) => Promise<TorrentCommandOutcome>;
    queueMenuActions: QueueMenuAction[];
    getContextMenuShortcut: (key: ContextMenuKey) => string;
}) {
    const { t } = useTranslation();
    const { clipboardWriteSupported } = useUiModeCapabilities();
    const { showFeedback } = useActionFeedback();
    const {
        setLocationState: setLocationEditorState,
        releaseSetLocation: releaseSetLocationEditor,
        confirmSetLocation,
        handleLocationChange: handleSetLocationInputChange,
        setLocationCapability,
        canOpenFolder,
    } = useRecoveryContext();

    const contextTorrent = contextMenu.torrent;
    const shouldShowOpenFolder = Boolean(canOpenFolder);
    const canSetLocation =
        setLocationCapability.canBrowse || setLocationCapability.supportsManual;
    const classification = useResolvedRecoveryClassification(contextTorrent);
    const primaryEmphasisAction =
        mapRecommendedActionToEmphasis(
            classification?.recommendedActions?.[0],
        ) ?? contextMenu.torrent.errorEnvelope?.primaryAction;
    const showUnknownConfidence = classification?.confidence === "unknown";
    const locationEditorStateKey = setLocationEditorState?.torrentKey ?? "";
    const currentKey = getRecoveryFingerprint(contextTorrent);
    const showLocationEditor = Boolean(
        setLocationEditorState?.surface === "context-menu" &&
        locationEditorStateKey &&
        locationEditorStateKey === currentKey,
    );
    const locationEditorVerifying =
        setLocationEditorState?.status === "verifying";
    const locationEditorStatusMessage = locationEditorVerifying
        ? t("recovery.status.applying_location")
        : showUnknownConfidence
          ? t("recovery.inline_fallback")
          : undefined;
    const locationEditorCaption = t(getSurfaceCaptionKey("context-menu"));
    const locationEditorBusy =
        setLocationEditorState?.status !== "idle" || locationEditorVerifying;

    // If this menu unmounts (e.g. parent clears `contextMenu`) while a location edit is open,
    // ensure we release the editor session so it doesn't leak across reopens.
    useEffect(() => {
        return () => {
            if (setLocationEditorState?.surface === "context-menu") {
                releaseSetLocationEditor();
            }
        };
    }, [setLocationEditorState?.surface, releaseSetLocationEditor]);

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
            locationEditor: {
                visible: showLocationEditor,
                caption: locationEditorCaption,
                statusMessage: locationEditorStatusMessage,
                isBusy: locationEditorBusy,
            },
        };
    }, [
        t,
        queueMenuActions,
        getContextMenuShortcut,
        shouldShowOpenFolder,
        contextTorrent,
        locationEditorCaption,
        locationEditorStatusMessage,
        locationEditorBusy,
        showLocationEditor,
    ]);

    const handleLocationSubmit = useCallback(() => {
        void confirmSetLocation().then((outcome) => {
            if (
                outcome.status === "submitted" ||
                outcome.status === "verifying"
            ) {
                onClose();
            }
        });
    }, [confirmSetLocation, onClose]);
    const handleLocationCancel = useCallback(() => {
        releaseSetLocationEditor();
        onClose();
    }, [onClose, releaseSetLocationEditor]);
    const handleMenuClose = () => {
        releaseSetLocationEditor();
        onClose();
    };
    const handleMenuActionPress = useCallback(
        async (key?: string) => {
            const outcome = await handleContextMenuAction(key);
            if (outcome.status === "unsupported") {
                showFeedback(
                    t("torrent_modal.controls.not_supported"),
                    "warning",
                );
            } else if (outcome.status === "failed") {
                showFeedback(t("toolbar.feedback.failed"), "danger");
            }
        },
        [handleContextMenuAction, showFeedback, t],
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
            )),
        );

        items.push(
            <DropdownItem
                key="queue-heading"
                isDisabled
                className={cn(
                    `border-t ${SURFACE_BORDER} pt-panel`,
                    MENU_CLASS.sectionHeading,
                )}
            >
                {rowMenuViewModel.dataTitle}
            </DropdownItem>,
        );

        items.push(
            ...rowMenuViewModel.queueActions.map((action) => (
                <DropdownItem
                    key={action.key}
                    className="pl-stage"
                    shortcut={getContextMenuShortcut(action.key)}
                    onPress={() => void handleMenuActionPress(action.key)}
                >
                    {action.label}
                </DropdownItem>
            )),
        );

        items.push(
            <DropdownItem
                key="data-title"
                isDisabled
                className={cn(
                    `border-t ${SURFACE_BORDER} mt-tight pt-tight font-bold`,
                    MENU_CLASS.sectionHeading,
                )}
                style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
            >
                {t("table.data.title")}
            </DropdownItem>,
        );

        if (rowMenuViewModel.showOpenFolder) {
            items.push(
                <DropdownItem
                    key="open-folder"
                    isDisabled={rowMenuViewModel.openFolderDisabled}
                    className={cn(
                        primaryEmphasisAction === "openFolder"
                            ? getEmphasisClassForAction(primaryEmphasisAction)
                            : "",
                    )}
                    onPress={() => void handleMenuActionPress("open-folder")}
                >
                    {t("table.actions.open_folder")}
                </DropdownItem>,
            );
        }

        items.push(
            <DropdownItem
                key="set-download-path"
                className={cn(
                    primaryEmphasisAction === "setLocation"
                        ? getEmphasisClassForAction(primaryEmphasisAction)
                        : "",
                )}
                isDisabled={!canSetLocation}
                onPress={handleSetDownloadPath}
                textValue={t("table.actions.set_download_path")}
            >
                {t("table.actions.set_download_path")}
            </DropdownItem>,
        );

        items.push(
            <DropdownItem
                key="copy-hash"
                isDisabled={!clipboardWriteSupported}
                shortcut={getContextMenuShortcut("copy-hash")}
                onPress={() => void handleMenuActionPress("copy-hash")}
            >
                {t("table.actions.copy_hash")}
            </DropdownItem>,
        );

        items.push(
            <DropdownItem
                key="copy-magnet"
                isDisabled={!clipboardWriteSupported}
                shortcut={getContextMenuShortcut("copy-magnet")}
                onPress={() => void handleMenuActionPress("copy-magnet")}
            >
                {t("table.actions.copy_magnet")}
            </DropdownItem>,
        );

        items.push(
            <DropdownItem
                key="remove"
                color="danger"
                shortcut={getContextMenuShortcut("remove")}
                onPress={() => void handleMenuActionPress("remove")}
            >
                {t("table.actions.remove")}
            </DropdownItem>,
        );

        items.push(
            <DropdownItem
                key="remove-with-data"
                color="danger"
                shortcut={getContextMenuShortcut("remove-with-data")}
                onPress={() => void handleMenuActionPress("remove-with-data")}
            >
                {t("table.actions.remove_with_data")}
            </DropdownItem>,
        );

        if (rowMenuViewModel.locationEditor.visible && setLocationEditorState) {
            items.push(
                <DropdownItem
                    key="set-location-editor"
                    className={`border-t ${SURFACE_BORDER} p-0`}
                    role="presentation"
                    textValue={t("table.actions.set_download_path")}
                >
                    <div className="px-panel pt-panel">
                        <SetLocationEditor
                            value={setLocationEditorState.inputPath}
                            error={setLocationEditorState.error}
                            isBusy={rowMenuViewModel.locationEditor.isBusy}
                            caption={rowMenuViewModel.locationEditor.caption}
                            statusMessage={
                                rowMenuViewModel.locationEditor.statusMessage
                            }
                            disableCancel={rowMenuViewModel.locationEditor.isBusy}
                            onChange={handleSetLocationInputChange}
                            onSubmit={handleLocationSubmit}
                            onCancel={handleLocationCancel}
                        />
                    </div>
                </DropdownItem>,
            );
        }

        return items as CollectionChildren<object>;
    }, [
        rowMenuViewModel,
        primaryEmphasisAction,
        canSetLocation,
        clipboardWriteSupported,
        setLocationEditorState,
        getContextMenuShortcut,
        handleMenuActionPress,
        handleLocationCancel,
        handleSetLocationInputChange,
        handleLocationSubmit,
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
            <DropdownMenu
                variant="shadow"
                className={MENU_CLASS.surface}
                classNames={MENU_CLASS.listClassNames}
                itemClasses={MENU_CLASS.itemClassNames}
            >
                {menuItems}
            </DropdownMenu>
        </Dropdown>
    );
}

