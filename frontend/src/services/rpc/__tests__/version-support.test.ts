import { describe, expect, it } from "vitest";
import {
    getVersionGatedSessionValue,
    getSequentialDownloadCapabilityState,
    getVersionGatedSettingsSupport,
    removeUnsupportedVersionGatedSettings,
} from "@/services/rpc/version-support";

describe("version support resolver", () => {
    it("prefers rpc-version-semver for version fallback when fields are missing", () => {
        const support = getVersionGatedSettingsSupport({
            version: "4.0.0-dev (test)",
            "rpc-version-semver": "4.1.0",
        });

        expect(support.sequential_download.state).toBe("supported");
        expect(support.torrent_complete_verify_enabled.state).toBe("supported");
    });

    it("prefers sequential torrent evidence over session fallback", () => {
        const state = getSequentialDownloadCapabilityState({
            session: {
                version: "4.0.0",
            },
            torrents: [
                {
                    sequential_download: true,
                },
            ],
        });

        expect(state).toBe("supported");
    });

    it("uses version fallback for sequential when live evidence is unavailable", () => {
        const support = getVersionGatedSettingsSupport({
            version: "4.1.0",
        });

        expect(support.sequential_download.state).toBe("supported");
        expect(support.torrent_complete_verify_enabled.state).toBe("supported");
    });

    it("returns unknown before session capabilities are loaded", () => {
        const support = getVersionGatedSettingsSupport(null);

        expect(support.sequential_download.state).toBe("unknown");
        expect(support.torrent_complete_verify_enabled.state).toBe("unknown");
    });

    it("keeps only supported version-gated settings in the save payload", () => {
        const filtered = removeUnsupportedVersionGatedSettings(
            {
                "sequential_download": true,
                "torrent_complete_verify_enabled": true,
            },
            getVersionGatedSettingsSupport({
                version: "5.0.0",
                "sequential_download": true,
                "torrent_complete_verify_enabled": false,
            }),
        );

        expect(filtered).toEqual({
            "sequential_download": true,
            "torrent_complete_verify_enabled": true,
        });
    });

    it("drops camelCase aliases for unsupported gated settings", () => {
        const filtered = removeUnsupportedVersionGatedSettings(
            {
                sequentialDownload: true,
            },
            getVersionGatedSettingsSupport({
                version: "4.0.0",
            }),
        );

        expect(filtered).toEqual({});
    });

    it("reads aliased sequential session fields from one authority", () => {
        expect(
            getVersionGatedSessionValue(
                {
                    sequentialDownload: true,
                },
                "sequential_download",
            ),
        ).toBe(true);

        expect(
            getVersionGatedSessionValue(
                {
                    "sequential_download": false,
                },
                "sequential_download",
            ),
        ).toBe(false);
    });
});
