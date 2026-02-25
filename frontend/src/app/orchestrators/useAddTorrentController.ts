import { useCallback, useEffect, useState } from "react";
import type { MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import { useAddModalState } from "@/app/hooks/useAddModalState";
import { useAddTorrentDefaults } from "@/app/hooks/useAddTorrentDefaults";
import { normalizeMagnetLink } from "@/app/utils/magnet";
import type { SettingsConfig } from "@/modules/settings/data/config";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type {
    AddTorrentSelection,
    AddTorrentSource,
} from "@/modules/torrent-add/types";
import { parseTorrentFile } from "@/modules/torrent-add/services/torrent-metainfo";
import { TorrentIntents } from "@/app/intents/torrentIntents";
// feedback tone type no longer required here; controller reads feedback hook internally
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import { infraLogger } from "@/shared/utils/infraLogger";

export interface UseAddTorrentControllerParams {
    dispatch: (
        intent: TorrentIntentExtended,
    ) => Promise<TorrentDispatchOutcome>;
    settingsConfig: SettingsConfig;
    torrents: Array<Torrent | TorrentDetail>;
    pendingDeletionHashesRef: MutableRefObject<Set<string>>;
}

export type AddTorrentCommandOutcome =
    | { status: "added" }
    | { status: "finalized" }
    | {
          status: "invalid_input";
          reason:
              | "invalid_magnet_link"
              | "invalid_destination"
              | "missing_target";
      }
    | { status: "blocked_pending_delete" }
    | { status: "cancelled" }
    | {
          status: "failed";
          reason:
              | "magnet_add_failed"
              | "metainfo_read_failed"
              | "add_file_failed"
              | "finalize_failed";
      };

export interface UseAddTorrentControllerResult {
    addModalState: ReturnType<typeof useAddModalState>;
    addSource: AddTorrentSource | null;
    addTorrentDefaults: ReturnType<typeof useAddTorrentDefaults>;
    openAddTorrentPicker: () => void;
    openAddMagnet: (magnetLink?: string) => void;
    handleMagnetModalClose: () => void;
    handleMagnetSubmit: (link: string) => Promise<AddTorrentCommandOutcome>;
    handleTorrentWindowConfirm: (
        selection: AddTorrentSelection,
    ) => Promise<AddTorrentCommandOutcome>;
    closeAddTorrentWindow: () => void;
    isFinalizingExisting: boolean;
    isAddingTorrent: boolean;
    setAddSource: (source: AddTorrentSource | null) => void;
    isMagnetModalOpen: boolean;
    magnetModalInitialValue: string;
}

export function useAddTorrentController({
    dispatch,
    settingsConfig,
    torrents,
    pendingDeletionHashesRef,
}: UseAddTorrentControllerParams): UseAddTorrentControllerResult {
    const { t } = useTranslation();
    const { showFeedback } = useActionFeedback();
    const [addSource, setAddSource] = useState<AddTorrentSource | null>(null);
    const [isMagnetModalOpen, setMagnetModalOpen] = useState(false);
    const [magnetModalInitialValue, setMagnetModalInitialValue] = useState("");
    const [isAddingTorrent, setIsAddingTorrent] = useState(false);
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
                const { parseTorrentFile } =
                    await import("@/shared/utils/torrent");
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

    const openAddMagnet = useCallback((magnetLink?: string) => {
        const normalized =
            typeof magnetLink === "string"
                ? normalizeMagnetLink(magnetLink)
                : undefined;
        setMagnetModalInitialValue(normalized ?? "");
        setMagnetModalOpen(true);
    }, []);

    const handleMagnetModalClose = useCallback(() => {
        setMagnetModalOpen(false);
        setMagnetModalInitialValue("");
    }, []);

    const handleMagnetSubmit = useCallback(
        async (link: string): Promise<AddTorrentCommandOutcome> => {
            const normalized = normalizeMagnetLink(link);
            if (!normalized) {
                showFeedback(t("modals.add_torrent.magnet_error"), "warning");
                return {
                    status: "invalid_input",
                    reason: "invalid_magnet_link",
                };
            }
            const infoHash = normalizeInfoHashCandidate(normalized);
            if (infoHash && pendingDeletionHashesRef.current.has(infoHash)) {
                showFeedback(t("toolbar.feedback.pending_delete"), "warning");
                return { status: "blocked_pending_delete" };
            }

            const startNow = Boolean(settingsConfig.start_added_torrents);
            const defaultDir =
                addTorrentDownloadDir || settingsConfig.download_dir;

            try {
                const outcome = await dispatch(
                    TorrentIntents.addMagnetTorrent(
                        normalized,
                        defaultDir,
                        !startNow,
                    ),
                );
                if (outcome.status !== "applied") {
                    showFeedback(
                        t("modals.add_torrent.magnet_error"),
                        "danger",
                    );
                    return { status: "failed", reason: "magnet_add_failed" };
                }
                showFeedback(t("toolbar.feedback.added"), "success");
                return { status: "added" };
            } catch (err) {
                infraLogger.error(
                    {
                        scope: "add_torrent",
                        event: "add_magnet_failed",
                        message: "Failed to add torrent from magnet link",
                    },
                    err,
                );
                showFeedback(t("modals.add_torrent.magnet_error"), "danger");
                return { status: "failed", reason: "magnet_add_failed" };
            }
        },
        [
            dispatch,
            addTorrentDownloadDir,
            showFeedback,
            t,
            settingsConfig,
            pendingDeletionHashesRef,
        ],
    );

    const closeAddTorrentWindow = useCallback(() => {
        setAddSource(null);
    }, []);

    const handleTorrentWindowConfirm = useCallback(
        async (
            selection: AddTorrentSelection,
        ): Promise<AddTorrentCommandOutcome> => {
            if (!addSource) {
                return { status: "cancelled" };
            }
            const downloadDir = selection.downloadDir.trim();
            if (!downloadDir) {
                showFeedback(
                    t("modals.add_torrent.destination_prompt_invalid"),
                    "warning",
                );
                return {
                    status: "invalid_input",
                    reason: "invalid_destination",
                };
            }
            setAddTorrentDownloadDir(downloadDir);

            const startNow = selection.commitMode !== "paused";

            if (addSource.kind === "file") {
                const metainfo = await parseTorrentFile(addSource.file);
                if (!metainfo.ok) {
                    showFeedback(t("modals.file_tree_error"), "danger");
                    return { status: "failed", reason: "metainfo_read_failed" };
                }
                setIsAddingTorrent(true);
                try {
                    const outcome = await dispatch(
                        TorrentIntents.addTorrentFromFile(
                            metainfo.metainfoBase64,
                            downloadDir,
                            !startNow,
                            selection.filesUnwanted,
                            selection.priorityHigh,
                            selection.priorityNormal,
                            selection.priorityLow,
                            selection.options.sequential,
                            selection.options.skipHashCheck,
                        ),
                    );
                    if (outcome.status !== "applied") {
                        showFeedback(t("modals.add_error_default"), "danger");
                        return { status: "failed", reason: "add_file_failed" };
                    }
                    showFeedback(t("toolbar.feedback.added"), "success");
                    closeAddTorrentWindow();
                    return { status: "added" };
                } catch (err) {
                    infraLogger.error(
                        {
                            scope: "add_torrent",
                            event: "add_file_failed",
                            message: "Failed to add torrent from selected file",
                        },
                        err,
                    );
                    showFeedback(t("modals.add_error_default"), "danger");
                    return { status: "failed", reason: "add_file_failed" };
                } finally {
                    setIsAddingTorrent(false);
                }
            }

            const targetId = addSource.torrentId;
            if (!targetId) {
                showFeedback(t("modals.add_error_source_missing"), "warning");
                closeAddTorrentWindow();
                return { status: "invalid_input", reason: "missing_target" };
            }
            setIsFinalizingExisting(true);
            try {
                const outcome = await dispatch(
                    TorrentIntents.finalizeExistingTorrent(
                        targetId,
                        downloadDir,
                        selection.filesUnwanted,
                        startNow,
                    ),
                );
                if (outcome.status !== "applied") {
                    showFeedback(t("modals.add_error_default"), "danger");
                    return { status: "failed", reason: "finalize_failed" };
                }
                showFeedback(t("toolbar.feedback.location_updated"), "success");
                closeAddTorrentWindow();
                return { status: "finalized" };
            } catch (err) {
                infraLogger.error(
                    {
                        scope: "add_torrent",
                        event: "finalize_existing_failed",
                        message: "Failed to finalize existing torrent selection",
                    },
                    err,
                );
                showFeedback(t("modals.add_error_default"), "danger");
                return { status: "failed", reason: "finalize_failed" };
            } finally {
                setIsFinalizingExisting(false);
            }
        },
        [
            addSource,
            closeAddTorrentWindow,
            dispatch,
            setAddTorrentDownloadDir,
            showFeedback,
            t,
        ],
    );

    useEffect(() => {
        if (!torrents.length) {
            pendingDeletionHashesRef.current.clear();
            return;
        }
        const activeHashes = new Set(
            torrents
                .map((torrent) => torrent.hash?.toLowerCase())
                .filter((hash): hash is string => Boolean(hash)),
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
        isFinalizingExisting,
        isAddingTorrent,
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
