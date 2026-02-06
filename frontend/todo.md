# Frontend Todo List

## Legend

- [ ] Task to be done
- [_] Task in progress (mark as such when started)
- [!] Blocked (add reason why)
- [x] Task done

## Active Tasks

- [x] 41. performance - Verify duplicate table-heartbeat domain subscriptions
Suggested model: `codex-mini`
Model reasoning:
Small, well-bounded verification/refactor in two hooks; lowest cost and lowest collateral.
Verified pattern:
Two application-level hooks independently subscribe to `mode: "table"` heartbeat for overlapping payload domains.
Why worth fixing:
This is a concrete, confirmed duplication in subscription ownership and can create redundant processing.
Files:
`frontend/src/app/hooks/useSessionStats.ts`
`frontend/src/modules/dashboard/hooks/useTorrentData.ts`
Best way:
Keep one authoritative `mode: "table"` subscriber and derive secondary views from that owner unless there is a proven separation requirement.
Done when:
There is a single clearly-authoritative table heartbeat path (or explicit documented justification for multiple paths).

- [x] 42. performance - Reduce detail telemetry fan-out across inspector tabs
Suggested model: `codex-mini`
Model reasoning:
Localized to inspector detail path; limited dependency surface and easy runtime validation.
Verified pattern:
`TorrentDetails` forwards the full `detailData` object (`torrent`) into tab components, while `useTorrentDetail` updates that object from heartbeat `mode: "detail"` subscriptions.
Why worth fixing:
This is props correctness in a high-frequency domain: full detail object propagation can cause tab-level re-renders from unrelated field updates.
Files:
`frontend/src/modules/dashboard/components/TorrentDetails.tsx`
`frontend/src/modules/dashboard/hooks/useTorrentDetail.ts`
Best way:
Propagate only tab-relevant slices instead of the full detail object wherever possible.
Done when:
Changes in one detail field do not trigger re-renders in tabs that do not depend on that field.

- [x] 43. performance - Narrow SettingsFormContext update blast radius
Suggested model: `codex-mini`
Model reasoning:
Scoped to settings module/context boundaries; moderate but contained change set at low token/runtime cost.
Verified pattern:
`SettingsModal` provides a wide `SettingsFormContext` value including full `config`, drafts, action handlers, and derived JSON state; many renderers consume `useSettingsForm()` from the same provider.
Why worth fixing:
This is context correctness: one broad provider value can propagate updates to many settings blocks that do not depend on the changed key.
Files:
`frontend/src/modules/settings/components/SettingsModal.tsx`
`frontend/src/modules/settings/context/SettingsFormContext.tsx`
`frontend/src/modules/settings/components/SettingsFormBuilder.tsx`
`frontend/src/modules/settings/components/SettingsBlockRenderers.tsx`
Best way:
Separate frequently-changing form state from static actions/capabilities and scope provider values by section or concern.
Done when:
Changing one setting key re-renders only the affected blocks, not the entire settings tree.

- [x] 39. architecture - Centralize capability detection consumption and ShellAgent gating
Suggested model: `regular codex`
Model reasoning:
Crosses session/context/settings/lifecycle authority boundaries; requires careful architectural consistency.
Verified pattern:
Capability checks are split across session derivation (`deriveUiCapabilities`), engine detection (`detectEngine`), settings modal local checks (`hasNativeShellBridge`, direct `shellAgent.isAvailable`), and shell view-model checks.
Why worth fixing:
This is context/state correctness: capability decisions are represented in multiple places, which can drift and create inconsistent UI gating.
Files:
`frontend/src/app/context/SessionContext.tsx`
`frontend/src/modules/settings/components/SettingsModal.tsx`
`frontend/src/app/hooks/useTransmissionSession.ts`
`frontend/src/app/context/LifecycleContext.tsx`
Best way:
Resolve capability/locality once in a single authority context and make UI modules consume that state directly.
Done when:
Capability gating paths are consistent and no UI module re-derives locality/availability logic independently.

