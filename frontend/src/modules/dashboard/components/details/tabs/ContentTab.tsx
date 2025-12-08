import { GlassPanel } from "../../../../../shared/ui/layout/GlassPanel";
import { FileExplorerTree } from "../../../../../shared/ui/workspace/FileExplorerTree";
import { useFileTree } from "../../../../../shared/hooks/useFileTree";
import type { TorrentFileEntity } from "../../../../../services/rpc/entities";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

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

    return (
        <div className="flex flex-col gap-3">
            <GlassPanel className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-[0.3em] text-foreground/60">
                        {t("torrent_modal.files_title")}
                    </div>
                    <span className="text-[11px] text-foreground/50">
                        {filesCount === 1
                            ? t("torrent_modal.file_counts.count_single")
                            : t("torrent_modal.file_counts.count_multiple", {
                                  count: filesCount,
                              })}
                    </span>
                </div>
                <div className="text-[11px] text-foreground/50">
                    {t("torrent_modal.files_description")}
                </div>
                    <div className="max-h-[320px] overflow-y-auto">
                        <FileExplorerTree
                            files={displayFiles}
                            emptyMessage={emptyMessage}
                            onFilesToggle={(indexes, wanted) =>
                                handleToggle(indexes, wanted)
                            }
                        />
                    </div>
                </GlassPanel>
            </div>
    );
};
