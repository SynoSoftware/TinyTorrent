import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";

import {
    findMagnetInString,
    normalizeMagnetLink,
    resolveDeepLinkMagnet,
} from "../utils/magnet";

interface UseAddModalStateParams {
    openAddModal: () => void;
    isAddModalOpen: boolean;
}

export function useAddModalState({ openAddModal, isAddModalOpen }: UseAddModalStateParams) {
    const [pendingTorrentFile, setPendingTorrentFile] = useState<File | null>(null);
    const [incomingMagnetLink, setIncomingMagnetLink] = useState<string | null>(null);
    const deepLinkHandledRef = useRef(false);

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            if (acceptedFiles.length) {
                setPendingTorrentFile(acceptedFiles[0]);
            }
            openAddModal();
        },
        [openAddModal]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        noClick: true,
        noKeyboard: true,
    });

    useEffect(() => {
        if (deepLinkHandledRef.current) return;
        const magnet = resolveDeepLinkMagnet();
        if (!magnet) return;
        deepLinkHandledRef.current = true;
        setPendingTorrentFile(null);
        setIncomingMagnetLink(magnet);
        openAddModal();
    }, [openAddModal]);

    useEffect(() => {
        if (!isAddModalOpen) return;
        if (incomingMagnetLink || pendingTorrentFile) return;
        if (typeof navigator === "undefined" || !navigator.clipboard?.readText)
            return;

        let active = true;
        const tryPasteClipboard = async () => {
            try {
                const clipboardText = await navigator.clipboard.readText();
                if (!active || !clipboardText) return;
                const magnet =
                    normalizeMagnetLink(clipboardText) ??
                    normalizeMagnetLink(
                        findMagnetInString(clipboardText)
                    );
                if (magnet) {
                    setIncomingMagnetLink(magnet);
                }
            } catch {
                // Ignore permission issues or unsupported environments.
            }
        };
        void tryPasteClipboard();
        return () => {
            active = false;
        };
    }, [incomingMagnetLink, isAddModalOpen, pendingTorrentFile]);

    const clearPendingTorrentFile = useCallback(() => {
        setPendingTorrentFile(null);
    }, []);

    const clearIncomingMagnetLink = useCallback(() => {
        setIncomingMagnetLink(null);
    }, []);

    return {
        getRootProps,
        getInputProps,
        isDragActive,
        pendingTorrentFile,
        incomingMagnetLink,
        setPendingTorrentFile,
        setIncomingMagnetLink,
        clearPendingTorrentFile,
        clearIncomingMagnetLink,
    };
}
