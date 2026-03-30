import { Button, cn } from "@heroui/react";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
    altSpeedDayOptions,
    type SectionBlock,
} from "@/modules/settings/data/settings-tabs";
import {
    useSettingsFormActions,
    useSettingsFormState,
} from "@/modules/settings/context/SettingsFormContext";
import { surface } from "@/shared/ui/layout/glass-surface";
import { uiRoles } from "@/shared/ui/uiRoles";

const dayMinutes = 24 * 60;
const snapMinutes = 30;
const largeStepMinutes = snapMinutes * 4;
const tickHours = [0, 3, 6, 9, 12, 15, 18, 21] as const;
const presets = [
    { id: "weekdays", dayMask: 62, beginMinutes: 9 * 60, endMinutes: 17 * 60 },
    { id: "weekends", dayMask: 65, beginMinutes: 9 * 60, endMinutes: 17 * 60 },
    { id: "always", dayMask: 127, beginMinutes: 0, endMinutes: 0 },
    { id: "nights", dayMask: 127, beginMinutes: 22 * 60, endMinutes: 6 * 60 },
] as const;

type ScheduleRange = {
    beginMinutes: number;
    endMinutes: number;
    dayMask: number;
};

type InteractionMode = "start" | "end" | "move" | null;

const stackStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-tight)",
} as const;

const panelStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-tight)",
    padding: "var(--spacing-panel)",
} as const;

const chipRowStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--spacing-tools)",
} as const;

const tickRowStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
    alignItems: "center",
    gap: "var(--spacing-tools)",
} as const;

const railPanelStyle = {
    padding: "var(--spacing-tight)",
} as const;

const presetsPanelStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-tight)",
    padding: "var(--spacing-tight)",
} as const;

const railStyle = {
    position: "relative",
    height: "var(--height-control-row)",
    overflow: "hidden",
    userSelect: "none",
} as const;

const bandStyle = {
    position: "absolute",
    top: 0,
    bottom: 0,
    minWidth: 0,
    paddingInline: 0,
} as const;

const handleStyle = {
    position: "absolute",
    top: "50%",
    zIndex: 1,
    width: "calc(var(--spacing-tools) * 1.4)",
    height: "calc(var(--height-control-row) * 0.8)",
    minWidth: 0,
    paddingInline: 0,
    background: "transparent",
    boxShadow: "none",
    border: 0,
    transform: "translate(-50%, -50%)",
} as const;

const disabledContentStyle = {
    opacity: 0.72,
    pointerEvents: "none",
} as const;

const handleGripStyle = {
    display: "block",
    width: "calc(var(--spacing-tight) * 0.9)",
    height: "calc(var(--height-control-row) * 0.58)",
    borderRadius: "9999px",
    background: "currentColor",
    pointerEvents: "none",
} as const;

const clampMinutes = (value: number, minimum: number, maximum: number) =>
    Math.min(Math.max(value, minimum), maximum);

const snap = (value: number) =>
    clampMinutes(Math.round(value / snapMinutes) * snapMinutes, 0, dayMinutes);

const parseMinutes = (value: string) => {
    const [hours = "0", minutes = "0"] = value.split(":");
    const parsedHours = Number(hours);
    const parsedMinutes = Number(minutes);
    if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) {
        return 0;
    }
    return clampMinutes((parsedHours * 60) + parsedMinutes, 0, dayMinutes);
};

