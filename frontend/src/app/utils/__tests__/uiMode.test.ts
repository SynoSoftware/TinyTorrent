import { describe, expect, it } from "vitest";
import { computeUiMode, deriveUiCapabilities } from "@/app/utils/uiMode";

describe("UiMode helper", () => {
    it("returns Full when loopback host has ShellAgent bridge", () => {
        expect(computeUiMode("localhost", true)).toBe("Full");
        const caps = deriveUiCapabilities("localhost", true);
        expect(caps.uiMode).toBe("Full");
        expect(caps.canBrowse).toBe(true);
        expect(caps.canOpenFolder).toBe(true);
        expect(caps.supportsManual).toBe(true);
    });

    it("falls back to Rpc when shell bridge is unavailable even on loopback", () => {
        expect(computeUiMode("127.0.0.1", false)).toBe("Rpc");
        const caps = deriveUiCapabilities("127.0.0.1", false);
        expect(caps.uiMode).toBe("Rpc");
        expect(caps.canBrowse).toBe(false);
        expect(caps.canOpenFolder).toBe(false);
        expect(caps.supportsManual).toBe(true);
    });

    it("returns Rpc for remote hosts regardless of bridge availability", () => {
        expect(computeUiMode("example.com", true)).toBe("Rpc");
        const caps = deriveUiCapabilities("example.com", true);
        expect(caps.uiMode).toBe("Rpc");
        expect(caps.canBrowse).toBe(false);
        expect(caps.canOpenFolder).toBe(false);
        expect(caps.supportsManual).toBe(true);
    });
});
