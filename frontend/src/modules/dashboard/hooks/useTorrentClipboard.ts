import { useCallback } from "react";
import { CONFIG } from "@/config/logic";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { tryWriteClipboard } from "@/shared/utils/clipboard";

const DEFAULT_MAGNET_PREFIX = CONFIG.defaults.magnet_protocol_prefix;

export function useTorrentClipboard() {
    // TODO(section 20.4/21.2): move clipboard capability probing to a single
    // runtime/session capability authority instead of local navigator checks.
    const isClipboardSupported =
        typeof navigator !== "undefined" &&
        typeof navigator.clipboard?.writeText === "function";

    const buildMagnetLink = useCallback(
        (torrent: Torrent) =>
            `${DEFAULT_MAGNET_PREFIX}xt=urn:btih:${torrent.hash}`,
        []
    );

    const copyToClipboard = useCallback(async (value?: string) => {
        // TODO(section 20.2/20.5): expose typed clipboard outcomes to callers; don't discard result.
        await tryWriteClipboard(value);
    }, []);

    return { isClipboardSupported, copyToClipboard, buildMagnetLink };
}
