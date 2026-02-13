# Surface Normalization Cleanup Plan

**Goal**: Eliminate all ad-hoc surface styling and enforce semantic component usage for consistent, maintainable UI patterns.

## Directive (Authoritative)

Goal: Feature code must not own styling. All visual recipes must come from shared semantic tokens/primitives; if a shared token is missing, stop and ask before adding any feature-specific token.

Anti-goal: moving inline classes into feature-prefixed constants (like PEERS_* / SETTINGS_*).

Final-form override:
- No transitional migration tracks.
- No compatibility alias layers.
- No feature-token authorities as end-state.
- Use `report:surface-tree` and `report:surface-tree:all` as required
  evidence for token categorization decisions.

Design quality override:
- Do not flatten visual language just to reduce token count.
- Merge only when visual intent and parent integration are equivalent.
- Keep enough semantic surface roles for clear hierarchy and readability.

**Success Criteria**:
- Every framed container uses **semantic component** (ActionCard, SettingsPanel, ListContainer, etc.)
- Every layout pattern uses **semantic container** (Stack, Inline, FormSection, Toolbar)
- Every page/workbench wrapper uses **Section** component  
- Every modal uses **ModalSurface** component
- Every menu/popover uses **MenuSurface** component
- No feature code defines `blur-glass`, `backdrop-blur-*`, `border-*`, `shadow-*`, or `rounded-*` directly
- No feature code uses raw `flex flex-col` or `flex gap-*` patterns (all via Stack/Inline)
- Semantic naming enforces logical consistency (all action buttons use ActionCard, all settings use SettingsPanel)
- Visual hierarchy remains intentional and non-neutered across parent/child
  surface boundaries.

### Merge Decision Rule (Authoritative)

A similar-looking surface may be merged only if all checks pass:
1. Same semantic intent.
2. Same parent integration behavior.
3. Same interaction behavior across states (`hover`, `focus`, `active`, disabled).
4. Same readability and contrast outcomes across themes.

If any check fails, keep separate semantic tokens.

---

## Current State Analysis

### Problems Found

**1. Ad-hoc blur/backdrop usage** (19 instances)
- `backdrop-blur-xl`, `backdrop-blur-3xl`, `backdrop-blur-md`, `blur-glass` scattered across:
  - AddTorrentModal.tsx (5 instances)
  - SettingsModalView.tsx (6 instances)
  - TorrentDetails_*.tsx (3 instances)
  - CommandPalette.tsx (1 instance)
  - DevTest.tsx (1 instance)
  - Dashboard_Layout.tsx (1 instance)
  - WorkspaceShell.tsx (3 instances)

**2. Direct surface-layer-* usage** (23 instances)
- Components using `surface-layer-0/1/2` directly instead of through `<GlassPanel>`:
  - DevTest.tsx (10 instances)
  - AddTorrentModal.tsx (3 instances)
  - AddTorrentSettingsPanel.tsx (2 instances)
  - AddTorrentDestinationGatePanel.tsx (1 instance)
  - TorrentRecoveryModal.tsx (4 instances)
  - SetLocationEditor.tsx (2 instances)

**3. Inconsistent modal surface shells**
- Each modal implements its own backdrop/frame/blur/shadow recipe
- No shared ModalSurface primitive exists

**4. Inconsistent menu surface shells**
- Custom styling in peer context menus, language menu
- Tooltips have ad-hoc styling
- Mixed HeroUI + custom approaches

**5. Panel/card shell duplication**
- Multiple implementations of bordered/rounded panels
- Inconsistent use of surface tokens

**6. Semantic inconsistency**
- Same UI pattern (e.g., action buttons) styled differently across features
- No naming convention enforcing logical grouping
- Developers must remember which primitive variant to use for which role
- Example: `<div className="surface-layer-1 border...">` for buttons in one place, `<Surface variant="card">` in another

---

## Phase 0: Define Semantic Component Layer

**Why**: Primitives alone don't prevent developers from using different variants for the same logical UI role. We need **semantic components** that enforce consistency.

### 0.1 Audit Current UI Patterns

| UI Pattern | Current Implementations | Variations Found |
|------------|-------------------------|------------------|
| **Action cards** | Destination gates, download buttons | `surface-layer-1 border` vs `bg-content1/10` vs custom |
| **Settings panels** | Interface tab, Downloads tab, Blocklists tab | `bg-content1/10 p-panel rounded-2xl` vs inline divs |
| **List containers** | File tree, peer list, tracker list | `GlassPanel` vs `surface-layer-0` vs plain div |
| **Info displays** | Torrent stats, peer stats, tracker stats | Bare divs vs `surface-layer-0` inconsistently |
| **Workflow steps** | DevTest wizard, recovery wizard | `surface-layer-2 rounded-panel p-panel` repeated 10+ times |
| **Sidebar containers** | Settings sidebar, AddTorrent sidebar | Custom blur recipes vs no standardization |
| **Modal content** | All modal interiors | Each modal has custom padding/gap/structure |
| **Menu items** | Context menus, dropdowns | HeroUI defaults vs custom overrides |

**Finding**: Same logical role = different implementations = visual inconsistency

---

### 0.2 Define Semantic Component Vocabulary

Each semantic component wraps a primitive with **locked configuration** so developers can't deviate.

#### Framing Components (replace surface divs)

```tsx
// Action card - for buttons that perform primary actions
<ActionCard>
  {/* internally: <Surface variant="card" layer={1}> */}
</ActionCard>

// Settings panel - for groups of settings/config UI
<SettingsPanel title="Network" description="...">
  {/* internally: <Surface variant="panel" layer={1} padding="panel"> */}
</SettingsPanel>

// List container - for tables/lists/file trees
<ListContainer>
  {/* internally: <Surface variant="inset" layer={0} padding="none"> */}
</ListContainer>

// Info display - for read-only data/stats (no border, just surface color)
<InfoPanel>
  {/* internally: <Surface variant="bare" layer={0}> */}
</InfoPanel>

// Workflow step - for wizard/multi-step UI cards
<WorkflowStep>
  {/* internally: <Surface variant="panel" layer={2} padding="panel"> */}
</WorkflowStep>

// Sidebar container - for modal/app sidebars
<SidebarPanel>
  {/* internally: <Surface variant="panel" layer={1} padding="tight"> */}
</SidebarPanel>
```

