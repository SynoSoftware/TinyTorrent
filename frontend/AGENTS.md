
# **AGENTS.md — TinyTorrent Mission Specification**

**Purpose:**
Single authoritative reference for the architecture, UI/UX rules, design tokens, and development standards for **TinyTorrent** — a modern, world-class successor to µTorrent with a **VS Code–style workbench**.


---

# **1. Brand Identity**

TinyTorrent = **modern µTorrent** × **glass UI** × **Windows 11 acrylic polish** × **VS Code workbench**.

### Identity pillars

- **Speed:** No lag. No hesitation.
- **Stealth:** Dark-first visual identity (system mode respected automatically).
- **Zero Bloat:** Extremely small executable size.
- **World-Class Visuals:** Premium, jaw-dropping, and effortless. **Not compact—confident.**
- **Native HUD Feel:** Glass, blur, depth, minimal chrome.
- **Workbench, Not a Webpage:** Split panes, pinned inspectors, OS-level behavior.
- **Accessibility:** Controls must be visually clear, easy to target, and comfortable. Use intentional whitespace and large hit-targets to create a "premium tool" feel.
- **No duplicated semantics**
- **No hidden state**
- **No generic abstractions**
- **No opinionated workflows**

---

# **2. Absolute Clarification: Desktop Feel ≠ Compact UI**

**Compact UI is explicitly NOT a goal.** TinyTorrent is not a spreadsheet; it is a high-end command center.

### **The Density Rule (Authoritative)**
>
> **Density is achieved through information design, not UI shrinkage.**

- **Visual Excellence:** Bigger, confident controls. Large hit-targets that feel "expensive" and premium.
- **Avoid Fragility:** No "precision clicking." If a design choice shows more rows but makes the UI feel cramped, it is a design error.
- **Desktop Tool Feel:** This refers to **behavioral determinism** (shortcuts, selection, focus, right-click authority), not to the size of the buttons.
- **HeroUI:** HeroUI is our premium control layer. Its components must **never** be visually neutered or shrunk to appear "compact." Default or larger sizing is preferred.

---

## **2a. UI Scale System**

- All interactive element sizes are derived from central config and must respect Typography vs Geometry ownership (§2c).
- Do **not** use Tailwind pixel-based sizing classes (`w-5`, `h-6`, `text-[14px]`) directly.
- All sizing must reference scale tokens or semantic utility classes derived from config.

---

## **2b. No Magic Numbers**

All spacing, sizing, radius, and scale values must come from configuration tokens and not from inline constants or ad-hoc Tailwind values.

**UI must be consistent and controlled by a small set of shared knobs.** If a UI change requires a number and no suitable semantic token exists, the element must be left unchanged and flagged instead.

### **No-New-Numbers Rule**

This restriction applies to component TSX/CSS usage; introducing numbers is allowed only in `constants.json` and `index.css @theme` as part of the token pipeline.

When fixing zoom-related or css magic number issues:

- You may NOT introduce any new numeric literals (integers or floats), even inside `calc()`.
- You may NOT introduce Tailwind numeric geometry or spacing utilities in components:
  - **Forbidden:** `p-*`, `px-*`, `py-*`, `m-*`, `gap-*`, `space-*`, `w-*`, `h-*`, `text-*`, `leading-*`, `rounded-*`, `shadow-*`, `blur-*` when they encode a literal number.
  - **Forbidden:** bracket classes (arbitrary values) like `w-[...]`, `h-[...]`, `text-[...]`, `shadow-[...]`, `rounded-[...]`, `blur-[...]`, `max-w-[...]`, `min-w-[...]`, `border-[...]`.

- Replacements must use:

  - existing semantic tokens, or
  - existing primitives (`--u`, `--z`, `--fz`) *without introducing new coefficients*.

### **Consistency & Convergence Rule**

- Do NOT introduce one-off variables.
- If a numeric value represents a concept that appears more than once (width, padding, icon size, column size, max-width, etc.), it MUST map to a **single semantic variable**.
- Before introducing or using any variable, check whether an existing variable already represents the same meaning.
- If no such variable exists, DO NOT invent a new one — flag it instead.
- Multiple variables for the same semantic role are forbidden.

---

## **2c. Typography vs Geometry Ownership (Authoritative)**

