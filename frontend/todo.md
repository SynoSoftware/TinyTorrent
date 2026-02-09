# Frontend Todo List

## Bird's-Eye Triage (2026-02-07 refresh)

Triage intent:
- Align ordering to `frontend/AGENTS.md` section `20` and section `21` hard rules first.
- Keep only tasks with clear ownership payoff, explicit contract payoff, or measurable prop-drilling reduction.
- Merge overlapping items into single change sets to avoid touching the same surfaces repeatedly.

Triage conclusions applied:
- Queue now contains only open tasks; completed tasks were removed from execution order.
- No open task was removed, but overlapping tasks are now explicitly merged for execution.
- Task ordering now prioritizes authority/control-plane decisions before outcome contracts, then prop-drilling cleanup, then broad hygiene.
- Maintainability guardrail: small files are acceptable only when they own real domain behavior; wrapper/pass-through/empty files are architecture debt and must be merged into their owning authority.

## Small-File Refactor Notes (2026-02-08)

Conclusions applied:
- Rejected blanket “single-function file is always bad” cleanup because it creates synthetic merges and harms local readability.
- Enforced strict cleanup only for wrapper/proxy/empty files with no real ownership.

Completed under this rule:
- Merged focus/selection/lifecycle/workspace-modal compatibility hooks into `AppShellStateContext`.
- Merged torrent command/action compatibility hooks into `AppCommandContext`.
- Removed `useShellAgent` and `UiModeContext` wrappers; callers now consume authoritative surfaces directly.
- Inlined settings modal wrapper by exporting `SettingsModal` from `SettingsModalView`.
- Removed empty `usePerformanceHistory.tsx`.
- Moved bootstrap ownership to `src/main.tsx` and deleted `src/app/main.tsx` pass-through entry.

## Human-First Refactor Policy (2026-02-08 update)

Primary purpose of this refactor stream:
- Make code maintainable, robust, and easy to read by a human.
- Do not optimize for abstraction density or “perfect architecture” on paper.

Execution guardrails:
- Prefer direct, local, domain-named code over introducing new indirection layers.
- Add a new abstraction only when it clearly reduces total complexity across at least two real call sites.
- Every task must improve at least one of: readability, robustness, or ownership clarity.
- “No-net-benefit” refactors are out of scope.
  Examples: wrapper renames, pass-through hooks/components, micro-splits that increase file-hopping.
- Each completed task should either remove code, collapse plumbing, or make failure/lifecycle behavior explicit.

## Wrapper-Cleanup Rule (2026-02-08 update)

For every single-function/thin-wrapper file, keep it only if it has at least one valid role:
- Boundary role (adapter / RPC / native / IO).
- Authority role (feature ViewModel or orchestrator surface).
- Typed contract surface consumed by multiple features.
- Cross-feature reuse point.
- Lifecycle ownership boundary (heartbeat/subscription owner).

If none of these apply, the wrapper should not exist.

Execution procedure:
1. Bucket wrappers into:
   - A. Boundary wrappers -> keep.
   - B. Authority wrappers -> keep.
   - C. Pass-through wrappers -> remove.
2. Merge C wrappers into the real owner:
   - service pass-through -> service file
   - hook pass-through -> feature ViewModel
   - UI helper wrapper -> component/shared util
   - command forwarder -> orchestrator/ViewModel
3. Run traceability checks:
   - command surface count did not multiply
   - authority did not move down into UI
   - adapter boundaries still exist
   - no circular imports introduced

## Implementation Queue (open tasks only, dependency-first)

Execution rule:
Process by this order, not by raw task number.

### Phase 1 - Contract TODO Reconciliation Gate

1. `130` - remove remaining section-20/21 TODO contracts from active surfaces or convert them to explicit tracked tasks.

### Phase 2 - Contract Spine + Lifecycle Baseline

1. `123` - replace exception/void app dispatch bus contract with typed outcomes.
2. `96` - explicit connect/reconnect failure outcomes.
3. `105` - lifecycle ownership for speed-history stores.

### Phase 3 - Recovery Command Cluster (single delivery)

1. `94` + `95` + `101` + `115` - one arbitration + set-location + recovery-gate typed-outcome model.
2. `106` + `107` - restore open-folder command authority, then make outcomes explicit.
3. `97` - remove detail-content command prop threading after command authority is centralized.

### Phase 4 - Dashboard Interaction Contracts

1. `104` + `121` - replace dual detail-open callbacks with one typed intent owner.
2. `113` - explicit column-drag commit outcomes.
3. `111` - typed remove-confirmation outcomes and close-policy correctness.
4. `124` - expose post-recheck refresh failures in workflow outcomes.
5. `112` - command palette outcome-aware close behavior.

### Phase 5 - Settings Contract Spine

1. `108` - typed async outcomes for settings action context.
2. `114` - typed outcomes for `BufferedInput` commit flow.
3. `117` - typed outcomes for test-port diagnostics.
4. `110` - explicit system-integration read outcomes.
5. `109` - remove interface-tab behavior prop threading.

### Phase 6 - Capability Authority + Destination/Clipboard

1. `120` - single authority for clipboard capability detection.
2. `116` - map clipboard action outcomes from capability-aware clipboard layer.
3. `118` - remove UA heuristic probing from destination validation authority.
4. `119` - remove browse-command threading in add-destination flow with typed outcomes.

### Phase 7 - Structural Layout Primitive Normalization (new)

1. `125` - normalize modal/dialog surfaces to one canonical modal surface contract.
2. `126` - normalize floating menus/popovers/tooltips to one menu surface contract.
3. `127` - normalize panel/card/table-shell framing to `Surface` ownership.
4. `128` - normalize stage/centering wrappers to `Section` ownership.

### Phase 8 - Hardening + Stabilization Declaration (new)

1. `129` - targeted regression sweep of high-risk completed tasks (`54-93`, `98-103`, `122`) for authority/contract drift.
2. `139` - changed-file lint/hygiene cleanup (no-empty catches, unused symbols, trailing whitespace/EOF drift).
3. `140` - restore context/command boundary test coverage after provider consolidation.
4. `131` - final contract/UI validation pass and closeout checklist (stabilization declaration).

## Consolidation Notes (execution guards)