#### Container Components (replace layout divs)

```tsx
// Modal content wrapper - standardized padding/gap for modal interiors
<ModalContent>
  {/* internally: <Section padding="modal-inner"> with flex-col gap-panel */}
</ModalContent>

// Form section - for grouping form fields
<FormSection title="Basic Settings">
  {/* internally: <div className="flex flex-col gap-tools"> */}
</FormSection>

// Toolbar container - for horizontal tool groups
<Toolbar>
  {/* internally: <div className="flex gap-tools items-center"> */}
</Toolbar>

// Stack - for vertical content stacking (replaces flex-col everywhere)
<Stack spacing="tight" | "panel" | "stage">
  {/* internally: <div className="flex flex-col gap-{spacing}"> */}
</Stack>

// Inline - for horizontal content flow
<Inline spacing="tools" | "tight" | "panel">
  {/* internally: <div className="flex gap-{spacing} items-center"> */}
</Inline>
```

#### Surface Components (from Phase 1, but now rarely used directly)

```tsx
// Only use these when semantic components don't fit
<Surface variant="panel" | "inset" | "card" | "bare" layer={0 | 1 | 2}>
<ModalSurface>
<MenuSurface>
```

---

### 0.3 Usage Rules

**DO**:
```tsx
// Clear intent, enforces consistency
<SettingsPanel title="Downloads">
  <FormSection title="Directory">
    <Stack spacing="tools">
      <Input />
      <Checkbox />
    </Stack>
  </FormSection>
</SettingsPanel>

<ActionCard>
  <Button>Download</Button>
</ActionCard>
```

**DON'T**:
```tsx
// Ad-hoc styling, breaks consistency
<div className="surface-layer-1 border border-default/10 rounded-panel p-panel">
  <div className="flex flex-col gap-tools">
    <Input />
  </div>
</div>

// Direct primitive usage for known UI patterns (use semantic component instead)
<Surface variant="panel" layer={1}>
  <Button>Download</Button>
</Surface>
```

**EXCEPTION**: Use primitives directly only when creating a **new** UI pattern not covered by semantic components.

---

### 0.4 Migration Impact

**Before** (primitives only):
- Developer must remember: "action buttons use variant='card' layer={1}"
- Easy to use wrong variant accidentally
- No way to enforce consistency except code review

**After** (semantic layer):
- Developer uses: `<ActionCard>` (no decisions, impossible to get wrong)
- TypeScript enforces correct component usage
- Refactoring = change one semantic component, all usages update

**Code reduction**:
- Before: `<div className="surface-layer-2 rounded-panel p-panel flex flex-col gap-stage">` (82 chars)
- After: `<WorkflowStep>` (14 chars)
- **83% less code per usage**

---

## Phase 1: Create Canonical Surface Primitives

**Note**: These are **low-level primitives** consumed by semantic components. Most feature code will use semantic components instead of primitives directly.

### 1.1 Create `<Surface>` Component

**File**: `frontend/src/shared/ui/layout/Surface.tsx`

**Purpose**: Low-level primitive for all framed containers (consumed by ActionCard, SettingsPanel, etc.)

**Variants**:
```tsx
type SurfaceVariant = 
  | "panel"      // Standard panel frame (rounded-panel, border, padding)
  | "inset"      // Inset container (subtle border, tight rounding)
  | "card"       // Elevated card (shadow, rounded)
  | "bare"       // No frame, just surface color

type SurfaceLayer = 0 | 1 | 2; // Existing surface depth system
```

**Props**:
- `variant`: SurfaceVariant
- `layer`: SurfaceLayer
- `padding?`: "none" | "tight" | "panel" | "stage"
- `className?`: string (for layout only, not surface styling)

**Implementation**:
- Uses `surface-layer-{n}` from CSS
- Handles `rounded-panel`, `border-default/10`, padding via variant
- NO blur, shadow, or backdrop classes (those belong to modal/menu shells)

---

### 1.2 Create `<ModalSurface>` Component

**File**: `frontend/src/shared/ui/layout/ModalSurface.tsx`

**Purpose**: Single primitive for all modal/dialog overlays

**Structure**:
```tsx
<ModalSurface>
  <ModalBackdrop />     // Fixed backdrop with blur
  <ModalFrame>          // Centered frame with shadow/border
    {children}
  </ModalFrame>
</ModalSurface>
```

**Consumes**: 
- `GLASS_MODAL_SURFACE` from glass-surface.ts
- `MODAL_SURFACE_FRAME` tokens
- Standardized backdrop blur, shadow-visual-large

**Used by**:
- SettingsModal
- AddTorrentModal
- AddMagnetModal
- TorrentRecoveryModal
- RemoveConfirmationModal
- ColumnSettingsModal

---

### 1.3 Create `<MenuSurface>` Component

**File**: `frontend/src/shared/ui/layout/MenuSurface.tsx`

**Purpose**: Single primitive for all floating menus/popovers

**Consumes**:
- `GLASS_MENU_SURFACE` from glass-surface.ts
- `MENU_SURFACE_FRAME` tokens
- Standardized menu shadow, rounded-modal

**Used by**:
- LanguageMenu
- Peer context menu
- File context menu
- Column settings dropdown
- Any HeroUI Menu overrides

---

### 1.4 Enhance `<Section>` Component

**File**: `frontend/src/shared/ui/layout/Section.tsx` (existing)

