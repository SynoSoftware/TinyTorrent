
## ✅ **CODEBASE-WIDE ARCHITECTURE REVIEW PROMPT**

You are a **Principal Frontend Systems Engineer** with deep experience in **large, long-lived, stateful UIs** (developer tools, infrastructure dashboards, power-user applications).

You specialize in:

* architectural ownership boundaries
* invariant-driven design
* regression prevention
* refactor planning with minimal blast radius
* stabilizing complex systems *without rewriting them*

You do **not** optimize for novelty or aesthetics.
You optimize for **correctness, robustness, and evolvability**.

You follow AGENTS.md as a hard contract.

---

## Context

You are reviewing an existing **frontend codebase**.

The system:

* already works in production
* has grown organically
* has suffered regressions when features were modified
* uses modern libraries (React, TanStack, dnd-kit, etc.)

The goal is **not** to rewrite or modernize.
The goal is to **understand**, **classify**, and **stabilize**.

---

## Your Task

Perform a **whole-codebase architectural review** and produce a **clear, structured assessment**.

Do **not** assume intent.
Do **not** trust comments.
Derive conclusions strictly from the code.

---

## What to Analyze (must all be covered)

### 1. Responsibility & Ownership Map

Identify:

* major subsystems (state, layout, interactions, persistence, effects, etc.)
* which modules/hooks/components *own* each concern
* where ownership is clear vs fragmented

---

### 2. Invariants & Contracts

Infer:

* implicit invariants the system relies on (ordering authority, state lifecycles, sync points)
* places where invariants are enforced
* places where invariants are **assumed but not protected**

---

### 3. Coupling & Fragility Assessment

Identify:

* areas with tight coupling across concerns
* temporal coupling (ordering, effects, timing dependencies)
* “butterfly effect” zones where small changes cause regressions

Classify each as:

* acceptable
* risky
* critical

---

### 4. Architectural Quality Classification

For each major area, classify it as one of:

* **Stable / Well-Owned**
  Clear ownership, low regression risk

* **Working but Fragile**
  Correct behavior but poor boundaries

* **High-Risk / Regression-Prone**
  Mixed responsibilities, hidden contracts

* **Technical Debt (Non-Urgent)**
  Suboptimal but not dangerous

---

### 5. Immediate Risk Identification

Call out:

* anything that could realistically break again soon
* anything that blocks safe future changes
* anything that should *not* be touched casually

This section should be short and blunt.

---

### 6. Improvement Roadmap (High Level)

Produce a **prioritized roadmap** with:

* Phase 0: **Do not touch / protect invariants**
* Phase 1: **High-value stabilizations** (extractions, ownership fixes)
* Phase 2: **Optional improvements**
* Phase 3: **Nice-to-have cleanups**

Each item should state:

* why it matters
* what risk it reduces
* whether it is safe or risky to do

No implementation details.
No code changes.
No speculative redesigns.

---

## Constraints (Hard)

* ❌ Do NOT propose rewrites
* ❌ Do NOT add features
* ❌ Do NOT modernize for its own sake
* ❌ Do NOT suggest library swaps
* ❌ Do NOT “clean up” unless it reduces risk

Assume:

* time is limited
* regressions are expensive
* stability > elegance

---

## Output Format (Strict)

Produce **only** the following sections:

1. Executive Summary (max 10 lines)
2. System Classification (bullet list)
3. Invariants & Contracts (explicit)
4. High-Risk Areas (ranked)
5. What Is Already Good (do not skip this)
6. Stabilization Roadmap (phased, concise)
7. Final Recommendation (1 paragraph)

No filler.
No motivational language.
No generic best practices.

---

## Stop Condition

If you lack confidence about any conclusion:

* state uncertainty explicitly
* do not guess

-------------

Executive Summary

Core responsibilities cluster around a single heavy TransmissionAdapter + HeartbeatManager pair that centralizes polling/delta fetch, but mixes transport/session/telemetry concerns in one class rpc-base.ts:1-220 heartbeat.ts:1-220.
App is a god-orchestrator coordinating capabilities, modals, add flows, zoom, and session lifecycle, creating broad coupling to many hooks App.tsx:1-220.
Workbench rendering is contained in WorkspaceShell, but visual composition and action wiring are tightly interleaved WorkspaceShell.tsx:1-220.
Data flow for torrents/details uses heartbeat subscriptions with snapshot caches and equality guards; invariants rely on adapter correctness useTorrentData.ts:1-260 useTorrentDetail.ts:1-200.
System Classification