- `130` must run immediately after wrapper cleanup; do not carry orphan section-20/21 TODOs forward.
- `123` is a prerequisite for `111`, `112`, and `124`.
- `104` and `121` are one change set.
- `106` must land before `107`.
- `106` + `107` should land before `97`.
- `108` is a prerequisite for `114`, `117`, `110`, and `109`.
- `120` must land before `116`.
- `118` should land before `119`.
- `94` + `95` + `101` + `115` should land together.
- `125` + `126` + `127` + `128` should be delivered as one normalization pass.
- `139` and `140` must run before `131`.

## Keep / Defer Guidance

- Keep only tasks that have explicit readability/robustness payoff and clear ownership.
- Keep command/event contracts outcome-driven; no return to void/throw dual surfaces.
- Keep feature-level cohesion over wrapper proliferation.
- Defer any refactor that increases indirection without removing real complexity.
- Re-evaluate remaining tasks after each phase and drop/merge anything that becomes abstraction-only.

## Audit Findings (2026-02-07, frontend-only)

Coverage snapshot:
`frontend/src` non-test files scanned: `218`
Relative import usages: `90`
`TODO:` debt items: `166`
`any` / `as any` usages: `28`
Numeric Tailwind utility usages in TSX: `176`
Large files over 400 lines: `23` (over 700 lines: `13`)

Task 73 TODO Migration Register:
| ID | Source | Owner | Priority | Due date | Tracking link |
| --- | --- | --- | --- | --- | --- |
| T73-001 | `frontend/src/services/rpc/normalizers.ts` authority/determinism guardrails | `rpc + recovery` | `P1` | `2026-03-14` | `85` |
| T73-002 | `frontend/src/services/rpc/normalizers.ts` module-level `verifyStateMap` ownership/reset | `rpc + session lifecycle` | `P0` | `2026-02-21` | `85` |
| T73-003 | `frontend/src/shared/utils/recoveryFormat.ts` gate-view-model authority for recovery formatting | `recovery ui + controller` | `P1` | `2026-03-07` | `95`, `101` |
| T73-004 | `frontend/src/shared/utils/recoveryFormat.ts` remove message-parsing classification heuristics from UI formatter | `recovery ui + controller` | `P1` | `2026-03-07` | `95`, `101` |
| T73-005 | `frontend/src/modules/settings/components/InterfaceTabContent.tsx` prop-drilling reduction to settings UI view-model/context | `settings ui` | `P1` | `2026-02-28` | `109` |
| T73-006 | `frontend/src/app/context/ConnectionConfigContext.tsx` token override removal after profile model cleanup | `connection settings` | `P2` | `2026-03-28` | `83` |

## Section 20/21 + Prop-Drilling Focus (2026-02-07 continuation)

- [x] 94. section-20.6 - Replace silent first-writer-wins arbitration in inline set-location ownership
Owner:
`dashboard recovery/set-location`
Violation:
Inline set-location ownership conflicts (`context-menu` vs `general-tab` vs `recovery-modal`) are silently ignored (`conflict`/`already-owned`) without explicit rejection reasons or surfaced outcomes.
Required refactor:
Define arbitration outcomes as data (`acquired|rejected_conflict|already_owned`) and expose rejection reason to caller/UI.
Affected files:
`frontend/src/modules/dashboard/hooks/useRecoveryController.ts`
`frontend/src/app/context/RecoveryContext.tsx`
`frontend/src/modules/dashboard/components/TorrentRecoveryModal.tsx`
Completion:
Started `[_]` and completed `2026-02-08`; inline owner arbitration now returns explicit outcomes and exposes conflict reasons (`owned_elsewhere` / `already_owned`) through the set-location command result.

- [x] 95. section-20.2/20.5 - Make set-location command contract explicit in recovery context
Owner:
`dashboard recovery commands`
Violation:
`handleSetLocation` returns `Promise<void>` and can silently no-op when browse is unavailable/cancelled, manual is unsupported, or ownership acquisition fails.
Required refactor:
Return typed outcomes (`picked|manual_opened|cancelled|unsupported|conflict|failed`) and update callers to handle each state explicitly.
Affected files:
`frontend/src/app/context/RecoveryContext.tsx`
`frontend/src/modules/dashboard/hooks/useRecoveryController.ts`
`frontend/src/modules/dashboard/hooks/useTorrentDetailsGeneralViewModel.ts`
Completion:
Started `[_]` and completed `2026-02-08`; `handleSetLocation` now returns typed outcomes (`picked|manual_opened|cancelled|unsupported|conflict|failed`) and callers consume the explicit contract.

- [x] 96. section-20.2/20.5 - Stop swallowing RPC startup/reconnect failures in connection hook
Owner:
`session connection lifecycle`
Violation:
`useRpcConnection` swallows initial probe errors and reconnect failures (`catch(() => {})` and non-throw reconnect path), so callers cannot consume explicit failure outcomes.
Required refactor:
Expose typed connect/reconnect outcomes and keep status transitions/data flow explicit rather than inferred from logs and mutable status side effects.
Affected files:
`frontend/src/app/hooks/useRpcConnection.ts`
`frontend/src/app/hooks/useTransmissionSession.ts`
`frontend/src/app/context/SessionContext.tsx`
Completion:
Started `[_]` and completed `2026-02-08`; connect/reconnect now return typed outcomes and failure states are propagated instead of swallowed. UI actions consume outcomes and show explicit failure feedback.

- [x] 97. section-21.8/21.9 - Remove command prop threading in detail content tab surface
Owner:
`dashboard detail tabs`
Violation:
`useDetailTabs` constructs and forwards command callbacks (`onRecheck`, `onDownloadMissing`, `onOpenFolder`) through tab-surface props instead of reading command/recovery context at leaf usage.
Required refactor:
Move behavior command consumption into one content-tab command authority surface (feature ViewModel preferred; context only when cross-cutting/global), and keep tab surfaces data-focused.
Affected files:
`frontend/src/modules/dashboard/hooks/useDetailTabs.ts`
`frontend/src/modules/dashboard/components/TorrentDetails_Content.tsx`
`frontend/src/app/viewModels/workspaceShellModels.ts`
Completion:
Started `[_]` and completed `2026-02-08`; content-tab recovery commands are now owned at the `ContentTab` leaf via command/recovery context, and callback threading (`onRecheck`/`onDownloadMissing`/`onOpenFolder`) was removed from tab surfaces and workspace-shell detail view-model wiring.

