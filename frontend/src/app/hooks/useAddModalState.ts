import { useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";

import { NativeShell } from "@/app/runtime";
// TODO: Replace direct NativeShell usage with the ShellAgent/ShellExtensions adapter so deep-link events are centralized and automatically disabled when not connected to localhost.
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

    const {
        getRootProps,
        getInputProps,
        isDragActive,
        open,
    } = useDropzone({
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
    // TODO: If ShellAgent is unavailable (remote daemon/no bridge), ensure magnet deep-links are either disabled or handled via browser URL scheme, but never by calling NativeShell directly.

    return {
        getRootProps,
        getInputProps,
        isDragActive,
        open,
    };
}
