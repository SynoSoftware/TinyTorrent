
# **AGENTS.md — TinyTorrent Frontend Mission Specification**

Frontend rules for TinyTorrent. §21 is the only canonical architectural law; every other section is an implementation contract, default, or review gate that must comply with it.

**Current defaults:** React 19, TypeScript, Vite, Tailwind v4, HeroUI, Framer Motion, react-dropzone, Lucide, Zod, `@tanstack/react-virtual`, `cmdk`, `react-resizable-panels`, React Context, and frameless window controls.

**Rule tiers:**
- **Tier 1:** foundational invariants in §21 only
- **Tier 2:** enforced contracts and gates derived from §21
- **Tier 3:** replaceable implementation defaults and UX guidance

**Constitutional framing (hard):**
- Only §21 defines architectural invariants.
- Tier 2 operationalizes §21 for implementation and review.
- Tier 3 is replaceable policy and defaults.
- Non-§21 sections must not introduce parallel law surfaces.

---

# **0. Quick Rules**

- **Law source:** architecture is governed by §21.
- **Authority-first:** use declared authorities; do not bypass them. See §0.1 and §3.
- **Owner-extension-first:** extend existing owners before adding new surfaces. See §0.2 and §21.13.
- **Outcome-first contracts:** expected failures are typed outcomes, not exception control flow. See §20 and §21.12.
- **UI vs control plane:** UI may hide or disable capabilities, but boundary owners enforce outcomes.
- **Diff-first for user-visible changes:** if behavior or UI output changes for landing/review, describe it explicitly and include the right diff artifact. See `frontend/TOKEN_CONTRACT.md`.
- **List the commands you actually ran** in landing/review notes. If something was not run, say so and why.

## **0.1 Authority Registry (Hard)**

New authorities are forbidden unless registered here first.

- **Surface token contract:** `frontend/TOKEN_CONTRACT.md`, `frontend/src/shared/ui/layout/glass-surface.ts`
- **Token pipeline + global knobs:** `frontend/src/config/constants.json`, `frontend/src/index.css`
- **Semantic UI logic/utilities:** `frontend/src/config/logic.ts`
- **Text roles / typography roles:** `frontend/src/config/textRoles.ts`
- **RPC schema validation:** `frontend/src/services/rpc/schemas.ts`
- **RPC transport outcomes:** `frontend/src/services/transport.ts`
- **Feature ViewModel authority:** one primary ViewModel per feature, owned inside that feature
- **Cross-feature/global ViewModel authority:** `frontend/src/app/`
- **Cross-feature orchestration:** `frontend/src/app/orchestrators/`
- **Shared UI primitives:** `frontend/src/shared/ui/`

## **0.2 Owner Extension Statement (Landing/Review Gate)**

If a landing/review change adds a new module, hook, service, model, or constant set, the change note must state:

- **Owner:** what existing owner was extended, or why that was invalid
- **Lifecycle:** per render, per hook instance, per session, or per application
- **Why new surface:** why extension would violate ownership, lifecycle, or authority rules
- **Consumers:** at least one immediate consumer in the same change

New surfaces are a last resort, not a neutral choice. "Cleaner" or "more modular" is not sufficient justification without measurable reduction in duplication, ambiguity, or boundary leakage.

## **0.3 Landing Gates (DoD)**

A change is not ready to land if it introduces any of the following:

- bypassed named authorities
- feature-local styling authorities, inline visual styles, raw numbers, or bracket classes that violate §3
- new local visual styling in feature files, or new shared tokens added without attempting reuse or consolidation first
- new token namespaces, compatibility aliases, or feature-owned token maps that violate `frontend/TOKEN_CONTRACT.md`
- duplicated decision logic across Component, Hook, ViewModel, or Orchestrator layers
- a new surface without an Owner Extension Statement
- expected failures represented as exceptions instead of typed outcomes

For UI or styling changes intended to land/review, run and report:

- `npm run enforce:surface-foundation`
- `npm run enforce:surface-churn`
- `npm run enforce:surface-unused`
- `npm run enforce:surface-final-form`
- `npm run enforce:workbench-parity`
- `npm run enforce:workbench-consumers`
- `npm run report:surface-tree`
- `npm run report:surface-tree:all`
- `npm run build`

Landing/review gates enforce architecture and consistency; they do not create new architectural invariants.

## **0.4 Solo Dev Workflow (Low Ceremony)**

- **WIP:** move fast, keep the build green, obey hard rules, skip landing artifacts.
- **Landing/review:** provide a short change note, required artifacts, and the commands you actually ran.

## **0.5 Pre-Edit Workflow (Default)**

Before editing:

- identify the source of truth
- list entry points: UI events, commands, effects, subscriptions, RPC calls
- list outputs: UI, state updates, persistence, RPC side effects, feedback
- compare 2-3 approaches and choose the smallest one that preserves ownership and contracts