**Add missing stage variants**:
- `padding: "workbench"` - For WorkspaceShell main wrapper
- `padding: "modal-inner"` - For modal content padding
- `padding: "centered-stage"` - For command palette wrapper

**Purpose**: Eliminate repeated centered/padded stage wrappers

---

## Phase 1.5: Create Semantic Component Layer

**Purpose**: Build high-level components that enforce logical consistency and eliminate variant decisions.

---

### 1.5.1 Framing Components

> **See also**: `CONSISTENCY_AUDIT.md` for additional gaps (interactive-state
> recipes, alert panels, sticky headers, z-index tokens, transition tokens,
> disabled-state tokens, scrollbar strategy).

**File**: `frontend/src/shared/ui/layout/ActionCard.tsx`

```tsx
import { Surface } from "./Surface";
import type { ReactNode } from "react";

interface ActionCardProps {
  children: ReactNode;
  className?: string; // layout only
}

export function ActionCard({ children, className }: ActionCardProps) {
  return (
    <Surface variant="card" layer={1} className={className}>
      {children}
    </Surface>
  );
}
```

**Used for**: Destination gates, download buttons, wizard action cards

---

**File**: `frontend/src/shared/ui/layout/SettingsPanel.tsx`

```tsx
import { Surface } from "./Surface";
import { TEXT_ROLE } from "@/config/textRoles";
import type { ReactNode } from "react";

interface SettingsPanelProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsPanel({ 
  title, 
  description, 
  children, 
  className 
}: SettingsPanelProps) {
  return (
    <Surface variant="panel" layer={1} padding="panel" className={className}>
      {title && (
        <h3 className={TEXT_ROLE.heading}>{title}</h3>
      )}
      {description && (
        <p className={TEXT_ROLE.description}>{description}</p>
      )}
      {children}
    </Surface>
  );
}
```

**Used for**: All settings tabs, config panels

---

**File**: `frontend/src/shared/ui/layout/ListContainer.tsx`

```tsx
import { Surface } from "./Surface";
import type { ReactNode } from "react";

interface ListContainerProps {
  children: ReactNode;
  className?: string;
}

export function ListContainer({ children, className }: ListContainerProps) {
  return (
    <Surface variant="inset" layer={0} padding="none" className={className}>
      {children}
    </Surface>
  );
}
```

**Used for**: File trees, peer lists, tracker lists, torrent tables

---

**File**: `frontend/src/shared/ui/layout/InfoPanel.tsx`

```tsx
import { Surface } from "./Surface";
import type { ReactNode } from "react";

interface InfoPanelProps {
  children: ReactNode;
  className?: string;
}

export function InfoPanel({ children, className }: InfoPanelProps) {
  return (
    <Surface variant="bare" layer={0} className={className}>
      {children}
    </Surface>
  );
}
```

**Used for**: Read-only stat displays, info cards

---

**File**: `frontend/src/shared/ui/layout/WorkflowStep.tsx`

```tsx
import { Surface } from "./Surface";
import type { ReactNode } from "react";

interface WorkflowStepProps {
  children: ReactNode;
  className?: string;
}

export function WorkflowStep({ children, className }: WorkflowStepProps) {
  return (
    <Surface variant="panel" layer={2} padding="panel" className={className}>
      {children}
    </Surface>
  );
}
```

**Used for**: DevTest wizard, recovery wizard, multi-step modals

---

**File**: `frontend/src/shared/ui/layout/SidebarPanel.tsx`

```tsx
import { Surface } from "./Surface";
import type { ReactNode } from "react";

interface SidebarPanelProps {
  children: ReactNode;
  className?: string;
}

export function SidebarPanel({ children, className }: SidebarPanelProps) {
  return (
    <Surface variant="panel" layer={1} padding="tight" className={className}>
      {children}
    </Surface>
  );
}
```

**Used for**: Settings modal sidebar, AddTorrent settings sidebar

---

**File**: `frontend/src/shared/ui/layout/AlertPanel.tsx`

```tsx
import { cn } from "@heroui/react";
import type { ReactNode } from "react";

type AlertSeverity = "warning" | "danger" | "info";

const severityMap: Record<AlertSeverity, string> = {
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger:  "border-danger/40 bg-danger/5 text-danger",
  info:    "border-primary/30 bg-primary/5 text-primary",
};

interface AlertPanelProps {
  severity: AlertSeverity;
  children: ReactNode;
  className?: string;
}

export function AlertPanel({ severity, children, className }: AlertPanelProps) {
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

**Used for**: Warning/danger banners in AddTorrentModal, TorrentDetails_Content,
TorrentDetails_Speed, TorrentDetails_General, SettingsModalView, DiskSpaceGauge.
Replaces 7+ hand-written `border-warning/30 bg-warning/10 text-warning` strings
that currently have slight drift in border opacity (`/20` vs `/30` vs `/40`).

**Note**: `STATUS_PALETTE.*.panel` in `logic.ts` must also converge on the same
opacities defined here.

---

### 1.5.2 Container Components

**File**: `frontend/src/shared/ui/layout/Stack.tsx`

```tsx
import { cn } from "@heroui/react";
import type { ReactNode } from "react";

type StackSpacing = "tight" | "tools" | "panel" | "stage";

interface StackProps {
  spacing?: StackSpacing;
  children: ReactNode;
  className?: string;
}

const spacingMap: Record<StackSpacing, string> = {
  tight: "gap-tight",
  tools: "gap-tools",
  panel: "gap-panel",
  stage: "gap-stage",
};

export function Stack({ spacing = "panel", children, className }: StackProps) {
  return (
    <div className={cn("flex flex-col", spacingMap[spacing], className)}>
      {children}
    </div>
  );
}
```

**Used for**: Replacing all `flex flex-col gap-*` patterns

---

**File**: `frontend/src/shared/ui/layout/Inline.tsx`

```tsx
import { cn } from "@heroui/react";
import type { ReactNode } from "react";

