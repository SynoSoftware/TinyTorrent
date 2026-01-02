import { useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";

import { NativeShell } from "@/app/runtime";
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

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            if (acceptedFiles.length) {
                onOpenAddTorrentFromFile(acceptedFiles[0]);
            }
        },
        [onOpenAddTorrentFromFile]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        noClick: true,
        noKeyboard: true,
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
        const cleanup = NativeShell.onEvent("magnet-link", handleMagnetEvent);
        return cleanup;
    }, [onOpenAddMagnet]);

    return {
        getRootProps,
        getInputProps,
        isDragActive,
    };
}
