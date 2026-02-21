import type {
    ErrorClass,
    ErrorEnvelope,
    MissingFilesClassificationKind,
    RecoveryAction,
    RecoveryState,
    TorrentStatus,
} from "@/services/rpc/entities";
import type {
    MissingFilesClassification,
    RecoveryRecommendedAction,
} from "@/services/recovery/recovery-controller";
import type { TFunction } from "i18next";

type RecoveryHintAction =
    | RecoveryAction
    | RecoveryRecommendedAction
    | "unknown";

const RECOVERY_HINT_KEY: Record<RecoveryHintAction, string> = {
    changeLocation: "recovery.hint.changeLocation",
    chooseLocation: "recovery.hint.chooseLocation",
    downloadMissing: "recovery.hint.downloadMissing",
    locate: "recovery.hint.locate",
    forceRecheck: "recovery.hint.forceRecheck",
    openFolder: "recovery.hint.openFolder",
    pause: "recovery.hint.pause",
    reannounce: "recovery.hint.reannounce",
    resume: "recovery.hint.resume",
    retry: "recovery.hint.retry",
    setLocation: "recovery.hint.chooseLocation",
    dismiss: "recovery.hint.unknown",
    unknown: "recovery.hint.unknown",
};

const isRecoveryHintAction = (value: string): value is RecoveryHintAction =>
    Object.prototype.hasOwnProperty.call(RECOVERY_HINT_KEY, value);

const resolveRecoveryHintKey = (action: string) =>
    isRecoveryHintAction(action)
        ? RECOVERY_HINT_KEY[action]
        : `recovery.hint.${action}`;

const translateRecoveryHint = (action: string, t: TFunction) => {
    const key = resolveRecoveryHintKey(action);
    const value = t(key);
    return value === key ? t("recovery.hint.unknown") : value;
};

const RECOVERY_STATE_LABEL_KEY = {
    ok: "labels.status.torrent.ok",
    verifying: "labels.status.torrent.verifying",
    transientWaiting: "labels.status.torrent.transientWaiting",
    needsUserConfirmation: "labels.status.torrent.needsUserConfirmation",
    needsUserAction: "labels.status.torrent.needsUserAction",
    blocked: "labels.status.torrent.blocked",
} satisfies Record<RecoveryState, string>;

const TORRENT_STATE_LABEL_KEY = {
    checking: "labels.status.torrent.checking",
    downloading: "labels.status.torrent.downloading",
    error: "labels.status.torrent.error",
    missing_files: "labels.status.torrent.missing_files",
    paused: "labels.status.torrent.paused",
    queued: "labels.status.torrent.queued",
    seeding: "labels.status.torrent.seeding",
    stalled: "labels.status.torrent.stalled",
} satisfies Record<TorrentStatus, string>;

const resolveRecoveryState = (
    envelope: ErrorEnvelope,
    torrentState?: TorrentStatus
) =>
    envelope.recoveryState !== "ok"
        ? envelope.recoveryState
        : torrentState ?? "unknown";

const getRecoveryStateLabelKey = (state: string) =>
    Object.prototype.hasOwnProperty.call(TORRENT_STATE_LABEL_KEY, state)
        ? TORRENT_STATE_LABEL_KEY[state as TorrentStatus]
        : Object.prototype.hasOwnProperty.call(RECOVERY_STATE_LABEL_KEY, state)
          ? RECOVERY_STATE_LABEL_KEY[state as RecoveryState]
          : `labels.status.torrent.${state}`;

