type InfraLogLevel = "debug" | "warn" | "error";

type InfraLogValue = string | number | boolean | null | undefined | object;

export type InfraLogDetails = Record<string, InfraLogValue>;

export interface InfraLogEvent {
    scope: string;
    event: string;
    message: string;
    details?: InfraLogDetails;
}

const LOG_PREFIX = "[tiny-torrent]";

const getConsoleMethod = (
    level: InfraLogLevel,
): ((...args: unknown[]) => void) | null => {
    if (typeof console === "undefined") {
        return null;
    }
    if (level === "debug" && typeof console.debug === "function") {
        return console.debug.bind(console) as (...args: unknown[]) => void;
    }
    if (level === "warn" && typeof console.warn === "function") {
        return console.warn.bind(console) as (...args: unknown[]) => void;
    }
    if (level === "error" && typeof console.error === "function") {
        return console.error.bind(console) as (...args: unknown[]) => void;
    }
    return null;
};

const writeLog = (
    level: InfraLogLevel,
    event: InfraLogEvent,
    errorDetail?: unknown,
) => {
    const writer = getConsoleMethod(level);
    if (!writer) {
        return;
    }
    const payload: InfraLogDetails = {
        scope: event.scope,
        event: event.event,
        message: event.message,
        ...(event.details ? { details: event.details } : {}),
    };

    try {
        if (errorDetail === undefined) {
            writer(LOG_PREFIX, payload);
            return;
        }
        writer(LOG_PREFIX, payload, errorDetail);
    } catch {
        // Logging must never break runtime behavior.
    }
};

export const infraLogger = {
    debug(event: InfraLogEvent, errorDetail?: unknown) {
        writeLog("debug", event, errorDetail);
    },
    warn(event: InfraLogEvent, errorDetail?: unknown) {
        writeLog("warn", event, errorDetail);
    },
    error(event: InfraLogEvent, errorDetail?: unknown) {
        writeLog("error", event, errorDetail);
    },
} as const;