type InlineSpacing = "tight" | "tools" | "panel";

interface InlineProps {
  spacing?: InlineSpacing;
  align?: "start" | "center" | "end";
  children: ReactNode;
  className?: string;
}

const spacingMap: Record<InlineSpacing, string> = {
  tight: "gap-tight",
  tools: "gap-tools",
  panel: "gap-panel",
};

const alignMap = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
};

export function Inline({ 
  spacing = "tools", 
  align = "center", 
  children, 
  className 
}: InlineProps) {
  return (
    <div 
      className={cn(
        "flex", 
        spacingMap[spacing], 
        alignMap[align], 
        className
      )}
    >
      {children}
    </div>
  );
}
```

**Used for**: Replacing all `flex gap-* items-center` patterns

---

**File**: `frontend/src/shared/ui/layout/FormSection.tsx`

```tsx
import { Stack } from "./Stack";
import { TEXT_ROLE } from "@/config/textRoles";
import type { ReactNode } from "react";

interface FormSectionProps {
  title?: string;
  children: ReactNode;
  spacing?: "tight" | "tools" | "panel";
  className?: string;
}

export function FormSection({ 
  title, 
  children, 
  spacing = "tools", 
  className 
}: FormSectionProps) {
  return (
    <Stack spacing={spacing} className={className}>
      {title && <h4 className={TEXT_ROLE.label}>{title}</h4>}
      {children}
    </Stack>
  );
}
```

**Used for**: All form field groups

---

**File**: `frontend/src/shared/ui/layout/Toolbar.tsx`

```tsx
import { Inline } from "./Inline";
import type { ReactNode } from "react";

interface ToolbarProps {
  children: ReactNode;
  className?: string;
}

export function Toolbar({ children, className }: ToolbarProps) {
  return (
    <Inline spacing="tools" align="center" className={className}>
      {children}
    </Inline>
  );
}
```

**Used for**: All horizontal tool groups

---

### 1.5.3 Export Barrel

**File**: `frontend/src/shared/ui/layout/index.ts`

```tsx
// Primitives (low-level, rarely used directly)
export { Surface } from "./Surface";
export { ModalSurface } from "./ModalSurface";
export { MenuSurface } from "./MenuSurface";
export { Section } from "./Section";
export { GlassPanel } from "./GlassPanel";

// Semantic framing (high-level, most common)
export { ActionCard } from "./ActionCard";
export { SettingsPanel } from "./SettingsPanel";
export { ListContainer } from "./ListContainer";
export { InfoPanel } from "./InfoPanel";
export { WorkflowStep } from "./WorkflowStep";
export { SidebarPanel } from "./SidebarPanel";
export { AlertPanel } from "./AlertPanel";

// Semantic containers (high-level, most common)
export { Stack } from "./Stack";
export { Inline } from "./Inline";
export { FormSection } from "./FormSection";
export { Toolbar } from "./Toolbar";
```

---

## Phase 2: Modal Normalization

### 2.1 SettingsModalView.tsx

**Current Problems**:
- Custom backdrop blur: `bg-content1/50 blur-glass`
- Custom header blur: `bg-content1/30 blur-glass`
- Custom footer blur: `bg-content1/40 blur-glass`
- Custom sidebar blur: `bg-content1/50 blur-glass`
- Custom content blur: `bg-content1/10 blur-glass`

**Action**:
```tsx
// Replace entire modal shell with:
<ModalSurface>
  <SettingsModalContent />  // All internal frame/blur removed
</ModalSurface>

// Internal sections become semantic components:
<SidebarPanel className="settings-sidebar">
  {/* sidebar content */}
</SidebarPanel>

<InfoPanel className="settings-content">
  {/* main content area */}
</InfoPanel>

// All flex-col becomes:
<Stack spacing="panel">
  {/* settings groups */}
</Stack>
```

**Affected lines**: 52, 131, 279, 317, 393

---

### 2.2 AddTorrentModal.tsx

**Current Problems**:
- Custom header blur: `blur-glass`
- Loading overlay blur: `bg-background/40 blur-glass`
- Drop overlay blur: `bg-primary/20 blur-glass`
- File tree header blur: `surface-layer-1 blur-glass`

**Action**:
```tsx
<ModalSurface>
  <AddTorrentModalContent />
</ModalSurface>

// File table uses semantic component
<ListContainer>
  <FileTreeHeader />
  <FileTree />
</ListContainer>

// All flex-col becomes Stack
<Stack spacing="tight">
  {/* content */}
</Stack>

// Settings panel becomes
<SidebarPanel>
  <AddTorrentSettingsPanel />
</SidebarPanel>
```

**Affected lines**: 282, 344, 507, 614

---

### 2.3 TorrentRecoveryModal.tsx

**Current Problems**:
- Direct `surface-layer-1` usage (4 instances)
- Matack spacing="panel">
    <ActionCard>
      {/* icon holder */}
    </ActionCard>
    
    <InfoPanel>
      {/* status content */}
    </InfoPanel>
  </Stackn holder */}
  </Surface>
  
  <Surface variant="panel" layer={1}>
    {/* status content */}
  </Surface>
</ModalSurface>
```

**Affected lines**: 103, 130, 162, 167

---

### 2.4 RemoveConfirmationModal.tsx

**Action**:
- Wrap with `<ModalSurface>`
- Replace any custom backdrop/frame styling

---

### 2.5 AddMagnetModal.tsx

**Action**:
- Wrap with `<ModalSurface>`
- Replace any custom backdrop/frame styling

---

### 2.6 CommandPalette.tsx

**Current Problems**:
- Custom backdrop: `bg-background/90 backdrop-blur-xl`

**Action**:
```tsx
<ModaWorkflowStep>
      <CommandPaletteContent />
    </WorkflowStepvariant="panel" layer={2}>
      <CommandPaletteContent />
    </Surface>
  </Section>
</ModalSurface>
```

**Affected lines**: 150

