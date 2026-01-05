import type { ErrorEnvelope } from "@/services/rpc/entities";
import type { TFunction } from "i18next";

// Small helper to format recovery-aware labels and read-only intent hints.
export const formatRecoveryStatus = (
    envelope: ErrorEnvelope | undefined | null,
    t: TFunction,
    fallbackKey = "table.status_dl"
) => {
    if (!envelope) return t(fallbackKey);

    // Map recovery state to short status label
    const stateLabelKey = `recovery.status.${envelope.recoveryState}`;
    const classLabelKey = `recovery.class.${envelope.errorClass}`;

    // Compose: prefer state label; add class detail in parentheses when informative
    const stateLabel = t(stateLabelKey, {
        defaultValue: envelope.recoveryState,
    });
    const classLabel = t(classLabelKey, { defaultValue: envelope.errorClass });

    if (classLabel && classLabel !== envelope.errorClass) {
        return `${stateLabel} (${classLabel})`;
    }
    return stateLabel;
};

export const formatPrimaryActionHint = (
    envelope: ErrorEnvelope | undefined | null,
    t: TFunction
) => {
    if (!envelope?.primaryAction) return null;
    const key = `recovery.hint.${envelope.primaryAction}`;
    return t(key, { defaultValue: envelope.primaryAction });
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
