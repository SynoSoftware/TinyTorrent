# Frontend Todo List

## Active Backlog (2026-02-11)

Cleaned to keep only current, high-value merge work. Removed legacy/completed/stale task streams.

# Merge Map - src

Prioritized by: **lines saved x consistency gained x bug-risk reduced**.

---

## Tier 1 - High Impact (structural hazards or widespread scatter)

### [x] M-1 - `isAbortError` duplicate private methods

| Concept | Abort-error classification guard |
|---|---|
| **Files** | `transport.ts` (private method), `rpc-base.ts` (private method) |
| **Canonical owner** | New -> `shared/utils/errors.ts` |
| **Action** | Extract a single `isAbortError(err: unknown): boolean` free function. Both classes import it. Delete both private copies. |
| **Impact** | Bug-risk (subtly different try/catch wrappers) + DRY violation. |

---

### [x] M-2 - `EngineCapabilities` name collision, different interfaces

| Concept | Two unrelated interfaces sharing the same name |
|---|---|
| **Files** | `entities.ts` (`sequentialDownload`, `superSeeding`, `trackerReannounce`), `engine-adapter.ts` (`executionModel`, `hasHostFileSystemAccess`, `canCheckFreeSpace`) |
| **Canonical owner** | Keep `engine-adapter.ts` -> `EngineRuntimeCapabilities`, keep `entities.ts` -> `EngineFeatureFlags` |
| **Action** | Rename one (or both) to eliminate the collision. Update all consumers. |
| **Impact** | Import ambiguity. Any auto-import or code search hits the wrong one. |

---

### [x] M-3 - `ConnectionStatus` 3 identical derivations

| Concept | `(typeof STATUS.connection)[keyof typeof STATUS.connection]` |
|---|---|
| **Files** | `status.ts`, `rpc.ts`, `logic.ts` |
| **Canonical owner** | `status.ts` (already the STATUS authority) |
| **Action** | Delete from `logic.ts`. Re-export from `shared/types/rpc.ts` via `export type { ConnectionStatus } from "@/shared/status"`. |
| **Impact** | 3->1 definition. Prevents drift if STATUS enum changes. |

---

### [x] M-4 - Dual session-ID management (409 negotiation)

| Concept | `X-Transmission-Session-Id` header extraction + 409-retry |
|---|---|
| **Files** | `services/transport.ts` (`sharedSessionId`, `probeForSessionId`), `services/rpc/rpc-base.ts` (409 detection in `call()`) |
| **Canonical owner** | `transport.ts` - transport layer owns HTTP headers |
| **Action** | `rpc-base.ts` should delegate all session-header management to transport. Remove its own 409 -> extract-header path. |
| **Impact** | Two independent session-retry loops can disagree on current session ID, causing spurious 409 storms. |

---

### [x] M-5 - Hardcoded status strings (14 sites bypass `STATUS.*`)

| Concept | String literals like `"polling"`, `"offline"`, `"checking"`, `"missing_files"`, `"connected"` |
|---|---|
| **Affected files** | `shared/types/rpc.ts` (3 switch cases), `recoveryFormat.ts`, `recovery-controller.ts`, `usePiecesMapViewModel.ts`, `TorrentTable_StatusColumnCell.tsx`, `app/components/layout/StatusBar.tsx` (3 sites), `useAppViewModel.ts`, `useWorkspaceShellViewModel.ts`, `modules/settings/hooks/useSettingsModalController.ts` (2 sites) |
| **Canonical owner** | `status.ts` -> `STATUS.connection.*`, `STATUS.torrent.*` |
| **Action** | Replace every bare `"polling"` with `STATUS.connection.POLLING`, etc. Then enable an ESLint rule (or code-review checklist item) to prevent regression. |
| **Impact** | If any status value is renamed in `status.ts`, these 14 sites silently break at runtime instead of failing at compile time. |

---

### [x] M-6 - `HEADER_BASE` pattern scattered across 8 files

| Concept | `uppercase tracking-tight text-foreground/50` header typography recipe |
|---|---|
| **Affected files** | `glass-surface.ts`, `textRoles.ts`, `TorrentDetails_Content.tsx` (3 sites), `TorrentDetails_Trackers.tsx`, `TorrentDetails_Peers.tsx`, `SettingsSection.tsx`, `SystemTabContent.tsx` (2 sites) |
| **Canonical owner** | `logic.ts` -> `HEADER_BASE` (already exported) |
| **Action** | Each affected file should `import { HEADER_BASE } from "@/config/logic"` and compose with its own overrides (`font-semibold`, `text-foreground/30`, etc.) via template literals. |
| **Impact** | ~15 inline copies. If the header recipe changes (tracking value, opacity), 8 files need manual sync. |

---

## Tier 2 - Medium Impact (code health, consistency)

### [x] M-7 - `RecoveryConfidence` == `ConfidenceLevel` (same enum, different names)

| Files | `entities.ts` (`RecoveryConfidence`), `recovery-controller.ts` (`ConfidenceLevel`) |
|---|---|
| **Canonical owner** | `entities.ts` -> `RecoveryConfidence` |
| **Action** | Delete `ConfidenceLevel` from `recovery-controller.ts`. Import `RecoveryConfidence`. |

