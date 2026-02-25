
# **AGENTS.md — TinyTorrent Mission Specification**

**Purpose:**
Single authoritative reference for the architecture, UI/UX rules, design tokens, and development standards for **TinyTorrent** — a modern, world-class successor to µTorrent with a **VS Code–style workbench**.


---

# **North Star**

TinyTorrent optimizes for:

- Structural integrity at system boundaries
- Low friction inside feature scope
- No cleanup debt later

Hard invariants protect architecture.
Feature implementation remains cohesive, human-readable, and minimally prescribed.
The North Star guides decisions but does not override §21.

If a rule increases ceremony without preventing architectural decay, it does not belong here.

---

## **Constitutional Source Of Law (Hard)**

§21 is the only canonical source of architectural law.
All other sections must comply with §21.
If duplication or conflict exists, §21 governs.
Other hard sections may define enforcement gates and workflows, but they may not define parallel architectural invariants.

## **Rule Tiers**

This document uses three rule tiers:

- **Tier 1 — Foundational Invariants:** §21 only
- **Tier 2 — Enforced System Contracts:** boundary contracts for UI, RPC, ViewModel, runtime, and integration
- **Tier 3 — Implementation Defaults & UX Standards:** current tools, interaction standards, and guidance

## **Rule Derivation Model**

- §21 defines all foundational invariants (Tier 1).
- Tier 2 sections define enforceable contracts derived from §21 for specific subsystems (UI, ViewModel, RPC, Runtime).
- Tier 3 sections define replaceable implementation defaults and UX standards.
- Tier 2 may operationalize §21 but may not redefine or contradict it.
- Only §21 may introduce new architectural invariants.

## **Architecture Invariants Index (Reference-Only)**

Use this as a map; definitions and merge-gating law are in §21.

1. Single authority per decision: see §21.2.
2. State ownership and lifecycle: see §21.3 and §21.4.
3. Explicit contract gating: see §21.5 and §21.6.
4. Configuration authority: see §21.7.
5. Context authority and parameter boundaries: see §21.8.
6. Traceability and indirection budgets: see §21.10 and §21.11.
7. Single public contract surface: see §21.12.
8. Integration-first ownership gate: see §21.13.

---

## **Current Implementation Defaults (Replaceable)**

The following represent the current chosen tools and patterns.
They are defaults, not architectural invariants.

They may change if replaced without violating the canonical Hard Invariants in §21.

- React + TypeScript
- Tailwind + HeroUI
- Framer Motion for structural motion
- react-resizable-panels for pane persistence
- cmdk for command palette
- Zod for boundary validation
- @tanstack/react-virtual for virtualization

Tooling is replaceable.
Architecture invariants are not.

---

# **0. Quick Rules (Read This First)**

If you’re unsure what to do, follow these rules first, then read the referenced section(s).

- **Law source:** architectural decisions are governed by §21.
- **Authority-first:** use declared authorities; do not bypass them. (See §0.1 and §3)
- **Owner-extension-first:** extend existing owners before adding new surfaces. (See §0.2 and §21.13)
- **Outcome contracts:** expected failures are typed outcomes, not exception control flow. (See §21.12 and §20)
- **UI vs control plane:** UI may hide/disable capabilities, but boundary owners must enforce outcomes. (See §20 and §21)
- **Diff-first for user-visible changes.** If behavior or UI output changes and the change is meant to land (or be reviewed), the change note must describe it explicitly and include the relevant diff artifact (screenshots/video for UI; surface-tree + guardrails for token/surface changes). (`frontend/TOKEN_CONTRACT.md`)
- **Change note must list commands run (when landing/reviewing).** Include the exact `npm run ...` commands executed (lint/test/build + any relevant enforce/report scripts). If something cannot be run, state it explicitly and why.

## **0.1 Authority Registry (Hard)**

Adding a new authority (a new “source of truth” surface) is forbidden unless it is registered here first.

- **Surface token contract:** `frontend/TOKEN_CONTRACT.md`, `frontend/src/shared/ui/layout/glass-surface.ts`
- **Token pipeline + global knobs:** `frontend/src/config/constants.json`, `frontend/src/index.css`
- **Semantic UI logic/utilities:** `frontend/src/config/logic.ts`
- **Text roles / typography roles:** `frontend/src/config/textRoles.ts`
- **RPC schema/validation authority:** `frontend/src/services/rpc/schemas.ts`
- **RPC transport outcome semantics:** `frontend/src/services/transport.ts`
- **Feature ViewModel Authority (primary):** each feature module owns exactly one primary ViewModel, defined inside that module (for example `frontend/src/modules/dashboard/hooks.ts`)
- **Cross-feature/global ViewModel authority (optional):** `frontend/src/app/` (only when no single feature can own the concern)
- **Orchestration owner (cross-feature coordination):** `frontend/src/app/orchestrators/`
- **Shared UI primitives:** `frontend/src/shared/ui/`

## **0.2 Owner Extension Statement (Landing/Review Gate)**

If a change introduces a new module/hook/service/model/constant set that is intended to land (or be reviewed), the change note must include:

- **Owner:** what existing owner was extended or why it could not be
- **Lifecycle:** per render / per hook instance / per session / per application
- **Why new surface:** why extending the existing owner would violate single-responsibility or authority/lifecycle rules (§21)
- **Consumers:** at least one immediate consumer in the same change (no speculative surfaces)

## **0.3 Landing Gates (DoD)**

A change is not eligible to land (or be treated as done) if it introduces any of the following:

- bypassing named authorities (tokens/primitives/text roles/interactive recipes/config)
- feature-local styling authorities (inline styles, raw numbers, bracket classes) — see §3.6 and §5 checklist
- raw Tailwind utility authoring in feature UI files without qualifying under the Tailwind Exception Rule in §3.6
- new token namespaces, compatibility aliases, or feature-owned token maps that violate `frontend/TOKEN_CONTRACT.md`
- duplicated decision logic across Component/Hook/ViewModel/Orchestrator layers (§21)
- a new surface without an Owner Extension Statement (§0.2)
- expected failures represented as exceptions instead of typed outcomes (§20.1)

For UI/styling changes intended to land/review, the following command gates are mandatory and must be listed in the change note:

- `npm run enforce:surface-foundation`
- `npm run enforce:surface-churn`
- `npm run enforce:surface-unused`
- `npm run enforce:surface-final-form`
- `npm run enforce:workbench-parity`
- `npm run enforce:workbench-consumers`
- `npm run report:surface-tree`
- `npm run report:surface-tree:all`
- `npm run build`

## **0.4 Solo Dev Workflow (Low Ceremony)**

This repo is currently developed by a single person. Keep ceremony proportional:

- **While iterating (WIP):** optimize for speed; keep the build green and obey Hard Rules, but you do not need to write change notes or produce diff artifacts.
- **When landing a change (mainline/release/review):** provide a short change note, include any required artifacts, and list the commands you actually ran.

# **1. Brand Identity**

TinyTorrent is a fast, low-bloat desktop workbench for torrent control with deterministic behavior, native-grade interactions, and maintainable architecture.

---

# **2. Absolute Clarification: Desktop Feel ≠ Compact UI**

**Compact UI is explicitly NOT a goal.**

### **The Density Rule**
>
> **Density is achieved through information design, not UI shrinkage.**

