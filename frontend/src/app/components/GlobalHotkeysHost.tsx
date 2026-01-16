import { useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useFocusState } from "@/app/context/FocusContext";
import { useSelection } from "@/app/context/SelectionContext";
import { KEYMAP, KEY_SCOPE, ShortcutIntent } from "@/config/logic";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import STATUS from "@/shared/status";
import { useTorrentCommands } from "@/app/context/TorrentCommandContext";

interface GlobalHotkeysHostProps {
    torrents: Torrent[];
    selectedTorrents: Torrent[];
    detailData: TorrentDetail | null;
    handleRequestDetails: (torrent: Torrent) => Promise<void>;
    handleCloseDetail: () => void;
}
// TODO: Fold global hotkeys into the centralized host/registry (task 27/37) so shortcut wiring isn’t duplicated across AppContent and this component.

export function GlobalHotkeysHost({
    torrents,
    selectedTorrents,
    detailData,
    handleRequestDetails,
    handleCloseDetail,
}: GlobalHotkeysHostProps) {
    const { selectedIds, activeId, setSelectedIds, setActiveId } = useSelection();
    const { setActivePart } = useFocusState();
    const { handleTorrentAction, handleBulkAction } = useTorrentCommands();

    const selectedIdsRef = useRef(selectedIds);
    const activeIdRef = useRef(activeId);
    const torrentsRef = useRef(torrents);
    const selectedTorrentsRef = useRef(selectedTorrents);
    const detailDataRef = useRef(detailData);
    const handleRequestDetailsRef = useRef(handleRequestDetails);
    const handleCloseDetailRef = useRef(handleCloseDetail);
    const handleTorrentActionRef = useRef(handleTorrentAction);
    const handleBulkActionRef = useRef(handleBulkAction);

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
        handleTorrentActionRef.current = handleTorrentAction;
    }, [handleTorrentAction]);

    useEffect(() => {
        handleBulkActionRef.current = handleBulkAction;
    }, [handleBulkAction]);
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
            const handleBulk = handleBulkActionRef.current;
            const selection = selectedIdsRef.current;
            if (!handleBulk || !selection.length) return;
            void handleBulk("remove");
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
            const handler = handleTorrentActionRef.current;
            const primaryTorrent = selectedTorrentsRef.current.find(
                (torrent) => torrent.id === activeIdRef.current
            ) ?? selectedTorrentsRef.current[0];
            if (!handler || !primaryTorrent) return;
            const isActive =
                primaryTorrent.state === STATUS.torrent.DOWNLOADING ||
                primaryTorrent.state === STATUS.torrent.SEEDING;
            const action: TorrentTableAction = isActive ? "pause" : "resume";
            void handler(action, primaryTorrent);
        },
        { scopes: scope },
        []
    );

    useHotkeys(
        KEYMAP[ShortcutIntent.Recheck],
        (event) => {
            event.preventDefault();
            const handleBulk = handleBulkActionRef.current;
            const selection = selectedIdsRef.current;
            if (!handleBulk || !selection.length) return;
            void handleBulk("recheck");
        },
        { scopes: scope },
        []
    );

    useHotkeys(
        KEYMAP[ShortcutIntent.RemoveWithData],
        (event) => {
            event.preventDefault();
            const handleBulk = handleBulkActionRef.current;
            const selection = selectedIdsRef.current;
            if (!handleBulk || !selection.length) return;
            void handleBulk("remove-with-data");
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
