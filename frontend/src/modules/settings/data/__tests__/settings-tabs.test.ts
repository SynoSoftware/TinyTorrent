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
});