RPC/Transport/Heartbeat: Working but Fragile (large surface, hidden contracts).
App Orchestration: High-Risk / Regression-Prone (cross-cutting state, many effects).
Workbench Shell/Layout: Working but Fragile (layout + behavior mixed).
Torrent Data/Detail Hooks: Stable / Well-Owned (clear snapshot + equality rules, guarded heartbeat usage).
Config/Token Pipeline: Stable / Well-Owned (single source constants + logic) logic.ts:1-220.
Invariants & Contracts (explicit)

All heartbeat consumers must subscribe through EngineAdapter.subscribeToHeartbeat; no local timers (enforced in hooks) useEngineHeartbeat.ts:1-80.
Heartbeat polling intervals derive from mode and must respect MODE_INTERVALS; detail subscribers force polling even when polling disabled heartbeat.ts:60-160 heartbeat.ts:520-640.
Detail cache validity depends on torrent hash equality; mismatched hashes invalidate cached detail heartbeat.ts:150-210.
TransmissionAdapter requires handshake/session-id before most RPCs; bypass allowed only when flagged rpc-base.ts:120-210.
Workbench zoom is bounded via clamp and persisted to CSS var --tt-zoom-level; zoom changes broadcast custom event useWorkbenchScale.ts:1-80.
Torrent snapshots assume stable ordering from buildUniqueTorrentOrder; data updates are skipped when no change detected useTorrentData.ts:60-220.
Detail subscription ignores payloads whose hash does not match current identity, preventing stale overwrites useTorrentDetail.ts:80-170.
High-Risk Areas (ranked)

App god-component: mixes transport state, capability probing, modals, file IO, hotkeys, and zoom handling; change anywhere risks cascading behavior App.tsx:1-220.
TransmissionAdapter + HeartbeatManager: large intertwined logic (handshake, session cache, delta merge, websocket, telemetry); subtle ordering/TTL assumptions can regress polling or session validity rpc-base.ts:1-220 heartbeat.ts:400-760.
Workspace shell composition: visual layout, immersion toggles, action wiring, and modal triggers live together; alterations to chrome tokens may affect behavior (native vs immersive) WorkspaceShell.tsx:1-220.
Heartbeat detail cache: relies on hash stability and timely prune; mismatched hashes or missing prune could surface stale detail silently heartbeat.ts:140-210.
Ghost torrent timers: timers stored per ghost without global teardown coordination; risk of leaks if adapters are swapped mid-flight useTorrentData.ts:150-240.
What Is Already Good

Centralized heartbeat with delta support and visibility throttling reduces redundant fetches heartbeat.ts:60-210.
Torrent snapshot equality + order guards minimize React churn and protect against flicker useTorrentData.ts:60-200.
Detail subscription respects hash and timestamp ordering to avoid stale overwrites useTorrentDetail.ts:100-170.
Config/token pipeline cleanly separates literals from derived tokens; zoom and scale bases applied once at bootstrap logic.ts:1-200 main.tsx:1-80.
Provider for torrent client encapsulates adapter lifecycle and session token storage TorrentClientProvider.tsx:1-120.
Stabilization Roadmap

Phase 0 (Protect): Do not bypass heartbeat for any fetch; avoid direct RPC calls outside EngineAdapter to preserve polling invariants [risk low].
Phase 1 (High-value):
Extract RPC session/handshake handling from TransmissionAdapter into a small helper to reduce coupling with heartbeat logic [risk medium].
Split App into orchestration + UI wiring layers (e.g., capability/session controller vs presentation props) to localize change impact [risk medium].
Isolate WorkspaceShell layout tokens from behavioral handlers (window commands, bulk actions) to prevent visual tweaks from affecting logic [risk low].
Phase 2 (Optional):
Add explicit contract tests/mocks around HeartbeatManager delta vs full-sync behavior and detail cache prune paths to catch regressions early [risk low].
Wrap ghost-timer management in a disposable scope tied to adapter lifecycle to avoid leaks on profile switch [risk medium].
Phase 3 (Nice-to-have):
Document zoom/custom-event contract and native-host dataset expectations near runtime bootstrap for future platform work [risk low].
Add lightweight diagnostics hooks for heartbeat source transitions to aid triage without console noise [risk low].
Final Recommendation
Prioritize tightening ownership boundaries: decouple session/transport control from heartbeat orchestration in the adapter, and shrink the App orchestrator by moving discrete flows (capability probing, add/magnet handling, zoom/global hotkeys) into dedicated controllers. Preserve the current heartbeat-centric data path, but add guardrails/tests around delta/full-sync switching and detail caching before making further feature changes.