TinyTorrent uses **two root primitives** with **non-overlapping responsibilities**.

This is NOT optional and NOT stylistic.

### **Typography-Owned (Derived from `--fz`)**

Typography tokens MUST be expressed as named CSS tokens in `@theme` (e.g. `--tt-text-body`, `--tt-icon`, `--tt-row`) and may use `--fz` in their arithmetic.

The following MUST scale with font size:

- Body text
- Table body text
- Numeric text (speeds, sizes, counts)
- Icon glyph size
- Label text
- Row height for data tables and lists

These elements must visually track readability.
If text grows, rows and icons must grow with it.

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

These elements define spatial rhythm and must remain stable relative to each other.

### **Hard Rule**

Composing typography tokens with geometry tokens in the same component is expected; the rule forbids deriving a single token from both systems.

No single CSS dimension token (height/width/padding/gap/font-size/line-height/icon-size) may be computed from both systems.

If an element requires both:

- Do NOT implement it.
- FLAG it as a missing semantic role.

### **Constraint Directionality**

Geometry-owned containers (Sidebars, Navs) impose **Hard Constraints**. If Typography content exceeds the Geometry container, the content must truncate or scroll—the container must **never** grow to fit the text. This preserves the "Command Center" layout stability.

### **§2d. Surface Ownership (Authoritative)**

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

# **3. Design System Authority & Token Pipeline**

This section defines the **Zero-Literal Mandate**. To maintain the "Confident Workbench" feel and ensure 100% harmonic scaling, all agents must strictly follow this pipeline.

## **A. The Knob Registry (Authoritative, Single Source of Truth)**

Theme and density configuration knobs are the **single source of truth** for all visual and layout decisions.

Any visual or layout change **MUST**:

- Consume an existing knob, or
- Introduce a new knob through the token pipeline.

Component-local visual tuning is forbidden.

**The only acceptable global knobs are:**

- **Unit:** `--u` (layout rhythm unit)
- **Zoom:** `--z` (layout scale multiplier)
- **Font scale:** `--fz` (readability scale)
- **Radius set:** a single semantic radius family (no competing radius systems)
- **Blur set:** Layer 1 + Layer 2 blur tokens only
- **Elevation set:** Layer 1 + Layer 2 shadow tokens only
- **Core structural sizes:** `h-nav`, `h-status`, `h-row` (and other structural sizes only if already part of the shell contract)
- **Core spacing roles:** `p-panel`, `p-tight`, `gap-stage`, `gap-tools`

Note: `--tt-font-base` is a theme token (length anchor), not a knob; it exists only to let `--fz` scale typography.

If a change requires another knob, do not implement it in component code — flag it and route it through the token pipeline.

## **B. The 4-Layer Token Pipeline**

No dimension or color may skip a layer.

1. **Intent (`constants.json`):** Defines logical units (e.g., `"padding_panel": 6`).
2. **Arithmetic (`index.css` @theme):** Performs scaling using ONLY root knobs:
   - Geometry: `calc(var(--u) * [units] * var(--z))`
   - Typography: `calc(var(--tt-font-base) * var(--fz) * [units])`

3. **Role (`logic.ts`):** Exports semantic strings (e.g., `export const PADDING_PANEL = "p-panel"`).
4. **Application (`.tsx`):** Uses the semantic class. **Literal numbers are forbidden here.**

## **C. The "Banned" vs. "Required" List**

| Category | **BANNED (Drift)** | **REQUIRED (Desired State)** |
| :--- | :--- | :--- |
| **Sizing** | `size="sm"`, `size="xs"` | `size="md"` (Default), `size="lg"` |
| **Spacing** | `p-1...16`, `gap-1...16` | `p-panel`, `p-tight`, `gap-stage`, `gap-tools` |
| **Geometry** | `h-16`, `h-[56px]`, `w-64` | `h-nav`, `h-status`, `h-row`, `w-sidebar` |
| **Brackets** | `h-[calc(...)]`, `w-[...]` | Named CSS tokens in `@theme` |
| **Safety** | `z.any()` in RPC | `zRpcMutationResponse` or specific schemas |
| **Buttons** | `variant="flat"` (Primary) | `variant="shadow"` (Primary/Action) |

## **D. DRY Classname Rule (Stop Repeating Glass Recipes)**

