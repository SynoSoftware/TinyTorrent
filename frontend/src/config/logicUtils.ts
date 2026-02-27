import type { Transition } from "framer-motion";
import type {
    NumberDomainDefaults,
    NumberDomainKeyMap,
    Writable,
} from "@/config/logicTypes";

export const normalizeRepeat = (value?: number) =>
    value === -1 ? Infinity : value;

export const normalizeRepeatType = (value: unknown) => {
    if (value === "loop" || value === "reverse" || value === "mirror") {
        return value;
    }
    return undefined;
};

export const adaptTransition = <T extends Transition>(transition: T) => ({
    ...transition,
    repeat: normalizeRepeat(transition.repeat),
});

export const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};

export const readOptionalNumber = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

export const readNumber = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const readNumberDomain = <T extends NumberDomainDefaults>(
    source: Record<string, unknown>,
    defaults: T,
    keyMap: NumberDomainKeyMap<T>,
): T => {
    const next = { ...defaults } as Writable<T>;
    for (const key of Object.keys(keyMap) as Array<keyof T>) {
        const configKey = keyMap[key];
        next[key] = readNumber(source[configKey], defaults[key]) as T[keyof T];
    }
    return next as T;
};

type NumberDomainSchema = Record<
    string,
    {
        configKey: string;
        fallback: number;
    }
>;

export const readNumberDomainFromSchema = <
    TSchema extends NumberDomainSchema,
>(
    source: Record<string, unknown>,
    schema: TSchema,
): { [K in keyof TSchema]: number } => {
    const next = {} as { [K in keyof TSchema]: number };
    for (const key of Object.keys(schema) as Array<keyof TSchema>) {
        const { configKey, fallback } = schema[key];
        next[key] = readNumber(source[configKey], fallback);
    }
    return next;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const mergeKnownKeysDeep = <T extends Record<string, unknown>>(
    defaults: T,
    overrides: unknown,
): T => {
    if (!isPlainObject(overrides)) {
        return defaults;
    }

    const next = { ...defaults } as Record<string, unknown>;

    for (const key of Object.keys(defaults)) {
        const defaultValue = defaults[key];
        const overrideValue = overrides[key];

        if (overrideValue === undefined) {
            continue;
        }

        if (isPlainObject(defaultValue) && isPlainObject(overrideValue)) {
            next[key] = mergeKnownKeysDeep(defaultValue, overrideValue);
            continue;
        }

        next[key] = overrideValue;
    }

    return next as T;
};

export const readOpacity = (value: unknown, fallback: number) => {
    if (
        value &&
        typeof value === "object" &&
        "opacity" in (value as Record<string, unknown>)
    ) {
        const candidate = (value as { opacity?: unknown }).opacity;
        if (typeof candidate === "number") return candidate;
    }
    return fallback;
};