---- 2nd try ----

xecutive Summary

Heartbeat-centric runtime is strong but overloaded: TransmissionAdapter entwines handshake, cache, delta merge, websocket, telemetry, and timers, creating hidden sequencing contracts rpc-base.ts:1-320 heartbeat.ts:400-760.
App remains a god orchestrator (capabilities, hotkeys, add flows, zoom, native flags, session stats) with many cross-cutting refs and refs-to-callback bridges that are fragile under change App.tsx:1-260.
Workbench shell mixes geometry, immersive chrome recipes, and action wiring; native vs immersive branches use inline padding/radius instead of tokens, increasing drift risk WorkspaceShell.tsx:160-320.
Data hooks for torrents and detail are the most disciplined: snapshot caches, equality guards, hash/timestamp protection, and heartbeat-only data flow useTorrentData.ts:60-240 useTorrentDetail.ts:60-190.
Config/token pipeline is clean; scale primitives applied at bootstrap and honored by CSS, but immersive layout still injects numbers directly in JSX (radius/padding) logic.ts:1-220 WorkspaceShell.tsx:200-320.
System Classification

RPC/Transport/Heartbeat: Working but Fragile (monolith class with intertwined states).
App Orchestration: High-Risk / Regression-Prone (cross-concern effects, many refs).
Workbench Shell/Layout: Working but Fragile (visual + behavioral coupling, mixed token adherence).
Data Hooks (torrents/detail): Stable / Well-Owned (clear contracts, cache guards).
Config/Token Pipeline: Stable / Well-Owned (single-source tokens, applied early).
Invariants & Contracts (explicit)

Heartbeat is the single source of truth; consumers must not start their own timers. Modes map to fixed intervals; detail mode always fetches even if polling is disabled useEngineHeartbeat.ts:1-70 heartbeat.ts:520-640.
Delta vs full-sync: heartbeat forces full fetch after MAX_DELTA_CYCLES to prevent drift; changedIds computed by stringified torrent snapshots heartbeat.ts:60-210 heartbeat.ts:700-780.
Detail cache validity depends on matching torrent hash and pruning when summary hash changes; mismatched hashes drop cached detail heartbeat.ts:140-210.
Session handshake gate: most RPCs are blocked until handshake/session-id is ready unless bypass flag is set rpc-base.ts:120-210.
Workbench zoom is clamped (0.7–1.5), persisted to --tt-zoom-level, and broadcast via tt-zoom-change event; handlers rely on Alt+Plus/Minus or Ctrl+0 variants useWorkbenchScale.ts:1-80 App.tsx:80-160.
Torrent snapshots skip state updates when both data and order are unchanged; identity is order-driven via buildUniqueTorrentOrder useTorrentData.ts:60-220.
Detail subscription ignores payloads with mismatched hash or older timestamp than current detail state, preventing stale overwrites useTorrentDetail.ts:100-180.
Capability flags are inferred from adapter method presence and updated on effect mount; missing methods force “unsupported” states App.tsx:60-120.
High-Risk Areas (ranked)

App orchestration: many refs (refresh refs, settings refs), multiple hotkey listeners, native flag toggles, magnet/file flow, capability probing—any change risks unintended side effects or stale closures App.tsx:1-200.
TransmissionAdapter monolith: handshake lifecycle, session cache, websocket/session invalidation, read-RPC caching, delta merge, telemetry TTL, and heartbeat instantiation all live together; sequencing bugs likely rpc-base.ts:1-320 heartbeat.ts:400-760.
WorkspaceShell immersive branch: inline radii/padding and acrylic recipes in JSX bypass token pipeline, making geometry inconsistent and hard to scale; visual tweaks can affect hit areas and interactions WorkspaceShell.tsx:200-320.
Ghost torrent timers and add flows: timers stored per ghost without lifecycle tie to client/adapter; profile switch or unmount could leak timers or leave orphan ghosts useTorrentData.ts:150-240.
Heartbeat detail cache pruning: relies on hash comparison; if upstream hash changes unexpectedly, detail cache drops silently—risk of “missing detail” UX without clear signal heartbeat.ts:140-210.
What Is Already Good

