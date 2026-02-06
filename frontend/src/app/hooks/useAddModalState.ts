import { useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";

import { useShellAgent } from "@/app/hooks/useShellAgent";
import { normalizeMagnetLink } from "@/app/utils/magnet";

interface UseAddModalStateParams {
    onOpenAddMagnet: (magnetLink?: string) => void;
    onOpenAddTorrentFromFile: (file: File) => void;
}

export function useAddModalState({
    onOpenAddMagnet,
    onOpenAddTorrentFromFile,
}: UseAddModalStateParams) {
    const deepLinkHandledRef = useRef(false);
    const { shellAgent } = useShellAgent();

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
            if (deepLinkHandledRef.current) return;
            const link =
                typeof payload === "string"
                    ? payload
                    : typeof payload === "object" && payload !== null
                      ? (payload as { link?: string }).link
                      : undefined;
            const normalized = normalizeMagnetLink(link);
            if (!normalized) return;
            deepLinkHandledRef.current = true;
            onOpenAddMagnet(normalized);
        };
        const cleanup = shellAgent.onMagnetLink(handleMagnetEvent);
        return cleanup;
    }, [onOpenAddMagnet, shellAgent]);

    return {
        getRootProps,
        getInputProps,
        isDragActive,
        open,
    };
}
