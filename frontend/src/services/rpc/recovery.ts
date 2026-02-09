import type { TransmissionTorrentDetail, TransmissionTorrent } from "@/services/rpc/types";
import type {
    ErrorClass,
    RecoveryState,
    RecoveryAction,
    ErrorEnvelope,
    EngineCapabilities,
} from "@/services/rpc/entities";
import { infraLogger } from "@/shared/utils/infraLogger";
// TODO: Keep this module Transmission-only and deterministic.
// TODO: This is a low-level “engine truth -> error envelope” projection and must not contain:
// TODO: - UI mode / ShellExtensions gating (that is `uiMode = "Full" | "Rpc"` at the UI layer)
// TODO: - RPC-extended concepts (tt-get-capabilities / websocket) now that “RPC extensions: NONE” is the architecture.
// TODO: Logging: standardize prefixes to “Transmission RPC” and avoid “tiny-torrent” wording once legacy paths are removed (todo.md task 1/8).
// TODO: Long-term: UI should render from recovery gate outputs; this envelope should remain a pure input to the controller/gate.

// Lightweight deterministic fingerprint (FNV-1a) for stable keys.
const fnv1a = (value: string) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < value.length; i += 1) {
        h ^= value.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16);
};

const reportedInvariantViolations = new Set<string>();