- [x] 101. section-20.2/20.5 - Replace nullable recovery gate callback outcomes with explicit result variants
Owner:
`recovery gate contract`
Violation:
`RecoveryGateCallback` returns `Promise<RecoveryGateOutcome | null>` and recovery controller branches return `null` for multiple states (`not-applicable`, `unsupported`, `no-blocking-outcome`), forcing callers to infer meaning.
Required refactor:
Remove nullable contract and define explicit typed outcomes for every gate path (`continue|handled|cancelled|not_required|unsupported|conflict`).
Affected files:
`frontend/src/app/types/recoveryGate.ts`
`frontend/src/modules/dashboard/hooks/useRecoveryController.ts`
Completion:
Started `[_]` and completed `2026-02-08`; `RecoveryGateCallback` is non-nullable and now returns explicit `not_required` variants instead of `null`.

- [x] 104. section-21.8/21.9 - Remove detail-open behavior prop threading through torrent table surfaces
Owner:
`dashboard table/detail integration`
Violation:
Detail-open commands are threaded from layout into `TorrentTable` props (`onRequestDetails`, `onRequestDetailsFullscreen`) and then through table view-model/surface wiring, indicating behavior plumbing by caller position.
Required refactor:
Consume detail-open commands from one authoritative command surface at the row interaction boundary (feature ViewModel preferred; context only if cross-cutting/global) and keep table surface contracts data-focused.
Affected files:
`frontend/src/modules/dashboard/components/TorrentTable.tsx`
`frontend/src/modules/dashboard/viewModels/useTorrentTableViewModel.ts`
`frontend/src/modules/dashboard/components/TorrentTable_Body.tsx`
Completion:
Started `[_]` and completed `2026-02-08`; detail-open actions are now provided through a dedicated dashboard detail-open command context consumed at the row interaction boundary, and `TorrentTable`/table view-model props no longer thread `onRequestDetails` or `onRequestDetailsFullscreen`.

- [x] 105. section-21.3/21.4 - Declare lifecycle ownership for shared speed-history stores
Owner:
`telemetry/speed-history`
Violation:
Speed-history state is owned by module-level stores (`sessionSpeedHistoryStore`, `storeByClient`) with implicit app-lifetime behavior and no explicit reset contract on session/client lifecycle transitions.
Required refactor:
Move speed-history ownership under one declared lifecycle boundary (session/app provider), define reset/teardown rules explicitly, and remove implicit module-singleton ownership.
Affected files:
`frontend/src/shared/hooks/useSessionSpeedHistory.ts`
`frontend/src/shared/hooks/speedHistoryStore.ts`
`frontend/src/shared/hooks/useSpeedHistoryDomain.ts`
`frontend/src/shared/hooks/useEngineSpeedHistory.ts`
`frontend/src/modules/dashboard/hooks/useTorrentSpeedHistory.ts`
`frontend/src/app/context/SessionContext.tsx`
`frontend/src/app/providers/engineDomains.ts`
Completion:
Started `[_]` and completed `2026-02-08`; speed-history stores are now created and owned by `SessionProvider` and reset on client change. Shared hooks consume the provider-owned stores (no module singletons).

- [x] 106. section-21.8/21.9 - Restore command authority for open-folder behavior and remove prop threading
Owner:
`dashboard recovery/open-folder commands`
Violation:
Open-folder behavior is threaded as optional props/params (`openFolder`, `openTorrentFolder`) through table/view-model/column metadata instead of a context-owned command surface.
Required refactor:
Expose one authoritative open-folder command surface from the owning feature authority (feature ViewModel/recovery owner; context only if cross-cutting/global) and consume it directly at leaves (status cell, row menu, general tab) without plumbing props through intermediate layers.
Affected files:
`frontend/src/app/context/RecoveryContext.tsx`
`frontend/src/app/hooks/useOpenTorrentFolder.ts`
`frontend/src/modules/dashboard/viewModels/useTorrentTableViewModel.ts`
`frontend/src/modules/dashboard/hooks/useTorrentTableColumns.tsx`
`frontend/src/modules/dashboard/components/TorrentTable_ColumnDefs.tsx`
`frontend/src/modules/dashboard/components/TorrentTable_StatusColumnCell.tsx`
`frontend/src/modules/dashboard/hooks/useTorrentTableContextActions.ts`
`frontend/src/modules/dashboard/hooks/useTorrentDetailsGeneralViewModel.ts`
Completion:
Started `[_]` and completed `2026-02-08`; open-folder authority now flows through `RecoveryContext.handleOpenFolder`, and table/view-model/column/status/context-action/general-tab surfaces consume it directly without `openFolder`/`openTorrentFolder` prop threading.

- [x] 107. section-20.2/20.5 - Make open-folder workflow outcomes explicit data
Owner:
`open-folder workflow`
Violation:
`useOpenTorrentFolder` returns `Promise<void>` and encodes unsupported/fallback/failure states through feedback side-effects and console logging, so callers cannot consume deterministic outcomes.
Required refactor:
Return typed open-folder outcomes (`opened|opened_parent|opened_root|unsupported|missing_path|failed`) and update callers to branch on result data instead of inferring from side-effects.
Affected files:
`frontend/src/app/hooks/useOpenTorrentFolder.ts`
`frontend/src/modules/dashboard/hooks/useTorrentTableContextActions.ts`
`frontend/src/modules/dashboard/hooks/useTorrentDetailsGeneralViewModel.ts`
`frontend/src/modules/dashboard/components/TorrentTable_MissingFilesStatusCell.tsx`
Completion:
Started `[_]` and completed `2026-02-08`; `useOpenTorrentFolder` now returns explicit outcomes (`opened|opened_parent|opened_root|unsupported|missing_path|failed`) via shared contract type, and callers branch on result status instead of assuming success from side effects.

