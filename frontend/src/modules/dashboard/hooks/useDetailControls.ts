import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type {
    TorrentDetailEntity as TorrentDetail,
    TransmissionPriority,
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
        priority: TransmissionPriority,
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

    const getBoundedFileIndexes = useCallback(
        (indexes: number[]) => {
            if (!detailData) return [];
            const availableIndexes = new Set(
                detailData.files?.map((file) => file.index) ?? [],
            );
            const validIndexes = indexes.filter((index) =>
                availableIndexes.has(index),
            );
            if (!validIndexes.length) return [];
            const fileCount = detailData.files?.length ?? 0;
            return validIndexes.filter(
                (index) => index >= 0 && index < fileCount,
            );
        },
        [detailData],
    );

    const applyFileSelectionChange = useCallback(
        async (indexes: number[], wanted: boolean) => {
            if (!detailData) return false;
            const boundedIndexes = getBoundedFileIndexes(indexes);
            if (!boundedIndexes.length) return false;
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
                return false;
            }

            return true;
        },
        [detailData, dispatch, getBoundedFileIndexes, mutateDetail],
    );

    const handleFileSelectionChange = useCallback(
        async (indexes: number[], wanted: boolean) => {
            await applyFileSelectionChange(indexes, wanted);
        },
        [applyFileSelectionChange],
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
        async (indexes: number[], priority: TransmissionPriority) => {
            if (!detailData) return;
            const boundedIndexes = getBoundedFileIndexes(indexes);
            if (!boundedIndexes.length) return;
            const filesByIndex = new Map(
                detailData.files?.map((file) => [file.index, file]) ?? [],
            );
            const indexesNeedingPriorityChange = boundedIndexes.filter((index) => {
                const file = filesByIndex.get(index);
                if (file?.wanted === false) {
                    return false;
                }
                return file?.priority == null || file.priority !== priority;
            });
            if (indexesNeedingPriorityChange.length === 0) {
                return;
            }

            const requestId = registerPendingFilePriority(
                detailData.id,
                indexesNeedingPriorityChange,
                priority,
            );

            const outcome = await dispatch(
                TorrentIntents.setFilesPriority(
                    detailData.id,
                    indexesNeedingPriorityChange,
                    priority,
                ),
            );
            if (outcome.status === "applied") {
                return;
            }

            clearPendingFilePriority(detailData.id, indexesNeedingPriorityChange, requestId);

            if (outcome.status === "unsupported") {
                showFeedback(t("torrent_modal.controls.not_supported"), "warning");
                return;
            }
            showFeedback(t("toolbar.feedback.failed"), "danger");
        },
        [
            detailData,
            dispatch,
            getBoundedFileIndexes,
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