---

## Phase 3: Menu Normalization

### 3.1 LanguageMenu

**Action**:
- Wrap menu content with `<MenuSurface>`
- Remove any custom border/shadow/rounded styling

---

### 3.2 Peer Context Menu (TorrentDetails_Peers.tsx)

**Current Problems**:
- Ad-hoc tooltip: `border-content1/40 bg-content1/90 backdrop-blur-3xl`

**Action**:
```tsx
<MenuSurface>
  {contextMenuItems}
</MenuSurface>
```

**Affected lines**: 222

---

### 3.3 File Context Menu

**Action**:
- Standardize on `<MenuSurface>`

---

### 3.4 Tooltip Cards (TorrentDetails_Pieces_Map.tsx)

**Current Problems**:
- Ad-hoc tooltip styling: `border-content1/30 bg-content1/90 backdrop-blur-xl`
- Ad-hoc badge styling: `bg-content1/40 backdrop-blur-xl border-content1/25`

**Action**:
```tsx
// Use standardized tooltip from glass-surface.ts
<Tooltip classNames={GLASS_TOOLTIP_CLASSNAMES} />

// Or if custom needed:
<MenuSurface variant="tooltip">
  {content}
</MenuSurface>
```

**Affected lines**: 114, 134

---

## Phase 4: Panel/Card Normalization

### 4.1 TorrentTable Shell

**Action**:
- Wrap table in `<ListContainer>`
- Remove any custom border/rounded/shadow classes

---

### 4.2 FileExplorerTree Container

**Action**:
- Use `<ListContainer>`
- Header becomes part of internal structure (no surface styling)

---

### 4.3 SettingsSection vs SystemSectionCard Divergence

**Action**:
- Both use `<SettingsPanel>`
- Eliminate any styling differences

---

### 4.4 Detail Tab Root Surfaces

**Files**: TorrentDetails_Peers.tsx, TorrentDetails_Trackers.tsx, TorrentDetails_Content.tsx

**Action**:
- Wrap each tab content in `<InfoPanel>` or `<ListContainer>` (depending on content type)
- Remove custom surface styling from tab internals
- Replace all `flex flex-col` with `<Stack>`

**Note**: TorrentDetails_Trackers.tsx sticky header (line 48) uses `bg-background/80 backdrop-blur-md` - needs standardization

---

### 4.5 Chart Cards (TorrentDetails_Speed_Chart.tsx)

**Action**:
- Wrap chart in `<ActionCard>` or `<InfoPanel>` (depending on interactivity)
- Remove custom panel styling

---

### 4.6 Destination Gate Cards (AddTorrentDestinationGatePanel.tsx)

**Current Problems**:
- Direct `surface-layer-1 border border-default/10`

**Action**:
```tsx
<ActionCard>
  <Stack spacing="tools">
    {gateContent}
  </Stack>
</ActionCard>
```

**Affected lines**: 82

---

### 4.7 Settings Panels (AddTorrentSettingsPanel.tsx)

**Current Problems**:
- Direct `surface-layer-1 border border-default/10` (2 instances)

**Action**:
```tsx
<ActionCard>
  <Stack spacing="tools">
    {buttonContent}
  </Stack>
</ActionCard>
```

**Affected lines**: 97, 111

---

### 4.8 SetLocationEditor.tsx

**Current Problems**:
- Direct `surface-layer-1` usage (2 instances)

**Action**:
```tsx
<SettingsPanel>
  <Stack spacing="tight">
    <ActionCard>
      {icon}
    </ActionCard>
    {content}
  </Stack>
</SettingsPanel>
```

**Affected lines**: 32, 39

---

### 4.9 DevTest.tsx

**Current Problems**:
- 10 instances of direct `surface-layer-*` usage
- Ad-hoc footer blur: `bg-content1/85 backdrop-blur-xl`

**Action**:
```tsx
// Section wrapper
<Section padding="stage" className="min-h-screen">

// All workflow steps become WorkflowStep
<WorkflowStep>
  <Stack spacing="stage">
    <ActionCard>
      {content}
    </ActionCard>
  </Stack>
</WorkflowStep>

// All flex-col become Stack
<Stack spacing="tight">
  {items}
</Stack>

// Footer becomes standardized
<InfoPanel className="fixed bottom-0">
  <Inline spacing="tools">
    {footerContent}
  </Inline>
</InfoPanel>
```

**Affected lines**: 40, 78, 276, 304, 324, 342, 352, 455, 482, 572, 579

---

## Phase 5: Stage Wrapper Normalization

### 5.1 WorkspaceShell Stage Wrapper

**Current Problems**:
- Ad-hoc accent blurs: `bg-primary/30 blur-glass opacity-40`
- Ad-hoc HUD blur: `bg-background/75 blur-glass`

**Action**:
```tsx
<Section padding="workbench">
  {/* Accent decorations removed or standardized */}
  <Surface variant="bare" layer={0}>
    {workspaceContent}
  </Surface>
</Section>
```

**Affected lines**: 120, 121, 308

---

### 5.2 Modal Inner Stage Wrappers

**Action**:
- Use `<Section padding="modal-inner">` for all modal content areas
- Eliminates repeated `p-panel sm:p-stage` patterns

---

### 5.3 Command Palette Centered Wrapper

**Action**:
```tsx
<Section padding="centered-stage" centered>
  <Surface variant="panel" layer={2}>
    {commandContent}
  </Surface>
</Section>
```

---

### 5.4 Dashboard_Layout.tsx

**Current Problems**:
- Ad-hoc blur overlay: `bg-background/60 backdrop-blur-sm`

**Action**:
- Use standardized drag overlay component or remove custom blur

**Affected lines**: 385

---

## Implementation Order

### Week 0 (Pre-work): Token Expansion & Strategy Decisions

> See `CONSISTENCY_AUDIT.md` for full details on each item.