- [x] 108. section-20.2/20.5 - Complete SettingsForm action contracts with typed async outcomes
Owner:
`settings form actions`
Violation:
`SettingsFormContext` exposes behavior commands (`onBrowse`, `onCopyConfigJson`, `onReconnect`) as void callbacks while implementations are async and failure-prone, causing silent outcome loss in renderers.
Required refactor:
Define typed async action outcomes (`applied|cancelled|unsupported|failed`) in settings action context and make renderers consume those results explicitly.
Affected files:
`frontend/src/modules/settings/context/SettingsFormContext.tsx`
`frontend/src/modules/settings/components/SettingsBlockRenderers.tsx`
`frontend/src/modules/settings/hooks/useSettingsModalController.ts`
`frontend/src/modules/settings/components/tabs/connection/ConnectionManager.tsx`
Completion:
Started `[_]` and completed `2026-02-08`; settings form actions now return typed async outcomes (`applied|cancelled|unsupported|failed`) and settings renderers/connection controls consume those results explicitly.

- [x] 109. section-21.8/21.9 - Remove interface-tab behavior prop threading from settings modal composition
Owner:
`settings/interface tab`
Violation:
`InterfaceTabContent` receives behavior/state props (`isImmersive`, `onToggleWorkspaceStyle`, `hasDismissedInsights`) through settings modal controller/view layers, expanding pass-through surfaces instead of consuming context-owned state at the leaf.
Required refactor:
Publish interface-tab state/commands via one settings authority surface (feature ViewModel preferred; context if cross-cutting/global) and delete behavior prop wiring from modal composition layers to `InterfaceTabContent`.
Affected files:
`frontend/src/modules/settings/components/InterfaceTabContent.tsx`
`frontend/src/modules/settings/components/SettingsModalView.tsx`
`frontend/src/modules/settings/hooks/useSettingsModalController.ts`
`frontend/src/modules/settings/context/SettingsFormContext.tsx`
`frontend/src/app/viewModels/useAppViewModel.ts`
`frontend/src/app/viewModels/workspaceShellModels.ts`
Completion:
Started `[_]` and completed `2026-02-08`; interface-tab behavior/state is now consumed through a single settings authority surface (`SettingsFormContext.interfaceTab`), and `SettingsModalView` no longer threads `isImmersive` / `onToggleWorkspaceStyle` / `hasDismissedInsights` props into `InterfaceTabContent`.

- [x] 110. section-20.2 - Expose system-integration read failures as explicit outcomes
Owner:
`settings/system integration`
Violation:
`SystemTabContent` swallows `refreshIntegration` failures and keeps previous values, so UI may present stale integration truth without explicit error/unsupported state.
Required refactor:
Model system-integration reads as typed outcomes (`ok|unsupported|failed`) and render explicit status for each branch instead of silent stale fallback.
Affected files:
`frontend/src/modules/settings/components/tabs/system/SystemTabContent.tsx`
`frontend/src/modules/settings/hooks/useAsyncToggle.ts`
`frontend/src/app/agents/shell-agent.ts`
Completion:
Started `[_]` and completed `2026-02-08`; system-integration reads now return explicit outcomes (`ok|unsupported|failed`) via `ShellAgent`, and `SystemTabContent` renders unsupported/failed read states explicitly instead of silently relying on stale status values.

## Additional Findings (2026-02-07, follow-up)

- [x] 111. section-20.2/20.5/21.9 - Make remove-confirmation workflow outcome-driven and remove shell-level behavior threading
Owner:
`workspace shell + delete flow`
Violation:
`RemoveConfirmationModal` accepts `onConfirm: Promise<void> | void`, catches errors, and always closes in `finally`, so delete failure/unsupported states are hidden; keyboard Enter handling is also wired through an effect with stale closure risk for `deleteData`, and `WorkspaceShell` threads an inline behavior callback into the modal.
Required refactor:
Use typed delete outcomes at modal boundary (`success|canceled|unsupported|failed`), close only on explicit close-eligible outcomes, and remove behavior callback threading by consuming a dedicated delete command surface at the leaf.
Affected files:
`frontend/src/modules/torrent-remove/components/RemoveConfirmationModal.tsx`
`frontend/src/app/components/WorkspaceShell.tsx`
`frontend/src/app/viewModels/workspaceShellModels.ts`
Completion:
Started `[_]` and completed `2026-02-08`; delete confirmation now consumes a dedicated delete-command surface via context at the modal leaf, normalizes typed outcomes (`success|canceled|unsupported|failed`), and closes only on explicit close-eligible outcomes.

- [x] 112. section-20.5 - Make command-palette action contract outcome-aware instead of always-close behavior
Owner:
`command palette`
Violation:
`CommandAction.onSelect` is `void | Promise<void>`, and `CommandPalette` closes immediately after await, so unsupported/failed outcomes from command handlers cannot be surfaced or handled explicitly.
Required refactor:
Promote palette action contract to typed outcomes, and make close/feedback behavior branch on outcome (`success` closes; `unsupported/failed` stays open or shows explicit status).
Affected files:
`frontend/src/app/components/CommandPalette.tsx`
`frontend/src/app/commandRegistry.ts`
`frontend/src/app/viewModels/useWorkspaceShellViewModel.ts`
Completion:
Started `[_]` and completed `2026-02-08`; command palette actions now return typed outcomes, close only on `success`, and keep the palette open with explicit status messaging for `unsupported`/`failed`/`no_selection`.

- [x] 113. section-20.2/20.5 - Remove silent column-drag commit swallowing in table interactions
Owner:
`dashboard/table interactions`
Violation:
`useTorrentTableInteractions` catches `table.setColumnOrder` failures with `catch {}` and continues, making reorder commit failure non-observable and allowing local/UI state drift.
Required refactor:
Emit explicit drag-commit outcomes/events (`applied|rejected|failed`) and let table VM handle failure reconciliation/feedback instead of swallowing exceptions.
Affected files:
`frontend/src/modules/dashboard/hooks/useTorrentTableInteractions.ts`
`frontend/src/modules/dashboard/viewModels/useTorrentTableViewModel.ts`
Completion:
Started `[_]` and completed `2026-02-08`; column-header drag now emits explicit commit outcomes (`applied|rejected|failed`) and table view-model owns commit + failure feedback/reconciliation instead of silent catch-and-ignore behavior.

