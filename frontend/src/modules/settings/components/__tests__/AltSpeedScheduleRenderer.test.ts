import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { AltSpeedScheduleField } from "@/modules/settings/components/AltSpeedScheduleField";

const useSettingsFormStateMock = vi.hoisted(() => vi.fn());
const useSettingsFormActionsMock = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => {
            switch (key) {
                case "settings.labels.altSpeedWeeklyScheduleSummary":
                    return `${String(values?.days)}, ${String(values?.start)}-${String(values?.end)}`;
                case "settings.labels.altSpeedWeeklyScheduleSummaryAllDay":
                    return `${String(values?.days)}, ${String(values?.allDay)}`;
                case "settings.labels.altSpeedWeeklyScheduleSummaryOvernight":
                    return `${String(values?.days)}, ${String(values?.start)}-${String(values?.end)} overnight`;
                case "settings.labels.altSpeedWeeklyScheduleEmpty":
                    return "No scheduled days selected.";
                case "settings.labels.altSpeedWeeklyScheduleEveryDay":
                    return "Every day";
                case "settings.labels.altSpeedAllDay":
                    return "All day";
                case "settings.labels.altSpeedDurationHours":
                    return `${String(values?.hours)}h`;
                case "settings.labels.altSpeedDurationHoursMinutes":
                    return `${String(values?.hours)}h ${String(values?.minutes)}m`;
                case "settings.labels.altSpeedRangeAria":
                    return `${String(values?.start)}-${String(values?.end)} ${String(values?.duration)}${String(values?.overnight ?? "")}`;
                case "settings.labels.altSpeedRangeAriaAllDay":
                    return `All day ${String(values?.duration)}`;
                case "settings.labels.altSpeedPreset_weekdays":
                    return "Weekdays";
                case "settings.labels.altSpeedPreset_weekends":
                    return "Weekends";
                case "settings.labels.altSpeedPreset_always":
                    return "Always";
                case "settings.labels.altSpeedPreset_nights":
                    return "Nights";
                case "settings.labels.day_sunday":
                    return "Sun";
                case "settings.labels.day_monday":
                    return "Mon";
                case "settings.labels.day_tuesday":
                    return "Tue";
                case "settings.labels.day_wednesday":
                    return "Wed";
                case "settings.labels.day_thursday":
                    return "Thu";
                case "settings.labels.day_friday":
                    return "Fri";
                case "settings.labels.day_saturday":
                    return "Sat";
                default:
                    return key;
            }
        },
    }),
}));

vi.mock("@heroui/react", () => ({
    Button: ({
        children,
        onPress,
        isDisabled,
        disabled,
        ...props
    }: {
        children?: React.ReactNode;
        onPress?: () => void;
        isDisabled?: boolean;
        disabled?: boolean;
        [key: string]: unknown;
    }) =>
        React.createElement(
            "button",
            {
                ...props,
                type: "button",
                disabled: Boolean(isDisabled ?? disabled),
                onClick: onPress ?? props.onClick,
            },
            children,
        ),
    cn: (...values: Array<string | false | null | undefined>) =>
        values.filter(Boolean).join(" "),
}));

vi.mock("@/modules/settings/context/SettingsFormContext", () => ({
    useSettingsFormState: useSettingsFormStateMock,
    useSettingsFormActions: useSettingsFormActionsMock,
}));

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs = 2000,
) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (predicate()) {
            return;
        }
        await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 20);
        });
    }
    throw new Error("wait_for_condition_timeout");
};

const nextTick = () =>
    new Promise<void>((resolve) => {
        window.setTimeout(resolve, 20);
    });

const baseState = {
    config: {
        alt_speed_time_enabled: true,
        alt_speed_time_day: 62,
        alt_speed_begin: "00:00",
        alt_speed_end: "01:00",
    },
    fieldStates: {},
};

const renderField = () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    root.render(
        React.createElement(AltSpeedScheduleField, {
            block: {
                type: "alt-speed-schedule",
                labelKey: "settings.labels.altSpeedWeeklySchedule",
            },
        }),
    );

    return {
        container,
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

const setTrackBounds = (container: HTMLElement) => {
    const band = container.querySelector<HTMLElement>("[data-alt-speed-band-body]");
    const track = band?.parentElement as HTMLDivElement | null;
    if (!track) {
        throw new Error("track_not_found");
    }

    Object.defineProperty(track, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
            left: 0,
            right: 240,
            top: 0,
            bottom: 40,
            width: 240,
            height: 40,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        }),
    });

    return track;
};

