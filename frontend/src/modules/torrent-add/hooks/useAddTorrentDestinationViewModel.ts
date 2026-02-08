import { useCallback, useRef, useState } from "react";
import type { DragEvent } from "react";
import { describePathKind, isValidDestinationForMode } from "@/modules/torrent-add/utils/destination";
import { useUiModeCapabilities } from "@/app/context/SessionContext";

export interface UseAddTorrentDestinationViewModelParams {
    downloadDir: string;
    onDownloadDirChange: (value: string) => void;
    // TODO(section 21.9): avoid threading browse behavior callbacks through modal hooks;
    // consume a single command surface at the leaf boundary.
    onBrowseDirectory?: (
        currentPath: string
    ) => Promise<string | null | undefined>;
    addTorrentHistory: string[];
    setAddTorrentHistory: (next: string[]) => void;
}

export interface UseAddTorrentDestinationViewModelResult {
    destinationDraft: string;
    updateDestinationDraft: (value: string) => void;
    destinationGateCompleted: boolean;
    destinationGateTried: boolean;
    markGateTried: () => void;
    completeGate: () => void;
    resetForOpen: () => void;
    dropActive: boolean;
    isTouchingDirectory: boolean;
    handleDrop: (event: DragEvent<HTMLDivElement>) => void;
    handleDragOver: (event: DragEvent) => void;
    handleDragLeave: () => void;
    handleBrowse: () => Promise<void>;
    pushRecentPath: (path: string) => void;
    applyDroppedPath: (path?: string) => void;
}

export function useAddTorrentDestinationViewModel({
    downloadDir,
    onDownloadDirChange,
    onBrowseDirectory,
    addTorrentHistory,
    setAddTorrentHistory,
}: UseAddTorrentDestinationViewModelParams): UseAddTorrentDestinationViewModelResult {
    const { uiMode } = useUiModeCapabilities();
    const [destinationDraft, setDestinationDraft] = useState("");
    const [destinationGateCompleted, setDestinationGateCompleted] = useState(false);
    const [destinationGateTried, setDestinationGateTried] = useState(false);
    const [isTouchingDirectory, setIsTouchingDirectory] = useState(false);
    const [dropActive, setDropActive] = useState(false);
    const dropActiveRef = useRef(false);

    const pushRecentPath = useCallback(
        (path: string) => {
            const trimmed = path.trim();
            if (!trimmed) return;
            const next = [trimmed, ...addTorrentHistory.filter((item) => item !== trimmed)];
            setAddTorrentHistory(next.slice(0, 6));
        },
        [addTorrentHistory, setAddTorrentHistory]
    );

    const updateDestinationDraft = useCallback((value: string) => {
        setDestinationDraft(value);
    }, []);

    const markGateTried = useCallback(() => {
        setDestinationGateTried(true);
    }, []);

    const completeGate = useCallback(() => {
        setDestinationGateCompleted(true);
    }, []);

    const resetForOpen = useCallback(() => {
        const isInitiallyValid = isValidDestinationForMode(downloadDir, uiMode);
        setDestinationGateCompleted(isInitiallyValid);
        setDestinationGateTried(false);
        setDestinationDraft(isInitiallyValid ? downloadDir : "");
        setDropActive(false);
        dropActiveRef.current = false;
    }, [downloadDir, uiMode]);

    const applyDroppedPath = useCallback(
        (path?: string) => {
            if (!path) return;
            const trimmed = path.trim();
            if (!trimmed) return;

            if (!destinationGateCompleted) {
                setDestinationDraft(trimmed);
                return;
            }

            setDestinationDraft(trimmed);
            if (isValidDestinationForMode(trimmed, uiMode)) {
                onDownloadDirChange(trimmed);
                pushRecentPath(trimmed);
            }
        },
        [destinationGateCompleted, onDownloadDirChange, pushRecentPath, uiMode]
    );

    const handleDrop = useCallback(
        (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setDropActive(false);
            dropActiveRef.current = false;
            if (uiMode !== "Full") return;
            const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
            let path: string | undefined;
            if (droppedFiles.length) {
                const file = droppedFiles[0] as File & {
                    path?: string;
                    webkitRelativePath?: string;
                };
                path = file.path || file.webkitRelativePath;
            }
            if (!path) {
                path = event.dataTransfer?.getData("text/plain")?.trim();
            }
            if (!path) return;
            if (/^[a-zA-Z]:[\\/]fakepath[\\/]/i.test(path)) return;
            if (describePathKind(path).kind === "unknown") return;
            if (droppedFiles.length > 0 && path) {
                const droppedName = droppedFiles[0]?.name?.trim();
                const normalizedPath = path.replace(/\//g, "\\");
                const droppedLooksLikeFile = Boolean(
                    droppedName && /\.[^\\/.]+$/.test(droppedName)
                );
                if (
                    droppedLooksLikeFile &&
                    droppedName &&
                    normalizedPath
                        .toLowerCase()
                        .endsWith(`\\${droppedName.toLowerCase()}`)
                ) {
                    const parent = normalizedPath.replace(/[\\][^\\]+$/, "");
                    if (parent) {
                        path = /^[a-zA-Z]:$/i.test(parent)
                            ? `${parent}\\`
                            : parent;
                    }
                }
            }
            applyDroppedPath(path);
        },
        [applyDroppedPath, uiMode]
    );

    const handleDragOver = useCallback(
        (event: DragEvent) => {
            event.preventDefault();
            if (uiMode !== "Full") return;
            if (dropActiveRef.current) return;
            dropActiveRef.current = true;
            setDropActive(true);
        },
        [uiMode]
    );

    const handleDragLeave = useCallback(() => {
        dropActiveRef.current = false;
        setDropActive(false);
    }, []);

    const handleBrowse = useCallback(async () => {
        // TODO(section 20.2/20.5): return typed browse outcomes
        // (picked|cancelled|unsupported|failed) instead of Promise<void> + silent no-op.
        if (!onBrowseDirectory) return;
        setIsTouchingDirectory(true);
        try {
            const start = destinationGateCompleted ? downloadDir : destinationDraft;
            const next = await onBrowseDirectory(start);
            if (next) applyDroppedPath(next);
        } finally {
            setIsTouchingDirectory(false);
        }
    }, [
        applyDroppedPath,
        destinationDraft,
        destinationGateCompleted,
        downloadDir,
        onBrowseDirectory,
    ]);

    return {
        destinationDraft,
        updateDestinationDraft,
        destinationGateCompleted,
        destinationGateTried,
        markGateTried,
        completeGate,
        resetForOpen,
        dropActive,
        isTouchingDirectory,
        handleDrop,
        handleDragOver,
        handleDragLeave,
        handleBrowse,
        pushRecentPath,
        applyDroppedPath,
    };
}

