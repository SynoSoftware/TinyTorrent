import { isFileAccessError } from "@/modules/torrent-add/services/add-torrent-errors";

async function readFileAsDataUrl(file: File): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== "string") {
                reject(new Error("tt_file_read_failed"));
                return;
            }
            resolve(result);
        };
        reader.onerror = () =>
            reject(reader.error ?? new Error("tt_file_read_failed"));
        reader.readAsDataURL(file);
    });
}

export type TorrentMetainfoResult =
    | { ok: true; metainfoBase64: string }
    | { ok: false; reason: "access_denied" | "read_failed" };

export async function parseTorrentFile(
    file: File,
): Promise<TorrentMetainfoResult> {
    try {
        const dataUrl = await readFileAsDataUrl(file);
        const [, base64] = dataUrl.split(",");
        if (!base64) {
            return { ok: false, reason: "read_failed" };
        }
        return { ok: true, metainfoBase64: base64 };
    } catch (error) {
        if (isFileAccessError(error)) {
            return { ok: false, reason: "access_denied" };
        }
        return { ok: false, reason: "read_failed" };
    }
}
