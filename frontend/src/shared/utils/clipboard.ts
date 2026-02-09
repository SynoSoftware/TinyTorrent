export function isClipboardWriteSupported(): boolean {
    return (
        typeof navigator !== "undefined" &&
        typeof navigator.clipboard?.writeText === "function"
    );
}

export type ClipboardWriteOutcome =
    | { status: "copied" }
    | { status: "unsupported" }
    | { status: "empty" }
    | { status: "failed" };

export async function writeClipboardOutcome(
    text?: string,
): Promise<ClipboardWriteOutcome> {
    if (!text) {
        return { status: "empty" };
    }
    if (!isClipboardWriteSupported()) {
        return { status: "unsupported" };
    }
    try {
        await navigator.clipboard.writeText(text);
        return { status: "copied" };
    } catch {
        return { status: "failed" };
    }
}
