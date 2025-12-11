# **AGENTS.md — TinyTorrent Mission Specification**

**Purpose:**
Single authoritative reference for the architecture, UI/UX rules, design tokens, and development standards for **TinyTorrent** — a modern, world-class successor to µTorrent with a **VS Code–style workbench**.

---

# **1. Brand Identity**

TinyTorrent = **modern µTorrent** × **glass UI** × **Windows 11 acrylic polish** × **VS Code workbench**.

### Identity pillars:

-   **Speed:** No lag. No hesitation.
-   **Stealth:** Dark-first visual identity (system mode respected automatically).
-   **Zero Bloat:** Extremely small executable.
-   **World-Class Visuals:** Premium, clean, and effortless.
-   **Native HUD Feel:** Glass, blur, depth, minimal chrome.
-   **Workbench, Not a Webpage:** Split panes, pinned inspectors, OS-level behavior.
-   **Accessibility:** Controls must be visually clear, easy to target, and comfortable for less-technical users without compromising professional data density.

---

# **2. Architecture**

-   **Frontend:** React 19 + TypeScript + Vite
-   **Styling:** TailwindCSS v4 + HeroUI
-   **Motion:** Framer Motion — required for all interactive state changes (layout, sorting, drag). Complex components must use motion to express structure.
-   **Drag & Drop:** `react-dropzone` (full-window detection)
-   **Icons:** Lucide (tree-shaken)
-   **State:** React Hooks; Zustand only when truly necessary
-   **Data/Validation:** **Zod** is mandatory for all RPC boundaries. Never trust the backend blindly.
-   **Virtualization:** `@tanstack/react-virtual` is **mandatory** for any list > 50 items (Torrents, Files, Peers).
-   **Command Palette:** `cmdk` for keyboard-driven navigation (`Cmd+K`).
-   **Layout Engine:** `react-resizable-panels` (**CRITICAL**). Do not attempt to write custom drag-handle logic. This library provides the VS Code–like split-pane behavior (smooth resizing, min/max constraints, collapsing).
-   **Window Controls:** Custom Titlebar implementation (frameless window).
-   **Context:** `React Context` for global focus tracking (e.g., `FocusContext`: is the user in the Table, the Search, or the Inspector?).

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

## **UI Scale System**

-   All interactive element sizes (icons, hit areas, paddings) are derived from central config.
-   Do **not** use Tailwind pixel-based sizing classes (`w-5`, `h-6`, `text-[14px]`) directly.
-   All sizing must reference scale tokens or semantic utility classes derived from config.

---

# **3. Theming & Semantic Tokens**

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

-   **Layer 0 (App Shell):**

    -   Transparency should allow OS window material to show through if supported (Mica-like effect).
    -   Fallback colors and noise parameters are defined centrally in `config/constants.json`; no inline hex in JSX/TSX.
    -   The app background must visually read as "Chrome Gray", not pure white/black. Content tables sit **on top** using `bg-background`.

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

-   `var(--heroui-background)`
-   `var(--heroui-content1)`
-   `var(--heroui-foreground)`
-   `var(--heroui-primary)`
-   `var(--heroui-default)` (for borders/dividers)
-   Tailwind utilities only when they wrap these semantic tokens.

**Avoid:**

-   Custom hex / rgb colors in JSX/TSX
-   Tailwind named colors (`bg-slate-900`, etc.)
-   Hard-coded `border-white` / `border-black` (breaks theme switching)
-   Manual `rgba()` color calculations

All shell-level constants (fallback grays, noise strength, etc.) live in `config/constants.json`, never inline.

---

## **No Magic Numbers**

All spacing, sizing, radius, and scale values must come from configuration tokens and not from inline constants or ad-hoc Tailwind values.

### **Aesthetic**

-   Detect system dark/light mode and use it automatically; fallback = Dark.
-   Detect system/browser language and use it; fallback = English.
-   Glass layers (backdrop-blur) for all UI surfaces that float or overlay.
-   Controls (buttons, icons, chips) use enlarged visual size and comfortable hit areas to improve usability without inflating layouts.
-   Strong typography hierarchy (Swiss style).
-   Layered shadows used sparingly for depth — never decoration.

---

# **4. UI/UX Philosophy**

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

4. **Selection vs Text**

    - Global default: `user-select: none;` (the app behaves like UI, not a document).
    - Exception: specific text fields (hash, file paths, error logs, tracker URLs) explicitly allow selection (`select-text`).

