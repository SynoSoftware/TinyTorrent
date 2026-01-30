import { useCallback, useEffect, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useAddModalState } from "@/app/hooks/useAddModalState";
import { useAddTorrentDefaults } from "@/app/hooks/useAddTorrentDefaults";
import { normalizeMagnetLink } from "@/app/utils/magnet";
import type { SettingsConfig } from "@/modules/settings/data/config";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type {
    AddTorrentSelection,
    AddTorrentSource,
} from "@/modules/torrent-add/components/AddTorrentModal";
import { readTorrentFileAsMetainfoBase64 } from "@/modules/torrent-add/services/torrent-metainfo";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import type { FeedbackTone } from "@/shared/types/feedback";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";

export interface UseAddTorrentControllerParams {
    dispatch: (intent: TorrentIntentExtended) => Promise<void>;
    showFeedback: (message: string, tone: FeedbackTone) => void;
    t: (key: string) => string;
    settingsConfig: SettingsConfig;
    setSettingsConfig: Dispatch<SetStateAction<SettingsConfig>>;
    torrents: Array<Torrent | TorrentDetail>;
    pendingDeletionHashesRef: MutableRefObject<Set<string>>;
}

export interface UseAddTorrentControllerResult {
    addModalState: ReturnType<typeof useAddModalState>;
    addSource: AddTorrentSource | null;
    addTorrentDefaults: ReturnType<typeof useAddTorrentDefaults>;
    openAddTorrentPicker: () => void;
    openAddMagnet: (magnetLink?: string) => void;
    handleMagnetModalClose: () => void;
    handleMagnetSubmit: (link: string) => Promise<void>;
    handleTorrentWindowConfirm: (selection: AddTorrentSelection) => Promise<void>;
    closeAddTorrentWindow: () => void;
    isResolvingMagnet: boolean;
    isFinalizingExisting: boolean;
    isAddingTorrent: boolean;
    setAddSource: (source: AddTorrentSource | null) => void;
    isMagnetModalOpen: boolean;
    magnetModalInitialValue: string;
}

