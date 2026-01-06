import type { ErrorEnvelope } from "@/services/rpc/entities";
import type { TFunction } from "i18next";

// Small helper to format recovery-aware labels and read-only intent hints.
// Use closed lookup maps to avoid dynamic i18n key construction so static
// audits can detect usages and avoid false "unused" reports.
const RECOVERY_HINT_KEY: Record<string, string> = {
    changeLocation: "recovery.hint.changeLocation",
    forceRecheck: "recovery.hint.forceRecheck",
    openFolder: "recovery.hint.openFolder",
    pause: "recovery.hint.pause",
    reannounce: "recovery.hint.reannounce",
    removeReadd: "recovery.hint.removeReadd",
    unknown: "recovery.hint.unknown",
};

// Explicit mapping from recoveryState -> i18n key. Keeps the set closed
// and discoverable by static tools.
const RECOVERY_STATE_LABEL_KEY: Record<string, string> = {
    ok: "labels.status.torrent.ok",
    verifying: "labels.status.torrent.verifying",
    transientWaiting: "labels.status.torrent.transientWaiting",
    needsUserConfirmation: "labels.status.torrent.needsUserConfirmation",
    needsUserAction: "labels.status.torrent.needsUserAction",
    blocked: "labels.status.torrent.blocked",
    checking: "labels.status.torrent.checking",
    downloading: "labels.status.torrent.downloading",
    error: "labels.status.torrent.error",
    missing_files: "labels.status.torrent.missing_files",
    paused: "labels.status.torrent.paused",
    queued: "labels.status.torrent.queued",
    seeding: "labels.status.torrent.seeding",
    stalled: "labels.status.torrent.stalled",
};

// Explicit mapping for errorClass -> label key.
const RECOVERY_CLASS_LABEL_KEY: Record<string, string> = {
    none: "recovery.class.none",
    trackerWarning: "recovery.class.trackerWarning",
    trackerError: "recovery.class.trackerError",
    localError: "recovery.class.localError",
    diskFull: "recovery.class.diskFull",
    permissionDenied: "recovery.class.permissionDenied",
    missingFiles: "recovery.class.missingFiles",
    partialFiles: "recovery.class.partialFiles",
    metadata: "recovery.class.metadata",
    unknown: "recovery.class.unknown",
};

export const formatRecoveryStatus = (
    envelope: ErrorEnvelope | undefined | null,
    t: TFunction,
    torrentState?: string,
    fallbackKey = "table.status_dl"
) => {
    if (!envelope) return t(fallbackKey);

    // Decide effective state: recovery overrides engine state when present
    const effectiveState =
        envelope.recoveryState && envelope.recoveryState !== "ok"
            ? envelope.recoveryState
            : torrentState || "unknown";

    const stateLabelKey =
        RECOVERY_STATE_LABEL_KEY[String(effectiveState)] ??
        `labels.status.torrent.${effectiveState}`;
    const stateLabel = t(stateLabelKey, {
        defaultValue: effectiveState,
    });
    return stateLabel;
};

export const formatRecoveryTooltip = (
    envelope: ErrorEnvelope | undefined | null,
    t: TFunction,
    torrentState?: string,
    fallbackKey = "table.status_dl"
) => {
    if (!envelope) return t(fallbackKey);

    const effectiveState =
        envelope.recoveryState && envelope.recoveryState !== "ok"
            ? envelope.recoveryState
            : torrentState || "unknown";

    const stateLabelKey =
        RECOVERY_STATE_LABEL_KEY[String(effectiveState)] ??
        `labels.status.torrent.${effectiveState}`;
    const classLabelKey =
        RECOVERY_CLASS_LABEL_KEY[String(envelope.errorClass)] ??
        `recovery.class.${envelope.errorClass}`;

    const stateLabel = t(stateLabelKey, {
        defaultValue: effectiveState,
    });
    const classLabel = t(classLabelKey, { defaultValue: envelope.errorClass });

    const parts: string[] = [];
    parts.push(stateLabel);
    if (classLabel && classLabel !== envelope.errorClass) {
        parts.push(classLabel);
    }
    if (envelope.errorMessage) {
        parts.push(envelope.errorMessage);
    }
    if (envelope.automationHint?.recommendedAction) {
        const action = envelope.automationHint.recommendedAction;
        const hintKey = RECOVERY_HINT_KEY[action] ?? `recovery.hint.${action}`;
        const hint = t(hintKey, { defaultValue: action });
        parts.push(hint);
    }

    return parts.join(" — ");
};

export const formatPrimaryActionHint = (
    envelope: ErrorEnvelope | undefined | null,
    t: TFunction
) => {
    if (!envelope?.primaryAction) return null;
    const action = envelope.primaryAction;
    const key = RECOVERY_HINT_KEY[action] ?? `recovery.hint.${action}`;
    return t(key, { defaultValue: action });
};

export default formatRecoveryStatus;

// Map a primaryAction to a small, subtle emphasis class for existing controls.
export const getEmphasisClassForAction = (
    primaryAction: string | null | undefined
) => {
    if (!primaryAction) return "";
    switch (primaryAction) {
        case "changeLocation":
        case "openFolder":
            return "ring-1 ring-primary/30 shadow-sm";
        case "reannounce":
            return "ring-1 ring-primary/30 shadow-sm";
        case "pause":
            return "ring-1 ring-warning/30 shadow-sm";
        case "forceRecheck":
        case "removeReadd":
            return "ring-1 ring-default/20 shadow-sm";
        default:
            return "";
    }
};
