export async function writeClipboard(text?: string) {
    if (!text) return;
    try {
        if (typeof navigator === "undefined" || !navigator.clipboard) return;
        await navigator.clipboard.writeText(text);
    } catch (e) {
        // Swallow errors; callers may surface feedback if needed.
    }
}

export default writeClipboard;
