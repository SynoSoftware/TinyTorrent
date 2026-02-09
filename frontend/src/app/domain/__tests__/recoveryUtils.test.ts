import { describe, expect, it } from "vitest";
import {
    derivePathReason,
    getRecoveryFingerprint,
} from "@/app/domain/recoveryUtils";

describe("recoveryUtils", () => {
    describe("getRecoveryFingerprint", () => {
        it("prefers envelope fingerprint over hash/id", () => {
            const result = getRecoveryFingerprint({
                id: 12,
                hash: "hash-abc",
                errorEnvelope: { fingerprint: "fp-123" },
            });
            expect(result).toBe("fp-123");
        });

        it("falls back to hash when fingerprint is missing", () => {
            const result = getRecoveryFingerprint({
                id: 42,
                hash: "hash-only",
                errorEnvelope: null,
            });
            expect(result).toBe("hash-only");
        });

        it("falls back to stringified id when only id is available", () => {
            const result = getRecoveryFingerprint({
                id: 7,
                hash: null,
                errorEnvelope: null,
            });
            expect(result).toBe("7");
        });

        it("returns placeholder when no identifying data exists", () => {
            const result = getRecoveryFingerprint(null);
            expect(result).toBe("<no-recovery-fingerprint>");
        });
    });

    describe("derivePathReason", () => {
        it("maps permissionDenied to unwritable", () => {
            expect(derivePathReason("permissionDenied")).toBe("unwritable");
        });

        it("maps diskFull to disk-full", () => {
            expect(derivePathReason("diskFull")).toBe("disk-full");
        });

        it("defaults unknown classes to missing", () => {
            expect(derivePathReason("unknown-class")).toBe("missing");
        });
    });
});
