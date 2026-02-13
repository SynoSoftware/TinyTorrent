# Token Contract (Current Authority)

Updated: 2026-02-13

## Purpose

This document is the source-of-truth summary for the UI token contract used by TinyTorrent.
It defines what is considered stable token authority, what is semantic extension, and what is still transitional binding.

Primary implementation file:
- `frontend/src/shared/ui/layout/glass-surface.ts`

Related authorities:
- `frontend/src/config/textRoles.ts`
- `frontend/src/config/logic.ts`

## Tier 1: Foundation Dials (Stable)

Authority:
- `SURFACE.dial`

Keys:
- `opacity`: `panel`, `workbench`, `pane`, `modal`, `overlay`
- `blur`: `panel`, `soft`, `floating`
- `border`: `soft`, `strong`
- `radius`: `panel`, `modal`, `raised`, `full`
- `elevation`: `panel`, `overlay`, `floating`, `menu`

These are the single-change visual knobs (transparency, blur, border strength, radius, elevation).

## Tier 2: Core Roles (Stable)

Authority:
- `SURFACE.role` (core surface roles)
- `SURFACE.chrome` (core chrome roles)
- `SURFACE.state` (interaction state roles)
- `SURFACE.text` (text roles used by surface system)

Core roles:
- `SURFACE.role`: `workbench`, `panel`, `pane`, `modal`, `inset`, `menu`, `overlay`
- `SURFACE.chrome`: `edgeTop`, `edgeBottom`, `sticky`, `divider`
- `SURFACE.state`: `interactive`, `disabled`
- `SURFACE.text`: `heading`, `headingSection`, `bodyStrong`, `body`, `label`, `muted`, `caption`, `code`

## Tier 3: Semantic Extensions (Stable, Role-Level)

Authority:
- `SURFACE.surface`
- `SURFACE.chromeEx`

Semantic surfaces:
- `workbenchShell`
- `panelInset`
- `tooltip`
- `statusModule`
- `panelRaised`
- `panelMuted`
- `panelInfo`
- `panelWorkflow`
- `sidebarPanel`

Semantic chrome:
- `dividerSoft`
- `headerBorder`
- `footerBorder`
- `headerPassive`
- `footerEnd`
- `footerActionsPadded`

## Tier 4: Composed Primitives (Stable Utility Layer)

Authority:
- `SURFACE.modal`
- `SURFACE.menu`
- `SURFACE.atom`
- `SURFACE.tooltip`

These are reusable composed primitives built strictly from tiers 1-3.

## Internal Registry (Implementation Detail)

`glass-surface.ts` still keeps internal role tiers:
- `GLASS_ROLE_CORE`
- `GLASS_ROLE_SEMANTIC`

These are intentionally internal and not part of the public token contract.

## Current Binding Exports (Transitional, Not Final Token End-State)

These exports are currently used by consumers and are allowed for migration safety,
but they are not the long-term "small semantic token set" target.

- `MODAL`
- `FORM`
- `TABLE`
- `DIAGNOSTIC`
- `WORKBENCH`
- `SPLIT`
- `CONTEXT_MENU`
- `COMMAND_PALETTE`
- `METRIC_CHART`
- `DASHBOARD`
- `DETAILS`
- `FORM_CONTROL`
- `INPUT`
- `FILE_BROWSER`
- `HEATMAP`

Navbar and status-bar bindings are now owned under:
- `WORKBENCH.nav.*`
- `WORKBENCH.status.*`

## Final-Form Direction

Target:
- App-level semantic tokenization, not component-branded styling ownership.
- Fewer authorities that express design language by intent.
- Feature-level maps collapse into shared semantic groups.

Expected steady-state:
- Stable core remains `SURFACE` (+ `TEXT_ROLE`, `INTERACTIVE_RECIPE`, `TRANSITION`, `VISUAL_STATE`).
- Transitional feature binding maps are reduced and removed as their consumers converge.

## Guardrails (Must Stay Green)

- `npm run enforce:surface-foundation`
- `npm run enforce:surface-churn`
- `npm run enforce:surface-unused`
- `npm run enforce:surface-final-form`
- `npm run enforce:workbench-parity`
- `npm run enforce:workbench-consumers`
- `npm run build`