Before adding a new hook, component, helper, service, model, or constant:

- search for an existing owner first
- extend it when lifecycle and authority already match
- do not add a layer whose main job is forwarding, renaming, or reshaping existing data
- answer these five questions before adding a new surface:
  1. who owns this decision?
  2. who owns this state?
  3. what is the lifecycle?
  4. what is the single public contract surface?
  5. why cannot the existing owner absorb this?

This is workflow guidance. §21 still governs authority, ownership, lifecycle, and indirection.

## **0.6 Spec Kaizen Note (Triggered, Non-Blocking)**

At the end of a landed/reviewed iteration, include a short **Spec Kaizen Note** only when the work exposed a real **spec-level weakness** in `AGENTS.md`.

A Spec Kaizen Note is about **spec friction**, not general code quality.

Valid triggers include:

- an ambiguity caused ownership, placement, or lifecycle confusion
- a repeated failure mode was not covered by an existing rule
- two sections overlapped, contradicted each other, or created false-law pressure
- a review gate was too weak to catch real architectural drift
- a rule caused repeated unnecessary ceremony without protecting maintainability
- a non-§21 section started behaving like parallel law

Invalid triggers include:

- a one-off implementation mistake
- code that could be cleaner without any spec ambiguity
- local refactor opportunities
- stylistic preferences
- speculative rule ideas without evidence

Output requirement:

- If no real spec-level weakness was exposed, output: **Spec Kaizen Note: none**
- If triggered, keep it short and include:
  - **Observed gap:** what in `AGENTS.md` failed or was unclear
  - **Impact:** why it matters for maintainability, clarity, or enforcement
  - **Suggested change:** the smallest amendment that would improve the spec
  - **Evidence level:** one-off, repeated, or systemic

Promotion threshold:

- **1 occurrence:** note it, but do not amend the spec unless the ambiguity is severe
- **2-3 occurrences:** propose tightening or clarifying existing wording
- **repeated/systemic pattern:** amend the spec

Rules:

- do not propose spec changes for one-off implementation mistakes
- do not create new architectural law outside §21
- prefer amending or tightening existing sections over adding new sections
- fix local code problems in code; use the Kaizen Note only for spec problems

# **1. Product Intent**

TinyTorrent is a fast, low-bloat desktop workbench for torrent control with deterministic behavior, native-grade interactions, and maintainable architecture.

- Density comes from information design, not tiny targets.
- Desktop feel means deterministic behavior, shortcuts, focus, and right-click authority, not shrunken controls.
- HeroUI components should stay default or comfortable in size; do not neuter them to fake compactness.
- If a choice shows more rows but feels cramped or fragile, it is a design error.

---

# **2. Scaling & Surface Ownership**

## **2a. UI Scale System**

- Interactive sizes come from central config and must respect typography-vs-geometry ownership.
- Do not use raw pixel sizing classes such as `w-5`, `h-6`, or `text-[14px]`.
- Consume scale tokens or semantic utilities derived from config.

## **2b. Typography vs Geometry Ownership**

TinyTorrent uses two non-overlapping roots:

- **Typography-owned (`--fz`):** body text, table text, numeric text, icons, labels, and row height
- **Geometry-owned (`--u * --z`):** panel padding, gaps, bars, modal chrome, glass surfaces, borders, focus rings, scrollbars, and drag handles

Rules:

- A single dimension token must derive from one root only.
- Components may combine typography-owned and geometry-owned tokens, but one token cannot be computed from both.
- If a needed element genuinely requires both in one token, treat it as a missing semantic role and add the role instead of improvising.
- Geometry-owned containers do not grow to fit overflowing text; text truncates or scrolls.

## **2c. Surface Ownership (Surface Contract)**

- **Surface owners** establish glass context, radius, and blur compatibility.
- **Structural children** live inside a surface owner and assume that context already exists.
- `surfaceStyle` belongs to surface owners only.
- `outerStyle` belongs to shell chrome containers only.
- Structural children, including headers, must not apply surface background, border, radius, blur, or other surface tokens.

---

# **3. Design System Contract**

UI decisions must stay centralized and low-churn. This section defines styling authority; §5 is the review checklist and §21 remains the law.

## **3.1 Styling Authority Chain**

Design decisions flow through this chain:

1. root knobs
2. token pipeline
3. semantic authorities
4. structural primitives
5. local mechanical layout utilities
6. enforcement

If a styling rule is outside this chain, it is guidance, not authority.

## **3.2 Root Knobs and Token Pipeline**

- Root knobs are `--u`, `--z`, and `--fz`.
- Prefer existing knobs and tokens over adding new global dials.
- New global knobs, if truly necessary, must enter through the token pipeline.
- Design decisions flow through `config/constants.json` -> `index.css` -> `config/logic.ts` -> component usage.

## **3.3 Standard Elements Over Inline Recipes**

