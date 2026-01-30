## Item 13 Brief

### Architectural goal
- Collapse AppContent into a small set of view-model contracts so WorkspaceShell/Dashboard/StatusBar/Settings/Recovery/Navbar/Table render from derived models, not ad-hoc prop piles or in-component orchestration; every screen should treat data/orchestration as owned by orchestrators/view-model providers, leaving the views pure.
- Ensure the view-models respect the “no IO/state/policy in views” rule set so UI components only render typed props and handlers from upstream models.

### Pure View definition
1. No RPC calls/EngineAdapter/TorrentIntents imports; no data fetching in the component itself.  
2. No local state hooks (`useState`, `useReducer`, etc.); only `useMemo`, `useCallback`, or read-only helpers are allowed.  
3. No side effects (`useEffect`, `useLayoutEffect`, timers, event listeners).  
4. No persistence/OS API access (`localStorage`, ShellAgent, etc.).  
5. No capability/orchestrator helpers; rely solely on the provided view-model props.  
6. Callbacks are passed in via props; the component constructs no handler logic.  
7. No inline policy gating; capability/logic decisions come pre-resolved via the model.

### Sub-items

#### 13a. App + WorkspaceShell view-model boundary
- **Components/files:** `frontend/src/app/App.tsx`, `frontend/src/app/components/WorkspaceShell.tsx`, `frontend/src/app/views` (indirectly).  
- **Broken promise:** App still threads dozens of handlers/states (drag/drop props, settings modal callbacks, HUD actions, workspace style toggles) and WorkspaceShell imports orchestrator hooks, violating the pure view definition.  
- **Acceptance:** App exposes `useAppViewModel()`/`WorkspaceShellViewModel` and passes only grouped model props; WorkspaceShell no longer imports orchestration helpers or manages handler logic, and all TODO mentions of App prop piles (e.g., comments referencing task 13) are removed.

#### 13b. TorrentTable view-model
- **Components/files:** `frontend/src/modules/dashboard/components/TorrentTable.tsx`, `TorrentTable_Body.tsx`, `TorrentTable_Header.tsx`, `frontend/src/modules/dashboard/hooks/useColumnSizingController.ts`, `useMarqueeSelection.ts`.  
- **Broken promise:** Table/body/header still receive sprawling props, manage selection/column-sizing hooks, and decide capabilities/policy internally, so the view is not pure.  
- **Acceptance:** Introduce `TorrentTableViewModel` owning filtering, selection, virtualization, sizing, capabilities; table components consume a single model + command callbacks, and sizing/selection helpers live inside the provider; task-13 TODOs in these files vanish.

#### 13c. Detail inspector view-model
- **Components/files:** `frontend/src/modules/dashboard/components/TorrentDetails.tsx`, `TorrentDetails_Content.tsx`, `TorrentDetails_Peers.tsx`, `TorrentDetails_Trackers.tsx`, `TorrentDetails_Peers_Map.tsx`, file/peer hooks.  
- **Broken promise:** Detail components still run orchestration (file selection, tracker actions, peer commands) instead of reading from a view-model; instrumentation (tab state, `onFilesToggle`) lives inside the UI.  
- **Acceptance:** Build `DashboardDetailViewModel` that provides detail data, file toggle/peer/tracker callbacks, and inspector tab commands; components only render props from this model, the TODO comments vanish, and all actions flow through the shared view-model.

#### 13d. Settings / Recovery view-model cleanup
- **Components/files:** `frontend/src/modules/settings/components/SettingsModal.tsx`, `SettingsBlockRenderers.tsx`, `settings-tabs.ts`, `frontend/src/app/context/RecoveryContext.tsx`, `frontend/src/modules/dashboard/components/TorrentRecoveryModal.tsx`, `shared/utils/recoveryFormat.ts`.  
- **Broken promise:** Settings and recovery UI still contain gating logic, capability inference, and recovery sequencing rather than receiving sanitized view-model outputs; TODO comments demand view-model-backed gating.  
- **Acceptance:** Settings/recovery components consume dedicated view-model slices delivering `uiMode`, enablement, and recovery state; gating logic lives upstream, and related TODOs/instructions are cleared.

### TODO/FIXME/NOTE inventory (grouped)
- **13a (App/WorkspaceShell):**  
  - `frontend/src/app/App.tsx` line 109: “Split App into… view-model layer…” – still true.  
  - `frontend/src/app/components/WorkspaceShell.tsx` contains comments about wiring view models (if any).  

- **13b (TorrentTable):**  
  - `TorrentTable_Body.tsx` lines 69-71: “Reduce this props surface… bundle into `TorrentTableBodyViewModel`.”  
  - `TorrentTable_Header.tsx` lines 22-23: drag/sort/resize TODO referencing task 13.  
  - `useColumnSizingController.ts` line 16: “one table view-model owns sizing.”  
  - `useMarqueeSelection.ts` line 8: “call this only from a single table view-model.”  
  - `TorrentTable.tsx` lines 3-4: comments emphasizing view-model rendering.  

- **13c (Detail):**  
  - `TorrentDetails.tsx` line 32: “Keep tabs presentational… push orchestration into the view-model.”  
  - `TorrentDetails_Content.tsx` line 42: “Single Dashboard/App view-model decides how to execute…”  
  - `TorrentDetails_Peers_Map.tsx` line 18: “Accept all data as props and emit UI events only.”  
  - `TorrentDetails_Trackers.tsx` line 30: tracker actions as UI intents.  
  - `TorrentDetails_Peers.tsx` line 27: delegate peer actions to view-model.  
  - `FileExplorerTree.tsx` line 43: “emit UI intents; higher layer decides.”  

- **13d (Settings/Recovery):**  
  - `SettingsBlockRenderers.tsx` line 26: gating must come from Settings view-model.  
  - `settings-tabs.ts` lines 18 & 161: gating and tab ordering tied to view-model.  
  - `RecoveryContext.tsx` line 67: expose minimal recovery API/view-model.  
  - `shared/utils/recoveryFormat.ts` line 7: UI should render from gate/view-model authority.  

### Explicit non-goals
- Item 13 does not change orchestrator implementations, RPC clients, or command dispatch semantics.  
- Preferences/persistence remain untouched (item 15 honored).  
- ShellAgent/ShellExtensions logic (items 1-8) is not part of this scope.  
- No UI redesign; views should keep current layouts while consuming new models.

### Known risks/traps
- Do not merge orchestration into views while extracting view-models; keep commands centralized elsewhere.  
- Avoid touching the preferences provider or introducing new storage owners.  
- Don’t refactor recovery/orchestrator internals; they merely feed the view-models.  
- Keep capability gating logic upstream; views must just render the resolved state.
