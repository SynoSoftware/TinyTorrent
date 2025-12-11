import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { GlassPanel } from "../../../../../shared/ui/layout/GlassPanel";
import { FileExplorerTree } from "../../../../../shared/ui/workspace/FileExplorerTree";
import { useFileTree } from "../../../../../shared/hooks/useFileTree";
import type { TorrentFileEntity } from "../../../../../services/rpc/entities";
import { DETAILS_TAB_CONTENT_MAX_HEIGHT } from "../../../../../config/logic";

interface ContentTabProps {
    files?: TorrentFileEntity[];
    emptyMessage: string;
    onFilesToggle?: (indexes: number[], wanted: boolean) => Promise<void> | void;
}

export const ContentTab = ({ files, emptyMessage, onFilesToggle }: ContentTabProps) => {
    const { t } = useTranslation();
    const fileEntries = useFileTree(files);
    const filesCount = files?.length ?? 0;
    const [optimistic, setOptimistic] = useState<Record<number, boolean>>({});

    const displayFiles = useMemo(() => {
        if (!Object.keys(optimistic).length) return fileEntries;
        return fileEntries.map((entry) => {
            if (optimistic.hasOwnProperty(entry.index)) {
                return { ...entry, wanted: optimistic[entry.index] };
            }
            return entry;
        });
    }, [fileEntries, optimistic]);

    const handleToggle = useCallback(
        (indexes: number[], wanted: boolean) => {
            if (!indexes.length) return;
            setOptimistic((prev) => {
                const next = { ...prev };
                indexes.forEach((index) => {
                    next[index] = wanted;
                });
                return next;
            });
            const result = onFilesToggle?.(indexes, wanted);
            if (!result) {
                setOptimistic((prev) => {
                    const next = { ...prev };
                    indexes.forEach((index) => delete next[index]);
                    return next;
                });
                return;
            }
            result.finally(() => {
                setOptimistic((prev) => {
                    const next = { ...prev };
                    indexes.forEach((index) => delete next[index]);
                    return next;
                });
            });
        },
        [onFilesToggle]
    );

    const fileCountLabel =
        filesCount === 1
            ? t("torrent_modal.file_counts.count_single")
            : t("torrent_modal.file_counts.count_multiple", {
                  count: filesCount,
              });

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <GlassPanel className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.35em] text-foreground/60">
                            {t("torrent_modal.files_title")}
                        </span>
                        <p className="text-xs text-foreground/60">
                            {t("torrent_modal.files_description")}
                        </p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-[0.35em] text-foreground/50">
                        {fileCountLabel}
                    </span>
                </div>
            </GlassPanel>

            <GlassPanel className="flex flex-1 min-h-0 flex-col border border-default/15 p-0">
                <div className="border-b border-default/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-foreground/50">
                    {t("torrent_modal.tabs.content")}
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                    <div
                        className="h-full min-h-0 overflow-y-auto px-4 py-3"
                        style={{ maxHeight: DETAILS_TAB_CONTENT_MAX_HEIGHT }}
                    >
                        <FileExplorerTree
                            files={displayFiles}
                            emptyMessage={emptyMessage}
                            onFilesToggle={handleToggle}
                        />
                    </div>
                </div>
            </GlassPanel>
        </div>
    );
};
