# AGENTS.md - TinyTorrent Frontend Contract (Compressed)

**North Star:** smallest possible exe/runtime footprint + premium glass VS Code-style workbench. Dark-first, jaw-dropping visuals, desktop behavior (never "compact").

## 0. Mission Compass
- Keep TinyTorrent lean (size, memory, runtime). Any new tool/dependency must justify size/memory/runtime cost.
- Frontend controls the local daemon; backend stays fully functional without the UI or its artifacts. Remote connections are only for debug/convenience and must not change behavior or features.
- Respect boundaries: tray/native <-> daemon <-> UI. One responsibility per layer.

## 1. Repo & Build Boundaries
- Node/TS tooling lives **only** in `frontend/`. No `package.json`, `node_modules`, or frontend artifacts outside `frontend/`.
- Frontend code must not import from outside `frontend/`. No frontend build output, caches, or symlinks outside `frontend/`.
- `scripts/` are release builders. `backend/make.ps1` is the only backend entry point-do not bypass.
- Run commands yourself when possible; if not, mark them **untested/speculative**. Do not claim completion without validation or an explicit unvalidated note.
- Never use destructive git commands (`reset`, `restore`, `clean`, `checkout --`).

## 2. Stack & Architecture
- React 19 + TS + Vite; Tailwind v4 + HeroUI (do not shrink HeroUI components); Framer Motion for all interactive state changes; Lucide icons; `react-dropzone`; `react-resizable-panels` for layout; `@tanstack/react-virtual` for lists > 50; `cmdk`; custom titlebar; React Context for focus.
- Zod at every RPC boundary (Transmission types as truth); prefer delta updates.
- Single heartbeat owned by EngineAdapter: ~1500 ms table, ~500 ms detail/graphs, 5000 ms background. Push mode stops polling but keeps heartbeat for health. Use selectors to avoid unnecessary renders.
- Data flow: UI -> hooks -> service adapters -> network. Components render only; no `fetch` in components. Local state first; global only when truly needed.
- Absolute imports only (`@/...`); maintain tsconfig/vite aliases; rewrite deep relatives.

## 3. Visual System & Tokens (Zero-Literal Mandate)
- No numeric literals or Tailwind numeric/bracket utilities in components (no `p-*`, `m-*`, `gap-*`, `w-*`, `h-*`, `text-*`, `leading-*`, `rounded-*`, `shadow-*`, `blur-*`, arbitrary values, or `calc` with new coefficients). Use semantic tokens only. Allowed Tailwind: flex/grid positioning, items/justify, grow/shrink, min-h/min-w-0, relative/absolute/sticky/inset-0, overflow*, truncate/whitespace*, select-*, pointer/cursor*, responsive variants tied to semantic utilities.
- Token pipeline only: 1) intent numbers in `config/constants.json`; 2) arithmetic in `index.css @theme` using only `--u`, `--z`, `--fz`; 3) role strings in `config/logic.ts`; 4) components consume semantic classes/vars. Missing role? leave unchanged, add **FLAG** comment, and propose via the pipeline.
- Typography vs Geometry: typography (`--fz`) owns text, icons, row height; geometry (`--u * --z`) owns padding/gaps/bars/drag handles/borders/scrollbars/focus ring. Never derive one token from both. Geometry containers never grow for text; content truncates/scrolls.
- No-new-numbers & single-source rule: identical concepts share one token. Z-index only via tokens (`--z-floor/panel/sticky/overlay/modal/toast/cursor`).
- Scale test must pass (`--u` 4->8, `--z` 1->1.25, `--fz` up) or revert/flag. DRY long recipes (glass, focus, table rows, toolbar clusters, badges) into shared constants.
- Spacing roles: `p-panel` (panel/modal interior), `p-tight` (menus/chips/list items), `gap-stage` (between panes), `gap-tools` (between controls), structure sizes `h-nav`, `h-status`, `h-row`, `w-sidebar`.