Heartbeat supports delta fetch, visibility throttling, and live payload push; subscribers get cached data immediately, reducing UI churn heartbeat.ts:60-210.
Torrent data hook uses stable equality and order comparison to avoid rerenders and respects ghost lifecycle with timeouts useTorrentData.ts:60-230.
Detail hook enforces hash/timestamp ordering, preventing stale detail flashes when switching rows useTorrentDetail.ts:100-180.
Token pipeline cleanly separates intent (constants.json) from arithmetic and roles; bootstrap applies scale/zoom before render, minimizing FOUC logic.ts:1-200 main.tsx:1-80.
Client provider owns adapter lifecycle and session token propagation, preventing leaked transports on profile changes TorrentClientProvider.tsx:1-110.
Stabilization Roadmap

Phase 0 (Do not touch / protect):
Keep all data fetching behind EngineAdapter.subscribeToHeartbeat; prohibit direct polling in components.
Preserve handshake gating for RPCs; avoid bypass unless for handshake/session-get paths.
Phase 1 (High-value stabilizations):
Extract session/handshake + auth-token handling from TransmissionAdapter into a small helper to decouple from heartbeat/delta logic; reduces sequencing regressions [risk: medium].
Split App into (a) connection/capability/controller layer and (b) UI wiring/presentation to shrink closure surfaces and isolate modal/add flows [risk: medium].
Move immersive shell radii/padding into tokens (constants → index.css → logic.ts roles) to remove JSX numbers and align with token pipeline [risk: low].
Phase 2 (Optional improvements):
Add contract tests for heartbeat delta vs full-sync switch, cache prune, and changedIds computation to catch regressions before UI exposure [risk: low].
Encapsulate ghost-timer management in a disposable scope keyed to adapter/profile; dispose on provider teardown to prevent leaks [risk: medium].
Introduce a small “heartbeat diagnostics” flag (already partly present) that logs source transitions and delta sizes without console spam in prod [risk: low].
Phase 3 (Nice-to-have cleanups):
Document zoom/custom-event and native-host dataset contracts near bootstrap to guide future platform changes [risk: low].
Clarify capability probing flow and fallback states (sequential/super seeding) in a dedicated hook to reduce App effect noise [risk: low].
Final Recommendation
Focus first on disentangling transport/session concerns from the monolithic adapter and on shrinking App into clearer controllers; both changes reduce regression blast radius while preserving the heartbeat-driven data model. In parallel, re-tokenize immersive shell geometry to align with the design system and add lightweight heartbeat contract tests to guard delta/full-sync behavior before further feature work.



----------------------- torrent details review ----------------------

ere’s what stands out in the torrent details stack and where to dig first.

Likeliest Failure Hotspots

TorrentDetails_Pieces_Map.tsx: draws every render with aggressive console logging and forces canvas sizing even when the container height is 0 → spam + potential layout thrash. If pieceCount or pieceStates are missing, it fabricates fallback data and still draws; any zero-height container or missing canvas context will throw.
TorrentDetails_Peers_Map.tsx: SPD physics constants inline; switches modes based on idle/tick. If peers is undefined (or empty), it still runs projections; bad data can propagate NaNs into positions and break the SVG layout.
TorrentDetails_General.tsx: assumes torrent.hash, speed, state exist. useTorrentDetail seeds a stub { id } before heartbeat detail arrives, so GeneralTab can render with undefined fields; clipboard copy/hash, state labels, and recovery buttons may explode when hash/state are missing.
Trackers reannounce flow: useDetailControls.ts:90-200 waits on a heartbeat detail update after calling forceTrackerReannounce. If the adapter doesn’t emit updated detail (or heartbeat misses it), the promise times out and the tab appears “stuck”.
Speed tab: TorrentDetails_Speed.tsx uses useEngineSpeedHistory; if the adapter doesn’t implement getSpeedHistory, history stays empty. Not a crash, but “fails to work”.
Data Contracts to Verify (before UI)

