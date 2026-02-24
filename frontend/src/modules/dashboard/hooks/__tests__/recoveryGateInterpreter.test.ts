import { describe, it, expect } from "vitest";
import {
    determineDisposition,
    type DispositionContext,
    type RecoveryFlowOutcome,
} from "@/modules/dashboard/hooks/recoveryGateInterpreter";
import type { MissingFilesClassification, RecoveryOutcome } from "@/services/recovery/recovery-contracts";

// ---------------------------------------------------------------------------
// Helpers — zero infrastructure, pure data
// ---------------------------------------------------------------------------

const testClassification: MissingFilesClassification = {
    kind: "pathLoss",
    confidence: "certain",
    recommendedActions: ["locate"],
};

const blockedOutcome: RecoveryOutcome = { kind: "blocked", reason: "missing" };
const userDecisionOutcome: RecoveryOutcome = { kind: "needs-user-decision", reason: "missing" };
const autoInProgressOutcome: RecoveryOutcome = { kind: "auto-in-progress" };
const autoRecoveredOutcome: RecoveryOutcome = { kind: "auto-recovered" };
const cancelledOutcome: RecoveryOutcome = { kind: "cancelled" };

const baseCtx: DispositionContext = {
    action: "resume",
    hasActiveSession: false,
    shouldUseEscalationGrace: true,
    suppressFeedback: false,
};

function ctx(overrides: Partial<DispositionContext>): DispositionContext {
    return { ...baseCtx, ...overrides };
}

function needsDisposition(outcome: RecoveryOutcome, classification = testClassification): RecoveryFlowOutcome {
    return {
        type: "needs-disposition",
        sessionOutcome: outcome,
        classification,
    };
}

const noOutcome: RecoveryFlowOutcome = { type: "no-outcome" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("determineDisposition", () => {
    // ── no-outcome paths ────────────────────────────────────────────────

    describe("no-outcome flow results", () => {
        it("returns fallback-blocked when escalation grace is active", () => {
            expect(determineDisposition(noOutcome, ctx({ shouldUseEscalationGrace: true }))).toEqual({
                type: "fallback-blocked",
                showFeedback: true,
            });
        });

        it("returns no-action when no escalation grace", () => {
            expect(determineDisposition(noOutcome, ctx({ shouldUseEscalationGrace: false }))).toEqual({
                type: "no-action",
            });
        });

        it("returns fallback-blocked without feedback when suppressed", () => {
            expect(
                determineDisposition(noOutcome, ctx({ shouldUseEscalationGrace: true, suppressFeedback: true })),
            ).toEqual({
                type: "fallback-blocked",
                showFeedback: false,
            });
        });
    });

    // ── recheck action ──────────────────────────────────────────────────

    describe("recheck action", () => {
        it("returns recheck-update when active session exists", () => {
            const flow = needsDisposition(blockedOutcome);
            expect(determineDisposition(flow, ctx({ action: "recheck", hasActiveSession: true }))).toEqual({
                type: "recheck-update",
                outcome: blockedOutcome,
            });
        });

        it("returns recheck-enqueue when no active session", () => {
            const flow = needsDisposition(blockedOutcome);
            expect(determineDisposition(flow, ctx({ action: "recheck", hasActiveSession: false }))).toEqual({
                type: "recheck-enqueue",
                outcome: blockedOutcome,
                classification: testClassification,
            });
        });

        it("returns recheck path regardless of outcome kind", () => {
            const flow = needsDisposition(userDecisionOutcome);
            expect(determineDisposition(flow, ctx({ action: "recheck", hasActiveSession: true }))).toEqual({
                type: "recheck-update",
                outcome: userDecisionOutcome,
            });
        });
    });

    // ── needs-user-decision ─────────────────────────────────────────────

    describe("needs-user-decision outcomes", () => {
        it("returns show-modal without joinExisting when no active session", () => {
            const flow = needsDisposition(userDecisionOutcome);
            expect(determineDisposition(flow, ctx({ hasActiveSession: false }))).toEqual({
                type: "show-modal",
                outcome: userDecisionOutcome,
                classification: testClassification,
                joinExisting: false,
            });
        });

        it("returns show-modal with joinExisting when active session", () => {
            const flow = needsDisposition(userDecisionOutcome);
            expect(determineDisposition(flow, ctx({ hasActiveSession: true }))).toEqual({
                type: "show-modal",
                outcome: userDecisionOutcome,
                classification: testClassification,
                joinExisting: true,
            });
        });
    });

    // ── blocked outcomes ────────────────────────────────────────────────

    describe("blocked outcomes", () => {
        it("returns blocked without updateSession when no active session", () => {
            const flow = needsDisposition(blockedOutcome);
            expect(determineDisposition(flow, ctx({ hasActiveSession: false }))).toEqual({
                type: "blocked",
                outcome: blockedOutcome,
                updateSession: false,
                showFeedback: true,
            });
        });

        it("returns blocked with updateSession when active session", () => {
            const flow = needsDisposition(blockedOutcome);
            expect(determineDisposition(flow, ctx({ hasActiveSession: true }))).toEqual({
                type: "blocked",
                outcome: blockedOutcome,
                updateSession: true,
                showFeedback: true,
            });
        });

        it("returns blocked without feedback when suppressed", () => {
            const flow = needsDisposition(blockedOutcome);
            expect(determineDisposition(flow, ctx({ suppressFeedback: true }))).toEqual({
                type: "blocked",
                outcome: blockedOutcome,
                updateSession: false,
                showFeedback: false,
            });
        });
    });

    // ── passthrough outcomes ────────────────────────────────────────────

    describe("passthrough outcomes", () => {
        it("returns no-action for auto-in-progress", () => {
            const flow = needsDisposition(autoInProgressOutcome);
            expect(determineDisposition(flow, baseCtx)).toEqual({ type: "no-action" });
        });

        it("returns no-action for auto-recovered", () => {
            const flow = needsDisposition(autoRecoveredOutcome);
            expect(determineDisposition(flow, baseCtx)).toEqual({ type: "no-action" });
        });

        it("returns no-action for cancelled", () => {
            const flow = needsDisposition(cancelledOutcome);
            expect(determineDisposition(flow, baseCtx)).toEqual({ type: "no-action" });
        });
    });
});
