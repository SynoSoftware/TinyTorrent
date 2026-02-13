# Tokenization Status

Updated: 2026-02-13

## Scope

Keep `glass-surface.ts` as a single theme authority while converging on:

- foundation dials
- minimal core roles
- semantic extensions
- feature bindings composed from shared roles/tokens

Goal: improve maintainability/consistency without materially flattening the UI.

Execution rule for remaining work:

- No new intermediary compatibility states.
- No new temporary alias layers.
- Migrate in larger verified batches directly to final semantic ownership.
- Remove legacy keys in the same batch once usage reaches zero.

## Conclusions So Far

- [x] Core contract exists and is enforced in one file:
  `GLASS_SURFACE_DIAL`, `GLASS_ROLE_CORE`, `GLASS_ROLE_SEMANTIC`.
- [x] Core role set is stabilized:
  `surface` = `workbench/panel/pane/modal/inset/menu/overlay`
  `chrome` = `edgeTop/edgeBottom/sticky/divider`
  `state` = `interactive/disabled`
  `text` = `heading/headingSection/bodyStrong/body/label/muted/caption/code`
- [x] Dials reduced to perceptually distinct levels:
  `opacity` 5, `blur` 3, `border` 2, `radius` 4, `elevation` 4.
- [x] Guardrails are active:
  `enforce:surface-foundation`, `enforce:surface-churn`,
  `enforce:workbench-parity`, `enforce:workbench-consumers`.
- [x] Component-tree correlation exists:
  `report:surface-tree` and `report:surface-tree:all` ->
  `SURFACE_COMPONENT_TREE.md` (51 analyzed components in `--all` mode).
- [_] Visual behavior has been preserved by token/build checks; manual runtime
  visual sweep is still pending.

## Pending Tasks to Complete Tokenization

- [_] Tree-driven extraction plan:
  finalize a short list of shared structures to merge next
  (modal scaffold, menu host/list/item, status chip, table header shell).
- [ ] Commonization batch 1:
  unify modal scaffolding across all modals using shared modal primitives.
- [ ] Commonization batch 2:
  unify repeated menu/status-chip/table-header patterns from tree report.
- [ ] Dead-key cleanup:
  remove zero-consumer/non-rendered token keys from feature maps.
- [ ] Add unused-token enforcement:
  script check for zero-consumer keys in `glass-surface.ts`.
- [ ] Post-batch validation:
  rerun tree report and record key-count reduction and reused-role increase.
- [ ] Manual visual QA:
  sign off parity for navbar/table/status and all modal families.
- [ ] Completion gate:
  move Section 12 Step 2 to `[x]` in `CONSISTENCY_AUDIT.md`.

## Validation Commands

- `npm run enforce:surface-foundation`
- `npm run enforce:surface-churn`
- `npm run enforce:workbench-parity`
- `npm run enforce:workbench-consumers`
- `npm run report:surface-tree`
- `npm run report:surface-tree:all`
- `npm run build`
