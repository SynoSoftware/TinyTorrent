import { describe, expect, it } from "vitest";
import {
    DEFAULT_COLUMN_ORDER,
    DEFAULT_VISIBLE_COLUMN_IDS,
} from "@/modules/dashboard/components/TorrentTable_ColumnDefs";

describe("torrent table column defs", () => {
    it("does not expose the removed health column in the default order", () => {
        expect(DEFAULT_COLUMN_ORDER).not.toContain("health");
    });

    it("does not expose the removed health column in the default visible set", () => {
        expect(DEFAULT_VISIBLE_COLUMN_IDS).not.toContain("health");
    });
});
