# Consistency Audit — Gaps Not Covered by Existing Plans

## Directive (Authoritative)

Goal: Feature code must not own styling. All visual recipes must come from shared semantic tokens/primitives; if a shared token is missing, stop and ask before adding any feature-specific token.

Anti-goal: moving inline classes into feature-prefixed constants (like PEERS_* / SETTINGS_*).

**Scope**: This document identifies className inconsistencies the existing plans
(`TEXT_ROLE_MIGRATION.md` and `SURFACE_CLEANUP_PLAN.md`) do **not** address.
Each section proposes a concrete normalization strategy that can be scheduled
alongside or after the surface/text-role migrations.

---

## 1. Interactive State Recipes  (Priority: HIGH)

### Problem

~131 instances of `hover:`, `focus:`, `active:`, `group-hover:` spread across
~20 files.  Same logical intent → different hover opacity, color, and scale
values.

| Intent | File A | File B | Discrepancy |
|--------|--------|--------|-------------|
| Context-menu item hover | `TorrentDetails_Peers.tsx` → `hover:bg-content1/10` | `glass-surface.ts` → `hover:bg-content2/70` | Different base color + opacity |
| Close/dismiss button hover | `SettingsModalView.tsx` → `hover:text-foreground` | `AddTorrentModal.tsx` → `hover:text-foreground` (duplicated independently) | Same string, no shared token |
| Action button press | `SettingsBlockRenderers.tsx` → `bg-primary/10 hover:bg-primary/20 active:scale-95` | `window-control-button.tsx` → `hover:bg-primary/10` (different base) | Different opacity levels |
| Nav button hover | `Navbar.tsx` → inline palette duplicate | `logic.ts` → `STATUS_PALETTE.*.button` | Navbar re-implements what palette already defines |

### Proposed Fix

Create an `INTERACTIVE_RECIPE` token map in `frontend/src/config/logic.ts`:

```ts
export const INTERACTIVE_RECIPE = {
  // --- Buttons ---
  buttonDefault: "transition-colors hover:bg-content2/50 active:scale-[0.97]",
  buttonPrimary: "transition-colors hover:bg-primary/20 active:scale-[0.97]",
  buttonDanger:  "transition-colors hover:bg-danger/10 text-danger hover:text-danger-600",
  buttonGhost:   "transition-colors hover:text-foreground hover:bg-content2/30",

  // --- Menu Items ---
  menuItem:      "transition-colors hover:bg-content2/50 cursor-pointer",
  menuItemDanger:"transition-colors hover:bg-danger/10 text-danger cursor-pointer",

  // --- Dismiss/Close ---
  dismiss:       "transition-colors hover:text-foreground hover:bg-content2/30 rounded-full",

  // --- Nav / Tab ---
  navItem:       "transition-colors hover:text-foreground hover:bg-foreground/5",

  // --- Group-hover (parent triggers child change) ---
  groupReveal:   "group-hover:opacity-100 opacity-0 transition-opacity",
} as const;
```

**Migration path**: Same staged approach as TEXT_ROLE — high-frequency files
first (Navbar, StatusBar, SettingsBlockRenderers, context menus).

---

## 2. Alert / Status Panel Surfaces  (Priority: HIGH)

### Problem

The identical warning/danger panel pattern is hand-written in **7+ locations**
with slight border-opacity drift:

| File | Pattern |
|------|---------|
| `logic.ts` (STATUS_PALETTE.warning.panel) | `border-warning/30 bg-warning/10 text-warning` |
| `logic.ts` (STATUS_PALETTE.danger.panel) | `border-danger/40 bg-danger/5 text-danger` |
| `SettingsModalView.tsx:189` | `border-warning/30 bg-warning/10 text-warning` ← matches |
| `SettingsModalView.tsx:212` | `border-danger/40 bg-danger/5 text-danger` ← matches |
| `AddTorrentModal.tsx:753` | `text-danger text-label bg-danger/10 p-tight rounded-panel border border-danger/20` ← **differs** (`/20` border, not `/40`) |
| `AddTorrentModal.tsx:761` | `text-warning text-label bg-warning/10 p-tight rounded-panel border border-warning/20` ← **differs** |
| `TorrentDetails_Content.tsx:88` | `p-panel space-y-3 border border-warning/30 bg-warning/10` ← matches but layout tangled in |
| `TorrentDetails_Speed.tsx:29` | `border-warning/30 bg-warning/10 p-panel text-scaled text-warning` ← matches |
| `TorrentDetails_General.tsx:96` | `p-panel border border-warning/30 bg-warning/10` ← matches |
| `DiskSpaceGauge.tsx:58` | `border-danger/40 bg-danger/5` ← uses danger panel, matches |
| `settings-tabs.ts:192` | `border-warning/30 bg-warning/5` ← **differs** (`/5` not `/10`) |

