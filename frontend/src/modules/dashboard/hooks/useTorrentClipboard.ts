import { useCallback } from "react";
import { registry } from "@/config/logic";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import {
    writeClipboardOutcome,
    type ClipboardWriteOutcome,
} from "@/shared/utils/clipboard";
const { defaults } = registry;

const DEFAULT_MAGNET_PREFIX = defaults.magnetProtocolPrefix;

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