Repeating long Tailwind strings is a bug. Any visual recipe used in more than one place must be centralized.

**Must be centralized if repeated or longer than a short layout skeleton:**

- Glass surfaces (Layer 1, Layer 2)
- Panel frames (border + blur + background)
- Focus ring / focus border treatment
- Table row base/hover/selected recipes
- Toolbar button clusters
- Badge/chip recipes

**Rule:**

- If a class string is repeated twice (or is a long “recipe”), it must become a shared constant/token exported from a single place (config logic or shared UI primitive).
- Components must assemble UI from semantic pieces: `cn(GLASS_PANEL, P_PANEL, FOCUS_RING, className)` not bespoke class soup.

## **E. Forensic Mapping Rules**

When modifying layout, you must categorize every spacing decision into a **Logical Role**:

- **Panel Padding (`p-panel`):** Interior of any GlassPanel, Card, or Modal.
- **Tight Padding (`p-tight`):** Interior of menus, chips, badges, or list-items.
- **Stage Gap (`gap-stage`):** The major spacing between split panels/parts.
- **Tool Gap (`gap-tools`):** Small spacing between buttons, inputs, or tabs.
- **Structure:** `h-nav`, `h-status`, `h-row` (strictly for the main layout bars).

## **F. The Scale Test (Pre-Commit Requirement)**

Before submitting any UI code, the agent must perform a "Mental Scale Test":
 *"If I change `--u` from `4px` to `8px` in index.css, will my new code expand proportionally and maintain its internal alignment?"*

- If **Yes**: Proceed.
- If **No**: You used a magic number or a hardcoded Tailwind utility. **Delete it.**

Additionally:

- Increasing `--fz` must improve readability without breaking layout.
- Increasing `--z` must expand layout without making text unreadable.
- If both are required to fix an issue, the design is wrong and must be flagged.

## **G. Single Place of Control**

If a component requires a specific width (e.g., the Directory Picker), do not calculate it in the TSX.

1. Add the unit to `constants.json`.
2. Map it to a token in `index.css` (e.g., `--tt-dir-picker-w`).
3. Use the token in the component (`w-dir-picker`).

## **H. Allowed Tailwind Whitelist (Components)**

Tailwind is allowed only for non-token structural composition:

**Allowed:**

- `flex`, `grid`, `items-*`, `justify-*`, `grow`, `shrink`, `min-h-0`, `min-w-0`
- `relative`, `absolute`, `sticky`, `inset-0` (no numeric geometry)
- `overflow-hidden`, `overflow-auto`, `truncate`, `whitespace-*`
- `select-none`, `select-text`
- `pointer-events-*`, `cursor-*`
- Responsive variants (`sm:`, `md:` etc.) only when they reference semantic utilities (not numeric ones)

**Not allowed in components (must be semantic tokens instead):**

- spacing, sizing, radius, shadows, blur, typography sizes, arbitrary bracket expressions, or any numeric geometry.

## **I. Missing Token Protocol (Mandatory)**

When a needed semantic token does not exist, the agent must:

1. Not implement the tweak using literals in the component.
2. Add a **FLAG** comment describing the missing semantic role.
3. Propose the token addition strictly through the pipeline:
   - `constants.json` intent
   - `index.css` @theme arithmetic
   - `logic.ts` role export
   - component usage

No workaround is acceptable.

## **J. Z-Index Authority**

`z-index` literals are forbidden. Use semantic z-tokens only:

- `--z-floor` (0)
- `--z-panel` (10)
- `--z-sticky` (20)
- `--z-overlay` (30)
- `--z-modal` (40)
- `--z-toast` (50)
- `--z-cursor` (999)

These must be defined in `constants.json`.

---

# **4. Theming & Semantic Tokens**

This section defines non-negotiable UI constraints and is subject to §5 enforcement.

**Mandatory:**
Use **HeroUI semantic tokens** everywhere.

### **The Layered Depth System (Semantic Glass)**

We use Tailwind's opacity modifier (`/opacity`) on HeroUI tokens. This preserves semantic color (light/dark aware) while applying glass transparency.