**Day 1: Z-index token expansion**
- [x] Expand CSS tokens to cover ALL z-levels currently used in the codebase:
  - [x] `z-panel: 10` (existing)
  - [x] `z-sticky: 20` (existing)
  - [x] `z-overlay: 30` (existing)
  - [x] `z-dnd: 40` (**new** — DND overlays, detail backdrops)
  - [x] `z-popover: 50` (**new** — context menus, command palette, drag ghosts)
- [x] Replace all raw `z-10`/`z-20`/`z-30`/`z-40`/`z-50` with tokens (15+ locations)

**Day 1: Sticky header token**
- [x] Define `STICKY_HEADER` token in `glass-surface.ts`:
  ```ts
  export const STICKY_HEADER = "sticky top-0 z-sticky bg-background/80 backdrop-blur-md";
  ```
- [x] Replace 4 divergent sticky-header recipes across:
  - [x] `AddMagnetModal.tsx`
  - [x] `useTorrentTableViewModel.ts`
  - [x] `TorrentDetails_Trackers.tsx`
  - [x] `SettingsModalView.tsx`

**Day 2: Transition tokens**
- [x] Define in `frontend/src/config/logic.ts`:
  ```ts
  export const TRANSITION = {
    fast:   "transition-colors duration-150",
    medium: "transition-all duration-200",
    slow:   "transition-all duration-300",
    reveal: "transition-opacity duration-500",
  } as const;
  ```
- [x] Migrate ~60 transition-class usages (can be done file-by-file later)

**Day 2: Disabled-state tokens**
- [x] Define in `frontend/src/config/logic.ts`:
  ```ts
  export const VISUAL_STATE = {
    disabled: "opacity-50 pointer-events-none",
    muted:    "opacity-40",
    ghost:    "opacity-20",
  } as const;
  ```
- [x] Fix mixed `opacity-40` / `opacity-50` for disabled intent (~16 locations)

**Day 2: Scrollbar strategy**
- [x] Verify `custom-scrollbar` has CSS definition (likely dead class — remove if no-op)
- [x] Document: `scrollbar-hide` = truly hidden; `overlay-scrollbar` = visible on hover
- [x] Standardize `AddTorrentSettingsPanel.tsx` to use `scrollbar-hide` or `overlay-scrollbar`

---

### Week 1: Foundation Layer (Primitives + Semantics)

**Day 1-2: Low-level primitives**
- [ ] Create `<Surface>` component (primitive)
- [ ] Create `<ModalSurface>` component (primitive)
- [ ] Create `<MenuSurface>` component (primitive)
- [ ] Enhance `<Section>` component (primitive)

**Day 3-4: Semantic framing components**
- [ ] Create `<ActionCard>` (wraps Surface)
- [ ] Create `<SettingsPanel>` (wraps Surface)
- [ ] Create `<ListContainer>` (wraps Surface)
- [ ] Create `<InfoPanel>` (wraps Surface)
- [ ] Create `<WorkflowStep>` (wraps Surface)
- [ ] Create `<SidebarPanel>` (wraps Surface)
- [x] Create `<AlertPanel>` (warning/danger/info banners — see CONSISTENCY_AUDIT.md §2)

**Day 5: Semantic container components**
- [ ] Create `<Stack>` (replaces flex-col)
- [ ] Create `<Inline>` (replaces flex + gap)
- [ ] Create `<FormSection>` (standardized form groups)
- [ ] Create `<Toolbar>` (standardized tool groups)
- [ ] Create barrel export in `shared/ui/layout/index.ts`

**Validation**: All components compile, export correctly, types are strict

---

### Week 2: Modal Normalization (Semantic Migration)
- [ ] SettingsModalView.tsx → `<ModalSurface>` + `<SidebarPanel>` + `<Stack>`
- [ ] AddTorrentModal.tsx → `<ModalSurface>` + `<ListContainer>` + `<SidebarPanel>`
- [ ] TorrentRecoveryModal.tsx → `<ModalSurface>` + `<ActionCard>` + `<InfoPanel>` + `<Stack>`
- [ ] RemoveConfirmationModal.tsx → `<ModalSurface>` + `<Stack>`
- [ ] AddMagnetModal.tsx → `<ModalSurface>` + `<Stack>`
- [ ] CommandPalette.tsx → `<ModalSurface>` + `<WorkflowStep>`

**Validation**: No custom blur/backdrop usage, all modals use semantic components

---

### Week 3: Menus & Panels (Semantic Migration)
- [ ] LanguageMenu → `<MenuSurface>`
- [ ] Peer/File context menus → `<MenuSurface>`
- [ ] Tooltip cards → `<MenuSurface>` or standardized tooltip
- [ ] TorrentTable shell → `<ListContainer>`
- [ ] FileExplorerTree container → `<ListContainer>`
- [ ] Settings sections → `<SettingsPanel>` (replace SettingsSection.tsx)

**Validation**: No custom menu/panel styling, all lists use `<ListContainer>`, all settings use `<SettingsPanel>`

---

### Week 4: Details & Cleanup (Complete Semantic Migration)
- [ ] Detail tab surfaces → `<InfoPanel>` / `<ListContainer>` + `<Stack>`
- [ ] Chart cards → `<ActionCard>` / `<InfoPanel>`
- [ ] Destination/settings panels → `<ActionCard>` + `<Stack>`
- [ ] Stage wrappers → `<Section>` with proper padding variants
- [ ] DevTest.tsx → `<WorkflowStep>` + `<Stack>` + `<Inline>` (largest cleanup: 10+ instances)
- [ ] Final audit with validation checklist

**Validation**: Complete grep audit shows zero violations

---

## Validation Checklist

After cleanup, verify:

**Primitive-level validation**:
- [ ] Zero instances of `backdrop-blur-*` outside `<ModalSurface>`/`<MenuSurface>`
- [ ] Zero instances of `blur-glass` outside primitive components
- [ ] Zero instances of direct `surface-layer-*` usage outside `<Surface>` primitive
- [ ] Zero instances of ad-hoc `border-content1/*` or `shadow-*` on feature components

