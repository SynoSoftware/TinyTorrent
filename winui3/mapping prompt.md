Use a single repo-analysis subagent with a constrained brief and a fixed deliverable.

# Subagent brief

You are analyzing an existing TypeScript frontend to prepare a clean-room rewrite in WinUI 3.

Your job is not to suggest code changes, refactors, or migrations file-by-file. Your job is to produce a specification-level map of the product and the current system so a separate implementation effort can rebuild it with a minimal, disciplined architecture.

## Primary goal

Produce one document: `rewrite-spec-map.md`

It must explain:

1. What the app actually does
2. What functional areas exist
3. What the domain concepts are
4. What external dependencies and integrations exist
5. What state, workflows, and user journeys exist
6. What architectural mistakes or risk zones should be avoided in the rewrite
7. What can be safely ignored, deferred, merged, or deleted
8. What the thinnest viable WinUI 3 architecture should preserve at a specs level

## Hard constraints

* Stay at specs level, not code level
* Do not propose class hierarchies, frameworks, or detailed implementation
* Do not rewrite code
* Do not produce low-level migration steps
* Do not preserve accidental complexity from the current frontend
* Treat the current repo as evidence of behavior, not as a design to imitate
* Prefer first-principles simplification over compatibility with existing frontend structure

## Analysis method

Infer the app from:

* routes / screens / pages
* menus / navigation
* API usage
* state containers
* forms
* feature flags
* services
* user-facing text
* configuration
* tests if present
* telemetry / analytics calls
* auth / session handling
* error handling
* caching / optimistic updates / background sync
* component reuse patterns
* build tooling only when it reveals product structure

Ignore:

* styling noise
* component-level churn
* dead abstractions
* generic utility clutter
* AI-generated repetition
* naming accidents unless they reveal real domain meaning

## Required output structure

# Rewrite Spec Map

## 1. Product summary

* One-paragraph summary of what the application is for
* Primary user types
* Primary user outcomes

## 2. Functional surface area

For each feature area:

* Name
* User goal
* Main inputs
* Main outputs
* Dependencies
* Whether it is core, supporting, optional, or likely dead weight

## 3. Screens and flows

For each screen / major surface:

* Purpose
* Entry points
* Key actions
* Data needed
* State transitions
* Error/empty/loading cases
* Related downstream flows

## 4. Domain model inferred from behavior

List the core business entities and for each:

* Meaning
* Important properties
* Lifecycle / state changes
* Relationships to other entities

## 5. Integration map

List:

* backend APIs
* local storage usage
* auth providers
* third-party SDKs
* analytics / telemetry
* file system / upload / export behavior
* notifications / realtime channels if any

For each:

* Why it exists
* Whether it seems essential, replaceable, or removable

## 6. Current complexity hotspots

Identify where the current frontend appears bloated:

* duplicated flows
* over-fragmented state
* view logic mixed with domain logic
* over-generalized abstractions
* speculative extensibility
* redundant derived state
* excessive cross-component coupling
* hidden side effects
* routing complexity
* AI-generated anti-patterns

## 7. What to preserve

Only list behaviors that appear essential to product value:

* user-visible requirements
* contractual API behavior
* critical workflows
* required validations
* hard business rules

## 8. What to avoid in the WinUI 3 rewrite

Explicit anti-goals:

* porting component structure directly
* preserving frontend-specific abstractions
* mirroring TypeScript state shape blindly
* reintroducing unnecessary indirection
* creating generic frameworks before real need
* mixing navigation, business rules, and IO into view models
* carrying over dead or unverified features
* treating every existing edge case as intentional

Add any repo-specific avoidances you can justify from evidence.

## 9. Simplification opportunities

List concrete simplifications at specs level:

* feature merges
* screen merges
* state reduction
* dependency elimination
* workflow unification
* removing optional behavior
* deferring non-core features

For each:

* why it is probably safe
* confidence level: high / medium / low

## 10. Proposed rewrite boundary

Define the thinnest viable product boundary for v1 of the WinUI 3 rewrite:

* must-have
* should-have
* defer
* reject

## 11. Open questions

List unanswered product/spec questions that require human confirmation before implementation.

## 12. Appendix: evidence

Reference the repo evidence used:

* key files
* folders
* API clients
* routes
* test files
* config files

Do not dump everything. Only cite what materially supports the spec map.

## Output quality bar

The document must:

* compress the repo into a human-usable map
* separate essential product behavior from accidental frontend complexity
* be opinionated about what not to carry over
* help a WinUI 3 rewrite start cleanly
* avoid code-level advice

If evidence is weak, say so explicitly.

# Additional instruction

At the end, add a section called:

## Executive recommendation

Provide:

1. the likely smallest clean architecture direction for the rewrite in plain English
2. the top 5 things to avoid copying from the current frontend
3. the top 5 facts the implementation team must confirm before writing any WinUI 3 code

---

# What you should stay away from

1. Asking the subagent to “analyze everything”
   That produces inventory, not clarity.