### Proposed Fix

This is a **semantic component** gap in SURFACE_CLEANUP_PLAN.  Add an
`<AlertPanel>` component:

```tsx
// frontend/src/shared/ui/layout/AlertPanel.tsx
type AlertSeverity = "warning" | "danger" | "info";

const severityMap = {
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger:  "border-danger/40 bg-danger/5 text-danger",
  info:    "border-primary/30 bg-primary/5 text-primary",
};

export function AlertPanel({ severity, children, className }: {
  severity: AlertSeverity;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      "rounded-panel border p-panel text-scaled",
      severityMap[severity],
      className,
    )}>
      {children}
    </div>
  );
}
```

Then fix the `STATUS_PALETTE` in `logic.ts` to be authoritative (all border
opacities resolve to the **same** value for each severity), and consume
`AlertPanel` everywhere instead of inline strings.

**Add to SURFACE_CLEANUP_PLAN Phase 1.5 and Quick Reference table.**

---

## 3. Deprecated TEXT_ROLES → TEXT_ROLE Migration Map  (Priority: HIGH)

### Problem

16 references to deprecated `TEXT_ROLES` from `logic.ts` remain. The
`TEXT_ROLE_MIGRATION.md` plan and `MIGRATION_MAP` in `textRoles.ts` **do not
document** how the deprecated keys map to the new system:

| Deprecated Key | Current Definition | Closest TEXT_ROLE Equivalent | Notes |
|----------------|--------------------|------------------------------|-------|
| `TEXT_ROLES.primary` | `text-scaled font-semibold text-foreground` | `TEXT_ROLE.bodyStrong` | Exact match |
| `TEXT_ROLES.secondary` | `text-scaled text-foreground/70` | `TEXT_ROLE.bodyMuted` | Exact match |
| `TEXT_ROLES.label` | `HEADER_BASE + text-label` (redundant double `text-label`) | `TEXT_ROLE.label` | Remove double `text-label` |
| `TEXT_ROLES.helper` | `text-label text-foreground/60` | `TEXT_ROLE.caption` | Closest intent match |

### Proposed Fix

Add these to the `MIGRATION_MAP` in `textRoles.ts`:

```ts
// Deprecated TEXT_ROLES mappings
"text-scaled font-semibold text-foreground": "TEXT_ROLE.bodyStrong",
"text-scaled text-foreground/70": "TEXT_ROLE.bodyMuted",
"text-label text-foreground/60": "TEXT_ROLE.caption",
```

**Affected files** (all in `modules/dashboard/components/`):
- `TorrentDetails_Peers.tsx` (2 refs)
- `TorrentDetails_Pieces_Map.tsx` (8 refs)
- `TorrentDetails_Pieces_Heatmap.tsx` (1 ref)
- `TorrentDetails_Pieces.tsx` (4 refs)
- `TorrentDetails_Trackers.tsx` (1 ref)

---

## 4. Sticky Header Glass Recipe  (Priority: MEDIUM)

### Problem

4 sticky headers use 4 different frosted-glass recipes for the **same pattern**
(sticky header pinned to scroll container):

| File | Recipe |
|------|--------|
| `AddMagnetModal.tsx:110` | `sticky top-0 z-10 … bg-content1/30 backdrop-blur-xl` |
| `useTorrentTableViewModel.ts:739` | `sticky top-0 z-20 … bg-content1/10 backdrop-blur-sm` |
| `TorrentDetails_Trackers.tsx:48` | `sticky top-0 z-sticky bg-background/80 backdrop-blur-md` |
| `SettingsModalView.tsx:131` | `sticky top-0 z-panel … bg-content1/30 blur-glass` |

**All four differ** in z-index, background color, background opacity, and blur
strength.

### Proposed Fix