- Prefer shared primitives, semantic components, and tokenized utilities over long inline Tailwind strings.
- Centralize only when it removes churn or duplication.
- Do not do classname sweeps for “consistency” unless you are fixing behavior, adopting an existing standard in touched code, or creating the missing standard element.
- Current cleanup plans are working documents, not law: `SURFACE_CLEANUP_PLAN.md`, `TEXT_ROLE_MIGRATION.md`, `CONSISTENCY_AUDIT.md`.

## **3.4 Shared Surface Authority & Token Reduction (Hard)**

`frontend/src/shared/ui/layout/glass-surface.ts` is the single authority for reusable UI presentation and structural layout contracts.

Feature files must consume exported surfaces, layout primitives, builders, and class contracts from `glass-surface.ts`. Feature files must not define local visual systems through ad hoc `className` strings, local token sets, feature-prefixed style maps, or repeated utility recipes.

If a visual or structural pattern is reused, visually meaningful, or part of tab, panel, or layout composition, it belongs in `glass-surface.ts`, not in the feature file.

When editing existing UI, prefer reduction over addition:

- reuse an existing shared token or contract if it is close enough
- collapse near-duplicate shared tokens when semantics match
- add a new shared token only when an existing one cannot express the intent cleanly
- do not create a new token for one-off local preference

The direction of change must be toward fewer shared tokens, fewer parallel contracts, and less local styling authority.

Review gate:

- reject changes that introduce new local visual styling in feature files
- reject changes that add a new shared token when an existing one can absorb the need
- prefer merging and deleting near-duplicate tokens over preserving them

## **3.5 Tailwind Exception Rule (Hard)**

Inline Tailwind in feature files is allowed only for tiny one-element mechanical nudges with no visual semantics and no structural role.

It must not be used for panels, tab roots, layout structure, spacing systems, surfaces, reusable patterns, or any visually meaningful styling.

## **3.6 Structural Layout Primitives**

`glass-surface.ts` owns recurring structural layout and presentation contracts.

Shared primitives and contracts there must own recurring panel layouts, section headers, framed content areas, split layouts, grouped controls, canvas containers, legends, stats rows, and similar reusable structures.

Feature code may compose those shared contracts, but must not invent parallel structural styling locally.

---

# **4. Theming & Semantic Tokens**

Use HeroUI semantic tokens, not raw colors.

- **Layer 0:** app shell background with centrally configured noise and fallbacks
- **Layer 1:** panels and tables
- **Layer 2:** modals, popovers, and floating surfaces
- Keep subtle semantic borders on glass layers so edges stay readable in every theme.
- Status semantics are repo-wide: `success` = completed/seeding, `warning` = paused/checking, `danger` = errors/deletes, `primary` = CTA/progress, `default` = borders/inactive text.
- No hex, named Tailwind colors, inline `rgba()`, or hand-picked light/dark border colors.
- Shell-level visual constants live in `config/constants.json`.
- Default visual direction: automatic theme/language detection with Dark/English fallbacks, glass for floating surfaces, comfortable controls, strong typography, and restrained depth.

Reference mappings (authority-owned; consume through shared authorities/primitives, do not inline in feature files):
- **Layer 0 shell:** `bg-background` with subtle configured noise
- **Layer 1 panels/tables:** `backdrop-blur-md bg-background/60 border-default/10`
- **Layer 2 floating surfaces:** `backdrop-blur-xl bg-content1/80 shadow-medium border-default/20`

---

# **5. UI Consistency Enforcement Checklist**

This section enforces §3 and §21; it does not create new UI authority.

- UI must remain stable under knob changes: `--u`, `--z`, and `--fz`.
- Matching surfaces use matching semantic padding, gap, and row-height roles.
- Similar controls must not drift due to local tweaks.
- Before landing UI work, verify the token pipeline, semantic authority usage, structural primitives, theme consistency, stable scroll behavior, and absence of duplicated semantic recipe strings.
- Landing/review notes for UI work must include a short token-mapping note: roles used, whether a new token was added, and any missing token that was flagged instead of hacked.

---

# **6. Runtime & Control Plane**

TinyTorrent is a local UI controlling a local daemon. Remote connections are secondary and must not change capability or UX.

- Local vs remote runtime must not change product behavior.
- Web technology is an implementation detail for footprint/runtime goals, not the product model.
- Browser limits are not product limits. If a native Windows UI could reasonably do it, TinyTorrent must be able to do it.
- System topology is local-first: tray/native shell, daemon, hosted UI. The daemon owns torrent state; the UI owns rendering and typed intents.
- State defaults to React hooks/context; add Zustand only when it clearly pays off.

## **6a. Native Bridge**

- Desktop mode bypasses browser limits through the native bridge.
- Focus ownership belongs to the native shell.
- System services go through `window.chrome.webview.postMessage`; fall back to daemon/RPC paths when native services are unavailable.
- Closing the window hides it. Termination belongs to tray/exit flow.

