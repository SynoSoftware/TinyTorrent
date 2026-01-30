import { useEffect, useMemo, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useFocusState } from "@/app/context/FocusContext";
import { useSelection } from "@/app/context/SelectionContext";
import { useTorrentCommands } from "@/app/context/TorrentCommandContext";
import { createGlobalHotkeyBindings } from "@/app/commandRegistry";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";

interface GlobalHotkeysHostProps {
    torrents: Torrent[];
    selectedTorrents: Torrent[];
    detailData: TorrentDetail | null;
    handleRequestDetails: (torrent: Torrent) => Promise<void>;
    handleCloseDetail: () => void;
}

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

    const hotkeys = useMemo(
        () =>
            createGlobalHotkeyBindings({
                refs: {
                    torrentsRef,
                    selectedIdsRef,
                    selectedTorrentsRef,
                    activeIdRef,
                    detailDataRef,
                    handleRequestDetailsRef,
                    handleCloseDetailRef,
                    handleBulkActionRef,
                    handleTorrentActionRef,
                },
                setSelectedIds,
                setActiveId,
                setActivePart,
            }),
        [
            torrentsRef,
            selectedIdsRef,
            selectedTorrentsRef,
            activeIdRef,
            detailDataRef,
            handleRequestDetailsRef,
            handleCloseDetailRef,
            handleBulkActionRef,
            handleTorrentActionRef,
            setSelectedIds,
            setActiveId,
            setActivePart,
        ]
    );

    useHotkeys(
        hotkeys.selectAll.keys,
        hotkeys.selectAll.handler,
        hotkeys.selectAll.options,
        []
    );

    useHotkeys(
        hotkeys.remove.keys,
        hotkeys.remove.handler,
        hotkeys.remove.options,
        []
    );

    useHotkeys(
        hotkeys.showDetails.keys,
        hotkeys.showDetails.handler,
        hotkeys.showDetails.options,
        []
    );

    useHotkeys(
        hotkeys.toggleInspector.keys,
        hotkeys.toggleInspector.handler,
        hotkeys.toggleInspector.options,
        []
    );

    useHotkeys(
        hotkeys.togglePause.keys,
        hotkeys.togglePause.handler,
        hotkeys.togglePause.options,
        []
    );

    useHotkeys(
        hotkeys.recheck.keys,
        hotkeys.recheck.handler,
        hotkeys.recheck.options,
        []
    );

    useHotkeys(
        hotkeys.removeWithData.keys,
        hotkeys.removeWithData.handler,
        hotkeys.removeWithData.options,
        []
    );

    return null;
}

export default GlobalHotkeysHost;
