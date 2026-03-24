import { describe, expect, it } from "vitest";
import {
    deriveCommittedColumnOrder,
    deriveVisibleHeaderOrder,
} from "@/modules/dashboard/viewModels/torrentTableColumnOrder";

describe("deriveVisibleHeaderOrder", () => {
    it("tracks the committed column order after repeated reorders", () => {
        const firstCommittedOrder = [
            "name",
            "speed",
            "progress",
            "status",
            "queue",
        ];

        expect(
            deriveVisibleHeaderOrder(firstCommittedOrder, firstCommittedOrder),
        ).toEqual(firstCommittedOrder);

        const secondCommittedOrder = [
            "speed",
            "name",
            "progress",
            "status",
            "queue",
        ];

        expect(
            deriveVisibleHeaderOrder(secondCommittedOrder, secondCommittedOrder),
        ).toEqual(secondCommittedOrder);
    });

    it("preserves committed order while appending visible columns missing from preferences", () => {
        expect(
            deriveVisibleHeaderOrder(
                ["progress", "name"],
                ["name", "progress", "queue", "speed"],
            ),
        ).toEqual(["progress", "name", "queue", "speed"]);
    });

    it("ignores hidden columns and duplicate committed ids", () => {
        expect(
            deriveVisibleHeaderOrder(
                ["name", "progress", "name", "speed", "status", "queue"],
                ["speed", "status", "queue", "name"],
            ),
        ).toEqual(["name", "speed", "status", "queue"]);
    });
});

describe("deriveCommittedColumnOrder", () => {
    it("appends newly introduced columns missing from saved preferences", () => {
        expect(
            deriveCommittedColumnOrder(
                ["progress", "name", "status"],
                ["name", "progress", "status", "queue", "speed"],
            ),
        ).toEqual(["progress", "name", "status", "queue", "speed"]);
    });

    it("drops duplicate and obsolete saved ids while preserving valid order", () => {
        expect(
            deriveCommittedColumnOrder(
                ["name", "progress", "name", "obsolete", "queue"],
                ["name", "progress", "status", "queue"],
            ),
        ).toEqual(["name", "progress", "queue", "status"]);
    });
});
