import { useCallback, useMemo } from "react";
import { usePreferences } from "@/app/context/PreferencesContext";
import { registry } from "@/config/logic";
import { mergeDownloadPathHistory } from "@/shared/domain/downloadPathHistory";

export const maxDownloadPaths = registry.defaults.downloadPathHistoryLimit;

export const mergeDownloadPaths = (history: string[], value: string) => {
    return mergeDownloadPathHistory(history, value, maxDownloadPaths);
};

export function useDownloadPaths() {
    const {
        preferences: { addTorrentHistory },
        setAddTorrentHistory,
    } = usePreferences();
    const history = useMemo(
        () => addTorrentHistory.slice(0, maxDownloadPaths),
        [addTorrentHistory],
    );
    const current = history[0] ?? "";

    const remember = useCallback(
        (value: string) => {
            const nextHistory = mergeDownloadPaths(history, value);
            setAddTorrentHistory(nextHistory);
        },
        [history, setAddTorrentHistory],
    );

    return useMemo(
        () => ({
            current,
            history,
            remember,
        }),
        [current, history, remember],
    );
}