**Semantic-level validation**:
- [ ] All modals use `<ModalSurface>`
- [ ] All menus/tooltips use `<MenuSurface>`
- [ ] All action cards use `<ActionCard>` (not `<Surface>` directly)
- [ ] All settings panels use `<SettingsPanel>` (not `<Surface>` directly)
- [ ] All list containers use `<ListContainer>` (not `<Surface>` directly)
- [ ] All workflow steps use `<WorkflowStep>` (not `<Surface>` directly)
- [ ] All warning/danger/info banners use `<AlertPanel>` (not inline `border-warning/30 bg-warning/10`)
- [ ] All page wrappers use `<Section>` with proper padding variant
- [ ] All sticky headers use `STICKY_HEADER` token (not ad-hoc blur recipes)
- [x] All z-index values use tokens (`z-panel`…`z-popover`), zero raw `z-10`…`z-50`
- [x] All disabled states use `VISUAL_STATE.disabled` (no mixed `opacity-40`/`opacity-50`)

**Layout-level validation**:
- [ ] All `flex flex-col` patterns replaced with `<Stack>`
- [ ] All `flex gap-* items-center` patterns replaced with `<Inline>`
- [ ] All form field groups use `<FormSection>`
- [ ] All toolbars use `<Toolbar>`

**Build validation**:
- [x] `npm run build` passes with zero type errors
- [ ] Visual regression tests pass (compare screenshots before/after)
- [ ] No ESLint warnings about unused layout classes

---

## Grep Commands for Audit

```bash
# Find remaining ad-hoc blur usage
rg "backdrop-blur|blur-glass" frontend/src --type tsx

# Find direct surface-layer usage (should only be in primitives)
rg "surface-layer-[012]" frontend/src --type tsx

# Find ad-hoc borders (should only be in primitives)
rg "border-content1|border-default" frontend/src --type tsx | grep -v "shared/ui/layout"

# Find ad-hoc shadows (should only be in primitives)
rg "shadow-(small|medium|large|visual|menu)" frontend/src --type tsx | grep -v "shared/ui/layout"

# Find direct flex-col usage (should be <Stack>)
rg "className=.*flex flex-col" frontend/src --type tsx | grep -v "shared/ui/layout"

# Find direct flex gap items-center usage (should be <Inline>)
rg "className=.*flex.*gap-.*items-center" frontend/src --type tsx | grep -v "shared/ui/layout"

# Find hand-written alert panels (should be <AlertPanel>)
rg "border-warning/|border-danger/" frontend/src --type tsx | grep -v "shared/ui/layout" | grep -v "config/logic"

# Find raw z-index values (should use z-panel/z-sticky/z-overlay/z-dnd/z-popover)
rg "\bz-(10|20|30|40|50)\b" frontend/src --type tsx

# Find ad-hoc sticky headers (should use STICKY_HEADER token)
rg "sticky top-0" frontend/src --type tsx | grep -v "shared/ui/layout"

# Find mixed disabled-state opacity (should all be VISUAL_STATE.disabled)
rg "opacity-(40|50).*pointer-events-none|pointer-events-none.*opacity-(40|50)" frontend/src --type tsx

# Find deprecated TEXT_ROLES usage (should be TEXT_ROLE)
rg "TEXT_ROLES\." frontend/src --type tsx
```

---

## Migration Strategy

**Approach**: File-by-file, semantic-first replacement

**For each file**:
- [ ] Identify all surface-related styling and layout patterns
- [ ] Replace with appropriate **semantic component** (preferred):
   - `<ActionCard>`, `<SettingsPanel>`, `<ListContainer>`, `<InfoPanel>`, `<WorkflowStep>`, `<SidebarPanel>`
   - `<Stack>`, `<Inline>`, `<FormSection>`, `<Toolbar>`
- [ ] Only use primitives (`<Surface>`, `<ModalSurface>`, `<MenuSurface>`) when no semantic component fits
- [ ] Replace ALL `flex flex-col gap-*` with `<Stack spacing="...">`
- [ ] Replace ALL `flex gap-* items-center` with `<Inline spacing="...">`
- [ ] Remove all ad-hoc blur/border/shadow/radius classes
- [ ] Test visually
- [ ] Commit with message: `refactor(surfaces): normalize [ComponentName] to use semantic components`

**Decision tree**:
```
Does the UI pattern have a semantic name?
├─ Yes → Use semantic component (ActionCard, SettingsPanel, etc.)
└─ No → Does it match an existing primitive variant?
    ├─ Yes → Use primitive (Surface, ModalSurface, etc.)
    └─ No → Create new semantic component first, then use it
```

**Parallel-safe**: Multiple people can work on different components simultaneously

---

## Risk Mitigation

1. **Visual regression**: Take screenshots before/after each component
2. **Incremental commits**: One component per commit for easy rollback
3. **Type safety**: New primitives enforce correct usage via TypeScript
4. **Grep validation**: Run audit commands after each merge
5. **Final-form only**: Do not keep backward-compat exports as a strategy.
   Collapse directly to canonical tokens; treat compatibility layers as debt.

---

## Success Metrics

**Before (current state)**:
- 19 ad-hoc blur instances
- 23 direct surface-layer instances
- 6 different modal surface recipes
- ~40 inline border/shadow definitions
- ~200+ `flex flex-col gap-*` repetitions
- ~150+ `flex gap-* items-center` repetitions
- 0 semantic naming enforcement
- Average surface code: 80+ chars per usage