- **Avoid Fragility:** No "precision clicking." If a design choice shows more rows but makes the UI feel cramped, it is a design error.
- **Desktop Tool Feel:** This refers to **behavioral determinism** (shortcuts, selection, focus, right-click authority), not to the size of the buttons.
- **HeroUI:** Its components must **never** be visually neutered or shrunk to appear "compact." Default or larger sizing is preferred.

---

## **2a. UI Scale System**

- All interactive element sizes are derived from central config and must respect Typography vs Geometry ownership (§2c).
- Do **not** use Tailwind pixel-based sizing classes (`w-5`, `h-6`, `text-[14px]`) directly.
- All sizing must reference scale tokens or semantic utility classes derived from config.

---

## **2c. Typography vs Geometry Ownership (Scaling Contract)**

TinyTorrent uses two root scaling systems with non-overlapping responsibilities. This is hard policy, not style.

### **Typography-Owned (Derived from `--fz`)**

Typography tokens MUST be expressed as named CSS tokens in `@theme` (e.g. `--tt-text-body`, `--tt-icon`, `--tt-row`) and may use `--fz` in their arithmetic.

The following MUST scale with font size:

- Body text
- Table body text
- Numeric text (speeds, sizes, counts)
- Icon glyph size
- Label text
- Row height for data tables and lists

### **Geometry-Owned (Derived from `--u * --z`)**

The following MUST scale with layout rhythm:

- Panel padding (`p-tight`, `p-panel`, `p-stage`)
- Gaps (`gap-tools`, `gap-stage`)
- Structural bars (`h-nav`, `h-status`)
- Modal framing and chrome
- Glass surfaces and borders
- Divider/separator thickness (borders)
- Focus ring thickness/offset
- Scrollbar thickness
- Resize/drag handle hit-target geometry

### **Scaling Constraint**

Composing typography tokens with geometry tokens in the same component is expected; the rule forbids deriving a single token from both systems.

No single CSS dimension token (height/width/padding/gap/font-size/line-height/icon-size) may be computed from both systems.

If an element requires both:

- Do NOT implement it.
- FLAG it as a missing semantic role.

### **Constraint Directionality**

Geometry-owned containers (Sidebars, Navs) impose layout constraints. If Typography content exceeds the Geometry container, the content must truncate or scroll—the container must **never** grow to fit the text. This preserves the "Command Center" layout stability.

### **§2d. Surface Ownership (Surface Contract)**

**Definitions**

- **Surface owner**: a container responsible for glass context, radius, and blur compatibility.
- **Structural child**: any component rendered inside a surface owner (headers, views, tables, scroll bodies, rows, tabs).
- **`surfaceStyle`**: the token that establishes a glass surface context.
- **`outerStyle`**: the token that establishes shell chrome geometry.

**Rules**

1. **`surfaceStyle` may be applied only by surface owners.**

2. **Structural children must never apply `surfaceStyle`.**

3. **Headers are structural children.**
   Headers must be typography-only and must not apply background, border, radius, blur, or surface tokens.

4. **`outerStyle` may be applied only by shell chrome containers.**

5. **A structural child assumes a surface context is provided by an ancestor.**

---

# **3. Design System Contract (Principles)**

This file is a **contract**, not a style guide. It defines *principles* that keep the UI consistent and prevent drift **without** requiring mass className churn.

**UI authority boundary (explicit):**
- Canonical UI authority rules live in **§3** and **§21**.
- **§5** is checklist/enforcement guidance only and does not define new authorities.

## **3.0 Styling Authority Chain (Tier 2 Contract)**

All styling authority follows this chain:

1. **Root Knobs:** §3.1
2. **Token Pipeline:** §3.2
3. **Semantic Authorities:** §3.6
4. **Structural Primitives:** Structural Layout Primitives section
5. **Feature Mechanics:** local utilities for layout mechanics only
6. **Enforcement:** §5 checklist

If a styling rule is not in this chain, it is guidance, not authority.

## **3.1 Root Knobs Are the Only Global Dials**

The UI must remain stable under the three global scale knobs:

- `--u` (layout rhythm unit)
- `--z` (layout scale multiplier)
- `--fz` (readability / typography scale)

Principles:

- Prefer using existing knobs/tokens over introducing new global knobs.
- If a new knob is truly required, it must be introduced intentionally through the design token pipeline (not ad-hoc in components).

## **3.2 Use the Token Pipeline for Design Decisions**

Feature components should not “decide” new numbers, opacities, radii, shadows, or blur values.

Practical rule: when the decision is *design* (not pure layout composition), it must flow through the existing layers:

1. **Intent** in `config/constants.json` (meaning, not CSS)
2. **Arithmetic** in `index.css` (`@theme`, derived from the root knobs)
3. **Role** in `config/logic.ts` (semantic exports / class utilities)
4. **Usage** in `.tsx` (compose the semantic utilities)

This keeps changes small, reviewable, and prevents “className changes for everything”.

## **3.3 Standard Elements Over Inline Recipes**

Prefer **standard elements** (shared primitives, semantic components, and tokenized utilities) over duplicating long Tailwind strings.

Principle: *make the standard element once, then keep feature code boring.*

Centralize only when it clearly pays off (shared pattern or repeated recipe). Avoid creating abstractions for one-offs. This does not permit local visual styling authorities; §3.6 still governs styling.

## **3.4 Minimize Classname Churn (No Style Sweeps)**

Do not change classNames “for consistency” unless at least one is true:

- You are fixing a functional/UX bug in that area, or
- You are adopting an existing standard element in the code you touched, or
- You are creating the missing standard element (token/component) that will reduce future churn.

Avoid repo-wide stylistic migrations unless explicitly requested.

## **3.5 Plans Are Working Documents (Not a New Law)**

These documents describe the intended direction for reducing drift, but they are allowed to evolve as implementation proves what works:

- `SURFACE_CLEANUP_PLAN.md`
- `TEXT_ROLE_MIGRATION.md`
- `CONSISTENCY_AUDIT.md`

When working *in those areas*, align with them. If they conflict with existing code or reality, prefer the smallest safe change and flag what needs to be amended in the plan.

## **3.6 Feature Styling Ownership (Tier 2 Contract)**

Feature code must consume shared semantic authorities for visual meaning. Tailwind utility authoring in feature files is disallowed by default and only permitted by the Tailwind Exception Rule below.

### **No Local Styling Authority Rule (Hard)**

Feature/UI files must not define styling authority.

Forbidden:
- local style constants/maps (`const ...CLASS...`, `const ...ClassNames...`)
- raw Tailwind visual recipes in feature files
- feature-prefixed style namespaces as end-state authorities

Allowed:
- consuming shared style authorities (`glass-surface.ts`, `textRoles.ts`, `logic.ts`)
- minor mechanical utilities only when they satisfy the Tailwind Exception Rule
- mechanical class composition when semantic meaning is owned by shared authorities

### **Modal Styling Contract (Hard)**

Applies to `**/*Modal*.tsx`.

- Modal files are style consumers only.
- Modal files must not introduce modal-local class recipes or style maps.
- Modal visual/layout semantics must come from shared authorities.
- If a modal needs a new visual role, extend shared authorities first; do not implement styling locally in the modal file.

### **UI Surface Authority Rule (Hard; Tier 2 Contract)**

