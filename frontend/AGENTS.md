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
-   **Motion:** Framer Motion — required for every interactive element. Complex components (lists, draggable rows, compare sliders, zoomable panes, split-views, progress animations) must use motion to express structure, state, and depth. Motion must feel physical, intentional, and consistent with system physics.
-   **Drag & Drop:** react-dropzone (full-window detection)
-   **Icons:** Lucide (tree-shaken)
-   **State:** React Hooks; Zustand only when necessary
-   **Routing:** Only if strictly required

## UI Scale System:

-   All interactive element sizes (icons, hit areas, paddings) are derived from a central scale value in config. This drives responsive sizing without hard-coded pixels.
-   Do not use Tailwind pixel-based sizing classes (w-5, h-6, text-[14px]). All sizing must reference scale tokens or semantic utility classes derived from config.

---

# **3. Theming & Semantic Tokens**

**Mandatory:**
**Use HeroUI semantic tokens everywhere.**
No hard-coded hex colors or arbitrary Tailwind colors.

| Token        | Usage                  |
| ------------ | ---------------------- |
| `background` | App shell              |
| `content1`   | Tables, cards, modals  |
| `foreground` | Primary text           |
| `primary`    | CTAs, progress accents |
| `success`    | Seeding, Completed     |
| `warning`    | Paused, Checking       |
| `danger`     | Deletes, Errors        |

No magic numbers: All spacing, sizing, radius, and scale values must come from configuration tokens and not from inline constants or ad-hoc Tailwind values.

### Aesthetic

-   Detect system dark/light mode and use it automatically; fallback = Dark.
-   Detect system/browser language and use it; fallback = English.
-   Glass layers (backdrop-blur) for all UI surfaces that float or overlay (sidebar, modals, table headers, toolbars, workspace areas).
-   Controls (buttons, icons, chips) use enlarged visual size and comfortable hit areas to improve usability without inflating layouts.
-   Minimal padding, tight alignment, but controls may use larger icons and generous hit areas as long as layout density is preserved.
-   Strong typography hierarchy (Swiss style).
-   Layered shadows used sparingly for depth — never decoration.

---

# **4. UI/UX Philosophy**

### **Zero Friction**

Every interaction must be physically obvious, reversible, continuous, and feel like a professional tool — not a webpage.
Complex widgets must behave like a workspace:

-   zoomable
-   pannable
-   resizable
-   draggable
-   comparable
-   reorderable
-   state-aware
-   motion-coherent

Every gesture (drag, wheel, zoom, pan, resize, compare, reorder) must be smooth, predictable, and never block or jitter.
Clarity and recognizability take priority over maximal density; controls must remain visually expressive and easy to target.

### **Interaction Principles**

-   **Full-window drop zone** with animated overlay.
-   **Auto-paste** for magnet links.
-   **Context menus everywhere.**
-   **Keyboard-first** for core actions.
-   **Continuous feedback** — no dead states.
-   **Minimal chrome, maximal clarity.**
-   **No click-hunting** — controls must appear where they are needed.
-   Size increases must improve readability, not introduce visual bloat

### **Motion**

Kinetic micro-interactions must clarify structure:

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

---

### **Modals**

-   Instant autofocus
-   Blur + depth shadow
-   Framer Motion transitions
-   Must feel like floating “panels” inside a HUD
-   No heavy chrome; no wasted margins

---

### **Buttons**

-   Primary = `shadow`
-   Secondary = `light` / `ghost`
-   Icon-only buttons for toolbars
-   Must animate on hover/press
-   Must preserve clean layout and avoid bloated chrome, but icons and interactive elements may be visually larger as long as alignment remains tight.

---

### **Drag & Drop Overlay**

-   Full-window detection
-   Glass layer with kinetic fade-in
-   Bold “Drop to Add Torrent” text
-   Dims background but keeps context visible
-   Cancels instantly on drag-out

---

### **Iconography (Lucide)**

-   Icons must always use semantic colors.
-   People should be able to use the tool using icons. Use them everywhere it makes sense. Make them larger than text so the function of the feature can be understood without reading the text.

Icon Size Principles (Scalable)

-   Icon size is responsive, derived from the global UI scale configuration.
-   Icons must always remain visually dominant in interactive contexts, but never dictate row or layout height.
-   Controls scale relatively, not with hard-coded pixels.
-   Icons inside tables scale proportionally but must not increase row height.
-   No magic numbers: all scale values originate from a configuration token, not inline values.

### **Workspace Components **

Any component that presents data visually (torrent details, file info, preview panels, charts, peer maps, piece distribution) must behave like a **workspace**, not a static block.

Workspace capabilities:

-   Smooth zoom (wheel / pinch / +/- buttons)
-   Smooth pan (click-drag)
-   Reset view
-   Motion-driven transforms
-   Toolbars that float above content
-   Dynamic affordances (handles, sliders, overlays)
-   Split views or comparison views when appropriate

This matches the interaction model you demonstrated:
**professional tool UI, not a webpage UI.**

---

