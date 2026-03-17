import { describe, expect, it } from "vitest";
import {
    extractMagnetInfoHashCandidate,
    normalizeInfoHashCandidate,
} from "@/app/utils/magnet";

describe("magnet utils", () => {
    it("normalizes raw hexadecimal info hashes", () => {
        expect(
            normalizeInfoHashCandidate("0123456789ABCDEF0123456789ABCDEF01234567"),
        ).toBe("0123456789abcdef0123456789abcdef01234567");
    });

    it("normalizes base32 info hashes", () => {
        expect(
            normalizeInfoHashCandidate("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
        ).toBe("0000000000000000000000000000000000000000");
    });

    it("extracts btih hashes from magnet links", () => {
        expect(
            extractMagnetInfoHashCandidate(
                "magnet:?xt=urn:btih:0123456789ABCDEF0123456789ABCDEF01234567&dn=Example",
            ),
        ).toBe("0123456789abcdef0123456789abcdef01234567");
    });

    it("extracts base32 btih hashes from magnet links", () => {
        expect(
            extractMagnetInfoHashCandidate(
                "magnet:?xt=urn:btih:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            ),
        ).toBe("0000000000000000000000000000000000000000");
    });
});
