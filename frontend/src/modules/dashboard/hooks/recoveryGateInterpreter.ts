/**
 * Pure disposition interpreter for the recovery gate.
 *
 * Separates the **decision** ("what should happen?") from the **execution**
 * ("do it") so the decision logic is testable without hooks, mocks, or React.
 *
 * Flow:
 *   1. Orchestrator runs the recovery flow → produces a `RecoveryFlowOutcome`
 *   2. `determineDisposition(flowOutcome, ctx)` → pure sync decision
 *   3. Orchestrator mechanically executes the disposition (enqueue, feedback, …)
 */

import {
    assertRecoveryOutcomeExhaustive,
    type MissingFilesClassification,
    type RecoveryOutcome,
} from "@/services/recovery/recovery-contracts";
import type { RecoveryGateAction } from "@/app/types/recoveryGate";

// ---------------------------------------------------------------------------
// Flow outcome — what the recovery flow produced (after outcome upgrade)
// ---------------------------------------------------------------------------

export type RecoveryFlowOutcome =
    | { type: "no-outcome" }
    | {
          type: "needs-disposition";
          sessionOutcome: RecoveryOutcome;
          classification: MissingFilesClassification;
      };

// ---------------------------------------------------------------------------
// Disposition context — ambient state the decision function needs
// ---------------------------------------------------------------------------

export interface DispositionContext {
    action: RecoveryGateAction;
    hasActiveSession: boolean;
    shouldUseEscalationGrace: boolean;
    suppressFeedback: boolean;
}

// ---------------------------------------------------------------------------
// Outcome disposition — the pure decision
// ---------------------------------------------------------------------------

export type OutcomeDisposition =
    | {
          type: "show-modal";
          outcome: RecoveryOutcome;
          classification: MissingFilesClassification;
          joinExisting: boolean;
      }
    | {
          type: "blocked";
          outcome: RecoveryOutcome;
          updateSession: boolean;
          showFeedback: boolean;
      }
    | {
          type: "recheck-update";
          outcome: RecoveryOutcome;
      }
    | {
          type: "recheck-enqueue";
          outcome: RecoveryOutcome;
          classification: MissingFilesClassification;
      }
    | { type: "fallback-blocked"; showFeedback: boolean }
    | { type: "no-action" };

// ---------------------------------------------------------------------------
// determineDisposition — pure, sync, exhaustive on RecoveryOutcome
// ---------------------------------------------------------------------------

/**
 * Given the flow outcome and ambient context, decide what the orchestrator
 * should do.  This function has **no side effects** — it returns a data
 * object that the caller mechanically executes.
 *
 * Exhaustive on `RecoveryOutcome["kind"]`: adding a 6th variant will cause
 * a compile-time error here.
 */
export function determineDisposition(flowOutcome: RecoveryFlowOutcome, ctx: DispositionContext): OutcomeDisposition {
    // ── No blocking outcome was produced ────────────────────────────────
    if (flowOutcome.type === "no-outcome") {
        if (ctx.shouldUseEscalationGrace) {
            return { type: "fallback-blocked", showFeedback: !ctx.suppressFeedback };
        }
        return { type: "no-action" };
    }

    const { sessionOutcome, classification } = flowOutcome;

    // ── Recheck always surfaces without blocking on a promise ───────────
    if (ctx.action === "recheck") {
        if (ctx.hasActiveSession) {
            return { type: "recheck-update", outcome: sessionOutcome };
        }
        return { type: "recheck-enqueue", outcome: sessionOutcome, classification };
    }

    // ── Main outcome dispatch (exhaustive) ──────────────────────────────
    switch (sessionOutcome.kind) {
        case "needs-user-decision":
            return {
                type: "show-modal",
                outcome: sessionOutcome,
                classification,
                joinExisting: ctx.hasActiveSession,
            };

        case "blocked":
            return {
                type: "blocked",
                outcome: sessionOutcome,
                updateSession: ctx.hasActiveSession,
                showFeedback: !ctx.suppressFeedback,
            };

        case "auto-in-progress":
        case "auto-recovered":
        case "cancelled":
            // These kinds are resolved upstream by the flow;
            // reaching this point indicates a logic gap, but is safe.
            return { type: "no-action" };

        default:
            assertRecoveryOutcomeExhaustive(sessionOutcome);
    }
}