const RECOVERY_CLASS_LABEL_KEY: Record<ErrorClass, string> = {
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

const uniqueJoin = (parts: string[]) =>
    parts.filter((value, index, source) => source.indexOf(value) === index).join(" - ");

const RECOVERY_EMPHASIS_CLASS_BY_ACTION: Partial<
    Record<RecoveryAction, string>
> = {
    changeLocation: "ring-1 ring-primary/30 shadow-sm",
    openFolder: "ring-1 ring-primary/30 shadow-sm",
    reannounce: "ring-1 ring-primary/30 shadow-sm",
    pause: "ring-1 ring-warning/30 shadow-sm",
    forceRecheck: "ring-1 ring-default/20 shadow-sm",
    downloadMissing: "ring-1 ring-primary/30 shadow-sm",
    setLocation: "ring-1 ring-primary/30 shadow-sm",
};

export const formatRecoveryStatus = (
    envelope: ErrorEnvelope | undefined | null,
    t: TFunction,
    torrentState?: TorrentStatus,
    fallbackKey = "table.status_dl"
) => {
    if (!envelope) return t(fallbackKey);

    const effectiveState = resolveRecoveryState(envelope, torrentState);
    const stateLabelKey = getRecoveryStateLabelKey(effectiveState);
    const stateLabel = t(stateLabelKey);
    return stateLabel;
};

export const formatRecoveryTooltip = (
    envelope: ErrorEnvelope | undefined | null,
    t: TFunction,
    torrentState?: TorrentStatus,
    fallbackKey = "table.status_dl"
) => {
    if (!envelope) return t(fallbackKey);

    const effectiveState = resolveRecoveryState(envelope, torrentState);
    const stateLabelKey = getRecoveryStateLabelKey(effectiveState);
    const classLabelKey = RECOVERY_CLASS_LABEL_KEY[envelope.errorClass];

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
        const hint = translateRecoveryHint(action, t);
        parts.push(hint);
    }

    return uniqueJoin(parts);
};

export const formatPrimaryActionHint = (
    envelope: ErrorEnvelope | undefined | null,
    t: TFunction
) => {
    if (!envelope?.primaryAction) return null;
    const action = envelope.primaryAction;
    return translateRecoveryHint(action, t);
};

export const getEmphasisClassForAction = (
    primaryAction: RecoveryAction | null | undefined
) => (primaryAction ? RECOVERY_EMPHASIS_CLASS_BY_ACTION[primaryAction] ?? "" : "");

export const extractDriveLabel = (value?: string | null) => {
    if (!value) return null;
    const letterMatch = value.match(/^([a-zA-Z]:)/);
    if (letterMatch) return letterMatch[1];
    const uncMatch = value.match(/^(\\\\[^\\/]+\\[^\\/]+)/);
    if (uncMatch) return uncMatch[1];
    return null;
};

export const deriveMissingFilesStateKind = (
    envelope: ErrorEnvelope | undefined | null,
    path?: string
): MissingFilesClassificationKind => {
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

const CLASSIFICATION_STATUS_KEY: Record<
    MissingFilesClassificationKind,
    string
> = {
    dataGap: "recovery.generic_header",
    pathLoss: "recovery.status.folder_not_found",
    volumeLoss: "recovery.status.drive_disconnected",
    accessDenied: "recovery.status.access_denied",
};

export const formatRecoveryStatusFromClassification = (
    classification: MissingFilesClassification | null,
    t: TFunction
) => {
    if (!classification) return t("recovery.generic_header");
    if (classification.confidence === "unknown") {
        return t("recovery.inline_fallback");
    }
    const key = CLASSIFICATION_STATUS_KEY[classification.kind];
    switch (classification.kind) {
        case "pathLoss":
            return t(key, {
                path: classification.path ?? t("labels.unknown"),
            });
        case "volumeLoss": {
            const drive =
                classification.root ??
                extractDriveLabel(classification.path ?? "") ??
                t("labels.unknown");
            return t(key, { drive });
        }
        default:
            return t(key);
    }
};

export const formatRecoveryTooltipFromClassification = (
    classification: MissingFilesClassification | null,
    t: TFunction
) => {
    return formatRecoveryStatusFromClassification(classification, t);
};

export const formatPrimaryActionHintFromClassification = (
    classification: MissingFilesClassification | null,
    t: TFunction
) => {
    if (!classification || !classification.recommendedActions.length) {
        return null;
    }
    const action = classification.recommendedActions[0];
    return translateRecoveryHint(action, t);
};
