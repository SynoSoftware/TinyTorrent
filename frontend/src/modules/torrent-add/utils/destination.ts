export function hasControlChars(value: string) {
    return /[\r\n\t]/.test(value);
}

export type DestinationPathPolicy = "windows_abs_only" | "any_abs";

export function isValidDestinationForPolicy(
    path: string,
    policy: DestinationPathPolicy
) {
    const trimmed = path.trim();
    if (!trimmed) return false;
    if (hasControlChars(trimmed)) return false;

    const isWindowsAbs = /^[a-zA-Z]:[\\/]/.test(trimmed) || /^\\\\/.test(trimmed);
    const isPosixAbs = trimmed.startsWith("/");
    if (policy === "windows_abs_only") {
        return isWindowsAbs;
    }
    return isWindowsAbs || isPosixAbs;
}

export function describePathKind(path: string):
    | { kind: "drive"; drive: string }
    | { kind: "network" }
    | { kind: "posix" }
    | { kind: "unknown" } {
    if (!path) return { kind: "unknown" };
    const trimmed = path.trim();
    if (!trimmed) return { kind: "unknown" };
    const normalized = trimmed.replace(/\//g, "\\");
    if (normalized.startsWith("\\\\")) return { kind: "network" };
    if (/^[a-zA-Z]:\\/i.test(normalized))
        return { kind: "drive", drive: normalized[0]!.toUpperCase() };
    if (trimmed.startsWith("/")) return { kind: "posix" };
    return { kind: "unknown" };
}
