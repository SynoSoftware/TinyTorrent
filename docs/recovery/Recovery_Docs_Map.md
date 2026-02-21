# Recovery Docs Map

This is the single navigation entry for Recovery UX documentation.

## Canonical (Authoritative)

1. `TinyTorrent_Recovery_UX_Specification.md`
   - Product-level recovery behavior and policy.
   - Defines the normative outcome model and escalation intent.

2. `Recovery UX — Final Acceptance Specification (Post-Implementation).md`
   - Acceptance contract used to validate implementation behavior.
   - Defines required invariants and outcome → UI mapping.

3. `Recovery UX — Engineer Checklist.md`
   - Execution checklist for implementation and QA.
   - Must pass before shipping recovery changes.

## Implementation Directions (Non-Authoritative)

4. `Recovery_Implementation_Directions.md`
   - Planning and rollout guidance.
   - Useful for sequencing changes, but not a product contract.

## Historical / Non-Authoritative

Historical recovery notes are in `../bug fixing/` and are retained for context only.
They must not override canonical docs.

Key archived docs:

- `../bug fixing/TinyTorrent_Recovery_UX_Specification.md`
- `../bug fixing/Recovery UX — Final Acceptance Specification (Post-Implementation).md`
- `../bug fixing/Recovery UX - code trace.md`
- `../bug fixing/recovery automation.md`
- `../bug fixing/recovery ux implementation.md`

## Reading Order

1. Start with `TinyTorrent_Recovery_UX_Specification.md`
2. Validate with `Recovery UX — Final Acceptance Specification (Post-Implementation).md`
3. Execute against `Recovery UX — Engineer Checklist.md`