Define a `STICKY_HEADER` token in `glass-surface.ts` (or a new
`stickyHeader.ts`):

```ts
export const STICKY_HEADER =
  "sticky top-0 z-sticky bg-background/80 backdrop-blur-md";
```

One recipe, all four locations consume it.  The SURFACE_CLEANUP_PLAN should add
this to Phase 1 as a companion to `ModalSurface` / `MenuSurface` — a
**StickyHeader** surface primitive or at minimum a token string.

---

## 5. Z-Index Token Drift  (Priority: MEDIUM)

### Problem

CSS tokens exist (`z-panel: 10`, `z-sticky: 20`, `z-overlay: 30`) but 15+
locations use raw Tailwind values that bypass them:

| Token Equivalent | Raw Value Used In |
|-----------------|-------------------|
| `z-panel` (10) | `TorrentDetails_Pieces_Map.tsx`, `TorrentTable_SpeedColumnCell.tsx`, `Dashboard_Layout.tsx` (×3), `AddMagnetModal.tsx` |
| `z-sticky` (20) | `useTorrentTableViewModel.ts`, `TorrentDetails_Peers_Map.tsx` |
| `z-overlay` (30) | `TorrentTable_Header.tsx`, `StatusBar.tsx` (×2), `Navbar.tsx` |
| _(no token)_ (40) | `useTorrentTableViewModel.ts` (DND overlay), `Dashboard_Layout.tsx` (detail backdrop) |
| _(no token)_ (50) | `CommandPalette.tsx`, `TorrentDetails_Peers.tsx` (context menu), `Dashboard_Layout.tsx` (drag ghost), `TorrentTable_Row.tsx` |

### Proposed Fix

Expand the z-index token set in `index.css` or Tailwind config:

```css
--z-panel: 10;
--z-sticky: 20;
--z-overlay: 30;
--z-dnd: 40;       /* new: DND overlays & detail backdrops */
--z-popover: 50;   /* new: context menus, command palette, drag ghosts */
```

Then replace all raw values:
- `z-10` → `z-panel`
- `z-20` → `z-sticky`
- `z-30` → `z-overlay`
- `z-40` → `z-dnd`
- `z-50` → `z-popover`

---

## 6. Disabled-State Opacity  (Priority: MEDIUM)

### Problem

"Disabled" intent uses two different opacity values interchangeably:

| Value | Files |
|-------|-------|
| `opacity-40` | `window-control-button.tsx`, `SystemTabContent.tsx` (×2), `SettingsBlockRenderers.tsx` |
| `opacity-50` | `FileExplorerTree.tsx`, `SystemTabContent.tsx`, `SettingsBlockRenderers.tsx`, `TorrentTable_Row.tsx`, `TorrentTable_SpeedColumnCell.tsx`, `TorrentTable_ColumnDefs.tsx` (×2), `StatusBar.tsx` |

`SystemTabContent.tsx` and `SettingsBlockRenderers.tsx` even use **both values
in the same file** for the same logical state.

### Proposed Fix

Define tokens in `frontend/src/config/logic.ts`:

```ts
export const VISUAL_STATE = {
  disabled: "opacity-50 pointer-events-none",
  muted:    "opacity-40",     // decorative de-emphasis (not interactive block)
  ghost:    "opacity-20",     // decorative backdrop elements
} as const;
```

Pick **one** value for disabled (recommend `opacity-50` — the more common one)
and migrate all disabled-intent usages.

---

## 7. Transition / Duration Tokens  (Priority: MEDIUM)

### Problem

~60 transition-related classes with inconsistent durations:

| Duration | Intent | Files |
|----------|--------|-------|
| `duration-200` | "fast" interactions | Sidebar, panels |
| `duration-300` | "medium" interactions | Sidebars, modals |
| `duration-500` | "slow" reveals | Decorative |
| `duration-1000`| "ultra-slow" | Accent glow |
| _(none)_ | Tailwind default (150ms) | Most `transition-colors` |

Same intent (sidebar slide) uses `duration-200` in one file and `duration-300`
in another.

### Proposed Fix

Define transition tokens in `frontend/src/config/logic.ts`:

```ts
export const TRANSITION = {
  fast:   "transition-colors duration-150",
  medium: "transition-all duration-200",
  slow:   "transition-all duration-300",
  reveal: "transition-opacity duration-500",
} as const;
```