5. **Cursor Discipline**

    - Never show the I-beam cursor unless hovering an editable input/textarea.
    - Standard interaction zones use `cursor-default` or `cursor-pointer`.

---

### **Focus Model (VS Code–Style)**

-   Only **one Part** (Main, Inspector) holds "active focus" at a time.
-   Arrow keys, PageUp/PageDown, Home/End operate on the **active Part** only.
-   Switching Parts updates the global `FocusContext`.
-   The active Part must show a subtle focus border using HeroUI tokens (no custom colors).
-   `Escape` clears selection within the active Part but does **not** change which Part is active.

---

### **Zero Friction**

Every interaction must be:

-   Physically obvious
-   Reversible
-   Continuous
-   Consistent with a professional workbench tool

Complex widgets must behave like a **workspace**:

-   zoomable
-   pannable
-   resizable
-   draggable
-   comparable
-   reorderable
-   state-aware
-   motion-coherent

---

### **Interaction Principles**

-   Full-window drop zone with animated overlay.
-   Auto-paste for magnet links (detect & parse from clipboard).
-   Context menus everywhere (rows, inspector areas).
-   Keyboard-first for core actions.
-   Continuous feedback — no dead states.
-   Minimal chrome, maximal clarity.
-   No click-hunting — controls appear where they’re needed.

---

### **Motion**

Motion clarifies structure; it is not decoration.

-   Lists use `framer-motion`'s `layout` prop so rows glide into place when sorted/filtered.
-   Buttons: micro-scale + subtle color shift on hover/press.
-   Icons: task-specific motion (subtle spin for "checking", pulse for "active", etc.).
-   Rows: animate on reorder/selection.
-   Progress bars: smooth transitions, never jumpy.
-   Modals: fade + slide + depth bloom (Layer 2).
-   Overlays: opacity + blur transitions.
-   Workbench zoom/pan: eased, continuous.

---

# **5. Component System**

### **Core**

-   HeroUI for controls
-   Sticky blurred header
-   Monospace font for numbers/speeds
-   Sans-serif for names/labels
-   Thin, minimal progress bars
-   Optional sparkline SVGs allowed
-   No row flicker on updates
-   Row-level motion for selection, hover, reorder

---

### **Tables & Grids (Implementation Strategy)**

Do not build a "God Component".

-   **Dashboard Grid (`Dashboard_Grid.tsx`)**

    -   Heavy
    -   Virtualized
    -   Supports row drag & drop (queue management)
    -   Marquee selection
    -   Optional sparklines

-   **Details Grid (`SimpleVirtualTable.tsx`)**

    -   Light
    -   Virtualized
    -   Sorting only
    -   Used for Files/Peers

---

### **Modals**

-   Instant autofocus on primary field
-   Layer 2 visuals (blur + depth shadow)
-   Framer Motion transitions
-   Must feel like floating panels inside a HUD
-   No heavy chrome, no wasted margins

**Usage Rule:**

-   Modals are **only** for blocking actions:

    -   Add Torrent
    -   Settings
    -   Confirm Delete (and similar destructive actions)

-   **Never** use modals for passive data viewing (details, peers, files). These belong in the **Inspector Pane**.

---

### **Buttons**

-   Primary = `variant="shadow"` (HeroUI)
-   Secondary = `light` / `ghost`
-   Toolbar commands = icon-only buttons
-   All buttons must animate on hover/press (scale + shadow or background)

---

### **Drag & Drop Overlay**

-   Full-window detection via `react-dropzone`
-   Glass layer with kinetic fade-in
-   Bold “Drop to Add Torrent” text (localized)
-   Dims background but keeps context visible
-   Cancels instantly on drag-out

---

### **Iconography (Lucide)**

-   Icons as data:

    -   Play/Pause/Stop/Check for state
    -   Arrows for priority/up/down
    -   Filetype icons for files

-   Icons must always use semantic colors via HeroUI tokens.
-   Icon sizing is driven by the global UI scale config, not hard-coded pixel sizes.

---

### **Workspace Components**

Any component that presents data visually (e.g., peer map, bandwidth graphs) must behave like a **workspace**:

-   Smooth zoom (scroll wheel / pinch)
-   Smooth pan (click-drag)
-   Reset view control
-   Motion-driven transforms for transitions

---

## **5a. The Workbench Layout (Panel Strategy)**

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

        - Invisible 4 px hover target
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

## **5b. Workbench Model (VS Code Architecture)**

TinyTorrent adopts a simplified VS Code workbench structure:

-   **Part** → major region (Main, Inspector)
-   **Container** → persistent layout node that holds one or more panes
-   **Pane** → resizable element managed by `react-resizable-panels`
-   **View** → React component rendered inside a pane (e.g., TorrentGridView, FilesView, PeersView)

**Rules:**

-   Parts never unmount.
-   Containers always exist, even when collapsed to size 0.
-   Views may change or be swapped, but their hosting pane stays mounted.
-   All resizing, collapsing, and restoring happens at the **Pane** level.

This model guarantees IDE-like continuity: stable scroll state, predictable focus, and zero layout pop-in.

---

## **Layout Implementation Strategy**

-   The **main application layout** is built entirely using `react-resizable-panels`.
-   Flexbox/Grid is allowed **inside views**, not for structuring Parts.
-   Every Part (Main, Inspector) maps to a Pane.
-   Panes never unmount; collapse → size 0, expand → restore last size.
-   Handles are invisible until hovered, then show a 1 px separator line.
-   Pinning = assigning a non-zero `defaultSize` or `minSize`.
-   Unpinning = collapsing the pane back to size 0.

---

# **6. RPC Layer (Protocol Strategy)**

TinyTorrent is in a **Transition Phase**.

1. **Current Backend:** Standard `transmission-daemon` (official).
2. **Target Backend:** Custom `libtorrent`-based daemon that mimics the Transmission RPC interface exactly, plus extensions.

---

## **Connection Strategy: "The Adaptive Client"**

The frontend runs on a **dual transport**:

1. **Baseline (HTTP Polling)**

    - Mandatory for MVP.
    - The app must fully function using standard HTTP RPC calls (POST to `/transmission/rpc`).
    - Compatible with stock Transmission.
    - Polling interval is adaptive (e.g., 2s in table view, 5s in background).

2. **Upgrade Path (Server-Push / WebSocket)**

    - If backend identifies as "Standard Transmission", client stays in **HTTP Polling** mode.
    - If backend identifies as "TinyTorrent" engine, client upgrades to **Server-Push (event-driven)** mode.
    - In push mode, client stops polling; server pushes state deltas via WebSocket.

---

## **Design Rules**

-   **Transmission RPC is the Law**
    Use Transmission RPC spec for everything (Session, Stats, Torrent Get/Set). No custom protocol for base operations.

-   **Zod at the Gate**
    All incoming data is validated. If the future libtorrent daemon sends malformed Transmission DTOs, Zod must catch it before it reaches UI.

-   **EngineAdapter Interface**
    UI components are backend-agnostic and call `adapter.getTorrents()`, `adapter.getDetails(id)`, etc.

    -   Now: adapter uses `fetch('/transmission/rpc')`.
    -   Future: adapter may receive pushed frames, but the UI contract is unchanged.

---

## **Data Handling**

-   Strictly typed — use `transmission-rpc-typescript` types (or equivalent) as source of truth.
-   Even over HTTP polling, use `ids` to request only changed torrents.
-   Prefer **delta updates** to keep standard daemon load minimal.

---

# **7. Internationalization (Stack Level)**

-   i18next
-   Only `en.json` is required for MVP.
-   All text must come from translation keys — no exceptions.

---

# **8. Quality & Performance Standards**

### Requirements

-   Virtualization mandatory for lists > 50 items.
-   No console noise.
-   No unused imports.
-   Strict TypeScript everywhere.
-   Minimal bundle size.
-   Clean build (`npm run build` must pass).
-   Visually consistent, dark-mode-first UI with correct light mode.

### Rendering

-   Efficient row-level updates (selectors + fine-grained subscriptions).
-   Minimized unnecessary React re-renders.
-   No layout thrash (no repeated sync `measure → mutate` chains).

---

# **9. MVP Deliverables**

1. Glass App Shell (Layered Depth System).
2. Dashboard Grid (Virtual, Sortable, Queue-Draggable).
3. Details Tables (Virtual, Sortable — Files/Peers).
4. Hybrid RPC Layer (Transmission Base + Zod + WS-ready adapter).
5. Add Torrent Modal (Magnet/File/Text).
6. Context Menus (Start, Pause, Delete, "Open Folder", etc.).
7. Command Palette (Cmd+K).
8. Tray Integration Stub (UI triggers to native daemon/tray).

---

# **10. UX Excellence Directive**

All agents operate as **tool-UI designers**, not marketing site designers.

TinyTorrent must deliver **Adaptive Excellence**:

