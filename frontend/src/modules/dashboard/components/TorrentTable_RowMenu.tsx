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
import { rowMenuKey } from "@/modules/dashboard/types/torrentTableSurfaces";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import { useTranslation } from "react-i18next";
import { useUiModeCapabilities } from "@/app/context/SessionContext";
import {
    useTorrentCommands,
} from "@/app/context/AppCommandContext";
import SetDownloadPathModal from "@/modules/dashboard/components/SetDownloadPathModal";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import {
    resolveSetDownloadLocationPolicy,
} from "@/modules/dashboard/domain/torrentRelocation";
import { useSetDownloadLocationFlow } from "@/modules/dashboard/hooks/useSetDownloadLocationFlow";

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
    const [setLocationTorrent, setSetLocationTorrent] = useState<Torrent | null>(null);
    const { setDownloadLocation } = useTorrentCommands();
    const setLocationFlow = useSetDownloadLocationFlow({
        torrent: setLocationTorrent,
        setDownloadLocation,
    });

    const closeSetLocationModal = useCallback(() => {
        setSetLocationTorrent(null);
    }, []);
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
                        setLocationPolicy={resolveSetDownloadLocationPolicy(
                            contextMenu.torrent,
                        )}
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
                titleKey={setLocationFlow.policy.modalTitleKey}
                initialPath={setLocationFlow.currentPath}
                canPickDirectory={setLocationFlow.canPickDirectory}
                allowCreatePath={setLocationFlow.policy.allowCreatePath}
                onClose={closeSetLocationModal}
                onPickDirectory={setLocationFlow.pickDirectoryForSetDownloadPath}
                onApply={setLocationFlow.applySetDownloadPath}
            />
        </>
    );
}

function TorrentTable_RowMenuInner({
    contextMenu,
    setLocationPolicy,
    onClose,
    handleContextMenuAction,
    queueMenuActions,
    getContextMenuShortcut,
    onRequestSetDownloadLocation,
}: {
    contextMenu: TableContextMenu;
    setLocationPolicy: ReturnType<typeof resolveSetDownloadLocationPolicy>;
    onClose: () => void;
    handleContextMenuAction: (
        key: RowContextMenuKey,
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
        async (key: RowContextMenuKey) => {
            if (key === rowMenuKey.setDownloadLocation) {
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
                    key={rowMenuKey.openFolder}
                    isDisabled={rowMenuViewModel.openFolderDisabled}
                    onPress={() =>
                        void handleMenuActionPress(rowMenuKey.openFolder)
                    }
                >
                    {t("table.actions.open_folder")}
                </DropdownItem>,
            );
        }

        items.push(
            <DropdownItem
                key={rowMenuKey.setDownloadLocation}
                onPress={() =>
                    void handleMenuActionPress(rowMenuKey.setDownloadLocation)
                }
                textValue={t(setLocationPolicy.actionLabelKey)}
            >
                {t(setLocationPolicy.actionLabelKey)}
            </DropdownItem>,
        );

        items.push(
            <DropdownItem
                key={rowMenuKey.copyHash}
                isDisabled={!clipboardWriteSupported}
                shortcut={getContextMenuShortcut(rowMenuKey.copyHash)}
                onPress={() => void handleMenuActionPress(rowMenuKey.copyHash)}
            >
                {t("table.actions.copy_hash")}
            </DropdownItem>,
        );

        items.push(
            <DropdownItem
                key={rowMenuKey.copyMagnet}
                isDisabled={!clipboardWriteSupported}
                shortcut={getContextMenuShortcut(rowMenuKey.copyMagnet)}
                onPress={() =>
                    void handleMenuActionPress(rowMenuKey.copyMagnet)
                }
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
        setLocationPolicy.actionLabelKey,
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

