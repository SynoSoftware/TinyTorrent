# Text Role System Migration Guide

## Directive (Authoritative)

Goal: Feature code must not own styling. All visual recipes must come from shared semantic tokens/primitives; if a shared token is missing, stop and ask before adding any feature-specific token.

Anti-goal: moving inline classes into feature-prefixed constants (like PEERS_* / SETTINGS_*).

## Quick Start

### Before (scattered className strings):
```tsx
<h2 className="text-scaled font-bold uppercase tracking-label text-foreground">
    Dashboard
</h2>
<p className="text-label font-bold uppercase tracking-label text-foreground/60">
    Status
</p>
<span className="font-mono text-label uppercase tracking-widest text-foreground/70">
    magnet:?xt=...
</span>
```

### After (semantic text roles):
```tsx
import { TEXT_ROLE } from "@/config/textRoles";

<h2 className={TEXT_ROLE.headingLarge}>Dashboard</h2>
<p className={TEXT_ROLE.label}>Status</p>
<span className={TEXT_ROLE.codeCaption}>magnet:?xt=...</span>
```

---

## Why This Matters

**Problems with inline className strings:**
1. **Inconsistency**: Same intent, different strings (`text-foreground/60` vs `/50` vs `/70`)
2. **Fragility**: Typography changes require 50+ file edits
3. **Bugs**: Typos in long className strings go unnoticed
4. **No IDE support**: Can't autocomplete or find usages
5. **No type safety**: Strings can drift, break themes

**Benefits of TEXT_ROLE:**
1. **Single source of truth**: Change once, updates everywhere
2. **Semantic naming**: `TEXT_ROLE.label` is clearer than `text-label font-bold...`
3. **Type-safe**: Autocomplete + IntelliSense
4. **Find all usages**: Cmd+Click to see where each role is used
5. **Compile-time safety**: Typos caught immediately

---

## Migration Strategy

### Phase 1: High-frequency patterns (quick wins)

- [x] Migrate common inline typography patterns to `TEXT_ROLE` (`label`, `heading`, `codeCaption`, `bodyMuted`)

Search for these common patterns and replace:

```bash
# Pattern 1: Labels
Find: className="text-label font-bold uppercase tracking-label text-foreground/60"
Replace: className={TEXT_ROLE.label}

# Pattern 2: Headings
Find: className="text-scaled font-bold text-foreground"
Replace: className={TEXT_ROLE.heading}

# Pattern 3: Code captions
Find: className="font-mono text-label uppercase tracking-widest"
Replace: className={TEXT_ROLE.codeCaption}

# Pattern 4: Body text
Find: className="text-scaled text-foreground/70"
Replace: className={TEXT_ROLE.bodyMuted}
```

### Phase 2: Component-specific patterns

- [x] Migrate component-specific text patterns to `TEXT_ROLE_EXTENDED`

**StatusBar.tsx:**
```tsx
// Before
<span className="font-bold uppercase tracking-0-2 text-foreground/30">
    {label}
</span>

// After
import { TEXT_ROLE_EXTENDED } from "@/config/textRoles";
<span className={TEXT_ROLE_EXTENDED.statusBarLabel}>
    {label}
</span>
```

**TorrentDetails headers:**
```tsx
// Before
<h3 className="text-scaled font-semibold uppercase tracking-tight text-foreground/50">
    Peers
</h3>

// After
<h3 className={TEXT_ROLE.headingSection}>Peers</h3>
```

**Modal titles:**
```tsx
// Before
<h2 className="text-scaled font-bold uppercase tracking-label text-foreground">
    Add Torrent
</h2>

// After
<h2 className={TEXT_ROLE_EXTENDED.modalTitle}>Add Torrent</h2>
```

### Phase 3: Dynamic variants (use helpers)

- [x] Use `withOpacity()` / `withColor()` only where semantic roles need explicit variants

When you need opacity/color variants:

```tsx
import { TEXT_ROLE, withOpacity, withColor } from "@/config/textRoles";

// Dynamic opacity
<p className={withOpacity(TEXT_ROLE.body, 50)}>Faded text</p>

// Dynamic color
<span className={withColor(TEXT_ROLE.label, "success")}>
    Success
</span>
```

---

## How to Add New Roles

If you find a text pattern used 3+ times that isn't covered:

1. **Add to TEXT_ROLE (common patterns)**:
```typescript
// In textRoles.ts
export const TEXT_ROLE = {
    // ... existing roles
    myNewRole: "text-scaled font-medium text-foreground/80",
} as const;
```

2. **Add to TEXT_ROLE_EXTENDED (specific contexts)**:
```typescript
export const TEXT_ROLE_EXTENDED = {
    // ... existing roles
    mySpecialContext: "text-label uppercase tracking-wide text-primary",
} as const;
```

3. **Document it**:
```typescript
// --- My Feature Area ---
myNewRole: "text-scaled font-medium text-foreground/80", // Brief description
```

---

## Component Examples

### FileExplorerTree.tsx

**Before:**
```tsx
<div className="grid grid-cols-file-tree items-center px-panel py-tight border-b border-default-200/50 bg-default-100/50 text-label font-bold uppercase tracking-label text-default-500 z-sticky">
    <span>Name</span>
    <span>Size</span>
    <span>Priority</span>
</div>
```

**After:**
```tsx
import { TEXT_ROLE_EXTENDED } from "@/config/textRoles";

<div className={cn(
    "grid grid-cols-file-tree items-center px-panel py-tight z-sticky",
    "border-b border-default-200/50 bg-default-100/50",
    TEXT_ROLE_EXTENDED.fileTreeHeader
)}>
    <span>Name</span>
    <span>Size</span>
    <span>Priority</span>
</div>
```

