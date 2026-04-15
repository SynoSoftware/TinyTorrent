import React, { useCallback, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Checkbox, DropdownItem, DropdownMenu, cn } from "@heroui/react";
import { getCapabilityUiState, type CapabilityState } from "@/app/types/capabilities";
import {
    contextMenu as contextMenuStyles,
    formControl as formControlStyles,
    surface as menuSurfaceStyles,
} from "@/shared/ui/layout/glass-surface";
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
import { useTorrentCommands } from "@/app/context/AppCommandContext";
import TorrentTable_ContextMenuSurface from "@/modules/dashboard/components/TorrentTable_ContextMenuSurface";
import SetDownloadPathModal from "@/modules/dashboard/components/SetDownloadPathModal";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { resolveSetDownloadLocationPolicy } from "@/modules/dashboard/domain/torrentRelocation";
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
    const {
        contextMenu,
        contextTorrent,
        sequentialDownloadCapability,
        onClose,
        handleContextMenuAction,
        queueMenuActions,
        getContextMenuShortcut,
    } = viewModel;
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
                {contextMenu && contextTorrent ? (
                    <TorrentTable_RowMenuInner
                        contextMenu={contextMenu}
                        contextTorrent={contextTorrent}
                        sequentialDownloadCapability={sequentialDownloadCapability}
                        setLocationPolicy={resolveSetDownloadLocationPolicy(contextTorrent)}
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
    contextTorrent,
    sequentialDownloadCapability,
    setLocationPolicy,
    onClose,
    handleContextMenuAction,
    queueMenuActions,
    getContextMenuShortcut,
    onRequestSetDownloadLocation,
}: {
    contextMenu: TableContextMenu;
    contextTorrent: Torrent;
    sequentialDownloadCapability: CapabilityState;
    setLocationPolicy: ReturnType<typeof resolveSetDownloadLocationPolicy>;
    onClose: () => void;
    handleContextMenuAction: (key: RowContextMenuKey) => Promise<TorrentCommandOutcome>;
    queueMenuActions: QueueMenuAction[];
    getContextMenuShortcut: (key: ContextMenuKey) => string;
    onRequestSetDownloadLocation: (torrent: Torrent) => void;
}) {
    const { t } = useTranslation();
    const { clipboardWriteSupported, canOpenFolder } = useUiModeCapabilities();
    const { showFeedback } = useActionFeedback();
    const shouldShowOpenFolder = canOpenFolder;
    const sequentialUiState = getCapabilityUiState(sequentialDownloadCapability);

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

    const menuItems = useMemo(() => {
        const items: Array<React.ReactElement> = [];

        items.push(
            ...rowMenuViewModel.actions.map((item) => (
                <DropdownItem
                    key={item.key}
                    textValue={item.label}
                    onPress={() => void handleMenuActionPress(item.key)}
                    isDisabled={item.disabled}
                >
                    <div className="flex items-center justify-between gap-tools">
                        <span>{item.label}</span>
                        {item.shortcut ? <span className="text-foreground/50">{item.shortcut}</span> : null}
                    </div>
                </DropdownItem>
            )),
        );

        if (sequentialUiState.supported) {
            const sequentialEnabled = Boolean(contextTorrent.sequentialDownload);
            const toggleSequentialDownload = () => void handleMenuActionPress(rowMenuKey.toggleSequentialDownload);
            items.push(
                <DropdownItem
                    key={rowMenuKey.toggleSequentialDownload}
                    textValue={t(
                        sequentialEnabled
                            ? "table.actions.disable_sequential_download"
                            : "table.actions.enable_sequential_download",
                    )}
                    onPress={toggleSequentialDownload}
                >
                    <div className="flex items-center gap-tools">
                        <span className="pointer-events-none">
                            <Checkbox
                                isSelected={sequentialEnabled}
                                className={formControlStyles.checkboxMarginRightClassNames.base}
                            />
                        </span>
                        <span>
                            {t(
                                sequentialEnabled
                                    ? "table.actions.disable_sequential_download"
                                    : "table.actions.enable_sequential_download",
                            )}
                        </span>
                    </div>
                </DropdownItem>,
            );
        }

        items.push(
            <DropdownItem
                key="queue-heading"
                isDisabled
                className={cn(contextMenuStyles.sectionHeading, menuSurfaceStyles.menu.sectionHeading)}
            >
                {rowMenuViewModel.dataTitle}
            </DropdownItem>,
        );

        items.push(
            ...rowMenuViewModel.queueActions.map((action) => (
                <DropdownItem
                    key={action.key}
                    className={contextMenuStyles.sectionNestedItem}
                    textValue={action.label}
                    onPress={() => void handleMenuActionPress(action.key)}
                >
                    <div className="flex items-center justify-between gap-tools">
                        <span>{action.label}</span>
                        <span className="text-foreground/50">{getContextMenuShortcut(action.key)}</span>
                    </div>
                </DropdownItem>
            )),
        );

        items.push(
            <DropdownItem
                key="data-title"
                isDisabled
                className={cn(contextMenuStyles.sectionHeadingStrong, menuSurfaceStyles.menu.sectionHeading)}
                style={contextMenuStyles.sectionHeadingTrackingStyle}
            >
                {t("table.data.title")}
            </DropdownItem>,
        );

        if (rowMenuViewModel.showOpenFolder) {
            items.push(
                <DropdownItem
                    key={rowMenuKey.openFolder}
                    isDisabled={rowMenuViewModel.openFolderDisabled}
                    onPress={() => void handleMenuActionPress(rowMenuKey.openFolder)}
                >
                    {t("table.actions.open_folder")}
                </DropdownItem>,
            );
        }

        items.push(
            <DropdownItem
                key={rowMenuKey.setDownloadLocation}
                onPress={() => void handleMenuActionPress(rowMenuKey.setDownloadLocation)}
                textValue={t(setLocationPolicy.actionLabelKey)}
            >
                {t(setLocationPolicy.actionLabelKey)}
            </DropdownItem>,
        );

        items.push(
                <DropdownItem
                    key={rowMenuKey.copyHash}
                    isDisabled={!clipboardWriteSupported}
                    textValue={t("table.actions.copy_hash")}
                    onPress={() => void handleMenuActionPress(rowMenuKey.copyHash)}
                >
                    <div className="flex items-center justify-between gap-tools">
                        <span>{t("table.actions.copy_hash")}</span>
                        <span className="text-foreground/50">
                            {getContextMenuShortcut(rowMenuKey.copyHash)}
                        </span>
                    </div>
                </DropdownItem>,
        );

        items.push(
                <DropdownItem
                    key={rowMenuKey.copyMagnet}
                    isDisabled={!clipboardWriteSupported}
                    textValue={t("table.actions.copy_magnet")}
                    onPress={() => void handleMenuActionPress(rowMenuKey.copyMagnet)}
                >
                    <div className="flex items-center justify-between gap-tools">
                        <span>{t("table.actions.copy_magnet")}</span>
                        <span className="text-foreground/50">
                            {getContextMenuShortcut(rowMenuKey.copyMagnet)}
                        </span>
                    </div>
                </DropdownItem>,
        );

        items.push(
            <DropdownItem
                key="remove"
                textValue={t("table.actions.remove")}
                onPress={() => void handleMenuActionPress("remove")}
            >
                <div className="flex items-center justify-between gap-tools">
                    <span>{t("table.actions.remove")}</span>
                    <span className="text-foreground/50">{getContextMenuShortcut("remove")}</span>
                </div>
            </DropdownItem>,
        );

        items.push(
            <DropdownItem
                key="remove-with-data"
                textValue={t("table.actions.remove_with_data")}
                onPress={() => void handleMenuActionPress("remove-with-data")}
            >
                <div className="flex items-center justify-between gap-tools">
                    <span>{t("table.actions.remove_with_data")}</span>
                    <span className="text-foreground/50">
                        {getContextMenuShortcut("remove-with-data")}
                    </span>
                </div>
            </DropdownItem>,
        );

        return items;
    }, [
        rowMenuViewModel,
        clipboardWriteSupported,
        getContextMenuShortcut,
        handleMenuActionPress,
        contextTorrent.sequentialDownload,
        sequentialUiState.supported,
        setLocationPolicy.actionLabelKey,
        t,
    ]);

    const rect = contextMenu.virtualElement.getBoundingClientRect();
    return (
        <TorrentTable_ContextMenuSurface
            anchorRect={rect}
            className={menuSurfaceStyles.menu.surface}
            onClose={handleMenuClose}
        >
            <DropdownMenu autoFocus="first">{menuItems}</DropdownMenu>
        </TorrentTable_ContextMenuSurface>
    );
}
