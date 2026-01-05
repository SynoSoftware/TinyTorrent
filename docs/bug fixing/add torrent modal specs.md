
# **Functional Design Specification — Add Torrent Workbench**

**Status:** Final Authority
**Surface Type:** Blocking Modal (Gatekeeper)
**Visual Layer:** Layer 2 Glass
**Interaction Model:** VS Code–style Kinetic Workbench
**Audience:** Power users, desktop-first

---

## **0. Authority & Constraints**

This specification is **subordinate to AGENTS.md — TinyTorrent Mission Specification**.

All global rules apply **in full**, including:

* Desktop tool, not a webpage
* Confident sizing (no compact UI)
* Zero-literal / No-magic-numbers mandate
* Semantic token usage only
* HeroUI governs controls
* `react-resizable-panels` governs layout
* Framer Motion governs motion
* Deterministic, explicit behavior only
* No custom file browsers
* No hidden “smart” behavior

If any conflict exists, **AGENTS.md takes precedence**.

---

## **1. Purpose & Role**

The **Add Torrent Workbench** is the **gatekeeper interface**.

Its role is to convert a raw torrent or magnet into a **fully defined, deterministic task** before it enters the system.

This is **not** a wizard, **not** a form, and **not** a temporary dialog.

It is a **command center**.

---

## **2. High-Level Layout**

### **Container**

* Component: `Modal`
* Visual Layer: **Layer 2 Glass**
* Behavior:

  * Keyboard focus trapped
  * Escape closes (Cancel)
  * Does not scroll at the window level
  * The modal must never scroll. All overflow is clipped at the window level.


### **Internal Structure**

Pane A and Pane B are persistent siblings within the same resizable container. They always share the same horizontal space. Resizing redistributes visibility only and never alters behavior, state, or responsibility.

* **Horizontal Resizable Split View**
* Implemented with `react-resizable-panels`
* Two panes **always mounted**

```
┌────────────── Pane A ──────────────┬────────────── Pane B ──────────────┐
│ Context & Configuration            │ Payload Inspection                  │
│                                    │                                     │
│ Save Location                      │ File Tree / File Hero               │
│ Disk Reality                       │                                     │
│ Name                               │                                     │
│ Advanced Options                   │                                     │
│                                    │                                     │
└────────────────────── Footer (Commit Authority) ─────────────────────────┘
```

---

## **3. Resizable Behavior (Kinetic Requirement)**

* Divider (“sash”) between panes:

  * Invisible by default
  * Becomes visible on hover
  * Cursor: `col-resize`
* Dragging resizes panes **live**
* Double-click sash:

  * Auto-fits Pane A to minimum width required by its content
* Pane A:

  * Has minimum width (decision safety)
  * Cannot collapse
* Pane B:

  * Always receives remaining space
* Pane sizes persist per user/session

---

## **4. Pane A — Context & Configuration**

**Purpose:** Declare intent.
**Visual:** Subtly tinted glass (`content2` semantics).

### **4.1 Save Location (Primary Control)**

* Component: HeroUI `Input`, large size
* Variant: Faded
* Always visible

#### **Capabilities**

1. **Manual Editing**

   * Direct text input
2. **Native Browse**

   * Folder icon opens OS-native directory picker
3. **Drop-to-Fill**

   * Accepts dragged **folders** from the OS
   * On drop:

     * Input receives focus ring
     * Path updates immediately
     * Disk Reality recalculates
4. **History**

   * On focus: dropdown of recent paths
   * Entries visually indicate drive type (SSD/HDD/Network)

Invalid paths surface inline errors and do **not** mutate state.

---

### **4.2 Disk Reality Indicator**

* Location: Immediately below Save Location
* Text-based (no bars)

#### **States**

* **Sufficient Space:** neutral/success tone
  `Free: X — Required: Y`
* **Insufficient Space:** danger tone
  `Insufficient Space (-Z)`
* **Unknown:** hidden

Purely informational. Never blocks or auto-changes behavior.

---

### **4.3 Name**

* Simple text input
* Defaults to torrent metadata name
* Editable
* No side effects

---

### **4.4 Advanced Options (Progressive Disclosure)**

* Component: `Accordion`
* Single item: “Advanced Options”
* Collapsed by default

#### **Contents**

* Category (Select)
* Sequential Download (Checkbox)
* Skip Hash Check (Checkbox)

Options never auto-toggle each other.

---

## **5. Pane B —  Payload & Resolution**

**Purpose:** Sculpt the payload when metadata is available; present a resolution state otherwise.
**Visual:** Transparent over Layer 2 glass. Acts as a fixed-height data viewport.


---

### **5.1 Toolbar**

Located above the file list.

#### **Elements**

1. **Search**

   * Filters file tree in real time
2. **Smart Select (Explicit Commands)**

   * Videos Only
   * Largest File Only
   * Invert Selection

These are **commands**, not recommendations.

---

### **5.2 File Tree (Virtualized)**