- UI components must not define new surface semantics inline (surface background, blur, border, radius, elevation, layering).
- Surface composition must originate from the declared surface authority or structural primitives. Feature modules may not assemble new composite surface recipes. (See §0.1 and Structural Layout Primitives.)
- Repeated semantic composite patterns must be promoted into the surface authority; feature modules must not copy/paste near-identical surface recipes.
- This does not apply to mechanical layout utilities (spacing/alignment/sizing) that do not create new visual semantics.
- Small mechanical adjustments that sit on top of parent layout/surface tokens (for example `justify-end`, `items-end`, `text-right`, `ml-auto`) must remain local composition and must not trigger new token creation.

**Semantic authority locations:**
- `frontend/src/shared/ui/layout/glass-surface.ts`
- `frontend/src/config/textRoles.ts`
- `frontend/src/config/logic.ts`

**Forbidden in feature/UI components:**
- ad-hoc semantic surface recipes (`bg-*`, `border-*`, `shadow-*`, `rounded-*`, `backdrop-blur-*`) used as local semantic systems
- feature-local semantic styling authorities (feature-prefixed token maps/constants)
- duplicate semantic systems that parallel shared authorities

**Allowed in feature/UI components:**
- compose semantic classes from shared authorities
- minor mechanical utilities only when they qualify under the Tailwind Exception Rule
- third-party `classNames` composition only when semantic meaning still comes from shared authorities and Tailwind exceptions are not exceeded

**Promotion rule:**
- Promote to shared utilities/primitives when reuse is stable and semantic meaning exists.
- If a semantic role is missing, extend the authority chain instead of creating local semantic rules.

### **Tailwind Exception Rule (Hard)**

Tailwind utilities are permitted in feature/UI files only when **all** conditions are true:

1. The utilities are strictly mechanical (`flex`/alignment/spacing/flow) and do not encode visual semantics (no color, border, shadow, blur, radius, opacity, typography, transitions, or effects).
2. The usage is minor and local (single element, short utility list), and creating a new shared token/role would be disproportionate.
3. The same utility recipe is not repeated across components. On second reuse, promote to shared authority.
4. No local style authority is introduced (`const ...ClassNames`, `const ...CLASS...`, feature-local styling maps).

If any condition fails, move styling to shared authorities (`glass-surface.ts`, `textRoles.ts`, `logic.ts`) before landing.

### **Styling Exception Procedure (Hard)**

If a shared style authority is missing:

1. Stop local styling work.
2. Add/extend the shared authority in `glass-surface.ts`, `textRoles.ts`, or `logic.ts`.
3. Consume that authority from feature code.

Direct local styling exceptions require explicit user approval in-thread. Silent or implied exceptions are forbidden.

# **Structural Layout Primitives (Authority Scope)**

Structural primitives own shared layout/surface patterns with clear intent.
Use them where they add consistency and reuse value; do not force them for every local layout decision.

This rule exists to ensure deterministic surface semantics and reduce repetition where it is real.

**Layout Authority Rule**

Semantic visual framing must be owned by structural primitives or semantic roles.
Mechanical layout spacing/grouping/alignment may be authored locally with utilities.
Repeated layout recipes become candidates for extraction when reuse is stable and semantic meaning exists.

---

## **1. Approved Structural Primitives**

### **Surface**

Owns:

* background
* blur
* elevation/shadow
* border
* radius
* surface padding

Responsibilities:

* defines the visual surface container for panels, cards, inspectors, tool areas, and modal bodies
* may not define page centering or max-width behavior

Prohibited inside features:

* direct glass recipes
* direct blur/shadow/radius application
* ad-hoc card/panel surface construction

---

### **Section**

Owns:

* page/stage centering
* horizontal alignment rhythm
* max-width governance
* stage padding

Responsibilities:

* defines top-level page/workbench stage containers
* establishes horizontal rhythm and alignment for contained surfaces

Must not:

* define background, blur, elevation, or card framing

---

### **Stack**

Owns:

* vertical spacing between children

Responsibilities:

* replaces `space-y-*` and manual vertical spacing patterns
* defines deterministic vertical rhythm

Must not:

* define surfaces
* define horizontal layout or centering

---

### **Cluster**

Owns:

* horizontal grouping rhythm
* toolbar/button/chip grouping spacing

Responsibilities:

* replaces ad-hoc `flex gap-*` clusters
* defines deterministic horizontal spacing

Must not:

* define surfaces
* define vertical spacing rules

---

## **2. Usage Rules**

1. Any container that visually frames content (panel, modal body, inspector block, card, table shell) **must use `Surface`**.

2. Any container responsible for page/workbench centering or stage padding **must use `Section`**.

3. `Stack`/`Cluster` are preferred for repeated grouping patterns and stable UI motifs. Local `flex`/`gap` utilities are acceptable for one-off or low-reuse layout mechanics only when they satisfy the Tailwind Exception Rule (§3.6).

4. Feature components are **forbidden** from composing their own surface recipes using Tailwind classes, blur, border, radius, or shadow tokens.

5. Promotion rule: extract to a shared semantic utility/primitive when reuse is stable and semantic meaning exists.

6. Surface/Section/Stack/Cluster primitives must live in shared UI primitives (single authority location) and be reused across the application.
   Feature modules must never define local variants.

7. Feature code must not stack multiple Surface recipes for the same intent (double borders/shadows). If nested surfaces are required (e.g., modal shell + inner pane), each layer must have a distinct declared intent (Shell / Pane / Card) and use the corresponding primitive.

---

## **3. Migration Rule**

During refactors:

* If a container applies background + border + radius + blur -> replace with `Surface`.
* If a container applies centering/max-width/stage padding -> replace with `Section`.
* Replace repeated `gap-*`, `space-*`, or toolbar spacing with `Stack` or `Cluster` when reuse is stable and semantic meaning exists.

Incremental migration is allowed; primitives must be used for all newly written UI.

---

## **4. Architectural Intent**

Layout ownership must be deterministic:

* **Surface** controls visual framing
* **Section** controls page alignment
* **Stack** controls vertical rhythm
* **Cluster** controls horizontal rhythm

No other component may assume these responsibilities.

---

# **4. Theming & Semantic Tokens**

This section defines theme defaults and semantic mappings inside the §3 styling authority chain.

Use **HeroUI semantic tokens** for semantic color meaning.

### **The Layered Depth System (Semantic Glass)**

We use Tailwind's opacity modifier (`/opacity`) on HeroUI tokens. This preserves semantic color (light/dark aware) while applying glass transparency.

| Layer       | Surface                      | Tokens                                                                        |
| :---------- | :--------------------------- | :---------------------------------------------------------------------------- |
| **Layer 0** | App Background (Shell)       | `bg-background` + subtle noise texture (2–4% opacity), defined via config     |
| **Layer 1** | Panels / Tables              | `backdrop-blur-md` + `bg-background/60` + `border-default/10`                 |
| **Layer 2** | Modals / Popovers / Floating | `backdrop-blur-xl` + `bg-content1/80` + `shadow-medium` + `border-default/20` |

Every glass layer (Layers 1 and 2) should keep a subtle semantic border (`border-default/xx`) so edges remain readable across themes.

- **Layer 0 (App Shell):**

  - Transparency should allow OS window material to show through if supported (Mica-like effect).
  - Fallback colors and noise parameters are defined centrally in `config/constants.json`; no inline hex in JSX/TSX.
  - The app background must visually read as "Chrome Gray", not pure white/black. Content tables sit **on top** using `bg-background`.

### **Semantic Status Mapping**

These mappings must be consistent across the app (Text, Badges, Icons, Graphs):