# **6. RPC Layer (Unified Engine Interface)**

TinyTorrent operates on a **single abstract RPC interface** called `EngineAdapter`.
This interface defines the **common protocol** used by the UI, hooks, and state layer — independent of the underlying torrent engine.

### **Design Rules**

-   **Transmission = baseline canonical protocol.**
    All mandatory fields, command semantics, and update flows are defined according to Transmission’s RPC model.

-   **Libtorrent = extension layer (future).**
    Libtorrent support will implement the same `EngineAdapter` interface,
    extending it only when libtorrent exposes capabilities beyond the Transmission baseline.

-   **No engine-specific logic in UI or features.**
    Every component must consume **only the EngineAdapter interface**, never raw RPC shapes.

-   **One adapter active at runtime.**
    Selection handled at startup or settings page.

-   **Typed reality.**
    Transmission types define the canonical DTOs.
    Libtorrent adapter must conform to them and provide extended structures through explicit extension models — never by mutating the baseline DTOs.

### **EngineAdapter Responsibilities**

These methods exist **abstractly**; their internal implementation depends on the engine:

-   handshake / session initialization
-   fetch session stats
-   fetch torrent list (delta-friendly)
-   fetch single torrent details (piece map, files, trackers, peers)
-   add torrent (magnet / file)
-   start / pause / delete
-   update subscription (polling)
-   error reporting (non-blocking, recoverable)

### **Principles**

-   **UI never sees engine-specific fields.**
-   **Adapters must translate engine responses into canonical Transmission-shaped DTOs.**
-   **Extensions must be explicit, namespaced, and optional.**
-   **Adapters must be hot-swappable with zero UI changes.**

---

# **7. Internationalization**

-   i18next
-   Only `en.json` must be maintained for MVP
-   All visible UI text must go through `t("…")`

---

# **8. Quality & Performance Standards**

### Requirements

-   No console noise
-   No unused imports
-   Strict TypeScript
-   Minimal bundle size
-   Clean build (`vite build` / `npm run build`)
-   Consistent commit quality
-   Visually consistent dark-mode-first UI

### Rendering

-   Efficient row-level updates
-   Minimal unnecessary React re-renders
-   No layout thrash

---

# **9. MVP Deliverables**

1. **Glass App Shell** (sidebar/navbar with blur)
2. **Real-Time Dashboard Table** (compact, smooth updates)
3. **Global Dropzone Layer**
4. **Transmission RPC Handshake**
5. **Add Torrent Modal** (magnet/file/text)
6. **Context Menus** (Start, Pause, Delete)
7. **Keyboard Actions**
8. **Clean, tight build**

---

# **10. UX Excellence Directive **

All Agents must operate as **world-class tool-UI designers**, capable of bridging two eras of design.
TinyTorrent must deliver **Adaptive Excellence**:

-   **Unified Professional Interface:**

    -   **Single Mode:** The UI operates exclusively in "Modern Mode" (Glass/Blur).
    -   **Tooling Precision:** While the aesthetic is modern, the functionality must remain dense and keyboard-friendly (e.g. arrow key navigation in the table).
        Precision refers to behavior and feedback, not microscopic UI elements. A modern tool may use larger controls without sacrificing professional workflows.
    -   **No Split-Pane:** Details are accessed via double-click (Modal), preserving the clean "List View" focus.

-   **Tooling-Grade Ergonomics:**
    -   the tool must feel precise.

**Simplicity of presentation — not simplicity of capability.**
**Respect the Muscle Memory of the veteran, but deliver the Fluidity of the future.**

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

# **12. Project Structure (Blueprint)**

A shallow, predictable, human-readable structure.
Features live in `modules/`; all external service integrations live in `services/`; shared reusable code lives in `shared/`; global configuration stays in `config/`.
All logic must remain close to where it is used — no unnecessary layers, no scattered files.

---

### **Directory Map**

```txt
src/
|-- app/                      # App entry shell: App.tsx, main.tsx, router, providers, theming
|
|-- modules/                  # Feature folders (each screen, modal, or major UI unit)
|   |-- dashboard/
|   |   |-- DashboardView.tsx
|   |   |-- hooks.ts                 # Local hooks and feature logic
|   |   \-- parts/                   # Optional: split out UI subcomponents when large
|   |
|   |-- settings/
|   |   |-- SettingsModal.tsx
|   |   \-- hooks.ts
|   |
|   \-- torrent-add/
|       |-- AddTorrentModal.tsx
|       \-- hooks.ts
|
|-- services/                 # All external service integrations
|   |-- rpc/                  # Torrent RPC layer (Transmission baseline + extensions)
|   |   |-- rpc-base.ts            # Canonical RPC implementation (Transmission protocol)
|   |   |-- rpc-extended.ts        # Extends rpc-base with libtorrent-capable features
|   |   \-- types.ts               # Canonical Transmission-shaped DTOs (+ optional extensions)
|   |
|   \-- (other services as needed)
|       \-- <service-name>/
|           |-- <service-name>.ts
|           \-- types.ts
|
|-- shared/                   # Reusable UI primitives, hooks, utilities, and assets
|   |-- ui/
|   |-- hooks.ts              # Can become shared/hooks/ if it grows large
|   |-- utils.ts              # Can become shared/utils/ if it grows large
|   \-- assets/
|
|-- config/                   # App-wide configuration
|   |-- app-config.ts
|   \-- (additional config files allowed when needed)
|
\-- i18n/
    \-- en.json               # Localization source
```

