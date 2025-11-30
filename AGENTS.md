Understood.
Here is the **cleaned, corrected, high-quality merged spec** with **zero invented values**, **zero arbitrary configuration choices**, and **no implementation details that constrain you**.
Pure architecture, design language, interaction rules, and philosophy — nothing that locks you into numbers, intervals, or settings.

---

# **AGENTS.md — TinyTorrent Mission Specification**

**Purpose:**
Single authoritative reference for the architecture, UI/UX rules, design tokens, and development standards for **TinyTorrent** — a modern, world-class successor to µTorrent.

---

# **1. Brand Identity**

TinyTorrent = **modern µTorrent** × **glass cyberpunk UI** × **Apple/Linear polish**.

### Identity pillars:

- **Speed:** No lag. No hesitation.
- **Density:** Data-rich layout, zero wasted space.
- **Stealth:** Dark mode first.
- **Zero Bloat:** Extremely small executable.
- **World-Class Visuals:** Premium, clean, and effortless.
- **Native HUD Feel:** Glass, blur, depth, minimal chrome.

---

# **2. Architecture**

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** TailwindCSS v4 + HeroUI
- **Motion:** Framer Motion — mandatory for all interactive elements. Every complex component (preview panes, compare sliders, drag handles, reordering, progress visualizations) must use intentional kinetic motion. Motion is not decorative; it expresses structure, hierarchy, and state.
- **Drag & Drop:** react-dropzone (full-window detection)
- **Icons:** Lucide (tree-shaken)
- **State:** React Hooks; Zustand only when necessary
- **Backend:** Transmission RPC via Fetch
- **Routing:** Only if strictly required

**No libraries beyond this stack unless absolutely justified.**

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

- Detect browser/windows mode and use it. if fails, use Dark mode first.
- Detect language of the browser and use it. if fails use English.
- Glass layers (`backdrop-blur`) for nav, sidebar, modals, table headers.
- High-density layout.
- Minimal padding, clean grid, strong typography hierarchy.

---

# **4. UI/UX Philosophy**

## Zero Friction

Every interaction must feel physically obvious, self-revealing, and continuous. Complex widgets (comparators, sliders, zoomable canvases, reorderable lists) must remain effortless and predictable. Every gesture (drag, wheel, zoom, resize, compare, reorder) must be smooth, reversible, and immediately responsive — without exposing implementation cost.

### Interaction Principles

- **Full-window drop zone**: dropping a `.torrent` file or magnet text opens the add-modal immediately.
- **Auto-paste UX**: pasting magnet text should trigger add-modal.
- **Right-click everywhere**: context menus are primary.
- **Keyboard-first**: essential actions mapped to obvious keys (Start, Pause, Delete, Add, Refresh).
- **No clutter**: keep controls minimalistic.

## Motion

Tasteful micro-interactions:

- Buttons shift subtly on hover.
- Icons animate meaningfully (not as decoration).
- Modals fade + slide smoothly.
- Progress transitions cleanly.

---

# **5. Component System**

## Table (Core)

- HeroUI `<Table>`
- Compact density
- Sticky blurred header
- Monospace for numbers/hashes/speeds
- Sans-serif for names
- Thin, minimal progress bars
- Optional sparkline: tiny SVG inline (if added later)

## Modals

- Used for Add and Settings
- Centered, blurred backdrop
- Clean, focused content
- Immediate autofocus
- Framer Motion transitions

## Buttons

- Primary: `variant="shadow"`
- Secondary: `variant="light"` / `variant="ghost"`
- Icon-only buttons for toolbar

## Drag & Drop Overlay

When dragging files/text:

- Full-window overlay
- Glass effect
- Clear text: “Drop to Add Torrent”
- Soft fade in/out

## Iconography (Lucide)

Thin strokes (1.5).
Use curated set only:

- `Magnet` — add magnet
- `ArrowDownCircle` — downloading
- `CheckCircle2` — seeding
- `PauseCircle` — paused
- `Trash2` — delete
- `Gauge` — speed/settings
- `Zap` — connection/activity

Icons must always use semantic colors.

---

# **6. RPC Layer (Abstract)**

Rules only — **no fixed intervals, no fixed behaviour**.

- A proper handshake: handle Transmission’s CSRF token requirement gracefully.
- A polling mechanism exists — internal frequency/config is up to your later implementation.
- Request lightweight fields frequently; request heavy static fields only on demand.
- Avoid unnecessary rerenders.
- Strict typing for all RPC responses.
- Errors must be silent, recoverable, and non-blocking.

No magic numbers. No configuration decisions.

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

## **10. UX Excellence Directive**

**All Agents must operate as world-class UI/UX designers.**
The interface must achieve **jaw-dropping visual quality**, combining simplicity, full functionality, and zero friction.
Every screen, component, interaction, and motion must reflect **premium, intuitive, world-class design standards**.