| Token     | Usage                  |
| --------- | ---------------------- |
| `success` | Seeding, Completed     |
| `warning` | Paused, Checking       |
| `danger`  | Deletes, Errors        |
| `primary` | CTAs, Progress Accents |
| `default` | Borders, Inactive Text |

---

## **Color Rules**

**Use:**

- `var(--heroui-background)`
- `var(--heroui-content1)`
- `var(--heroui-foreground)`
- `var(--heroui-primary)`
- `var(--heroui-default)` (for borders/dividers)
- Tailwind visual utilities belong in shared authorities. Feature files must follow §3.6 (Tailwind Exception Rule) and may not define local visual semantics.

**Avoid:**

- Custom hex / rgb colors in JSX/TSX
- Tailwind named colors (`bg-slate-900`, etc.)
- Hard-coded `border-white` / `border-black` (breaks theme switching)
- Manual `rgba()` color calculations

All shell-level constants (fallback grays, noise strength, etc.) live in `config/constants.json`, never inline.

### **Aesthetic**

- Detect system dark/light mode and use it automatically; fallback = Dark.
- Detect system/browser language and use it; fallback = English.
- Glass layers (backdrop-blur) for all UI surfaces that float or overlay.
- Controls (buttons, icons, chips) use enlarged visual size and comfortable hit areas to improve usability without inflating layouts.
- Strong typography hierarchy (Swiss style).
- Layered shadows used sparingly for depth — never decoration.

---

# **5. UI Consistency Enforcement Checklist**

**Applies to all UI, including §§2, 3, 4, and 8**
This section enforces §3 + §21 during implementation/review.
It does not introduce new UI authority rules.

## **A. Consistency Contract**

UI must remain stable under knob changes. Agents must treat the design system like an API.

If a change causes any of these, it is a failure:

- One view scales differently than another when `--u`, `--z`, or `--fz` changes.
- Two panels that should match use different padding/gap/row height semantics.
- Similar controls look “nearly the same” but differ due to local class tweaks.

## **B. Pre-Commit Checklist (Mandatory)**

Before claiming UI work is done, verify:

- Root knobs and token pipeline are respected (§3.1, §3.2).
- Semantic meaning comes from declared authorities, not feature-local semantic systems (§3.6).
- Structural framing uses shared primitives where applicable (Structural Layout Primitives).
- Local utilities are mechanical only, and promotions follow stable semantic reuse (§3.6).
- Theme semantics remain consistent across light/dark and status mappings (§4).
- Scroll behavior does not introduce layout shift in pane workflows (§7).
- No duplicate semantic recipe strings were introduced where a shared authority exists.

## **C. Agent Output Requirement**

When UI changes are intended to land (or be reviewed), include a short “Token Mapping” note in the change note:

- Which semantic roles were used (e.g., `p-panel`, `gap-stage`, `h-row`, glass layer token)
- Whether any new token was required
- If required but missing → must be flagged, not hacked

---

# **6. Architecture**

TinyTorrent is a local UI controlling a local daemon.  
Remote connections exist only for debugging/convenience and must not alter feature behavior or UX.

## **§6a. Frontend Runtime Model (Hard)**

- Local vs remote runtime must never change capability or UX behavior.
- Web technology is an implementation detail used for footprint/runtime goals, not the product model.
- TinyTorrent must not be designed as a browser-constrained client.
- Browser-layer limitations must not remove native-grade capabilities.
- If a native Windows UI can do it, TinyTorrent must be able to do it.

### **Stack:**

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** TailwindCSS v4 + HeroUI (Premium Control Layer)
- **Motion:** Structural state changes must be motion-authored. Current default: Framer Motion.
- **Drag & Drop:** `react-dropzone` (full-window detection)
- **Icons:** Lucide (tree-shaken)
- **State:** React Hooks; Zustand only when truly necessary
- **Data/Validation:** RPC boundaries must be schema-validated. Current default: **Zod**. Never trust the backend blindly.
- **Virtualization:** Large lists must be virtualized. Current default: `@tanstack/react-virtual`.
- **Command Palette:** Keyboard-driven command navigation (for example `Cmd+K`) must exist. Current default: `cmdk`.
- **Pane Engine:** Panes must preserve mount continuity and support size=`0` collapse semantics. Current default: `react-resizable-panels`.
- **Window Controls:** Custom Titlebar implementation (frameless window).
- **Context:** `React Context` for global focus tracking (e.g., `FocusContext`: is the user in the Table, the Search, or the Inspector?).

---

### **System Topology**

TinyTorrent is a **local three-part system**:

1. **Tray / Native Shell**

   - Native Windows dialogs
   - **WebView2 Window Host** (Zero-bloat native shell)

2. **Daemon**

   - Minimal memory footprint
   - Runs in background
   - Owns all torrent state

3. **UI (Managed Native Window)**

   - React-driven workbench hosted in the Native Shell
   - No business logic
   - Uses **Native Message Bridge** for OS-level features (Focus, Dialogs)

This architecture exists to achieve **smallest possible size and overhead**, not to emulate a web client–server product.

---

## **§6b. The Native Bridge (WebView2 Rules)**

When running as a desktop app, the UI must bypass browser-layer limitations:

1. **Deterministic Focus**
 The Native Shell owns the window handle (`HWND`). Standard Win32 `SetForegroundWindow` is used for activation. The "Title Swap Handshake" is deprecated.

2. **System Services**
   The UI communicates with the Native Shell via `window.chrome.webview.postMessage`.
    - **Native Path:** UI → Native Shell (C++) → Win32 API.
    - **Fallback Path:** UI → Daemon (RPC) → Logic (for remote/standard browser use).

3. **Window Lifecycle**
 The window is a "View." Closing the window must **Hide** the window, not terminate the process. Termination is only handled via the Tray's "Exit".

---

### **Design Constraint**

All frontend decisions must pass this test:

> *Would a native Windows UI reasonably be allowed to do this?*

- Yes → allowed
- No → reject
- “Web limitation” → redesign

**Purpose overrides tooling.**

---

## UIActions — Hard Rules

1. UIActions change **UI identity participation**, not data.
2. UIActions execute **synchronously in the same tick**.
3. UIActions **must not await** engine / RPC / filesystem work.
4. Engine data remains the **only canonical source of truth**.
5. UIActions **must not**:
   - create filtered or “visible” data lists
   - maintain shadow copies of engine data
   - rely on cleanup effects or reconciliation
6. UIActions **must**:
   - clear selection and detail state immediately
   - remove the identity from UI participation
   - fire engine intents **fire-and-forget**
7. Rollback is explicit:
   - only on engine failure
   - with a user-visible toast
   - never via silent resurrection
8. All UIActions funnel through the orchestrator control plane.

---

## **State & Heartbeat Strategy (CRITICAL)**

To prevent "Slow Table / Fast CPU Burn":

1. **Single Heartbeat Source**
   The app must have **one** central heartbeat loop (managed by `EngineAdapter`).
   Components must **never** set their own `setInterval` for fetching.

2. **Adaptive Modes**

    - **Polling Mode (Current):**

        - Table View: fetch every ~1500 ms
        - Detail/Graph View: fetch every ~500 ms
        - Background: throttle to 5000 ms

    - **Push Mode (Future):**

        - Polling stops. Heartbeat is used only to check connection health (Ping/Pong).
        - Data is driven by incoming server events.

