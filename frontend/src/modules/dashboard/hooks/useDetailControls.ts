import { useCallback } from "react";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import { useRequiredTorrentActions } from "@/app/context/TorrentActionsContext";
import { isRpcCommandError } from "@/services/rpc/errors";
import type { CapabilityKey, CapabilityState } from "@/app/types/capabilities";

interface UseDetailControlsParams {
    detailData: TorrentDetail | null;
    mutateDetail: (
        updater: (current: TorrentDetail) => TorrentDetail | null
    ) => void;
    updateCapabilityState: (
        capability: CapabilityKey,
        state: CapabilityState
    ) => void;
}

export function useDetailControls({
    detailData,
    mutateDetail,
    updateCapabilityState,
}: UseDetailControlsParams) {
    const { dispatch } = useRequiredTorrentActions();

    const handleFileSelectionChange = useCallback(
        async (indexes: number[], wanted: boolean) => {
            if (!detailData) return;
            const availableIndexes = new Set(
                detailData.files?.map((file) => file.index) ?? []
            );
            const validIndexes = indexes.filter((index) =>
                availableIndexes.has(index)
            );
            if (!validIndexes.length) return;
            const fileCount = detailData.files?.length ?? 0;
            const boundedIndexes = validIndexes.filter(
                (index) => index >= 0 && index < fileCount
            );
            if (!boundedIndexes.length) return;

            mutateDetail((current) => {
                if (!current.files) return current;
                const updatedFiles = current.files.map((file) =>
                    boundedIndexes.includes(file.index)
                        ? { ...file, wanted }
                        : file
                );
                return { ...current, files: updatedFiles };
            });
            await dispatch(
                TorrentIntents.setFilesWanted(
                    detailData.id,
                    boundedIndexes,
                    wanted
                )
            );
        },
        [detailData, mutateDetail, dispatch]
    );

    const handleSequentialToggle = useCallback(
        async (enabled: boolean) => {
            if (!detailData) return;
            mutateDetail((current) => ({
                ...current,
                sequentialDownload: enabled,
            }));
            try {
                await dispatch(
                    TorrentIntents.setSequentialDownload(
                        detailData.id,
                        enabled
                    )
                );
                updateCapabilityState("sequentialDownload", "supported");
            } catch (error) {
                if (isUnsupportedCapabilityError(error)) {
                    updateCapabilityState("sequentialDownload", "unsupported");
                }
            }
        },
        [detailData, mutateDetail, dispatch, updateCapabilityState]
    );

    const handleSuperSeedingToggle = useCallback(
        async (enabled: boolean) => {
            if (!detailData) return;
            mutateDetail((current) => ({ ...current, superSeeding: enabled }));
            try {
                await dispatch(
                    TorrentIntents.setSuperSeeding(detailData.id, enabled)
                );
                updateCapabilityState("superSeeding", "supported");
            } catch (error) {
                if (isUnsupportedCapabilityError(error)) {
                    updateCapabilityState("superSeeding", "unsupported");
                }
            }
        },
        [detailData, mutateDetail, dispatch, updateCapabilityState]
    );

    const isUnsupportedCapabilityError = (error: unknown) => {
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

    return {
        handleFileSelectionChange,
        handleSequentialToggle,
        handleSuperSeedingToggle,
    };
}