## **6b. UIActions**

- UIActions change UI identity participation, not engine truth.
- They run synchronously in the same tick and do not await engine, RPC, or filesystem work.
- Engine data stays canonical; UIActions do not build shadow lists or mirrored engine state.
- They may clear selection/detail state immediately, remove identity from UI participation, and fire engine intents fire-and-forget.
- Rollback is explicit, user-visible, and only on engine failure.
- All UIActions go through the orchestrator control plane.

## **6c. State & Heartbeat Strategy**

- One central heartbeat loop only. Components must not create fetch intervals.
- Adaptive polling is the current default; future push mode may replace it without changing UI contracts.
- Current config-owned polling defaults are defined in `constants.json` / `logic.ts`; leaf UI must not hardcode polling intervals.
- Current defaults currently resolve to table `1500ms`, details `500ms`, background `5000ms`.
- Subscriptions stay selective: the table listens to list deltas, the inspector listens to the active torrent.
- Torrent mutations go through `dispatch()` in `frontend/src/app/actions/torrentDispatch.ts`.
- UI helpers, modals, hooks, and ViewModels must not call mutation methods on `EngineAdapter` directly.
- Forbidden direct UI calls include `verify`, `resume`, `pause`, `remove`, `setTorrentLocation`, queue moves, tracker mutations, and file-selection mutations.

---

# **7. Interaction & Workbench**

Structural state changes should be motion-authored with Framer Motion. Use shared `TRANSITION.*` tokens for simple hover, focus, and active fades rather than decorating every tiny state change.

## **7a. Tool Interaction Model**

- Selection is OS-style: click single, Ctrl/Cmd add, Shift range, right-click acts on the selection.
- `body` and `#root` stay fullscreen with no window scrollbar; only panes and lists scroll internally.
- Default root utility for fullscreen shell mode is `h-screen w-screen overflow-hidden` on `body` and `#root`; equivalent authority-owned implementation is allowed.
- Internal scroll areas must not cause layout shift.
- Default to tool behavior over document behavior: `user-select: none` except for explicit copy-required text.
- I-beam cursor is only for editable text fields.
- Optimistic UI feedback is immediate and rolls back only on explicit engine failure.

## **7b. Interaction Contracts**

- Keyboard-first operation is required for core navigation and commands.
- Context menus are required on action-bearing surfaces and must expose the same command authority as toolbar and shortcut paths.
- Interactive actions must give immediate feedback and must not produce silent dead states.
- Workspace interactions such as selection, resize, drag, and focus transitions must stay deterministic and reversible.
- Drag-and-drop must provide full-window detection, a standardized overlay surface, and immediate cancel on drag-out.
- Motion should communicate structure and state changes, not decoration.

## **7c. Focus Model**

- Only one Part, Main or Inspector, holds active focus at a time.
- Arrow keys, PageUp/PageDown, Home/End operate on the active Part only.
- Switching Parts updates the global `FocusContext`.
- The active Part shows a subtle HeroUI-token focus border.
- `Escape` clears selection within the active Part and does not change the active Part.

## **7d. Components, Modals, and Workbench**

- Core control defaults: HeroUI controls, sticky blurred headers, monospace numerics, sans labels, minimal progress bars, optional sparklines, no row flicker, row-level motion for selection, hover, and reorder.
- Primary action buttons use the designated primary variant.
- Toolbar commands are icon-first unless text is required for clarity.
- Icons use semantic status colors.
- Dashboard grid is the heavy virtualized grid with reorder, marquee selection, and optional sparklines.
- Detail grids are lighter virtualized tables for files and peers with sorting only.
- Do not build god components.
- Modals autofocus the primary field, use Layer 2 visuals and Framer Motion, feel like floating HUD panels, and are reserved for blocking actions such as add torrent, settings, and destructive confirmation.
- Passive data belongs in the inspector, not a modal.
- TinyTorrent uses a master-detail workbench, not details modals: main pane = torrent grid, inspector pane = active torrent details.
- Selection updates the inspector immediately.
- Inspector defaults to collapsed (`size = 0`) and opens through double-click or shortcut.
- Inspector size, orientation, and open state persist locally.
- Use `react-resizable-panels` for splits, thin semantic drag handles, and no heavy gutters.
- Prefer `overlay-scrollbar` for pane/list scroll regions when suitable.
- Split handles should use a semantic hit-target class/token such as `h-handle-hit` (or current equivalent authority token).
- Main and inspector panes stay mounted when collapsed to preserve focus, selection, scroll state, and continuity.
- Context menus must be custom and flip/reposition rather than overflow the window.
- Workbench model: `Part -> Container -> Pane -> View`. Parts never unmount, containers always exist, views may swap, and pane-level resizing/collapse handles continuity.

---

# **8. RPC & Data Contracts**

TinyTorrent is moving from stock `transmission-daemon` toward a custom `libtorrent` daemon that preserves the Transmission RPC contract and adds extensions.