## 4. Surfaces & Color
- `surfaceStyle` only on surface owners. Structural children (incl. headers) are typography-only; they assume a provided surface. `outerStyle` only on shell chrome.
- Glass layers: L0 shell `bg-background` + subtle noise; L1 panels `backdrop-blur-md bg-background/60 border-default/10`; L2 modals/popovers `backdrop-blur-xl bg-content1/80 shadow-medium border-default/20`. Every glass layer needs a border.
- Use HeroUI semantic tokens (`var(--heroui-...)`) only; no hex/named colors/rgba math. Shell fallbacks/noise live in config. Status mapping: success=seeding/completed, warning=paused/checking, danger=delete/errors, primary=CTAs/progress, default=borders/inactive.

## 5. Workbench Layout & Interaction
- App shell fills the window (`h-screen w-screen overflow-hidden`). No window scrollbars; only panes/lists scroll with overlay-style scrollbars (thin, rounded, overlay).
- Layout uses `react-resizable-panels`: Parts never unmount; collapse = size 0; restore previous size; handles invisible until hover showing a 1 px `border-default` line; DOM stays mounted to preserve scroll/focus/selection. Pin/unpin by size.
- Inspector: default collapsed; double-click row or shortcut (e.g., Cmd/Ctrl+I) expands and focuses; state persists.
- Selection model: click single, ctrl/cmd add, shift range, right-click context menu over current selection. Optimistic UI for actions; Escape clears selection only. Focus model: one active Part shows subtle HeroUI focus border.
- Context menus everywhere; keyboard-first; minimal chrome; auto-paste magnet links; full-window drop overlay with motion; no click hunting.
- Motion required: list rows use `layout`; buttons micro scale/color on hover/press; icons animate per state; rows animate reorder/selection; progress smooth; modals/overlays fade+blur; workbench pan/zoom eased.
- Modals only for blocking actions (Add Torrent, Settings, Confirm Delete). Never for passive data (use Inspector). Layer 2 visuals with autofocus + Framer Motion transitions.
- Buttons: primary variant `shadow`; secondary `light`/`ghost`; toolbars icon-only; keep confident sizing (never compact HeroUI).
- Workspace visuals (graphs/maps): smooth zoom/pan/reset with motion-driven transforms.

## 6. RPC & Connection
- Transmission RPC is law. Engine adapter contract is transport-agnostic. Baseline HTTP polling; upgrade to push/WebSocket + Native Bridge when backend identifies TinyTorrent; polling stops in push mode.
- Connection UI: before detection show server+port only; after detection render correct credentials (user/pass for Transmission, token for TinyTorrent). Auto-connect with saved creds or anonymous; allow edit/reconnect.
- Validate all inbound data with Zod; prefer deltas/ids to limit load.

## 7. Project Structure & Naming
- Structure (front): `src/app`, `src/config/{constants.json,logic.ts}`, `src/modules/*` (flat; underscores for sibling grouping; local hooks in `hooks.ts`), `src/services/rpc/{engine-adapter.ts,schemas.ts,types.ts}`, `src/shared/{ui,components,hooks,utils}`, `src/i18n/en.json`.
- Naming: components PascalCase (underscores allowed), hooks/logic camelCase, services kebab-case. No empty folders; keep related code close.
- Configuration: numbers in `constants.json`; computed logic/types in `logic.ts`; no other files in `config/`.
- Service isolation: UI never calls `fetch`; adapters own network + Zod.

## 8. Quality, Performance, i18n
- Strict TS; virtualization mandatory for lists > 50; no console noise; no unused imports; minimal bundle; `npm run build` must pass.
- Rendering: efficient selectors, avoid unnecessary re-renders or layout thrash.
- i18n: no inline English. All text via `t("key")` backed by `en.json`; add keys when needed.

## 9. Agent Procedure & Output
- Pre-submit checklist: token-only geometry; no forbidden Tailwind/brackets; concepts use single tokens; glass recipes DRY; scale test passes; typography vs geometry not mixed.
- Include a Token Mapping note in PR/response (semantic roles used, new tokens, missing roles flagged). Report **Rename Candidates** as `current -> recommended` with a one-line reason; do not rename unless instructed.
- Code changes alone are insufficient: validate via the user-visible interface or state the change is unvalidated.

## 10. North Star
- Ask: **\"Does this make the app more powerful, confident, and jaw-dropping?\"** If the answer is \"saves space\" or \"looks compact,\" reject. Default to dark-first premium glass workbench with large, confident controls and desktop-grade behavior.
