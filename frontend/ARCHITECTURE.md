# TinyTorrent Frontend Architecture

This file is the *single source of truth* for the frontend’s structure following the `architecture review` commit. It captures the invariants we enforce, the ownership boundaries we obey, and the orchestrated responsibilities that make the UX maintainable without touching implementation code.

## 1. Mission Compass

1. **Transmission daemon is king.** The backend owns all torrent truth, exposes only the vanilla Transmission RPC surface, and must continue to work whether or not the UI exists. The frontend may consume but never augment or assume non-existent methods like `tt-get-capabilities`, `X-TT-Auth`, or WebSocket delta sync.
2. **Tray/host/shell remain minimal.** The tray is the low-memory command surface. The Native Shell is the gatekeeper for OS actions (paths, explorer, install/autorun) and exposes only an adapter surface to the UI. No extra polling, no background workers beyond what the heartbeat scheduler orchestrates.
3. **UI is disposable workbench.** It renders React + Vite + Tailwind + HeroUI, uses Framer Motion for structure transitions, obeys the layout token system, and always treats data/state as derived from orchestrators/view-models—no ad-hoc business logic leaks into components.

## 2. Ownership Boundaries

| Layer | Responsibilities |
| --- | --- |
| **Daemon** | Runs Transmission, serves RPC, reports `free-space`, `torrents`, `session`. No host integration, no optimistic heuristics, no recovery UX. |
| **Host/Shell** | Owns file dialogs, reveal, install/autorun, persistence of window state, and the `NativeShell` bridge. Provides single event stream (`magnet-link`, window commands) that the frontend consumes via an adapter. |
| **Frontend (UI)** | Consumes RPC via `services/rpc/*` and orchestrators, renders via `WorkspaceShell`, obeys layout tokens, uses view-model contracts, provides command palette/hotkeys, heartbeats, and recovery views. It never calls OS APIs directly; it only uses the ShellAgent adapter. |

## 3. Framework Choices & Patterns

- **React 19 + TypeScript + Vite:** entry via `main.tsx`, orchestrated by `App`. The root handles providers (session, preferences, recovery, orchestrators) and delegates rendering to view-model-driven shells.
- **Tailwind v4 + HeroUI:** only semantic tokens (`p-panel`, `gap-stage`, etc.) are allowed—no inline literals. Geometry tokens live in `constants.json` → `@theme` → `logic.ts` → components.
- **Framer Motion** is required when UI transitions express state changes (lists, modals, inspector). Motion props belong to view components but consume view-model state.
- **React Context + Orchestrators:** `TorrentCommandContext`, `LifecycleContext`, `RecoveryContext`, etc., orchestrate flows and funnel everything through single control planes (selection, recovery, preferences). UI components subscribe to view-model outputs only.
- **RPC Services:** `engine-adapter`, `rpc-base`, `transport`, `heartbeat` expose a single `sessionStats/rpcStatus/uiMode` pipeline. No webs, no custom tokens—just Transmission RPC with Basic Auth.
- **Adapters:** Shell interactions go through a single ShellAgent adapter (strategy spelled out in TODO 3). No other module imports `NativeShell` directly.

## 4. Non-Negotiable Invariants

1. **Remote vs local capability gating** is computed via a central `UiMode = "Full" | "Rpc"` helper (#4 & #7 in `todo.md`). All shell-dependent UI (browse, recovery modals, install toggles) must respect this flag.
2. **Recovery gate centralization** (#9) ensures every recovery flow uses the same promise/lock and only renders gate-derived state/confidence (#12). UI must not heuristically classify recovery statuses.
3. **Preferences provider (#15)** centralizes theme, language, table layout, telemetry cadence. No localStorage hits outside that provider.
4. **Timers scheduling (#19)** belongs to a single heartbeat. Components do not start their own intervals.
5. **ViewModel boundaries (#13)**: presentation components only render; orchestrators/view-model providers derive selections, actions, recovery, and preferences.
6. **Torrent mutation authority**: UI-initiated torrent writes go through the single command surface in [`app/actions/torrentDispatch.ts`](./src/app/actions/torrentDispatch.ts). Components, modals, hooks, and view models must not call `EngineAdapter` torrent mutation methods directly or build their own long-running mutation follow-up flows.

## 5. Why the current TODO list matters

- Tasks 1–8 are about collapsing the RPC/host/shell narrative to Transmission-only communication while capturing the UI capability model (`UiMode`). They are non-negotiable because they heal the contracts between daemon, shell, and frontend.
- Tasks 11–14 (set location, recovery, view models) tighten the UX on the gate/view-model contracts: data arises from orchestrators, manual flows are consistent, and the UI becomes testable/predictable.
- Tasks 15–20 cover shared infrastructure (preferences, commands, add-torrent defaults, scheduler, debug events) that exist to avoid future drifts, duplication, and hidden state.

## 6. Next Steps (see `todo.md`)

1. Rework the TODO plan so it reflects the architecture hierarchy above, highlights completed/retired items (archived TODOs in `docs`), and keeps unresolved tasks visible to engineers.
2. Make sure every TODO comment in code references these invariants—when a developer reads `App.tsx` or `StatusBar`, they should see the same boundary/pattern (view models, UiMode, no RPC extensions).
3. Drive per-feature doc updates via `todo.md` and this file before touching implementation—these TODOs now define the structural path the next engineer must follow.
