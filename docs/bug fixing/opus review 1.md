User: Review this codebase as a senior systems architect.

Identify the most important improvements that would measurably increase:

correctness

performance

reliability

scalability

maintainability

Prioritize only high-impact changes.
Ignore style-level suggestions unless they create engineering risk.

For each recommendation provide:

what should change

why it matters technically

expected impact level (high / medium / low)

Focus on structural improvements, not cosmetic refactors.

GitHub Copilot: 

  

Created 6 todos

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/AGENTS_CONTEXT.md)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/backend/AGENTS.md#1-1), lines 1 to 300

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/AGENTS.md#1-1), lines 1 to 300

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/README.md#1-1), lines 1 to 200

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/docs/EXE%20architecture.md#1-1), lines 1 to 200

Starting: *Analyze backend core architecture* (2/6)

User: Review this codebase as a senior systems architect.

Identify the most important improvements that would measurably increase:

correctness

performance

reliability

scalability

maintainability

Prioritize only high-impact changes.
Ignore style-level suggestions unless they create engineering risk.

For each recommendation provide:

what should change

why it matters technically

expected impact level (high / medium / low)

Focus on structural improvements, not cosmetic refactors. concentrate only on frontend/

GitHub Copilot: 

  

Created 6 todos

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/package.json)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/vite.config.ts)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/tsconfig.app.json)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/modules)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/shared)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/config)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/domain)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/hooks)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/providers)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/context)

Now let me deep-dive into the critical files — the RPC layer, state management, the main provider, and the transport layer:    

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/rpc-base.ts#1-1), lines 1 to 200

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/transport.ts#1-1), lines 1 to 200

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/engine-adapter.ts)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/schemas.ts#1-1), lines 1 to 200

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/schemas.ts#200-200), lines 200 to 561

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/rpc-base.ts#200-200), lines 200 to 400

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/heartbeat.ts#1-1), lines 1 to 180

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/providers/TorrentClientProvider.tsx)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/rpc-base.ts#400-400), lines 400 to 700

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/heartbeat.ts#180-180), lines 180 to 500

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/hooks/useRpcConnection.ts#1-1), lines 1 to 150

User: rpc, transport were kinda copied from the transmission code.. I'd like advice regarding the UI/UX, recovery, how to enhance the code maintanability, code architecture... i'd expect even advice to improve agents.md from you

GitHub Copilot: 

  

Created 7 todos

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/context/connection)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/recovery)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/components)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/modules/dashboard)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/viewModels)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/recovery/recovery-controller.ts#1-1), lines 1 to 200

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/context/RecoveryContext.tsx)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/context/SessionContext.tsx#1-1), lines 1 to 200

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/recovery/recovery-runtime-lifecycle.ts)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/recovery/recovery-controller.ts#200-200), lines 200 to 400

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/viewModels/useAppViewModel.ts#1-1), lines 1 to 200

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/modules/dashboard/components)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/modules/dashboard/hooks)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/modules/dashboard/hooks/useTorrentData.ts#1-1), lines 1 to 200

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/modules/dashboard/hooks/useRecoveryController.ts#1-1), lines 1 to 200

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/orchestrators)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/orchestrators/useTorrentOrchestrator.ts)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/components/WorkspaceShell.tsx#1-1), lines 1 to 200

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/services)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/actions)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/actions/torrentDispatch.ts#1-1), lines 1 to 200

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/services/scheduler.ts#1-1), lines 1 to 100

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/context/ConnectionConfigContext.tsx#1-1), lines 1 to 100

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/context/PreferencesContext.tsx#1-1), lines 1 to 100

Starting: *Analyze recovery system* (3/7)

Deep-dive frontend architecture

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/modules/dashboard/hooks/useRecoveryController.ts#1-1), lines 1 to 400

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/rpc-base.ts#700-700), lines 700 to 1100

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/heartbeat.ts#500-500), lines 500 to 900

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/normalizers.ts#1-1), lines 1 to 500

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/recoveryAutomation.ts)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/errors.ts)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/intents/torrentIntents.ts)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/shared/utils/recoveryFormat.ts)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/shared/utils/fsErrors.ts)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/providers/engineDomains.ts)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/modules/dashboard/hooks/useRecoveryController.ts#401-401), lines 401 to 800

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/modules/dashboard/hooks/useRecoveryController.ts#801-801), lines 801 to 1200

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/modules/dashboard/hooks/useRecoveryController.ts#1201-1201), lines 1201 to 1600

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/modules/dashboard/hooks/useRecoveryController.ts#1601-1601), lines 1601 to 1930

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/rpc-base.ts#1101-1101), lines 1101 to 1400

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/rpc-base.ts#1401-1401), lines 1401 to 1644

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/heartbeat.ts#901-901), lines 901 to 1072

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/normalizers.ts#501-501), lines 501 to 538

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/rpc-base.ts#1-1), lines 1 to 700

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/heartbeat.ts#1-1), lines 1 to 500