3. **Selective Subscriptions (Selector Pattern)**

    - The **Table** subscribes to the **List Hash/Delta**. It only re-renders rows that changed.
    - The **Inspector** subscribes **only** to `state.torrents[activeId]`.
    - If the list updates but `activeId` data hasn't changed, the Inspector **must not re-render**.

---

# **7. UI/UX Philosophy**

Structural state changes must be motion-authored (layout, reorder, open/close, drag).
Current default: Framer Motion.
Do not require motion for every small visual state; use the shared `TRANSITION.*` authority for simple hover/focus/active fades.

### **The "Tool" Interaction Model**

1. **OS-Style Selection**

    - Click = Select single
    - Ctrl/Cmd + Click = Add to selection
    - Shift + Click = Range selection
    - Right Click = Context Menu (acting on **all** selected items)

2. **The "Viewport" Rule**

    - `body` and `#root` must be `h-screen w-screen overflow-hidden`.
    - The window **never** has a scrollbar.
    - Only specific panels (Table, Inspector, long lists) have internal scrollbars.
    - **Scrollbar Rule (Landing Gate):** Internal scroll areas must not cause layout shifts when content length changes. Prefer `overlay-scrollbar` for panes; native scrollbars are acceptable during iteration or when the overlay primitive is not suitable, but the final UX must be stable and consistent.

3. **Selection vs Text**

    - Global default: `user-select: none;` (tool behavior over document behavior).
    - Exceptions: explicit `select-text` only for copy-required fields (hashes, paths, logs, tracker URLs).

4. **Cursor Discipline**

    - I-beam cursor is allowed only over editable inputs/textarea.
    - Non-editable interaction zones must use `cursor-default` or `cursor-pointer`.

5. **Optimistic UI Action Feedback**

    - UI actions reflect immediately; rollback only on explicit engine failure. UIActions must follow the UIActions — Hard Rules contract.

### **Interaction Behavioral Contracts (Hard)**

- Keyboard-first operation is required for core navigation and commands; pointer interaction must not be the only path.
- Context menus are required on action-bearing surfaces and must expose the same command authority as toolbar/shortcut paths.
- Interactive actions must provide immediate feedback (state, motion, or status) and must not produce silent dead states.
- Workspace interactions (selection, resize, drag, focus transitions) must remain deterministic and reversible.
- Drag-and-drop must provide full-window detection with explicit overlay affordance and immediate cancel on drag-out.
- Motion must communicate structure/state changes (layout, reorder, open/close, selection), not decorative animation.

---

### **Focus Model (VS Code–Style)**

- Only **one Part** (Main, Inspector) holds "active focus" at a time.
- Arrow keys, PageUp/PageDown, Home/End operate on the **active Part** only.
- Switching Parts updates the global `FocusContext`.
- The active Part must show a subtle focus border using HeroUI tokens (no custom colors).
- `Escape` clears selection within the active Part but does **not** change which Part is active.

---

# **8. Component System**

### **Core**

- HeroUI for controls (Confident sizing, no shrinking)
- Sticky blurred header
- Monospace font for numbers/speeds
- Sans-serif for names/labels
- Thin, minimal progress bars
- Optional sparkline SVGs allowed
- No row flicker on updates
- Row-level motion for selection, hover, reorder

### **Control & Icon Contracts (Hard)**

- Primary action buttons must use the designated primary control variant.
- Toolbar commands must be icon-first unless text is required for clarity.
- Icons must use semantic status colors via theme tokens.
- Drag-and-drop must provide full-window detection with a standardized overlay surface.

---

### **Tables & Grids (Implementation Strategy)**

Do not build a "God Component".

- **Dashboard Grid (`Dashboard_Grid.tsx`)**

  - Heavy
  - Virtualized
  - Supports row drag & drop (queue management)
  - Marquee selection
  - Optional sparklines

- **Details Grid (`SimpleVirtualTable.tsx`)**

  - Light
  - Virtualized
  - Sorting only
  - Used for Files/Peers

---

### **Modals**

- Instant autofocus on primary field
- Layer 2 visuals (blur + depth shadow)
- Framer Motion transitions
- Must feel like floating panels inside a HUD
- No heavy chrome, no wasted margins

**Usage Rule:**

- Modals are **only** for blocking actions:

  - Add Torrent
  - Settings
  - Confirm Delete (and similar destructive actions)

- **Never** use modals for passive data viewing (details, peers, files). These belong in the **Inspector Pane**.

---

## **8a. The Workbench Layout (Panel Strategy)**

Instead of "modals for details", TinyTorrent uses a **Master–Detail Workbench**.

1. **One/two-Pane Layout**

    - **Main (Center)** — Torrent grid; flexible, primary focus area.
    - **Inspector (Bottom, Right, full screen configurable)** — Details for the active torrent (tabs for Summary, Files, Peers, Trackers); resizable, collapsible.

2. **The "Pinning" Logic (Interaction Model)**

    - **Selection:** Clicking a row updates the Inspector data immediately.
    - **Visibility:**

        - Default: Inspector collapsed (size = 0).
        - Active: double-click row OR keyboard shortcut (e.g., `Cmd+I`) expands the Inspector pane and focuses it.

    - **Persistence:** Inspector state (size, orientation, open/collapsed) is saved to local storage and restored on next launch.

3. **Visuals**

    - `react-resizable-panels` for all splits.
    - Drag handles:

        - Invisible drag-handle hit target (`h-handle-hit` or equivalent semantic token)
        - On hover/drag, show a 1 px separator line using `border-default` semantics.

    - No thick gutters; everything feels sharp and minimal like VS Code.

4. **Panel Mounting Rule (IDE-Grade Continuity)**

    - Panels (Main, Inspector) are **never** conditionally mounted.
    - Collapsing = set panel size to `0`.
    - Expanding = restore previous size.
    - DOM nodes must remain mounted to preserve:

        - scroll state
        - focus
        - selection
        - perceived native continuity

5. **Context Menus**

    - Must be custom (HeroUI menu / Radix-style).
    - Must not overflow window boundaries.
    - If they would overflow, they must flip or reposition.

---

## **8b. Workbench Model (VS Code Architecture)**

TinyTorrent adopts a simplified VS Code workbench structure:

- **Part** → major region (Main, Inspector)
- **Container** → persistent layout node that holds one or more panes
- **Pane** → resizable element managed by `react-resizable-panels`
- **View** → React component rendered inside a pane (e.g., TorrentGridView, FilesView, PeersView)

**Rules:**

- Parts never unmount.
- Containers always exist, even when collapsed to size 0.
- Views may change or be swapped, but their hosting pane stays mounted.
- All resizing, collapsing, and restoring happens at the **Pane** level.

This model guarantees IDE-like continuity: stable scroll state, predictable focus, and zero layout pop-in.

---

# **9. RPC Layer (Protocol Strategy)**

TinyTorrent is in a **Transition Phase**.

1. **Current Backend:** Standard `transmission-daemon` (official).
2. **Target Backend:** Custom `libtorrent`-based daemon that mimics the Transmission RPC interface exactly, plus extensions.

---

## **Connection Strategy: "The Adaptive Client"**

The frontend runs on a **dual transport**:

1. **Baseline (HTTP Polling)**

    - Fallback for remote debugging or standard Transmission compatibility.
    - The app must fully function using standard HTTP RPC calls (POST to `/transmission/rpc`).
    - Compatible with stock Transmission.
    - Polling interval is adaptive (e.g., 2s in table view, 5s in background).