2. Asking for a file-by-file migration plan
   That anchors the rewrite to the current mess.

3. Asking for WinUI 3 code or architecture too early
   You first need product boundaries and behavior map.

4. Asking it to preserve parity with the current structure
   You want behavioral parity where needed, not structural parity.

5. Letting it summarize folders instead of user journeys
   The rewrite should be organized around flows and domain, not repo shape.

6. Letting it infer intent from implementation accidents
   The current codebase is contaminated by AI-generated churn; assume some complexity is fake.

7. Asking for “best practices” in the abstract
   Only repo-grounded conclusions are useful.

8. Treating all current features as real
   Some are partial, stale, duplicated, or speculative.

9. Mixing discovery with design
   First map what exists and what matters. Then decide architecture.

10. Starting with MVVM/package/framework debates
    That is downstream of scope reduction.

# Best next step after the document exists

Take the generated spec map and produce exactly three follow-on artifacts:

1. `product-boundary.md`
   A ruthlessly reduced definition of WinUI v1.

2. `behavior-contracts.md`
   API contracts, state transitions, validations, and error cases that must survive the rewrite.

3. `architecture-principles.md`
   Ten to fifteen hard rules for keeping the WinUI 3 app thin.

# Minimal architecture direction

Target this, conceptually:

* Views for rendering and user interaction
* Thin view models only where binding/state orchestration is needed
* Domain/application layer for workflows and decisions
* Infrastructure adapters for API, storage, auth, telemetry
* No UI component abstraction empire
* No generic state framework unless a concrete need appears
* No premature plugin/extensibility system
* No “shared utilities” bucket without strict purpose

# One-line instruction to give the subagent

Map the repo into product behavior, domain concepts, workflows, dependencies, and rewrite anti-goals so we can rebuild it in WinUI 3 from first principles without carrying over accidental frontend complexity.