- Baseline transport is adaptive HTTP polling against `/transmission/rpc`, fully compatible with stock Transmission.
- If the backend identifies as TinyTorrent, upgrade to push or WebSocket transport and native bridge features when available.
- Transmission RPC remains the law for base operations.
- Zod validates incoming data before it reaches UI code.
- The UI stays backend-agnostic behind `EngineAdapter`; transport can change without changing the UI contract.
- Use `transmission-rpc-typescript` types, or equivalent, as the source of truth.
- Even over HTTP polling, use `ids` to request only changed torrents and prefer delta updates.

## **8a. Connection & Authentication UI**

- Before a connection attempt completes, show only server address and port.
- After the attempt completes, detect whether the server is standard Transmission or TinyTorrent.
- Then render the correct credential UI:
  - Transmission server -> username + password
  - TinyTorrent server -> authorization token
- Always attempt auto-connect with saved credentials; if none are saved, try anonymous connection.
- The user can always edit credentials and reconnect.

---

# **10. Internationalization (Stack Level)**

- Use i18next.
- Only `en.json` is required for MVP.
- All user-visible text must come from translation keys.

---

# **11. Quality & Performance Standards**

- Large lists must be virtualized.
- No console noise.
- No unused imports.
- Strict TypeScript everywhere.
- Minimal bundle size.
- Clean build: `npm run build` must pass before landing/release.
- Visually consistent, dark-mode-first UI with correct light mode.
- Efficient row-level updates (selectors + fine-grained subscriptions).
- Minimized unnecessary React re-renders.
- No layout thrash (no repeated sync `measure → mutate` chains).

---

# **12. MVP Deliverables**

Core product targets: glass app shell, virtual dashboard grid, virtual detail tables, hybrid RPC layer, add-torrent modal, context menus, command palette, and tray integration stubs.

---

# **13. UX Excellence Directive**

Build tool-grade UI: deterministic, traceable, and maintainable.

---

# **14. Architectural Principles (Operational Summary)**

Plain-language summary of §21:

- keep control and shell boundaries explicit
- split only when it removes duplication or clarifies ownership/lifecycle
- keep views pure
- keep layer flow one-way
- keep data contracts explicit
- keep state ownership intentional
- keep tool choices pragmatic

## **View–ViewModel–Model**

- Views render UI, hold only local visual state, and emit typed intents.
- Model, domain, and services own business logic and IO.
- ViewModels expose one primary feature surface, translate outcomes into UI state, and expose commands consumed by views.
- Avoid wrapper-viewmodel fragmentation unless it removes duplication or establishes a real boundary.
- Cross-feature UI authority belongs under `src/app/`.
- Read context-owned values from Context at point of use instead of pass-through threading.
- Use feature ViewModel commands for feature scope and app/context command surfaces for cross-feature scope.


# **15. Project Structure (Optimized for Single Developer)**

Flat, co-located structure optimized for speed:

- `src/app/`: app shell, providers, routes, global UI authority
- `src/config/`: `constants.json` and `logic.ts`
- `src/modules/`: feature areas with flat local structure
- `src/services/`: external integrations, especially RPC
- `src/shared/`: reusable UI, hooks, and utilities
- `src/i18n/en.json`: source-of-truth locale file

Reference tree:
```txt
src/
|-- app/
|-- config/
|-- modules/
|-- services/
|-- shared/
\-- i18n/en.json
```

---

## **Rules**

### **1. Features (`modules/`)**

- Flat > nested. No `parts/`, `tabs/`, `components/` folders inside a module.
- Use underscores to group related siblings: `Dashboard_Grid.tsx`.
- Local hooks belong in `hooks.ts` inside the module.

### **2. Configuration (`config/`)**

- Two-file rule:
  1. `constants.json` for literals
  2. `logic.ts` for types and computed logic
- No other files in root `config/`.

### **3. Services (`services/`)**

- Every service must define Zod schemas for its external data.
- All RPC/network goes through adapters in `services/rpc`.

### **4. Simplicity**

- No folders without real code.
- Avoid deep nesting.
- Keep related logic physically close.

### **5. No Empty Folders**

- Avoid empty folders. Do not spend time on folder cleanup during WIP; keep the tree tidy when landing changes.

# **16. Coding Standards**

## **16.1 Naming, Config, and Imports**

- Components use PascalCase; grouped siblings may use underscores such as `Dashboard_Grid.tsx`.
- Hooks and logic files use camelCase.
- Services use kebab-case.
- Never hardcode numbers or colors in code; use `@/config/constants.json` and `@/config/logic.ts`.
- UI must never call `fetch` directly. Flow stays `UI -> hooks/viewmodels -> services/adapters -> schemas -> network/native boundary`.
- Internal imports use the `@/` alias: `@/app`, `@/modules`, `@/shared`, `@/services`, `@/config`, `@/i18n`.
- Rewrite deep relative imports to aliases when touched. Do not change alias config in `tsconfig.json` or `vite.config.ts` unless approved.
Alias map:
```txt
@/app      -> src/app
@/modules  -> src/modules
@/shared   -> src/shared
@/services -> src/services
@/config   -> src/config
@/i18n     -> src/i18n
```