| Layer       | Surface                      | Tokens                                                                        |
| :---------- | :--------------------------- | :---------------------------------------------------------------------------- |
| **Layer 0** | App Background (Shell)       | `bg-background` + subtle noise texture (2–4% opacity), defined via config     |
| **Layer 1** | Panels / Tables              | `backdrop-blur-md` + `bg-background/60` + `border-default/10`                 |
| **Layer 2** | Modals / Popovers / Floating | `backdrop-blur-xl` + `bg-content1/80` + `shadow-medium` + `border-default/20` |

**Rule:**
Every "Glass" layer (Layers 1 & 2) must have a subtle border (`border-default/xx`) to define its edge. Using `border-default` ensures the border is dark in Light Mode and light in Dark Mode automatically.

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

**Mandatory:** Light/dark mode must work flawlessly.

**Use:**

- `var(--heroui-background)`
- `var(--heroui-content1)`
- `var(--heroui-foreground)`
- `var(--heroui-primary)`
- `var(--heroui-default)` (for borders/dividers)
- Tailwind utilities only when they wrap these semantic tokens.

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

# **5. UI Consistency Enforcement (Non-Negotiable)**

**Applies to all UI, including §§2, 3, 4, and 8**

## **A. Consistency Contract**

UI must remain stable under knob changes. Agents must treat the design system like an API.

If a change causes any of these, it is a failure:

- One view scales differently than another when `--u`, `--z`, or `--fz` changes.
- Two panels that should match use different padding/gap/row height semantics.
- Similar controls look “nearly the same” but differ due to local class tweaks.

## **B. Pre-Commit Checklist (Mandatory)**

Before claiming UI work is done, verify:

- Token-only geometry: no numeric Tailwind utilities or bracket classes were added.
- No duplicates: the same concept uses the same token everywhere (row height, panel padding, tool gaps).
- DRY: no repeated “glass recipe” strings; shared recipes are centralized.
- Scale test: changing `--u` (4→8) and `--z` (1→1.25) would scale everything harmonically.
- Typography scaling and layout scaling were not conflated.

Any PR containing forbidden numeric Tailwind/bracket classes is invalid and must be rewritten.

## **C. Agent Output Requirement**

When an agent changes UI, it must include a short “Token Mapping” note in the PR message:

- Which semantic roles were used (e.g., `p-panel`, `gap-stage`, `h-row`, glass layer token)
- Whether any new token was required
- If required but missing → must be flagged, not hacked

---

# **6. Architecture**

**Frontend Core Philosophy:**
The front end is a UI that runs for a single purpose: to control the daemon that runs with it, on the same machine; it is normally packed together with the exe and must not bother the user with UI connecting to some other server. we are allowing connections to another server just for debug/convenience but only as long as it doesn't interfere with the main design. Although the web technology is designed for client-server connection this app is not to be thought like that. it must not implement code that cause restrictions of features that a native UI in windows would have. the choice of this technology is for final exe size not for the client-server connection design of the web. the architecture: tray UI (access to native windows dialog) - daemon transfer server (minimal memory requirements running in background) - and UI in web browser (so we don't have to ship QT or other frameworks) is designed for smallest exe size and properly designed allows any feature that a native windows app can take. we must always have in mind what we try to achieve and not compromise the final purpose.

### **Stack:**

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** TailwindCSS v4 + HeroUI (Premium Control Layer)
- **Motion:** Framer Motion — required for all interactive state changes (layout, sorting, drag). Complex components must use motion to express structure.
- **Drag & Drop:** `react-dropzone` (full-window detection)
- **Icons:** Lucide (tree-shaken)
- **State:** React Hooks; Zustand only when truly necessary
- **Data/Validation:** **Zod** is mandatory for all RPC boundaries. Never trust the backend blindly.
- **Virtualization:** `@tanstack/react-virtual` is **mandatory** for any list > 50 items (Torrents, Files, Peers).
- **Command Palette:** `cmdk` for keyboard-driven navigation (`Cmd+K`).
- **Layout Engine:** `react-resizable-panels` (**CRITICAL**). This library provides the VS Code–like split-pane behavior (smooth resizing, min/max constraints, collapsing).
- **Window Controls:** Custom Titlebar implementation (frameless window).
- **Context:** `React Context` for global focus tracking (e.g., `FocusContext`: is the user in the Table, the Search, or the Inspector?).

---

## **§6a. Frontend Runtime Model (Authoritative)**

**TinyTorrent’s frontend is not a client in a client–server product.**

