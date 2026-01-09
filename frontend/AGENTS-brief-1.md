
# TinyTorrent Agent Contract

## 1. HARD CONSTRAINTS (≤15)
- Zero-literal pipeline: numbers/colors only in config/constants.json and index.css @theme; components use semantic tokens only; missing tokens must be flagged, not bypassed.
- No numeric Tailwind or bracket classes in components; geometry/spacing/typography come from tokens; only structural whitelist utilities are allowed.
- Typography vs Geometry: typography tokens derive from --fz; geometry from --u*--z; no single dimension may mix both; geometry containers never grow to fit text (truncate/scroll instead).
- Surface ownership: only surface owners apply surfaceStyle; outerStyle only on shell chrome; headers and structural children are typography-only and assume an ancestor surface.
- Knobs: only --u, --z, --fz, single radius set, blur/elevation layers, h-nav/h-status/h-row, p-panel/p-tight/gap-stage/gap-tools; any new knob must go through the pipeline first.
- Z-index literals are forbidden; use --z-floor/panel/sticky/overlay/modal/toast/cursor from constants.json.
- HeroUI semantic colors only; glass layers: L0 bg-background + noise, L1 backdrop-blur-md + bg-background/60 + border-default/10, L2 backdrop-blur-xl + bg-content1/80 + shadow-medium + border-default/20; every glass surface needs border-default.
- DRY + scale test: shared glass/row/focus recipes must be centralized; code is invalid if changing --u/--z/--fz breaks layout; PRs must include token mapping and flag missing tokens.
- Runtime invariant: UI controls local daemon; remote is for debug only and must not change features; web limits never justify reduced capability.
- Single heartbeat in EngineAdapter; no component intervals; polling defaults ~1500ms table, ~500ms detail, ~5000ms background; push mode stops polling; selectors prevent unnecessary re-render.
- Workbench layout: react-resizable-panels for Parts; panes never unmount; collapse = size 0; handles use semantic hit targets; flex/grid only inside views.
- Interaction shell: OS selection model; default user-select none with explicit select-text exceptions; overlay scrollbars only; body/root full-screen with no window scrollbar.
- RPC contract: Transmission spec for core; Zod on all RPC boundaries; UI uses adapter methods; polling uses ids/deltas; WS upgrade for TinyTorrent stops polling.
- Internationalization: all UI text via t("key") from en.json only; no inline English.
- Quality guardrails: virtualize lists >50, strict TS, no unused imports or console noise, npm run build must pass, absolute imports with @/, UI never calls fetch directly (use services), never run destructive git reset/clean/restore/checkout --.

## 2. FORBIDDEN / ALLOWED ACTIONS
- FORBIDDEN: hard-coded numbers/colors in components; numeric Tailwind spacing/size/radius/shadow/blur/typography utilities or bracket classes; new knobs outside pipeline; mixing typography+geometry in one token; applying surfaceStyle/outerStyle on structural children or headers; custom hex/RGB/Tailwind named colors or manual rgba; z-index literals; inline English; direct fetch from UI; component setInterval; conditional unmounting of panes; default OS scrollbars inside panes; modals for passive viewing; feature differences for remote vs local; shrinking HeroUI controls for “compact” look; git reset/clean/restore/checkout -- without approval; complex shell one-liners; Select-String for search.
- ALLOWED ONLY: numbers added via constants.json → index.css @theme → logic.ts → semantic class; Tailwind structural classes (`flex`, `grid`, `items-*`, `justify-*`, `grow`, `shrink`, `min-h-0`, `min-w-0`, `relative`, `absolute`, `sticky`, `inset-0`, `overflow-hidden`, `overflow-auto`, `truncate`, `whitespace-*`, `select-none`, `select-text`, `pointer-events-*`, `cursor-*`, responsive variants using semantic utilities); HeroUI tokens and layered glass; primary buttons variant="shadow", secondary light/ghost, toolbar icon-only; react-resizable-panels for layout; framer-motion for interactive state changes; react-dropzone for full-window drop; Lucide icons; @tanstack/react-virtual for lists >50; cmdk for palette; Zod schemas and transmission-rpc types; adapters in services/rpc; absolute imports with @/.

## 3. ARCHITECTURE INVARIANTS
- Stack: React 19 + TS + Vite; Tailwind v4 + HeroUI; Framer Motion mandatory for interactive state changes; react-resizable-panels for all Parts; react-dropzone; Lucide; i18next; cmdk; @tanstack/react-virtual; Zod.
- Runtime: local three-part system (Tray/WebView2 shell, daemon, UI); UI → Native Shell via window.chrome.webview.postMessage (native path) or UI → daemon (fallback); closing window hides it (Exit via tray/app-shutdown); native focus uses SetForegroundWindow.
- Data flow: RPC → services/rpc adapters → hooks/state → components; components render only; UI never fetches directly.
- Project shape: config holds only constants.json (literals) and logic.ts (computed roles); modules are flat (use underscores, hooks.ts local); services define Zod schemas; shared holds primitives/components/hooks/utils; i18n/en.json only; no empty folders.
- Naming/imports: Components PascalCase (with underscores), hooks camelCase, services kebab-case; internal imports use @/ aliases (tsconfig/vite must keep alias).
- Workbench model: Parts/Containers/Panes/Views stay mounted; collapse by size 0; handles show 1px separator on hover/drag; focus model = one active Part, Escape clears selection only, focus border uses HeroUI tokens.
- Surface/tokens: panel padding = p-panel; tight padding = p-tight; stage gap = gap-stage; tool gap = gap-tools; structure sizes = h-nav/h-status/h-row; z-index tokens as above.

## 4. WORKFLOW (MINIMAL)
- Add any new dimension/color by: constants.json intent → index.css @theme arithmetic with knobs → logic.ts role export → component uses semantic class; if token missing, add FLAG and stop change.
- Text changes: add key to i18n/en.json and use t("key").
- Layout: use react-resizable-panels for Parts; never unmount panes; keep body/#root full screen; overlay scrollbars only.
- RPC: use EngineAdapter APIs and Transmission schemas; validate with Zod; polling uses ids/deltas; push mode stops polling.
- Checks before finish: run scale test (--u/--z/--fz), ensure virtualization for lists >50, centralize repeated class recipes, include token mapping note, run npm run build, keep console clean, remove unused imports.
- Tooling: search with rg (not Select-String); keep commands simple and Windows-safe; never run destructive git commands without approval.

## 5. STYLE / PREFERENCES (ENFORCEMENT-RELEVANT)
- Brand: dark-first, glass/acrylic VS Code–style workbench; premium, confident, not compact; HeroUI sizing must stay generous.
- Interaction feel: OS-style selection/context menus; optimistic UI (actions reflect instantly, revert on error); keyboard-first; motion clarifies structure (use framer-motion layout/hover/press where appropriate).
- Modals: Layer 2 glass; only for blocking actions (Add Torrent, Settings, destructive confirms); passive details belong in Inspector.
- Buttons/icons: primary variant="shadow", secondary light/ghost, toolbar icon-only; icons use HeroUI semantic colors and global scale.
- Final authority: accept only choices that make the app feel more powerful/confident; reject “compact to save space.”