## **16.2 Incremental Improvement**

This applies to touched files only, not repo-wide cleanup.

- If a touched file mixes responsibilities, mixes UI with fetching/orchestration/shaping, or behaves like a god component, reduce the problem at least a little.
- Valid responses: extract one responsibility, move logic closer to its correct layer, or introduce a clearer boundary.
- Large redesigns and unrelated-file cleanup are not required.
- Leaving a touched file in the same or worse architectural state is a violation.

## **16.3 Typed Control Plane**

Control vocabularies such as intents, actions, commands, events, and orchestration switches must:

- be statically typed, finite, and exhaustively checked
- use typed identifiers instead of raw string literals
- be owned by one canonical authority per domain
- be imported as tokens or factories, not respelled across labels, keymaps, handlers, or metadata
- avoid runtime enums, ALL_CAPS pseudo-enums, and transitional dual-path logic
- use PascalCase authorities and namespace objects for closed vocabularies
- stay out of UI components except for consumption
- use `never` guards for exhaustive branches
- avoid `typeof SOME_CONST.X` typing in consumer code when a domain alias/union expresses intent more directly

Closed-vocabulary rules:

- each closed vocabulary must have exactly one canonical authority module; downstream consumers may project from it but must not restate members
- keep each closed vocabulary locally enumerable from one authority surface
- do not maintain parallel literal unions, manual re-enumerations, or string-concatenated expansion
- derive projections and membership checks from the authority surface, for example via `Object.values(...)` or an equivalent helper
- explicitly document domains that are open or protocol-driven rather than closed
- hoist repeated literals or member paths instead of creating second maintenance points

Boundary rules:

- resolve config once at the boundary owner
- leaf code must not parse config or apply local defaults
- runtime policy modules must not define control-plane identifiers
- normalize and validate external shapes once at the boundary owner
- export complete internal shapes in camelCase
- keep boundary outputs grouped by domain where reasonable and immutable after resolution
- consumers must not reinterpret or patch boundary data downstream
- prefer shared resolution helpers over ad-hoc readers when such helpers already exist
- keep cross-domain dependencies explicit and one-way
- use explicit time suffixes such as `Ms` and `Sec` in app-facing exports
- do not mix config resolution, vocabulary ownership, and presentation recipes unless the module is a declared multi-domain authority

If typing is unclear, the architecture is incomplete and must be fixed. Refactors must stay buildable unless a staged migration is explicitly declared.

## **16.4 Strict Typing**

In all new or modified code:

- `any` is forbidden
- `unknown` is allowed only at IO, adapter, transport, or native boundaries and must be narrowed immediately
- untyped string identifiers are forbidden
- code must stay fully statically typed and exhaustively checked

If a change requires weakening the type system, redesign it.

## **16.5 Identifier Quality & Rename Reporting**

When editing UI code, evaluate identifier quality. If a name is misleading, generic, historically wrong, or drifting from its role, report it rather than silently renaming it.

Landing/review notes must include **Rename Candidates** when relevant:

- `currentName` -> `recommendedName`
- one-line reason

Do not rename unless explicitly instructed.

## **16.6 Human-First Code**

Write code so a human can read and edit it quickly.

- Prefer the simplest implementation that preserves contracts.
- Prefer short, explicit names; if a name keeps growing, split responsibility instead.
- Prefer small local functions and straight-line control flow with early returns when that is clearer.
- Prefer predictable data shapes such as discriminated unions over ad-hoc flag mixes.
- Avoid unnecessary TypeScript cleverness, gratuitous `useMemo`/`useCallback`, and speculative abstractions.
- Do not add wrapper hooks, components, or ViewModels whose main job is forwarding, renaming, or re-packing existing state or actions.
- Keep one owner for mutable UI state. Local state is for transient UI mechanics, not mirrored domain/ViewModel state.
- Prefer explicit duplication over wrong sharing when owners, lifecycles, or semantics differ.
- Design for deletion: each file and abstraction must have a clear reason to exist and an obvious deletion test.
- If argument or prop surfaces show boundary leakage, redesign the boundary.
- Comments are allowed only for short, non-obvious rationale tied to an invariant or contract.

### **16.6a React Data Flow & Render Cost**

