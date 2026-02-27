import { describe, expect, it } from "vitest";
import { deriveVisibleHeaderOrder } from "@/modules/dashboard/viewModels/torrentTableColumnOrder";

describe("deriveVisibleHeaderOrder", () => {
    it("tracks the committed column order after repeated reorders", () => {
        const firstCommittedOrder = [
            "name",
            "speed",
            "progress",
            "status",
        ];

        expect(
            deriveVisibleHeaderOrder(firstCommittedOrder, firstCommittedOrder),
        ).toEqual(firstCommittedOrder);

        const secondCommittedOrder = [
            "speed",
            "name",
            "progress",
            "status",
        ];

        expect(
            deriveVisibleHeaderOrder(secondCommittedOrder, secondCommittedOrder),
        ).toEqual(secondCommittedOrder);
    });

    it("preserves committed order while appending visible columns missing from preferences", () => {
        expect(
            deriveVisibleHeaderOrder(
                ["progress", "name"],
                ["name", "progress", "speed"],
            ),
        ).toEqual(["progress", "name", "speed"]);
    });

    it("ignores hidden columns and duplicate committed ids", () => {
        expect(
            deriveVisibleHeaderOrder(
                ["name", "progress", "name", "speed", "status"],
                ["speed", "status", "name"],
            ),
        ).toEqual(["name", "speed", "status"]);
    });
});