- [x] 35. performance - Consolidate duplicated telemetry/history sampling paths
Suggested model: `regular codex`
Model reasoning:
Touches shared telemetry cadence and multiple consumers; easy to regress responsiveness without broader reasoning.
Verified pattern:
`useTorrentSpeedHistory`, `useEngineSpeedHistory`, and `useSessionSpeedHistory` sample speed history on clock ticks; `NetworkGraph` also subscribes to the UI clock per instance; `useEngineHeartbeat` and `useSessionStats` create heartbeat subscriptions.
Why worth fixing:
This is directly about store/subscription correctness: the same telemetry domain is sampled in parallel by multiple hooks/components, increasing per-tick work.
Files:
`frontend/src/modules/dashboard/hooks/useTorrentSpeedHistory.ts`
`frontend/src/shared/hooks/useEngineSpeedHistory.ts`
`frontend/src/shared/hooks/useSessionSpeedHistory.ts`
`frontend/src/shared/ui/graphs/NetworkGraph.tsx`
`frontend/src/shared/hooks/useEngineHeartbeat.ts`
`frontend/src/app/hooks/useSessionStats.ts`
Best way:
Assign one owner per telemetry stream and feed consumers from shared snapshots instead of per-consumer sampling loops.
Done when:
Per-tick telemetry work scales primarily with data size, not with number of subscribed UI components.

- [x] 33. performance - Reduce large collection fan-out through shell/dashboard view-model chain
Suggested model: `regular codex`
Model reasoning:
High-frequency dataflow spans core shell and dashboard VMs; needs careful boundary design to avoid regressions.
Verified pattern:
`useTorrentData` updates `torrents` from heartbeat and publishes arrays broadly; downstream view-models and layout props consume whole collections.
Why worth fixing:
This is directly tied to props/store correctness: a high-frequency, high-cardinality collection crosses broad UI boundaries and can trigger avoidable re-renders outside the table domain.
Files:
`frontend/src/modules/dashboard/hooks/useTorrentData.ts`
`frontend/src/app/viewModels/useWorkspaceShellViewModel.ts`
`frontend/src/modules/dashboard/components/Dashboard_Layout.tsx`
`frontend/src/modules/dashboard/viewModels/useTorrentTableViewModel.ts`
`frontend/src/app/viewModels/useAppViewModel.ts`
Best way:
Keep full torrent collections owned by the table/data domain; pass only narrow derived slices (counts/flags/selected IDs) into shell/navbar/status surfaces.
Done when:
Heartbeat updates can change torrent rows without forcing unrelated shell/layout components to re-render.

- [x] 36. performance - Split composite shell view-model update paths
Suggested model: `regular codex`
Model reasoning:
Cross-cutting shell VM decomposition with high interaction surface; requires stable incremental extraction strategy.
Verified pattern:
`useWorkspaceShellViewModel` aggregates runtime and UI control state into large composite models consumed by non-memoized shell/layout components.
Why worth fixing:
This is props/view-model correctness: high-frequency telemetry and low-frequency UI state are bundled and propagated together.
Files:
`frontend/src/app/viewModels/useWorkspaceShellViewModel.ts`
`frontend/src/app/viewModels/useAppViewModel.ts`
`frontend/src/modules/dashboard/viewModels/useTorrentTableViewModel.ts`
`frontend/src/app/components/WorkspaceShell.tsx`
`frontend/src/app/components/layout/Navbar.tsx`
Best way:
Partition high-frequency status telemetry from stable shell/navigation control state and keep separate memo boundaries.
Done when:
Telemetry updates do not churn composite shell objects consumed by unrelated layout controls.

- [x] 37. architecture - Clarify transformation ownership across service/hook/view-model layers
Suggested model: `regular codex`
Model reasoning:
Requires architecture-level mapping of derivation ownership across adapter, heartbeat, hooks, and view-models.
Verified pattern:
Data is transformed across multiple layers (adapter normalization, heartbeat delta/history derivation, hook snapshot/diff logic, view-model filtering/summarization), making authority boundaries harder to reason about.
Why worth fixing:
This is ownership correctness: when the same domain is transformed in many layers, duplicate derivation and inconsistent state interpretation become likely.
Files:
`frontend/src/services/rpc/rpc-base.ts`
`frontend/src/services/rpc/heartbeat.ts`
`frontend/src/app/hooks/useSessionStats.ts`
`frontend/src/modules/dashboard/hooks/useTorrentData.ts`
`frontend/src/modules/dashboard/viewModels/useTorrentTableViewModel.ts`
`frontend/src/app/viewModels/useWorkspaceShellViewModel.ts`
Best way:
Define one owner per derived data class and keep downstream layers as pure consumers of already-shaped data.
Done when:
Each derived state family has one clear producer and downstream code no longer re-derives equivalent values.

