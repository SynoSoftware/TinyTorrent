import { useCallback } from "react";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { CapabilityStore } from "@/app/types/capabilities";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import { isRpcCommandError } from "@/services/rpc/errors";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import { RpcCommandError } from "@/services/rpc/errors";
interface UseDetailControlsParams {
    detailData: TorrentDetail | null;
    mutateDetail: (
        updater: (current: TorrentDetail) => TorrentDetail | null,
    ) => void;
    capabilities: CapabilityStore;
    dispatch: (intent: TorrentIntentExtended) => Promise<void>;
}

export function useDetailControls({
    detailData,
    mutateDetail,
    capabilities,
    dispatch,
}: UseDetailControlsParams) {
    const { sequentialDownload, superSeeding } = capabilities;

    const isUnsupportedCapabilityError = (error: Error) => {
        if (!isRpcCommandError(error)) {
            return false;
        }
        const normalizedCode = error.code?.toLowerCase();
        if (normalizedCode === "invalid arguments") {
            return true;
        }
        const message = error.message?.toLowerCase() ?? "";
        return (
            message.includes("invalid arguments") ||
            message.includes("unsupported field") ||
            message.includes("field not found")
        );
    };

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
            await dispatch(
                TorrentIntents.setFilesWanted(
                    detailData.id,
                    boundedIndexes,
                    wanted,
                ),
            );
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
            try {
                await dispatch(
                    TorrentIntents.setSequentialDownload(
                        detailData.id,
                        enabled,
                    ),
                );
            } catch (error) {
                const typedError =
                    error instanceof Error
                        ? error
                        : new RpcCommandError(String(error));
                if (isUnsupportedCapabilityError(typedError)) {
                    // revert optimistic update when capability is unsupported
                    mutateDetail((current) => ({
                        ...current,
                        sequentialDownload: previous,
                    }));
                }
            }
        },
        [detailData, mutateDetail, dispatch, sequentialDownload],
    );

    const handleSuperSeedingToggle = useCallback(
        async (enabled: boolean) => {
            if (!detailData) return;
            if (superSeeding !== "supported") return;
            const previous = detailData.superSeeding;
            mutateDetail((current) => ({ ...current, superSeeding: enabled }));
            try {
                await dispatch(
                    TorrentIntents.setSuperSeeding(detailData.id, enabled),
                );
            } catch (error) {
                const typedError =
                    error instanceof Error
                        ? error
                        : new RpcCommandError(String(error));
                if (isUnsupportedCapabilityError(typedError)) {
                    // revert optimistic update when capability is unsupported
                    mutateDetail((current) => ({
                        ...current,
                        superSeeding: previous,
                    }));
                }
            }
        },
        [detailData, mutateDetail, dispatch, superSeeding],
    );

    return {
        handleFileSelectionChange,
        handleSequentialToggle,
        handleSuperSeedingToggle,
    };
}