{"routes":[{"name":"workspace-root","files":["frontend/src/app/App.tsx","frontend/src/app/components/WorkspaceShell.tsx"],"brief identifier":"AppContent -> WorkspaceShell single-app surface"},{"name":"dashboard-filter-all","files":["frontend/src/app/components/layout/Navbar.tsx","frontend/src/modules/dashboard/types/dashboardFilter.ts"],"brief identifier":"Navbar Tabs key=\"all\""},{"name":"dashboard-filter-downloading","files":["frontend/src/app/components/layout/Navbar.tsx","frontend/src/modules/dashboard/types/dashboardFilter.ts"],"brief identifier":"Navbar Tabs key=\"downloading\""},{"name":"dashboard-filter-seeding","files":["frontend/src/app/components/layout/Navbar.tsx","frontend/src/modules/dashboard/types/dashboardFilter.ts"],"brief identifier":"Navbar Tabs key=\"seeding\""},{"name":"settings-tab-speed","files":["frontend/src/modules/settings/data/settings-tabs.ts","frontend/src/modules/settings/components/SettingsModalView.tsx"],"brief identifier":"SettingsTab id=\"speed\""},{"name":"settings-tab-network","files":["frontend/src/modules/settings/data/settings-tabs.ts","frontend/src/modules/settings/components/SettingsModalView.tsx"],"brief identifier":"SettingsTab id=\"network\""},{"name":"settings-tab-connection","files":["frontend/src/modules/settings/data/settings-tabs.ts","frontend/src/modules/settings/components/SettingsModalView.tsx"],"brief identifier":"SettingsTab id=\"connection\""},{"name":"settings-tab-peers","files":["frontend/src/modules/settings/data/settings-tabs.ts","frontend/src/modules/settings/components/SettingsModalView.tsx"],"brief identifier":"SettingsTab id=\"peers\""},{"name":"settings-tab-storage","files":["frontend/src/modules/settings/data/settings-tabs.ts","frontend/src/modules/settings/components/SettingsModalView.tsx"],"brief identifier":"SettingsTab id=\"storage\""},{"name":"settings-tab-privacy","files":["frontend/src/modules/settings/data/settings-tabs.ts","frontend/src/modules/settings/components/SettingsModalView.tsx"],"brief identifier":"SettingsTab id=\"privacy\""},{"name":"settings-tab-gui","files":["frontend/src/modules/settings/data/settings-tabs.ts","frontend/src/modules/settings/components/SettingsModalView.tsx"],"brief identifier":"SettingsTab id=\"gui\""},{"name":"settings-tab-system","files":["frontend/src/modules/settings/data/settings-tabs.ts","frontend/src/modules/settings/components/SettingsModalView.tsx"],"brief identifier":"SettingsTab id=\"system\""},{"name":"detail-view-docked","files":["frontend/src/modules/dashboard/components/Dashboard_Layout.tsx","frontend/src/modules/dashboard/context/DetailOpenContext.tsx"],"brief identifier":"DetailOpenMode \"docked\""},{"name":"detail-view-fullscreen","files":["frontend/src/modules/dashboard/components/Dashboard_Layout.tsx","frontend/src/modules/dashboard/context/DetailOpenContext.tsx"],"brief identifier":"DetailOpenMode \"fullscreen\""}],"screens":[{"name":"app-shell","files":["frontend/src/app/App.tsx","frontend/src/app/components/WorkspaceShell.tsx"],"brief identifier":"App / WorkspaceShell component"},{"name":"dashboard","files":["frontend/src/modules/dashboard/components/Dashboard_Layout.tsx"],"brief identifier":"Dashboard_Layout component"},{"name":"torrent-table","files":["frontend/src/modules/dashboard/components/TorrentTable.tsx","frontend/src/modules/dashboard/viewModels/useTorrentTableViewModel.ts"],"brief identifier":"TorrentTable component"},{"name":"torrent-details","files":["frontend/src/modules/dashboard/components/TorrentDetails.tsx","frontend/src/modules/dashboard/hooks/useTorrentDetail.ts"],"brief identifier":"TorrentDetails component"},{"name":"settings-modal","files":["frontend/src/modules/settings/components/SettingsModalView.tsx","frontend/src/modules/settings/hooks/useSettingsModalController.ts"],"brief identifier":"SettingsModal / SettingsModalView component"},{"name":"command-palette","files":["frontend/src/app/components/CommandPalette.tsx"],"brief identifier":"CommandPalette component"},{"name":"add-torrent-modal","files":["frontend/src/modules/torrent-add/components/AddTorrentModal.tsx","frontend/src/modules/torrent-add/hooks/useAddTorrentModalViewModel.ts"],"brief identifier":"AddTorrentModal component"},{"name":"remove-confirmation-modal","files":["frontend/src/modules/torrent-remove/components/RemoveConfirmationModal.tsx"],"brief identifier":"RemoveConfirmationModal component"},{"name":"set-download-path-modal","files":["frontend/src/modules/dashboard/components/SetDownloadPathModal.tsx"],"brief identifier":"SetDownloadPathModal component"},{"name":"connection-manager","files":["frontend/src/modules/settings/components/tabs/connection/ConnectionManager.tsx"],"brief identifier":"ConnectionCredentialsCard component"},{"name":"interface-settings-tab","files":["frontend/src/modules/settings/components/InterfaceTabContent.tsx"],"brief identifier":"InterfaceTabContent component"},{"name":"system-settings-tab","files":["frontend/src/modules/settings/components/tabs/system/SystemTabContent.tsx"],"brief identifier":"SystemTabContent component"},{"name":"trackers-tab","files":["frontend/src/modules/dashboard/components/TorrentDetails_Trackers.tsx","frontend/src/modules/dashboard/hooks/useTorrentDetailsTrackersViewModel.ts"],"brief identifier":"TrackersTab component"}],"api_calls":[{"name":"transmission-rpc-endpoint","files":["frontend/src/config/logic.ts","frontend/src/services/transport.ts","frontend/src/app/providers/TorrentClientProvider.tsx"],"brief identifier":"POST /transmission/rpc via TransmissionRpcTransport"},{"name":"session-get","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/hooks/useSettingsFlow.ts","frontend/src/app/hooks/useTransmissionSession.ts"],"brief identifier":"Transmission RPC method session-get"},{"name":"session-set","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/hooks/useSettingsFlow.ts"],"brief identifier":"Transmission RPC method session-set"},{"name":"session-test","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/modules/settings/hooks/useSettingsModalController.ts"],"brief identifier":"Transmission RPC method session-test / testPort"},{"name":"session-stats","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/hooks/useSessionStats.ts"],"brief identifier":"Transmission RPC method session-stats"},{"name":"free-space","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/modules/dashboard/components/SetDownloadPathModal.tsx","frontend/src/modules/torrent-add/hooks/useAddTorrentModalViewModel.ts"],"brief identifier":"Transmission RPC method free-space"},{"name":"torrent-get-summary","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/modules/dashboard/hooks/useTorrentData.ts"],"brief identifier":"Transmission RPC method torrent-get for table summaries"},{"name":"torrent-get-detail","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/modules/dashboard/hooks/useTorrentDetail.ts"],"brief identifier":"Transmission RPC method torrent-get for details"},{"name":"torrent-add","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/actions/torrentDispatch.ts","frontend/src/app/orchestrators/useAddTorrentController.ts"],"brief identifier":"Transmission RPC method torrent-add"},{"name":"torrent-start","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/actions/torrentDispatch.ts","frontend/src/app/hooks/useTorrentWorkflow.ts"],"brief identifier":"Transmission RPC method torrent-start"},{"name":"torrent-start-now","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/actions/torrentDispatch.ts"],"brief identifier":"Transmission RPC method torrent-start-now"},{"name":"torrent-stop","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/actions/torrentDispatch.ts","frontend/src/app/hooks/useTorrentWorkflow.ts"],"brief identifier":"Transmission RPC method torrent-stop"},{"name":"torrent-verify","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/actions/torrentDispatch.ts"],"brief identifier":"Transmission RPC method torrent-verify"},{"name":"queue-move-top","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/actions/torrentDispatch.ts"],"brief identifier":"Transmission RPC method queue-move-top"},{"name":"queue-move-up","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/actions/torrentDispatch.ts"],"brief identifier":"Transmission RPC method queue-move-up"},{"name":"queue-move-down","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/actions/torrentDispatch.ts"],"brief identifier":"Transmission RPC method queue-move-down"},{"name":"queue-move-bottom","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/actions/torrentDispatch.ts"],"brief identifier":"Transmission RPC method queue-move-bottom"},{"name":"torrent-remove","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/actions/torrentDispatch.ts","frontend/src/modules/torrent-remove/components/RemoveConfirmationModal.tsx"],"brief identifier":"Transmission RPC method torrent-remove"},{"name":"torrent-set-file-selection","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/actions/torrentDispatch.ts","frontend/src/modules/torrent-add/components/AddTorrentFileTable.tsx"],"brief identifier":"Transmission RPC method torrent-set wanted/unwanted"},{"name":"torrent-set-sequential-download","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/actions/torrentDispatch.ts","frontend/src/modules/dashboard/components/TorrentDetails_General.tsx","frontend/src/modules/torrent-add/components/AddTorrentSettingsPanel.tsx"],"brief identifier":"Transmission RPC method torrent-set sequential_download"},{"name":"torrent-set-super-seeding","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/actions/torrentDispatch.ts","frontend/src/modules/dashboard/components/TorrentDetails_General.tsx"],"brief identifier":"Transmission RPC method torrent-set super-seeding"},{"name":"torrent-set-location","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/actions/torrentDispatch.ts","frontend/src/modules/dashboard/components/SetDownloadPathModal.tsx"],"brief identifier":"Transmission RPC method torrent-set-location"},{"name":"torrent-rename-path","files":["frontend/src/services/rpc/rpc-base.ts"],"brief identifier":"Transmission RPC method torrent-rename-path"},{"name":"torrent-set-trackers","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/modules/dashboard/hooks/useTorrentDetailsTrackersViewModel.ts"],"brief identifier":"Transmission RPC method torrent-set for tracker list"},{"name":"torrent-reannounce","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/modules/dashboard/hooks/useTorrentDetailsTrackersViewModel.ts"],"brief identifier":"Transmission RPC method torrent-reannounce"},{"name":"network-telemetry","files":["frontend/src/services/rpc/rpc-base.ts","frontend/src/app/hooks/useTransmissionSession.ts"],"brief identifier":"fetchNetworkTelemetry adapter call"}],"state_stores":[{"name":"preferences-context","files":["frontend/src/app/context/PreferencesContext.tsx"],"brief identifier":"PreferencesProvider / PreferencesContext"},{"name":"connection-profile-store","files":["frontend/src/app/context/connection/useConnectionProfileStore.ts","frontend/src/app/context/ConnectionConfigContext.tsx"],"brief identifier":"useConnectionProfileStore hook"},{"name":"connection-config-context","files":["frontend/src/app/context/ConnectionConfigContext.tsx"],"brief identifier":"ConnectionConfigProvider / ConnectionConfigContext"},{"name":"session-context","files":["frontend/src/app/context/SessionContext.tsx"],"brief identifier":"SessionProvider / SessionContext"},{"name":"app-shell-state-context","files":["frontend/src/app/context/AppShellStateContext.tsx"],"brief identifier":"AppShellStateProvider / AppShellStateContext"},{"name":"app-command-context","files":["frontend/src/app/context/AppCommandContext.tsx"],"brief identifier":"AppCommandProvider / AppCommandContext"},{"name":"torrent-client-context","files":["frontend/src/app/providers/TorrentClientProvider.tsx"],"brief identifier":"ClientProvider / ClientContext"},{"name":"settings-form-context","files":["frontend/src/modules/settings/context/SettingsFormContext.tsx"],"brief identifier":"SettingsFormProvider"},{"name":"add-torrent-modal-context","files":["frontend/src/modules/torrent-add/components/AddTorrentModalContext.tsx"],"brief identifier":"AddTorrentModalContextProvider"},{"name":"delete-confirmation-context","files":["frontend/src/modules/torrent-remove/context/DeleteConfirmationContext.tsx"],"brief identifier":"DeleteConfirmationProvider"},{"name":"detail-open-context","files":["frontend/src/modules/dashboard/context/DetailOpenContext.tsx"],"brief identifier":"DetailOpenProvider"},{"name":"speed-history-store","files":["frontend/src/shared/hooks/speedHistoryStore.ts","frontend/src/shared/hooks/useSpeedHistoryDomain.ts"],"brief identifier":"SpeedHistoryStore / SpeedHistoryDomainProvider"},{"name":"session-speed-history-store","files":["frontend/src/shared/hooks/useSessionSpeedHistory.ts"],"brief identifier":"SessionSpeedHistoryStore / SessionSpeedHistoryProvider"},{"name":"transport-session-runtime","files":["frontend/src/services/transport.ts"],"brief identifier":"module-level transportSessionRuntimeByKey cache"}],"forms":[{"name":"add-torrent-form","files":["frontend/src/modules/torrent-add/components/AddTorrentModal.tsx","frontend/src/modules/torrent-add/hooks/useAddTorrentModalViewModel.ts","frontend/src/modules/torrent-add/components/AddTorrentSettingsPanel.tsx"],"brief identifier":"AddTorrentModal form / onConfirm flow"},{"name":"set-download-path-form","files":["frontend/src/modules/dashboard/components/SetDownloadPathModal.tsx"],"brief identifier":"SetDownloadPathModal form / onApply flow"},{"name":"remove-confirmation-form","files":["frontend/src/modules/torrent-remove/components/RemoveConfirmationModal.tsx"],"brief identifier":"RemoveConfirmationModal checkbox + confirm flow"},{"name":"settings-form","files":["frontend/src/modules/settings/components/SettingsModalView.tsx","frontend/src/modules/settings/components/SettingsFormBuilder.tsx","frontend/src/modules/settings/hooks/useSettingsModalController.ts"],"brief identifier":"SettingsFormProvider + save/reset flow"},{"name":"connection-profile-form","files":["frontend/src/modules/settings/components/tabs/connection/ConnectionManager.tsx"],"brief identifier":"ConnectionCredentialsCard inputs"},{"name":"tracker-editor-form","files":["frontend/src/modules/dashboard/components/TorrentDetails_Trackers.tsx","frontend/src/modules/dashboard/hooks/useTorrentDetailsTrackersViewModel.ts"],"brief identifier":"TrackerEditorModal textarea + submitEditor"},{"name":"search-input","files":["frontend/src/app/components/layout/Navbar.tsx"],"brief identifier":"Navbar search Input"},{"name":"command-palette-input","files":["frontend/src/app/components/CommandPalette.tsx"],"brief identifier":"Command.Input query field"},{"name":"destination-path-editor","files":["frontend/src/shared/ui/workspace/DestinationPathEditor.tsx"],"brief identifier":"DestinationPathEditor input/autocomplete"}],"feature_flags":[{"name":"sequential-download-capability","files":["frontend/src/app/types/capabilities.ts","frontend/src/app/viewModels/useWorkspaceShellViewModel.ts","frontend/src/modules/dashboard/components/TorrentDetails_General.tsx","frontend/src/modules/torrent-add/components/AddTorrentSettingsPanel.tsx"],"brief identifier":"CapabilityState sequentialDownload"},{"name":"super-seeding-capability","files":["frontend/src/app/types/capabilities.ts","frontend/src/modules/dashboard/hooks/useDetailControls.ts"],"brief identifier":"CapabilityState superSeeding"},{"name":"table-watermark-enabled","files":["frontend/src/modules/settings/data/default-settings.json","frontend/src/app/hooks/useSettingsFlow.ts","frontend/src/modules/settings/components/InterfaceTabContent.tsx","frontend/src/modules/dashboard/components/Dashboard_Layout.tsx"],"brief identifier":"settings config key table_watermark_enabled"},{"name":"ui-mode-full-vs-rpc","files":["frontend/src/app/utils/uiMode.ts","frontend/src/app/context/SessionContext.tsx","frontend/src/modules/settings/components/tabs/system/SystemTabContent.tsx","frontend/src/modules/settings/components/tabs/connection/ConnectionManager.tsx"],"brief identifier":"UiCapabilities uiMode"},{"name":"workspace-style-classic-vs-immersive","files":["frontend/src/app/context/PreferencesContext.tsx","frontend/src/modules/settings/components/InterfaceTabContent.tsx","frontend/src/app/components/WorkspaceShell.tsx"],"brief identifier":"WorkspaceStyle preference"},{"name":"torrent-complete-verify-enabled-support","files":["frontend/src/services/rpc/version-support.ts","frontend/src/app/hooks/useSettingsFlow.ts"],"brief identifier":"version-gated setting torrent_complete_verify_enabled"},{"name":"shell-agent-available","files":["frontend/src/app/context/SessionContext.tsx","frontend/src/modules/settings/components/tabs/system/SystemTabContent.tsx"],"brief identifier":"UiCapabilities shellAgentAvailable"},{"name":"header-menu-hide-enabled","files":["frontend/src/modules/dashboard/hooks/useTorrentTableHeaderContext.ts","frontend/src/modules/dashboard/components/TorrentTable_HeaderMenu.tsx"],"brief identifier":"isHeaderMenuHideEnabled"}],"integrations":[{"name":"transmission-rpc","files":["frontend/src/services/transport.ts","frontend/src/services/rpc/rpc-base.ts","frontend/src/app/providers/TorrentClientProvider.tsx"],"brief identifier":"TransmissionRpcTransport / TransmissionAdapter"},{"name":"shell-agent","files":["frontend/src/app/agents/shell-agent.ts","frontend/src/app/context/SessionContext.tsx","frontend/src/modules/settings/components/tabs/system/SystemTabContent.tsx"],"brief identifier":"shellAgent bridge"},{"name":"react-i18next","files":["frontend/src/i18n/index.ts","frontend/src/app/components/layout/Navbar.tsx","frontend/src/modules/settings/components/SettingsModalView.tsx"],"brief identifier":"useTranslation / i18n provider"},{"name":"HeroUI","files":["frontend/src/main.tsx","frontend/src/app/components/layout/Navbar.tsx","frontend/src/modules/settings/components/SettingsModalView.tsx"],"brief identifier":"@heroui/react / @heroui/toast"},{"name":"framer-motion","files":["frontend/src/app/components/WorkspaceShell.tsx","frontend/src/app/components/CommandPalette.tsx","frontend/src/modules/dashboard/components/Dashboard_Layout.tsx"],"brief identifier":"motion / AnimatePresence"},{"name":"cmdk","files":["frontend/src/app/components/CommandPalette.tsx"],"brief identifier":"Command palette SDK"},{"name":"react-hotkeys-hook","files":["frontend/src/main.tsx","frontend/src/app/components/GlobalHotkeysHost.tsx"],"brief identifier":"HotkeysProvider"},{"name":"react-resizable-panels","files":["frontend/src/modules/dashboard/components/Dashboard_Layout.tsx","frontend/src/modules/torrent-add/components/AddTorrentModal.tsx"],"brief identifier":"PanelGroup / PanelResizeHandle"},{"name":"@tanstack/react-table","files":["frontend/src/modules/dashboard/components/TorrentDetails_Trackers.tsx","frontend/src/modules/dashboard/viewModels/useTorrentTableViewModel.ts"],"brief identifier":"table state/rendering"},{"name":"@tanstack/react-virtual","files":["frontend/src/modules/dashboard/hooks/useTorrentTableVirtualization.ts"],"brief identifier":"table virtualization"},{"name":"lucide-react","files":["frontend/src/app/components/layout/Navbar.tsx","frontend/src/modules/settings/data/settings-tabs.ts"],"brief identifier":"icon library"}],"background_processes":[{"name":"heartbeat-polling","files":["frontend/src/services/rpc/heartbeat.ts","frontend/src/shared/hooks/useEngineHeartbeat.ts","frontend/src/modules/dashboard/hooks/useTorrentData.ts","frontend/src/app/hooks/useSessionStats.ts"],"brief identifier":"HeartbeatManager subscribeTable / subscribeNonTable"},{"name":"ui-clock","files":["frontend/src/shared/hooks/useUiClock.ts","frontend/src/shared/hooks/useSessionSpeedHistory.ts","frontend/src/shared/hooks/speedHistoryStore.ts"],"brief identifier":"setInterval-driven UI clock subscriptions"},{"name":"ghost-torrent-timeout","files":["frontend/src/modules/dashboard/hooks/useTorrentData.ts","frontend/src/app/services/scheduler.ts"],"brief identifier":"scheduler.scheduleTimeout ghost removal"},{"name":"recheck-polling-boost-timer","files":["frontend/src/app/orchestrators/useWorkspaceTorrentDomain.ts"],"brief identifier":"window.setTimeout recheck polling boost"},{"name":"add-torrent-submit-timeout","files":["frontend/src/app/orchestrators/useAddTorrentController.ts"],"brief identifier":"window.setTimeout request timeout race"},{"name":"layout-metrics-resize-listeners","files":["frontend/src/shared/hooks/useLayoutMetrics.ts"],"brief identifier":"resize / tt-zoom-change listeners + requestAnimationFrame"},{"name":"detail-context-menu-dismiss","files":["frontend/src/modules/dashboard/hooks/useTorrentDetailsTrackersViewModel.ts","frontend/src/modules/dashboard/hooks/useTorrentDetailsPeersViewModel.ts"],"brief identifier":"window pointerdown listeners"},{"name":"magnet-link-listener","files":["frontend/src/app/hooks/useAddModalState.ts","frontend/src/app/agents/shell-agent.ts"],"brief identifier":"shellAgent.onMagnetLink subscription"},{"name":"speed-history-subscription","files":["frontend/src/modules/dashboard/hooks/useTorrentSpeedHistory.ts","frontend/src/shared/hooks/useSpeedHistoryDomain.ts"],"brief identifier":"store.subscribe / watch fanout"},{"name":"transport-session-probes","files":["frontend/src/services/transport.ts"],"brief identifier":"session token probe/cache lifecycle"}],"navigation_entries":[{"name":"navbar-filter-tabs","files":["frontend/src/app/components/layout/Navbar.tsx"],"brief identifier":"Tabs for all/downloading/seeding"},{"name":"navbar-search","files":["frontend/src/app/components/layout/Navbar.tsx"],"brief identifier":"search Input entry point"},{"name":"add-torrent-button","files":["frontend/src/app/components/layout/Navbar.tsx"],"brief identifier":"ToolbarIconButton onAddTorrent"},{"name":"add-magnet-button","files":["frontend/src/app/components/layout/Navbar.tsx"],"brief identifier":"ToolbarIconButton onAddMagnet"},{"name":"settings-button","files":["frontend/src/app/components/layout/Navbar.tsx"],"brief identifier":"ToolbarIconButton onSettings"},{"name":"selection-actions","files":["frontend/src/app/components/layout/Navbar.tsx"],"brief identifier":"resume/pause/recheck/remove toolbar actions"},{"name":"command-palette","files":["frontend/src/app/components/CommandPalette.tsx","frontend/src/app/commandRegistry.ts"],"brief identifier":"global command entry surface"},{"name":"settings-sidebar-tabs","files":["frontend/src/modules/settings/components/SettingsModalView.tsx","frontend/src/modules/settings/data/settings-tabs.ts"],"brief identifier":"SettingsSidebar tab buttons"},{"name":"torrent-row-context-menu","files":["frontend/src/modules/dashboard/components/TorrentTable_RowMenu.tsx","frontend/src/modules/dashboard/hooks/useTorrentTableContextActions.ts"],"brief identifier":"row menu actions"},{"name":"torrent-header-context-menu","files":["frontend/src/modules/dashboard/components/TorrentTable_HeaderMenu.tsx","frontend/src/modules/dashboard/hooks/useTorrentTableHeaderContext.ts"],"brief identifier":"header menu actions"},{"name":"tracker-context-menu","files":["frontend/src/modules/dashboard/components/TorrentDetails_Trackers.tsx"],"brief identifier":"TrackerContextMenu"},{"name":"system-tab-actions","files":["frontend/src/modules/settings/components/tabs/system/SystemTabContent.tsx"],"brief identifier":"repairAssociation / refreshAssociation / autorun toggle"}],"file_clusters":[{"name":"app-shell-and-control-plane","files":["frontend/src/app/App.tsx","frontend/src/app/components/WorkspaceShell.tsx","frontend/src/app/components/layout/Navbar.tsx","frontend/src/app/components/layout/StatusBar.tsx","frontend/src/app/components/CommandPalette.tsx","frontend/src/app/components/GlobalHotkeysHost.tsx","frontend/src/app/viewModels/useWorkspaceShellViewModel.ts","frontend/src/app/viewModels/useAppViewModel.ts"],"brief identifier":"app shell / top-level composition"},{"name":"dashboard","files":["frontend/src/modules/dashboard/components/Dashboard_Layout.tsx","frontend/src/modules/dashboard/components/TorrentTable.tsx","frontend/src/modules/dashboard/components/TorrentDetails.tsx","frontend/src/modules/dashboard/components/TorrentTable_RowMenu.tsx","frontend/src/modules/dashboard/hooks/useTorrentData.ts","frontend/src/modules/dashboard/hooks/useTorrentDetail.ts","frontend/src/modules/dashboard/viewModels/useTorrentTableViewModel.ts"],"brief identifier":"dashboard feature cluster"},{"name":"torrent-add","files":["frontend/src/modules/torrent-add/components/AddTorrentModal.tsx","frontend/src/modules/torrent-add/components/AddTorrentSettingsPanel.tsx","frontend/src/modules/torrent-add/components/AddTorrentFileTable.tsx","frontend/src/modules/torrent-add/hooks/useAddTorrentModalViewModel.ts","frontend/src/modules/torrent-add/hooks/useAddTorrentFileSelectionViewModel.ts","frontend/src/modules/torrent-add/services/addTorrentModalDecisions.ts"],"brief identifier":"add torrent feature cluster"},{"name":"torrent-remove","files":["frontend/src/modules/torrent-remove/components/RemoveConfirmationModal.tsx","frontend/src/modules/torrent-remove/context/DeleteConfirmationContext.tsx","frontend/src/modules/torrent-remove/types/deleteConfirmation.ts"],"brief identifier":"remove torrent feature cluster"},{"name":"settings","files":["frontend/src/modules/settings/components/SettingsModalView.tsx","frontend/src/modules/settings/components/SettingsFormBuilder.tsx","frontend/src/modules/settings/components/InterfaceTabContent.tsx","frontend/src/modules/settings/components/tabs/connection/ConnectionManager.tsx","frontend/src/modules/settings/components/tabs/system/SystemTabContent.tsx","frontend/src/modules/settings/context/SettingsFormContext.tsx","frontend/src/modules/settings/hooks/useSettingsModalController.ts","frontend/src/modules/settings/data/settings-tabs.ts","frontend/src/modules/settings/data/config.ts"],"brief identifier":"settings feature cluster"},{"name":"rpc-and-transport","files":["frontend/src/services/transport.ts","frontend/src/services/rpc/rpc-base.ts","frontend/src/services/rpc/heartbeat.ts","frontend/src/services/rpc/engine-adapter.ts","frontend/src/services/rpc/version-support.ts","frontend/src/services/rpc/schemas.ts","frontend/src/services/rpc/normalizers.ts"],"brief identifier":"RPC adapter / transport cluster"},{"name":"session-and-preferences","files":["frontend/src/app/context/SessionContext.tsx","frontend/src/app/context/PreferencesContext.tsx","frontend/src/app/context/ConnectionConfigContext.tsx","frontend/src/app/context/AppShellStateContext.tsx","frontend/src/app/context/connection/useConnectionProfileStore.ts","frontend/src/app/providers/TorrentClientProvider.tsx"],"brief identifier":"global state cluster"},{"name":"shared-workspace-inputs","files":["frontend/src/shared/ui/workspace/DestinationPathEditor.tsx","frontend/src/shared/ui/workspace/FileExplorerTree.tsx","frontend/src/shared/hooks/useDestinationPathValidation.ts","frontend/src/shared/hooks/useDestinationFreeSpaceProbe.ts","frontend/src/shared/domain/destinationValidationPolicy.ts","frontend/src/shared/domain/destinationPath.ts"],"brief identifier":"shared path/file workspace cluster"},{"name":"speed-history-and-telemetry","files":["frontend/src/shared/hooks/useUiClock.ts","frontend/src/shared/hooks/speedHistoryStore.ts","frontend/src/shared/hooks/useSessionSpeedHistory.ts","frontend/src/shared/hooks/useEngineSpeedHistory.ts","frontend/src/modules/dashboard/hooks/useTorrentSpeedHistory.ts"],"brief identifier":"telemetry/history cluster"},{"name":"shell-agent-and-runtime","files":["frontend/src/app/agents/shell-agent.ts","frontend/src/app/runtime.ts","frontend/src/app/hooks/useAddModalState.ts","frontend/src/modules/settings/components/tabs/system/SystemTabContent.tsx"],"brief identifier":"native host integration cluster"}]}