These compose naturally: `cn(TRANSITION.fast, "hover:bg-content2/50")`.

---

## 8. Scrollbar Strategy Fragmentation  (Priority: MEDIUM)

### Problem

Three different scrollbar CSS strategies for the same intent (scrollable
container with hidden or subtle scrollbar):

| Class | CSS Definition | Used In |
|-------|---------------|---------|
| `scrollbar-hide` | WebKit pseudo-element override (transparent, thin) | `FileExplorerTree.tsx`, `SettingsModalView.tsx` (×2) |
| `overlay-scrollbar` | Overlay-style scrollbar, fades out when idle | `TorrentTable_Body.tsx` |
| `custom-scrollbar` | _(not defined in index.css — dead class?)_ | `AddTorrentSettingsPanel.tsx` |

### Proposed Fix

1. Verify `custom-scrollbar` has actual CSS. If not, it's a no-op — remove it.
2. Decide on **two** scrollbar modes: `scrollbar-hide` (truly hidden) and
   `overlay-scrollbar` (visible on hover).
3. Document when to use each in SURFACE_CLEANUP_PLAN's Quick Reference.

---

## 9. Responsive Breakpoint Strategy  (Priority: LOW)

### Problem

~35 responsive breakpoint usages with no documented strategy. One non-standard
breakpoint exists:

- `Navbar.tsx` uses `min-[800px]:flex` — an arbitrary breakpoint unlike all
  other components that use `sm:`, `md:`, `lg:`, `xl:`.

### Proposed Fix

Document the breakpoint semantics in ARCHITECTURE.md or a dedicated section:

| Breakpoint | Tailwind | Meaning |
|------------|----------|---------|
| Mobile | `< sm` (640px) | Single column, hidden sidebar |
| Compact | `sm` (640px) | Sidebar visible, dual columns |
| Normal | `md` (768px) | Full layout |
| Wide | `lg` (1024px) | Detail panel appears, 3-column |
| Extra-wide | `xl` (1280px) | Extended dashboard grid |

Replace `min-[800px]` with the closest standard breakpoint (`md`).

---

## 10. Grid Layout — No Semantic Layer  (Priority: LOW)

### Problem

SURFACE_CLEANUP_PLAN proposes `<Stack>` (flex-col) and `<Inline>` (flex-row)
but **grid** layout has no semantic equivalent.  ~41 grid usages exist.

Tokenized grid templates (`grid-cols-torrent`, `grid-cols-file-tree`) are fine.
But ad-hoc `grid grid-cols-1 sm:grid-cols-2` (DevTest, ConnectionManager) and
`grid gap-tools` have no semantic wrapper.

### Proposed Fix

Consider a `<Grid>` component only if grid usage grows.  For now, document the
rule: **tokenized grid templates are OK as raw className; ad-hoc `grid-cols-N`
should use the responsive-token system when added.**

Low priority — the two tokenized templates cover most grid usage.

---

## 11. `bg-content1` Opacity Jungle  (Priority: LOW — covered by Surface plan at component level)

### Problem

`bg-content1` is used with **10 different opacity levels**:
`/5`, `/10`, `/15`, `/20`, `/30`, `/35`, `/50`, `/55`, `/80`, `/85`, `/90`.

Most of these will be absorbed by the semantic `<Surface>` / `<ModalSurface>` /
`<MenuSurface>` components in SURFACE_CLEANUP_PLAN.  This section exists as a
tracking note — no additional action needed beyond executing the surface plan.

---

## 12. Surface Role Taxonomy (Single-File Theme Map)  (Priority: HIGH)

### Problem

`glass-surface.ts` is currently both a primitive authority and a broad feature
style registry. That makes it easy to centralize code, but hard to preserve a
small and predictable design vocabulary.

Current risk:
- Navbar, torrent table host, and status bar can drift into separate visual
  materials even when they should read as one workbench surface family.
- The same visual intent is represented by many near-duplicate strings instead
  of a small set of semantic surface roles.

### Target Model (keep one file, enforce role tiers)

Keep the "god file" pattern, but formalize hard internal tiers:

1. **Foundation tokens** (few): border language, blur levels, elevation,
   radius, layer opacity.
2. **Surface roles** (semantic): `surface.workbench`, `surface.panel`,
   `surface.pane`, `surface.inset`, `surface.modal`, `surface.menu`,
   `surface.tooltip`.
