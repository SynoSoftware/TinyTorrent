import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type {
    TorrentDetailEntity as TorrentDetail,
    LibtorrentPriority,
} from "@/services/rpc/entities";
import type { CapabilityStore } from "@/app/types/capabilities";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
interface UseDetailControlsParams {
    detailData: TorrentDetail | null;
    mutateDetail: (
        updater: (current: TorrentDetail) => TorrentDetail | null,
    ) => void;
    capabilities: CapabilityStore;
    dispatch: (intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>;
    registerPendingFilePriority: (
        torrentId: string,
        indexes: number[],
        priority: LibtorrentPriority,
    ) => number;
    clearPendingFilePriority: (
        torrentId: string,
        indexes: number[],
        reqId: number,
    ) => void;
}

export function useDetailControls({
    detailData,
    mutateDetail,
    capabilities,
    dispatch,
    registerPendingFilePriority,
    clearPendingFilePriority,
}: UseDetailControlsParams) {
    const { t } = useTranslation();
    const { showFeedback } = useActionFeedback();
    const { sequentialDownload, superSeeding } = capabilities;

    const handleFileSelectionChange = useCallback(
        async (indexes: number[], wanted: boolean) => {
            if (!detailData) return;
            const availableIndexes = new Set(
                detailData.files?.map((file) => file.index) ?? [],
            );
            const validIndexes = indexes.filter((index) =>
                availableIndexes.has(index),
            );
            if (!validIndexes.length) return;
            const fileCount = detailData.files?.length ?? 0;
            const boundedIndexes = validIndexes.filter(
                (index) => index >= 0 && index < fileCount,
            );
            if (!boundedIndexes.length) return;

            mutateDetail((current) => {
                if (!current.files) return current;
                const updatedFiles = current.files.map((file) =>
                    boundedIndexes.includes(file.index)
                        ? { ...file, wanted }
                        : file,
                );
                return { ...current, files: updatedFiles };
            });
            const outcome = await dispatch(
                TorrentIntents.setFilesWanted(
                    detailData.id,
                    boundedIndexes,
                    wanted,
                ),
            );
            if (outcome.status !== "applied") {
                mutateDetail((current) => {
                    if (!current.files) return current;
                    const updatedFiles = current.files.map((file) =>
                        boundedIndexes.includes(file.index)
                            ? { ...file, wanted: !wanted }
                            : file,
                    );
                    return { ...current, files: updatedFiles };
                });
            }
        },
        [detailData, mutateDetail, dispatch],
    );

    const handleSequentialToggle = useCallback(
        async (enabled: boolean) => {
            if (!detailData) return;
            if (sequentialDownload !== "supported") return;
            const previous = detailData.sequentialDownload;
            mutateDetail((current) => ({
                ...current,
                sequentialDownload: enabled,
            }));
            const outcome = await dispatch(
                TorrentIntents.setSequentialDownload(detailData.id, enabled),
            );
            if (outcome.status !== "applied") {
                mutateDetail((current) => ({
                    ...current,
                    sequentialDownload: previous,
                }));
            }
        },
        [detailData, mutateDetail, dispatch, sequentialDownload],
    );

    const handleFilePriorityChange = useCallback(
        async (indexes: number[], priority: LibtorrentPriority) => {
            if (!detailData) return;
            const availableIndexes = new Set(
                detailData.files?.map((file) => file.index) ?? [],
            );
            const validIndexes = indexes.filter((index) =>
                availableIndexes.has(index),
            );
            if (!validIndexes.length) return;
            const fileCount = detailData.files?.length ?? 0;
            const boundedIndexes = validIndexes.filter(
                (index) => index >= 0 && index < fileCount,
            );
            if (!boundedIndexes.length) return;

            const requestId = registerPendingFilePriority(
                detailData.id,
                boundedIndexes,
                priority,
            );

            const outcome = await dispatch(
                TorrentIntents.setFilesPriority(
                    detailData.id,
                    boundedIndexes,
                    priority,
                ),
            );
            if (outcome.status === "applied") {
                return;
            }

            clearPendingFilePriority(detailData.id, boundedIndexes, requestId);

            if (outcome.status === "unsupported") {
                showFeedback(t("torrent_modal.controls.not_supported"), "warning");
                return;
            }
            showFeedback(t("toolbar.feedback.failed"), "danger");
        },
        [
            detailData,
            dispatch,
            registerPendingFilePriority,
            clearPendingFilePriority,
            showFeedback,
            t,
        ],
    );

    const handleSuperSeedingToggle = useCallback(
        async (enabled: boolean) => {
            if (!detailData) return;
            if (superSeeding !== "supported") return;
            const previous = detailData.superSeeding;
            mutateDetail((current) => ({ ...current, superSeeding: enabled }));
            const outcome = await dispatch(
                TorrentIntents.setSuperSeeding(detailData.id, enabled),
            );
            if (outcome.status !== "applied") {
                mutateDetail((current) => ({
                    ...current,
                    superSeeding: previous,
                }));
            }
        },
        [detailData, mutateDetail, dispatch, superSeeding],
    );

    return {
        handleFileSelectionChange,
        handleFilePriorityChange,
        handleSequentialToggle,
        handleSuperSeedingToggle,
    };
}

