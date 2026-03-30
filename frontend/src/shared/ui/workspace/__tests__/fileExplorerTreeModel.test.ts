import { describe, expect, it } from "vitest";
import {
    fileExplorerPriorityValues,
    getFileExplorerPrioritySelection,
    getFileExplorerSelectablePriorityKeys,
} from "@/shared/ui/workspace/fileExplorerTreeModel";

describe("fileExplorerTreeModel priority selection", () => {
    it("keeps skip available for file rows", () => {
        expect(getFileExplorerSelectablePriorityKeys(false)).toEqual([
            "high",
            "normal",
            "low",
            "skip",
        ]);
    });

    it("removes skip from folder rows", () => {
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
        const wantedByIndex = new Map([
            [0, true],
            [1, true],
        ]);

        expect(
            Array.from(
                getFileExplorerPrioritySelection(
                    [0, 1],
                    priorityByIndex,
                    wantedByIndex,
                    false,
                ),
            ),
        ).toEqual(["high"]);
    });

    it("returns mixed for folders when descendants differ or are disabled", () => {
        const priorityByIndex = new Map([
            [0, fileExplorerPriorityValues.high],
            [1, fileExplorerPriorityValues.normal],
            [2, fileExplorerPriorityValues.low],
        ]);
        const wantedByIndex = new Map([
            [0, true],
            [1, true],
            [2, false],
        ]);

        expect(
            getFileExplorerPrioritySelection(
                [0, 1],
                priorityByIndex,
                wantedByIndex,
                false,
            ).size,
        ).toBe(0);
        expect(
            getFileExplorerPrioritySelection(
                [2],
                priorityByIndex,
                wantedByIndex,
                false,
            ).size,
        ).toBe(0);
    });

    it("still reports skip for file rows when a file is disabled", () => {
        const priorityByIndex = new Map([[3, fileExplorerPriorityValues.low]]);
        const wantedByIndex = new Map([[3, false]]);

        expect(
            Array.from(
                getFileExplorerPrioritySelection(
                    [3],
                    priorityByIndex,
                    wantedByIndex,
                    true,
                ),
            ),
        ).toEqual(["skip"]);
    });
});