3. **Chrome roles** (edge/sticky/divider): `chrome.edgeTop`,
   `chrome.edgeBottom`, `chrome.stickyHeader`, etc.
4. **Feature bindings** (many): `APP_NAV_CLASS`, `TABLE_VIEW_CLASS`,
   `APP_STATUS_CLASS`, etc., but they may only compose roles from tiers 1–3.

### Canonical Workbench Surface Rule

The main app chrome should share one material family:
- Navbar: `surface.workbench + chrome.edgeBottom + chrome.stickyHeader`
- Torrent table host: `surface.workbench` (or inherits from parent) + optional
  `surface.panel` where framed containers are needed
- Status bar: `surface.workbench + chrome.edgeTop`

Variation is allowed for role-specific behavior (stickiness, separators,
content density), not for ad-hoc blur/background/border recipes.

### Multi-Step Implementation Plan

#### Step 1 — Declare role map in `glass-surface.ts`

- Add a top-level `STANDARD_SURFACE_CLASS.layer` and
  `STANDARD_SURFACE_CLASS.role` map.
- Add a `STANDARD_SURFACE_CLASS.chrome` sub-map for edge/sticky/divider rules.
- Keep existing exports intact for backward compatibility.

#### Step 2 — Bind workbench triad to one surface family

- Migrate `APP_NAV_CLASS` surface-bearing entries to compose
  `surface.workbench` + chrome roles.
- Migrate `TABLE_VIEW_CLASS` host/shell surface-bearing entries to compose the
  same role.
- Migrate `APP_STATUS_CLASS.footer` and related shell entries to the same role.

#### Step 3 — Enforce role-only surface decisions

- In feature bindings, disallow new raw additions of
  `bg-*`, `border-*`, `backdrop-blur-*`, `shadow-*`, `rounded-*` unless they
  are in tiers 1–3.
- New visual intent must be introduced as a role token first, then consumed by
  bindings.

#### Step 4 — Collapse duplicates by intent

- Consolidate repeated sticky/header recipes into one chrome role.
- Consolidate repeated panel frame recipes into role-backed `surface.panel` and
  `surface.pane` variants.
- Consolidate floating surfaces (`modal/menu/tooltip`) under
  `surface.modal/menu/tooltip` with role-level defaults.

#### Step 5 — Validation and drift checks

- Validate visual parity of navbar/table/status as one material family.
- Add a checklist item to PR review: "Does this add a new visual recipe or
  compose existing role tokens?"
- Track any unavoidable exceptions with explicit rationale in this audit.

---

## Integration Points with Existing Plans

### TEXT_ROLE_MIGRATION.md — Additions Needed

- [x] **Add deprecated TEXT_ROLES mapping** (Section 3 above) to the Migration
  Strategy, including the 16 affected references and their exact replacements.
- [x] **Add INTERACTIVE_RECIPE** cross-reference: note that interactive states
  (hover text color changes) should NOT be folded into TEXT_ROLE — they belong
  in INTERACTIVE_RECIPE (Section 1 above).
- [x] **Priority Files list**: Add the 5 `TorrentDetails_*.tsx` files that still
  use deprecated `TEXT_ROLES`.

### SURFACE_CLEANUP_PLAN.md — Additions Needed

- [x] **Add `<AlertPanel>`** to Phase 1.5 semantic components (Section 2 above).
- [x] **Add STICKY_HEADER token** to Phase 1 primitives (Section 4 above).
- [x] **Add z-index token expansion** to Phase 5 or a new Phase 0.5 pre-work
  (Section 5 above).
- [x] **Add scrollbar strategy** to Quick Reference (Section 8 above).
- [x] **Add disabled-state token** to validation checklist (Section 6 above).
- [x] **Add `<Toolbar>` note**: the existing `<Toolbar>` proposal also needs
  transition tokens — currently toolbar buttons each define their own
  `transition-colors duration-*`.
- [ ] **Add surface-role taxonomy** (Section 12 above): formalize Foundation →
  Surface Roles → Chrome Roles → Feature Bindings in `glass-surface.ts`.
- [ ] **Add workbench triad migration** (Section 12 above): normalize navbar,
  torrent table host, and status bar to one `surface.workbench` family.

---