- [x] 114. section-20.2/20.5 - Replace BufferedInput boolean/duck-typed commit contract with explicit typed outcomes
Owner:
`settings/input commit flow`
Violation:
`BufferedInput` accepts `onCommit: boolean | void`, duck-types async via `(result as any).then`, and treats only `false` as failure, so invalid/canceled/failed paths are implicit and non-exhaustive.
Required refactor:
Define typed commit outcomes (`applied|rejected_validation|canceled|failed|unsupported`) and remove Promise duck-typing/`any` from commit handling.
Affected files:
`frontend/src/modules/settings/components/BufferedInput.tsx`
`frontend/src/modules/settings/components/SettingsBlockRenderers.tsx`
Completion:
Started `[_]` and completed `2026-02-08`; `BufferedInput` commit contract now uses explicit typed outcomes (`applied|rejected_validation|canceled|failed|unsupported`) with no Promise duck-typing/`any`, and settings input commits return typed outcomes explicitly.

- [x] 115. section-20.2/20.5 - Make inline set-location submit outcomes explicit instead of boolean success inference
Owner:
`dashboard recovery inline editor`
Violation:
`confirmInlineSetLocation` returns `Promise<boolean>` while callers infer behavior from `true/false`; multiple distinct outcomes (validation error, ownership loss, missing target, failed recover, verifying transition) collapse into one boolean.
Required refactor:
Return typed inline-submit outcomes (`submitted|verifying|validation_error|conflict|missing_target|failed|canceled`) and update row-menu/general-tab consumers to branch on explicit outcome data.
Affected files:
`frontend/src/app/context/RecoveryContext.tsx`
`frontend/src/modules/dashboard/hooks/useRecoveryController.ts`
`frontend/src/modules/dashboard/hooks/useTorrentDetailsGeneralViewModel.ts`
`frontend/src/modules/dashboard/components/TorrentTable_RowMenu.tsx`
Completion:
Started `[_]` and completed `2026-02-08`; inline submit now returns typed outcomes and row-menu close behavior branches on typed result (`submitted|verifying`) instead of boolean inference.

- [x] 116. section-20.2/20.5 - Stop reporting clipboard context-menu actions as success when copy fails/unsupported
Owner:
`dashboard clipboard actions`
Violation:
Context-menu handlers for `copy-hash` / `copy-magnet` always return `success` even when clipboard write is unsupported or fails because clipboard helper outcomes are discarded.
Required refactor:
Propagate typed clipboard outcomes (`copied|unsupported|failed|empty`) from helper hooks and map menu command outcomes accordingly.
Affected files:
`frontend/src/shared/utils/clipboard.ts`
`frontend/src/modules/dashboard/hooks/useTorrentClipboard.ts`
`frontend/src/modules/dashboard/hooks/useTorrentTableContextActions.ts`
Completion:
Started `[_]` and completed `2026-02-08`; clipboard writes now return typed outcomes (`copied|unsupported|failed|empty`) and context-menu copy commands map those outcomes to explicit command results instead of always reporting success.

- [x] 117. section-20.2/20.5 - Replace settings test-port boolean/throw contract with typed outcomes
Owner:
`settings connection diagnostics`
Violation:
`testPort` is modeled as `Promise<boolean>` + exceptions, forcing callers to infer unsupported/failure/offline states from throws and generic catch blocks.
Required refactor:
Adopt typed test-port outcomes (`open|closed|unsupported|offline|failed`) at engine-domain and settings action boundaries.
Affected files:
`frontend/src/app/providers/engineDomains.ts`
`frontend/src/app/hooks/useSettingsFlow.ts`
`frontend/src/modules/settings/hooks/useSettingsModalController.ts`
`frontend/src/app/viewModels/workspaceShellModels.ts`
Completion:
Started `[_]` and completed `2026-02-08`; test-port diagnostics now use typed outcomes (`open|closed|unsupported|offline|failed`) from engine-domain through settings flow and modal feedback handling.

- [x] 118. section-20.4/21.5 - Remove user-agent heuristic probing from add-destination validation authority
Owner:
`torrent-add destination policy`
Violation:
`isValidDestinationForMode` branches on `navigator.userAgent` (`isProbablyWindows`) to decide valid path shapes, so behavior depends on browser identity heuristics instead of one declared authority contract.
Required refactor:
Move destination path-policy decisions to a single explicit authority (session/runtime capability contract) and keep validator functions pure and heuristic-free.
Affected files:
`frontend/src/modules/torrent-add/utils/destination.ts`
`frontend/src/modules/torrent-add/hooks/useAddTorrentDestinationViewModel.ts`
`frontend/src/modules/torrent-add/hooks/useAddTorrentModalViewModel.ts`
Completion:
Started `[_]` and completed `2026-02-08`; destination validation now uses an explicit session/runtime capability policy (`uiCapabilities.destinationPathPolicy`) with a pure validator (`isValidDestinationForPolicy`), and browser `navigator.userAgent` heuristics were removed.

- [x] 119. section-20.2/20.5/21.9 - Replace add-destination browse no-op/void contract and remove browse-command prop threading
Owner:
`torrent-add browse command flow`
Violation:
Browse behavior is threaded as `onBrowseDirectory` through modal/hook layers and executed via `handleBrowse: Promise<void>`, with silent no-op/cancelled branches (`if !onBrowseDirectory return`, falsy `next` ignored), so callers cannot handle explicit outcomes.
Required refactor:
Expose browse-directory as a typed command surface (`picked|cancelled|unsupported|failed`) at one owning authority boundary (feature ViewModel preferred; context only if cross-cutting/global) and consume it at leaves without behavior-prop threading through non-owning layers.
Affected files:
`frontend/src/modules/torrent-add/components/AddTorrentModal.tsx`
`frontend/src/modules/torrent-add/components/AddTorrentDestinationGatePanel.tsx`
`frontend/src/modules/torrent-add/components/AddTorrentSettingsPanel.tsx`
`frontend/src/modules/torrent-add/hooks/useAddTorrentModalViewModel.ts`
`frontend/src/modules/torrent-add/hooks/useAddTorrentDestinationViewModel.ts`
Completion:
Started `[_]` and completed `2026-02-08`; add-destination browse now uses a typed feature-owned command outcome (`picked|cancelled|unsupported|failed`) in the destination ViewModel, and `onBrowseDirectory` behavior prop threading was removed from app/view-model/modal layers.

