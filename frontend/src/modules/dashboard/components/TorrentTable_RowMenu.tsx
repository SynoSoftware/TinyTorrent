import React, { useCallback, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, cn } from "@heroui/react";
import type { CollectionChildren } from "@react-types/shared";
import { SURFACE, CONTEXT_MENU } from "@/shared/ui/layout/glass-surface";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import type {
    ContextMenuKey,
    QueueMenuAction,
    RowContextMenuKey,
    TableContextMenu,
    TorrentTableRowMenuViewModel,
} from "@/modules/dashboard/types/torrentTableSurfaces";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import { useRequiredTorrentActions, useTorrentCommands } from "@/app/context/AppCommandContext";
import { useTranslation } from "react-i18next";
import { useUiModeCapabilities } from "@/app/context/SessionContext";
import SetDownloadPathModal from "@/modules/dashboard/components/SetDownloadPathModal";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { useDirectoryPicker } from "@/app/hooks/useDirectoryPicker";
import {
    applySetDownloadLocation,
    pickSetDownloadLocationDirectory,
    resolveSetDownloadLocationPath,
} from "@/modules/dashboard/utils/applySetDownloadLocation";
import {
    getSetDownloadLocationUiTextKeys,
    shouldMoveDataOnSetLocation,
} from "@/modules/dashboard/domain/torrentRelocation";

type RowMenuAction = {
    key: RowContextMenuKey;
    label: string;
    shortcut?: string;
    disabled?: boolean;
};

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
    const { dispatch } = useRequiredTorrentActions();
    const { setDownloadLocation } = useTorrentCommands();
    const torrentClient = useTorrentClient();
    const { canPickDirectory, pickDirectory } = useDirectoryPicker();
    const { t } = useTranslation();
    const [setLocationTorrent, setSetLocationTorrent] = useState<Torrent | null>(null);
    const setLocationModalTitleKey = useMemo(
        () =>
            getSetDownloadLocationUiTextKeys(
                setLocationTorrent ?? {},
            ).modalTitleKey,
        [setLocationTorrent],
    );
    const allowInvalidSetLocationPathApply = useMemo(
        () => shouldMoveDataOnSetLocation(setLocationTorrent ?? {}),
        [setLocationTorrent],
    );

    const closeSetLocationModal = useCallback(() => {
        setSetLocationTorrent(null);
    }, []);

    const browseSetLocationPath = useCallback(
        async (currentPath: string): Promise<string | null> => {
            return pickSetDownloadLocationDirectory({
                currentPath,
                torrent: setLocationTorrent,
                canPickDirectory,
                pickDirectory,
            });
        },
        [canPickDirectory, pickDirectory, setLocationTorrent],
    );

    const applySetLocation = useCallback(
        async ({ path }: { path: string }) => {
            const target = setLocationTorrent;
            if (!target) {
                throw new Error(t("toolbar.feedback.failed"));
            }
            await applySetDownloadLocation({
                torrent: target,
                path,
                client: torrentClient,
                setDownloadLocation,
                dispatchEnsureActive: dispatch,
                t,
            });
        },
        [
            dispatch,
            setDownloadLocation,
            setLocationTorrent,
            t,
            torrentClient,
        ],
    );

    const openSetLocationModalFromContext = useCallback(
        (torrent: Torrent) => {
            setSetLocationTorrent(torrent);
            onClose();
        },
        [onClose],
    );

    return (
        <>
            <AnimatePresence>
                {contextMenu ? (
                    <TorrentTable_RowMenuInner
                        contextMenu={contextMenu}
                        onClose={onClose}
                        handleContextMenuAction={handleContextMenuAction}
                        queueMenuActions={queueMenuActions}
                        getContextMenuShortcut={getContextMenuShortcut}
                        onRequestSetDownloadLocation={openSetLocationModalFromContext}
                    />
                ) : null}
            </AnimatePresence>

            <SetDownloadPathModal
                isOpen={Boolean(setLocationTorrent)}
                titleKey={setLocationModalTitleKey}
                initialPath={resolveSetDownloadLocationPath(setLocationTorrent)}
                canPickDirectory={canPickDirectory}
                allowInvalidPathApply={allowInvalidSetLocationPathApply}
                onClose={closeSetLocationModal}
                onPickDirectory={browseSetLocationPath}
                onApply={applySetLocation}
            />
        </>
    );
}

function TorrentTable_RowMenuInner({
    contextMenu,
    onClose,
    handleContextMenuAction,
    queueMenuActions,
    getContextMenuShortcut,
    onRequestSetDownloadLocation,
}: {
    contextMenu: TableContextMenu;
    onClose: () => void;
    handleContextMenuAction: (
        key?: RowContextMenuKey,
    ) => Promise<TorrentCommandOutcome>;
    queueMenuActions: QueueMenuAction[];
    getContextMenuShortcut: (key: ContextMenuKey) => string;
    onRequestSetDownloadLocation: (torrent: Torrent) => void;
}) {
    const { t } = useTranslation();
    const { clipboardWriteSupported, canOpenFolder } = useUiModeCapabilities();
    const { showFeedback } = useActionFeedback();

    const contextTorrent = contextMenu.torrent;
    const shouldShowOpenFolder = canOpenFolder;
    const setLocationUiTextKeys = useMemo(
        () => getSetDownloadLocationUiTextKeys(contextTorrent),
        [contextTorrent],
    );

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
        async (key?: RowContextMenuKey) => {
            if (key === "set-download-location") {
                onRequestSetDownloadLocation(contextTorrent);
                return;
            }
            const outcome = await handleContextMenuAction(key);
            if (outcome.status === "unsupported") {
                showFeedback(t("torrent_modal.controls.not_supported"), "warning");
            } else if (outcome.status === "failed") {
                showFeedback(t("toolbar.feedback.failed"), "danger");
            }
        },
        [contextTorrent, handleContextMenuAction, onRequestSetDownloadLocation, showFeedback, t],
    );

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
                    onPress={() => void handleMenuActionPress("open-folder")}
                >
                    {t("table.actions.open_folder")}
                </DropdownItem>,
            );
        }

        items.push(
            <DropdownItem
                key="set-download-location"
                onPress={() => void handleMenuActionPress("set-download-location")}
                textValue={t(setLocationUiTextKeys.actionLabelKey)}
            >
                {t(setLocationUiTextKeys.actionLabelKey)}
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
        clipboardWriteSupported,
        getContextMenuShortcut,
        handleMenuActionPress,
        setLocationUiTextKeys.actionLabelKey,
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