Detail payload: pieceCount, pieceSize, pieceStates, pieceAvailability, files, peers, trackers must be present for the active torrent id. Heartbeat detail fetch is the only source; confirm EngineAdapter.getTorrentDetails returns these and heartbeat’s detail caching isn’t pruning due to hash mismatch.
Hash stability: Pieces/Peers/Trackers all rely on stable torrent.hash and torrent.id. If hashes differ between summary and detail, heartbeat drops the cached detail silently.
Files array: FileExplorerTree expects index and name; missing indexes or duplicate indexes will corrupt tree flattening.
Quick Diagnostic Steps

Reproduce with DevTools console open and switch tabs; look for exceptions from PiecesMap/PeersMap/GeneralTab. Turn off the massive logging in PiecesMap to see the real errors.
Inspect a live heartbeat detail payload for the failing torrent (log in useTorrentDetail on receipt). Check presence of pieceStates, peers, trackers, files, hash.
If General tab crashes, guard against stub detail: only render tabs when torrent.hash and torrent.state are truthy, or delay render until the first real detail arrives.
Targeted Hardening (minimal code touch)

In TorrentDetails wrapper, gate tab rendering on a “detailReady” predicate (e.g., has hash and state), or skip render until heartbeat delivers a full detail.
In PiecesMap/PeersMap, short-circuit when required data is missing and remove console spam; avoid drawing when container height is 0.
In Trackers reannounce flow, surface a clear timeout message (already returned) and optionally fall back to a one-shot detail refetch to unblock the UI.
If you want, I can add guards around the tabs to wait for a complete detail payload, stub-safe defaults in GeneralTab, and suppress the noisy canvas logging to stabilize the views.


Here’s a focused triage checklist and guidance to get those tabs functional without touching code yet.

Immediate Debug Focus (data vs render)

Verify detail payload: log the heartbeat detail for the active torrent. Confirm it includes hash, pieceStates, pieceAvailability, pieceCount, pieceSize, peers, trackers, files. If these are missing, UI failures are data-driven, not rendering bugs.
Check hash consistency: if summary hash ≠ detail hash, heartbeat will drop cached detail, leaving tabs half-populated. Compare torrent.hash from summary vs detail.
Validate peer list: if peers array is empty/missing, the peers table shows nothing; map may still render but with no nodes—confirm the adapter actually returns peers.
Pieces Map (defrag-like grid)

Rendering is canvas-based and ultra-sensitive to layout height. If the container height collapses (flex child without min height), the canvas gets 0–2px height, draws off-screen, or scales incorrectly.
The component draws even when data is missing, fabricating a fallback grid; that hides the root cause. Before drawing, ensure the container has a stable height and that pieceStates length ≥ pieceCount.
The heavy console logs can mask real errors; turn them off during debugging to see exceptions.
If you want a defrag-like array: enforce a fixed rows/columns grid and disable the “focus distortion” logic (currently warps rows). That requires code, but the design intent should be a non-warped, evenly spaced grid with a visible border and legend.
Peer Radar Map

It’s SVG-based with polar math and mode switching. If the containing panel clips (overflow hidden, small height), the circle will be cut. Ensure the panel has enough height; otherwise, everything is crammed to the top-left.
Missing peers → nothing drawn. Confirm peers array has entries; if it does and still invisible, check for NaNs in positions (bad rate/progress values).
The “HUD” label area sits above the map; if the map is half-hidden, the flex/Panel sizing is likely collapsing—inspect the container height.
Peers List (no IP/hosts)

The list expects peer.address and peer.clientName; if the adapter omits them, rows render as blanks or “peer-#”. Verify backend data.
Context menu position uses panel bounds; if fileContextMenuWidth or margins are off, the menu might appear off-screen, hiding feedback.
File Tree (DEFAULT label, wrong sizing, no size shown)

Tree renders a priority badge using text labels like “Default”; that appears under filenames and looks louder than the name. If files lack length, size shows as - or is omitted. Verify files carry length and index.
Typography is unbalanced because badge styles are heavier than filenames; visually, the badge should be subdued (design note).
If paths are unparsed or indexes missing, tree grouping breaks; confirm filenames are well-formed and indexes unique.
Trackers (empty / partial)

Reannounce flow waits for heartbeat detail changes; if none arrive, UI looks frozen. Check tracker payloads and server times; missing times lead to --:-- counts.
Speed Tab (empty chart)

Depends on getSpeedHistory adapter support. If not implemented, the chart stays empty. Confirm adapter returns arrays.
Layout Issues (hidden/half drawn)