- [x] 120. section-20.4/21.2 - Move clipboard capability detection to a single control-plane authority
Owner:
`clipboard command surfaces`
Violation:
Clipboard support is probed ad-hoc in UI hooks/helpers (`navigator.clipboard`) and consumed directly in table/menu rendering, violating capability-resolution centralization.
Required refactor:
Resolve clipboard capability once in a runtime/session capability authority and expose it as explicit state; remove local `navigator` probing from feature hooks/helpers.
Affected files:
`frontend/src/modules/dashboard/hooks/useTorrentClipboard.ts`
`frontend/src/shared/utils/clipboard.ts`
`frontend/src/modules/dashboard/viewModels/useTorrentTableViewModel.ts`
`frontend/src/modules/dashboard/components/TorrentTable_RowMenu.tsx`
Completion:
Started `[_]` and completed `2026-02-08`; clipboard-write capability is now resolved once in `SessionContext` (`uiCapabilities.clipboardWriteSupported`) and consumed from that control-plane state in UI surfaces, with feature-local `navigator.clipboard` probing removed.

- [x] 121. section-20.3/20.5 - Replace dual detail-open callback contract with one explicit detail-open intent
Owner:
`dashboard table/detail interaction`
Violation:
Row double-click handling can trigger both `onRequestDetails` and `onRequestDetailsFullscreen` in sequence, splitting ownership of one behavior and risking duplicate detail-load side effects.
Required refactor:
Use one typed detail-open command (`open(mode: docked|fullscreen)`) with a single owner and explicit contract at the table interaction boundary.
Affected files:
`frontend/src/modules/dashboard/components/TorrentTable.tsx`
`frontend/src/modules/dashboard/viewModels/useTorrentTableViewModel.ts`
`frontend/src/modules/dashboard/components/Dashboard_Layout.tsx`
Completion:
Started `[_]` and completed `2026-02-08`; replaced the dual callback contract with one typed detail-open command (`openDetail(torrent, mode)`), provided by a dedicated detail-open context and consumed at the table row interaction boundary.

- [x] 123. section-20.2/20.5 - Replace exception-based `dispatch(intent): Promise<void>` bus with typed command outcomes
Owner:
`app command bus`
Violation:
`dispatch` is exposed as `Promise<void>` and uses thrown errors for unsupported/failed states (`createTorrentDispatch`), while higher layers convert throws to outcomes ad-hoc, leaving partial contracts and exception-driven control flow for expected states.
Required refactor:
Make dispatch return a typed outcome union (`applied|unsupported|failed|aborted`) and propagate it through app command context, torrent actions, orchestrators, and dispatch helpers without throw-based signaling for expected outcomes.
Affected files:
`frontend/src/app/actions/torrentDispatch.ts`
`frontend/src/app/context/AppCommandContext.tsx`
`frontend/src/app/context/TorrentActionsContext.tsx`
`frontend/src/app/orchestrators/useTorrentOrchestrator.ts`
`frontend/src/app/utils/torrentActionDispatcher.ts`
`frontend/src/app/viewModels/useWorkspaceShellViewModel.ts`
Completion:
Started `[_]` and completed `2026-02-08`; dispatch now returns typed outcomes and callers map outcomes explicitly instead of catching throw-based control flow.

- [x] 124. section-20.2/20.5 - Surface post-recheck refresh failures as explicit workflow outcomes
Owner:
`torrent workflow`
Violation:
`useTorrentWorkflow` swallows `onRecheckComplete` errors in both single and bulk paths and still reports successful action outcomes, hiding stale-data refresh failures from callers.
Required refactor:
Return explicit post-recheck outcome data (`success|refresh_failed|refresh_skipped`) or emit a typed failure event that callers must consume instead of silent catch-and-ignore.
Affected files:
`frontend/src/app/hooks/useTorrentWorkflow.ts`
`frontend/src/app/viewModels/useWorkspaceShellViewModel.ts`
Completion:
Started `[_]` and completed `2026-02-08`; recheck workflows now return explicit post-refresh outcomes (`success|refresh_skipped|refresh_failed`) and no longer swallow refresh errors.

- [x] 125. section-2d/Structural Layout Primitives - Normalize modal/dialog surfaces under one modal surface authority
Owner:
`cross-feature modal shells`
Violation:
Modal/dialog shells still mix direct blur/border/shadow recipes across feature code, so visual framing ownership is split and drifts from `Surface` policy.
Required refactor:
Define one canonical modal surface composition and migrate all modal/dialog entry points to it (no local glass recipes in feature modals).
Affected files:
`frontend/src/modules/settings/components/SettingsModalView.tsx`
`frontend/src/modules/torrent-add/components/AddTorrentModal.tsx`
`frontend/src/modules/torrent-add/components/AddMagnetModal.tsx`
`frontend/src/modules/dashboard/components/TorrentRecoveryModal.tsx`
`frontend/src/modules/torrent-remove/components/RemoveConfirmationModal.tsx`
`frontend/src/modules/dashboard/components/TorrentTable_ColumnSettingsModal.tsx`
`frontend/src/app/components/CommandPalette.tsx`
`frontend/src/shared/ui/layout/glass-surface.ts`
Completion:
Started `[_]` and completed `2026-02-08`; added canonical modal surface tokens (`MODAL_SURFACE_FRAME`, `MODAL_SURFACE_HEADER`, `MODAL_SURFACE_FOOTER`) in `glass-surface.ts` and migrated all listed modal/dialog shells to that contract, removing local modal frame/shadow recipes where redundant.

- [x] 126. section-2d/Structural Layout Primitives - Normalize floating menu/popover/tooltip shells under one menu surface authority
Owner:
`shared controls + dashboard menus`
Violation:
Floating command/menu surfaces are built with mixed local recipes, causing inconsistent depth, border, and hover/focus behavior.
Required refactor:
Create one canonical menu/popover surface contract and migrate language/menu/context surfaces to that contract.
Affected files:
`frontend/src/shared/ui/controls/LanguageMenu.tsx`
`frontend/src/modules/dashboard/components/TorrentTable_RowMenu.tsx`
`frontend/src/modules/dashboard/components/TorrentTable_HeaderMenu.tsx`
`frontend/src/shared/ui/layout/GlassPanel.tsx`
`frontend/src/shared/ui/layout/glass-surface.ts`
Completion:
Started `[_]` and completed `2026-02-08`; introduced canonical menu surface tokens (`MENU_SURFACE_FRAME`, `MENU_SURFACE_LIST`, `MENU_ITEM_SURFACE`, `MENU_SECTION_HEADING`) and migrated language + dashboard row/header menus to consume them for consistent shell depth, border framing, and item interaction styling.

