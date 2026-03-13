import { describe, expect, it } from "vitest";
import { zTransmissionTorrentDetailSingle } from "@/services/rpc/schemas";

describe("tracker schema parsing", () => {
    it("parses Transmission tracker_stats fields from the vendored daemon shape", () => {
        const parsed = zTransmissionTorrentDetailSingle.parse({
            torrents: [
                {
                    id: 17,
                    hashString: "abc123",
                    name: "ubuntu.iso",
                    totalSize: 1024,
                    percentDone: 0.5,
                    status: 4,
                    rateDownload: 0,
                    rateUpload: 0,
                    peersConnected: 1,
                    eta: 0,
                    addedDate: 1,
                    uploadRatio: 0,
                    uploadedEver: 0,
                    downloadedEver: 0,
                    trackers: [
                        {
                            id: 91,
                            announce: "udp://tracker.example:80/announce",
                            scrape: "udp://tracker.example:80/scrape",
                            sitename: "example",
                            tier: 0,
                        },
                    ],
                    tracker_stats: [
                        {
                            id: 91,
                            announce: "udp://tracker.example:80/announce",
                            scrape: "udp://tracker.example:80/scrape",
                            sitename: "example",
                            tier: 0,
                            announce_state: 1,
                            download_count: 14,
                            downloader_count: 9,
                            has_announced: true,
                            has_scraped: true,
                            host: "tracker.example:80",
                            is_backup: false,
                            last_announce_peer_count: 3,
                            last_announce_result: "Success",
                            last_announce_start_time: 100,
                            last_announce_succeeded: true,
                            last_announce_time: 101,
                            last_announce_timed_out: false,
                            last_scrape_result: "Scrape OK",
                            last_scrape_start_time: 110,
                            last_scrape_succeeded: true,
                            last_scrape_time: 111,
                            last_scrape_timed_out: false,
                            leecher_count: 5,
                            next_announce_time: 200,
                            next_scrape_time: 210,
                            scrape_state: 2,
                            seeder_count: 7,
                        },
                    ],
                },
            ],
        });

        expect(parsed).not.toBeNull();
        const [tracker] = parsed?.trackers ?? [];
        expect(tracker).toMatchObject({
            id: 91,
            announce: "udp://tracker.example:80/announce",
            scrape: "udp://tracker.example:80/scrape",
            sitename: "example",
            host: "tracker.example:80",
            tier: 0,
            announceState: 1,
            downloadCount: 14,
            downloaderCount: 9,
            hasAnnounced: true,
            hasScraped: true,
            lastAnnouncePeerCount: 3,
            lastAnnounceStartTime: 100,
            lastAnnounceTime: 101,
            lastScrapeStartTime: 110,
            lastScrapeTime: 111,
            nextAnnounceTime: 200,
            nextScrapeTime: 210,
            seederCount: 7,
            leecherCount: 5,
        });
    });

    it("merges tracker rows by id first and falls back to announce+tier identity", () => {
        const parsed = zTransmissionTorrentDetailSingle.parse({
            torrents: [
                {
                    id: 18,
                    hashString: "def456",
                    name: "fedora.iso",
                    totalSize: 1024,
                    percentDone: 0.25,
                    status: 4,
                    rateDownload: 0,
                    rateUpload: 0,
                    peersConnected: 0,
                    eta: 0,
                    addedDate: 1,
                    uploadRatio: 0,
                    uploadedEver: 0,
                    downloadedEver: 0,
                    trackers: [
                        {
                            id: 300,
                            announce: "https://tracker-a/announce",
                            sitename: "a",
                            tier: 0,
                        },
                        {
                            announce: "https://tracker-b/announce",
                            sitename: "b",
                            tier: 1,
                        },
                    ],
                    tracker_stats: [
                        {
                            id: 999,
                            announce: "https://tracker-b/announce",
                            tier: 1,
                            announce_state: 2,
                            seeder_count: 11,
                            leecher_count: 6,
                        },
                        {
                            id: 300,
                            announce: "https://tracker-a/announce",
                            tier: 0,
                            announce_state: 1,
                            seeder_count: 7,
                            leecher_count: 4,
                        },
                    ],
                },
            ],
        });

        expect(parsed?.trackers).toHaveLength(2);
        expect(parsed?.trackers[0]).toMatchObject({
            id: 300,
            announce: "https://tracker-a/announce",
            seederCount: 7,
            leecherCount: 4,
        });
        expect(parsed?.trackers[1]).toMatchObject({
            announce: "https://tracker-b/announce",
            tier: 1,
            seederCount: 11,
            leecherCount: 6,
        });
    });
});