-   **Unified Professional Interface**

    -   Single visual mode: Modern glass/blur workbench.
    -   Functionality remains dense and keyboard-friendly.
    -   Split-pane view: Details via Inspector, not popup chaos.

-   **Professional Tool, Not a Webpage**

    -   Behavior is deterministic and precise.
    -   Controls remain visually expressive and easy to target.
    -   Respect old µTorrent/Transmission muscle memory, but deliver a fluid, modern workbench.

---

# **11. Architectural Principles (Mandatory)**

-   **HeroUI governs controls (buttons, inputs, menus).**
    The **Workbench Shell** (titlebar, panels, splitters, chrome, glass layers) is 100% custom.
    Tailwind + Motion define all shell surfaces, transitions, and layout behavior.
    No external UI frameworks beyond HeroUI + `react-resizable-panels`.

-   **One responsibility per unit.**
    Every component, hook, and module does exactly one thing.

-   **Pure UI.**
    Components render. They don’t fetch, store, or decide business rules.

-   **Hard layer boundaries.**
    Data flows: RPC → services → state/hooks → components.
    Never backwards, never sideways.

-   **Typed reality, not guesses.**
    Data structures must match real RPC shapes exactly.

-   **No magic.**
    No hidden behaviors, no unexplained values, no silent side effects.

-   **Replaceable building blocks.**
    Every UI piece should be swappable without breaking unrelated parts.

-   **Local state first.**
    Global state only when multiple distant parts truly need it.

-   **Deterministic behavior.**
    No randomness, no implicit rules. Everything explicit.

-   **Code must age well.**
    Every change should increase clarity, not decrease it.

-   **Don’t reinvent solved problems.**
    Use libraries with purpose; avoid both legacy junk and unnecessary reinvention.

---

# **12. Project Structure (Optimized for Single Developer)**

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
```

---

## **Rules**

### **1. Features (`modules/`)**

-   Flat > nested. No `parts/`, `tabs/`, `components/` folders inside a module.
-   Use underscores to group related siblings: `Dashboard_Grid.tsx`.
-   Local hooks belong in `hooks.ts` inside the module.

### **2. Configuration (`config/`)**

-   Two-file rule:

    1. `constants.json` — literals only.
    2. `logic.ts` — types and computed logic.

-   No other files in root `config/`.

### **3. Services (`services/`)**

-   Every service must define Zod schemas for its external data.
-   All RPC/network goes through adapters in `services/rpc`.

### **4. Simplicity**

-   No folders without real code.
-   Avoid deep nesting.
-   Keep related logic physically close.

### **5. No Empty Folders**

-   Folders exist only if they contain meaningful code.
-   Delete any folder that becomes empty.

---

# **13. Coding Standards**

These guarantee consistency and prevent drift.

---

## **1. File Naming**

**Components → PascalCase (with underscores for siblings)**

-   `DashboardView.tsx`
-   `Dashboard_Grid.tsx`

**Hooks & Logic → camelCase**

-   `hooks.ts`
-   `useVirtualGrid.ts`

**Services → kebab-case**

-   `engine-adapter.ts`

---

## **2. Configuration Access**

-   Never hardcode numbers or colors in code.
-   Import literals from `@/config/constants.json`.
-   Import config logic from `@/config/logic.ts`.

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

-   UI never calls `fetch` directly.
-   UI → hooks → service adapters → Zod → network.

---

## **5. Indentation & Hygiene**

-   4-space indentation.
-   No empty folders.
-   Delete unused files immediately.

---

# **14. Internationalization (Enforcement)**

-   No hard-coded English anywhere in the codebase.
-   All visible UI text must be referenced through `t("…")`.
-   Work with `en.json` only. Ignore other translation files even if they exist.
-   When a new UI string is needed:

    1. Add key/value to `en.json`.
    2. Use `t("key")` in the component.

-   Agents must never output inline English text in JSX/TSX.
-   If a string appears inline, it must be moved to `en.json` automatically.

---

# **Other**

1. Before reporting a task as completed, perform a review of the code and fix all important issues. Repeat until you are fully satisfied.
2. Run `npm run build` and fix build errors if possible.
3. Do **not** try to execute Linux commands. The build machine is Windows.
4. Extra Windows executables available: `rg`, `fd`, `bat`.
5. For code search, never use `Select-String`. Always use ripgrep:

    - `rg -n -C 5 "<pattern>" <path>`

6. Never write complex or nested shell one-liners. If a command requires tricky quoting or multiple pipes, move it into a script file instead. All commands must be simple, cross-platform, and Windows-safe.