Many panels rely on flex-1 min-h-0 + nested PanelGroup. If any ancestor has overflow-hidden plus no explicit height, inner canvases get starved. Inspect the DOM to ensure the inspector pane has a real height and the tab body has padding but also a constrained, non-zero height.
Design/UX Adjustments (conceptual)

Pieces: switch to a fixed grid, clear border, legend, and a minimal tooltip; avoid distortion/animation for reliability. Use a visible fallback state (“No piece data yet”) instead of fabricating a grid.
Peers: if empty, show a loud empty state with diagnostics (e.g., “No peers reported; check tracker/PEX/DHT”), not just blank.
File tree: de-emphasize priority badges (monochrome, small), move size to the right in tabular nums, and shrink badges below filename weight.
Trackers: pin header, add a clear “Last announce/Next announce” and show errors inline per row to signal missing data.
What to check next

The adapter’s detail shape in normalizeTorrentDetail (services/rpc/normalizers.ts) to see if fields are dropped.
The actual heartbeat detail payload as it lands in useTorrentDetail to confirm data presence.
The computed layout heights of the inspector panels; ensure tab bodies have stable heights and no 0px canvases.
If you confirm data is present and heights are adequate yet still broken, I can outline specific guardrails and rendering fallbacks (no code now) to stabilize each tab.
Key deeper findings and leads for your broken tabs:

Data Normalization (root cause candidates)

normalizeTorrentDetail returns peers/trackers/files/pieceStates directly from Transmission detail. If the backend omits them, the UI will be empty. No synthetic defaults are added.
Files: zipFileEntities warns and truncates if files and fileStats lengths differ. Missing fileStats → warning + length/priority may be undefined; progress is undefined if bytesCompleted/length are missing. Names are sanitized to file-<index> when empty—this is why you see “DEFAULT/unknown” labels under names.
Trackers: seeder/leecher counts become NaN if missing (intentional, to signal “unknown”). UI code doesn’t display NaN nicely—shows blanks.
Peers: rateToClient/rateToPeer become NaN if missing. UI sorts by speed; NaNs can break ordering and render as blanks/“peer-#” if address/clientName are empty.
State/Hash: Summary hash uses hashString || id; detail uses same. If the backend sends different hashes per call, heartbeat will drop detail and the tabs stay in stub state.
Why pieces map is invisible/off-screen

It draws even when data is missing, but it relies on container height. If the flex chain gives it 0–2px height, canvas size collapses and everything draws off-screen. Console spam in PiecesMap hides real errors.
If pieceStates length < pieceCount, it fabricates done/missing from progress, so you won’t notice missing data but layout may still be 0 height.
Why peers map is half-drawn/hidden

It sits in a PanelGroup with another panel above; if the lower panel is small or overflow-hidden, the SVG is clipped. No guard against NaN positions: NaN from rates can zero out coordinates.
Empty peers array → nothing drawn. If peers exist but positions are NaN, nodes land at (0,0) and may be hidden.
Why peers list shows no IP/hosts

Missing peer.address or clientName from backend results in blank labels. NaN speeds render as “-”. Check the detail payload; the UI can’t invent them.
Context menu positions depend on layout metrics; if row height token is off, list may misalign.
Why file tree looks “DEFAULT / large badge” and no sizes

Sizes come from length; missing fileStats means length is undefined and size column renders “-” or nothing.
Priority badges use verbose labels (“Default”, “Do Not Download”) and heavier styling than filenames—by design here, but visually jarring. Also, if filename is missing, file-<index> appears; that’s the “unknown” you see.
Actionable inspection steps (no code)

Log the heartbeat detail payload on arrival (in useTorrentDetail callback) for a failing torrent. Confirm fields: pieceStates length, pieceCount, peers[], trackers[], files[]. Note any NaN/undefined.
Compare summary hash vs detail hash for the same torrent; mismatches cause cached detail to be dropped.
Inspect DOM layout for the inspector: ensure the tab body has a non-zero height, and canvases inherit a real height (not just flex without min-h). Check for overflow-hidden ancestors clipping the maps.
Check backend transmission/getTorrentDetails response directly (network tab) to see if files/peers/trackers data exist.
Design/UX ideas (conceptual, not code)