// Public entrypoint: compute a fully-populated ErrorEnvelope from engine truth.
// This centralizes all recovery & classification logic so callers (normalizers,
// UI) can rely on a single source of truth.
export const buildErrorEnvelope = (
    torrent: TransmissionTorrent,
    detail?: TransmissionTorrentDetail,
    capabilities?: EngineCapabilities
): ErrorEnvelope => {
    // TODO: Ensure this function stays pure: given the same inputs, emit the same envelope (no Date.now(), no random, no hidden module state).
    // TODO: If we need “time-based grace” (e.g., post-verify stall grace), it must be derived from Transmission fields (activityDate/addedDate) or owned by a higher-level view-model store.
    const msg =
        typeof torrent.errorString === "string" && torrent.errorString.trim()
            ? torrent.errorString.trim()
            : null;
    const errNum = typeof torrent.error === "number" ? torrent.error : 0;

    // Classify error class from rpc numeric + textual evidence.
    let errorClass: ErrorClass = "unknown";
    if (!errNum || errNum === 0) {
        errorClass = "none";
    } else if (errNum === 1) {
        errorClass = "trackerWarning";
    } else if (errNum === 2) {
        errorClass = "trackerError";
    } else if (errNum === 3) {
        if (
            msg &&
            (msg.toLowerCase().includes("no data found") ||
                msg.toLowerCase().includes("no such file") ||
                msg.toLowerCase().includes("not found"))
        ) {
            errorClass = "missingFiles";
        } else if (
            msg &&
            (msg.toLowerCase().includes("permission") ||
                msg.toLowerCase().includes("access is denied"))
        ) {
            errorClass = "permissionDenied";
        } else if (
            msg &&
            (msg.toLowerCase().includes("disk full") ||
                msg.toLowerCase().includes("no space") ||
                msg.toLowerCase().includes("not enough space") ||
                msg.toLowerCase().includes("enospc"))
        ) {
            errorClass = "diskFull";
        } else {
            errorClass = "localError";
        }
    } else {
        errorClass = "unknown";
    }

    // Enrich from tracker detail when available: if trackers show failures
    // but numeric rpc didn't mark, surface a trackerWarning (enrich only).
    if ((errNum === 0 || errNum === undefined) && detail?.trackers) {
        const anyFailed = detail.trackers.some(
            (t) =>
                t.lastAnnounceSucceeded === false &&
                (t.lastAnnounceResult || "")
        );
        if (anyFailed && errorClass === "none") {
            errorClass = "trackerWarning";
        }
    }

    // Detect partial / temporary files (.part and common partial suffixes)
    // when detail is available. This indicates a partially-written file
    // artifact that may require user action (do not attempt blind recovery).
    if (detail && Array.isArray(detail.files) && detail.files.length > 0) {
        const hasPartial = detail.files.some((f) => {
            const lower = f.name.toLowerCase();
            return (
                lower.endsWith(".part") ||
                lower.includes(".part.") ||
                lower.endsWith(".partial")
            );
        });
        if (hasPartial) {
            errorClass = "partialFiles";
        }
    }

    // Map to recovery state + actions deterministically.
    // Reuse a local mapping; keep this pure and deterministic.
    let recoveryState: RecoveryState = "ok";
    const recoveryActions: RecoveryAction[] = [];

    if (errorClass === "none") {
        recoveryState = "ok";
    } else if (
        errorClass === "trackerWarning" ||
        errorClass === "trackerError"
    ) {
        recoveryState = "transientWaiting";
        recoveryActions.push("reannounce");
    } else if (errorClass === "missingFiles") {
        recoveryState = "needsUserAction";
        // Engine-driven recovery actions: Resume is primary; verification,
        // location change, or re-download may be offered. No UI-only
        // dismissal/suppression actions are emitted here.
        recoveryActions.push(
            "resume",
            "forceRecheck",
            "setLocation",
            "reDownload"
        );
    } else if (errorClass === "permissionDenied") {
        recoveryState = "needsUserAction";
        recoveryActions.push("openFolder", "changeLocation");
    } else if (errorClass === "diskFull") {
        recoveryState = "blocked";
        // Non-destructive auto-pause may be applied elsewhere, but the
        // envelope must not gate `resume`. Surface `resume` as an option
        // so callers can present it (engine truth still governs success).
        recoveryActions.push("resume", "pause");
    } else {
        // localError, metadata, unknown, and any future classes map here
        recoveryState = "needsUserAction";
    }

    // Per FINAL RECOVERY CONTRACT: do not emit automation hints that imply
    // sequencing or recommended UI flows. The envelope must remain a pure
    // projection of engine truth; UI may decide presentation without hints.
    const automationHint = null;

    // Primary action selection: pure, deterministic selector. Gated by
    // confirmed engine capabilities when applicable.
    const isActionAllowed = (action: RecoveryAction) => {
        if (action === "reannounce") {
            return capabilities?.trackerReannounce === true;
        }
        // Other actions are local/client-driven; assume allowed.
        return true;
    };

    let primaryAction: RecoveryAction | null = null;

    // Priority lists by error class for deterministic selection.
    const preferred: Record<string, RecoveryAction[]> = {
        missingFiles: ["resume", "forceRecheck", "setLocation", "reDownload"],
        permissionDenied: ["openFolder", "changeLocation"],
        trackerWarning: ["reannounce"],
        trackerError: ["reannounce"],
        diskFull: ["resume", "pause"],
        localError: ["forceRecheck", "removeReadd", "pause"],
        unknown: recoveryActions,
    };

    // Helper to pick first allowed action from a list
    const pickFirstAllowed = (candidates: RecoveryAction[] | undefined) => {
        if (!candidates) return null;
        for (const a of candidates) {
            if (recoveryActions.includes(a) && isActionAllowed(a)) return a;
        }
        return null;
    };

    if (recoveryState === "ok") {
        primaryAction = null;
    } else {
        // Try preferred order for this error class
        primaryAction = pickFirstAllowed(preferred[errorClass] ?? []);
        // If nothing from preferred, fall back to the first allowed from recoveryActions
        if (!primaryAction) {
            primaryAction = pickFirstAllowed(recoveryActions) ?? null;
        }
    }

    // Stable fingerprint for later persistence: deterministic composition of
    // identity + cause. Use fnv1a for compactness.
    const id = torrent.hashString ?? String(torrent.id);
    const trackerList = (detail?.trackers ?? [])
        .map((t) => t.announce)
        .join(",");
    const fpBase = `${id}|${errorClass}|${msg ?? ""}|${trackerList}`;
    const envelopeFingerprint = fnv1a(fpBase);

    // Enforce invariants
    if (recoveryState === "ok" && primaryAction !== null) {
        infraLogger.warn({
            scope: "recovery",
            event: "primary_action_coerced",
            message: "Coercing primaryAction to null for ok recovery state",
        });
        primaryAction = null;
    }
    if (
        recoveryState === "needsUserAction" &&
        recoveryActions.length > 0 &&
        primaryAction === null
    ) {
        // No allowed action available; log and keep null (UI must prompt user)
        infraLogger.warn({
            scope: "recovery",
            event: "missing_primary_action",
            message:
                "Recovery state requires user action but no allowed primaryAction was selected",
            details: { fingerprint: envelopeFingerprint },
        });
    }

    const envelope: ErrorEnvelope = {
        errorClass,
        errorMessage: msg,
        // `lastErrorAt` is intentionally not computed here so this builder
        // remains pure and deterministic. The heartbeat/automation layer
        // is responsible for stamping the first-seen timestamp on
        // transitions (see recoveryAutomation.processHeartbeat).
        lastErrorAt: null,
        recoveryState,
        retryCount: null,
        nextRetryAt: null,
        recoveryActions,
        automationHint,
        fingerprint: envelopeFingerprint,
        primaryAction,
    };

    // Invariant checks: ensure no contradictory envelope emitted.
    const allowed: Record<ErrorClass, RecoveryState[]> = {
        none: ["ok"],
        trackerWarning: ["transientWaiting"],
        trackerError: ["transientWaiting"],
        localError: ["needsUserAction", "verifying"],
        diskFull: ["blocked"],
        permissionDenied: ["needsUserAction"],
        missingFiles: ["needsUserAction", "needsUserConfirmation"],
        partialFiles: ["needsUserAction"],
        metadata: ["needsUserAction"],
        unknown: ["needsUserAction"],
    };

    const allowedStates = allowed[errorClass] ?? ["needsUserAction"];
    const fingerprint = envelope.fingerprint;
    if (!allowedStates.includes(envelope.recoveryState)) {
        const fingerprintLabel = fingerprint ?? "<unknown>";
        const shouldReport =
            fingerprint !== undefined &&
            fingerprint !== null &&
            !reportedInvariantViolations.has(fingerprint);
        if (shouldReport) {
            // Defensive fix: log and coerce to first allowed state.
            // This preserves engine-truth-first behavior while preventing
            // contradictory envelopes.
            infraLogger.error({
                scope: "recovery",
                event: "envelope_invariant_violation",
                message: "Recovery envelope invariant violation detected",
                details: {
                    fingerprint: fingerprintLabel,
                    errorClass,
                    recoveryState: envelope.recoveryState,
                },
            });
            reportedInvariantViolations.add(fingerprint);
        } else if (fingerprintLabel === "<unknown>") {
            infraLogger.error({
                scope: "recovery",
                event: "envelope_invariant_violation",
                message: "Recovery envelope invariant violation detected",
                details: {
                    fingerprint: fingerprintLabel,
                    errorClass,
                    recoveryState: envelope.recoveryState,
                },
            });
        }
        envelope.recoveryState = allowedStates[0];
    } else if (fingerprint) {
        reportedInvariantViolations.delete(fingerprint);
    }

    return envelope;
};

export default buildErrorEnvelope;