---

### **Rules**

#### **1. Features (`modules/`)**

-   One feature = one folder under `modules/`.
-   Each feature contains:

    -   main UI component (`XxxView.tsx` or `XxxModal.tsx`)
    -   a local `hooks.ts` for feature-specific logic
    -   `parts/` only when the UI grows beyond a comfortable size.

-   If `hooks.ts` becomes too large or contains unrelated hooks, convert it into a `hooks/` folder:

```
hooks/
    useTorrentList.ts
    useSpeedGraph.ts
```

---

#### **2. Services (`services/`)**

-   All external integrations MUST live under `services/<service-name>/`.
-   Torrent RPC lives under `services/rpc/`:

    -   `rpc-base.ts` -> Transmission-compatible RPC client (baseline)
    -   `rpc-extended.ts` -> extends the base with additional capabilities
    -   `types.ts` -> canonical DTOs (Transmission-shaped) + optional extensions

-   Adding new services (auth, telemetry, storage, etc.) follows the same pattern:

```
services/auth/
services/storage/
services/telemetry/
```

-   No service code may exist outside `services/`.

---

#### **3. Shared (`shared/`)**

-   Only place code here when two or more features need it.
-   `shared/hooks.ts` and `shared/utils.ts` begin as single files.
-   When either grows too large or mixes unrelated concerns, convert them into folders:

```
shared/hooks/
shared/utils/
```

-   Never store feature-specific logic here.

---

#### **4. Config (`config/`)**

-   App-wide configuration begins in `config/app-config.ts`.
-   If config grows, it may be split into multiple files:

```
config/ui.ts
config/network.ts
config/session.ts
```

-   All config must stay under `config/`.
-   Feature-specific configuration belongs inside its feature folder.
-   A single config hub file (`config/config-hub.ts`) should import all feature-specific config files so that configuration is discoverable from one place.

---

#### **5. Simplicity**

-   Do not create folders without real code.
-   Avoid deep nesting; maximum allowed depth is three levels.
-   Keep related logic physically close; no scattering across unrelated directories.

---

#### **6. No empty folders**

-   Folders may only exist if they contain meaningful code.
-   Do not create directories “for future use.”
-   Delete any folder that becomes empty.

# **13. Coding Standards**

These rules exist to guarantee consistency and prevent architectural drift.
They apply to all generated code.

---

## **1. File Naming Conventions**

**React components → PascalCase**

```
DashboardView.tsx
SettingsModal.tsx
AddTorrentModal.tsx
Table.tsx
FilesPanel.tsx
```

**Local feature hooks → camelCase and begin with “use” when split**

```
hooks.ts                          # only if small
hooks/useTorrentList.ts
hooks/useSpeedGraph.ts
```

**Service modules → kebab-case**

```
rpc-base.ts
rpc-extended.ts
auth-client.ts
telemetry-client.ts
storage-client.ts
```

**Utilities → kebab-case**

```
bytes-format.ts
parse-magnet.ts
debounce.ts
```

**Rules:**

-   Do not mix naming styles in the same folder.
-   Only hooks use camelCase; everything else is PascalCase or kebab-case.
-   Never create generic filenames like `client.ts`, `helpers.ts`, or `index2.ts`.

---

## **2. Component Shape (Required Order)**

Every `.tsx` file follows this structure:

1. imports
2. local types/interfaces
3. hooks and derived state
4. internal functions
5. JSX return
6. export

No commented-out blocks or unused code.

---

## **3. Hooks & Data Flow**

-   Hooks must start with `use`.
-   Components must **never** contain RPC calls.
-   RPC and network access live only in `services/<name>/`.
-   Hooks may call services; components may not.

---

## **4. Services**

-   Each service gets its own folder: `services/<service-name>/`.
-   File names must be explicit:
    `auth-client.ts`, `telemetry-client.ts`, `rpc-base.ts`, not `client.ts`.
-   Services define their DTOs only in `types.ts`.

---

## **5. Imports**

-   Prefer absolute imports (`@/modules/...`) when available.
-   No deep relative imports like `../../../utils`.
-   No circular imports.

---

## **6. Splitting Rules**

**Components:**
Split into `parts/` only when the main file exceeds ~250–300 lines.

**Hooks:**
Split into `hooks/` only when `hooks.ts` becomes large or contains multiple unrelated responsibilities.

---

## **7. No Empty Folders**

Folders may only exist when they contain real code.
Never create placeholder folders.
Remove any folder that becomes empty.

### **8. Indentation Rule**

4 spaces per indentation level.
Tabs are not allowed.

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
