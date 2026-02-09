import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { PANEL_SURFACE_INSET_FRAME } from "@/shared/ui/layout/glass-surface";
import {
    FileExplorerTree,
    type FileExplorerContextAction,
    type FileExplorerEntry,
    type FileExplorerToggleCommand,
    type FileExplorerToggleOutcome,
} from "@/shared/ui/workspace/FileExplorerTree";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { TorrentFileEntity } from "@/services/rpc/entities";
import { DETAILS_TAB_CONTENT_MAX_HEIGHT } from "@/config/logic";
import { useFileExplorerViewModel } from "@/modules/dashboard/viewModels/useFileExplorerViewModel";

interface ContentTabProps {
    torrent: Pick<TorrentDetail, "id" | "hash" | "savePath" | "downloadDir">;
    files?: TorrentFileEntity[];
    emptyMessage: string;
    onFilesToggle?: (
        indexes: number[],
        wanted: boolean,
    ) => Promise<void> | void;
    onFileContextAction?: (
        action: FileExplorerContextAction,
        entry: FileExplorerEntry,
    ) => void;
    isStandalone?: boolean;
}

export const ContentTab = ({
    files,
    emptyMessage,
    onFilesToggle,
    onFileContextAction,
    isStandalone,
}: ContentTabProps) => {
    const { t } = useTranslation();
    const fileToggleCommand = React.useCallback<FileExplorerToggleCommand>(
        async (indexes: number[], wanted: boolean) => {
            if (!onFilesToggle) {
                return {
                    status: "unsupported",
                    reason: "missing_handler",
                } satisfies FileExplorerToggleOutcome;
            }
            try {
                await onFilesToggle(indexes, wanted);
                return {
                    status: "success",
                } satisfies FileExplorerToggleOutcome;
            } catch {
                return {
                    status: "failed",
                    reason: "execution_failed",
                } satisfies FileExplorerToggleOutcome;
            }
        },
        [onFilesToggle],
    );
    const explorer = useFileExplorerViewModel(files, fileToggleCommand);
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
        [explorer.files, explorer.toggle, emptyMessage, onFileContextAction],
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

            <GlassPanel
                className={`flex flex-1 min-h-0 flex-col ${PANEL_SURFACE_INSET_FRAME}`}
            >
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
