
[x] 13a. high - App + WorkspaceShell view-model boundary - Introduce `useAppViewModel()` or equivalent provider that wires session/preference/recovery/orchestrator data and exposes a single `WorkspaceShellViewModel`; ensure `App.tsx` + `WorkspaceShell` stop threading configuration/handlers individually and only render from the model. Acceptance: App only passes grouped view-model props to `WorkspaceShell`, the prop pile comments referencing task 13 disappear, and `WorkspaceShell` no longer imports orchestration helpers directly.
[_] 13b. high - Torrent table view-model - Build a `TorrentTableViewModel` that owns filtering, selection, virtualization, column sizing, and capability checks, then feed it into `TorrentTable`/`TorrentTable_Body`/`TorrentTable_Header` so these components are pure. Acceptance: Table body/header receive a single view-model + command callbacks, `useColumnSizingController`/`useMarqueeSelection` are owned solely by the view-model provider, and table-related task-13 TODOs are cleared.
[x] 13c. high - Detail inspector view-model - Create a `DashboardDetailViewModel` that drives `TorrentDetails`, `TorrentDetails_Content`, `TorrentDetails_Peers`, `TorrentDetails_Trackers`, and the peer/trackers map: they should only render props/events from the view-model without owning selection/file toggles. Acceptance: Detail tabs/components receive only view-model outputs, `onFilesToggle`/tracker actions route through that model, and the corresponding TODO notes are resolved.
[_] 13d. medium - Settings/Recovery view-model cleanup  - Ensure Settings components, the recovery modal, and related helpers derive gating/capabilities from dedicated view-model fragments rather than embedding logic. Acceptance: Settings/recovery tooling consume view-model outputs for `uiMode`/recovery state, and any TODO instructing logic to move to view-models is satisfied.

[_] 15. medium — Collapse UIActionGate into the action/workflow owner  
Move “removed” state and delete-lifecycle ownership into the same layer that owns torrent action dispatch/workflows.  
SelectionContext remains authoritative for selection only.  
After this step, there must be a single owner for: optimistic delete masking, selection clearing, and delete sequencing.  
Update or delete any TODOs/comments that assume split ownership.  
Files: src/app/hooks/useTorrentWorkflow.ts, src/app/orchestrators/useTorrentOrchestrator.ts
 
[x] 21. architectural - Recovery orchestration boundary - Move all recovery sequencing, queue state, and inline set-location state out of `useTorrentOrchestrator.ts` into a focused recovery controller so the orchestrator merely coordinates recovery requests and responses; without that separation it owns add-torrent, recovery queues, and RPC telemetry, which makes the Recovery UX spec hard to reason about.
[_] 22. architectural - Recovery capability clarity - Explicitly surface any host-side filesystem expectations (missing-files classification, directory creation, free-space checks) through the EngineAdapter contract and guard UI code on those capabilities; the current conditional logic that infers Local vs Remote behavior leaves the Recovery UX execution model unstable.
[_] 23. architectural - Recovery lifetime ownership - Attach `missingFilesStore`/probe caches to a clear owner (client/session/recovery gate) instead of module-level maps that must be manually cleared from unrelated helpers; the spec requires recovery state to reset whenever the client/session changes, which the current globals cannot guarantee.
Inventory all polling/timers (heartbeat, UiClock, recovery probes, modal timers).  
Consolidate behind a single scheduling authority or provider.  
Document what runs, when, and how it scales with list size.  
Files: src/services/rpc/heartbeat.ts, src/shared/hooks/useUiClock.ts, src/app/orchestrators/useTorrentOrchestrator.ts, src/modules/dashboard/components/TorrentRecoveryModal.tsx
[ ] 24. architectural – Orchestrator responsibility collapse
`useTorrentOrchestrator.ts` still aggregates multiple independent lifecycles (add-torrent flows, global listeners, RPC/telemetry wiring, timers). Recovery extraction reduces pressure but does not resolve the broader issue: the orchestrator acts as a god-object for UI-side coordination. A future pass must either split responsibilities by domain (recovery / creation / lifecycle) or introduce a thin composition layer so no single hook owns unrelated concerns.
[ ] 25. architectural – Scheduling authority
Polling and timers (heartbeat, UI clock, recovery probes, modal delays) are currently created across multiple modules with no single owner. This makes scaling behavior, teardown correctness, and regression analysis unclear. Inventory existing timers and document ownership, then consolidate under a single scheduling authority or provider in a future pass.


### ✅ Completed (Do Not Revisit)

These items are **finished, integrated, and should not be reopened** unless a regression is found.

* [x] **1. Remove RPC extensions**
  UI talks to `transmission-daemon` via vanilla Transmission RPC only. No TinyTorrent RPC surface remains.

* [x] **2. Remove TT token plumbing**
  All TT auth/token/sessionStorage handling removed. Transmission auth only.

