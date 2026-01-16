import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@heroui/react";
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
import { useRequiredTorrentActions } from "@/app/context/TorrentActionsContext";
import { TorrentIntents } from "@/app/intents/torrentIntents";

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
    torrent?: any;
    // TODO: Remove `any`. Define the minimal typed shape needed by this tab (id/hash/savePath/etc) or pass only what is needed.
    isStandalone?: boolean;
}

const NOOP_FILE_TOGGLE: NonNullable<
    ContentTabProps["onFilesToggle"]
> = async () => {
    /* no-op */
};

// TODO: View-model boundary: this tab currently dispatches intents directly via TorrentActionsContext.
// TODO: That is acceptable as a stopgap, but target architecture is:
// TODO: - Tabs emit UI intents/events
// TODO: - A single Dashboard/App view-model decides how to execute them (EngineAdapter) and when to refresh.
// TODO: This keeps tab components stable and reduces regressions when AI edits the dispatch layer.

export const ContentTab = ({
    files,
    emptyMessage,
    onFilesToggle,
    onFileContextAction,
    torrent,
    isStandalone,
}: ContentTabProps) => {
    const { t } = useTranslation();
    const { dispatch } = useRequiredTorrentActions();

    const fileEntries = useFileTree(files);
    const filesCount = fileEntries.length;

    const { optimisticState, toggle } = useOptimisticToggle(
        onFilesToggle ?? NOOP_FILE_TOGGLE
    );

    const displayFiles = useMemo(() => {
        if (!Object.keys(optimisticState).length) return fileEntries;
        return fileEntries.map((entry) => {
            if (
                Object.prototype.hasOwnProperty.call(
                    optimisticState,
                    entry.index
                )
            ) {
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
                        {t("torrent_modal.files_recovery_desc")}
                    </div>
                    <div className="flex gap-tools mt-tight">
                        <Button
                            size="md"
                            variant="shadow"
                            color="primary"
                            onPress={() =>
                                void dispatch(
                                    TorrentIntents.ensureValid(
                                        torrent?.id ?? torrent?.hash
                                    )
                                )
                            }
                        >
                            {t("toolbar.recheck")}
                        </Button>
                        <Button
                            size="md"
                            variant="shadow"
                            color="danger"
                            onPress={() =>
                                void dispatch(
                                    TorrentIntents.ensureDataPresent(
                                        torrent?.id ?? torrent?.hash
                                    )
                                )
                            }
                        >
                            {t("modals.download")}
                        </Button>
                        <Button
                            size="md"
                            variant="shadow"
                            color="default"
                            onPress={() =>
                                void dispatch(
                                    TorrentIntents.ensureAtLocation(
                                        torrent?.id ?? torrent?.hash,
                                        torrent?.savePath ?? ""
                                    )
                                )
                            }
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
