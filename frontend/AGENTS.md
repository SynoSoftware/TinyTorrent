# **AGENTS.md — TinyTorrent Mission Specification**

**Purpose:**
Single authoritative reference for the architecture, UI/UX rules, design tokens, and development standards for **TinyTorrent** — a modern, world-class successor to µTorrent.

---

# **1. Brand Identity**

TinyTorrent = **modern µTorrent** × **glass UI** × **Apple/Linear polish**.

### Identity pillars:

-   **Speed:** No lag. No hesitation.
-   **Stealth:** Dark-first visual identity (system mode respected automatically).
-   **Zero Bloat:** Extremely small executable.
-   **World-Class Visuals:** Premium, clean, and effortless.
-   **Native HUD Feel:** Glass, blur, depth, minimal chrome.
-   **Accessibility:** Controls must be visually clear, easy to target, and comfortable for less-technical users without compromising professional data density.

---

# **2. Architecture**

-   **Frontend:** React 19 + TypeScript + Vite
-   **Styling:** TailwindCSS v4 + HeroUI
-   **Motion:** Framer Motion — required for all interactive state changes (layout, sorting, drag). Complex components must use motion to express structure.
-   **Drag & Drop:** react-dropzone (full-window detection)
-   **Icons:** Lucide (tree-shaken)
-   **State:** React Hooks; Zustand only when necessary
-   **Data/Validation:** **Zod** is mandatory for all RPC boundaries. Never trust the backend blindly.
-   **Virtualization:** `@tanstack/react-virtual` is **mandatory** for any list > 50 items (Torrents, Files, Peers).
-   **Command Palette:** `cmdk` for keyboard-driven navigation (`Cmd+K`).

## **State & Heartbeat Strategy (CRITICAL)**

To prevent "Slow Table / Fast CPU Burn":

1.  **Single Heartbeat Source:** The App must have **one** central heartbeat loop (managed by `EngineAdapter`). Components must **never** set their own `setInterval` for fetching.
2.  **Adaptive Modes:**
    -   **Polling Mode (Current):**
        -   **Table View:** Fetch every ~1500ms.
        -   **Detail/Graph View:** Fetch every ~500ms.
        -   **Background:** Throttle to 5000ms.
    -   **Push Mode (Future):**
        -   Polling stops. The Heartbeat is used only to check connection health (Ping/Pong). Data is driven by incoming Server Events.
3.  **Selective Subscriptions (Selector Pattern):**
    -   **The Table** subscribes to the _List Hash/Delta_. It only re-renders rows that changed.
    -   **The Details Panel** must subscribe **only** to `state.torrents[activeId]`.
    -   **Prevents CPU Burn:** If the list updates but `activeId` data hasn't changed, the Details Panel **must not render**.

## UI Scale System:

-   All interactive element sizes (icons, hit areas, paddings) are derived from the central config.
-   Do not use Tailwind pixel-based sizing classes (w-5, h-6, text-[14px]). All sizing must reference scale tokens or semantic utility classes derived from config.

---

# **3. Theming & Semantic Tokens**

**Mandatory:**
**Use HeroUI semantic tokens everywhere.**

### **The Layered Depth System (Semantic Glass)**

We use Tailwind's opacity modifier (`/opacity`) on HeroUI tokens. This preserves the semantic color (white in Light, black in Dark) while applying the glass transparency.

| Layer       | Surface                      | Tokens                                                                        |
| :---------- | :--------------------------- | :---------------------------------------------------------------------------- |
| **Layer 0** | App Background               | `bg-background` + Subtle Noise Texture (2-4% opacity)                         |
| **Layer 1** | Panels / Tables / Sidebar    | `backdrop-blur-md` + `bg-background/60` + `border-default/10`                 |
| **Layer 2** | Modals / Popovers / Floating | `backdrop-blur-xl` + `bg-content1/80` + `shadow-medium` + `border-default/20` |

**Rule:** Every "Glass" layer (Layers 1 & 2) must have a subtle border (`border-default/xx`) to define its edge. Using `border-default` ensures the border is dark in Light Mode and light in Dark Mode automatically.

### **Semantic Status Mapping**

These mappings must be consistent across the app (Text, Badges, Icons, Graphs):

| Token     | Usage                  |
| --------- | ---------------------- |
| `success` | Seeding, Completed     |
| `warning` | Paused, Checking       |
| `danger`  | Deletes, Errors        |
| `primary` | CTAs, Progress Accents |
| `default` | Borders, Inactive Text |

## **Color Rules**

**Mandatory:** Light/dark mode has to work flawlessly.
Main strategy: use HeroUI’s semantic color tokens for everything.

**Use:**

