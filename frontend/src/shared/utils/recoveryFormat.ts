import type { ErrorEnvelope } from "@/services/rpc/entities";
import type { TFunction } from "i18next";

// TODO: Move recovery formatting to accept the *recovery gate output* (typed `{state, confidence, recommendedActions}`) instead of parsing `ErrorEnvelope` directly.
// TODO: Rationale:
// TODO: - `ErrorEnvelope` is a low-level projection of engine truth; UI should render from a single “gate/view-model” authority.
// TODO: - This file currently contains regex/message heuristics and implicit mappings that are easy to desync from Recovery UX acceptance specs.
// TODO: Migration plan:
// TODO: - Keep these helpers temporarily as “legacy formatters”.
// TODO: - Add new formatters that accept gate state and remove reliance on `errorMessage` string parsing.
// TODO: Align with todo.md tasks 9, 10, 12.

const RECOVERY_HINT_KEY: Record<string, string> = {
    changeLocation: "recovery.hint.changeLocation",
    forceRecheck: "recovery.hint.forceRecheck",
    openFolder: "recovery.hint.openFolder",
    pause: "recovery.hint.pause",
    reannounce: "recovery.hint.reannounce",
    removeReadd: "recovery.hint.removeReadd",
    unknown: "recovery.hint.unknown",
};

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

    const effectiveState =
        envelope.recoveryState && envelope.recoveryState !== "ok"
            ? envelope.recoveryState
            : torrentState || "unknown";

    const stateLabelKey =
        RECOVERY_STATE_LABEL_KEY[String(effectiveState)] ??
        `labels.status.torrent.${effectiveState}`;
    const stateLabel = t(stateLabelKey);
    return stateLabel;
};

export const formatRecoveryTooltip = (
    envelope: ErrorEnvelope | undefined | null,
    t: TFunction,
    torrentState?: string,
    fallbackKey = "table.status_dl"
) => {
    if (!envelope) return t(fallbackKey);

    let effectiveState =
        envelope.recoveryState && envelope.recoveryState !== "ok"
            ? envelope.recoveryState
            : torrentState || "unknown";

    if (envelope.errorClass === "missingFiles") {
        effectiveState = "missing_files";
    }

    const stateLabelKey =
        RECOVERY_STATE_LABEL_KEY[String(effectiveState)] ??
        `labels.status.torrent.${effectiveState}`;
    const classLabelKey =
        RECOVERY_CLASS_LABEL_KEY[String(envelope.errorClass)] ??
        `recovery.class.${envelope.errorClass}`;

    const stateLabel = t(stateLabelKey);
    const classLabel = t(classLabelKey);

    const parts: string[] = [stateLabel];
    if (classLabel && classLabel !== envelope.errorClass && classLabel !== stateLabel) {
        parts.push(classLabel);
    }
    if (
        envelope.errorMessage &&
        envelope.errorClass !== "missingFiles" &&
        !/(no data found|no such file|not found)/i.test(envelope.errorMessage)
    ) {
        parts.push(envelope.errorMessage);
    }
    if (envelope.automationHint?.recommendedAction) {
        const action = envelope.automationHint.recommendedAction;
        if (!(envelope.errorClass === "missingFiles" && action === "removeReadd")) {
            const hintKey =
                RECOVERY_HINT_KEY[action] ?? `recovery.hint.${action}`;
            const hint = t(hintKey);
            parts.push(hint);
        }
    }

    return parts.filter((value, index, self) => self.indexOf(value) === index).join(" - ");
};

export const formatPrimaryActionHint = (
    envelope: ErrorEnvelope | undefined | null,
    t: TFunction
) => {
    if (!envelope?.primaryAction) return null;
    const action = envelope.primaryAction;
    const key = RECOVERY_HINT_KEY[action] ?? `recovery.hint.${action}`;
    return t(key);
};

export default formatRecoveryStatus;

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
        case "reDownloadHere":
        case "reDownload":
            return "ring-1 ring-primary/30 shadow-sm";
        default:
            return "";
    }
};

export const extractDriveLabel = (value?: string | null) => {
    if (!value) return null;
    const letterMatch = value.match(/^([a-zA-Z]:)/);
    if (letterMatch) return letterMatch[1];
    const uncMatch = value.match(/^(\\\\[^\\/]+\\[^\\/]+)/);
    if (uncMatch) return uncMatch[1];
    return null;
};

export type MissingFilesStateKind =
    | "dataGap"
    | "pathLoss"
    | "volumeLoss"
    | "accessDenied";

export const deriveMissingFilesStateKind = (
    envelope: ErrorEnvelope | undefined | null,
    path?: string
): MissingFilesStateKind => {
    // TODO: Replace this heuristic parsing with controller/gate-provided classification once recovery emits deterministic state/confidence.
    // TODO: The UI should not infer “volume loss vs path loss” by scanning strings; that logic belongs in one place (recovery controller).
    const errorClass = envelope?.errorClass;
    if (errorClass === "permissionDenied") {
        return "accessDenied";
    }
    const message = (envelope?.errorMessage ?? "").toLowerCase();
    if (/permission|access is denied|read-only/.test(message)) {
        return "accessDenied";
    }
    if (
        /(drive|volume|disk|unplugged|disconnected|not ready)/.test(message) &&
        /(not found|missing|unplugged)/.test(message)
    ) {
        return "volumeLoss";
    }
    if (
        /(no such file|not found|missing file|folder)/.test(message) ||
        (typeof path === "string" && message.length === 0 && path.includes("\\"))
    ) {
        return "pathLoss";
    }
    return "dataGap";
};
