# Frontend Todo List

## Legend

- [ ] Task to be done
- [_] Task in progress (mark as such when started)
- [!] Blocked (add reason why)
- [x] Task done

## Active Tasks

[_] 30. architectural - Remove residual dashboard TODO stopgaps
Resolve or delete TODO notes that are outdated after authority consolidation.
Keep only TODOs that map to explicit tracked tasks in this file.

[ ] 31. medium - Action parity audit (toolbar/context/hotkeys)
Verify Pause/Resume/Recheck/Remove/Queue actions use one command path across toolbar buttons, context menus, and hotkeys.
If divergences exist, normalize through the same command dispatcher/view-model boundary.

[ ] 28. feature - Implement AddTorrentFileTable (Step 3: Reuse Logic)
Create `AddTorrentFileTable.tsx` using `useFileExplorerViewModel`.
This proves the architecture allows the same file logic to drive two different UI presentations (readonly-ish details vs editable add-modal).

[ ] 13d. medium - Settings/Recovery view-model cleanup
Ensure Settings components, recovery modal, and related helpers derive gating/capabilities from dedicated view-model fragments rather than embedding logic.
Acceptance: settings/recovery surfaces consume view-model outputs for `uiMode` and recovery state; obsolete TODOs removed.

[ ] 13b. high - Torrent table view-model
Build a `useTorrentTableViewModel` that owns filtering, selection, virtualization, column sizing, and capability checks, then feed it into `TorrentTable`/`TorrentTable_Body`/`TorrentTable_Header` so these components are pure.
Acceptance: table body/header receive a single view-model + command callbacks, `useColumnSizingController`/virtualization/marquee selection are owned by the table VM provider, and table task-13 TODOs are cleared.
Current progress: typed contracts for table hooks and persistence cleanup are complete.
Remaining: move virtualization/selection/interaction orchestration out of `TorrentTable.tsx` into a single table VM.

[ ] 22. architectural - Recovery capability clarity
Explicitly surface host-side filesystem expectations (missing-files classification, directory creation, free-space checks) through EngineAdapter/ShellAgent capabilities and guard UI code on those explicit capabilities.
Remove residual conditional logic that infers Local vs Remote behavior.

[ ] 23. architectural - Recovery lifetime ownership
Attach `missingFilesStore`/probe caches to a clear owner (client/session/recovery gate) instead of module-level maps that must be manually cleared from unrelated helpers; recovery state must reset when client/session changes.
Inventory all polling/timers (heartbeat, UiClock, recovery probes, modal timers).  
Consolidate behind a single scheduling authority or provider.  
Document what runs, when, and how it scales with list size.  
Files: `src/services/rpc/heartbeat.ts`, `src/shared/hooks/useUiClock.ts`, `src/modules/dashboard/hooks/useRecoveryController.ts`, `src/modules/dashboard/components/TorrentRecoveryModal.tsx`

[ ] 25. architectural – Scheduling authority
Polling and timers (heartbeat, UI clock, recovery probes, modal delays) are currently created across multiple modules with no single owner. This makes scaling behavior, teardown correctness, and regression analysis unclear. Inventory existing timers and document ownership, then consolidate under a single scheduling authority or provider in a future pass.

## Completed Tasks (Do Not Revisit)

### Architectural & Core
- [x] 1. Remove RPC extensions: UI talks to `transmission-daemon` via vanilla Transmission RPC only. No TinyTorrent RPC surface remains.
- [x] 2. Remove TT token plumbing: All TT auth/token/sessionStorage handling removed. Transmission auth only.
- [x] 3. ShellAgent / ShellExtensions adapter: Single adapter owns all NativeShell interactions. No direct imports elsewhere. Locality enforced via `uiMode`.
- [x] 4. Capability helper (locality): `UiMode = "Full" | "Rpc"` replaces serverClass/connectionMode for UI decisions.
- [x] 5. Capability contract tests: Tests ensure ShellExtensions never run in `uiMode="Rpc"`.
- [x] 6. Settings UI cleanup (Transmission + UiMode only): All TinyTorrent server / websocket / token UX removed.
- [x] 7. Session + UiMode provider: Single provider exposes `rpcStatus`, `sessionStats`, and `uiMode`.
- [x] 7a. UiMode naming + translation cleanup
- [x] 8. Remove websocket UX surfaces: UI is polling-only; no delta-sync language remains.
- [x] 8a. Remove ShellExtensions free-space bridge: `checkFreeSpace` is Transmission RPC only.
- [x] 9. Single recovery gate: All recovery entry points dedupe through one gate.
- [x] 10. Recovery UX spec compliance (core): Deterministic `{state, confidence}` output; Retry = probe-only; verify sequencing centralized.
- [x] 11. Set-location flow split: Explicit browse vs manual flows; host-backed UI absent in `uiMode="Rpc"`.
- [x] 12. Recovery display from gate: UI renders only from gate output, not raw error envelopes.
- [x] 13a. high - App + WorkspaceShell view-model boundary: App renders via a single `WorkspaceShellViewModel`.
- [x] 13c. high - Detail inspector view-model: Details panels are pure view-model consumers.
- [x] 14. Single torrent-action dispatch authority: All UI surfaces dispatch through one canonical dispatcher.
- [x] 15. Collapse UIActionGate into workflow owner: Delete lifecycle ownership unified.
- [x] 16. Centralize UI-only preferences provider
- [x] 17. Command registry + hotkey consolidation
- [x] 18. Add-torrent defaults service
- [x] 19. Deprecate RPC-extended documentation
- [x] 20. Unify timers and background scheduling (partial): Core scheduling consolidated.
- [x] 21. architectural - Recovery orchestration boundary: Move all recovery sequencing, queue state, and inline set-location state out of `useTorrentOrchestrator.ts` into a focused recovery controller.
- [x] 24. architectural - Orchestrator responsibility collapse: `useTorrentOrchestrator` reduced to a thin integration wire that only composes add/recovery controllers and shared deletion-hash state; dead event-bus and UI attach/detach glue removed.
- [x] 26. architectural - Extract File Explorer Logic (Step 1): created `useFileExplorerViewModel`.
- [x] 27. architectural - Refactor ContentTab (Step 2): `TorrentDetails_Content` now consumes `useFileExplorerViewModel`.
- [x] 27b. architectural - Details authority consolidation: extracted `useTorrentDetailHeaderStatus` and `useTorrentDetailsGeneralViewModel`.
- [x] 27c. architectural - Torrent table persistence authority cleanup: persisted stable table layout state only (no transient resize state).
