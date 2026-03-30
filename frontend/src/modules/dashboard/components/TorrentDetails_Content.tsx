import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePreferences } from "@/app/context/PreferencesContext";
import { AlertPanel } from "@/shared/ui/layout/AlertPanel";
import { TABLE } from "@/shared/ui/layout/glass-surface";
import {
    FileExplorerTree,
    type FileExplorerToggleCommand,
    type FileExplorerToggleOutcome,
} from "@/shared/ui/workspace/FileExplorerTree";
import type { TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";
import type { TorrentFileEntity } from "@/services/rpc/entities";
import { textRole } from "@/config/textRoles";
import { useFileExplorerViewModel } from "@/modules/dashboard/viewModels/useFileExplorerViewModel";

interface ContentTabProps {
    torrent: Pick<TorrentDetail, "id" | "hash" | "savePath" | "downloadDir">;
    files?: TorrentFileEntity[];
    emptyMessage: string;
    onFilesToggle?: (indexes: number[], wanted: boolean) => Promise<void> | void;
    onSetPriority?: (
        indexes: number[],
        priority: import("@/services/rpc/entities").LibtorrentPriority,
    ) => Promise<void> | void;
    isStandalone?: boolean;
}

export const ContentTab = ({ torrent, files, emptyMessage, onFilesToggle, onSetPriority }: ContentTabProps) => {
    const { t } = useTranslation();
    const {
        preferences: { torrentFileTreeExpandedIdsByTorrent },
        setTorrentFileTreeExpandedIds,
    } = usePreferences();
    const torrentTreeKey = torrent.hash || torrent.id;
    const initialExpandedIds = useMemo(
        () => (torrentTreeKey.length > 0 ? (torrentFileTreeExpandedIdsByTorrent[torrentTreeKey] ?? []) : []),
        [torrentTreeKey, torrentFileTreeExpandedIdsByTorrent],
    );
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
            initialExpandedIds,
            emptyMessage,
            showProgress: true,
            onFilesToggle: explorer.toggle,
            onExpandedIdsChange:
                torrentTreeKey.length > 0
                    ? (expandedIds: readonly string[]) => setTorrentFileTreeExpandedIds(torrentTreeKey, expandedIds)
                    : undefined,
            onSetPriority,
        }),
        [
            explorer.files,
            initialExpandedIds,
            explorer.toggle,
            emptyMessage,
            setTorrentFileTreeExpandedIds,
            torrentTreeKey,
            onSetPriority,
        ],
    );

    if (filesCount === 0) {
        return (
            <div className={TABLE.detailsContentRoot}>
                <AlertPanel severity={isLoading ? "info" : "warning"} className={TABLE.detailsContentWarning}>
                    <div className={textRole.statusWarning}>{emptyMessage}</div>
                    {!isLoading ? (
                        <div className={TABLE.detailsContentRecoveryNote}>{t("torrent_modal.files_missing_desc")}</div>
                    ) : null}
                </AlertPanel>
            </div>
        );
    }

    return <FileExplorerTree key={torrentTreeKey} viewModel={fileExplorerViewModel} />;
};
