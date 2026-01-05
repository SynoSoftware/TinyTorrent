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
