# Frontend Todo List

## Open Tasks

- [x] 48. architecture - Replace stringly dashboard filter surfaces with a typed filter domain
Owner:
`workspace-shell + dashboard/table`
Required refactor:
Introduce a shared dashboard-filter union and propagate it through VM/query/table APIs to eliminate string casts.
Affected files:
`frontend/src/app/viewModels/workspaceShellModels.ts`
`frontend/src/app/viewModels/useWorkspaceShellViewModel.ts`
`frontend/src/app/components/layout/Navbar.tsx`
`frontend/src/modules/dashboard/viewModels/useTorrentTableViewModel.ts`

- [x] 50. architecture - Extract tab-level orchestration from TorrentDetails container into detail tab surfaces
Owner:
`dashboard/details`
Required refactor:
Move tab action wiring/branching out of `TorrentDetails` and expose per-tab view-model surfaces from a single detail-tab coordinator.
Affected files:
`frontend/src/modules/dashboard/components/TorrentDetails.tsx`
`frontend/src/modules/dashboard/hooks/useDetailTabs.ts`
`frontend/src/app/viewModels/workspaceShellModels.ts`

- [x] 51. architecture - Split Pieces map into MVVM boundaries
Owner:
`dashboard/details/pieces`
Required refactor:
Separate canvas runtime/state orchestration from presentational rendering so interaction, geometry, and drawing pipelines have dedicated ownership.
Affected files:
`frontend/src/modules/dashboard/components/TorrentDetails_Pieces_Map.tsx`
`frontend/src/modules/dashboard/hooks/utils/canvasUtils.ts`

- [x] 52. architecture - Introduce dedicated Peers tab view-model surface
Owner:
`dashboard/details/peers`
Required refactor:
Move sorting, virtualization, hover/context-menu state, and action dispatch preparation into a dedicated hook/view-model consumed by a lean view component.
Affected files:
`frontend/src/modules/dashboard/components/TorrentDetails_Peers.tsx`
`frontend/src/modules/dashboard/hooks/usePeerHover.ts`

- [x] 53. architecture - Introduce dedicated Trackers tab view-model surface
Owner:
`dashboard/details/trackers`
Required refactor:
Move tracker derivation, announce/countdown formatting, and add-tracker editor state into a dedicated hook/view-model and keep tab component presentation-focused.
Affected files:
`frontend/src/modules/dashboard/components/TorrentDetails_Trackers.tsx`