- [x] 38. architecture - Reduce cross-layer mutable ref coordination for refresh/client handles
Suggested model: `regular codex`
Model reasoning:
High-coupling orchestration concern with lifecycle sensitivity; wrong edits can break refresh and recovery flows.
Verified pattern:
`MutableRefObject` handles (`clientRef`, refresh refs, pending deletion refs) are written/read across App, workspace view-model, orchestrator, dispatch helpers, settings flow, and recovery controller.
Why worth fixing:
This is state authority correctness: mutable refs crossing many layers obscure who owns updates and lifecycle boundaries.
Files:
`frontend/src/app/App.tsx`
`frontend/src/app/orchestrators/useTorrentOrchestrator.ts`
`frontend/src/app/viewModels/useWorkspaceShellViewModel.ts`
`frontend/src/app/actions/torrentDispatch.ts`
`frontend/src/app/hooks/useSettingsFlow.ts`
`frontend/src/modules/dashboard/hooks/useRecoveryController.ts`
Best way:
Assign single ownership for refresh/client handles and expose explicit command/query calls instead of cross-layer shared refs.
Done when:
Refresh and client handles have one write owner and no broad ref fan-out across feature boundaries.

- [x] 40. refactor - Narrow overly wide hook/view-model return surfaces
Suggested model: `regular codex`
Model reasoning:
Wide-surface split refactor can cascade into many callsites; requires deliberate sequencing to avoid churn.
Verified pattern:
Several hooks expose very wide return objects mixing multiple concerns (state, commands, lifecycle toggles, derived display values), increasing coupling.
Why worth fixing:
This is props/view-model correctness: consumers of wide objects inherit unrelated change dependencies and broaden update surfaces.
Files:
`frontend/src/modules/torrent-add/hooks/useAddTorrentModalViewModel.ts`
`frontend/src/modules/dashboard/viewModels/useTorrentTableViewModel.ts`
`frontend/src/app/viewModels/useWorkspaceShellViewModel.ts`
Best way:
Split by concern (query state, commands, transient UI state, telemetry) and pass only the needed sub-surface to each consumer.
Done when:
Most consumers read small, concern-specific surfaces instead of whole composite objects.

- [x] 34. architecture - Reduce direct EngineAdapter coupling in UI hooks
Suggested model: `regular codex`
Model reasoning:
System-wide boundary change with many consumers; needs stronger reasoning and careful migration sequencing.
Verified pattern:
Adapter is exposed via `TorrentClientProvider` and consumed directly by multiple app/domain hooks (`useRpcConnection`, `useTorrentData`, `useTransmissionSession`, `useTorrentSpeedHistory`, `useEngineHeartbeat`, `useEngineSpeedHistory`, and others).
Why worth fixing:
This is a state ownership issue: direct adapter access across many hooks spreads authority for reads/writes and makes update behavior hard to reason about.
Files:
`frontend/src/app/providers/TorrentClientProvider.tsx`
`frontend/src/app/hooks/useRpcConnection.ts`
`frontend/src/services/rpc/rpc-base.ts`
Note:
`frontend/src/app/hooks/useTorrentClient.ts` is not present; `useTorrentClient` is exported by the provider module.
Best way:
Constrain raw adapter usage to a small number of domain owners and expose stable query/command surfaces to UI hooks.
Done when:
UI-facing hooks no longer fan out direct adapter method calls across unrelated modules.

## Completed Tasks (Do Not Revisit)

### Recently Completed
- [x] 32. high - Session telemetry context split
  - Extracted heartbeat-driven session telemetry from `SessionContext` into dedicated `SessionTelemetryContext`.
  - `useWorkspaceShellViewModel` now reads telemetry via `useSessionTelemetry`.
  - Validation: `npm run build` passed.
- [x] 30. architectural - Remove residual dashboard TODO stopgaps.
- [x] 31. medium - Action parity audit (toolbar/context/hotkeys).
- [x] 28. feature - Refactor AddTorrentFileTable (Tree adoption).
- [x] 28b. cleanup - Remove redundant AddTorrentModal search.
- [x] 13d. medium - Settings/Recovery view-model cleanup.
- [x] 13b. high - Torrent table view-model.
- [x] 22. architectural - Recovery capability clarity.
- [x] 23. architectural - Recovery lifetime ownership.
- [x] 25. architectural - Scheduling authority.

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
