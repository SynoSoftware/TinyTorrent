import { useCallback, useEffect } from "react";
import type { AddTorrentCommitMode } from "@/modules/torrent-add/types";
import { usePreferences } from "@/app/context/PreferencesContext";

const isValidCommitMode = (value: unknown): value is AddTorrentCommitMode =>
    value === "start" || value === "paused" || value === "top";

export interface AddTorrentDefaults {
    downloadDir: string;
    commitMode: AddTorrentCommitMode;
    sequentialDownload: boolean;
    skipHashCheck: boolean;
}

export function useAddTorrentDefaults({
    fallbackDownloadDir,
    fallbackCommitMode,
    fallbackSequentialDownload,
    fallbackSkipHashCheck,
}: {
    fallbackDownloadDir: string;
    fallbackCommitMode: AddTorrentCommitMode;
    fallbackSequentialDownload: boolean;
    fallbackSkipHashCheck: boolean;
}) {
    const {
        preferences: { addTorrentDefaults },
        setAddTorrentDefaults,
    } = usePreferences();

    useEffect(() => {
        if (!addTorrentDefaults.downloadDir && fallbackDownloadDir) {
            setAddTorrentDefaults({
                ...addTorrentDefaults,
                downloadDir: fallbackDownloadDir,
            });
        }
    }, [
        addTorrentDefaults.downloadDir,
        addTorrentDefaults,
        fallbackDownloadDir,
        setAddTorrentDefaults,
    ]);

    useEffect(() => {
        if (!isValidCommitMode(addTorrentDefaults.commitMode)) {
            setAddTorrentDefaults({
                ...addTorrentDefaults,
                commitMode: fallbackCommitMode,
            });
        }
    }, [
        addTorrentDefaults,
        addTorrentDefaults.commitMode,
        fallbackCommitMode,
        setAddTorrentDefaults,
    ]);

    const downloadDir =
        addTorrentDefaults.downloadDir || fallbackDownloadDir || "";
    const commitMode = isValidCommitMode(addTorrentDefaults.commitMode)
        ? addTorrentDefaults.commitMode
        : fallbackCommitMode;
    const sequentialDownload =
        typeof addTorrentDefaults.sequentialDownload === "boolean"
            ? addTorrentDefaults.sequentialDownload
            : fallbackSequentialDownload;
    const skipHashCheck =
        typeof addTorrentDefaults.skipHashCheck === "boolean"
            ? addTorrentDefaults.skipHashCheck
            : fallbackSkipHashCheck;

    const setDownloadDir = useCallback(
        (value: string) => {
            setAddTorrentDefaults({
                ...addTorrentDefaults,
                downloadDir: value,
            });
        },
        [addTorrentDefaults, setAddTorrentDefaults]
    );

    const setCommitMode = useCallback(
        (value: AddTorrentCommitMode) => {
            setAddTorrentDefaults({
                ...addTorrentDefaults,
                commitMode: value,
            });
        },
        [addTorrentDefaults, setAddTorrentDefaults]
    );

    const setSequentialDownload = useCallback(
        (value: boolean) => {
            setAddTorrentDefaults({
                ...addTorrentDefaults,
                sequentialDownload: value,
            });
        },
        [addTorrentDefaults, setAddTorrentDefaults],
    );

    const setSkipHashCheck = useCallback(
        (value: boolean) => {
            setAddTorrentDefaults({
                ...addTorrentDefaults,
                skipHashCheck: value,
            });
        },
        [addTorrentDefaults, setAddTorrentDefaults],
    );

    return {
        downloadDir,
        commitMode,
        sequentialDownload,
        skipHashCheck,
        setDownloadDir,
        setCommitMode,
        setSequentialDownload,
        setSkipHashCheck,
    };
}
