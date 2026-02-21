import type { EngineRuntimeCapabilities } from "@/services/rpc/engine-adapter";
import type {
    ErrorEnvelope,
    MissingFilesClassificationKind,
    RecoveryConfidence,
} from "@/services/rpc/entities";
import { deriveMissingFilesStateKind } from "@/shared/utils/recoveryFormat";
import {
    getClassificationOverride,
} from "@/services/recovery/missingFilesStore";
import type {
    MissingFilesClassification,
    RecoveryRecommendedAction,
} from "@/services/recovery/recovery-contracts";

export interface ClassificationOptions {
    torrentId?: string | number;
    engineCapabilities: EngineRuntimeCapabilities;
}

export function classifyMissingFilesState(
    envelope: ErrorEnvelope | null | undefined,
    downloadDir: string | undefined,
    opts: ClassificationOptions,
): MissingFilesClassification {
    const override = opts.torrentId
        ? getClassificationOverride(opts.torrentId)
        : undefined;
    const overrideKind = override?.kind ?? envelope?.recoveryKind;
    const overrideConfidence =
        override?.confidence ?? envelope?.recoveryConfidence;
    const kind =
        overrideKind ??
        (envelope
            ? deriveMissingFilesStateKind(envelope, downloadDir)
            : "dataGap");
    const root = resolveRootFromPath(downloadDir);
    const executionModel = opts.engineCapabilities.executionModel;
    const confidence =
        overrideConfidence ??
        determineConfidence(kind, envelope, executionModel);
    return {
        kind,
        confidence,
        path: override?.path ?? downloadDir,
        root: override?.root ?? root,
        recommendedActions: deriveRecommendedActions(kind),
        escalationSignal: "none",
    };
}

function determineConfidence(
    kind: MissingFilesClassificationKind,
    envelope: ErrorEnvelope | null | undefined,
    executionModel: EngineRuntimeCapabilities["executionModel"],
): RecoveryConfidence {
    if (executionModel === "local") {
        return "certain";
    }
    if (envelope?.errorClass === "missingFiles") {
        return "likely";
    }
    if (
        kind === "pathLoss" ||
        kind === "volumeLoss" ||
        kind === "accessDenied"
    ) {
        return "likely";
    }
    return "unknown";
}

function resolveRootFromPath(path?: string) {
    if (!path) return undefined;
    const driveMatch = path.match(/^([a-zA-Z]:)([\\/]|$)/);
    if (driveMatch) {
        return driveMatch[1];
    }
    const uncMatch = path.match(/^(\\\\[^\\/]+\\[^\\/]+)/);
    if (uncMatch) {
        return uncMatch[1];
    }
    return path;
}

const RECOVERY_RECOMMENDED_ACTIONS: Record<
    MissingFilesClassificationKind,
    readonly RecoveryRecommendedAction[]
> = {
    dataGap: ["downloadMissing", "openFolder"],
    pathLoss: ["locate", "downloadMissing"],
    volumeLoss: ["retry", "locate"],
    accessDenied: ["chooseLocation", "locate"],
};

export function deriveRecommendedActions(
    kind: MissingFilesClassificationKind,
): readonly RecoveryRecommendedAction[] {
    return RECOVERY_RECOMMENDED_ACTIONS[kind] ?? ["locate"];
}
