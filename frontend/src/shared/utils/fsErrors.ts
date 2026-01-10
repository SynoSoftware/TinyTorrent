/* istanbul ignore file */
export type FsErrorKind = "enoent" | "eacces" | "enospc" | "other";

export function interpretFsError(err: unknown): FsErrorKind {
    try {
        const code = (err as any)?.code ?? (err as any)?.errno ?? null;
        if (typeof code === "string") {
            const c = code.toLowerCase();
            if (c === "enoent" || c === "notfound") return "enoent";
            if (
                c === "eacces" ||
                c === "eperm" ||
                c.includes("permission")
            )
                return "eacces";
            if (c === "enospc" || c.includes("nospace") || c.includes("enospc"))
                return "enospc";
        }
        const msg = (err as any)?.message?.toLowerCase?.() ?? String(err ?? "");
        if (
            msg.includes("enoent") ||
            msg.includes("no such file") ||
            msg.includes("not found")
        )
            return "enoent";
        if (
            msg.includes("eacces") ||
            msg.includes("permission") ||
            msg.includes("access is denied")
        )
            return "eacces";
        if (
            msg.includes("enospc") ||
            msg.includes("no space") ||
            msg.includes("disk full") ||
            msg.includes("not enough space")
        )
            return "enospc";
    } catch {}
    return "other";
}