Searched for text `createContext` (`**/frontend/src/**`), 20 results

Searched for text `createContext` (`**/frontend/src/**`), 30 results

Starting: *Analyze context/provider architecture* (4/7)

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/App.tsx#1-1), lines 1 to 100

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/context/AppShellStateContext.tsx#1-1), lines 1 to 100

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/app/context/PreferencesContext.tsx#100-100), lines 100 to 250

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/src/services/rpc/rpc-base.ts#300-300), lines 300 to 700

Now let me check remaining key files to complete the picture: 

Read [](file:///c%3A/Users/user/source/repos/SynoSoftware/TinyTorrent/frontend/AGENTS.md#300-300), lines 300 to 1626

Starting: *Deliver prioritized findings* (7/7)

Here is the architectural review, organized by descending impact.

---

## 1. `useRecoveryController` is a 1930-line God Hook — the #1 Maintainability Risk

**Impact: HIGH**

This single hook owns **6+ distinct responsibilities**: missing-file probing/classification, recovery queue management, recovery modal lifecycle FSM, background silent-recovery scheduling, location-editor state machine (a full `useReducer` FSM), draft path persistence, toast orchestration, and torrent-deletion coordination. It holds ~15 `useRef` instances for mutable state and returns a deeply nested object.

**What should change:**
Break it into composable pieces along responsibility boundaries *already defined by AGENTS.md* §16F:

| Extracted Unit | Pattern (§16F) | Responsibility |
|---|---|---|
| `useRecoveryProbe` | Domain Hook | Classification + probing + probe caching |
| `useRecoveryQueue` | Orchestrator Hook | Session queue (enqueue/dequeue/finalize), modal gating, dedupe via fingerprint |
| `useLocationEditor` | Domain Hook | The existing `useReducer` FSM + draft persistence + confirm/cancel/release |
| `useSilentRecovery` | Orchestrator Hook | Background volume-loss polling + cooldown scheduling |
| `useRecoveryController` | Orchestrator (thin) | Composes the above, exposes the unified `RecoveryControllerResult` |

**Why it matters:** This file is the #1 source of merge conflicts, regression surface, and cognitive load. It violates AGENTS.md §16E (God Object Prohibition), §21.3 (Ownership Rule), and §14 (ViewModel Cohesion). More critically, it makes recovery-related bugs nearly impossible to unit-test — the probe logic, queue logic, and editor FSM are all entangled through shared refs.

---

## 2. Recovery Has No Clear State Machine — Correctness Risk

**Impact: HIGH**

Recovery flows are spread across: recovery-controller.ts (service), useRecoveryController.ts (hook), `recoveryAutomation.ts` (heartbeat post-processor), `missingFilesStore.ts` (cache), RecoveryContext.tsx (context), and `recoveryFormat.ts` (presentation). The lifecycle transitions (idle → probing → classified → queued → modal-open → resolving → resolved/failed) are **implicit** — they live in conditional branches across multiple files rather than in an explicit state machine.

**What should change:**
Introduce a typed recovery state machine (a discriminated union or XState-style reducer):

```typescript
type RecoveryState =
  | { phase: "idle" }
  | { phase: "probing"; fingerprint: string }
  | { phase: "classified"; classification: MissingFilesClassification }
  | { phase: "queued"; position: number }
  | { phase: "modal"; session: RecoverySessionInfo }
  | { phase: "resolving"; attempt: number }
  | { phase: "resolved"; outcome: RecoveryOutcome }
  | { phase: "failed"; error: string; retryable: boolean };
```

All transitions go through a single `dispatch(event)` with an `ALLOWED_TRANSITIONS` table, similar to what you already have in `normalizers.ts` for torrent state.

**Why it matters:** Today, recovery can enter inconsistent states — e.g., a stale `IN_FLIGHT_RECOVERY` Map entry prevents future recovery on the same torrent if the deferred promise never resolves. The modal can render stale classification data if the torrent re-errors during a retry. An explicit state machine makes illegal states unrepresentable and makes the recovery flow testable in isolation.

---

## 3. Module-Level Mutable State Without Lifecycle Guarantees

**Impact: HIGH**

Several files use module-scoped `Map`/`Set` instances as runtime caches:

| Variable | File | Risk |
|---|---|---|
| `VERIFY_GUARD` | recovery-controller.ts | Grows unboundedly per torrent fingerprint |
| `IN_FLIGHT_RECOVERY` | recovery-controller.ts | Entries persist if promise never resolves |
| `FIRST_SEEN_MS` | recoveryAutomation.ts | Never pruned during session |
| `verifyStateMap` | normalizers.ts | Grows per unique torrent |
| `transportSessionRuntimeByKey` | transport.ts | Grows per endpoint×auth combo |
| `recentWarningTs` | rpc-base.ts | Never pruned |

`resetRecoveryRuntimeSessionState()` exists but is only called on adapter recreation — if the adapter stays alive during a long session with many torrents added/removed, these caches only grow.

**What should change:**
1. Add TTL-based pruning or LRU eviction to all module-scoped caches
2. `IN_FLIGHT_RECOVERY`: add a timeout that auto-rejects stale entries (e.g., 60s)
3. `VERIFY_GUARD` / `FIRST_SEEN_MS`: prune entries for torrent IDs no longer present in the heartbeat's torrent list
4. Define the lifecycle boundary for each cache per §21.4 (per-session? per-heartbeat-cycle?)

**Why it matters:** In a long-running session (which is TinyTorrent's use case — "always running"), unbounded module-level state is a slow memory leak. The `IN_FLIGHT_RECOVERY` issue is worse: a stuck promise silently blocks all future recovery for that torrent.

---

## 4. `HeartbeatManager.computeHash()` Uses `JSON.stringify` on the Entire Torrent Array

**Impact: MEDIUM-HIGH**

heartbeat.ts line ~147:
```typescript
private computeHash(torrents: TorrentEntity[]) {
    return JSON.stringify(torrents);
}
```

This runs every heartbeat tick (every 500ms–1500ms). For 1000 torrents, each `TorrentEntity` has ~25 fields — this stringifies ~25K values every tick just to check "did anything change?" The result is also stored as `lastTorrentHash` (a potentially multi-MB string held in memory).

**What should change:**
Replace with a structural hash that avoids full serialization:
- Compute a lightweight composite key per-torrent (e.g., `id + state + progress + speed.down + speed.up + eta + error`), concatenate, and hash via a fast string hash
- Or: use the existing `computeChangedIds()` logic (which already does field-level comparison) as the primary change-detection, and drop `computeHash` entirely
- The `lastTorrentHash` string should be replaced with a numeric/fixed-size fingerprint

**Why it matters:** `JSON.stringify` on 1000 entities at 1.5s interval = ~40MB/minute of string allocations that immediately become GC pressure. This directly impacts UI responsiveness during the GC pauses.

---

## 5. Dual Session-ID Ownership Between `TransmissionAdapter` and `TransmissionRpcTransport`

**Impact: MEDIUM-HIGH**

The Transmission session-ID (`X-Transmission-Session-Id`) is owned by **both** the adapter (`this.sessionId`) and the transport (`this.sessionRuntime.sharedSessionId`). The `send()` method contains defensive sync code in both directions:

- Lines ~570–580: Adapter syncs its ID into the transport before read-only requests
- Lines ~600–610: Adapter syncs the transport's ID back after read-only requests

This bidirectional sync creates a correctness hazard: if a mutating RPC happens concurrently with a read-only one through the transport path, the session IDs can temporarily diverge, causing spurious 409s.

**What should change:**
One owner. The transport already manages session-ID probing via the 409 handshake flow. Make the transport the **sole authority** for session-ID. The adapter should read `transport.getSessionId()` whenever it needs the token, not maintain its own copy. Remove `this.sessionId` from the adapter and all the bidirectional sync code.

**Why it matters:** This eliminates ~40 lines of fragile defensive code and removes an entire class of handshake-churn bugs. It also aligns with §21.2 (Authority Rule): "every decision in the system must have exactly one authority."

---

## 6. rpc-base.ts (1644 lines) Mixes Adapter + Telemetry + Free-Space + ID-Map Concerns

**Impact: MEDIUM**

`TransmissionAdapter` acts as RPC client, session manager, id-map cache, response cache coordinator, network telemetry fetcher (with TTL caching + inflight dedup), free-space prober (with multi-candidate fallback, ~80 lines), bandwidth group manager, and heartbeat owner.

**What should change:**
Extract behind domain boundaries:
- `NetworkTelemetryService` → owns `fetchNetworkTelemetry`, the TTL cache, and the inflight promise dedup
- `FreeSpaceService` → owns `checkFreeSpace` with the multi-candidate fallback
- `IdMapService` → owns hash→numeric-ID resolution and cache management
- The core adapter becomes ~600-800 lines: session lifecycle, `send()`/`performSend()`, torrent CRUD delegation, and heartbeat wiring

**Why it matters:** Today you can't unit-test free-space fallback logic without instantiating a full `TransmissionAdapter`. The telemetry caching logic is buried deep inside a class that's also doing auth. Each extraction gets you testability and reduces the blast radius of per-concern changes.

---

## 7. 16 React Contexts — Mounting Order Fragility

**Impact: MEDIUM**

The app nests 16 contexts. The provider tree enforced by mounting order creates a rigid coupling. `SessionContext` wraps `SpeedHistoryDomainProvider` wraps `SessionSpeedHistoryProvider` wraps `SessionTelemetryProvider`. `WorkspaceShell` requires `RecoveryProvider` + `AppCommandProvider` + `GlobalHotkeyProvider` to be ancestors. Any reordering or refactoring of the tree is extremely fragile.

**What should change:**
1. **Merge related contexts**: `SessionContext` + `SessionTelemetryContext` can become a single context with nested splitting for re-render isolation (which they already partially do). The two speed-history contexts can be merged.
2. **Document the provider tree** in AGENTS.md — a canonical ordering with a visual diagram. This prevents agents from accidentally reordering providers during refactors.
3. Consider a context registry pattern for the 4-5 truly global values (client, rpcStatus, uiCapabilities, preferences, engineCapabilities) and reserving React Context for scoped feature state.

**Why it matters:** 16 contexts = 16 nested `<Provider>` wrappers in the component tree. Each one is a potential re-render boundary. Misordering causes runtime `null` context errors that are only caught at execution time, not compile time.

---

## 8. Error Handling: ~30+ Silent Swallow Points

**Impact: MEDIUM**

Across rpc-base.ts (~20 instances), heartbeat.ts (~12 instances), and transport.ts (~5 instances), errors are caught and silently ignored with `catch { /* ignore */ }` or `catch { // swallow }`. These cover:
- Session-ID sync failures
- Cache invalidation errors  
- Transport session seed errors
- Subscriber callback errors
- AbortController cleanup errors
- sessionStorage read errors

**What should change:**
1. Replace silent swallows with `infraLogger.debug(...)` for categories that are truly non-critical (sessionStorage reads)
2. Replace `catch { /* ignore */ }` on session-ID sync with `infraLogger.warn(...)` — these indicate real state inconsistency
3. For subscriber callback errors in `broadcastToSubscribers`, log the subscriber identity so broken subscribers can be identified
4. Add a counter metric for swallowed errors — even if individual errors are non-critical, a spike in count indicates a systemic problem

**Why it matters:** When users report "the UI stopped updating" or "recovery doesn't trigger," debugging requires correlating browser console output with RPC traffic. The current silent swallows create diagnostic blind spots exactly where you most need observability.

---

## 9. `PreferencesContext` is 778 Lines — Monolithic Persistence Layer

**Impact: MEDIUM**

This context handles: theme, language, workspace style, zoom/scale, system preferences (sleep, update, close action), inspector tab persistence, table column state, speed chart layout, add-torrent defaults, add-torrent path history, connection profiles, and dismissed HUD cards. It also manages legacy migration from ~12 different localStorage keys to a unified schema.

**What should change:**
Split into a persistence service + thin context:
- `PreferencesPersistence` (service, non-React): handles localStorage read/write/migration, schema validation via Zod, version migration
- `PreferencesContext` (thin): holds `PreferencesState`, exposes granular setters, delegates persistence

Additionally, split the 17-field `PreferencesState` into domain-specific slices that can be consumed independently (avoids re-rendering the entire tree when only `inspectorTab` changes).

**Why it matters:** Every call to any preference setter today triggers a full `JSON.stringify` + `localStorage.setItem` of the entire preferences blob plus a state update that propagates to every consumer of the context (including components that only care about `theme`).

---

## 10. AGENTS.md Improvements

**Impact: MEDIUM**

The frontend AGENTS.md is comprehensive (1626 lines) but has structural gaps that cause agents to produce inconsistent work:

### A. Missing: Provider Tree Documentation
Add a canonical provider nesting order diagram:
```
<PreferencesProvider>
  <ConnectionConfigProvider>
    <ClientProvider>
      <SessionProvider>                    // owns: client, rpcStatus, uiCapabilities
        <SpeedHistoryDomainProvider>
          <SessionSpeedHistoryProvider>
            <SessionTelemetryProvider>     // owns: sessionStats
              <AppShellStateProvider>      // owns: selection, focus, settings
                <AppContent />             // mounts: RecoveryProvider, CommandProvider, HotkeyProvider
```
This prevents agents from accidentally breaking the context dependency chain.

### B. Missing: Data Flow Diagram for Recovery
Recovery spans 6 files across 3 directories. Without a documented flow, agents routinely add logic in the wrong layer. Add:
```
heartbeat tick → recoveryAutomation.processHeartbeat (stamps error age)
  → normalizers.deriveTorrentState (classifies MISSING_FILES)
    → useRecoveryController.onHeartbeat (probes + queues)
      → recovery-controller.recoverMissingFiles (orchestrates)
        → RecoveryContext (exposes to UI)
```

### C. Missing: Module-Level Mutable State Registry
§21.3 says "all mutable state must declare an owner" but there's no central inventory. Add a section listing every module-scoped `Map`/`Set`, its owner, its lifecycle boundary, and its reset function.

### D. Conflicting Guidance: §15 vs Reality
§15 prescribes a flat module structure (`hooks.ts` inside each module), but the actual codebase has `modules/dashboard/hooks/` with 27+ individual hook files, `modules/dashboard/components/` with 29 component files, `modules/dashboard/viewModels/`, `modules/dashboard/types/`, and `modules/dashboard/utils/`. The AGENTS.md should be updated to reflect the actual structure (which is frankly more maintainable than the prescribed flat layout for a module this size).

### E. Missing: Error Handling Contract
§20.2 says "all abstractions must define failure paths" but there's no guidance on *how* errors should be handled vs. swallowed vs. logged. Add a tiered policy:
- **Critical** (auth failures, handshake failures): throw, caller must handle
- **Degraded** (telemetry fetch fails, free-space unavailable): return typed `null`/fallback, log via `infraLogger.warn`
- **Ignorable** (sessionStorage unavailable, debug logging fails): swallow silently
- **Never swallow**: session-ID sync, subscriber dispatch, cache invalidation

### F. Missing: Testing Strategy
The AGENTS.md has no guidance on what should be tested, where tests live, or what test patterns to use. The existing `__tests__/` directories are sparse. Add a section defining:
- Unit test expectations for services, normalizers, and domain hooks
- Integration test expectations for orchestrator hooks
- The `vitest` + `happy-dom` setup already configured in vite.config.ts

---

## 11. Vite Build Produces a Single Mega-Bundle

**Impact: LOW-MEDIUM**

vite.config.ts line ~36:
```typescript
manualChunks() { return "bundle"; }
```

This forces everything — React, HeroUI, Framer Motion, i18next, all app code — into a single chunk. The `chunkSizeWarningLimit: 3000` (3MB) confirms this is intentional but costly: any change invalidates the entire browser cache.

**What should change:**
This may be intentional for the embedded/packaged use case (single-file WebView2 load). If so, document it explicitly in AGENTS.md. If the "on-demand browser UI" use case is also important, provide a build variant that splits vendor vs. app code for HTTP cache efficiency.

---

## Summary Table

| # | Recommendation | Affects | Impact |
|---|---|---|---|
| 1 | Decompose `useRecoveryController` (1930 lines) | Maintainability, Testability | **High** |
| 2 | Introduce typed recovery state machine | Correctness, Reliability | **High** |
| 3 | Add lifecycle/pruning to module-level caches | Reliability, Memory | **High** |
| 4 | Replace `JSON.stringify` hash in HeartbeatManager | Performance | **Medium-High** |
| 5 | Unify session-ID ownership to transport only | Correctness, Maintainability | **Medium-High** |
| 6 | Extract telemetry/free-space/id-map from adapter | Testability, Maintainability | **Medium** |
| 7 | Reduce/document 16 React contexts | Maintainability, Reliability | **Medium** |
| 8 | Replace ~30 silent error swallows with tiered logging | Debuggability, Reliability | **Medium** |
| 9 | Split `PreferencesContext` (778 lines) | Performance, Maintainability | **Medium** |
| 10 | Improve AGENTS.md (provider tree, recovery flow, error policy, testing) | Maintainability | **Medium** |
| 11 | Document or fix single-bundle build strategy | Performance (browser use case) | **Low-Medium** | 

Completed: *Deliver prioritized findings* (7/7)