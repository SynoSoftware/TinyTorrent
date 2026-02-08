export function hasControlChars(value: string) {
    return /[\r\n\t]/.test(value);
}

export function isValidDestinationForMode(
    path: string,
    uiMode: "Full" | "Rpc"
) {
    const trimmed = path.trim();
    if (!trimmed) return false;
    if (hasControlChars(trimmed)) return false;

    const isWindowsAbs = /^[a-zA-Z]:[\\/]/.test(trimmed) || /^\\\\/.test(trimmed);
    const isPosixAbs = trimmed.startsWith("/");
    // TODO(section 20.4/21.5): remove UA heuristic capability probing and derive
    // destination policy from a single explicit runtime/session authority.
    const isProbablyWindows =
        typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
    if (uiMode === "Full") return isWindowsAbs || (!isProbablyWindows && isPosixAbs);
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
