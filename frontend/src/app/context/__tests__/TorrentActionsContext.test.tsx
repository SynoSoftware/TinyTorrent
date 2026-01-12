import { describe, it, expect } from "vitest";
import { TorrentActionsProvider } from "@/app/context/TorrentActionsContext";

describe("TorrentActionsContext exports", () => {
    it("exports a provider function", () => {
        expect(typeof TorrentActionsProvider).toBe("function");
    });
});