2. **Upgrade Path (Server-Push / WebSocket)**

    - If backend identifies as "Standard Transmission", client stays in **HTTP Polling** mode.
    - If backend identifies as "TinyTorrent", client upgrades to **Server-Push** and activates the **Native Bridge** (if available).
    - In push mode, client stops polling; server pushes state deltas via WebSocket.

---

## **Connection & Authentication UI (Hard Rules)**

- Before a connection attempt completes, show only server address + port (no credential fields).
- After the attempt completes (success or error), detect whether the server is a standard Transmission server or a TinyTorrent server.
- Only then render the correct credential UI:
  - Transmission server → username + password
  - TinyTorrent server → authorization token
- Always attempt to connect automatically using saved credentials; if none are saved, attempt an anonymous connection.
- Regardless of the result, the user can edit credentials and reconnect.

---

## **Design Rules**

- **Transmission RPC is the Law**
    Use Transmission RPC spec for everything (Session, Stats, Torrent Get/Set). No custom protocol for base operations.

- **Zod at the Gate**
    All incoming data is validated. If the future libtorrent daemon sends malformed Transmission DTOs, Zod must catch it before it reaches UI.

- **EngineAdapter Interface**
    UI components are backend-agnostic and call `adapter.getTorrents()`, `adapter.getDetails(id)`, etc.

  - Now: adapter uses `fetch('/transmission/rpc')`.
  - Future: adapter may receive pushed frames, but the UI contract is unchanged.

---

## **Data Handling**

- Strictly typed — use `transmission-rpc-typescript` types (or equivalent) as source of truth.
- Even over HTTP polling, use `ids` to request only changed torrents.
- Prefer **delta updates** to keep standard daemon load minimal.

---

# **10. Internationalization (Stack Level)**

- i18next
- Only `en.json` is required for MVP.
- All text must come from translation keys — no exceptions.

---

# **11. Quality & Performance Standards**

### Requirements

- Large lists must be virtualized.
- No console noise.
- No unused imports.
- Strict TypeScript everywhere.
- Minimal bundle size.
- Clean build: `npm run build` must pass before landing/release.
- Visually consistent, dark-mode-first UI with correct light mode.

### Rendering

- Efficient row-level updates (selectors + fine-grained subscriptions).
- Minimized unnecessary React re-renders.
- No layout thrash (no repeated sync `measure → mutate` chains).

---

# **12. MVP Deliverables**

1. Glass App Shell (Layered Depth System).
2. Dashboard Grid (Virtual, Sortable, Queue-Draggable).
3. Details Tables (Virtual, Sortable — Files/Peers).
4. Hybrid RPC Layer (Transmission Base + Zod + WS-ready adapter).
5. Add Torrent Modal (Magnet/File/Text).
6. Context Menus (Start, Pause, Delete, "Open Folder", etc.).
7. Command Palette (Cmd+K).
8. Tray Integration Stub (UI triggers to native daemon/tray).

---

# **13. UX Excellence Directive**

All agents operate as tool-UI engineers: behavior must be deterministic, traceable, and maintainable.

---

# **14. Architectural Principles (Operational Summary)**

This section is a plain-language operational interpretation of §21 for day-to-day implementation.
It does not introduce, redefine, or enforce architectural invariants.

- **Keep control/shell boundaries explicit.**
  Controls come from shared control surfaces; shell chrome remains authority-driven.
  (Derived from §21.2 and §21.12.)

- **Keep units cohesive.**
  Split only when it removes duplication or clarifies ownership/lifecycle boundaries.
  (Derived from §21.3 and §21.13.)

- **Keep views pure.**
  Views render and emit intents; domain decisions and IO stay outside view components.
  (Derived from §21.2 and §21.12.)

- **Keep layer flow one-way.**
  Data flow is RPC/adapter → services/domain → viewmodel/state → components.
  (Derived from §21.5 and §21.12.)

- **Keep data contracts explicit.**
  Typed data and validated boundaries are the default for runtime decisions.
  (Derived from §21.5 and §21.12.)

- **Keep state ownership intentional.**
  Prefer local ownership until cross-feature authority is actually required.
  (Derived from §21.3 and §21.8.)

- **Keep tool choices pragmatic.**
  Use established tools when they pay off; treat defaults as replaceable policy.
  (Derived from Rule Tiers and Current Implementation Defaults.)

## **View–ViewModel–Model (Operational Pattern)**

This pattern operationalizes §21 for frontend feature design.

### **View**

- Render UI and maintain local visual state.
- Emit typed intents to command surfaces.
- Route workflow and side effects through ViewModel commands.

### **Model / Domain / Services**

- Own business logic and engine/IO interaction.
- Avoid UI state and UI-specific branching.

### **ViewModel Role**

1. Expose one primary feature ViewModel surface, owned inside the feature module.
2. Translate service/domain outcomes into UI-facing state.
3. Expose command surfaces consumed by views.
4. Avoid wrapper-viewmodel fragmentation unless it removes duplication or establishes a reusable boundary.
5. Place truly cross-feature UI authority under `src/app/`.

### **Context And Command Routing**

- Read context-owned values from Context at point of use.
- Avoid pass-through command props across unrelated component branches.
- Use feature ViewModel commands for feature scope and context/app command surfaces for cross-feature scope.


# **15. Project Structure (Optimized for Single Developer)**

Flat, high-maintenance structure optimized for speed and co-location.

```txt
src/
|-- app/                      # App shell: providers, routes, main.tsx
|
|-- config/                   # THE TWO CONFIG FILES
|   |-- constants.json        # 1. Literals (colors, magic numbers, defaults)
|   \-- logic.ts              # 2. Logic (types, computed config, maps)
|
|-- modules/                  # Feature Areas
|   |-- dashboard/            # Flat structure - no internal folders
|   |-- dashboard/
|   |   |-- DashboardView.tsx
|   |   |-- Dashboard_Grid.tsx
|   |   |-- Dashboard_Row.tsx
|   |   |-- Inspector_Panel.tsx      # The Resizable Details Pane
|   |   |-- Inspector_Files.tsx      # Uses Shared SimpleTable
|   |   |-- Inspector_Peers.tsx      # Uses Shared SimpleTable
|   |   \-- hooks.ts                 # Primary feature ViewModel + local hooks
|   |
|   \-- settings/
|       |-- SettingsModal.tsx
|       \-- hooks.ts                 # Primary feature ViewModel + local hooks
|
|-- services/                 # External Integrations
|   |-- rpc/
|   |   |-- engine-adapter.ts      # The Hybrid Client (HTTP + WS)
|   |   |-- schemas.ts             # Zod Schemas (Validation)
|   |   \-- types.ts               # Inferred TypeScript Types
|
|-- shared/                   # Generic Reusables
|   |-- ui/                   # Reusable UI primitives (Buttons, Inputs)
|   |-- components/           # Complex shared components
|   |   \-- SimpleVirtualTable.tsx  # Light Grid (Files/Peers)
|   |-- hooks/                # Generic hooks
|   \-- utils/                # Generic logic
|
\-- i18n/
    \-- en.json
```

---

## **Rules**

### **1. Features (`modules/`)**

- Flat > nested. No `parts/`, `tabs/`, `components/` folders inside a module.
- Use underscores to group related siblings: `Dashboard_Grid.tsx`.
- Local hooks belong in `hooks.ts` inside the module.

### **2. Configuration (`config/`)**

