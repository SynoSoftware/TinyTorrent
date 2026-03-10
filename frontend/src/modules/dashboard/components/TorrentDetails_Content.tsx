import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertPanel } from "@/shared/ui/layout/AlertPanel";
import { TABLE } from "@/shared/ui/layout/glass-surface";
import {
    FileExplorerTree,
    type FileExplorerContextAction,
    type FileExplorerEntry,
    type FileExplorerToggleCommand,
    type FileExplorerToggleOutcome,
} from "@/shared/ui/workspace/FileExplorerTree";
import type { TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";
import type { TorrentFileEntity } from "@/services/rpc/entities";
import { registry } from "@/config/logic";
import { TEXT_ROLE } from "@/config/textRoles";
import { useFileExplorerViewModel } from "@/modules/dashboard/viewModels/useFileExplorerViewModel";
const { visualizations } = registry;

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
    const isLoading = files == null;

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
    const contentHostClassName = isStandalone
        ? `${TABLE.detailsContentPanel} ${TABLE.detailsContentListHost}`
        : TABLE.detailsContentListHost;

    if (filesCount === 0) {
        return (
            <div className={TABLE.detailsContentRoot}>
                <AlertPanel
                    severity={isLoading ? "info" : "warning"}
                    className={TABLE.detailsContentWarning}
                >
                    <div className={TEXT_ROLE.statusWarning}>
                        {emptyMessage}
                    </div>
                    {!isLoading ? (
                        <div className={TABLE.detailsContentRecoveryNote}>
                            {t("torrent_modal.files_missing_desc")}
                        </div>
                    ) : null}
                </AlertPanel>
            </div>
        );
    }

    return (
        <div className={TABLE.detailsContentRoot}>
            <div className={TABLE.detailsContentHeaderShell}>
                <div className={TABLE.detailsContentHeaderRow}>
                    <div className={TABLE.detailsContentHeaderMeta}>
                        <span className={TABLE.detailsContentHeaderTitle}>
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

            <div className={contentHostClassName}>
                <div
                    className={TABLE.detailsContentListScroll}
                    style={TABLE.builder.detailsContentScrollStyle(
                        visualizations.details.tabContentMaxHeight,
                    )}
                >
                    <FileExplorerTree viewModel={fileExplorerViewModel} />
                </div>
            </div>
        </div>
    );
};



