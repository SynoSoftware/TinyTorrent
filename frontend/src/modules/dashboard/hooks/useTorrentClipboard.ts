import { useCallback } from "react";
import { MAGNET_PROTOCOL_PREFIX } from "@/config/logic";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import {
    writeClipboardOutcome,
    type ClipboardWriteOutcome,
} from "@/shared/utils/clipboard";

const DEFAULT_MAGNET_PREFIX = MAGNET_PROTOCOL_PREFIX;

export function useTorrentClipboard() {
    const buildMagnetLink = useCallback(
        (torrent: Torrent) =>
            `${DEFAULT_MAGNET_PREFIX}xt=urn:btih:${torrent.hash}`,
        []
    );

    const copyToClipboard = useCallback(
        async (value?: string): Promise<ClipboardWriteOutcome> =>
            writeClipboardOutcome(value),
        [],
    );

    return { copyToClipboard, buildMagnetLink };
}