- [x] 127. section-3/Structural Layout Primitives - Normalize framed panel/card/table shells to `Surface` ownership
Owner:
`dashboard + shared workspace surfaces`
Violation:
Panel/card/table-shell framing is still duplicated across feature components instead of being owned by `Surface` primitives.
Required refactor:
Replace repeated framed container recipes with `Surface` primitives and remove feature-local framing recipes.
Affected files:
`frontend/src/modules/dashboard/components/TorrentTable.tsx`
`frontend/src/modules/dashboard/components/TorrentDetails_Content.tsx`
`frontend/src/modules/dashboard/components/TorrentDetails_Peers.tsx`
`frontend/src/modules/dashboard/components/TorrentDetails_Trackers.tsx`
`frontend/src/shared/ui/workspace/FileExplorerTree.tsx`
`frontend/src/modules/torrent-add/components/AddTorrentDestinationGatePanel.tsx`
Completion:
Started `[_]` and completed `2026-02-08`; introduced shared panel-frame tokens (`PANEL_SURFACE_FRAME`, `PANEL_SURFACE_INSET_FRAME`) and migrated table/content/peers/trackers/file-explorer/add-destination framed shells to `GlassPanel`-owned surfaces or shared frame tokens.

- [x] 128. section-3/Structural Layout Primitives - Normalize stage/centering wrappers to `Section` ownership
Owner:
`app shell + workspace layouts`
Violation:
Stage/centering/max-width wrappers are implemented ad-hoc in multiple roots, fragmenting layout ownership and rhythm.
Required refactor:
Adopt a single `Section` authority for stage wrappers and remove local centering/stage recipes from feature roots.
Affected files:
`frontend/src/app/components/WorkspaceShell.tsx`
`frontend/src/modules/dashboard/components/Dashboard_Layout.tsx`
`frontend/src/app/components/CommandPalette.tsx`
`frontend/src/modules/settings/components/SettingsModalView.tsx`
Completion:
Started `[_]` and completed `2026-02-08`; introduced shared `Section` primitive with semantic stage/overlay/modal/shell padding presets and migrated the listed app-shell/workspace/command-palette/settings stage wrappers to `Section` ownership.

- [x] 129. section-21.10/21.11 - Regression sweep for completed high-risk architecture tasks
Owner:
`frontend architecture cleanup`
Violation:
Recently completed refactors (`54-93`, `98-103`, `122`) were done during a policy transition; some may have landed partial contracts or wrapper churn that now violates updated AGENTS constraints.
Required refactor:
Run a targeted regression sweep and file follow-up fixes where completed tasks still leave authority ambiguity, wrapper indirection, or incomplete typed outcomes.
Affected files:
`frontend/src/app/context/AppShellStateContext.tsx`
`frontend/src/app/context/AppCommandContext.tsx`
`frontend/src/app/viewModels/useWorkspaceShellViewModel.ts`
`frontend/src/app/components/GlobalHotkeysHost.tsx`
`frontend/src/modules/settings/components/SettingsModalView.tsx`
`frontend/src/modules/torrent-add/components/AddTorrentModal.tsx`
Completion:
Started `[_]` and completed `2026-02-08`; regression sweep removed dead compatibility wrappers (`useActiveFocusPart`, `useLifecycle`) from `AppShellStateContext`, removed pass-through hotkey setter indirection in `GlobalHotkeysHost`, and confirmed remaining command/context surfaces keep typed outcomes and declared owners.

- [x] 130. section-20/21 contract debt - Eliminate remaining section-20/21 TODOs from active code paths
Owner:
`frontend contract hygiene`
Violation:
Multiple `TODO(section 20/21)` markers remain in active UI/control paths, indicating known contract gaps in currently executed behavior.
Required refactor:
Resolve each remaining section-20/21 TODO in code or convert it into an explicit, tracked task with ownership and dependency, with no orphaned TODO markers.
Affected files:
`frontend/src/app/components/CommandPalette.tsx`
`frontend/src/app/hooks/useRpcConnection.ts`
`frontend/src/modules/dashboard/hooks/useRecoveryController.ts`
`frontend/src/modules/dashboard/hooks/useTorrentTableInteractions.ts`
`frontend/src/modules/settings/components/BufferedInput.tsx`
`frontend/src/shared/utils/clipboard.ts`
Completion:
Started `[_]` and completed `2026-02-08`; removed section-20/21 TODO markers from listed files.

- [x] 131. closeout - Final refactor validation and exit checklist
Owner:
`frontend stabilization`
Violation:
Refactor completion currently lacks one explicit closeout gate that verifies typed outcome contracts, authority boundaries, and structural primitive ownership across user-visible flows.
Required refactor:
Execute and document a final validation pass against command flows, recovery flows, settings flows, and UI-surface ownership; leave explicit pass/fail notes and residual risk list.
Affected files:
`frontend/todo.md`
`frontend/src/app/commandRegistry.ts`
`frontend/src/app/components/WorkspaceShell.tsx`
`frontend/src/modules/dashboard/components/TorrentTable.tsx`
`frontend/src/modules/settings/components/SettingsModalView.tsx`
Completion:
Started `[_]` and completed `2026-02-08`; closeout validation run documented with explicit outcomes:
`PASS` command/control-plane contract checks via restored context/hotkey boundary tests (`AppCommandContext`, `GlobalHotkeysHost`) and typed dispatch/command outcome surfaces.
`PASS` recovery/settings typed-outcome and authority stability via existing recovery/settings test coverage plus latest lint/build validation on touched orchestration surfaces.
`PASS` structural and hygiene gate via full `npm run lint` (`0` problems), `npm run build` (successful bundle), and `npm run test:unit` (`18` files / `46` tests passed).
Residual risk list:
No new blockers found in this pass; remaining risk is manual UI interaction drift not covered by unit tests (table drag/resize feel and modal visual composition), which should be exercised in an interactive smoke pass when convenient.

