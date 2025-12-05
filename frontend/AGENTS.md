# **AGENTS.md — TinyTorrent Mission Specification**

**Purpose:**
Single authoritative reference for the architecture, UI/UX rules, design tokens, and development standards for **TinyTorrent** — a modern, world-class successor to µTorrent.

---

# **1. Brand Identity**

TinyTorrent = **modern µTorrent** × **glass UI** × **Apple/Linear polish**.

### Identity pillars:

- **Speed:** No lag. No hesitation.
- **Density:** Data-rich layout, zero wasted space.
- **Stealth:** Dark-first visual identity (system mode respected automatically).
- **Zero Bloat:** Extremely small executable.
- **World-Class Visuals:** Premium, clean, and effortless.
- **Native HUD Feel:** Glass, blur, depth, minimal chrome.

---

# **2. Architecture**

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** TailwindCSS v4 + HeroUI
- **Motion:** Framer Motion — required for every interactive element. Complex components (lists, draggable rows, compare sliders, zoomable panes, split-views, progress animations) must use motion to express structure, state, and depth. Motion must feel physical, intentional, and consistent with system physics.
- **Drag & Drop:** react-dropzone (full-window detection)
- **Icons:** Lucide (tree-shaken)
- **State:** React Hooks; Zustand only when necessary
- **Routing:** Only if strictly required

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

### Aesthetic

- Detect system dark/light mode and use it automatically; fallback = Dark.
- Detect system/browser language and use it; fallback = English.
- Glass layers (backdrop-blur) for all UI surfaces that float or overlay (sidebar, modals, table headers, toolbars, workspace areas).
- High-density professional layout — tooling-level, not consumer-level.
- Minimal padding, tight alignment, compact controls.
- Strong typography hierarchy (Swiss style).
- Layered shadows used sparingly for depth — never decoration.

---

# **4. UI/UX Philosophy**

### **Zero Friction**

Every interaction must be physically obvious, reversible, continuous, and feel like a professional tool — not a webpage.
Complex widgets must behave like a workspace:

- zoomable
- pannable
- resizable
- draggable
- comparable
- reorderable
- state-aware
- motion-coherent

Every gesture (drag, wheel, zoom, pan, resize, compare, reorder) must be smooth, predictable, and never block or jitter.

### **Interaction Principles**

- **Full-window drop zone** with animated overlay.
- **Auto-paste** for magnet links.
- **Context menus everywhere.**
- **Keyboard-first** for core actions.
- **Continuous feedback** — no dead states.
- **Minimal chrome, maximal clarity.**
- **No click-hunting** — controls must appear where they are needed.

### **Motion**

Kinetic micro-interactions must clarify structure:

- Buttons: micro-scale + color shifts
- Icons: task-specific motion (e.g., rotate, pulse, bounce subtly)
- Rows: animate on reorder
- Progress bars: smooth transitions
- Modals: fade + slide + depth bloom
- Overlays: opacity + blur transitions
- Workspace zoom/pan: eased, continuous

Motion is part of the UX language, not decoration.

---

# **5. Component System**

### **Table (Core)**

- HeroUI `<Table>`
- **Compact, dense, tooling-level row height**
- Sticky blurred header
- Monospace for numbers/speeds
- Sans-serif for names
- Thin, minimal progress bars
- Optional sparkline SVG allowed
- No row flicker on updates
- Row-level motion for selection, hover, reorder

---

### **Modals**

- Instant autofocus
- Blur + depth shadow
- Framer Motion transitions
- Must feel like floating “panels” inside a HUD
- No heavy chrome; no wasted margins

---

### **Buttons**

- Primary = `shadow`
- Secondary = `light` / `ghost`
- Icon-only buttons for toolbars
- Must animate on hover/press
- Must keep density — no oversized UI

---

### **Drag & Drop Overlay**