* [x] **3. ShellAgent / ShellExtensions adapter**
  Single adapter owns all NativeShell interactions. No direct imports elsewhere. Locality enforced via `uiMode`.

* [x] **4. Capability helper (locality)**
  `UiMode = "Full" | "Rpc"` replaces serverClass/connectionMode for UI decisions.

* [x] **5. Capability contract tests**
  Tests ensure ShellExtensions never run in `uiMode="Rpc"`.

* [x] **6. Settings UI cleanup (Transmission + UiMode only)**
  All TinyTorrent server / websocket / token UX removed.

* [x] **7. Session + UiMode provider**
  Single provider exposes `rpcStatus`, `sessionStats`, and `uiMode`.

* [x] **7a. UiMode naming + translation cleanup**

* [x] **8. Remove websocket UX surfaces**
  UI is polling-only; no delta-sync language remains.

* [x] **8a. Remove ShellExtensions free-space bridge**
  `checkFreeSpace` is Transmission RPC only.

* [x] **9. Single recovery gate**
  All recovery entry points dedupe through one gate.

* [x] **10. Recovery UX spec compliance (core)**
  Deterministic `{state, confidence}` output; Retry = probe-only; verify sequencing centralized.

* [x] **11. Set-location flow split**
  Explicit browse vs manual flows; host-backed UI absent in `uiMode="Rpc"`.

* [x] **12. Recovery display from gate**
  UI renders only from gate output, not raw error envelopes.

* [x] **13a. App + WorkspaceShell view-model boundary**
  App renders via a single `WorkspaceShellViewModel`.

* [x] **13c. Detail inspector view-model**
  Details panels are pure view-model consumers.

* [x] **14. Single torrent-action dispatch authority**
  All UI surfaces dispatch through one canonical dispatcher.

* [x] **15. Collapse UIActionGate into workflow owner**
  Delete lifecycle ownership unified.

* [x] **16. Centralize UI-only preferences provider**

* [x] **17. Command registry + hotkey consolidation**

* [x] **18. Add-torrent defaults service**

* [x] **19. Deprecate RPC-extended documentation**

* [x] **20. Unify timers and background scheduling (partial)**
  Core scheduling consolidated; architectural follow-up remains (see 25).

---

### ⏳ Actionable Now (Implementable Without Broad Redesign)

These are **the last refactor steps that can be completed cleanly**.

* [x] **21. Architectural — Recovery orchestration boundary**
  Move all recovery sequencing, queue state, and inline set-location state out of
  `useTorrentOrchestrator.ts` into a focused recovery controller.
  Orchestrator coordinates only; does not own recovery logic or state.
  - done: recovery controller now accepts semantic `services`, `environment`, `data`, and `refresh` bundles while preserving behavior, and the orchestrator now solely wires controllers instead of owning recovery state or queues.
  - review fixes: removed the `engineCapabilities` tunnel—`useRecoveryController` now reads session-scoped capabilities directly via `useSession()` instead of threading them through the orchestrator and hook signatures.

* [x] **22. Architectural — Recovery capability clarity**
  Explicitly surface host-side filesystem expectations (classification, directory creation, free-space checks) via the `EngineAdapter` contract.
  Local vs Rpc execution model must be explicit; no inferred fallbacks.
  - done: `EngineAdapter` now publishes `EngineCapabilities`, `SessionContext` exposes them via `useSession`, and the recovery controller/probe/classification wiring consumes that capability sheet so path handling, classification confidence, and scheduler gating no longer depend on `serverClass` inference.

* [x] **23. Architectural — Recovery lifetime ownership**
  Attach `missingFilesStore` / probe caches to a clear owner (client / session / recovery gate).
  Recovery state must reset on client/session change; no module-level globals.
  - done: added `resetMissingFilesStore` and now `SessionContext` resets the caches whenever the `torrentClient` identity changes, so probe/classification maps now follow the client/session owner automatically.

---

### ⏸ Deferred (Future Pass, Intentionally Not Now)

These are **valid architectural issues**, but **out of scope for the current closure**.

* [–] **13b. Torrent table view-model** _(blocked / deferred)_
  Requires deeper table lifecycle consolidation and is not needed to close recovery or orchestration boundaries.

* [–] **13d. Settings / Recovery view-model cleanup** _(deferred)_
  Settings and recovery UI still read some capabilities via contexts.
  This is a boundary hygiene task, not required for correctness.

* [–] **24. Architectural — Orchestrator responsibility collapse**
  `useTorrentOrchestrator.ts` still aggregates unrelated lifecycles (creation, listeners, telemetry, timers).
  Requires a broader composition pass.

* [–] **25. Architectural — Scheduling authority**
  Polling/timers exist across modules (heartbeat, UI clock, recovery probes, modal delays).
  Requires a dedicated scheduling authority and scaling analysis.