- Use **props by default** when data is owned by the parent and consumed by an immediate child or a small adjacent subtree.
- Do **not** thread props across multiple layers just to reach distant consumers; extend the real owner, redesign the boundary, or promote the value to Context only when the owner and lifecycle are truly shared.
- Use **Context** for cross-cutting, non-adjacent, authority-owned values with multiple consumers. Do not use Context as a dumping ground for leaf-local state or convenience wiring.
- High-churn Context values must be split or otherwise constrained so unrelated consumers do not re-render on every update.
- Use **`useMemo` / `useCallback` only when they pay for themselves**: preserving referential stability for memoized children, preventing expensive recalculation, or satisfying a library contract that depends on stable identity.
- Do not memoize trivial expressions, wrapper objects, or pass-through callbacks by default. If a memo exists, it should defend either correctness or measurable render cost.

## **16.7 God Objects, Patterns, and Placement**

Do not create or enlarge god files. If a touched file is already overloaded, reduce its responsibility surface at least a little.

Approved extraction targets:

- **Orchestrator hook:** sequencing, retries, deduplication, gating, multi-step workflows
- **Domain hook:** one domain concern with minimal coordination
- **Service:** business or domain logic independent of React
- **Adapter:** RPC, filesystem, native host, browser APIs, or other edge IO
- **UI component:** presentation, local UI state, visual conditionals, typed intents

Placement rules:

- sequencing, retries, gating, and cross-cutting decisions -> orchestrator
- business rules -> service
- IO, RPC, and native calls -> adapter
- view state -> UI component

UI components do not orchestrate, call engines directly, build control flow vocabularies, or run multi-step workflows.

If logic does not fit a category, the architecture is incomplete. During WIP, park it in the nearest owner with `TODO(arch)`; before landing/review, resolve placement or amend this document.

## **16.8 Anti-Patterns & Rethink Conditions**

Forbidden:

- smart components
- hooks that return flags instead of commands
- boolean-driven control flow
- files that both decide and execute
- helper files that grow indefinitely
- callbacks that close over engine state

Pause and rethink if a change reveals:

- duplicated source of truth
- pass-through props growing across component boundaries
- wrapper layers with no ownership or contract value
- a hook that mostly forwards another owner
- a new file that exists only to rename or reshape data
- a component that both decides and executes workflow logic
- growing parameter plumbing
- the same operation now has two callable contract surfaces
- feature code introducing local policy/config defaults
- raw payload or raw config data reaching feature code
- feature state mirrored locally instead of read from its owner
- a small helper turning into a dumping ground
- a new abstraction that reduces no duplication, ambiguity, or contract count

Prefer a better minimal solution over layering on another workaround.

---

# **17. Internationalization (Enforcement)**

- CI must fail if user-visible strings exist in UI code without `TODO(i18n)` or `t("…")`.
- All visible UI text must go through `t("…")`.
- Work with `en.json` only, even if other translation files exist.
- When adding UI text:
  1. add the key to `en.json`
  2. use `t("key")` in the component
- Inline English is allowed during iteration only as `TODO(i18n)` placeholders.
- Before landing/review, replace all placeholders with real `en.json` keys.

---

# **19. Other Rules**

- Before reporting completion, review the code and fix important issues until satisfied.
- Before landing/review, run `npm run build` and fix build errors when possible.
- Never run `git restore`, `git reset`, `git clean`, or `checkout --` without explicit confirmation. Preserve local changes.

# **20. Enforced Operational Contracts (Tier 2)**

This section restates daily implementation contracts derived from §21. If anything conflicts with §21, §21 governs.

- **Outcome-first public actions:** public command surfaces return typed outcomes; expected failures are data, not exception control flow.
- **Capability resolution in control plane:** detect capabilities once in control-plane owners and publish explicit state.
- **Completed contract surfaces:** public contracts define success, failure, unsupported, and cancel/no-op outcomes.
- **Shared UI state arbitration:** multi-surface UI state needs explicit ownership, conflict handling, and rejection semantics.


# **21. Architecture Invariants (Foundational — Hard Rules)**

These rules are the non-negotiable structural laws of the system. All other sections must comply with them.

### **21.1 Enforcement Clause (Hard)**

Any landed/reviewed change that violates a Hard Rule must be rejected. If a rule blocks implementation, amend the rule first; do not work around it.

### **21.2 Authority Rule (Hard)**

Every decision in the system must have exactly one authority.

- If a value influences behavior, a single named owner produces it.
- Logic must not infer behavior from identity, naming, environment, heuristics, or caller position.
- If authority is unclear, stop and define it before writing code.

### **21.3 Ownership Rule (Hard)**

All mutable state must declare an owner responsible for creating, updating, resetting, and destroying it.

- State without a declared owner is forbidden.
- Module-level mutable state is forbidden unless the owner is explicit.

### **21.4 Lifecycle Rule (Hard)**

Every stateful construct must define its lifecycle boundary. Acceptable lifetimes:

- per render
- per hook instance
- per session
- per application

State must reset when its lifecycle ends. If the lifecycle cannot be stated in one sentence, the design is invalid.

### **21.5 Explicit Contract Rule (Hard)**

Behavior must be gated by explicit contracts, not inferred properties.

