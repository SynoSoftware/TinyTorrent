import { describe, expect, it } from "vitest";
import { getSessionSettings } from "@/services/rpc/schemas";

describe("session settings schema parsing", () => {
    it("parses Transmission queue and seeding session fields from session-get", () => {
        const parsed = getSessionSettings({
            "download-queue-enabled": true,
            "download-queue-size": 4,
            "queue-stalled-enabled": true,
            "queue-stalled-minutes": 30,
            "seed-queue-enabled": false,
            "seed-queue-size": 10,
            seedRatioLimit: 2,
            seedRatioLimited: false,
            "idle-seeding-limit": 45,
            "idle-seeding-limit-enabled": true,
        });

        expect(parsed).toMatchObject({
            "download-queue-enabled": true,
            "download-queue-size": 4,
            "queue-stalled-enabled": true,
            "queue-stalled-minutes": 30,
            "seed-queue-enabled": false,
            "seed-queue-size": 10,
            seedRatioLimit: 2,
            seedRatioLimited: false,
            "idle-seeding-limit": 45,
            "idle-seeding-limit-enabled": true,
        });
    });
});
