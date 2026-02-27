import { useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";

import { shellAgent } from "@/app/agents/shell-agent";
import { normalizeMagnetLink } from "@/app/utils/magnet";
import { registry } from "@/config/logic";
const { timing, shell, ui } = registry;

interface UseAddModalStateParams {
    onOpenAddMagnet: (magnetLink?: string) => void;
    onOpenAddTorrentFromFile: (file: File) => void;
}

type HandledMagnetEvent = {
    link: string;
    handledAtMs: number;
};

export function useAddModalState({
    onOpenAddMagnet,
    onOpenAddTorrentFromFile,
}: UseAddModalStateParams) {
    const lastHandledMagnetRef = useRef<HandledMagnetEvent | null>(null);

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            if (acceptedFiles.length) {
                onOpenAddTorrentFromFile(acceptedFiles[0]);
            }
        },
        [onOpenAddTorrentFromFile],
    );

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        noClick: true,
        noKeyboard: true,
        // Restrict the file picker to torrent files when opened programmatically.
        accept: {
            "application/x-bittorrent": [".torrent"],
        },
        multiple: false,
    });

    useEffect(() => {
        const handleMagnetEvent = (payload?: unknown) => {
            const link =
                typeof payload === "string"
                    ? payload
                    : typeof payload === "object" && payload !== null
                      ? (payload as { link?: string }).link
                      : undefined;
            const normalized = normalizeMagnetLink(link);
            if (!normalized) return;

            // Treat deep links as per-event state: dedupe only rapid duplicate bridge events.
            const now = Date.now();
            const previous = lastHandledMagnetRef.current;
            if (
                previous &&
                previous.link === normalized &&
                now - previous.handledAtMs < timing.ui.magnetEventDedupWindowMs
            ) {
                return;
            }

            lastHandledMagnetRef.current = {
                link: normalized,
                handledAtMs: now,
            };
            onOpenAddMagnet(normalized);
        };
        const cleanup = shellAgent.onMagnetLink(handleMagnetEvent);
        return cleanup;
    }, [onOpenAddMagnet]);

    return {
        getRootProps,
        getInputProps,
        isDragActive,
        open,
    };
}

