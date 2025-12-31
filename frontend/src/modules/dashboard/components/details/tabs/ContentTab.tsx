import { useMemo } from "react";
import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";

// All imports use '@/...' aliases. UI-owned optimistic logic and inline literals are flagged for future refactor per AGENTS.md.

import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import {
    FileExplorerTree,
    type FileExplorerContextAction,
    type FileExplorerEntry,
} from "@/shared/ui/workspace/FileExplorerTree";
import { useFileTree } from "@/shared/hooks/useFileTree";
import { useOptimisticToggle } from "@/shared/hooks/useOptimisticToggle";
import type { TorrentFileEntity } from "@/services/rpc/entities";
import { DETAILS_TAB_CONTENT_MAX_HEIGHT } from "@/config/logic";

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
}

const NOOP_FILE_TOGGLE: NonNullable<ContentTabProps["onFilesToggle"]> = () => {
    /* intentionally empty */
};

export const ContentTab = ({
    files,
    emptyMessage,
    onFilesToggle,
    onFileContextAction,
}: ContentTabProps) => {
    const { t } = useTranslation();
    const fileEntries = useFileTree(files);
    const filesCount = files?.length ?? 0;
    const { optimisticState, toggle } = useOptimisticToggle(
        onFilesToggle ?? NOOP_FILE_TOGGLE
    );

    const displayFiles = useMemo(() => {
        if (!Object.keys(optimisticState).length) return fileEntries;
        return fileEntries.map((entry) => {
            if (Object.prototype.hasOwnProperty.call(optimisticState, entry.index)) {
                return { ...entry, wanted: optimisticState[entry.index] };
            }
            return entry;
        });
    }, [fileEntries, optimisticState]);

    const fileCountLabel =
        filesCount === 1
            ? t("torrent_modal.file_counts.count_single")
            : t("torrent_modal.file_counts.count_multiple", {
                  count: filesCount,
              });

    if (filesCount === 0) {
        return (
            <div className="flex h-full min-h-0 flex-col gap-panel">
                <GlassPanel className="p-panel space-y-3 border border-warning/30 bg-warning/10">
                    <div className="text-scaled font-semibold uppercase tracking-tight text-warning">
                        {t("torrent_modal.files_empty")}
                    </div>
                    <div className="text-label text-warning/80 mb-tight">
                        {t("torrent_modal.files_recovery_desc", {
                            defaultValue:
                                "This torrent may be missing file metadata. Try rechecking or re-downloading.",
                        })}
                    </div>
                    <div className="flex gap-tools mt-tight">
                        <Button
                            size="md"
                            variant="shadow"
                            color="primary"
                            onPress={() => {
                                /* TODO: trigger recheck */
                            }}
                        >
                            {t("toolbar.recheck", {
                                defaultValue: "Recheck Torrent",
                            })}
                        </Button>
                        <Button
                            size="md"
                            variant="shadow"
                            color="danger"
                            onPress={() => {
                                /* TODO: remove and re-add torrent */
                            }}
                        >
                            {t("modals.download", {
                                defaultValue: "Re-download",
                            })}
                        </Button>
                        <Button
                            size="md"
                            variant="shadow"
                            color="default"
                            onPress={() => {
                                /* TODO: open folder */
                            }}
                        >
                            {t("directory_browser.open", {
                                defaultValue: "Open Folder",
                            })}
                        </Button>
                    </div>
                </GlassPanel>
            </div>
        );
    }
    return (
        <div className="flex h-full min-h-0 flex-col gap-panel">
            <GlassPanel className="p-panel space-y-3">
                <div className="flex items-center justify-between gap-panel">
                    <div className="flex flex-col gap-tight">
                        <span
                            className="text-scaled font-semibold uppercase tracking-tight text-foreground/60"
                        >
                            {t("torrent_modal.files_title")}
                        </span>
                        <p className="text-label text-foreground/60">
                            {t("torrent_modal.files_description")}
                        </p>
                    </div>
                    <span
                        className="text-label font-semibold uppercase tracking-tight text-foreground/50"
                    >
                        {fileCountLabel}
                    </span>
                </div>
            </GlassPanel>

            <GlassPanel className="flex flex-1 min-h-0 flex-col border border-default/15">
                <div
                    className="border-b border-default/10 px-panel py-panel text-label font-semibold uppercase tracking-tight text-foreground/50"
                >
                    {t("torrent_modal.tabs.content")}
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                    <div
                        className="h-full min-h-0 overflow-y-auto px-panel py-panel"
                        style={{ maxHeight: DETAILS_TAB_CONTENT_MAX_HEIGHT }}
                    >
                        <FileExplorerTree
                            files={displayFiles}
                            emptyMessage={emptyMessage}
                            onFilesToggle={toggle}
                            onFileContextAction={onFileContextAction}
                        />
                    </div>
                </div>
            </GlassPanel>
        </div>
    );
};