Pieces: switch to a fixed grid, visible border, legend; show an explicit empty/“no piece data” state instead of fabricating a grid. Avoid the distortion effect; it obscures the defrag-like view.
Peers: when empty, show a diagnostic card (“No peers reported; check trackers/PEX/DHT”). Clamp NaNs to “unknown” labels and still render a row with a placeholder IP text.
File tree: de-emphasize priority badges (smaller, monochrome), move size to right column with tabular numbers, and keep filename as the dominant text.
Trackers: display NaN counts as “unknown” instead of blanks; surface last announce errors inline.
Most likely blockers to fix first

Missing or inconsistent detail data (peers/pieceStates/fileStats) from the backend.
Zero-height/overflow clipping in the inspector panels starving canvases/SVG.
NaN propagation from normalizePeer/normalizeTracker into UI layout (speed sorting, coordinates).
Key remaining checks before calling it “done”:

Validate live detail payloads: Confirm pieceStates, pieceAvailability, pieceCount, files, fileStats, peers, trackers, and hash consistency. If any are missing or hashes differ between summary and detail, UI breakage is data-driven.
Layout sanity: Ensure the inspector body and tab panels have non-zero height and aren’t clipped by overflow-hidden; canvases/SVGs need real space.
NaN hygiene: Peers/tracker normalization emits NaN for missing speeds/counts; that can yield empty labels and bad ordering. Consider how the UI should display “unknown” (design decision).
Priority badges and filenames: Decide on visual hierarchy (filenames dominant, badges subdued) and whether missing filenames should stay file-<index> or surface a clearer placeholder.


---- plan ---

Details Stabilization Plan (ordered by impact / net gain)

Data Integrity Gate (blocker)
Action: Log and verify heartbeat detail payload for the active torrent: hash, pieceStates (len), pieceCount, pieceSize, pieceAvailability, files+fileStats, peers, trackers.
Goal: Ensure summary hash == detail hash; if not, heartbeat drops detail. Ensure backend actually sends peers/trackers/files/states; otherwise UI cannot render.
Outcome: Confirms whether fixes are data- or UI-side.
Layout/Height Sanity for Inspector (blocker)
Action: Inspect DOM for the inspector pane. Ensure its body and each tab container have non-zero height and are not clipped by overflow-hidden; canvases/SVGs need real space.
Goal: Prevent pieces map and peer radar from rendering off-screen or at 0px height.
Outcome: Maps and tables become visible once given real space.
Graceful Empty/Unknown States (high gain)
Pieces: If pieceStates or pieceCount missing/zero, show “No piece data yet” instead of drawing a distorted/fallback grid.
Peers: If peers empty, show a diagnostic empty state (“No peers reported; check trackers/PEX/DHT”).
Trackers: Display “unknown” for NaN counts; show last announce errors inline.
Files: If length missing, show “unknown size”; if name missing, show “(unnamed file <index>)” with subdued styling.
NaN/Bad-Value Hygiene (high gain)
Peers: Treat NaN rates as 0 for layout and show “–”/“unknown” labels; ensure polar coordinates never receive NaN.
Trackers: Treat NaN seeder/leecher counts as “unknown,” not blank; avoid arithmetic on NaN in countdowns.
File tree: Ensure length missing doesn’t break size column; priority badges do not dominate the filename.
Pieces Map Simplification (medium gain)
UX intent: Show a defrag-like grid.
Action: Disable/soften distortion; enforce fixed grid and visible border/legend. Only draw when data is present and container height is valid; otherwise render empty-state.
Outcome: Predictable, legible grid rather than off-screen warped canvas.
Peer Radar Readability (medium gain)
Ensure sufficient height; avoid clipping by ancestor overflow.
Clamp radial aperture and positions; fall back to “instrument off” with a clear empty state if peers are absent.
Keep hover/context feedback secondary to the list.
Tracker Reannounce Feedback (medium gain)
If reannounce waits for heartbeat detail change, show a progress/timeout message and, on timeout, allow a manual “refresh detail” to unblock UX.
File Tree Visual Hierarchy (medium gain)
De-emphasize priority badges (smaller, monochrome); keep filename dominant; show size in tabular numbers to the right; use lighter label weight for badges.
Speed History Fallback (optional)
If getSpeedHistory missing, show a clear “Speed history unavailable for this engine” instead of an empty chart.
Persistent Tab State Validation (optional)
Ensure tab key persistence doesn’t restore into a tab with no data; if selected tab lacks data, auto-switch to General with a toast/hint.
Diagnostics Toggle (optional, low risk)
Add a dev-only flag to show raw detail payload snapshot in the inspector for quick verification during QA.