- [x] 139. hygiene-regression - Resolve changed-file lint/hygiene breakage introduced by refactor wave
Owner:
`frontend maintainability`
Violation:
Changed files currently include new no-empty catches, unused symbols, trailing whitespace/newline-at-EOF drift, and hook-rule violations that reduce signal and hide real regressions during review.
Required refactor:
Bring changed files back to lint-clean or explicitly justified state; remove no-empty catches, dead symbols, and whitespace drift in touched files.
Affected files:
`frontend/src/app`
`frontend/src/modules`
`frontend/src/services`
`frontend/src/shared`
Progress:
Started `[_]` and continued `2026-02-08`; app-shell/context hygiene slice was cleaned (`WorkspaceShell`, `StatusBar`, `AppCommandContext`, `AppShellStateContext`, `GlobalHotkeyContext`, `runtime`, `GlobalHotkeysHost`) and targeted lint for that slice now passes. Additional `src/app` batch fixed context/provider export hygiene, shell-agent dependency warnings, `TorrentClientProvider` lifecycle/ref safety, and small type/unused-symbol issues. `src/app` now lints clean and targeted lint/build/tests pass. Services/rpc hygiene batches cleaned `recoveryAutomation`, `schemas`, `types`, `recovery`, `heartbeat`, and `rpc-base` (dead imports/helpers, empty-catch cleanup, unused symbols, and narrow `any` removals in touched paths), then cleaned follow-up utility/UI hygiene in `shared/utils/fsErrors.ts`, `RemoveConfirmationModal.tsx`, and targeted heartbeat/rpc regression tests (`heartbeat-leftover-resync`, `heartbeat-removed-quiet`, `heartbeat-config`, `heartbeat-dispose`, `heartbeat-drift`, `heartbeat-delta`, `heartbeat-fullsync`, `heartbeat-telemetry`, `rpc-dedup`, `recoveryAutomation`) to remove `any`/empty-catch debt. Recovery module hygiene then cleaned `services/recovery/recovery-controller.ts` (unused vars in catches/destructuring) and fully retyped `services/recovery/__tests__/recovery-controller.test.ts` without `any`. Additional context/react-refresh and unused-symbol cleanup landed in `toolbar-button`, `AddTorrentModalContext`, `DeleteConfirmationContext`, `SettingsFormContext`, `settings-tabs`, and `TorrentDetails_General.tsx`. A follow-up dashboard/settings utility slice cleaned `SettingsBlockRenderers`, `TorrentDetails_Header`, `TorrentDetails_Peers_Map`, `recoveryClassification`, and `missingFiles` (unused symbols plus peer-map hook-rule purity fixes). Final cleanup passes then resolved remaining hook/deps/ref warnings in dashboard/settings/shared surfaces and documented TanStack compiler exceptions at callsites. Full lint now passes clean (`0` problems), and build + unit tests pass; task completed `2026-02-08`.

- [x] 140. test-regression - Restore boundary tests after context/provider consolidation
Owner:
`app context boundaries`
Violation:
Provider consolidation removed compatibility contexts and deleted `TorrentActionsContext` tests without equivalent replacement coverage for new authoritative surfaces (`AppCommandContext`, `AppShellStateContext`, hotkey boundary wiring).
Required refactor:
Add focused tests for provider-missing invariants, command boundary contracts, and hotkey/controller wiring against the new context surfaces.
Affected files:
`frontend/src/app/context/__tests__`
`frontend/src/app/components/GlobalHotkeysHost.tsx`
`frontend/src/app/context/AppCommandContext.tsx`
`frontend/src/app/context/AppShellStateContext.tsx`
Completion:
Started `[_]` and completed `2026-02-08`; restored context-boundary coverage with provider-missing invariant tests for `AppCommandContext` and `AppShellStateContext`, verified command surface pass-through contracts (`dispatch` and `commandApi`) under `AppCommandProvider`, and added `GlobalHotkeysHost` wiring coverage that asserts hotkey registry/controller integration and registration fan-out across all hotkey commands. Validation passed via targeted tests plus full `npm run lint`, `npm run build`, and `npm run test:unit`.

- [x] 141. wrapper-cleanup - Remove clipboard pass-through compatibility wrappers
Owner:
`shared clipboard contract`
Violation:
`frontend/src/shared/utils/clipboard.ts` still exposes compatibility wrappers (`tryWriteClipboard`, `writeClipboard`, default export) that only forward to `writeClipboardOutcome`, adding wrapper indirection without new authority.
Required refactor:
Use `writeClipboardOutcome` directly at callsites and remove pass-through exports so clipboard writes have one typed contract surface.
Affected files:
`frontend/src/shared/utils/clipboard.ts`
`frontend/src/modules/settings/hooks/useSettingsModalController.ts`
Completion:
Started `[_]` and completed `2026-02-08`; removed `tryWriteClipboard`/`writeClipboard`/default export pass-through wrappers from `clipboard.ts`, migrated settings JSON copy flow to consume `writeClipboardOutcome` directly, and kept action-result mapping explicit (`applied|unsupported|failed`). Validation: `npm run lint`, `npm run build`, `npm run test:unit`.

- [x] 142. wrapper-cleanup - Small-file pass-through audit checkpoint
Owner:
`frontend wrapper-cleanup stream`
Violation:
Task queue had no remaining unchecked items, but wrapper cleanup requires continued verification that small files are not passive pass-through wrappers.
Required refactor:
Audit current small exported files against keep/remove criteria and record whether any bucket `C` pass-through wrappers remain.
Affected files:
`frontend/src/modules/dashboard/hooks/useTorrentClipboard.ts`
`frontend/src/shared/hooks/useSpeedHistoryDomain.ts`
`frontend/src/services/recovery/recovery-runtime-lifecycle.ts`
`frontend/src/app/utils/setLocation.ts`
`frontend/src/shared/ui/layout/GlassPanel.tsx`
`frontend/src/shared/ui/layout/Section.tsx`
Completion:
Started `[_]` and completed `2026-02-08`; audit found no new bucket `C` pass-through wrappers among inspected small files. Remaining small files reviewed in this pass are valid by rule (boundary/authority/typed-contract/cross-feature reuse/lifecycle ownership), so no additional merge/delete was applied in this step.

