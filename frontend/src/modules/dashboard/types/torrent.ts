// All imports use '@/modules/...' aliases. No deep-relative imports remain.

import type {
    TorrentDetailEntity,
    TorrentEntity,
} from "@/services/rpc/entities";

export type Torrent = TorrentEntity;
export type TorrentDetail = TorrentDetailEntity;