const formatMinutes = (value: number) => {
    const safeValue = value >= dayMinutes ? 0 : clampMinutes(value, 0, dayMinutes);
    const hours = Math.floor(safeValue / 60);
    const minutes = safeValue % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const isAllDay = (range: ScheduleRange) => range.beginMinutes === range.endMinutes;
const isOvernight = (range: ScheduleRange) =>
    !isAllDay(range) && range.endMinutes < range.beginMinutes;

const readRange = (config: {
    alt_speed_begin: string;
    alt_speed_end: string;
    alt_speed_time_day: number;
}): ScheduleRange => ({
    beginMinutes: snap(parseMinutes(config.alt_speed_begin)),
    endMinutes: snap(parseMinutes(config.alt_speed_end)),
    dayMask: config.alt_speed_time_day,
});

const getPointerMinutes = (clientX: number, railElement: HTMLDivElement) => {
    const bounds = railElement.getBoundingClientRect();
    const relativeX = clampMinutes(clientX - bounds.left, 0, bounds.width);
    const ratio = bounds.width === 0 ? 0 : relativeX / bounds.width;
    return snap(ratio * dayMinutes);
};

const getDurationMinutes = (range: ScheduleRange) => {
    if (isAllDay(range)) {
        return dayMinutes;
    }
    return isOvernight(range)
        ? (dayMinutes - range.beginMinutes) + range.endMinutes
        : range.endMinutes - range.beginMinutes;
};

const formatDaySummary = (
    dayMask: number,
    t: ReturnType<typeof useTranslation>["t"],
) => {
    if (dayMask === 0) {
        return t("settings.labels.altSpeedWeeklyScheduleEmpty");
    }
    if (altSpeedDayOptions.every((day) => Boolean(dayMask & day.mask))) {
        return t("settings.labels.altSpeedWeeklyScheduleEveryDay");
    }

    const indexes = altSpeedDayOptions.flatMap((day, index) =>
        dayMask & day.mask ? [index] : [],
    );
    const parts: string[] = [];
    let start = indexes[0];
    let previous = indexes[0];

    for (let index = 1; index <= indexes.length; index += 1) {
        const current = indexes[index];
        if (current === previous + 1) {
            previous = current;
            continue;
        }

        const startLabel = t(altSpeedDayOptions[start].labelKey);
        const endLabel = t(altSpeedDayOptions[previous].labelKey);
        parts.push(start === previous ? startLabel : `${startLabel}-${endLabel}`);
        start = current;
        previous = current;
    }

    return parts.join(", ");
};

const formatSummary = (
    range: ScheduleRange,
    t: ReturnType<typeof useTranslation>["t"],
) => {
    if (range.dayMask === 0) {
        return t("settings.labels.altSpeedWeeklyScheduleEmpty");
    }
    const days = formatDaySummary(range.dayMask, t);
    if (isAllDay(range)) {
        return `${days} · ${t("settings.labels.altSpeedAllDay")}`;
    }
    const suffix = isOvernight(range)
        ? ` ${t("settings.labels.altSpeedOvernightSuffix")}`
        : "";
    return `${days} · ${formatMinutes(range.beginMinutes)}-${formatMinutes(range.endMinutes)}${suffix}`;
};

export function AltSpeedScheduleField({
    block,
}: {
    block: Extract<SectionBlock, { type: "alt-speed-schedule" }>;
}) {
    const { t } = useTranslation();
    const railRef = useRef<HTMLDivElement | null>(null);
    const dragBaseRangeRef = useRef<ScheduleRange | null>(null);
    const dragAnchorMinutesRef = useRef(0);
    const dayDragAnchorRef = useRef<number | null>(null);
    const dayDragModeRef = useRef<"add" | "remove" | null>(null);

    const { config, fieldStates } = useSettingsFormState();
    const { onApplySetting } = useSettingsFormActions();

    const [previewRange, setPreviewRange] = useState<ScheduleRange | null>(null);
    const [interactionMode, setInteractionMode] =
        useState<InteractionMode>(null);
    const [isRailActive, setIsRailActive] = useState(false);

    const committedRange = readRange({
        alt_speed_begin: config.alt_speed_begin,
        alt_speed_end: config.alt_speed_end,
        alt_speed_time_day: config.alt_speed_time_day,
    });
    const visibleRange = previewRange ?? committedRange;
    const schedulerEnabled = config.alt_speed_time_enabled;
    const isPending = Boolean(
        fieldStates.alt_speed_time_day?.pending ||
            fieldStates.alt_speed_begin?.pending ||
            fieldStates.alt_speed_end?.pending,
    );
    const isDisabled = isPending || !schedulerEnabled;
    const fieldError =
        fieldStates.alt_speed_time_day?.error?.text ??
        fieldStates.alt_speed_begin?.error?.text ??
        fieldStates.alt_speed_end?.error?.text;

    const commitRange = useCallback(async (nextRange: ScheduleRange) => {
        if (committedRange.dayMask !== nextRange.dayMask) {
            const outcome = await onApplySetting(
                "alt_speed_time_day",
                nextRange.dayMask,
            );
            if (outcome.status !== "applied") {
                return;
            }
        }

        const nextBegin = formatMinutes(nextRange.beginMinutes);
        if (config.alt_speed_begin !== nextBegin) {
            const outcome = await onApplySetting("alt_speed_begin", nextBegin);
            if (outcome.status !== "applied") {
                return;
            }
        }

        const nextEnd = formatMinutes(nextRange.endMinutes);
        if (config.alt_speed_end !== nextEnd) {
            await onApplySetting("alt_speed_end", nextEnd);
        }
    }, [
        committedRange.dayMask,
        config.alt_speed_begin,
        config.alt_speed_end,
        onApplySetting,
    ]);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            const railElement = railRef.current;
            const baseRange = dragBaseRangeRef.current;
            if (!railElement || !baseRange || interactionMode == null) {
                return;
            }

            const pointerMinutes = getPointerMinutes(event.clientX, railElement);
            const deltaMinutes = pointerMinutes - dragAnchorMinutesRef.current;

            if (interactionMode === "move") {
                if (isAllDay(baseRange)) {
                    return;
                }
                const duration = getDurationMinutes(baseRange);
                const beginMinutes = ((baseRange.beginMinutes + deltaMinutes) % dayMinutes + dayMinutes) % dayMinutes;
                const endCandidate = beginMinutes + duration;
                setPreviewRange({
                    ...baseRange,
                    beginMinutes,
                    endMinutes: endCandidate >= dayMinutes ? endCandidate - dayMinutes : endCandidate,
                });
                return;
            }

            if (interactionMode === "start") {
                const endAbsolute =
                    isAllDay(baseRange) || isOvernight(baseRange)
                        ? baseRange.endMinutes + dayMinutes
                        : baseRange.endMinutes;
                const beginAbsolute = clampMinutes(
                    baseRange.beginMinutes + deltaMinutes,
                    endAbsolute - dayMinutes + snapMinutes,
                    endAbsolute - snapMinutes,
                );
                setPreviewRange({
                    ...baseRange,
                    beginMinutes:
                        beginAbsolute >= dayMinutes
                            ? beginAbsolute - dayMinutes
                            : beginAbsolute,
                });
                return;
            }

            const endAbsolute =
                isAllDay(baseRange) || isOvernight(baseRange)
                    ? baseRange.endMinutes + dayMinutes
                    : baseRange.endMinutes;
            const nextEndAbsolute = clampMinutes(
                endAbsolute + deltaMinutes,
                baseRange.beginMinutes + snapMinutes,
                baseRange.beginMinutes + dayMinutes,
            );
            setPreviewRange({
                ...baseRange,
                endMinutes:
                    nextEndAbsolute >= dayMinutes
                        ? nextEndAbsolute - dayMinutes
                        : nextEndAbsolute,
            });
        };

        const handleMouseUp = () => {
            const nextRange = previewRange;
            const baseRange = dragBaseRangeRef.current;

            dragBaseRangeRef.current = null;
            dayDragAnchorRef.current = null;
            dayDragModeRef.current = null;
            setInteractionMode(null);
            setPreviewRange(null);

            if (
                baseRange &&
                nextRange &&
                (
                    baseRange.beginMinutes !== nextRange.beginMinutes ||
                    baseRange.endMinutes !== nextRange.endMinutes ||
                    baseRange.dayMask !== nextRange.dayMask
                )
            ) {
                void commitRange(nextRange);
            }
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [commitRange, interactionMode, previewRange]);

    const beginDrag = (
        mode: Exclude<InteractionMode, null>,
        event: ReactMouseEvent<HTMLButtonElement>,
    ) => {
        if (isDisabled) {
            return;
        }
        const railElement = railRef.current;
        if (!railElement) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        dragBaseRangeRef.current = committedRange;
        dragAnchorMinutesRef.current = getPointerMinutes(event.clientX, railElement);
        setPreviewRange(committedRange);
        setInteractionMode(mode);
        setIsRailActive(true);
    };

    const handleRailClick = (event: ReactMouseEvent<HTMLDivElement>) => {
        if (isDisabled || event.target !== event.currentTarget) {
            return;
        }
        const railElement = railRef.current;
        if (!railElement || isAllDay(committedRange)) {
            return;
        }

        const duration = getDurationMinutes(committedRange);
        const pointerMinutes = getPointerMinutes(event.clientX, railElement);
        const beginMinutes = snap(
            clampMinutes(
                pointerMinutes - Math.round(duration / 2),
                0,
                dayMinutes - duration,
            ),
        );
        const endMinutes = beginMinutes + duration;

        void commitRange({
            ...committedRange,
            beginMinutes,
            endMinutes: endMinutes >= dayMinutes ? endMinutes - dayMinutes : endMinutes,
        });
    };

    const handleHandleKeyDown =
        (edge: "start" | "end") =>
        (event: ReactKeyboardEvent<HTMLButtonElement>) => {
            if (isDisabled) {
                return;
            }
            const delta =
                event.key === "ArrowLeft"
                    ? -(event.shiftKey ? largeStepMinutes : snapMinutes)
                    : event.key === "ArrowRight"
                      ? event.shiftKey
                          ? largeStepMinutes
                          : snapMinutes
                      : 0;
            if (delta === 0) {
                return;
            }

            event.preventDefault();
            const nextRange =
                edge === "start"
                    ? readRange({
                          alt_speed_begin: formatMinutes(
                              committedRange.beginMinutes + delta,
                          ),
                          alt_speed_end: formatMinutes(committedRange.endMinutes),
                          alt_speed_time_day: committedRange.dayMask,
                      })
                    : readRange({
                          alt_speed_begin: formatMinutes(committedRange.beginMinutes),
                          alt_speed_end: formatMinutes(
                              committedRange.endMinutes + delta,
                          ),
                          alt_speed_time_day: committedRange.dayMask,
                      });

            void commitRange(nextRange);
        };

    const handleDayMouseDown = (
        dayIndex: number,
        event: ReactMouseEvent<HTMLButtonElement>,
    ) => {
        if (isDisabled) {
            return;
        }
        event.preventDefault();

        dragBaseRangeRef.current = committedRange;
        dayDragAnchorRef.current = dayIndex;
        dayDragModeRef.current =
            committedRange.dayMask & altSpeedDayOptions[dayIndex].mask
                ? "remove"
                : "add";

        setPreviewRange({
            ...committedRange,
            dayMask:
                dayDragModeRef.current === "add"
                    ? committedRange.dayMask | altSpeedDayOptions[dayIndex].mask
                    : committedRange.dayMask & ~altSpeedDayOptions[dayIndex].mask,
        });
    };

    const handleDayMouseEnter = (dayIndex: number) => {
        if (
            dragBaseRangeRef.current == null ||
            dayDragAnchorRef.current == null ||
            dayDragModeRef.current == null
        ) {
            return;
        }

        const startIndex = Math.min(dayDragAnchorRef.current, dayIndex);
        const endIndex = Math.max(dayDragAnchorRef.current, dayIndex);
        const rangeMask = altSpeedDayOptions
            .slice(startIndex, endIndex + 1)
            .reduce((mask, day) => mask | day.mask, 0);

        setPreviewRange({
            ...dragBaseRangeRef.current,
            dayMask:
                dayDragModeRef.current === "add"
                    ? dragBaseRangeRef.current.dayMask | rangeMask
                    : dragBaseRangeRef.current.dayMask & ~rangeMask,
        });
    };

    const handlePresetClick = (
        preset: (typeof presets)[number],
    ) => {
        if (isDisabled) {
            return;
        }
        void commitRange({
            dayMask: preset.dayMask,
            beginMinutes: preset.beginMinutes,
            endMinutes: preset.endMinutes,
        });
    };

    const beginPosition = (visibleRange.beginMinutes / dayMinutes) * 100;
    const endPosition =
        ((isAllDay(visibleRange) ? dayMinutes : visibleRange.endMinutes) / dayMinutes) * 100;
    const showBandLabels = isRailActive || interactionMode !== null;
    const durationText = (() => {
        const duration = getDurationMinutes(visibleRange);
        if (duration === dayMinutes) {
            return t("settings.labels.altSpeedAllDay");
        }

        const hours = Math.floor(duration / 60);
        const minutes = duration % 60;
        return minutes === 0
            ? t("settings.labels.altSpeedDurationHours", { hours })
            : t("settings.labels.altSpeedDurationHoursMinutes", {
                  hours,
                  minutes,
              });
    })();
    const startHandleLeft = `${beginPosition}%`;
    const endHandleLeft = `${endPosition}%`;

    return (
        <div style={stackStyle}>
            <span className={uiRoles.text.secondary}>{t(block.labelKey)}</span>
            <div
                aria-disabled={isDisabled}
                className={cn(
                    surface.surface.panelRaised,
                    schedulerEnabled ? uiRoles.text.primary : uiRoles.text.subtle,
                )}
                style={panelStyle}
            >
                <div style={tickRowStyle}>
                    {tickHours.map((hour) => (
                        <span
                            key={hour}
                            className={uiRoles.text.subtle}
                            style={{ textAlign: "center" }}
                        >
                            {String(hour).padStart(2, "0")}
                        </span>
                    ))}
                </div>
                <div className={surface.surface.panelRaised} style={railPanelStyle}>
                    <div style={isDisabled ? disabledContentStyle : undefined}>
                        <div
                            ref={railRef}
                            data-alt-speed-track="true"
                            className={surface.atom.insetBorderedItem}
                            onClick={handleRailClick}
                            onMouseEnter={() => setIsRailActive(true)}
                            onMouseLeave={() => {
                                if (interactionMode === null) {
                                    setIsRailActive(false);
                                }
                            }}
                            style={railStyle}
                        >
                            {!isOvernight(visibleRange) ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    radius="full"
                                    variant="flat"
                                    color="primary"
                                    data-alt-speed-band-body="primary"
                                    isDisabled={isDisabled}
                                    onMouseDown={(event) => beginDrag("move", event)}
                                    style={{
                                        ...bandStyle,
                                        left: `${beginPosition}%`,
                                        width: `${(isAllDay(visibleRange) ? 100 : endPosition - beginPosition)}%`,
                                    }}
                                />
                            ) : (
                                <>
                                    <Button
                                        type="button"
                                        size="sm"
                                        radius="full"
                                        variant="flat"
                                        color="primary"
                                        data-alt-speed-band-body="late"
                                        isDisabled={isDisabled}
                                        onMouseDown={(event) => beginDrag("move", event)}
                                        style={{
                                            ...bandStyle,
                                            left: `${beginPosition}%`,
                                            width: `${100 - beginPosition}%`,
                                        }}
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        radius="full"
                                        variant="flat"
                                        color="primary"
                                        data-alt-speed-band-body="early"
                                        isDisabled={isDisabled}
                                        onMouseDown={(event) => beginDrag("move", event)}
                                        style={{
                                            ...bandStyle,
                                            left: "0%",
                                            width: `${endPosition}%`,
                                        }}
                                    />
                                </>
                            )}
                            <Button
                                type="button"
                                size="sm"
                                radius="full"
                                variant="light"
                                color="primary"
                                data-alt-speed-handle="start"
                                role="slider"
                                aria-label={t("settings.labels.altSpeedStartHandleAria")}
                                aria-orientation="horizontal"
                                aria-valuemin={0}
                                aria-valuemax={dayMinutes / snapMinutes}
                                aria-valuenow={visibleRange.beginMinutes / snapMinutes}
                                aria-valuetext={`${formatMinutes(visibleRange.beginMinutes)} ${durationText}`}
                                isDisabled={isDisabled}
                                onFocus={() => setIsRailActive(true)}
                                onBlur={() => interactionMode === null && setIsRailActive(false)}
                                onKeyDown={handleHandleKeyDown("start")}
                                onMouseDown={(event) => beginDrag("start", event)}
                                style={{
                                    ...handleStyle,
                                    opacity: showBandLabels ? 1 : 0.45,
                                    left: startHandleLeft,
                                    transform: "translate(-24%, -50%)",
                                }}
                            >
                                <span aria-hidden="true" style={handleGripStyle} />
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                radius="full"
                                variant="light"
                                color="primary"
                                data-alt-speed-handle="end"
                                role="slider"
                                aria-label={t("settings.labels.altSpeedEndHandleAria")}
                                aria-orientation="horizontal"
                                aria-valuemin={0}
                                aria-valuemax={dayMinutes / snapMinutes}
                                aria-valuenow={(isAllDay(visibleRange) ? dayMinutes : visibleRange.endMinutes) / snapMinutes}
                                aria-valuetext={`${formatMinutes(visibleRange.endMinutes)} ${durationText}`}
                                isDisabled={isDisabled}
                                onFocus={() => setIsRailActive(true)}
                                onBlur={() => interactionMode === null && setIsRailActive(false)}
                                onKeyDown={handleHandleKeyDown("end")}
                                onMouseDown={(event) => beginDrag("end", event)}
                                style={{
                                    ...handleStyle,
                                    opacity: showBandLabels ? 1 : 0.45,
                                    left: endHandleLeft,
                                    transform: "translate(-76%, -50%)",
                                }}
                            >
                                <span aria-hidden="true" style={handleGripStyle} />
                            </Button>
                        </div>
                    </div>
                </div>
                <div style={isDisabled ? disabledContentStyle : undefined}>
                    <div style={chipRowStyle}>
                        {altSpeedDayOptions.map((day, dayIndex) => {
                            const selected = Boolean(visibleRange.dayMask & day.mask);
                            return (
                                <Button
                                    key={day.id}
                                    type="button"
                                    size="sm"
                                    variant={selected ? "solid" : "bordered"}
                                    color={selected ? "primary" : "default"}
                                    data-day-index={dayIndex}
                                    isDisabled={isDisabled}
                                    onMouseDown={(event) => handleDayMouseDown(dayIndex, event)}
                                    onMouseEnter={() => handleDayMouseEnter(dayIndex)}
                                    style={{ minWidth: 0 }}
                                >
                                    {t(day.labelKey)}
                                </Button>
                            );
                        })}
                    </div>
                </div>
                <div style={isDisabled ? disabledContentStyle : undefined}>
                    <div className={surface.atom.insetBorderedItem} style={presetsPanelStyle}>
                        <span className={uiRoles.text.subtle}>
                            {t("settings.labels.altSpeedPresetGroup")}
                        </span>
                        <div style={chipRowStyle}>
                            {presets.map((preset) => (
                                <Button
                                    key={preset.id}
                                    size="sm"
                                    variant="light"
                                    data-alt-speed-preset={preset.id}
                                    isDisabled={isDisabled}
                                    onPress={() => handlePresetClick(preset)}
                                >
                                    {t(`settings.labels.altSpeedPreset_${preset.id}`)}
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div style={stackStyle}>
                <p className={schedulerEnabled ? uiRoles.text.muted : uiRoles.text.secondary}>
                    {formatSummary(visibleRange, t)}
                </p>
                {fieldError ? (
                    <p className={uiRoles.text.danger}>{fieldError}</p>
                ) : null}
            </div>
        </div>
    );
}
