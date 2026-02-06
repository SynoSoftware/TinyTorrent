# Frontend Todo List

## Legend

- [ ] Task to be done
- [_] Task in progress (mark as such when started)
- [!] Blocked (add reason why)
- [x] Task done

## Active Tasks

[x] 30. architectural - Remove residual dashboard TODO stopgaps
Resolve or delete TODO notes that are outdated after authority consolidation.
Keep only TODOs that map to explicit tracked tasks in this file.

[x] 31. medium - Action parity audit (toolbar/context/hotkeys)
Verify Pause/Resume/Recheck/Remove/Queue actions use one command path across toolbar buttons, context menus, and hotkeys.
If divergences exist, normalize through the same command dispatcher/view-model boundary.

[x] 28. feature - Refactor AddTorrentFileTable (Strategy Shift: Tree Adoption)
  - Replaced the heavy `AddTorrentFileTable` with an adapter using the newly polished `FileExplorerTree`.
  - Achieved UI consistency between "Details" and "Add" workflows.
  - Eliminated ~500 lines of duplicate virtualization logic.

[x] 28b. cleanup - Remove redundant AddTorrentModal search
  - Removed the parent `Input` component that was duplicating the functionality of the new Tree's sticky search bar.
  - Replaced it with a clean "Files" label to maintain toolbar layout balance.

[x] 13d. medium - Settings/Recovery view-model cleanup
Ensure Settings components, recovery modal, and related helpers derive gating/capabilities from dedicated view-model fragments rather than embedding logic.
Acceptance: settings/recovery surfaces consume view-model outputs for `uiMode` and recovery state; obsolete TODOs removed.
  - Moved recovery modal derivation/action wiring into `useRecoveryModalViewModel` in `workspaceShellModels.ts`.
  - Converted `TorrentRecoveryModal` into a pure view that only renders a `viewModel` prop.
  - Removed obsolete task-13d inline TODO from `SetLocationInlineEditor`.

[x] 13b. high - Torrent table view-model
  - `useTorrentTableViewModel` now owns filtering, selection, virtualization, column sizing, queue DnD, and context/header menu orchestration.
  - `TorrentTable.tsx` now renders from the VM output and no longer owns table orchestration state.
  - Build validation passed after wiring (`npm run build`).

[x] 22. architectural - Recovery capability clarity
Explicitly surface host-side filesystem expectations (missing-files classification, directory creation, free-space checks) through EngineAdapter/ShellAgent capabilities and guard UI code on those explicit capabilities.
Remove residual conditional logic that infers Local vs Remote behavior.
  - Torrent table status and row-menu now prioritize recovery gate classification outputs over raw error-envelope action hints.
  - Removed `createDirectory` from `EngineAdapter`/`TransmissionAdapter` contract.
  - Recovery sequence now returns explicit `directory_creation_not_supported` instead of attempting host folder mutation via daemon RPC.

[x] 23. architectural - Recovery lifetime ownership
Attach `missingFilesStore`/probe caches to a clear owner (client/session/recovery gate) instead of module-level maps that must be manually cleared from unrelated helpers; recovery state must reset when client/session changes.
  - Session boundary now resets `missingFilesStore` plus recovery-controller runtime state (`verifyGuard` + in-flight recovery map) on client instance changes.
  - Recovery controller now owns stale probe/classification cache pruning based on active torrent identities.
  - Removed probe-cache clearing from `useWorkspaceShellViewModel` detail-close flow so unrelated UI handlers no longer mutate recovery cache state.

[x] 25. architectural – Scheduling authority
Polling and timers (heartbeat, UI clock, recovery probes, modal delays) are currently created across multiple modules with no single owner. This makes scaling behavior, teardown correctness, and regression analysis unclear. Inventory existing timers and document ownership, then consolidate under a single scheduling authority or provider in a future pass.
  - Final boundary decision documented:
    - `HeartbeatManager` is transport polling authority (adaptive network cadence).
    - Shared `scheduler` is UI timer authority (clock/probes/modal delays/UI placeholders).
  - Consolidation completed:
    - `useUiClock.ts` uses shared `scheduler`.
    - `useRecoveryController.ts` probe loops and local delays use shared `scheduler`.
    - `useTorrentData.ts` ghost placeholder timeout moved to shared `scheduler`.
    - `TorrentRecoveryModal.tsx` remains timer-free (pure view).

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