You are given a JSON scan of a frontend repo.

Your job is to produce a spec-level map for a clean rewrite.

You must ONLY use the provided scan.json as source of truth.
Do not invent features.

Output a markdown document with the exact structure below.

Every claim must include an "Evidence" line referencing items from scan.json (names or files).

---

# Rewrite Spec Map

## 1. Product summary

## 2. Functional surface area

For each feature:
* Name
* User goal
* Inputs
* Outputs
* Dependencies
* Classification: core / supporting / optional / likely dead
* Evidence:

## 3. Screens and flows

For each:
* Name
* Purpose
* Entry points
* Key actions
* Data needed
* State transitions
* Evidence:

## 4. Domain model inferred

For each entity:
* Name
* Meaning
* Key properties
* Lifecycle
* Relationships
* Evidence:

## 5. Integration map

For each:
* Name
* Purpose
* Essential / replaceable / removable
* Evidence:

## 6. Complexity hotspots

List concrete problems
* Issue
* Why it exists
* Evidence:

## 7. What to preserve

Only essential behaviors
* Item
* Evidence:

## 8. What to avoid in rewrite

Concrete anti-goals based on repo
* Item
* Evidence:

## 9. Simplification opportunities

- Change
* Why safe
* Confidence: high / medium / low
* Evidence:

## 10. Proposed rewrite boundary

- Must have
* Should have
* Defer
* Reject

## 11. Open questions

## 12. Coverage report

Include:
* total routes vs used
* total api_calls vs mapped
* total screens vs mapped

List anything unmapped.

## 13. Executive recommendation

- smallest viable architecture direction (plain English)
* top 5 things to avoid copying
* top 5 unknowns to confirm

---

Rules:

* Stay at spec level (no code, no classes, no frameworks)
* Do not mirror current structure
* Be reductive
* If unsure, say so


-------------------


You are auditing a spec map against a repo scan.

Your job is to find what was missed, wrong, or weak.

Do not restate the spec. Only critique it.

---

# Audit Report

## 1. Missing coverage

List items in scan.json not represented in the spec:
* Item
* Type (route/api/screen/etc)
* Why it matters

## 2. Mismatches

Where spec claims do not match scan data:
* Claim
* Conflict
* Evidence

## 3. Likely hallucinations

Anything in spec not grounded in scan:
* Item
* Why suspicious

## 4. Weak evidence

Claims with poor or vague evidence:
* Item
* Why weak

## 5. Risk areas

Where misunderstanding would break the rewrite:
* Area
* Reason

## 6. Over-complex carryover

Places where spec still reflects current bloat:
* Item
* Why it should be simpler

## 7. Final gap summary

- % coverage estimate
* Top 5 things likely missed

---

Rules:

* Be strict
* Prefer false negatives over false positives
* Assume the spec is wrong until proven otherwise
* No suggestions, only findings