### [x] M-8 - `MissingFilesClassificationKind` == `MissingFilesStateKind` (same enum, different names)

| Files | `entities.ts`, `recoveryFormat.ts` |
|---|---|
| **Canonical owner** | `entities.ts` -> `MissingFilesClassificationKind` |
| **Action** | Delete `MissingFilesStateKind`. Re-import from entities. |

### [x] M-9 - Inline magic numbers (15 local constants duplicate `logic.ts` values)

| Concept | Timing constants redefined locally instead of imported |
|---|---|
| **Highest-value fixes** | |
| `VERIFY_WATCH_TIMEOUT_MS = 30000` in `recovery-controller.ts` | -> `GHOST_TIMEOUT_MS` |
| `RESYNC_MIN_INTERVAL_MS = 10_000` in `heartbeat.ts` | -> `WS_RECONNECT_MAX_DELAY_MS` |
| `PROBE_TTL_MS = 5000` in `useRecoveryController.ts` | -> `BACKGROUND_REFRESH_INTERVAL_MS` |
| `250` in `useTorrentTablePersistence.ts` | -> `TABLE_PERSIST_DEBOUNCE_MS` |
| `CACHE_TTL_MS = 500` in `transport.ts` | -> new `TRANSPORT_CACHE_TTL_MS` in `constants.json` |
| **Action** | For each, either import the canonical constant or (where semantics differ) create a properly named entry in `constants.json` -> `logic.ts`. |

### [x] M-10 - Ad-hoc success/danger color maps in 6 files

| Concept | Conditional `bg-success/danger` + `text-success/danger` class maps |
|---|---|
| **Files** | `StatusBar.tsx`, `useHudCards.ts`, `SettingsModalView.tsx`, `TorrentTable_SpeedColumnCell.tsx`, `Navbar.tsx`, `CommandPalette.tsx` |
| **Canonical owner** | `logic.ts` -> `STATUS_VISUALS` (already exists for connection statuses) |
| **Action** | Extend `STATUS_VISUALS` to cover torrent status tones and speed tones. Components import and look up. |

### [x] M-11 - Hardcoded `strokeWidth` on icons (13 sites in 5 files)

| Concept | Numeric `strokeWidth` props instead of `ICON_STROKE_WIDTH` / `ICON_STROKE_WIDTH_DENSE` |
|---|---|
| **Files** | `NetworkGraph.tsx` (3 sites), `TorrentDetails_Peers_Map.tsx` (5 sites), `TorrentTable_SpeedColumnCell.tsx`, `LanguageMenu.tsx` (2 sites), `TorrentDetails_General.tsx` (3 sites) |
| **Action** | Replace `strokeWidth={1.5}` -> `ICON_STROKE_WIDTH`, `1.2`/`1.4` -> `ICON_STROKE_WIDTH_DENSE`. For SVG-specific sub-pixel values (`0.2`), leave as-is or add a `STROKE_HAIRLINE` token. |

### [x] M-12 - `border-content1/20` raw class (11 files)

| Concept | Surface border token used as raw Tailwind instead of semantic constant |
|---|---|
| **Action** | Define `SURFACE_BORDER = "border-content1/20"` in `logic.ts` (or extend `glass-surface.ts` exports). Import everywhere. |

---

## Tier 3 - Low Impact / Monitor

### [x] M-13 - Redundant `selectedTorrents` derivation

Both `useWorkspaceShellViewModel.ts` and `useRowSelectionController.ts` independently filter `torrents` by `selectedIds`. Single derivation in the controller, passed down, would eliminate the second `useMemo`.

### [x] M-14 - Inline `formatDuration` in chart component

`TorrentDetails_Speed_Chart.tsx` defines a local ms->label formatter. Could be extracted to `shared/utils/format.ts` alongside `formatTime`.

### [x] M-15 - `HANDLE_HITAREA_CLASS` + `HANDLE_PADDING_CLASS` dead exports

Both exported from `logic.ts` but consumed by zero files. Either wire up or delete.

### [x] M-16 - `DROP_OVERLAY_ROLE` used as raw string

`Dashboard_Layout.tsx` writes `className="tt-drop-overlay"` instead of importing the exported constant.

### [x] M-17 - Inline motion configs in 3 components

`CommandPalette.tsx`, `SettingsModalView.tsx`, `Dashboard_Layout.tsx` define their own `initial`/`animate`/`exit` objects instead of using or extending `INTERACTION_CONFIG` / `DETAILS_TOOLTIP_ANIMATION`.

### [x] M-18 - `PreferencesContext` raw connection setters bypass `ConnectionConfigContext`

`PreferencesContext` exposes `setConnectionProfiles` / `setActiveProfileId` directly. A consumer could mutate connection data without going through `ConnectionConfigContext` validation. Consider hiding these from the exported context type.

---

## Impact Summary