- If code branches on a condition, that condition must be explicitly named, typed, and provided by the authority.
- Heuristics, naming conventions, and identity checks are forbidden for behavioral decisions.

### **21.6 No Implicit Knowledge Rule**

Code must not "just know" things. Request knowledge from its authority, scope it to a lifecycle, and express it through a contract.

### **21.7 System Configuration Consistency Rule (Hard)**

The system has exactly one configuration authority.

- All components, hooks, and controllers must read configuration from the same validated source (Context).
- Configuration is immutable after load.
- Reading config files outside the provider, diverging local defaults, inferred behavior, and environment-based branching inside components are forbidden.
- If two components answer the same question differently, the architecture is already broken.

### **21.8 Context vs Parameter Rule (Hard)**

If a value has a Context owner, it must be read from Context at the point of use.

Threading context-owned values through function parameters is forbidden except for testing and boundary adapters.

### **21.9 Refactor Smell Indicators**

A refactor is likely wrong if it grows parameter lists, makes orchestrators pass more data, adds "environment" arguments to hooks, or makes behavior depend on caller position. These indicate authority leakage.

### **21.10 Traceability Rule (Hard)**

A refactor is invalid if it increases execution-path indirection without reducing duplication, authority ambiguity, or contract duplication. A developer must be able to trace a user action across layers without redundant wrapper layers.

### **Refactor Simplicity Gate**

A refactor must reduce at least one of the following:

- ownership boundaries crossed
- wrapper layers
- contract surfaces
- duplicated behavioral logic

If none are reduced, the refactor is invalid.

### **21.11 Indirection Budget Rule (Hard)**

New abstraction layers (wrappers, adapters, forwarding hooks) are permitted only if they eliminate duplicated logic, duplicated contracts, duplicated state, or divergent error semantics. Abstractions created solely for structural purity are forbidden.

### **21.12 Single Contract Surface Rule (Hard)**

For any operation domain there must be exactly one public contract surface exposed to the UI/control plane.

UI-facing command surfaces must return typed outcomes. Exceptions may exist only internally and must be converted once at the boundary owner. Parallel "throw" and "outcome" variants for the same operation are forbidden.


## **21.13 Integration-First & Ownership Gate (Hard)**

Before creating any new file, module, hook, service, model, constant set, or configuration surface, identify the canonical owner and extend it whenever lifecycle and authority match.

New surfaces are allowed only when:

- no valid ownership surface exists
- the responsibility is lifecycle-independent, such as pure domain logic, reusable primitives, or cross-feature algorithms
- extending the current owner would create multi-responsibility ownership or materially increase authority-surface complexity

Every new module must:

- declare explicit ownership and lifecycle
- have at least one immediate consumer
- reduce duplication, responsibility overload, or execution-path complexity
- document why the existing owner could not be extended

Parallel abstractions for the same responsibility are defects. Claims such as "cleaner" or "more modular" are insufficient without explicit evidence of duplication removal, ownership clarification, responsibility-surface reduction, or execution-path simplification.

## **21.14 Boundary Surface Leakage Rule (Hard)**

Function signatures, prop surfaces, and forwarding layers must remain cohesive with ownership boundaries.

- If a boundary accumulates parameter plumbing or pass-through props, ownership is leaking and must be redesigned at the authority.
- Wrapper-only layers are forbidden unless they remove duplication, standardize contracts, or reduce ambiguity.
- Control-plane behavior must not be encoded as boolean-flag construction in UI surfaces.

## **21.15 No Redundant Law Rule (Hard)**

This document must not contain duplicate invariant definitions.

- If two sections express the same invariant, one section must be canonical and the other must reference it.
- Architectural law is canonical only in §21.
- Non-§21 sections may define implementation policy, defaults, and checklists, but must not duplicate invariant text as parallel law.

## **21.16 Authority File Layering Rule (Hard)**

Authority files must preserve internal layer order and may not interleave layers.

- Required order: **Primitives -> Composition -> Features -> Builders**.
- Cross-layer declarations are allowed only through downstream consumption; reverse-layer coupling is forbidden.
- If a declaration does not fit a single layer, the authority boundary is incomplete and must be corrected before landing.

## **21.17 Authority File Split Rule (Hard)**

Do not split authority files by default.

- Split only when a file contains multiple independent authorities with distinct ownership or lifecycle boundaries.
- Mechanical size, line count, or stylistic preference alone is insufficient justification for splitting.
- If a split is introduced, the change must preserve a single canonical authority per decision domain.

## **21.18 Authority File Scope Rule (Hard)**

An authority file must not accumulate unrelated domains, orchestration logic, or cross-layer behavior.

- Authority files may define and compose their own domain semantics, but may not absorb orchestration/control-plane responsibilities from other owners.
- Cross-domain additions are valid only when they are part of the same declared authority and lifecycle boundary.
- If unrelated domains are added, the change is an architectural regression and must be restructured.
