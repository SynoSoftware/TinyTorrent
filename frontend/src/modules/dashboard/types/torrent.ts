/*
 AGENTS-TODO: This type file was referenced via relative imports in multiple modules.
 - Review and replace any callers using deep-relative imports with '@/modules/...'.
 */

import type {
    TorrentDetailEntity,
    TorrentEntity,
} from "@/services/rpc/entities";

export type Torrent = TorrentEntity;
export type TorrentDetail = TorrentDetailEntity;