describe("AltSpeedScheduleField", () => {
    beforeEach(() => {
        useSettingsFormStateMock.mockReturnValue(baseState);
        useSettingsFormActionsMock.mockReturnValue({
            onApplySetting: vi.fn().mockResolvedValue({ status: "applied" }),
        });
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.clearAllMocks();
    });

    it("recenters the current band and preserves duration", async () => {
        const onApplySetting = vi.fn().mockResolvedValue({ status: "applied" });
        useSettingsFormActionsMock.mockReturnValue({ onApplySetting });

        const mounted = renderField();
        try {
            await waitForCondition(
                () => mounted.container.querySelectorAll("button").length > 0,
            );

            const track = setTrackBounds(mounted.container);
            track.dispatchEvent(
                new MouseEvent("click", {
                    bubbles: true,
                    clientX: 180,
                }),
            );

            await waitForCondition(() => onApplySetting.mock.calls.length === 2);

            expect(onApplySetting).toHaveBeenNthCalledWith(
                1,
                "alt_speed_begin",
                "17:30",
            );
            expect(onApplySetting).toHaveBeenNthCalledWith(
                2,
                "alt_speed_end",
                "18:30",
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("dragging across days applies one contiguous day range update", async () => {
        const onApplySetting = vi.fn().mockResolvedValue({ status: "applied" });
        useSettingsFormStateMock.mockReturnValue({
            ...baseState,
            config: {
                ...baseState.config,
                alt_speed_time_day: 127,
            },
        });
        useSettingsFormActionsMock.mockReturnValue({ onApplySetting });

        const mounted = renderField();
        try {
            await waitForCondition(
                () => mounted.container.querySelectorAll("button").length > 0,
            );

            const mondayButton =
                mounted.container.querySelector<HTMLButtonElement>('[data-day-index="1"]');
            const wednesdayButton =
                mounted.container.querySelector<HTMLButtonElement>('[data-day-index="3"]');

            mondayButton?.dispatchEvent(
                new MouseEvent("mousedown", { bubbles: true }),
            );
            wednesdayButton?.dispatchEvent(
                new MouseEvent("mouseover", { bubbles: true }),
            );
            await nextTick();
            window.dispatchEvent(new MouseEvent("mouseup"));

            await waitForCondition(() => onApplySetting.mock.calls.length === 1);
            expect(onApplySetting).toHaveBeenCalledWith(
                "alt_speed_time_day",
                113,
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("preset application fully replaces days and time range", async () => {
        const onApplySetting = vi.fn().mockResolvedValue({ status: "applied" });
        useSettingsFormActionsMock.mockReturnValue({ onApplySetting });

        const mounted = renderField();
        try {
            await waitForCondition(
                () => mounted.container.querySelectorAll("button").length > 0,
            );

            const weekendsButton = Array.from(
                mounted.container.querySelectorAll<HTMLButtonElement>("button"),
            ).find((button) => button.textContent === "Weekends");

            weekendsButton?.click();

            await waitForCondition(() => onApplySetting.mock.calls.length === 3);

            expect(onApplySetting).toHaveBeenNthCalledWith(
                1,
                "alt_speed_time_day",
                65,
            );
            expect(onApplySetting).toHaveBeenNthCalledWith(
                2,
                "alt_speed_begin",
                "09:00",
            );
            expect(onApplySetting).toHaveBeenNthCalledWith(
                3,
                "alt_speed_end",
                "17:00",
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("renders disabled controls while keeping the schedule summary visible", async () => {
        useSettingsFormStateMock.mockReturnValue({
            ...baseState,
            config: {
                ...baseState.config,
                alt_speed_time_enabled: false,
            },
        });

        const mounted = renderField();
        try {
            await waitForCondition(
                () => mounted.container.querySelectorAll("button").length > 0,
            );

            const dayButton =
                mounted.container.querySelector<HTMLButtonElement>('[data-day-index="1"]');
            expect(dayButton?.disabled).toBe(true);
            expect(mounted.container.textContent).toContain("Mon-Fri · 00:00-01:00");
        } finally {
            mounted.cleanup();
        }
    });
});