| Tier | Entries | Estimated lines affected | Primary benefit |
|---|---|---|---|
| **Tier 1** (`M-1` through `M-6`) | 6 | ~80 inline defs + ~14 string literals + 8-file scatter | Eliminate bug-hazard surfaces, compile-time safety |
| **Tier 2** (`M-7` through `M-12`) | 6 | ~30 local constants + ~45 class duplicates | DRY, single-source-of-truth for tokens |
| **Tier 3** (`M-13` through `M-18`) | 6 | ~20 minor sites | Hygiene, dead-code removal |

Start with **M-1 through M-5** - those are the entries where a merge prevents real bugs, not just cosmetic drift.

---

## Config Scope Reduction Tasks (2026-02-11 audit)

Goal: reduce config complexity while preserving all current user-visible features.

### [x] C-1 - Purge unused global knobs from `constants.json`

| Concept | Remove keys that have zero callsites outside `constants.json` |
|---|---|
| **Audit evidence** | `rg` across `frontend/src` found these keys only in `constants.json` (no TS/TSX consumers). |
| **Candidate keys** | `performance.max_concurrent_requests`, `ui.animation_duration_ms`, `layout.table.density`, `layout.table.legacyAutoFitPaddingPx`, `layout.table.fallbackPixelTolerancePx`, `layout.menu.min_width`, `layout.ui.navbar.density`, `layout.ui.statusbar.density`, `layout.ui.drop_overlay.density`, `layout.ui.file_explorer.density`, `layout.shell.classic.density`, `layout.shell.immersive.density`, `layout.modals.add_width`, `layout.modals.body_max_height`, `layout.modals.settings_height`, `layout.modals.settings_min_height` |
| **Action** | Delete the unused keys and keep history in this task note (or changelog) instead of dead config. |
| **Impact** | Smaller knob surface, less false configurability, lower maintenance overhead. |

### [x] C-2 - Stop `CONFIG.*` leakage outside config authority

| Concept | Raw `CONFIG` access in feature/runtime files bypasses semantic config ownership |
|---|---|
| **Current callsites** | `main.tsx` (`CONFIG.ui.toast_display_duration_ms`), `app/hooks/useActionFeedback.ts`, `shared/hooks/useSessionSpeedHistory.ts`, `modules/dashboard/hooks/utils/canvasUtils.ts`, `app/context/connection/endpointAuthority.ts`, `modules/dashboard/hooks/useTorrentClipboard.ts`, `modules/torrent-add/components/AddTorrentModal.tsx`, `services/rpc/heartbeat.ts` |
| **Canonical owner** | `config/logic.ts` named exports only (single contract surface). |
| **Action** | Replace raw `CONFIG.*` reads with explicit exports (`TOAST_DISPLAY_DURATION_MS`, `HISTORY_DATA_POINTS`, `DEFAULT_RPC_ENDPOINT`, `MAGNET_PROTOCOL_PREFIX`, `ADD_TORRENT_PANEL_DEFAULT_SIZE`, etc.). Reserve `CONFIG` for config internals only. |
| **Impact** | Better traceability and safer refactors; prevents schema-shaped config from leaking into UI behavior. |

### [x] C-3 - Promote shared knobs, demote single-consumer knobs

| Concept | Keep only cross-feature knobs global; move one-off values local |
|---|---|
| **Over-globalized now** | `layout.modals.add_settings_default_size`, `layout.modals.add_settings_min_size`, `layout.modals.add_filepanel_default_size`, `layout.modals.add_filepanel_min_size` (currently only used by `modules/torrent-add/components/AddTorrentModal.tsx`) |
| **Action** | Move single-consumer modal panel sizing to a module-local token file (`modules/torrent-add/config.ts`) unless another feature reuses it. Keep global only for true cross-feature knobs (timers, shortcuts, shared status visuals, core defaults). |
| **Impact** | Simpler global config and clearer ownership boundaries without feature loss. |

### [x] C-4 - Merge semantically identical timers into shared authority names

| Concept | Same behavior family split across `performance`, `heartbeats`, and `timers` |
|---|---|
| **Action** | Normalize timer ownership in `logic.ts` and expose one naming family (`*_INTERVAL_MS`, `*_DEBOUNCE_MS`, `*_TIMEOUT_MS`). Remove duplicate/fallback literals where semantics are identical. |
| **Target examples** | `history_data_points`, heartbeat cadence, reconnect backoff, ghost timeout, table persist debounce. |
| **Impact** | Fewer knobs to tune, fewer accidental divergences between modules. |

Execution order: `C-1` -> `C-2` -> `C-3` -> `C-4`.

---

## Opus Review Follow-up (2026-02-11)

### [x] O-1 - Replace heartbeat full-list stringify hash with compact fingerprint

| Concept | `HeartbeatManager.computeHash()` uses `JSON.stringify(torrents)` each tick |
|---|---|
| **File** | `services/rpc/heartbeat.ts` |
| **Action** | Replace full-object stringify hash with a compact rolling fingerprint over stable torrent fields, keep subscriber change detection behavior intact. |
| **Why** | Reduces per-tick string allocation and GC churn while preserving heartbeat update semantics. |
| **Impact** | Performance + reliability under large torrent sets / long sessions. |
