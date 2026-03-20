import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertPanel } from "@/shared/ui/layout/AlertPanel";
import { TABLE } from "@/shared/ui/layout/glass-surface";
import {
    FileExplorerTree,
    type FileExplorerToggleCommand,
    type FileExplorerToggleOutcome,
} from "@/shared/ui/workspace/FileExplorerTree";
import type { TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";
import type { TorrentFileEntity } from "@/services/rpc/entities";
import { TEXT_ROLE } from "@/config/textRoles";
import { useFileExplorerViewModel } from "@/modules/dashboard/viewModels/useFileExplorerViewModel";

interface ContentTabProps {
    torrent: Pick<TorrentDetail, "id" | "hash" | "savePath" | "downloadDir">;
    files?: TorrentFileEntity[];
    emptyMessage: string;
    onFilesToggle?: (
        indexes: number[],
        wanted: boolean,
    ) => Promise<void> | void;
    onSetPriority?: (
        indexes: number[],
        priority: import("@/services/rpc/entities").LibtorrentPriority,
    ) => Promise<void> | void;
    isStandalone?: boolean;
}

export const ContentTab = ({
    files,
    emptyMessage,
    onFilesToggle,
    onSetPriority,
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

    const fileExplorerViewModel = useMemo(
        () => ({
            files: explorer.files,
            emptyMessage,
            showProgress: true,
            onFilesToggle: explorer.toggle,
            onSetPriority,
        }),
        [
            explorer.files,
            explorer.toggle,
            emptyMessage,
            onSetPriority,
        ],
    );

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

    return <FileExplorerTree viewModel={fileExplorerViewModel} />;
};