It is a **local UI** whose **single purpose** is to control the **local daemon it ships with**, running on the **same machine**, as part of one product.

The default and primary runtime model is:

- UI ↔ daemon
- local
- trusted
- no network concepts exposed to the user

Remote connections are allowed **only** for debugging or convenience and must **never**:

- alter core behavior
- reduce available features
- influence UX decisions
- impose artificial limitations

If a feature behaves differently because the server is “remote”, that is a **design error**.

---

### **Web Technology Is an Implementation Detail**

Web technology is used **only** to:

- minimize final executable size
- avoid shipping heavy UI frameworks (Qt, GTK, etc.)

It does **not** define the product model.

TinyTorrent must **not** be designed as:

- a web app
- a browser-constrained client
- a network-first system

Web-related limitations must **not** restrict features that a native Windows UI would reasonably have.

If a native Windows UI can do something, **TinyTorrent must be able to do it**.

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

### **The "Tool" Interaction Model**

TinyTorrent is an **OS-level tool**, not a webpage.

1. **OS-Style Selection**

    - Click = Select single
    - Ctrl/Cmd + Click = Add to selection
    - Shift + Click = Range selection
    - Right Click = Context Menu (acting on **all** selected items)

2. **Optimistic UI**

    - Actions (Pause, Start, Delete) must reflect in the UI **instantly**.
    - Do not wait for the RPC roundtrip. Revert only if the RPC errors.

3. **The "Viewport" Rule**

    - `body` and `#root` must be `h-screen w-screen overflow-hidden`.
    - The window **never** has a scrollbar.
    - Only specific panels (Table, Inspector, long lists) have internal scrollbars.
    - **Overlay Scrollbars Only:** Default OS scrollbars are forbidden inside panes. All scrollable areas must use a custom, overlay-style scrollbar (thin, rounded, transparent track, semi-opaque thumb) that sits *on top* of the content layer to prevent layout shifts when content changes length.

4. **Selection vs Text**

    - Global default: `user-select: none;` (the app behaves like UI, not a document).
    - Exception: specific text fields (hash, file paths, error logs, tracker URLs) explicitly allow selection (`select-text`).

5. **Cursor Discipline**

    - Never show the I-beam cursor unless hovering an editable input/textarea.
    - Standard interaction zones use `cursor-default` or `cursor-pointer`.

---

### **Focus Model (VS Code–Style)**

- Only **one Part** (Main, Inspector) holds "active focus" at a time.
- Arrow keys, PageUp/PageDown, Home/End operate on the **active Part** only.
- Switching Parts updates the global `FocusContext`.
- The active Part must show a subtle focus border using HeroUI tokens (no custom colors).
- `Escape` clears selection within the active Part but does **not** change which Part is active.

---

### **Zero Friction**

Every interaction must be:

- Physically obvious
- Reversible
- Continuous
- Consistent with a professional workbench tool

Complex widgets must behave like a **workspace**:

- zoomable
- pannable
- resizable
- draggable
- comparable
- reorderable
- state-aware
- motion-coherent

---

### **Interaction Principles**

- Full-window drop zone with animated overlay.
- Auto-paste for magnet links (detect & parse from clipboard).
- Context menus everywhere (rows, inspector areas).
- Keyboard-first for core actions.
- Continuous feedback — no dead states.
- Minimal chrome, maximal clarity.
- No click-hunting — controls appear where they’re needed.

---

### **Motion**

Motion clarifies structure; it is not decoration.

- Lists use `framer-motion`'s `layout` prop so rows glide into place when sorted/filtered.
- Buttons: micro-scale + subtle color shift on hover/press.
- Icons: task-specific motion (subtle spin for "checking", pulse for "active", etc.).
- Rows: animate on reorder/selection.
- Progress bars: smooth transitions, never jumpy.
- Modals: fade + slide + depth bloom (Layer 2).
- Overlays: opacity + blur transitions.
- Workbench zoom/pan: eased, continuous.

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

### **Buttons**

- Primary = `variant="shadow"` (HeroUI)
- Secondary = `light` / `ghost`
- Toolbar commands = icon-only buttons
- All buttons must animate on hover/press (scale + shadow or background)

---

### **Drag & Drop Overlay**

