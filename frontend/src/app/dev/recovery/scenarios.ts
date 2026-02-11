import { STATUS } from "@/shared/status";
import type {
    RecoveryConfidence,
    TorrentDetailEntity,
    TorrentEntity,
} from "@/services/rpc/entities";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";

export const DEV_RECOVERY_PLAYGROUND_PATH = "/__dev/recovery";
export const DEV_RECOVERY_TORRENT_ID = "dev-recovery-torrent";
export const DEV_RECOVERY_TORRENT_HASH = "dev-recovery-hash";

export type DevRecoveryScenarioId =
    | "data_gap"
    | "path_loss"
    | "volume_loss"
    | "access_denied";

export type DevRecoveryFaultMode =
    | "ok"
    | "missing"
    | "access_denied"
    | "disk_full";

export type DevRecoveryScenarioDefinition = {
    id: DevRecoveryScenarioId;
    labelKey: string;
    kind: "dataGap" | "pathLoss" | "volumeLoss" | "accessDenied";
    path: string;
    root?: string;
    faultMode: DevRecoveryFaultMode;
    errorClass: "missingFiles" | "permissionDenied";
    errorMessage: string;
    verifyFailsByDefault?: boolean;
};

export const DEV_RECOVERY_SCENARIOS: DevRecoveryScenarioDefinition[] = [
    {
        id: "data_gap",
        labelKey: "dev.recovery_playground.scenario.data_gap",
        kind: "dataGap",
        path: "D:\\RecoveryLab\\DataGap",
        faultMode: "ok",
        errorClass: "missingFiles",
        errorMessage: "hash-check failed; pieces missing",
        verifyFailsByDefault: true,
    },
    {
        id: "path_loss",
        labelKey: "dev.recovery_playground.scenario.path_loss",
        kind: "pathLoss",
        path: "D:\\RecoveryLab\\MissingFolder",
        faultMode: "missing",
        errorClass: "missingFiles",
        errorMessage: "No such file or directory",
    },
    {
        id: "volume_loss",
        labelKey: "dev.recovery_playground.scenario.volume_loss",
        kind: "volumeLoss",
        path: "E:\\DetachedVolume\\Media",
        root: "E:",
        faultMode: "missing",
        errorClass: "missingFiles",
        errorMessage: "Drive not ready: volume disconnected",
    },
    {
        id: "access_denied",
        labelKey: "dev.recovery_playground.scenario.access_denied",
        kind: "accessDenied",
        path: "D:\\RecoveryLab\\ReadOnly",
        faultMode: "access_denied",
        errorClass: "permissionDenied",
        errorMessage: "Access is denied",
    },
];

export const devRecoveryScenarioById = new Map<
    DevRecoveryScenarioId,
    DevRecoveryScenarioDefinition
>(DEV_RECOVERY_SCENARIOS.map((scenario) => [scenario.id, scenario]));

export const cloneDevErrorEnvelope = (source: TorrentEntity["errorEnvelope"]) =>
    source
        ? {
              ...source,
              recoveryActions: [...source.recoveryActions],
              automationHint: source.automationHint
                  ? { ...source.automationHint }
                  : source.automationHint,
          }
        : undefined;

export const cloneDevTorrentDetail = (source: TorrentDetailEntity): TorrentDetail => ({
    ...source,
    speed: { ...source.speed },
    peerSummary: { ...source.peerSummary },
    errorEnvelope: cloneDevErrorEnvelope(source.errorEnvelope),
});

export const createDevScenarioTorrent = (
    scenario: DevRecoveryScenarioDefinition,
    confidence: RecoveryConfidence,
): TorrentDetailEntity => ({
    id: DEV_RECOVERY_TORRENT_ID,
    hash: DEV_RECOVERY_TORRENT_HASH,
    name: "Recovery Playground Sample",
    state: STATUS.torrent.MISSING_FILES,
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0, total: 0 },
    totalSize: 1_610_612_736,
    eta: -1,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    leftUntilDone: 1_610_612_736,
    sizeWhenDone: 1_610_612_736,
    added: Date.now(),
    savePath: scenario.path,
    downloadDir: scenario.path,
    errorEnvelope: {
        errorClass: scenario.errorClass,
        errorMessage: scenario.errorMessage,
        lastErrorAt: Date.now(),
        recoveryState: "needsUserAction",
        retryCount: 0,
        nextRetryAt: null,
        recoveryActions: ["resume", "setLocation"],
        automationHint: null,
        recoveryKind: scenario.kind,
        recoveryConfidence: confidence,
        fingerprint: "dev-recovery-fingerprint",
        primaryAction: "resume",
    },
});

export const devFaultModeLabelKey: Record<DevRecoveryFaultMode, string> = {
    ok: "dev.recovery_playground.fault.ok",
    missing: "dev.recovery_playground.fault.missing",
    access_denied: "dev.recovery_playground.fault.access_denied",
    disk_full: "dev.recovery_playground.fault.disk_full",
};

