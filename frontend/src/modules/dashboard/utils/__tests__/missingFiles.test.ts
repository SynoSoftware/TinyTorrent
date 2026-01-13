import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { formatMissingFileDetails } from "../missingFiles";
import type { MissingFilesProbeResult } from "@/services/recovery/recovery-controller";

describe("formatMissingFileDetails", () => {
    const translate = ((key: string, values?: Record<string, string>) =>
        values ? `${key}:${JSON.stringify(values)}` : key) as TFunction;

    it("returns fallback message when probe is undefined", () => {
        const lines = formatMissingFileDetails(translate);
        expect(lines).toEqual(["recovery.status.waiting_status"]);
    });

    it("renders path_missing details", () => {
        const probe: MissingFilesProbeResult = {
            kind: "path_missing",
            confidence: "certain",
            expectedBytes: 1024,
            onDiskBytes: 0,
            missingBytes: 1024,
            toDownloadBytes: 1024,
            path: "C:\\Movies",
            ts: Date.now(),
        };
        const lines = formatMissingFileDetails(translate, probe);
        expect(lines).toContainEqual(
            expect.stringContaining("torrent_modal.errors.files.folder_missing")
        );
        expect(lines).toContainEqual(
            expect.stringContaining("torrent_modal.errors.files.expected")
        );
    });

    it("renders data_missing breakdown", () => {
        const probe: MissingFilesProbeResult = {
            kind: "data_missing",
            confidence: "likely",
            expectedBytes: 2048,
            onDiskBytes: 1024,
            missingBytes: 1024,
            toDownloadBytes: 1024,
            ts: Date.now(),
        };
        const lines = formatMissingFileDetails(translate, probe);
        expect(lines).toContainEqual(
            expect.stringContaining("torrent_modal.errors.no_data_found_title")
        );
        expect(lines).toContainEqual(
            expect.stringContaining("torrent_modal.errors.files.on_disk")
        );
        expect(lines).toContainEqual(
            expect.stringContaining("torrent_modal.errors.files.to_download")
        );
    });
});
