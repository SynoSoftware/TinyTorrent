import { useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useFocusState } from "@/app/context/FocusContext";
import { useRequiredTorrentActions } from "@/app/context/TorrentActionsContext";
import { useSelection } from "@/app/context/SelectionContext";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import { KEYMAP, KEY_SCOPE, ShortcutIntent } from "@/config/logic";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import STATUS from "@/shared/status";

interface GlobalHotkeysHostProps {
    torrents: Torrent[];
    selectedTorrents: Torrent[];
    detailData: TorrentDetail | null;
    handleRequestDetails: (torrent: Torrent) => Promise<void>;
    handleCloseDetail: () => void;
    resumeTorrent: (torrent: Torrent) => Promise<void> | void;
}

export function GlobalHotkeysHost({
    torrents,
    selectedTorrents,
    detailData,
    handleRequestDetails,
    handleCloseDetail,
    resumeTorrent,
}: GlobalHotkeysHostProps) {
    const { selectedIds, activeId, setSelectedIds, setActiveId } = useSelection();
    const { setActivePart } = useFocusState();
    const { dispatch } = useRequiredTorrentActions();

    const selectedIdsRef = useRef(selectedIds);
    const activeIdRef = useRef(activeId);
    const torrentsRef = useRef(torrents);
    const selectedTorrentsRef = useRef(selectedTorrents);
    const detailDataRef = useRef(detailData);
    const handleRequestDetailsRef = useRef(handleRequestDetails);
    const handleCloseDetailRef = useRef(handleCloseDetail);
    const dispatchRef = useRef(dispatch);

    useEffect(() => {
        selectedIdsRef.current = selectedIds;
    }, [selectedIds]);

    useEffect(() => {
        activeIdRef.current = activeId;
    }, [activeId]);

    useEffect(() => {
        torrentsRef.current = torrents;
    }, [torrents]);

    useEffect(() => {
        selectedTorrentsRef.current = selectedTorrents;
    }, [selectedTorrents]);

    useEffect(() => {
        detailDataRef.current = detailData;
    }, [detailData]);

    useEffect(() => {
        handleRequestDetailsRef.current = handleRequestDetails;
    }, [handleRequestDetails]);

    useEffect(() => {
        handleCloseDetailRef.current = handleCloseDetail;
    }, [handleCloseDetail]);

    useEffect(() => {
        dispatchRef.current = dispatch;
    }, [dispatch]);
    const resumeTorrentRef = useRef(resumeTorrent);

    useEffect(() => {
        resumeTorrentRef.current = resumeTorrent;
    }, [resumeTorrent]);

    const scope = KEY_SCOPE.Dashboard;

    useHotkeys(
        KEYMAP[ShortcutIntent.SelectAll],
        (event) => {
            event.preventDefault();
            const ids = torrentsRef.current
                .filter((torrent) => !torrent.isGhost)
                .flatMap((torrent) => torrent.id ? [torrent.id] : []);
            setSelectedIds(ids);
            setActiveId(ids[0] ?? null);
        },
        { scopes: scope },
        []
    );

    useHotkeys(
        KEYMAP[ShortcutIntent.Delete],
        (event) => {
            event.preventDefault();
            const dispatch = dispatchRef.current;
            const selection = selectedIdsRef.current;
            if (!dispatch || !selection.length) return;
            void dispatch(
                TorrentIntents.ensureSelectionRemoved(selection, false)
            );
        },
        { scopes: scope },
        []
    );

    useHotkeys(
        KEYMAP[ShortcutIntent.ShowDetails],
        (event) => {
            event.preventDefault();
            const handler = handleRequestDetailsRef.current;
            const primaryTorrent = selectedTorrentsRef.current.find(
                (torrent) => torrent.id === activeIdRef.current
            ) ?? selectedTorrentsRef.current[0];
            if (!handler || !primaryTorrent) return;
            handler(primaryTorrent);
        },
        { scopes: scope },
        []
    );

            useHotkeys(
                KEYMAP[ShortcutIntent.TogglePause],
                (event) => {
                    event.preventDefault();
                    const dispatch = dispatchRef.current;
                    const primaryTorrent = selectedTorrentsRef.current.find(
                        (torrent) => torrent.id === activeIdRef.current
                    ) ?? selectedTorrentsRef.current[0];
                    if (!dispatch || !primaryTorrent) return;
                    const isActive =
                        primaryTorrent.state === STATUS.torrent.DOWNLOADING ||
                        primaryTorrent.state === STATUS.torrent.SEEDING;
                    if (isActive) {
                        void dispatch(
                            TorrentIntents.ensurePaused(
                                primaryTorrent.id ?? primaryTorrent.hash
                            )
                        );
                    } else {
                        const resume = resumeTorrentRef.current;
                        if (resume) {
                            void resume(primaryTorrent);
                        }
                    }
                },
                { scopes: scope },
                []
            );

    useHotkeys(
        KEYMAP[ShortcutIntent.Recheck],
        (event) => {
            event.preventDefault();
            const dispatch = dispatchRef.current;
            const selection = selectedIdsRef.current;
            if (!dispatch || !selection.length) return;
            void dispatch(
                TorrentIntents.ensureSelectionActive(selection)
            );
        },
        { scopes: scope },
        []
    );

    useHotkeys(
        KEYMAP[ShortcutIntent.RemoveWithData],
        (event) => {
            event.preventDefault();
            const dispatch = dispatchRef.current;
            const selection = selectedIdsRef.current;
            if (!dispatch || !selection.length) return;
            void dispatch(
                TorrentIntents.ensureSelectionRemoved(selection, true)
            );
        },
        { scopes: scope },
        []
    );

    useHotkeys(
        "cmd+i,ctrl+i",
        (event) => {
            event.preventDefault();
            const closeDetail = handleCloseDetailRef.current;
            const requestDetails = handleRequestDetailsRef.current;
            const selection = selectedTorrentsRef.current;
            const currentDetail = detailDataRef.current;
            if (currentDetail) {
                closeDetail?.();
                setActivePart("table");
                return;
            }
            const target =
                selection.find((torrent) => torrent.id === activeIdRef.current) ??
                selection[0];
            if (!target || !requestDetails) return;
            setActivePart("inspector");
            requestDetails(target);
        },
        {
            scopes: scope,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        []
    );

    return null;
}

export default GlobalHotkeysHost;