- Two-file rule:

  1. `constants.json` — literals only.
  2. `logic.ts` — types and computed logic.

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

---

# **16. Coding Standards**

## **1. File Naming**

**Components → PascalCase (with underscores for siblings)**

- `DashboardView.tsx`
- `Dashboard_Grid.tsx`

**Hooks & Logic → camelCase**

- `hooks.ts`
- `useVirtualGrid.ts`

**Services → kebab-case**

- `engine-adapter.ts`

---

## **2. Configuration Access**

- Never hardcode numbers or colors in code.
- Import literals from `@/config/constants.json`.
- Import config logic from `@/config/logic.ts`.

---

## **3. Service Isolation (Mandatory)**

- UI must never call `fetch` directly.
- Data flow must remain: UI -> hooks/viewmodels -> services/adapters -> schemas -> network/native boundary.

---

## **4. Absolute Import Policy (Mandatory)**

All internal imports must use the `@/` alias.
Relative paths like `../../../../../` are forbidden.

### **Aliases:**

```

@/app        → src/app
@/modules    → src/modules
@/shared     → src/shared
@/services   → src/services
@/config     → src/config
@/i18n       → src/i18n

```

### **Rules:**

1. All imports inside the project must use `@/...` instead of relative chains.
2. The agent must automatically rewrite any deep relative imports to the correct alias.
3. When new files are created, they must always be imported via aliases.
4. Directory moves or refactors must update import paths accordingly.
5. The agent must maintain `tsconfig.json` and `vite.config.ts` alias configuration.

### **Required Configuration:**

**tsconfig.json**
**vite.config.ts**

as they are, don't change pattern without permission from the user. ask if you need tochange.



## **5. Incremental Architecture & Naming Improvement Rule (Mandatory)**

This rule enforces **local improvement**, not global refactoring.

**Scope:**
Applies only to files and components that are **touched by the current change**.

### **A. Incremental Architecture Improvement**

If an edited file already violates any of the following:

- multiple responsibilities
- mixed concerns (UI + data shaping, UI + fetching, UI + layout orchestration)
- god-components (too many unrelated props, effects, or render branches)

then the agent must reduce the violation **only when responsibilities are reused independently or when duplication exists**. Cohesive logic that changes together must remain together.

**Required behavior:**

- Extract **one** responsibility (hook, helper, subcomponent), or
- Move logic closer to its correct layer (hook → service → adapter), or
- Introduce a clearer boundary (split component, isolate effect, isolate selector)

**Explicitly NOT required:**

- Repo-wide refactors
- Large redesigns
- Touching unrelated files

Leaving the file in the same or worse architectural state is a spec violation.

### **B. Typed Control Plane (Specialization)**

All control flow (intents, actions, commands, events, orchestration switches):

- must be **statically typed**
- must use **typed identifiers** (no string literals)
- must be **exhaustively checked**
- must not contain transitional, fallback, or dual-path logic
- must not be constructed directly by UI components

If typing is unclear, **the architecture is incomplete and must be fixed**.
Refactors must preserve a buildable state unless performing an explicitly declared staged migration. Breaking type safety is not.

---

### **C. Strict Typing (Hard Rule — Global)**

In all **new or modified code**, without exception:

- `Any` is **forbidden**
- `unknown` is forbidden inside application logic but **required/allowed at IO, adapter, transport, or native boundaries** and must be narrowed immediately using schema validation (e.g., Zod).
- untyped string identifiers are **forbidden**

All code must be **fully statically typed** and **exhaustively checked**.

If a change cannot be expressed without weakening the type system,
**the architecture is incomplete and must be redesigned**.

Refactors must preserve a buildable state unless performing an explicitly declared staged migration.
Breaking type safety is not.

### **D. Identifier Quality & Rename Reporting**

When editing UI code, the agent must actively evaluate **identifier quality**.

If any variable, function, hook, component, or file name is:

- misleading
- overly generic
- lying about responsibility
- historically incorrect
- or drifting from its current role

the agent must **report it**, not silently rename it.

**Output (when landing/reviewing):**
Include a short section titled **“Rename Candidates”** containing:

- `currentName` → `recommendedName`
- One-line reason (scope drift, unclear intent, overloaded meaning, legacy name)

**Rules:**

- Do NOT perform renames unless explicitly instructed.
- Reporting is mandatory; renaming is optional and user-controlled.
- Missing obvious rename candidates in a landed/reviewed change is a spec violation.

This enables fast, safe batch renames by the user (VS Code / IDE).

---

### **Human-First Code**

Code must be written so a human can understand and edit it quickly.
Enforcement for structural constraints lives in §21, §0.3, and §5.

**Human Coding Guidelines (Default):**

- Prefer the simplest implementation that preserves established contracts.
- Prefer explicit names; keep identifiers short but not cryptic.
- Prefer small local functions and straight-line code with early returns when it improves readability.
- Prefer predictable data shapes (for example discriminated unions) over ad-hoc flag combinations.
- Avoid unnecessary TypeScript cleverness unless it prevents a real bug with a clearer contract.
- Avoid default/gratuitous `useMemo` / `useCallback` without a measured reason.
- Avoid speculative abstractions when a local implementation is clearer.
- If argument or prop surfaces indicate boundary leakage, redesign the boundary at the owning authority.

**Rationale comments (allowed, minimal):**

- Add short comments only when a decision is non-obvious and ties to an invariant/contract (“why”, not “what”).

### **E. God Object / God Component Prohibition (Hard Stop)**

Creation or expansion of **god objects, god components, or god modules** is **forbidden**.

A file is considered a god object/component if it:

- owns **multiple unrelated responsibilities**
- coordinates **orchestration + execution + presentation**
- grows by **accumulating logic instead of shedding it**
- becomes the default place to “just put one more thing”
- exposes a wide surface area that is not conceptually cohesive

**Mandatory constraints:**

- A change **may not increase** the responsibility surface of an already-large file.
- If a touched file is already overloaded, the change **must reduce** responsibility, even minimally.
- “We’ll clean it later” is **not permitted**.
- Replacing one large block with another large block in the same file is **not improvement**.

**Required behavior when risk is detected:**

The agent must do **at least one** of the following:

- Extract a responsibility into a hook, helper, or service
- Move orchestration out of the file
- Split the component/module along responsibility boundaries
- Narrow the public interface (fewer props, fewer exports, fewer effects)

**Explicitly forbidden justifications:**

- “This file already does a lot”
- “It’s the entry point”
- “Refactoring is out of scope”
- “It’s only one more case”

If a change would result in a file becoming *more central, more implicit, or more overloaded*,
the change **must be rejected or restructured**.

Failure to prevent god-object growth is a **spec violation**.

---

### **F. Approved Design Patterns & Placement Rules (Mandatory)**

When reducing responsibility or extracting logic, the agent **must use one of the approved patterns below**.
Inventing new architectural shapes or hybrid patterns is **not allowed** without explicit instruction.

#### **1. Orchestrator Hook (Control Plane)**

**Purpose:**
Owns **sequencing, retries, deduplication, gating, and multi-step workflows**.

---

#### **2. Domain Hook (Single Responsibility)**

**Purpose:**
Encapsulates **one domain concern** with minimal coordination.

---

#### **3. Service (Pure or Effectful, Non-React)**

**Purpose:**
Implements **business or domain logic** independent of React.

---

#### **4. Adapter (Edge / IO Boundary)**

