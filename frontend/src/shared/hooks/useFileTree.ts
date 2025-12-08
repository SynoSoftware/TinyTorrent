import { useMemo } from "react";
import type { TorrentFileEntity } from "../../services/rpc/entities";
import type { FileExplorerEntry } from "../ui/workspace/FileExplorerTree";

export const useFileTree = (files?: TorrentFileEntity[]) =>
    useMemo<FileExplorerEntry[]>(() => {
        if (!files) return [];
        return files.map(({ name, index, length, progress, wanted, priority }) => ({
            name,
            index,
            length,
            progress,
            wanted,
            priority,
        }));
    }, [files]);
