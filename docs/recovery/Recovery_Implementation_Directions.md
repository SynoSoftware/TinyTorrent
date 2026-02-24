# Recovery Implementation Directions (Non-Normative)

This document captures implementation directions and refactor sequencing.
It is intentionally non-normative.

For authoritative product behavior, use:

- `TinyTorrent_Recovery_UX_Specification.md`
- `Recovery UX — Final Acceptance Specification (Post-Implementation).md`
- `Recovery UX — Engineer Checklist.md`

## Immediate Fixes (Phase 1)

- Reorder wrapper logic so decision-required outcomes cannot be bypassed.
- Normalize legacy gate returns to one outcome kind at boundary.
- Add contradiction assertions/logging (decision-required without modal effect).
- Ensure dedupe does not suppress terminal transitions (`AUTO_RECOVERED`, `NEEDS_USER_DECISION`, `BLOCKED`).
- Guarantee visible UI change within 500ms for user-triggered recovery actions.

## Structural Corrections (Phase 2)

- Replace parallel booleans with discriminated outcome union.
- Remove vague legacy outcomes.
- Introduce explicit `AUTO_IN_PROGRESS` and `BLOCKED` handling.
- Add bounded escalation policy with explicit timer-expiry branching and certainty fast-path.
- Centralize outcome-to-UI mapping in exactly one place.

## Directional Outcome Model

- `AUTO_RECOVERED`
- `AUTO_IN_PROGRESS`
- `NEEDS_USER_DECISION`
- `BLOCKED`
- `CANCELLED`

## UX Direction

- Auto-heal first when deterministic and safe.
- Ask only when meaningful user choice exists.
- If certainty exists from the start that user decision is required, allow immediate `NEEDS_USER_DECISION`.
- Keep modal as decision UI, not status UI.
- Preserve liveness and avoid silent no-op states.

## Transmission-Specific Direction

- Recovery transitions must be derived from daemon/RPC truth only.
- Shell integration is input convenience only (browse/manual entry support), never a recovery-state authority.
- Treat missing-files cases as decision-capable only when real actions exist.
- Use blocked/error UI for no-choice states.
- Keep path/volume transient handling optimized for auto-recovery before escalation.