### CommandPalette.tsx

**Before:**
```tsx
<div className="text-scaled font-semibold uppercase tracking-0-2 text-default-500">
    {section.label}
</div>
```

**After:**
```tsx
<div className={TEXT_ROLE_EXTENDED.commandSection}>
    {section.label}
</div>
```

### StatusBar.tsx

**Before:**
```tsx
<span className="font-bold uppercase tracking-0-2 text-foreground/30">
    {t("statusbar.download")}
</span>
<span className="text-scaled text-foreground">
    {formatSpeed(download)}
</span>
```

**After:**
```tsx
<span className={TEXT_ROLE_EXTENDED.statusBarLabel}>
    {t("statusbar.download")}
</span>
<span className={TEXT_ROLE_EXTENDED.statusBarValue}>
    {formatSpeed(download)}
</span>
```

---

## Testing Your Migration

- [x] **Build should pass**: `npm run build`
- [ ] **Visual regression**: Compare screenshots before/after
- [x] **Search for patterns**: Ensure no orphaned long strings remain
   ```bash
   # Find remaining long className strings (likely unmigrated)
   rg 'className="[^"]{60,}"' frontend/src
   ```

---

## Rules

1. **Never inline long typography strings** (≥ 3 utility classes)
2. **Always use TEXT_ROLE** for text-related styling
3. **Use TEXT_ROLE_EXTENDED** for context-specific text
4. **Composition is OK**: `cn(TEXT_ROLE.label, "mb-2")`
5. **Don't create TEXT_ROLE for one-off styles** (inline is fine for unique cases)

---

## FAQ

**Q: When should I use TEXT_ROLE vs TEXT_ROLE_EXTENDED?**  
A: Use TEXT_ROLE for general patterns (labels, headings, body). Use EXTENDED for specialized contexts (statusBar, modal, chart).

**Q: Can I combine TEXT_ROLE with additional classes?**  
A: Yes! `cn(TEXT_ROLE.label, "mb-4")` is fine. The role handles typography, you add layout.

**Q: What about one-off styles?**  
A: If it appears < 3 times and is truly unique, inline is OK. Don't create roles for everything.

**Q: Should I migrate everything at once?**  
A: No. Migrate file-by-file as you touch code. Start with high-traffic components.

**Q: What if I need a slight variant?**  
A: Use `withOpacity()` or `withColor()` helpers, or compose: `cn(TEXT_ROLE.label, "text-warning")`.

---

## Deprecated TEXT_ROLES → TEXT_ROLE Mapping

The legacy `TEXT_ROLES` object in `logic.ts` is still referenced in **16 places**
across 5 files.  These must be migrated using the following map:

| Legacy Key | Legacy Definition | New Equivalent |
|------------|-------------------|----------------|
| `TEXT_ROLES.primary` | `text-scaled font-semibold text-foreground` | `TEXT_ROLE.bodyStrong` |
| `TEXT_ROLES.secondary` | `text-scaled text-foreground/70` | `TEXT_ROLE.bodyMuted` |
| `TEXT_ROLES.label` | `HEADER_BASE text-label` (double `text-label`) | `TEXT_ROLE.label` |
| `TEXT_ROLES.helper` | `text-label text-foreground/60` | `TEXT_ROLE.caption` |

### Files still using deprecated TEXT_ROLES

| File | Refs | Keys Used |
|------|------|-----------|
| `TorrentDetails_Peers.tsx` | 2 | `.primary`, `.label` |
| `TorrentDetails_Pieces_Map.tsx` | 8 | `.label` (×5), `.secondary` (×3) |
| `TorrentDetails_Pieces_Heatmap.tsx` | 1 | `.label` |
| `TorrentDetails_Pieces.tsx` | 4 | `.label` (×2), `.secondary`, `.helper` |
| `TorrentDetails_Trackers.tsx` | 1 | `.primary` |

> **Migrate all 16 references before deleting `TEXT_ROLES` from `logic.ts`.**

- [x] `TorrentDetails_Peers.tsx`
- [x] `TorrentDetails_Pieces_Map.tsx`
- [x] `TorrentDetails_Pieces_Heatmap.tsx`
- [x] `TorrentDetails_Pieces.tsx`
- [x] `TorrentDetails_Trackers.tsx`

---

## Boundary: What TEXT_ROLE Does NOT Cover

Interactive state styling (`hover:`, `focus:`, `active:`, `group-hover:`) is
**not** part of TEXT_ROLE.  These belong in a separate `INTERACTIVE_RECIPE`
system (see `CONSISTENCY_AUDIT.md` §1).

If you're tempted to add `hover:text-foreground` to a TEXT_ROLE — stop.
That's an interactive recipe, not a text role.

---

## Priority Files to Migrate (High ROI)

These files have the most scattered text className strings:

- [x] **StatusBar.tsx** (9 inline patterns)
- [x] **CommandPalette.tsx** (4 patterns)
- [x] **AddTorrentModal.tsx** (8+ patterns)
- [x] **TorrentDetails_*.tsx** files (multiple per file + 16 deprecated `TEXT_ROLES` refs)
- [x] **SettingsModalView.tsx** (6 patterns)
- [x] **DevTest.tsx** (20+ patterns)

**Estimated effort**: ~2-4 hours total for top 6 files  
**Estimated gain**: 50+ fewer scattered strings, cleaner git diffs, easier theming
