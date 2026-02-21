import React, { useCallback, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, cn } from "@heroui/react";
import type { CollectionChildren } from "@react-types/shared";
import { SURFACE, CONTEXT_MENU } from "@/shared/ui/layout/glass-surface";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import type {
    ContextMenuKey,
    QueueMenuAction,
    TableContextMenu,
    TorrentTableRowMenuViewModel,
} from "@/modules/dashboard/types/torrentTableSurfaces";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { useResolvedRecoveryClassification } from "@/modules/dashboard/hooks/useResolvedRecoveryClassification";
import { useTranslation } from "react-i18next";
import { getEmphasisClassForAction } from "@/shared/utils/recoveryFormat";
import { useUiModeCapabilities } from "@/app/context/SessionContext";
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

const mapRecommendedActionToEmphasis = (action?: RecoveryRecommendedAction): RecoveryAction | undefined =>
    action ? RECOVERY_RECOMMENDED_TO_EMPHASIS_ACTION[action] : undefined;

interface RowMenuViewModel {
    actions: RowMenuAction[];
    queueActions: QueueMenuAction[];
    dataTitle: string;
    showOpenFolder: boolean;
    openFolderDisabled: boolean;
}

export interface TorrentTableRowMenuProps {
    viewModel: TorrentTableRowMenuViewModel;
}

export default function TorrentTable_RowMenu({ viewModel }: TorrentTableRowMenuProps) {
    const { contextMenu, onClose, handleContextMenuAction, queueMenuActions, getContextMenuShortcut } = viewModel;
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
    const { setLocationCapability: downloadPathCapability, canOpenFolder } = useRecoveryContext();

    const contextTorrent = contextMenu.torrent;
    const shouldShowOpenFolder = Boolean(canOpenFolder);
    const canSetDownloadPath = downloadPathCapability.canBrowse || downloadPathCapability.supportsManual;
    const classification = useResolvedRecoveryClassification(contextTorrent);
    const primaryEmphasisAction =
        mapRecommendedActionToEmphasis(classification?.recommendedActions?.[0]) ??
        contextMenu.torrent.errorEnvelope?.primaryAction;

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
                key: "resume-now",
                label: t("table.actions.start_now"),
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
        };
    }, [t, queueMenuActions, getContextMenuShortcut, shouldShowOpenFolder, contextTorrent]);

    const handleMenuClose = () => {
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
        [handleContextMenuAction, showFeedback, t],
    );
    const handleSetDownloadPath = useCallback(() => {
        if (!canSetDownloadPath) return;
        void handleMenuActionPress("set-download-path");
    }, [canSetDownloadPath, handleMenuActionPress]);

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
                className={cn(CONTEXT_MENU.sectionHeading, SURFACE.menu.sectionHeading)}
            >
                {rowMenuViewModel.dataTitle}
            </DropdownItem>,
        );

        items.push(
            ...rowMenuViewModel.queueActions.map((action) => (
                <DropdownItem
                    key={action.key}
                    className={CONTEXT_MENU.sectionNestedItem}
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
                className={cn(CONTEXT_MENU.sectionHeadingStrong, SURFACE.menu.sectionHeading)}
                style={CONTEXT_MENU.sectionHeadingTrackingStyle}
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
                        primaryEmphasisAction === "openFolder" ? getEmphasisClassForAction(primaryEmphasisAction) : "",
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
                    primaryEmphasisAction === "setLocation" ? getEmphasisClassForAction(primaryEmphasisAction) : "",
                )}
                isDisabled={!canSetDownloadPath}
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

        return items as CollectionChildren<object>;
    }, [
        rowMenuViewModel,
        primaryEmphasisAction,
        canSetDownloadPath,
        clipboardWriteSupported,
        getContextMenuShortcut,
        handleMenuActionPress,
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
            disableAnimation
        >
            <DropdownTrigger>
                <div
                    style={CONTEXT_MENU.builder.anchorStyle({
                        top: rect.top,
                        left: rect.left,
                    })}
                />
            </DropdownTrigger>
            <DropdownMenu
                variant="shadow"
                className={SURFACE.menu.surface}
                classNames={SURFACE.menu.listClassNames}
                itemClasses={SURFACE.menu.itemClassNames}
            >
                {menuItems}
            </DropdownMenu>
        </Dropdown>
    );
}