- Full-window detection
- Glass layer with kinetic fade-in
- Bold “Drop to Add Torrent” text
- Dims background but keeps context visible
- Cancels instantly on drag-out

---

### **Iconography (Lucide)**

Thin strokes (1.5).
Use curated set only:

- `Magnet` — add magnet
- `ArrowDownCircle` — downloading
- `CheckCircle2` — seeding
- `PauseCircle` — paused
- `Trash2` — delete
- `Gauge` — speed/settings
- `Zap` — connection/activity

- Icons must always use semantic colors.

### **Workspace Components **

Any component that presents data visually (torrent details, file info, preview panels, charts, peer maps, piece distribution) must behave like a **workspace**, not a static block.

Workspace capabilities:

- Smooth zoom (wheel / pinch / +/- buttons)
- Smooth pan (click-drag)
- Reset view
- Motion-driven transforms
- Toolbars that float above content
- Dynamic affordances (handles, sliders, overlays)
- Split views or comparison views when appropriate

This matches the interaction model you demonstrated:
**professional tool UI, not a webpage UI.**

---

# **6. RPC Layer (Unified Engine Interface)**

TinyTorrent operates on a **single abstract RPC interface** called `EngineAdapter`.
This interface defines the **common protocol** used by the UI, hooks, and state layer — independent of the underlying torrent engine.

### **Design Rules**

- **Transmission = baseline canonical protocol.**
  All mandatory fields, command semantics, and update flows are defined according to Transmission’s RPC model.

- **Libtorrent = extension layer (future).**
  Libtorrent support will implement the same `EngineAdapter` interface,
  extending it only when libtorrent exposes capabilities beyond the Transmission baseline.

- **No engine-specific logic in UI or features.**
  Every component must consume **only the EngineAdapter interface**, never raw RPC shapes.

- **One adapter active at runtime.**
  Selection handled at startup or settings page.

- **Typed reality.**
  Transmission types define the canonical DTOs.
  Libtorrent adapter must conform to them and provide extended structures through explicit extension models — never by mutating the baseline DTOs.

### **EngineAdapter Responsibilities**

These methods exist **abstractly**; their internal implementation depends on the engine:

- handshake / session initialization
- fetch session stats
- fetch torrent list (delta-friendly)
- fetch single torrent details (piece map, files, trackers, peers)
- add torrent (magnet / file)
- start / pause / delete
- update subscription (polling)
- error reporting (non-blocking, recoverable)

### **Principles**

- **UI never sees engine-specific fields.**
- **Adapters must translate engine responses into canonical Transmission-shaped DTOs.**
- **Extensions must be explicit, namespaced, and optional.**
- **Adapters must be hot-swappable with zero UI changes.**

---

# **7. Internationalization**

- i18next
- Only `en.json` must be maintained for MVP
- All visible UI text must go through `t("…")`

---

# **8. Quality & Performance Standards**

### Requirements

- No console noise
- No unused imports
- Strict TypeScript
- Minimal bundle size
- Clean build (`vite build` / `npm run build`)
- Consistent commit quality
- Visually consistent dark-mode-first UI

### Rendering

- Efficient row-level updates
- Minimal unnecessary React re-renders
- No layout thrash

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

## **10. UX Excellence Directive (Highest Priority)**

All Agents must operate as **world-class tool-UI designers**, capable of bridging two eras of design.
TinyTorrent must deliver **Adaptive Excellence**:

- **Dual-Mode Supremacy:**

  - **Modern Mode (Default):** Immersive, fluid, glass-morphism, modal-driven, "Apple/Linear" polish.
  - **Classic Mode:** High-density, opaque, split-pane, rigid 1px borders, "Industrial/Pro" precision.

- **Context-Aware Visuals:**

  - Components must adapt their rendering style to the container.
  - _Example:_ A Speed Graph renders as a smooth **Bezier curve** in Modern Mode, but as a precise **Stepped Line** in Classic Mode.
  - _Example:_ Metadata renders as **Floating Cards** in Modern Mode, but as a **Dense Key-Value Grid** in Classic Mode.