- Full-window detection via `react-dropzone`
- Glass layer with kinetic fade-in
- Bold “Drop to Add Torrent” text (localized)
- Dims background but keeps context visible
- Cancels instantly on drag-out

---

### **Iconography (Lucide)**

- Icons as data:

  - Play/Pause/Stop/Check for state
  - Arrows for priority/up/down
  - Filetype icons for files

- Icons must always use semantic colors via HeroUI tokens.
- Icon sizing is driven by the global UI scale config, not hard-coded pixel sizes.

---

### **Workspace Components**

Any component that presents data visually (e.g., peer map, bandwidth graphs) must behave like a **workspace**:

- Smooth zoom (scroll wheel / pinch)
- Smooth pan (click-drag)
- Reset view control
- Motion-driven transforms for transitions

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

## **Layout Implementation Strategy**

- The **main application layout** is built entirely using `react-resizable-panels`.
- Flexbox/Grid is allowed **inside views**, not for structuring Parts.
- Every Part (Main, Inspector) maps to a Pane.
- Panes never unmount; collapse → size 0, expand → restore last size.
- Handles are invisible until hovered, then show a 1 px separator line.
- Pinning = assigning a non-zero `defaultSize` or `minSize`.
- Unpinning = collapsing the pane back to size 0.

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

- Virtualization mandatory for lists > 50 items.
- No console noise.
- No unused imports.
- Strict TypeScript everywhere.
- Minimal bundle size.
- Clean build (`npm run build` must pass).
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

All agents operate as **tool-UI designers**, not marketing site designers.

TinyTorrent must deliver **Adaptive Excellence**:

- **Unified Professional Interface**

  - Single visual mode: Modern glass/blur workbench.
  - Functionality remains dense and keyboard-friendly.
  - Split-pane view: Details via Inspector, not popup chaos.

- **Professional Tool, Not a Webpage**

  - Behavior is deterministic and precise.
  - Controls remain visually expressive and easy to target.
  - Respect old µTorrent/Transmission muscle memory, but deliver a fluid, modern workbench.
  - **Jaw-Dropping Aesthetics:** The app must look better than any desktop tool ever has.

---

# **14. Architectural Principles (Mandatory)**

- **HeroUI governs controls (buttons, inputs, menus).**
    The **Workbench Shell** (titlebar, panels, splitters, chrome, glass layers) is 100% custom.
    Tailwind + Motion define all shell surfaces, transitions, and layout behavior.
    No external UI frameworks beyond HeroUI + `react-resizable-panels`.

- **One responsibility per unit.**
    Every component, hook, and module does exactly one thing.

- **Pure UI.**
    Components render. They don’t fetch, store, or decide business rules.

- **Hard layer boundaries.**
    Data flows: RPC → services → state/hooks → components.
    Never backwards, never sideways.

- **Typed reality, not guesses.**
    Data structures match real RPC shapes exactly.

- **No magic.**
    No hidden behaviors, no unexplained values, no silent side effects.

- **Replaceable building blocks.**
    Every UI piece should be swappable without breaking unrelated parts.

- **Local state first.**
    Global state only when multiple distant parts truly need it.

- **Deterministic behavior.**
    No randomness, no implicit rules. Everything explicit.

- **Code must age well.**
    Every change should increase clarity, not decrease it.

- **Don’t reinvent solved problems.**
    Use libraries with purpose; avoid both legacy junk and unnecessary reinvention.

## **Single Control Plane Rule (Non-Negotiable)**

TinyTorrent has **exactly one place where behavior happens**.

### **Principle**

> **UI may render state and emit intents.
> It may never carry behavior, sequencing, or authority.**

### **Implications**

- **No prop drilling for behavior**

  - No `onResume`, `onRetry`, `onRecover`, `onSetLocation`, etc.
  - UI components and layouts do not forward callbacks.
- **No implicit control flow**

  - No effects or handlers that “decide” what should happen.
- **No engine or recovery logic outside the control plane**

  - If it talks to the engine, sequences steps, dedupes, retries, or gates → it belongs in the control plane.

### **Allowed data flow**

```
UI → Intent → Control Plane → Services
UI ← Signals ← Control Plane
```

Anything outside this flow is architectural drift.

### **Enforcement heuristic**

If removing a prop or moving a component causes behavior to break,
**that behavior was in the wrong place.**