* Mandatory virtualization
* Rows never shrink below comfortable hit size
* Row anatomy:

  * Checkbox
  * File-type icon
  * Filename
  * Size

#### **Geometry & Text Rules (Non-Negotiable)**

* Rows use a single fixed height (`h-row`).
* Text never wraps.
* Overflowing filenames are truncated with ellipsis.
* Full filenames are revealed via hover tooltip or inline rename.
* Row height must never change based on content.

#### **Scroll Ownership Rules**

* The modal window never scrolls.
* Pane A never scrolls.
* Pane B owns vertical scrolling exclusively.
* No nested scroll containers are allowed.
* Horizontal scrolling is permitted inside Pane B only.

---

### **5.3 Selection Model**

#### **Mouse**

* Click → select
* Ctrl/Cmd + Click → additive
* Shift + Click → range
* **Paint Selection**

  * Drag **starting on a checkbox**
  * Toggles checkbox state across rows

#### **Keyboard**

* Arrow Up/Down → focus row
* Space → toggle focused checkbox
* Shift + Arrow → range select

---

### **5.4 Visual Logic**

* **Directory Flattening**

  * Single-child folder chains rendered as breadcrumb (`A / B /`)
  * Visual only; structure unchanged
* **File Type Coloring**

  * Video → `primary`
  * Text/Subtitles → `default`
  * Binary/Other → `secondary`
* Color never implies danger or recommendation

---

### **5.5 Single-File Mode**

If exactly one file exists:

* Pane B renders a **File Hero Card**
* Shows:

  * Name (inline rename)
  * Size
  * Priority
* Pane A remains unchanged

## **5.6 Magnet Resolution State (Two-Phase Model)**

Magnet links do not provide file metadata at entry time. The workbench must therefore operate in **two explicit phases** without changing layout or remounting panes.

### **Phase 1 — Intent Capture (Pre-Metadata)**

* Pane A: **Fully active**
  * Save Location
  * Name (defaults to placeholder, e.g. “Resolving magnet…”)
  * Advanced Options
* Pane B: **Resolution View**
  * Centered resolving indicator
  * Text: “Fetching torrent metadata…”
  * No file tree, no file controls

User actions allowed during Phase 1:
* Change Save Location
* Edit Name
* Select Add & Start / Add Paused / Add to Top
* Configure Advanced Options

No browsing or file inspection is possible during this phase.

### **Phase 2 — Payload Inspection (Post-Metadata)**

When metadata becomes available:

* Pane B transitions **in place** from Resolution View to:
  * File Tree (multi-file), or
  * File Hero Card (single-file)
* Disk Reality recalculates
* Footer commit action becomes fully enabled

The window layout, pane sizes, focus, and scroll state **must not reset**.

---

## **6. Footer — Commit Authority**

**Purpose:** Execute exactly one action.

### **Layout**

* Right-aligned
* Visually distinct glass layer

---

### **6.1 Cancel**

* Button
* Closes modal
* Discards state

---

### **6.2 Commit Action (Split Button)**

* Component: HeroUI `ButtonGroup`
* Primary button uses `variant="shadow"`

#### **Behavior**

* Primary button label always reflects **current action**:

  * Add & Start
  * Add Paused
  * Add to Top
* Dropdown changes the mode
* Changing mode updates the primary label immediately

No hidden state. No ambiguity.

---

## **7. Drag & Drop (Global)**

* Full-window drop detection
* Dragging a `.torrent` file or a magnet URI (from browser, text selection, or clipboard) over the window:

  * Glass overlay appears
  * Background remains visible
* Dropping:

  * Opens this modal
  * Parses immediately

---

## **8. Motion & Feedback**

Motion exists to **clarify structure**, never to decorate.

* Pane resizing → smooth
* Tree filtering/sorting → layout animation
* Selection changes → subtle row motion
* Buttons → micro-scale on hover/press
* Modal entry/exit → fade + depth bloom

All motion uses Framer Motion.

---

## **9. Accessibility & Focus**

* Modal traps focus
* Initial focus:

  * Save Location if empty
  * Name if path already resolved
* Keyboard fully functional
* Color never sole indicator

---

## **10. Performance & Stability**

* No synchronous disk probing on keystroke
* No unnecessary re-renders
* No layout thrash
* Skeletons shown while metadata parses
* Footer commit action disabled until metadata is ready; mode selection remains available.
* Virtualized lists must assume fixed row heights to preserve layout stability.


---

## **11. Explicit Non-Goals**

* No tabs
* No compact UI
* No custom file browser
* No implicit defaults
* No auto-decisions
* No wizard steps

---

## **12. Definition of Done**

This workbench is complete when:

* It feels like a **native desktop tool**
* Every interaction is obvious and reversible
* Long filenames are never punished
* Keyboard and mouse users are equally fast
* Changing global scale knobs preserves harmony
* Nothing feels “webby”

---

### **North-Star Test**

> *Does this make the user feel more powerful, more confident, and in control?*

If not — it’s wrong.

---

**End of Specification.**
