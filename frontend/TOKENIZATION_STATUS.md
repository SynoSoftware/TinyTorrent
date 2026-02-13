# Tokenization Status (Final-Form Policy)

Updated: 2026-02-13

## Policy

Tokenization is no longer managed as a transitional migration.

Hard rules:
- No intermediary compatibility states.
- No temporary alias layers.
- No feature-map growth as a long-term strategy.
- No visual drift for the same intent.
- No token-count optimization that degrades visual clarity.

The only accepted direction is direct convergence to the minimal canonical
token model in `TOKEN_CONTRACT.md`.

## Categorization Method (Required)

Use actual rendered usage to decide token needs:

1. Run `npm run report:surface-tree`.
2. Run `npm run report:surface-tree:all`.
3. Review `frontend/reports/generated/surface-component-tree.generated.md`.
4. Promote only repeated same-intent structures to canonical tokens.
5. Keep single-use or intent-specific patterns local.

Merge filter:
- Repeated structure alone is insufficient.
- Parent integration semantics must also match before merging tokens.

## Current Direction

- Keep `glass-surface.ts` as single authority until canonical collapse is
  complete.
- Treat non-canonical feature bindings as debt to collapse/remove.
- Reject PRs that introduce new transitional token layers.

## Validation Commands

- `npm run enforce:surface-foundation`
- `npm run enforce:surface-churn`
- `npm run enforce:surface-unused`
- `npm run enforce:surface-final-form`
- `npm run enforce:workbench-parity`
- `npm run enforce:workbench-consumers`
- `npm run report:surface-tree`
- `npm run report:surface-tree:all`
- `npm run build`