**Purpose:**
Owns **external system interaction** (RPC, filesystem, native host, browser APIs).


---

#### **5. UI Component (Presentation Only)**

**Purpose:**
Render UI and forward **typed intents**.

**Rules:**

- No orchestration
- No engine calls
- No multi-step logic
- No control flow construction
- Emits intents, never effects

**Allowed:**

- local UI state
- visual conditionals
- calling orchestrator commands

---

### **Placement Rule (Hard)**

When extracting code:

| Logic Type                    | Must Go To   |
| ----------------------------- | ------------ |
| Sequencing / retries / gating | Orchestrator |
| Business rules                | Service      |
| IO / RPC / native calls       | Adapter      |
| View state                    | UI component |
| Cross-cutting decisions       | Orchestrator |

If logic does not clearly fit one category, **the architecture is incomplete**.
During WIP, park the code in the nearest owner (usually ViewModel/Orchestrator) with a `TODO(arch)` note.
Before landing/reviewing, resolve placement (amend this document if needed).

---

### **Anti-Patterns (Explicitly Forbidden)**

- “Smart components”
- Hooks that return flags instead of commands
- Boolean-driven control flow
- Files that both **decide** and **execute**
- “Helper” files that grow indefinitely
- Passing callbacks that close over engine state

---

---

# **17. Internationalization (Enforcement)**

- CI must fail if user-visible strings exist in UI code without `TODO(i18n)` or `t("…")`.

- All visible UI text must be referenced through `t("…")`.

- Work with `en.json` only. Ignore other translation files even if they exist.

- When a new UI string is needed:

  1. Add key/value to `en.json`.
  2. Use `t("key")` in the component.

- During iteration, inline English is allowed only as a temporary placeholder and must be prefixed with `TODO(i18n)` so it is easy to find.

- Before landing/reviewing, all inline placeholders must be moved to `en.json` and replaced with `t("…")`.

---

# **19. Other Rules**

1. Before reporting a task as completed, perform a review of the code and fix all important issues. Repeat until you are fully satisfied.

2. Before landing/reviewing a change, run `npm run build` and fix build errors if possible.

ABSOLUTE RULE: Never run git restore, git reset, git clean, or checkout -- without explicit confirmation. Preserve all local changes.

# **20. Enforced Operational Contracts (Tier 2)**

This section defines operational contracts derived from §21 for daily implementation.
If anything here conflicts with §21, §21 governs.

1. **Outcome-First Public Actions**  
   Public command surfaces return typed outcomes. Expected failures are data, not exception control flow.  
   See §21.12.

2. **Capability Resolution In Control Plane**  
   Capability detection happens once in control-plane owners and is published as explicit state.  
   See §21.2 and §21.5.

3. **Completed Contract Surfaces**  
   Public contracts must define success, failure, unsupported, and cancel/no-op outcomes.  
   Partial or silent contracts are invalid.  
   See §21.5 and §21.12.

4. **Shared UI State Arbitration**  
   Multi-surface UI state requires explicit ownership, conflict handling, and rejection semantics.  
   See §21.2, §21.3, and §21.12.


# **21. Architecture Invariants (Foundational — Hard Rules)**

These rules define the non-negotiable structural laws of the system.
All subsequent sections (UI, tokens, runtime, RPC, components, hooks)
are constrained by these invariants.


## **21.0 Architecture Invariants (Hard Rules; Prevent Refactors)**

These rules exist to prevent hidden coupling and accidental complexity.

### **21.1 Enforcement Clause (Hard)**

Any landed/reviewed change that violates a Hard Rule must be rejected. Refactors that introduce violations are regressions, not progress.
Violations are regressions, not tradeoffs.

If a rule blocks implementation, the rule must be amended first (in this document), not worked around.

### **21.2 Authority Rule (Hard)**

Every decision in the system must have exactly one authority.

- If a value influences behavior, a single named owner produces it.
- Logic must not infer behavior from identity, naming, environment, heuristics, or caller position.
- If authority is unclear, stop and define it before writing code.

### **21.3 Ownership Rule (Hard)**

All mutable state must declare an owner. The owner is responsible for creating, updating, resetting, and destroying that state.

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

If a piece of code "just knows" something, that knowledge is wrong.

- All knowledge must be requested from its authority, scoped to a lifecycle, and expressed via a contract.

### **21.7 System Configuration Consistency Rule (Hard)**

The system has exactly one configuration authority.

- All components, hooks, and controllers must read configuration from the same validated source (Context).
- Configuration is immutable after load.

Forbidden:

- Reading config files outside the provider
- Local defaults that diverge from the config authority
- Inferred behavior
- Environment-based branching inside components

If two components answer the same question differently, the architecture is already broken.

### **21.8 Context vs Parameter Rule (Hard)**

If a value has a Context owner, it must be read from Context at the point of use.

Threading context-owned values through function parameters is forbidden except for:

- testing
- boundary adapters

### **21.9 Refactor Smell Indicators**

A refactor is likely wrong if it causes:

- parameter lists to grow
- orchestrators to pass more data
- hooks to gain "environment" arguments
- behavior to depend on caller position

These indicate authority leakage.

### **21.10 Traceability Rule (Hard)**

A refactor is invalid if it increases execution-path indirection without reducing duplication, authority ambiguity, or contract duplication. A developer must be able to trace a user action across layers without encountering redundant wrapper layers.

### **Refactor Simplicity Gate**

A refactor must reduce at least one of the following:

* number of ownership boundaries crossed
* number of wrapper layers
* number of contract surfaces
* duplicated behavioral logic

If none are reduced, the refactor is invalid.

### **21.11 Indirection Budget Rule (Hard)**

New abstraction layers (wrappers, adapters, forwarding hooks) are permitted only if they eliminate duplicated logic, duplicated contracts, duplicated state, or divergent error semantics. Abstractions created solely for structural purity are forbidden.

### **21.12 Single Contract Surface Rule (Hard)**

For any operation domain there must be exactly one public contract surface exposed to the UI/control plane.

UI-facing command surfaces MUST return typed outcomes (per §20.1).
Exceptions may exist only internally and must be converted once at the boundary owner (ViewModel / orchestrator / service).

Providing parallel “throw” and “outcome” variants for the same operations is forbidden.


## **21.13 Integration-First & Ownership Gate (Hard)**

Before creating any new file, module, hook, service, model, constant set, or configuration surface, the implementer must first identify the canonical owner of the responsibility and extend that owner whenever the responsibility belongs to its lifecycle and authority.

A new file or module may be introduced only when:

- no valid ownership surface exists, **or**
- the responsibility is lifecycle-independent (pure domain logic, reusable primitive, or cross-feature algorithm), **or**
- extending the existing owner would create multi-responsibility ownership or materially increase authority-surface complexity.

Every newly introduced module must:

- declare explicit ownership and lifecycle consistent with §21 rules,
- have at least one immediate consumer at the time of introduction,
- demonstrably reduce duplication, responsibility overload, or execution-path complexity,
- and document the integration attempt explaining why the existing owner could not be extended without violating ownership or lifecycle boundaries.

Creation of parallel abstractions representing the same responsibility remains an architectural defect, and PRs introducing new surfaces without satisfying these conditions must be rejected.

**Enforcement Clause:**
Claims such as “cleaner,” “more modular,” or “better separation” are insufficient justification unless accompanied by explicit, verifiable evidence of duplication removal, ownership clarification, responsibility-surface reduction, or execution-path simplification.

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
