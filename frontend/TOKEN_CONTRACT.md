# Token Contract (Final-Form Only)

Updated: 2026-02-13

## Purpose

This document is the source of truth for TinyTorrent theme tokens.

Hard policy:
- No transition states.
- No compatibility aliases.
- No feature-owned token maps as long-term authorities.
- No drift: one visual intent must map to one canonical token.

Design-quality rule:
- Do not minimize token count for its own sake.
- Keep enough semantic tokens to preserve strong visual hierarchy and clear
  parent-child integration.
- A token set is correct when a human can track it and the UI remains
  intentional, not flattened/neutered.

If any other document suggests transitional or compatibility behavior, this
file overrides it.

Primary implementation file:
- `frontend/src/shared/ui/layout/glass-surface.ts`

Related authorities:
- `frontend/src/config/textRoles.ts`
- `frontend/src/config/logic.ts`

## Canonical Token Model

### 1. Foundation Dials (`SURFACE.dial`)

- `opacity`: `panel`, `workbench`, `pane`, `modal`, `overlay`
- `blur`: `panel`, `soft`, `floating`
- `border`: `soft`, `strong`
- `radius`: `panel`, `modal`, `raised`, `full`
- `elevation`: `panel`, `overlay`, `floating`, `menu`

These are the only visual-material knobs.

### 2. Core Roles (`SURFACE.role`, `SURFACE.chrome`, `SURFACE.state`, `SURFACE.text`)

- `SURFACE.role`: `workbench`, `panel`, `pane`, `modal`, `inset`, `menu`, `overlay`
- `SURFACE.chrome`: `edgeTop`, `edgeBottom`, `sticky`, `divider`
- `SURFACE.state`: `interactive`, `disabled`
- `SURFACE.text`: `heading`, `headingSection`, `bodyStrong`, `body`, `label`, `muted`, `caption`, `code`

### 3. Semantic Extensions (`SURFACE.surface`, `SURFACE.chromeEx`)

- `SURFACE.surface`: `workbenchShell`, `panelInset`, `tooltip`, `statusModule`,
  `panelRaised`, `panelMuted`, `panelInfo`, `panelWorkflow`, `sidebarPanel`
- `SURFACE.chromeEx`: `dividerSoft`, `headerBorder`, `footerBorder`,
  `headerPassive`, `footerEnd`, `footerActionsPadded`

### 4. Composed Primitives (`SURFACE.modal`, `SURFACE.menu`, `SURFACE.atom`, `SURFACE.tooltip`)

Reusable primitives composed strictly from foundation/role tokens.

## Forbidden Model

Forbidden by policy:
- Transitional binding maps as authorities.
- Backward-compat alias layers.
- Introducing new feature/domain token namespaces as end-state.
- Multiple near-duplicate tokens for the same intent.

Existing non-minimal exports in `glass-surface.ts` are migration debt, not
contract authority. They may only move toward deletion or collapse into the
canonical model.

## Tree-Driven Token Categorization (Required)

Token additions/removals must be based on real rendered usage, not preference.

Workflow:
1. Run `npm run report:surface-tree`.
2. Run `npm run report:surface-tree:all`.
3. Use `frontend/reports/generated/surface-component-tree.generated.md` to identify repeated structural
   patterns.
4. Only create a new token when the tree shows a repeated, same-intent pattern
   with shared semantics.
5. If a pattern is unique, keep it local and do not create a new token.

Decision rule:
- Repetition + same semantic intent -> tokenize once.
- Repetition without same intent -> do not merge.
- Single-use pattern -> no token.

Merge safety rule:
- Only merge similar-looking tokens when parent integration is equivalent.
- If surfaces attach differently to parent chrome (inset, edge-attached,
  floating, raised, modal, menu), keep separate semantic tokens.
- Merge must preserve light/dark behavior and interaction states
  (hover/focus/active/disabled).

## Guardrails (Must Stay Green)

- `npm run enforce:surface-foundation`
- `npm run enforce:surface-churn`
- `npm run enforce:surface-unused`
- `npm run enforce:surface-final-form`
- `npm run enforce:workbench-parity`
- `npm run enforce:workbench-consumers`
- `npm run report:surface-tree`
- `npm run report:surface-tree:all`
- `npm run build`
