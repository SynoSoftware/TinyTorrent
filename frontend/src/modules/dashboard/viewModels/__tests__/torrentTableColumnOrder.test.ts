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
            "health",
        ];

        expect(
            deriveVisibleHeaderOrder(firstCommittedOrder, firstCommittedOrder),
        ).toEqual(firstCommittedOrder);

        const secondCommittedOrder = [
            "speed",
            "name",
            "progress",
            "status",
            "health",
        ];

        expect(
            deriveVisibleHeaderOrder(secondCommittedOrder, secondCommittedOrder),
        ).toEqual(secondCommittedOrder);
    });

    it("preserves committed order while appending visible columns missing from preferences", () => {
        expect(
            deriveVisibleHeaderOrder(
                ["progress", "name"],
                ["name", "progress", "health", "speed"],
            ),
        ).toEqual(["progress", "name", "health", "speed"]);
    });

    it("ignores hidden columns and duplicate committed ids", () => {
        expect(
            deriveVisibleHeaderOrder(
                ["name", "progress", "name", "speed", "status", "health"],
                ["speed", "status", "health", "name"],
            ),
        ).toEqual(["name", "speed", "status", "health"]);
    });
});

describe("deriveCommittedColumnOrder", () => {
    it("appends newly introduced columns missing from saved preferences", () => {
        expect(
            deriveCommittedColumnOrder(
                ["progress", "name", "status"],
                ["name", "progress", "status", "health", "speed"],
            ),
        ).toEqual(["progress", "name", "status", "health", "speed"]);
    });

    it("drops duplicate and obsolete saved ids while preserving valid order", () => {
        expect(
            deriveCommittedColumnOrder(
                ["name", "progress", "name", "obsolete", "health"],
                ["name", "progress", "status", "health"],
            ),
        ).toEqual(["name", "progress", "health", "status"]);
    });
});
