import { describe, expect, it } from "vitest";
import {
    normalizeTrackerInputText,
    normalizeTrackerUrls,
    serializeTrackerList,
    splitTrackerInputLines,
} from "@/shared/domain/trackers";

describe("tracker text normalization", () => {
    it("splits multiline input into trimmed non-empty lines", () => {
        expect(
            splitTrackerInputLines(
                "  https://tracker-a/announce  \n\r\nhttps://tracker-b/announce  ",
            ),
        ).toEqual([
            "https://tracker-a/announce",
            "https://tracker-b/announce",
        ]);
    });

    it("normalizes tracker text input with validation and dedupe", () => {
        expect(
            normalizeTrackerInputText(
                "  https://tracker-a/announce  \nnot-a-url\nhttps://tracker-a/announce",
            ),
        ).toEqual({
            normalized: ["https://tracker-a/announce"],
            invalid: ["not-a-url"],
        });
    });

    it("normalizes tracker arrays for RPC submission", () => {
        expect(
            normalizeTrackerUrls([
                "  https://tracker-a/announce  ",
                "",
                "https://tracker-a/announce",
                "https://tracker-b/announce",
            ]),
        ).toEqual([
            "https://tracker-a/announce",
            "https://tracker-b/announce",
        ]);
    });

    it("serializes tracker rows in tier order with blank lines between tiers", () => {
        expect(
            serializeTrackerList([
                { announce: " https://tracker-z/announce ", tier: 1 },
                { announce: "https://tracker-a/announce", tier: 0 },
                { announce: "https://tracker-b/announce", tier: 1 },
            ]),
        ).toBe(
            "https://tracker-a/announce\n\nhttps://tracker-z/announce\nhttps://tracker-b/announce",
        );
    });
});