-   `var(--heroui-background)`
-   `var(--heroui-content1)`
-   `var(--heroui-foreground)`
-   `var(--heroui-primary)`
-   `var(--heroui-default)` (for borders/dividers)

**Avoid:**

-   Custom hex/rgb colors
-   Tailwind named colors
-   Hard-coded `border-white` or `border-black` (Breaks theme switching)
-   `rgba()` manual calculations.

## No magic numbers

All spacing, sizing, radius, and scale values must come from configuration tokens and not from inline constants or ad-hoc Tailwind values.

### Aesthetic

-   Detect system dark/light mode and use it automatically; fallback = Dark.
-   Detect system/browser language and use it; fallback = English.
-   Glass layers (backdrop-blur) for all UI surfaces that float or overlay.
-   Controls (buttons, icons, chips) use enlarged visual size and comfortable hit areas to improve usability without inflating layouts.
-   Strong typography hierarchy (Swiss style).
-   Layered shadows used sparingly for depth — never decoration.

---

# **4. UI/UX Philosophy**

### **The "Tool" Interaction Model**

TinyTorrent is an OS-level tool, not a website.

1.  **OS-Style Selection:**

    -   Click = Select Single
    -   Ctrl/Cmd + Click = Add to Selection
    -   Shift + Click = Range Selection
    -   Right Click = Context Menu (acting on _all_ selected items)

2.  **Optimistic UI:**
    -   Actions (Pause, Start, Delete) must reflect in the UI _instantly_.
    -   Do not wait for the RPC roundtrip. Revert only if the RPC errors.

### **Zero Friction**

Every interaction must be physically obvious, reversible, continuous, and feel like a professional tool.
Complex widgets must behave like a workspace:

-   zoomable
-   pannable
-   resizable
-   draggable
-   comparable
-   reorderable
-   state-aware
-   motion-coherent

### **Interaction Principles**

-   **Full-window drop zone** with animated overlay.
-   **Auto-paste** for magnet links.
-   **Context menus everywhere.**
-   **Keyboard-first** for core actions.
-   **Continuous feedback** — no dead states.
-   **Minimal chrome, maximal clarity.**
-   **No click-hunting** — controls must appear where they are needed.

### **Motion**

Kinetic micro-interactions must clarify structure. Use `framer-motion`'s `layout` prop for lists so rows glide into place when sorted or filtered, rather than snapping.

-   Buttons: micro-scale + color shifts
-   Icons: task-specific motion (e.g., rotate, pulse, bounce subtly)
-   Rows: animate on reorder
-   Progress bars: smooth transitions
-   Modals: fade + slide + depth bloom
-   Overlays: opacity + blur transitions
-   Workspace zoom/pan: eased, continuous

Motion is part of the UX language, not decoration.

---

# **5. Component System**

### **Core**

-   HeroUI
-   Sticky blurred header
-   Monospace for numbers/speeds
-   Sans-serif for names
-   Thin, minimal progress bars
-   Optional sparkline SVG allowed
-   No row flicker on updates
-   Row-level motion for selection, hover, reorder

### Tables & Grids (Implementation Strategy)

Do not build a "God Component". Use specific components for specific needs, sharing only the logic.

-   Dashboard Grid (Dashboard_Grid.tsx): Heavy. Supports Row Drag & Drop (Queue), Marquee Selection, Sparklines.
-   Details Grid (SimpleVirtualTable.tsx): Light. Supports Virtualization and Sorting only. Used for Files/Peers.

### **Modals**

-   Instant autofocus
-   Blur + depth shadow (Layer 2)
-   Framer Motion transitions
-   Must feel like floating “panels” inside a HUD
-   No heavy chrome; no wasted margins

### **Buttons**

-   Primary = `shadow`
-   Secondary = `light` / `ghost`
-   Icon-only buttons for toolbars
-   Must animate on hover/press

### **Drag & Drop Overlay**

-   Full-window detection
-   Glass layer with kinetic fade-in
-   Bold “Drop to Add Torrent” text
-   Dims background but keeps context visible
-   Cancels instantly on drag-out

### **Iconography (Lucide)**

-   **Icons as Data:** Prefer icons over text for status (Play/Pause/Check), Priority (Arrows), and File Types.
-   Icons must always use semantic colors.
-   Icon size is responsive, derived from the global UI scale configuration.

### **Workspace Components**

Any component that presents data visually (charts, peer maps) must behave like a **workspace**:

-   Smooth zoom (wheel / pinch)
-   Smooth pan (click-drag)
-   Reset view
-   Motion-driven transforms

---

# **6. RPC Layer (Protocol Strategy)**

We are currently in a **Transition Phase**.

1.  **Current Backend:** Standard `transmission-daemon` (Official).
2.  **Target Backend:** Custom `libtorrent`-based daemon that **mimics** the Transmission RPC interface perfectly, while adding extensions.

