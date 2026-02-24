import type { EngineAdapter, EngineRuntimeCapabilities } from "@/services/rpc/engine-adapter";
import type {
    ErrorEnvelope,
    MissingFilesClassificationKind,
    RecoveryConfidence,
    TorrentDetailEntity,
    TorrentEntity,
} from "@/services/rpc/entities";

/**
 * Strict, closed discriminated union for recovery session outcomes.
 *
 * Exactly five semantic states — no mixed or contradictory representations.
 *
 * - **auto-in-progress** — automated recovery is executing (verify, reannounce, …)
 * - **auto-recovered**   — recovery completed without user input
 * - **needs-user-decision** — user must choose an action (locate, download, …)
 * - **blocked**           — recovery cannot proceed; no actionable user choice
 * - **cancelled**         — recovery was cancelled by user or system
 */
export type RecoveryOutcome =
    | { kind: "auto-in-progress"; detail?: "verify" | "reannounce"; message?: string }
    | { kind: "auto-recovered"; message?: string }
    | {
          kind: "needs-user-decision";
          reason: "missing" | "unwritable" | "disk-full";
          hintPath?: string;
          message?: string;
      }
    | {
          kind: "blocked";
          reason?: "missing" | "unwritable" | "disk-full" | "error";
          message?: string;
      }
    | { kind: "cancelled"; message?: string };

/** Compile-time exhaustiveness guard for `RecoveryOutcome` switches. */
export function assertRecoveryOutcomeExhaustive(outcome: never): never {
    throw new Error(`Unhandled RecoveryOutcome: ${JSON.stringify(outcome)}`);
}

export interface RecoveryControllerDeps {
    client: EngineAdapter;
    detail: TorrentDetailEntity;
    envelope?: ErrorEnvelope | null | undefined;
}

export type RecoveryRecommendedAction = "downloadMissing" | "locate" | "retry" | "openFolder" | "chooseLocation";

export type RecoveryEscalationSignal = "none" | "conflict" | "multipleCandidates";

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
    retryOnly?: boolean;
    missingBytes?: number | null;
    signal?: AbortSignal;
    skipVerifyIfEmpty?: boolean;
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

/**
 * Strict discriminated union for recovery sequence results.
 *
 * `blockingOutcome` is **required** when status is `"needsModal"` and
 * **absent** otherwise. This makes contradictory states unrepresentable.
 */
export type RecoverySequenceResult =
    | {
          status: "resolved";
          classification: MissingFilesClassification;
          log?: string;
      }
    | {
          status: "needsModal";
          classification: MissingFilesClassification;
          blockingOutcome: RecoveryOutcome;
      }
    | {
          status: "noop";
          classification: MissingFilesClassification;
          log?: string;
      };