## Execution Order Recommendation

These can be batched with the existing plan phases:

| Week | Existing Plan Phase | Add From This Audit |
|------|--------------------|--------------------|
| 0 (pre-work) | — | Z-index token expansion, transition tokens, disabled-state tokens, `STICKY_HEADER` token |
| 1 | Foundation Layer (Surface primitives + semantics) | `<AlertPanel>` component, scrollbar strategy decision |
| 2 | Modal Normalization | Sticky header migration (4 files), deprecated TEXT_ROLES migration (5 files) |
| 3 | Menus & Panels | INTERACTIVE_RECIPE for context menus, nav items |
| 4 | Details & Cleanup | INTERACTIVE_RECIPE for buttons/settings, visual-state tokens everywhere |
| 5 | Surface Role Convergence | Introduce role tiers in `glass-surface.ts`; align navbar/table/status to one workbench surface family |

- [x] Week 0: Z-index token expansion, transition tokens, disabled-state tokens, `STICKY_HEADER` token
- [x] Week 1: `<AlertPanel>` component, scrollbar strategy decision
- [x] Week 2: Sticky header migration (4 files), deprecated TEXT_ROLES migration (5 files)
- [x] Week 3: `INTERACTIVE_RECIPE` for context menus, nav items
- [_] Week 4: `INTERACTIVE_RECIPE` for buttons/settings, visual-state tokens everywhere
  - [x] Normalize `AddTorrentModal.tsx` by moving shell/layout class recipes into `glass-surface.ts` tokens.
  - [x] Normalize `AddTorrentSettingsPanel.tsx` by moving settings-panel layout/state class recipes into `glass-surface.ts` tokens.
  - [x] Normalize `TorrentDetails_Pieces_Heatmap.tsx` by moving heatmap shell/control class recipes into `glass-surface.ts` tokens.
  - [x] Replace feature-prefixed modal/context style APIs with shared semantic names (`SETTINGS_MODAL_*` -> `APP_MODAL_*`, `PEERS_CONTEXT_MENU_*` -> `CONTEXT_MENU_*`, `PEERS_*` -> `SPLIT_VIEW_*`).
  - [x] Merge repeated modal/split/context token groups into shared semantic objects (`APP_MODAL_CLASS`, `SPLIT_VIEW_CLASS`, `CONTEXT_MENU_CLASS`).
  - [x] Merge remaining status/speed/settings token clusters into shared semantic objects (`APP_STATUS_CLASS`, `METRIC_CHART_CLASS`, `FORM_UI_CLASS`, `TORRENT_ADD_FORM_CLASS`) and migrate consumers.
  - [x] Migrate stale consumers from removed flat constants to grouped shared authorities (`COMMAND_PALETTE_CLASS`, `DASHBOARD_LAYOUT_CLASS`, `FILE_BROWSER_CLASS`, `FORM_CONTROL_CLASS`, `SURFACE_ATOM_CLASS`, `INPUT_SURFACE_CLASS`, `METRIC_CHART_CLASS`, `HEATMAP_VIEW_CLASS`).
  - [x] Collapse low-level `glass-surface.ts` exports by internalizing menu/modal helper atoms and grouping torrent-header styling as `TORRENT_HEADER_CLASS`.
  - [x] Remove tracker-specific table styling namespace by migrating `TRACKER_TABLE_CLASS` to shared `DETAIL_TABLE_CLASS` and `buildAvailabilityDotClass`.
  - [x] Collapse standalone modal/menu/frame exports into grouped shared authorities (`MODAL_SURFACE_CLASS`, `SURFACE_CHROME_CLASS`, `MENU_CLASS`, `SURFACE_FRAME_CLASS`) and migrate all consumers.
  - [x] Remove remaining import/magnet-prefixed style authorities by migrating to shared workflow/textarea names (`WORKFLOW_MODAL_CLASS`, `WORKFLOW_FORM_CLASS`, `TEXTAREA_CLASS`, `buildWorkflow*` helpers).
  - [x] Collapse standalone chip/textarea/progress-capacity exports into existing shared authorities (`FORM_CONTROL_CLASS`, `INPUT_SURFACE_CLASS`, `METRIC_CHART_CLASS`) and migrate all consumers.
  - [x] Move status-chip wrapper/content classes and AddMagnet modal header actions to shared token ownership (`FORM_CONTROL_CLASS`, `APP_MODAL_CLASS`).
  - [x] Normalize `FileExplorerTreeRow.tsx` by moving remaining inline row/icon/label recipes to shared `FILE_BROWSER_CLASS` tokens.
  - [x] Normalize `RemoveConfirmationModal.tsx` by moving remaining inline body/footer and checkbox styles to shared modal/form tokens.
  - [x] Normalize `FileExplorerTree.tsx` by moving remaining inline wrappers/empty-state and drag/drop styles to shared `FILE_BROWSER_CLASS` tokens.
  - [x] Normalize `TorrentDetails_Peers_Map.tsx` by moving remaining inline map legend/hud/resize classes to shared `SPLIT_VIEW_CLASS` tokens.
  - [x] Normalize `AddTorrentDestinationGatePanel.tsx` by moving remaining inline gate/status/action classes to shared workflow tokens.
  - [x] Normalize `AddTorrentSettingsPanel.tsx` by moving remaining inline icon/wrapper/danger-item classes to shared workflow tokens.
  - [x] Normalize `AddMagnetModal.tsx` by moving remaining inline header/body/footer/icon classes to shared modal tokens.
  - [x] Normalize `AddTorrentModal.tsx` by moving remaining inline icon/alert text classes to shared workflow tokens.
  - [x] Migrate `AddTorrentModal.tsx` inline icon and footer-alert class recipes to `APP_MODAL_CLASS.workflow` shared keys.
  - [x] Refactor `glass-surface.ts` into one canonical standard-surface authority and add missing semantic surface primitives.
  - [x] Normalize `TorrentRecoveryModal.tsx` by moving remaining inline layout/icon classes to shared modal/surface tokens.
  - [x] Normalize `LanguageMenu.tsx` by moving inline menu item/surface selection classes into shared `MENU_CLASS` tokens.
  - [x] Normalize `AddTorrentFileTable.tsx` by moving inline file-table shell classes into shared workflow/list tokens.
  - [x] Normalize `DiskSpaceGauge.tsx` by moving inline separator/text-size style recipes into shared metric tokens.
  - [_] Continue reducing ad-hoc feature-level class recipes in remaining high-drift files.
  - [x] Normalize `TorrentDetails_Peers.tsx` by moving remaining inline style objects (virtual canvas/rows/context-menu placement) to shared split-view/context token builders.
  - [x] Normalize `TorrentTable_RowMenu.tsx` by moving remaining inline menu section/editor/anchor class+style recipes to shared context-menu token builders.
  - [x] Normalize `TorrentTable_HeaderMenu.tsx` and `TorrentTable_ColumnSettingsModal.tsx` by moving remaining inline menu/item/row recipes to shared menu/table tokens.
  - [x] Normalize `TorrentTable.tsx` by moving remaining inline container/shell class recipes and static style object to shared table tokens.
  - [x] Normalize `Navbar.tsx` by moving remaining inline style objects to shared nav token builders.
  - [x] Normalize `TorrentDetails_Content.tsx` by moving remaining inline container/header class recipes to shared content/surface tokens.
  - [x] Normalize `TorrentDetails_Trackers.tsx` by moving remaining inline icon tone classes to shared detail-table tokens.
  - [x] Normalize `TorrentDetails.tsx` by moving remaining inline root/body class recipes to shared detail-view tokens.
  - [x] Normalize `TorrentDetails_General.tsx` by moving remaining inline layout/panel/icon class recipes to shared detail-view tokens.
  - [x] Normalize `TorrentDetails_Pieces.tsx`, `TorrentDetails_Pieces_Map.tsx`, and `TorrentDetails_Pieces_Heatmap.tsx` by moving remaining inline class/style recipes to shared split/detail token builders.
  - [x] Normalize `TorrentDetails_Speed.tsx` by moving remaining inline surface/layout class recipes to shared detail-view tokens.
  - [x] Normalize `SetLocationEditor.tsx` by moving remaining inline surface/layout/icon recipes to shared form/modal tokens.
  - [x] Normalize `TorrentDetails_Header.tsx` by moving remaining inline layout/tab/header recipes to shared detail-view token builders.
  - [x] Normalize `useTorrentTableColumns.tsx` by moving remaining inline header label/icon class+style recipes to shared table-view tokens.

---
