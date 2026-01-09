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
        planBase.rationale = "recovery.rationale.missing_files";
        planBase.requiresPath = !downloadDir;
        return planBase;
    }
    if (errorClass === "permissionDenied") {
        planBase.primaryAction = "pickPath";
        planBase.rationale = "recovery.rationale.permission_denied";
        planBase.requiresPath = true;
        return planBase;
    }
    if (errorClass === "diskFull") {
        planBase.primaryAction = "pickPath";
        planBase.rationale = "recovery.rationale.disk_full";
        planBase.requiresPath = true;
        return planBase;
    }
    if (errorClass === "partialFiles") {
        planBase.primaryAction = "verify";
        planBase.rationale = "recovery.rationale.partial_files";
        planBase.requiresPath = false;
        return planBase;
    }
    if (errorClass === "trackerWarning" || errorClass === "trackerError") {
        planBase.primaryAction = "reannounce";
        planBase.rationale = "recovery.rationale.tracker_issue";
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
            message: "no_download_path_known",
        };
    }

    if (!client.checkFreeSpace) {
        // Cannot validate — assume path is ready
        return {
            kind: "resolved",
            message: "filesystem_probing_not_supported",
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
                    message: "insufficient_free_space",
                };
            }
            return {
                kind: "resolved",
                message: "path_ready",
            };
        }
        return { kind: "error", message: "path_check_unknown" };
    } catch (err) {
        const kind = interpretFsError(err);
        if (kind === "enoent") {
            if (typeof client.createDirectory === "function") {
                try {
                    await client.createDirectory(downloadDir);
                    return { kind: "resolved", message: "directory_created" };
                } catch (createErr) {
                    const i = interpretFsError(createErr);
                    if (i === "eacces") {
                        return {
                            kind: "path-needed",
                            reason: "unwritable",
                            message: "directory_creation_denied",
                        };
                    }
                    return {
                        kind: "path-needed",
                        reason: "missing",
                        message: "directory_creation_failed",
                    };
                }
            }
            return {
                kind: "path-needed",
                reason: "missing",
                message: "directory_creation_not_supported",
            };
        }
        if (kind === "eacces") {
            return {
                kind: "path-needed",
                reason: "unwritable",
                message: "path_access_denied",
            };
        }
        if (kind === "enospc") {
            return {
                kind: "path-needed",
                reason: "disk-full",
                message: "disk_full",
            };
        }
        // Fail-safe for unknown errors: require user intervention with full message
        return {
            kind: "path-needed",
            reason: "missing",
            message: "path_check_failed",
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
        message: "permission_denied",
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
            message: "no_download_path_known",
        };
    }
    if (!client.checkFreeSpace) {
        return {
            kind: "path-needed",
            reason: "disk-full",
            message: "free_space_check_not_supported",
        };
    }
    try {
        const fs = await client.checkFreeSpace(downloadDir);
        const free = (fs as any).free ?? null;
        return {
            kind: "path-needed",
            reason: "disk-full",
            message: "insufficient_free_space",
        };
    } catch (err) {
        return {
            kind: "error",
            message: "free_space_check_failed",
        };
    }
}

export async function runPartialFilesRecovery(
    deps: RecoveryControllerDeps
): Promise<RecoveryOutcome> {
    const { client, detail } = deps;
    if (!client.verify) {
        return { kind: "error", message: "verify_not_supported" };
    }
    try {
        await client.verify([detail.id]);
        return { kind: "verify-started", message: "verify_started" };
    } catch (err) {
        return {
            kind: "error",
            message: "verify_failed",
        };
    }
}

export async function runReannounce(
    deps: RecoveryControllerDeps
): Promise<RecoveryOutcome> {
    const { client, detail } = deps;
    if (!client.forceTrackerReannounce)
        return { kind: "error", message: "reannounce_not_supported" };
    try {
        await client.forceTrackerReannounce(detail.id);
        return { kind: "reannounce-started", message: "reannounce_started" };
    } catch (err) {
        return {
            kind: "error",
            message: "reannounce_failed",
        };
    }
}