**After (with semantic components)**:
- 0 ad-hoc blur instances (all in `<ModalSurface>` / `<MenuSurface>`)
- 0 direct surface-layer instances (all via semantic components)
- 1 modal surface recipe (`<ModalSurface>`)
- 1 menu surface recipe (`<MenuSurface>`)
- 1 alert panel recipe (`<AlertPanel>`) — replaces 7+ hand-written variants
- 1 sticky header recipe (`STICKY_HEADER`) — replaces 4 divergent recipes
- 0 inline border/shadow definitions (all via `<Surface>` primitive)
- 0 raw `flex flex-col` patterns (all use `<Stack>`)
- 0 raw `flex gap-*` patterns (all use `<Inline>`)
- 0 raw z-index values (all via tokens: `z-panel`…`z-popover`)
- 0 mixed disabled-state opacities (all via `VISUAL_STATE`)
- 11 semantic components enforcing logical consistency
- Average surface code: 15 chars per usage (`<ActionCard>`)

**Code reduction**: 
- **81% less code** per surface usage (80 chars → 15 chars)
- **~600 fewer lines** across feature files (after migration complete)

**Time saved on future features**: 
- ~50% reduction in surface-related code per feature
- ~80% reduction in surface-related decisions (semantic names guide usage)
- Zero time debugging inconsistent styling (enforced by component API)

---

## Post-Cleanup Benefits

1. **Impossible to drift**: All surfaces come from semantic components with locked styling
2. **Self-documenting code**: `<ActionCard>` is clearer than `<Surface variant="card" layer={1}>`
3. **Theme changes**: Update 10 semantic components instead of 60+ feature files
4. **Design consistency**: Enforced by component API + semantic naming, not discipline
5. **Onboarding**: New devs use `<ActionCard>` (obvious), not `<div className="surface-layer-1 border...">` (error-prone)
6. **Performance**: Shared CSS classes reduce stylesheet size, fewer class computations
7. **Testability**: Surface AND layout logic testable in isolation from feature logic
8. **Refactoring**: Change `<ActionCard>` implementation, all 40+ usages update automatically
9. **TypeScript autocomplete**: IDE suggests `<ActionCard>`, `<SettingsPanel>`, etc. (discoverable)
10. **Compile-time validation**: Can't use wrong component for wrong role (type system enforces semantics)

---

## Quick Reference: Component Selection Guide

### "I need to wrap content in a frame/card/panel..."

| UI Intent | Component | Example Usage |
|-----------|-----------|---------------|
| Action button/card (primary action with visual emphasis) | `<ActionCard>` | Destination gates, download buttons, wizard cards |
| Settings/config panel (titled panel with description) | `<SettingsPanel>` | All settings tabs, config sections |
| List/table container (data display frame) | `<ListContainer>` | File trees, peer lists, torrent tables |
| Info display (read-only stats, no border) | `<InfoPanel>` | Torrent stats, peer stats, status displays |
| Warning/danger/info banner | `<AlertPanel severity="warning\|danger\|info">` | Disk space warnings, error banners, validation messages |
| Wizard/workflow step (elevated multi-step UI card) | `<WorkflowStep>` | DevTest wizard, recovery wizard, multi-step forms |
| Sidebar container (modal/app sidebar with tight padding) | `<SidebarPanel>` | Settings sidebar, AddTorrent sidebar |

### "I need to arrange items vertically/horizontally..."

| Layout Intent | Component | Example Usage |
|---------------|-----------|---------------|
| Stack items vertically with gap | `<Stack spacing="tight\|tools\|panel\|stage">` | Form fields, content sections, modal interiors |
| Arrange items horizontally with gap | `<Inline spacing="tight\|tools\|panel">` | Toolbars, button groups, header elements |
| Group form fields with optional title | `<FormSection title="...">` | Settings forms, input groups |
| Horizontal toolbar with standard spacing | `<Toolbar>` | Action bars, control strips |

### "I need a scrollbar..."

| Scroll Intent | Class | Rule |
|---------------|-------|------|
| Fully hidden scrollbar | `scrollbar-hide` | Use when the UI should stay visually clean and scrolling remains obvious from context. |
| Subtle overlay scrollbar | `overlay-scrollbar` | Use for dense data panes where discoverability matters; thumb appears on hover/focus. |

**Never use** `custom-scrollbar` (removed/no-op). Pick one of the two strategies above.

### "I need to create a modal/menu..."

| Surface Type | Component | Example Usage |
|--------------|-----------|---------------|
| Modal/dialog overlay | `<ModalSurface>` | All modal dialogs (Settings, AddTorrent, etc.) |
| Menu/dropdown/popover | `<MenuSurface>` | Context menus, dropdowns, tooltips |
| Page/workbench wrapper | `<Section padding="workbench\|modal-inner\|centered-stage">` | Stage wrappers, modal content areas |

### "None of these fit my use case..."

1. Check if it's a **new UI pattern** that should become a semantic component
2. If truly unique, use low-level primitives: `<Surface>`, `<ModalSurface>`, `<MenuSurface>`
3. Document why you're bypassing semantic components (code comment)

### Anti-patterns (NEVER DO THIS):

❌ `<div className="surface-layer-1 border border-default/10 rounded-panel p-panel">`  
✅ `<ActionCard>` or `<SettingsPanel>` (depending on intent)

❌ `<div className="flex flex-col gap-tools">`  
✅ `<Stack spacing="tools">`

❌ `<div className="flex gap-tight items-center">`  
✅ `<Inline spacing="tight">`

❌ `<Surface variant="card" layer={1}>` (in feature code)  
✅ `<ActionCard>` (semantic component)

❌ Custom modal backdrop with `backdrop-blur-xl bg-content1/50`  
✅ `<ModalSurface>` (standardized backdrop)

❌ `<div className="border-warning/30 bg-warning/10 text-warning ...">`  
✅ `<AlertPanel severity="warning">` (standardized alert)

❌ `sticky top-0 z-10 bg-content1/30 backdrop-blur-xl` (ad-hoc sticky header)  
✅ `className={STICKY_HEADER}` (standardized token)

---

**End of Surface Normalization Cleanup Plan**
