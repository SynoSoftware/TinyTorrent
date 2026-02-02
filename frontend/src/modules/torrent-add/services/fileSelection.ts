import type { TorrentMetadata } from "@/shared/utils/torrent";

export type FileRow = {
    index: number;
    path: string;
    length: number;
};

export type FileKind = "video" | "text" | "other";

export type FilePriority = "low" | "normal" | "high";

export type SmartSelectCommand = "videos" | "largest" | "invert" | "all" | "none";

const VIDEO_EXTENSIONS = [
    ".mp4",
    ".mkv",
    ".avi",
    ".mov",
    ".wmv",
    ".mpg",
    ".mpeg",
    ".ts",
    ".m4v",
];

const SUBTITLE_EXTENSIONS = [".srt", ".ass", ".vtt", ".sub"];

export function buildFiles(metadata?: TorrentMetadata): FileRow[] {
    if (!metadata) return [];
    return metadata.files.map((file, index) => ({
        index,
        path: file.path,
        length: file.length,
    }));
}

export function filterFiles(files: FileRow[], query: string): FileRow[] {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return files;
    return files.filter((file) => file.path.toLowerCase().includes(trimmed));
}

export function classifyFileKind(path: string): FileKind {
    const lower = path.toLowerCase();
    if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "video";
    if (SUBTITLE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "text";
    return "other";
}

export function buildSelectionCommit({
    files,
    selected,
    priorities,
}: {
    files: FileRow[];
    selected: Set<number>;
    priorities: Map<number, FilePriority>;
}): {
    filesUnwanted: number[];
    priorityHigh: number[];
    priorityNormal: number[];
    priorityLow: number[];
} {
    const filesUnwanted = files
        .filter((f) => !selected.has(f.index))
        .map((f) => f.index)
        .sort((a, b) => a - b);

    const priorityHigh: number[] = [];
    const priorityLow: number[] = [];
    const priorityNormal: number[] = [];

    files.forEach((f) => {
        if (!selected.has(f.index)) return;
        const pr = priorities.get(f.index) ?? "normal";
        if (pr === "high") priorityHigh.push(f.index);
        else if (pr === "low") priorityLow.push(f.index);
        else priorityNormal.push(f.index);
    });

    priorityHigh.sort((a, b) => a - b);
    priorityLow.sort((a, b) => a - b);
    priorityNormal.sort((a, b) => a - b);

    return {
        filesUnwanted,
        priorityHigh,
        priorityNormal,
        priorityLow,
    };
}

export function applySmartSelectCommand({
    command,
    scopeFiles,
    selected,
}: {
    command: SmartSelectCommand;
    scopeFiles: FileRow[];
    selected: Set<number>;
}): Set<number> {
    const next = new Set(selected);

    if (command === "all") {
        scopeFiles.forEach((f) => next.add(f.index));
        return next;
    }

    if (command === "none") {
        scopeFiles.forEach((f) => next.delete(f.index));
        return next;
    }

    if (command === "invert") {
        scopeFiles.forEach((f) => {
            if (next.has(f.index)) next.delete(f.index);
            else next.add(f.index);
        });
        return next;
    }

    if (command === "videos") {
        scopeFiles.forEach((f) => next.delete(f.index));
        scopeFiles
            .filter((f) => classifyFileKind(f.path) === "video")
            .forEach((f) => next.add(f.index));
        return next;
    }

    if (command === "largest") {
        scopeFiles.forEach((f) => next.delete(f.index));
        const largest = scopeFiles.reduce<FileRow | null>((prev, current) => {
            if (!prev) return current;
            return prev.length > current.length ? prev : current;
        }, null);
        if (largest) next.add(largest.index);
        return next;
    }

    return next;
}

