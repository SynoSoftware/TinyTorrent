import { describe, expect, it } from "vitest";
import {
    fileExplorerPriorityValues,
    getFileExplorerPrioritySelection,
    getFileExplorerSelectablePriorityKeys,
} from "@/shared/ui/workspace/fileExplorerTreeModel";

describe("fileExplorerTreeModel priority selection", () => {
    it("exposes only Transmission priority tiers for file rows", () => {
        expect(getFileExplorerSelectablePriorityKeys(false)).toEqual([
            "high",
            "normal",
            "low",
        ]);
    });

    it("exposes only Transmission priority tiers for folder rows", () => {
        expect(getFileExplorerSelectablePriorityKeys(true)).toEqual([
            "high",
            "normal",
            "low",
        ]);
    });

    it("returns a single shared priority when every descendant matches", () => {
        const priorityByIndex = new Map([
            [0, fileExplorerPriorityValues.high],
            [1, fileExplorerPriorityValues.high],
        ]);

        expect(
            Array.from(
                getFileExplorerPrioritySelection([0, 1], priorityByIndex),
            ),
        ).toEqual(["high"]);
    });

    it("returns mixed for folders when descendant priorities differ", () => {
        const priorityByIndex = new Map([
            [0, fileExplorerPriorityValues.high],
            [1, fileExplorerPriorityValues.normal],
            [2, fileExplorerPriorityValues.low],
        ]);

        expect(
            getFileExplorerPrioritySelection([0, 1], priorityByIndex).size,
        ).toBe(0);
    });

    it("preserves a file priority even when the file is unwanted", () => {
        const priorityByIndex = new Map([[3, fileExplorerPriorityValues.low]]);

        expect(
            Array.from(getFileExplorerPrioritySelection([3], priorityByIndex)),
        ).toEqual(["low"]);
    });

    it("preserves a shared folder priority when all descendants are unwanted", () => {
        const priorityByIndex = new Map([
            [2, fileExplorerPriorityValues.normal],
            [3, fileExplorerPriorityValues.normal],
        ]);

        expect(
            Array.from(getFileExplorerPrioritySelection([2, 3], priorityByIndex)),
        ).toEqual(["normal"]);
    });
});