export function useAddTorrentController({
    dispatch,
    showFeedback,
    t,
    settingsConfig,
    setSettingsConfig,
    torrents,
    pendingDeletionHashesRef,
}: UseAddTorrentControllerParams): UseAddTorrentControllerResult {
    const [addSource, setAddSource] = useState<AddTorrentSource | null>(null);
    const isResolvingMagnet = false;
    const [isMagnetModalOpen, setMagnetModalOpen] = useState(false);
    const [magnetModalInitialValue, setMagnetModalInitialValue] = useState("");
    const [isFinalizingExisting, setIsFinalizingExisting] = useState(false);

    const fallbackCommitMode = settingsConfig.start_added_torrents
        ? "start"
        : "paused";
    const addTorrentDefaults = useAddTorrentDefaults({
        fallbackDownloadDir: settingsConfig.download_dir,
        fallbackCommitMode,
    });
    const {
        downloadDir: addTorrentDownloadDir,
        setDownloadDir: setAddTorrentDownloadDir,
    } = addTorrentDefaults;

    useEffect(() => {
        if (!addTorrentDownloadDir) return;
        setSettingsConfig((prev) => {
            if (prev.download_dir === addTorrentDownloadDir) return prev;
            return { ...prev, download_dir: addTorrentDownloadDir };
        });
    }, [addTorrentDownloadDir, setSettingsConfig]);

    const addModalState = useAddModalState({
        onOpenAddMagnet: (magnetLink?: string) => {
            const normalized =
                typeof magnetLink === "string"
                    ? normalizeMagnetLink(magnetLink)
                    : undefined;
            setMagnetModalInitialValue(normalized ?? "");
            setMagnetModalOpen(true);
        },
        onOpenAddTorrentFromFile: async (file) => {
            try {
                const { parseTorrentFile } = await import(
                    "@/shared/utils/torrent"
                );
                const metadata = await parseTorrentFile(file);
                setAddSource({
                    kind: "file",
                    file,
                    metadata,
                    label: metadata.name ?? file.name,
                });
            } catch {
                // ignore
            }
        },
    });

    const openAddTorrentPicker = useCallback(() => {
        addModalState.open();
    }, [addModalState]);

    const openAddMagnet = useCallback(
        (magnetLink?: string) => {
            const normalized =
                typeof magnetLink === "string"
                    ? normalizeMagnetLink(magnetLink)
                    : undefined;
            setMagnetModalInitialValue(normalized ?? "");
            setMagnetModalOpen(true);
        },
        []
    );

    const handleMagnetModalClose = useCallback(() => {
        setMagnetModalOpen(false);
        setMagnetModalInitialValue("");
    }, []);

    const handleMagnetSubmit = useCallback(
        async (link: string) => {
            const normalized = normalizeMagnetLink(link);
            if (!normalized) return;
            const infoHash = normalizeInfoHashCandidate(normalized);
            if (infoHash && pendingDeletionHashesRef.current.has(infoHash)) {
                showFeedback(t("toolbar.feedback.pending_delete"), "warning");
                return;
            }
            setMagnetModalOpen(false);
            setMagnetModalInitialValue("");

            const startNow = Boolean(settingsConfig.start_added_torrents);
            const defaultDir =
                addTorrentDownloadDir || settingsConfig.download_dir;

            try {
                await dispatch(
                    TorrentIntents.addMagnetTorrent(
                        normalized,
                        defaultDir,
                        !startNow
                    )
                );
            } catch (err) {
                console.error("Failed to add magnet", err);
            }
        },
        [
            dispatch,
            addTorrentDownloadDir,
            showFeedback,
            t,
            settingsConfig,
            pendingDeletionHashesRef,
        ]
    );

    const closeAddTorrentWindow = useCallback(() => {
        setAddSource(null);
    }, []);

    const handleTorrentWindowConfirm = useCallback(
        async (selection: AddTorrentSelection) => {
            if (!addSource) return;
            const downloadDir = selection.downloadDir.trim();
            if (downloadDir) {
                setAddTorrentDownloadDir(downloadDir);
            }

            const startNow = selection.commitMode !== "paused";

            if (addSource.kind === "file") {
                const metainfo = await readTorrentFileAsMetainfoBase64(
                    addSource.file
                );
                if (!metainfo.ok) {
                    closeAddTorrentWindow();
                    return;
                }
                try {
                    await dispatch(
                        TorrentIntents.addTorrentFromFile(
                            metainfo.metainfoBase64,
                            downloadDir,
                            !startNow,
                            selection.filesUnwanted,
                            selection.priorityHigh,
                            selection.priorityNormal,
                            selection.priorityLow
                        )
                    );
                } finally {
                    closeAddTorrentWindow();
                }
                return;
            }

            const targetId = addSource.torrentId;
            if (!targetId) {
                closeAddTorrentWindow();
                return;
            }
            setIsFinalizingExisting(true);
            try {
                await dispatch(
                    TorrentIntents.finalizeExistingTorrent(
                        targetId,
                        downloadDir,
                        selection.filesUnwanted,
                        startNow
                    )
                );
                closeAddTorrentWindow();
            } finally {
                setIsFinalizingExisting(false);
            }
        },
        [
            addSource,
            closeAddTorrentWindow,
            dispatch,
            setAddTorrentDownloadDir,
        ]
    );

    useEffect(() => {
        if (!torrents.length) {
            pendingDeletionHashesRef.current.clear();
            return;
        }
        const activeHashes = new Set(
            torrents
                .map((torrent) => torrent.hash?.toLowerCase())
                .filter((hash): hash is string => Boolean(hash))
        );
        pendingDeletionHashesRef.current.forEach((hash) => {
            if (!activeHashes.has(hash)) {
                pendingDeletionHashesRef.current.delete(hash);
            }
        });
    }, [torrents, pendingDeletionHashesRef]);

    return {
        addModalState,
        addSource,
        addTorrentDefaults,
        openAddTorrentPicker,
        openAddMagnet,
        handleMagnetModalClose,
        handleMagnetSubmit,
        handleTorrentWindowConfirm,
        closeAddTorrentWindow,
        isResolvingMagnet,
        isFinalizingExisting,
        isAddingTorrent: isFinalizingExisting,
        setAddSource,
        isMagnetModalOpen,
        magnetModalInitialValue,
    };
}

function normalizeInfoHashCandidate(value: string): string | null {
    if (/^[0-9a-fA-F]{40}$/.test(value)) {
        return value.toLowerCase();
    }
    const decoded = base32ToHex(value);
    if (!decoded) return null;
    return decoded.toLowerCase();
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32ToHex(value: string): string | null {
    let buffer = 0;
    let bitsInBuffer = 0;
    const bytes: number[] = [];
    for (const char of value.toUpperCase()) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index === -1) {
            return null;
        }
        buffer = (buffer << 5) | index;
        bitsInBuffer += 5;
        while (bitsInBuffer >= 8) {
            bitsInBuffer -= 8;
            const byte = (buffer >> bitsInBuffer) & 0xff;
            bytes.push(byte);
        }
    }
    if (bytes.length !== 20) {
        return null;
    }
    return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
