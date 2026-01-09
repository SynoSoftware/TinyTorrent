import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type {
    TorrentDetailEntity,
    ErrorEnvelope,
} from "@/services/rpc/entities";

export type RecoveryOutcome =
    | { kind: "resolved"; message?: string }
    | {
          kind: "path-needed";
          reason: "missing" | "unwritable" | "disk-full";
          hintPath?: string;
          message?: string;
      }
    | { kind: "verify-started"; message?: string }
    | { kind: "reannounce-started"; message?: string }
    | { kind: "noop"; message?: string }
    | { kind: "error"; message: string };

export interface RecoveryControllerDeps {
    client: EngineAdapter;
    detail: TorrentDetailEntity;
    envelope?: ErrorEnvelope | null | undefined;
}

export interface RecoveryPlan {
    primaryAction:
        | "reDownloadHere"
        | "createAndDownloadHere"
        | "pickPath"
        | "verify"
        | "resume"
        | "reannounce"
        | "openFolder"
        | "none";
    rationale: string;
    requiresPath: boolean;
    suggestedPath?: string;
}

function interpretFsError(
    err: unknown
): "enoent" | "eacces" | "enospc" | "other" {
    try {
        // Prefer canonical code/errno fields when present
        const code = (err as any)?.code ?? (err as any)?.errno ?? null;
        if (typeof code === "string") {
            const c = code.toLowerCase();
            if (c === "enoent" || c === "notfound") return "enoent";
            if (c === "eacces" || c === "eperm" || c.includes("permission"))
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

export function planRecovery(
    envelope: ErrorEnvelope | null | undefined,
    detail: TorrentDetailEntity | null | undefined
): RecoveryPlan {
    const errorClass = envelope?.errorClass ?? "unknown";
    const downloadDir = detail?.downloadDir ?? detail?.savePath ?? undefined;
    const planBase: RecoveryPlan = {
        primaryAction: "none",
        rationale: "No action required",
        requiresPath: false,
        suggestedPath: downloadDir,
    };

    if (errorClass === "missingFiles") {
        planBase.primaryAction = "reDownloadHere";
        planBase.rationale = downloadDir
            ? "Path present — try re-download or recheck"
            : "No path known — user must pick a location";
        planBase.requiresPath = !downloadDir;
        return planBase;
    }
    if (errorClass === "permissionDenied") {
        planBase.primaryAction = "pickPath";
        planBase.rationale =
            "Permission denied for current path — pick another folder or open folder to fix permissions";
        planBase.requiresPath = true;
        return planBase;
    }
    if (errorClass === "diskFull") {
        planBase.primaryAction = "pickPath";
        planBase.rationale =
            "Disk full — check free space or pick another path";
        planBase.requiresPath = true;
        return planBase;
    }
    if (errorClass === "partialFiles") {
        planBase.primaryAction = "verify";
        planBase.rationale =
            "Partial files present — verify before re-download";
        planBase.requiresPath = false;
        return planBase;
    }
    if (errorClass === "trackerWarning" || errorClass === "trackerError") {
        planBase.primaryAction = "reannounce";
        planBase.rationale = "Tracker issues detected — reannounce to trackers";
        planBase.requiresPath = false;
        return planBase;
    }
    return planBase;
}

export async function runMissingFilesRecovery(
    deps: RecoveryControllerDeps
): Promise<RecoveryOutcome> {
    const { client, detail } = deps;
    const downloadDir = detail?.downloadDir ?? detail?.savePath ?? null;
    if (!downloadDir) {
        return {
            kind: "path-needed",
            reason: "missing",
            message: "No download path known for torrent",
        };
    }

    if (!client.checkFreeSpace) {
        // Cannot validate — ask user to confirm path
        return {
            kind: "noop",
            message:
                "Filesystem probing not supported by engine; user must confirm path",
        };
    }

    try {
        const fs = await client.checkFreeSpace(downloadDir);
        // Successful check implies path exists; however treat free<=0 as disk-full
        const free = (fs as any).free ?? null;
        if (typeof free === "number") {
            if (free <= 0) {
                return {
                    kind: "path-needed",
                    reason: "disk-full",
                    message: `Available bytes: ${free}`,
                };
            }
            return {
                kind: "noop",
                message: `Path exists and has ${free} free bytes`,
            };
        }
        return { kind: "noop", message: "Path check returned unknown result" };
    } catch (err) {
        const kind = interpretFsError(err);
        if (kind === "enoent") {
            if (typeof client.createDirectory === "function") {
                try {
                    await client.createDirectory(downloadDir);
                    return { kind: "resolved", message: "Directory created" };
                } catch (createErr) {
                    const i = interpretFsError(createErr);
                    if (i === "eacces") {
                        return {
                            kind: "path-needed",
                            reason: "unwritable",
                            message: String(createErr),
                        };
                    }
                    return {
                        kind: "path-needed",
                        reason: "missing",
                        message: String(createErr),
                    };
                }
            }
            return {
                kind: "path-needed",
                reason: "missing",
                message: "Path does not exist and creation is not supported",
            };
        }
        if (kind === "eacces") {
            return {
                kind: "path-needed",
                reason: "unwritable",
                message: String(err),
            };
        }
        if (kind === "enospc") {
            return {
                kind: "path-needed",
                reason: "disk-full",
                message: String(err),
            };
        }
        // Fail-safe for unknown errors: require user intervention with full message
        return {
            kind: "path-needed",
            reason: "missing",
            message: String(err ?? "Unknown error during path check"),
        };
    }
}

export async function runPermissionDeniedRecovery(
    _deps: RecoveryControllerDeps
): Promise<RecoveryOutcome> {
    // PermissionDenied: do not attempt create; prompt user to pick new path
    return {
        kind: "path-needed",
        reason: "unwritable",
        message: "Permission denied for current path",
    };
}

export async function runDiskFullRecovery(
    deps: RecoveryControllerDeps
): Promise<RecoveryOutcome> {
    const { client, detail } = deps;
    const downloadDir = detail?.downloadDir ?? detail?.savePath ?? null;
    if (!downloadDir) {
        return {
            kind: "path-needed",
            reason: "disk-full",
            message: "No download path known",
        };
    }
    if (!client.checkFreeSpace) {
        return {
            kind: "path-needed",
            reason: "disk-full",
            message: "Cannot check free space (capability missing)",
        };
    }
    try {
        const fs = await client.checkFreeSpace(downloadDir);
        const free = (fs as any).free ?? null;
        return {
            kind: "path-needed",
            reason: "disk-full",
            message: `Available bytes: ${free ?? "unknown"}`,
        };
    } catch (err) {
        return {
            kind: "error",
            message: String(err ?? "Failed to check free space"),
        };
    }
}

export async function runPartialFilesRecovery(
    deps: RecoveryControllerDeps
): Promise<RecoveryOutcome> {
    const { client, detail } = deps;
    if (!client.verify) {
        return { kind: "error", message: "Verify not supported by engine" };
    }
    try {
        await client.verify([detail.id]);
        return { kind: "verify-started", message: "Verify requested" };
    } catch (err) {
        return {
            kind: "error",
            message: String(err ?? "Failed to start verify"),
        };
    }
}

export async function runReannounce(
    deps: RecoveryControllerDeps
): Promise<RecoveryOutcome> {
    const { client, detail } = deps;
    if (!client.forceTrackerReannounce)
        return { kind: "error", message: "Reannounce not supported" };
    try {
        await client.forceTrackerReannounce(detail.id);
        return { kind: "reannounce-started", message: "Reannounce requested" };
    } catch (err) {
        return {
            kind: "error",
            message: String(err ?? "Failed to reannounce"),
        };
    }
}
