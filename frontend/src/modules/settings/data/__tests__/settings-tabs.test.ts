import { describe, expect, it } from "vitest";
import { SETTINGS_TABS } from "@/modules/settings/data/settings-tabs";

describe("settings tabs", () => {
    it("keeps alternative speed controls grouped under their owning switches", () => {
        const speedTab = SETTINGS_TABS.find((tab) => tab.id === "speed");
        const turtleSection = speedTab?.sections.find(
            (section) => section.titleKey === "settings.sections.turtle",
        );

        if (!turtleSection) {
            throw new Error("turtle_section_missing");
        }

        expect(turtleSection.tone).toBeUndefined();
        expect(turtleSection.blocks.map((block) => block.type)).toEqual([
            "switch",
            "input-pair",
            "switch",
            "alt-speed-schedule",
        ]);

        const altSpeedPair = turtleSection.blocks[1];
        expect(altSpeedPair?.type).toBe("input-pair");
        if (altSpeedPair?.type !== "input-pair") {
            throw new Error("alt_speed_pair_missing");
        }

        expect(altSpeedPair.inputs.map((input) => input.dependsOn)).toEqual([
            "alt_speed_enabled",
            "alt_speed_enabled",
        ]);

        const scheduleSwitch = turtleSection.blocks[2];
        expect(scheduleSwitch?.type).toBe("switch");
        if (scheduleSwitch?.type !== "switch") {
            throw new Error("alt_speed_schedule_switch_missing");
        }

        const altSpeedToggle = turtleSection.blocks[0];
        expect(altSpeedToggle?.type).toBe("switch");
        if (altSpeedToggle?.type !== "switch") {
            throw new Error("alt_speed_toggle_missing");
        }

        expect(altSpeedToggle.color).toBeUndefined();
        expect(scheduleSwitch.stateKey).toBe("alt_speed_time_enabled");
        expect(scheduleSwitch.color).toBeUndefined();
    });

    it("keeps daemon queue controls separate from local polling preferences", () => {
        const speedTab = SETTINGS_TABS.find((tab) => tab.id === "speed");
        const queueSection = speedTab?.sections.find(
            (section) => section.titleKey === "settings.sections.queue",
        );
        const pollingSection = speedTab?.sections.find(
            (section) => section.titleKey === "settings.sections.polling",
        );

        if (!queueSection || !pollingSection) {
            throw new Error("speed_section_missing");
        }

        expect(queueSection.blocks.map((block) => block.type)).toEqual([
            "switch",
            "input",
            "switch",
            "input",
            "switch",
            "input",
        ]);

        const [
            downloadQueueToggle,
            downloadQueueSize,
            stalledToggle,
            stalledMinutes,
            seedQueueToggle,
            seedQueueSize,
        ] = queueSection.blocks;

        expect(downloadQueueToggle?.type).toBe("switch");
        expect(downloadQueueSize?.type).toBe("input");
        expect(stalledToggle?.type).toBe("switch");
        expect(stalledMinutes?.type).toBe("input");
        expect(seedQueueToggle?.type).toBe("switch");
        expect(seedQueueSize?.type).toBe("input");

        if (
            downloadQueueToggle?.type !== "switch" ||
            downloadQueueSize?.type !== "input" ||
            stalledToggle?.type !== "switch" ||
            stalledMinutes?.type !== "input" ||
            seedQueueToggle?.type !== "switch" ||
            seedQueueSize?.type !== "input"
        ) {
            throw new Error("queue_block_shape_invalid");
        }

        expect(downloadQueueToggle.stateKey).toBe("download_queue_enabled");
        expect(downloadQueueSize.stateKey).toBe("download_queue_size");
        expect(downloadQueueSize.dependsOn).toBe("download_queue_enabled");
        expect(stalledToggle.stateKey).toBe("queue_stalled_enabled");
        expect(stalledMinutes.stateKey).toBe("queue_stalled_minutes");
        expect(stalledMinutes.dependsOn).toBe("queue_stalled_enabled");
        expect(seedQueueToggle.stateKey).toBe("seed_queue_enabled");
        expect(seedQueueSize.stateKey).toBe("seed_queue_size");
        expect(seedQueueSize.dependsOn).toBe("seed_queue_enabled");

        expect(
            pollingSection.blocks.map((block) => {
                if (block.type !== "input") {
                    throw new Error("polling_block_shape_invalid");
                }
                return block.stateKey;
            }),
        ).toEqual(["refresh_interval_ms", "request_timeout_ms"]);
    });
});