Fix ownership, not wiring

---

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
|   |   \-- hooks.ts                 # All local hooks for this module
|   |
|   \-- settings/
|       |-- SettingsModal.tsx
|       \-- hooks.ts
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
````

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

- Folders exist only if they contain meaningful code.
- Delete any folder that becomes empty.

---

# **16. Coding Standards**

These guarantee consistency and prevent drift.

---

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

## **3. Component Shape**

Order inside a component file:

1. Imports
2. Zod schemas (if local validation is needed)
3. Types/Interfaces
4. Hooks
5. Implementation
6. Export

---

## **4. Service Isolation**

- UI never calls `fetch` directly.
- UI → hooks → service adapters → Zod → network.

---

## **5. Indentation & Hygiene**

- 4-space indentation.
- No empty folders.
- Delete unused files immediately.

## **6. Absolute Import Policy (Mandatory)**

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



## **7 Incremental Architecture & Naming Improvement Rule (Mandatory)**

This rule enforces **local improvement**, not global refactoring.

**Scope:**
Applies only to files and components that are **touched by the current change**.

### **A. Incremental Architecture Improvement**

If an edited file already violates any of the following:

- multiple responsibilities
- mixed concerns (UI + data shaping, UI + fetching, UI + layout orchestration)
- god-components (too many unrelated props, effects, or render branches)

then the agent must **reduce the violation**, even if only slightly.

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
Breaking compilation is acceptable. Breaking type safety is not.

---

### **C. Strict Typing (Hard Rule — Global)**

In all **new or modified code**, without exception:

- `Any` is **forbidden**
- `unknown` is **forbidden**
- untyped string identifiers are **forbidden**

All code must be **fully statically typed** and **exhaustively checked**.

If a change cannot be expressed without weakening the type system,
**the architecture is incomplete and must be redesigned**.

Breaking compilation is acceptable.
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

**Mandatory output:**
Include a short section titled **“Rename Candidates”** containing:

- `currentName` → `recommendedName`
- One-line reason (scope drift, unclear intent, overloaded meaning, legacy name)

**Rules:**

- Do NOT perform renames unless explicitly instructed.
- Reporting is mandatory; renaming is optional and user-controlled.
- Missing obvious rename candidates is a spec violation.

This enables fast, safe batch renames by the user (VS Code / IDE).

---

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

If logic does not clearly fit one category, **the architecture is incomplete** and the change must stop.

---

### **Anti-Patterns (Explicitly Forbidden)**

- “Smart components”
- Hooks that return flags instead of commands
- Boolean-driven control flow
- Files that both **decide** and **execute**
- “Helper” files that grow indefinitely
- Passing callbacks that close over engine state


---

# **17. Internationalization (Enforcement)**

- No hard-coded English anywhere in the codebase.

- All visible UI text must be referenced through `t("…")`.

- Work with `en.json` only. Ignore other translation files even if they exist.

- When a new UI string is needed:

  1. Add key/value to `en.json`.
  2. Use `t("key")` in the component.

- Agents must never output inline English text in JSX/TSX.

- If a string appears inline, it must be moved to `en.json` automatically.

---

# **18. Final Authority Rule**

When in doubt, the agent must ask:

> **"Does this make the app feel more powerful, more confident, and more jaw-dropping?"**

- If the answer is "It saves space" or "It looks compact," **reject it**.
- If the answer is "It feels premium, cinematic, and authoritative," **accept it**.

**One-Line North Star:**
TinyTorrent must behave like a desktop tool and look better than desktop tools ever have.

---

# **Other Rules**

1. Before reporting a task as completed, perform a review of the code and fix all important issues. Repeat until you are fully satisfied.

2. Run `npm run build` and fix build errors if possible.

3. The build machine is Windows. Linux commands are available via msys

4. Extra Windows executables available: `rg`, `fd`, `bat`.

5. For code search, never use `Select-String`. Always use ripgrep:

   - `rg -n -C 5 "<pattern>" <path>`

6. Never write complex or nested shell one-liners. If a command requires tricky quoting or multiple pipes, move it into a script file instead. All commands must be simple, cross-platform, and Windows-safe.

ABSOLUTE RULE: Never run git restore, git reset, git clean, or checkout -- without explicit confirmation. Preserve all local changes.
