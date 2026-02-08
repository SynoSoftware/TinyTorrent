import { describe, expect, it } from "vitest";
import {
    applySmartSelectCommand,
    buildSelectionCommit,
    type FileRow,
} from "@/modules/torrent-add/services/fileSelection";

describe("torrent-add fileSelection", () => {
    const files: FileRow[] = [
        { index: 0, path: "video-a.mkv", length: 10 },
        { index: 1, path: "note.txt", length: 5 },
        { index: 2, path: "video-b.mp4", length: 20 },
        { index: 3, path: "archive.bin", length: 30 },
    ];

    it("applies 'videos' within scope and preserves outside selection", () => {
        const scopeFiles = [files[0], files[1]];
        const selected = new Set([1, 2, 3]);
        const next = applySmartSelectCommand({
            command: "videos",
            scopeFiles,
            selected,
        });
        expect(Array.from(next).sort()).toEqual([0, 2, 3]);
    });

    it("applies 'largest' within scope and preserves outside selection", () => {
        const scopeFiles = [files[0], files[1], files[2]];
        const selected = new Set([0, 1, 3]);
        const next = applySmartSelectCommand({
            command: "largest",
            scopeFiles,
            selected,
        });
        expect(Array.from(next).sort()).toEqual([2, 3]);
    });

    it("builds selection commit arrays deterministically", () => {
        const selected = new Set([0, 2]);
        const priorities = new Map([
            [0, "high" as const],
            [2, "low" as const],
        ]);
        const result = buildSelectionCommit({ files, selected, priorities });
        expect(result.filesUnwanted).toEqual([1, 3]);
        expect(result.priorityHigh).toEqual([0]);
        expect(result.priorityLow).toEqual([2]);
        expect(result.priorityNormal).toEqual([]);
    });
});

