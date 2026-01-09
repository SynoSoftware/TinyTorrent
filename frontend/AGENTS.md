
# **AGENTS_CORE.md — TinyTorrent Hard Law**

> **Authority:**
> This document is the **highest enforcement layer**.
> If CORE and any other document conflict, **CORE wins**.

---

## **1. Non-Negotiable Runtime Invariants**

1. TinyTorrent is a **local desktop tool**, not a web product.
2. UI exists solely to control the **local daemon it ships with**.
3. Remote connections are **debug/convenience only** and must **never**:

   * remove features
   * alter UX
   * change behavior
4. “Web limitations” are **never** a valid excuse.
   If native Windows UI can do it, TinyTorrent must allow it.

---

## **2. Architectural Law**

### 2.1 Layer Boundaries (Absolute)

```
RPC → services/rpc → hooks/state → components
```

* Components **render only**
* UI **never** calls `fetch`
* UI **never** owns timers (`setInterval`)
* One heartbeat only, owned by `EngineAdapter`

Violation = invalid change.

---

### 2.2 Heartbeat & Data Flow

* Single heartbeat source in `EngineAdapter`
* Default polling:

  * Table: ~1500 ms
  * Details/Graphs: ~500 ms
  * Background: ~5000 ms
* Push mode:

  * Polling stops
  * Heartbeat remains for health only
* Components subscribe via **selectors**
* Unnecessary re-renders are a failure

---

## **3. Zero-Literal Visual Law**

### 3.1 Absolute Prohibition

**In components (.tsx / .css-in-js):**

Forbidden:

* Numeric literals (any)
* Tailwind numeric utilities:

  * `p-*`, `m-*`, `gap-*`, `w-*`, `h-*`, `text-*`, `leading-*`
  * `rounded-*`, `shadow-*`, `blur-*`
* Arbitrary bracket values (`[...]`)
* `calc()` with new coefficients
* Hex / rgb / named Tailwind colors
* `z-index` literals

Violation = rewrite required.

---

### 3.2 Token Pipeline (Mandatory)

All dimensions and colors **must** follow this pipeline:

1. **Intent** → `config/constants.json`
2. **Arithmetic** → `index.css @theme`

   * Geometry: `var(--u) * units * var(--z)`
   * Typography: `var(--tt-font-base) * var(--fz) * units`
3. **Role** → `config/logic.ts`
4. **Usage** → semantic class / var in component

Skipping a step is forbidden.

---

### 3.3 Missing Token Protocol

If a required semantic role does not exist:

1. **Do not implement**
2. Add a `// FLAG:` comment describing the missing role
3. Propose the token via the pipeline

Workarounds are forbidden.

---

## **4. Typography vs Geometry (Hard Separation)**

### Typography-Owned (`--fz`)

* Text
* Icons
* Table row height
* Numeric readouts

### Geometry-Owned (`--u * --z`)

* Padding
* Gaps
* Structural bars
* Borders
* Scrollbars
* Resize / drag hit targets
* Focus rings

**Hard rule:**
No single dimension may derive from both systems.

If conflict arises:

* Geometry **wins**
* Text truncates or scrolls
* Containers **never grow** to fit text

---

## **5. Surface Ownership Law**

Definitions:

* **Surface owner**: defines background, blur, radius, border
* **Structural child**: content rendered inside a surface

Rules:

1. `surfaceStyle` → **surface owners only**
2. Structural children **never** apply surface styles
3. Headers are structural children
4. `outerStyle` → shell chrome only
5. Children assume an ancestor surface exists

Violation = visual corruption.

---

## **6. Glass & Color Law**

* HeroUI semantic tokens **only**
* No manual color math
* No custom hex/rgb
* Every glass surface must have `border-default/*`

Glass layers:

* **L0**: `bg-background` + subtle noise
* **L1**: `backdrop-blur-md bg-background/60 border-default/10`
* **L2**: `backdrop-blur-xl bg-content1/80 shadow-medium border-default/20`

---

## **7. Z-Index Authority**

Allowed tokens only:

* `--z-floor`
* `--z-panel`
* `--z-sticky`
* `--z-overlay`
* `--z-modal`
* `--z-toast`
* `--z-cursor`

Literals are forbidden.

---

## **8. Workbench Layout Law**

* Use `react-resizable-panels` for **all Parts**
* Parts and Panes **never unmount**
* Collapse = size `0`
* Restore previous size on expand
* Handles invisible until hover
* Hover/drag shows **1 px** semantic separator
* DOM continuity is mandatory (scroll, focus, selection)

---

## **9. Interaction Law**

* OS-style selection:

  * Click
  * Ctrl/Cmd + click
  * Shift + range
  * Right-click acts on full selection
* Optimistic UI:

  * UI updates immediately
  * Revert only on RPC error
* Default `user-select: none`
* Explicit `select-text` only where required
* Overlay scrollbars only
* No window scrollbar (`h-screen w-screen overflow-hidden`)

---

## **10. Modals & Focus**

* Modals are **blocking only**

  * Add Torrent
  * Settings
  * Destructive confirms
* Passive data **never** in modals
* Inspector owns details
* One active Part at a time
* Escape clears selection, not focus

---

## **11. Internationalization Law**

* No inline English
* All UI text via `t("key")`
* Only `i18n/en.json` is authoritative

---

## **12. Quality Gates**

Required:

* Virtualization for lists > 50
* Strict TypeScript
* No console noise
* No unused imports
* Absolute imports (`@/`)
* `npm run build` must pass

Forbidden:

* Direct `fetch` in UI
* Component timers
* Conditional pane unmounting
* Shrinking HeroUI for “compactness”
* Destructive git commands without approval

---

## **13. Mandatory Agent Output**

Any UI change must include:

* **Token Mapping** (roles used)
* **Missing Tokens Flagged**
* **Rename Candidates** (report only, no rename)

---

