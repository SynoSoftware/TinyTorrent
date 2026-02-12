import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { AlertPanel } from "@/shared/ui/layout/AlertPanel";
import {
    buildTableDetailsContentScrollStyle,
    STANDARD_SURFACE_CLASS,
    TABLE_VIEW_CLASS,
} from "@/shared/ui/layout/glass-surface";
import {
    FileExplorerTree,
    type FileExplorerContextAction,
    type FileExplorerEntry,
    type FileExplorerToggleCommand,
    type FileExplorerToggleOutcome,
} from "@/shared/ui/workspace/FileExplorerTree";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { TorrentFileEntity } from "@/services/rpc/entities";
import {
    DETAILS_TAB_CONTENT_MAX_HEIGHT,
} from "@/config/logic";
import { TEXT_ROLE, withColor, withOpacity } from "@/config/textRoles";
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
            <div className={TABLE_VIEW_CLASS.detailsContentRoot}>
                <AlertPanel severity="warning" className={TABLE_VIEW_CLASS.detailsContentWarning}>
                    <div className={TEXT_ROLE.statusWarning}>
                        {t("torrent_modal.files_empty")}
                    </div>
                    <div className={`${withColor(TEXT_ROLE.caption, "warning")} text-warning/80 mb-tight`}>
                        {t("torrent_modal.files_recovery_desc")}
                    </div>
                </AlertPanel>
            </div>
        );
    }

    return (
        <div className={TABLE_VIEW_CLASS.detailsContentRoot}>
            {isStandalone ? (
                <GlassPanel className={TABLE_VIEW_CLASS.detailsContentHeaderShell}>
                    <div className={TABLE_VIEW_CLASS.detailsContentHeaderRow}>
                        <div className={TABLE_VIEW_CLASS.detailsContentHeaderMeta}>
                            <span className={withOpacity(TEXT_ROLE.headingSection, 60)}>
                                {t("torrent_modal.files_title")}
                            </span>
                            <p className={TEXT_ROLE.caption}>
                                {t("torrent_modal.files_description")}
                            </p>
                        </div>
                        <span className={TEXT_ROLE.labelPrimary}>
                            {fileCountLabel}
                        </span>
                    </div>
                </GlassPanel>
            ) : (
                <div className={TABLE_VIEW_CLASS.detailsContentHeaderShell}>
                    <div className={TABLE_VIEW_CLASS.detailsContentHeaderRow}>
                        <div className={TABLE_VIEW_CLASS.detailsContentHeaderMeta}>
                            <span className={withOpacity(TEXT_ROLE.headingSection, 60)}>
                                {t("torrent_modal.files_title")}
                            </span>
                            <p className={TEXT_ROLE.caption}>
                                {t("torrent_modal.files_description")}
                            </p>
                        </div>
                        <span className={TEXT_ROLE.labelPrimary}>
                            {fileCountLabel}
                        </span>
                    </div>
                </div>
            )}

            <GlassPanel
                className={`flex flex-1 min-h-0 flex-col ${STANDARD_SURFACE_CLASS.frame.panelInset}`}
            >
                <div className={TABLE_VIEW_CLASS.detailsContentSectionHeader}>
                    {t("torrent_modal.tabs.content")}
                </div>
                <div className={TABLE_VIEW_CLASS.detailsContentListHost}>
                    <div
                        className={TABLE_VIEW_CLASS.detailsContentListScroll}
                        style={buildTableDetailsContentScrollStyle(
                            DETAILS_TAB_CONTENT_MAX_HEIGHT,
                        )}
                    >
                        <FileExplorerTree viewModel={fileExplorerViewModel} />
                    </div>
                </div>
            </GlassPanel>
        </div>
    );
};