### **Connection Strategy: "The Adaptive Client"**

The Frontend must run on a **Dual-Transport System**:

1.  **Baseline (HTTP Polling):**

    -   **Mandatory for MVP.**
    -   The app must fully function using standard HTTP RPC calls (POST requests) to `/transmission/rpc`.
    -   This ensures compatibility with the current standard daemon.
    -   **Polling Interval:** Adaptive (e.g., 2s in table view, 5s in background).

2.  **Upgrade Path (Server-Push / WebSocket):**
    -   If the backend is identified as "Standard Transmission", the app stays in **HTTP Polling Mode**.
    -   If/When the backend is identified as "TinyTorrent", it upgrades to a **Server-Push (Event-Driven)** model (SignalR-style).
    -   **Zero Polling:** In this mode, the client stops polling. The server pushes state deltas instantly via WebSocket when data changes.

### **Design Rules**

-   **Transmission RPC is the Law:**
    We do not invent a new protocol. We use the Transmission RPC spec for _everything_ (Session, Stats, Torrent Get/Set).
-   **Zod at the Gate:**
    Since we are transitioning backends, we strictly validate incoming data. If the future Libtorrent daemon sends malformed Transmission DTOs, Zod must catch it.
-   **EngineAdapter Interface:**
    The UI components must be agnostic. They call `adapter.getTorrents()`.
    -   _Now:_ `adapter` does `fetch('.../rpc')`.
    -   _Future:_ `adapter` might receive a push frame, but the UI component doesn't care.

### **Data Handling**

-   **Strictly Typed:** Use `transmission-rpc-typescript` types (or equivalent) as the source of truth.
-   **Delta Updates:** Even over HTTP polling, use the `ids` field to request only changed torrents to minimize bandwidth on the standard daemon.

---

# **7. Internationalization**

-   i18next
-   Only `en.json` must be maintained for MVP
-   **Hard Rule:** No hard-coded English strings in JSX. All text must use `t("key")`.

---

# **8. Quality & Performance Standards**

### Requirements

-   **Virtualization:** Mandatory for lists > 50 items.
-   No console noise
-   No unused imports
-   Strict TypeScript
-   Minimal bundle size
-   Clean build (`vite build` / `npm run build`)
-   Visually consistent dark-mode-first UI

### Rendering

-   Efficient row-level updates (Diffing/Selective Subscriptions).
-   Minimal unnecessary React re-renders.
-   No layout thrash.

---

# **9. MVP Deliverables**

1.  **Glass App Shell** (Layered Depth System).
2.  **Dashboard Grid** (Virtual, Sortable, Queue-Draggable).
3.  **Details Tables** (Virtual, Sortable - Files/Peers).
4.  **Hybrid RPC Layer** (Transmission Base + Zod + WS).
5.  **Add Torrent Modal** (Magnet/File/Text).
6.  **Context Menus** (Start, Pause, Delete, "Open Folder").
7.  **Command Palette** (Cmd+K).
8.  **Tray Integration Stub** (UI buttons to trigger Native RPC calls).

---

# **10. UX Excellence Directive**

All Agents must operate as **world-class tool-UI designers**, capable of bridging two eras of design.
TinyTorrent must deliver **Adaptive Excellence**:

-   **Unified Professional Interface:**

    -   **Single Mode:** The UI operates exclusively in "Modern Mode" (Glass/Blur).
    -   **Tooling Precision:** Functionality must remain dense and keyboard-friendly.
    -   **Split-Pane:** Details are accessed via double-click (Modal), preserving the clean "List View" focus but it can be pinned on the bottom (like visual studio panels can be pinned)

-   **Professional Tool, Not a Webpage:**
    -   Precision refers to behavior and feedback.
    -   Controls must remain visually expressive and easy to target.
    -   **Respect the Muscle Memory of the veteran, but deliver the Fluidity of the future.**

---

# **11. Architectural Principles (Mandatory)**

-   **Use HeroUI as the primary design system.**
    HeroUI components and tokens are the default for every surface, layout, and control.
    Custom UI exists only when HeroUI cannot express a required interaction.
    No external UI kits. No custom CSS that replicates HeroUI features.

-   **One responsibility per unit.**
    Every component, hook, and module must do exactly one thing. No mixed concerns.

-   **Pure UI.**
    Components render; they don’t fetch, store, transform, or decide business rules.

-   **Hard layer boundaries.**
    Data enters from RPC → flows through state/hooks → ends in components.
    Never backwards, never sideways.

-   **Typed reality, not guesses.**
    All data structures must match real RPC shapes exactly. No “maybe”, no loose models.

