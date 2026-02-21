import type {
    EngineAdapter,
    EngineRuntimeCapabilities,
} from "@/services/rpc/engine-adapter";
import type {
    ErrorEnvelope,
    MissingFilesClassificationKind,
    RecoveryConfidence,
    TorrentDetailEntity,
    TorrentEntity,
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

export type RecoveryRecommendedAction =
    | "downloadMissing"
    | "locate"
    | "retry"
    | "openFolder"
    | "chooseLocation";

export type RecoveryEscalationSignal =
    | "none"
    | "conflict"
    | "multipleCandidates";

export interface MissingFilesClassification {
    kind: MissingFilesClassificationKind;
    confidence: RecoveryConfidence;
    path?: string;
    root?: string;
    recommendedActions: readonly RecoveryRecommendedAction[];
    escalationSignal?: RecoveryEscalationSignal;
}

export type MissingFilesProbeResult =
    | {
          kind: "path_missing";
          confidence: RecoveryConfidence;
          path: string;
          expectedBytes: number;
          onDiskBytes: number | null;
          missingBytes: number | null;
          toDownloadBytes: number | null;
          ts: number;
      }
    | {
          kind: "data_missing";
          confidence: RecoveryConfidence;
          expectedBytes: number;
          onDiskBytes: number | null;
          missingBytes: number | null;
          toDownloadBytes: number | null;
          ts: number;
      }
    | {
          kind: "data_partial";
          confidence: RecoveryConfidence;
          expectedBytes: number;
          onDiskBytes: number;
          missingBytes: number;
          toDownloadBytes: number;
          ts: number;
      }
    | {
          kind: "unknown";
          confidence: RecoveryConfidence;
          expectedBytes: number;
          ts: number;
      }
    | {
          kind: "ok";
          confidence: RecoveryConfidence;
          expectedBytes: number;
          onDiskBytes: number;
          missingBytes: number;
          toDownloadBytes: number;
          ts: number;
      };

export interface RecoverySequenceOptions {
    recreateFolder?: boolean;
    retryOnly?: boolean;
    missingBytes?: number | null;
    signal?: AbortSignal;
    skipVerifyIfEmpty?: boolean;
    autoCreateMissingFolder?: boolean;
}

export interface RecoverySequenceParams {
    client: EngineAdapter;
    torrent: TorrentEntity | TorrentDetailEntity;
    envelope: ErrorEnvelope;
    classification: MissingFilesClassification;
    engineCapabilities: EngineRuntimeCapabilities;
    options?: RecoverySequenceOptions;
}

export type RecoverySequenceStatus = "resolved" | "needsModal" | "noop";

export interface RecoverySequenceResult {
    status: RecoverySequenceStatus;
    classification: MissingFilesClassification;
    blockingOutcome?: RecoveryOutcome;
    log?: string;
}
