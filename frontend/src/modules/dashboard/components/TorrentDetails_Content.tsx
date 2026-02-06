import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@heroui/react";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import {
    FileExplorerTree,
    type FileExplorerContextAction,
    type FileExplorerEntry,
} from "@/shared/ui/workspace/FileExplorerTree";
import type { TorrentFileEntity } from "@/services/rpc/entities";
import { DETAILS_TAB_CONTENT_MAX_HEIGHT } from "@/config/logic";
import { useFileExplorerViewModel } from "@/modules/dashboard/viewModels/useFileExplorerViewModel";

interface ContentTabProps {
    files?: TorrentFileEntity[];
    emptyMessage: string;
    onFilesToggle?: (
        indexes: number[],
        wanted: boolean
    ) => Promise<void> | void;
    onFileContextAction?: (
        action: FileExplorerContextAction,
        entry: FileExplorerEntry
    ) => void;
    onRecheck?: () => void;
    onDownloadMissing?: () => void;
    onOpenFolder?: () => void;
    isStandalone?: boolean;
}


export const ContentTab = ({
    files,
    emptyMessage,
    onFilesToggle,
    onFileContextAction,
    onRecheck,
    onDownloadMissing,
    onOpenFolder,
    isStandalone,
}: ContentTabProps) => {
    const { t } = useTranslation();
    const explorer = useFileExplorerViewModel(
        files,
        onFilesToggle
    );
    const filesCount = explorer.files.length;

    const fileCountLabel =
        filesCount === 1
            ? t("torrent_modal.file_counts.count_single")
            : t("torrent_modal.file_counts.count_multiple", {
                  count: filesCount,
              });

    const fileExplorerViewModel = useMemo(
        () => ({
            files: explorer.files,
            emptyMessage,
            onFilesToggle: explorer.toggle,
            onFileContextAction,
        }),
        [explorer.files, explorer.toggle, emptyMessage, onFileContextAction]
    );

    if (filesCount === 0) {
        return (
            <div className="flex h-full min-h-0 flex-col gap-panel">
                <GlassPanel className="p-panel space-y-3 border border-warning/30 bg-warning/10">
                    <div className="text-scaled font-semibold uppercase tracking-tight text-warning">
                        {t("torrent_modal.files_empty")}
                    </div>
                    <div className="text-label text-warning/80 mb-tight">
                        {t("torrent_modal.files_recovery_desc")}
                    </div>
                    <div className="flex gap-tools mt-tight">
                        <Button
                            size="md"
                            variant="shadow"
                            color="primary"
                            onPress={onRecheck}
                            isDisabled={!onRecheck}
                        >
                            {t("toolbar.recheck")}
                        </Button>
                        <Button
                            size="md"
                            variant="shadow"
                            color="danger"
                            onPress={onDownloadMissing}
                            isDisabled={!onDownloadMissing}
                        >
                            {t("modals.download")}
                        </Button>
                        <Button
                            size="md"
                            variant="shadow"
                            color="default"
                            onPress={onOpenFolder}
                            isDisabled={!onOpenFolder}
                        >
                            {t("directory_browser.open")}
                        </Button>
                    </div>
                </GlassPanel>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-panel">
            {isStandalone ? (
                <GlassPanel className="p-panel space-y-3">
                    <div className="flex items-center justify-between gap-panel">
                        <div className="flex flex-col gap-tight">
                            <span className="text-scaled font-semibold uppercase tracking-tight text-foreground/60">
                                {t("torrent_modal.files_title")}
                            </span>
                            <p className="text-label text-foreground/60">
                                {t("torrent_modal.files_description")}
                            </p>
                        </div>
                        <span className="text-label font-semibold uppercase tracking-tight text-foreground/50">
                            {fileCountLabel}
                        </span>
                    </div>
                </GlassPanel>
            ) : (
                <div className="p-panel space-y-3">
                    <div className="flex items-center justify-between gap-panel">
                        <div className="flex flex-col gap-tight">
                            <span className="text-scaled font-semibold uppercase tracking-tight text-foreground/60">
                                {t("torrent_modal.files_title")}
                            </span>
                            <p className="text-label text-foreground/60">
                                {t("torrent_modal.files_description")}
                            </p>
                        </div>
                        <span className="text-label font-semibold uppercase tracking-tight text-foreground/50">
                            {fileCountLabel}
                        </span>
                    </div>
                </div>
            )}

            <GlassPanel className="flex flex-1 min-h-0 flex-col border border-default/15">
                <div className="border-b border-default/10 px-panel py-panel text-label font-semibold uppercase tracking-tight text-foreground/50">
                    {t("torrent_modal.tabs.content")}
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                    <div
                        className="h-full min-h-0 overflow-y-auto px-panel py-panel"
                        style={{ maxHeight: DETAILS_TAB_CONTENT_MAX_HEIGHT }}
                    >
                        <FileExplorerTree viewModel={fileExplorerViewModel} />
                    </div>
                </div>
            </GlassPanel>
        </div>
    );
};