-   **No magic.**
    No hidden behaviors, no unexplained values, no silent side effects.

-   **Replaceable building blocks.**
    Every piece of UI must be swappable without breaking unrelated parts.

-   **Local state first.**
    Global state only when multiple distant parts truly need it.

-   **Deterministic behavior.**
    No randomness, no ambiguity, no implicit rules. Everything explicit and intentional.

-   **Code must age well.**
    Every change should increase clarity, not decrease it. No hacks, no shortcuts, no debt.

-   **Don’t reinvent solved problems.**
    Use libraries with purpose — avoid bloat and avoid reinvention. Adopt modern, battle-tested libraries for non-core needs, but introduce nothing legacy and nothing that doesn’t earn its place.

---

# **12. Project Structure (Optimized for Single Developer)**

A flat, high-maintenance structure designed for speed.
We favor **co-location** over nesting. We use **sibling naming** instead of deep folders.

### **Directory Map**

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
|   |   |-- DashboardView.tsx
|   |   |-- Dashboard_Grid.tsx       # The Virtualized Table (Sibling)
|   |   |-- Dashboard_Row.tsx        # Sibling file
|   |   |-- DetailModal.tsx
|   |   |-- DetailModal_Files.tsx    # Uses Shared SimpleTable
|   |   |-- DetailModal_Peers.tsx    # Uses Shared SimpleTable
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
|   |-- components/           # Complex shared
|   |   \-- SimpleVirtualTable.tsx # Light Grid (Files/Peers)
|   |-- hooks/                # Generic hooks
|   \-- utils/                # Generic logic
|
\-- i18n/
    \-- en.json
```

---

### **Rules**

#### **1. Features (`modules/`)**

-   **Flat is better than nested.** Do not create `parts/`, `tabs/`, or `components/` folders inside a module.
-   **Sibling Naming:** Use underscores to group related files (`Dashboard_Grid.tsx`).
-   **Local Hooks:** Keep feature hooks in `hooks.ts` inside the module.

#### **2. Configuration (`config/`)**

-   **The Two-File Rule:**
    1.  `constants.json`: Literals only.
    2.  `logic.ts`: Types and Logic.
-   No other files in root config.

#### **3. Services (`services/`)**

-   **Zod Mandate:** Every service must define Zod schemas for its external data.

#### **4. Simplicity**

-   Do not create folders without real code.
-   Avoid deep nesting
-   Keep related logic physically close; no scattering across unrelated directories.

---

#### **6. No empty folders**

-   Folders may only exist if they contain meaningful code.
-   Do not create directories “for future use.”
-   Delete any folder that becomes empty.

---

# **13. Coding Standards**

These rules exist to guarantee consistency and prevent architectural drift.

---

## **1. File Naming Conventions**

**Components → PascalCase (with Underscores for Siblings)**

```
DashboardView.tsx
Dashboard_Grid.tsx
```

**Hooks & Logic → camelCase**

```
hooks.ts
useVirtualGrid.ts
```

**Services → kebab-case**

```
engine-adapter.ts
```

---

## **2. Configuration Access**

-   **Never hardcode numbers.**
-   Import all literals from `@/config/constants.json`.
-   Import all config logic from `@/config/logic.ts`.

---

## **3. Component Shape**

1.  Imports
2.  Zod Schemas (if local validation needed)
3.  Types/Interfaces
4.  Hooks
5.  Implementation
6.  Export

---

## **4. Service Isolation**

-   **UI never calls `fetch` directly.**
-   UI calls Hooks -> Hooks call Service Adapters -> Adapters call Zod -> Adapters call Network.

---

## **5. Indentation & Hygiene**

-   4 spaces indentation.
-   No empty folders.
-   Delete unused files immediately.

# **14. Internationalization **

-   **No hard-coded English anywhere in the codebase. **
-   **All visible UI text must be referenced through `t("…")`.**
-   Work with en.json only. Ignore all other translation files even if they exist. Never read, write, or reference them.
-   When a new UI string is needed:

    1. Add a key/value to `en.json` only
    2. Use `t("key")` in the component.

-   Agents must never output inline English text in JSX/TSX.
-   If a string appears inline, it must be moved to `en.json` automatically.

# Other

1. before you report the task as completed, perform a review of the code and fix all important issues. repeat until fully happy.
2. perform a npm run build and fix if possible
3. Don't try to execute linux commands. The build machine is Windows environment
4. The following extra windows .exe are available. you can use the,: rg, fd, bat
5. For code search, never use Select-String. Always use ripgrep: rg -n -C 5 "<pattern>" <path>
6. Never write complex or nested shell one-liners. If a command requires tricky quoting or multiple pipes, move it into a script file instead. All commands must be simple, cross-platform, and Windows-safe.