- **Interaction Choreography:**

  - **Modern:** Motion-driven structure (smooth expands, floating transitions).
  - **Classic:** Instant response (zero-latency switching, snap-to-grid, click-to-view).

- **Tooling-Grade Ergonomics:**
  - Regardless of mode, the tool must feel "heavy" and precise.
  - No wasted space in Classic mode.
  - No visual clutter in Modern mode.

**Simplicity of presentation — not simplicity of capability.**
**Respect the Muscle Memory of the veteran, but deliver the Fluidity of the future.**

---

## **11. Architectural Principles (Mandatory)**

- **Use HeroUI as the primary design system.**
  HeroUI components and tokens are the default for every surface, layout, and control.
  Custom UI exists only when HeroUI cannot express a required interaction.
  No external UI kits. No custom CSS that replicates HeroUI features.

- **One responsibility per unit.**
  Every component, hook, and module must do exactly one thing. No mixed concerns.

- **Pure UI.**
  Components render; they don’t fetch, store, transform, or decide business rules.

- **Hard layer boundaries.**
  Data enters from RPC → flows through state/hooks → ends in components.
  Never backwards, never sideways.

- **Typed reality, not guesses.**
  All data structures must match real RPC shapes exactly. No “maybe”, no loose models.

- **No magic.**
  No hidden behaviors, no unexplained values, no silent side effects.

- **Replaceable building blocks.**
  Every piece of UI must be swappable without breaking unrelated parts.

- **Local state first.**
  Global state only when multiple distant parts truly need it.

- **Deterministic behavior.**
  No randomness, no ambiguity, no implicit rules. Everything explicit and intentional.

- **Code must age well.**
  Every change should increase clarity, not decrease it. No hacks, no shortcuts, no debt.

- **Don’t reinvent solved problems.**
  Use libraries with purpose — avoid bloat and avoid reinvention. Adopt modern, battle-tested libraries for non-core needs, but introduce nothing legacy and nothing that doesn’t earn its place.

## **12. Project Structure (Guiding Blueprint) **

A clean, layered, responsibility-driven structure is mandatory.
This blueprint defines where code belongs; no cross-layer leakage.

src/
├── app/ # Application entry & shell (App, routing, providers)
│ ├── App.tsx
│ └── main.tsx
├── features/ # Business logic (the “what”)
│ ├── dashboard/ # Dashboard feature
│ │ ├── components/ # Pure UI components (table, rows, cells)
│ │ └── hooks/ # Data loading & feature-specific logic
│ ├── settings/ # Settings feature
│ └── torrent-add/ # Add torrent modal & logic
├── shared/ # Reusable, generic building blocks (the “how”)
│ ├── ui/ # Composed UI built from HeroUI (wrappers, layouts, skins)
│ ├── assets/ # Icons, images
│ ├── hooks/ # Generic hooks (theme, color mode, keyboard)
│ └── utils/ # Pure functions (formatBytes, helpers)
├── core/ # Engine layer (RPC + types)
│ ├── rpc-client.ts # Transmission RPC wrapper
│ └── types.ts # Strict TypeScript definitions
└── i18n/ # Localization
└── en.json

## Other

1. To save tokens Only work with en.json, do not update any other translation files.
2. before you report the task as completed, perform a review of the code and fix all important issues. repeat until fully happy.
3. perform a npm run build and fix if possible
4. Don't try to execute linux commands. The build machine is Windows environment
5. The following extra windows .exe are available. you can use the,: rg, fd, bat
6. For code search, never use Select-String. Always use ripgrep: rg -n -C 5 "<pattern>" <path>
7. Never write complex or nested shell one-liners. If a command requires tricky quoting or multiple pipes, move it into a script file instead. All commands must be simple, cross-platform, and Windows-safe.
