export async function tryWriteClipboard(text?: string): Promise<boolean> {
    if (!text) return false;
    try {
        if (typeof navigator === "undefined" || !navigator.clipboard) {
            return false;
        }
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

export async function writeClipboard(text?: string) {
    await tryWriteClipboard(text);
}

export default writeClipboard;
