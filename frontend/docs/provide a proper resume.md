--------------
analise the current behaviour of the eror statuses of the torrents and how do we recover. compare it with how the qbittorrent behaves. propose a plan to upgrade. no code changes


------------

Analysis — Current TinyTorrent Error Status & Recovery

Source of truth: TinyTorrent uses the Transmission-style RPC via engine-adapter/RPC layer; torrent run-state and error info are normalized and surfaced by the services/rpc stack (heartbeat + normalizers → UI).
Status model (observed behavior pattern):
Errors are presented as a single status flag (e.g., "error", "stalled", "paused") with limited structured reason text.
UI uses optimistic updates: user actions reflect immediately while RPC call proceeds; backend validation happens asynchronously.
Recovery is primarily manual: users must perform actions such as retrying the torrent (resume/force start), recheck, or remove & re-add. Some automatic low-level retries are delegated to the backend daemon (Transmission) rather than the UI.
Heartbeat & detection:
A centralized heartbeat polls the daemon. Transient failures are detectable on the next heartbeat and the torrent status is updated then.
No robust client-side retry/backoff policy: once an error appears, TinyTorrent mostly waits for server state or user action.
Observability & messages:
Error messages are short and sometimes generic; there's limited categorization (tracker vs disk vs network vs metadata vs piece IO).
No per-torrent retry counters, no automatic escalation, and limited user guidance in the UI (e.g., suggested actions or cause-specific CTAs).
How qBittorrent Handles Errors & Recovery (summary of key behaviors)

Rich error taxonomy: distinguishes tracker errors, local disk errors (permission, space), peer errors, connection/timeouts, metadata errors, and piece verification failures. Each has meaningful messages and timestamps.
Automatic retries & backoff:
Tracker failures trigger scheduled re-announces per tracker retry rules with exponential backoff handled by libtorrent.
Transient network/peer errors are retried automatically; the client doesn't require user intervention for many temporary failures.
Automatic recovery actions:
On temporary tracker/network errors, qBittorrent retries and resumes normal operation when conditions improve.
For disk or persistent errors (e.g., missing files, permission denied), the client marks torrent as errored and provides explicit user actions (recheck, relocate data, set new path).
User guidance & controls:
UI surfaces actionable controls per error type (Reannounce, Force re-check, Set new save path, Retry tracker).
qBittorrent exposes logs + timestamps for each tracker error and scheduler info (next reannounce).
Telemetry & counters: maintains retry counters, last-failure timestamps, and next-scheduled-at metadata to avoid noisy immediate retries and to show users the recovery timeline.
Gap Analysis (TinyTorrent vs qBittorrent)

TinyTorrent delegates most retry semantics to backend and lacks:
granular error categories surfaced to UI,
client-side retry/backoff policies and scheduling,
per-torrent recovery automation for common transient errors,
clear actionable suggestions and dedicated CTAs per error type,
structured telemetry (retry counts, last failure time, next retry).
Strengths TinyTorrent likely already has:
centralized heartbeat model (good single source of truth),
optimistic UI and fast feedback,
Type-safety and validation pipeline (Zod) in services.
Prioritized Plan to Upgrade Error Status & Recovery (no code changes in this proposal)

Quick wins (low effort, high user impact)

Introduce a structured error taxonomy in the product spec (types: tracker, network, disk, metadata, piece-io, permission, unknown). Map existing daemon messages into these categories during normalization.
Surface clear, context-specific CTA buttons in the UI per error type: Reannounce, Force Recheck, Retry, Open Folder / Fix Path, Remove & Readd.
Add visible timestamps and a short explanatory hint for the last error and recommended next step.
Medium-term improvements (moderate effort, requires state/adapter changes)

Implement client-side retry scheduler (in engine-adapter):
For tracker/network errors: schedule reannounce attempts with exponential backoff and a configurable max attempts; store nextAttemptAt & attemptCount per torrent.
For transient peer/timeouts: attempt automatic reconnection/resume with bounded retries.
For persistent errors (disk, permission): immediately mark as blocked and surface remediation steps — do NOT auto-retry.
Add per-torrent metadata fields: errorType, errorMessage, lastErrorAt, retryCount, nextRetryAt, autoRecoveryState.
UI should show small status badges and hover/tap detail that explain retry schedule and whether recovery is in-progress or paused.
Long-term / robust strategy (larger changes, testing, telemetry)

Implement a Recovery State Machine:
States: OK, TransientError(retries left), Recovering, RequiresUserAction, Fatal.
Define transitions, side-effects (e.g., schedule re-check, reannounce).
Integrate with heartbeat so the heartbeat drives scheduled retry triggers (to keep single heartbeat source).
Add server/adapter handshake to detect backend capabilities (Transmission vs TinyTorrent/libtorrent) and adapt behavior: prefer server push or let server handle advanced retry when available.
Persistent storage of retry metadata so restarts preserve schedule and counters.
UX & Observability

Add an "Error Details" panel with logs for that torrent (tracker responses, last reannounce HTTP code, disk errors).
Add telemetry counters and metrics: per-torrent retry counts, mean time-to-recover, failure distributions (tracker vs disk).
Expose a small "Recovery Log" for QA and power users to inspect what automated retries did.
Tests & QA (required before rollout)

Unit tests for normalization: ensure daemon messages map correctly into error taxonomy.
Integration tests for retry/backoff scheduler (simulate transient failures and ensure backoff, eventual success or fade to user action).
E2E scenarios: disk full, missing files, tracker unreachable, intermittent network, and fixed network (verify auto-recover).
Regression tests to ensure optimistic UI and heartbeat still behave smoothly.
Operational & Policy Recommendations

Default policy: auto-retry only for transient errors (tracker, network, timeouts). Never auto-retry for disk/permission or severe metadata corruption.
Provide user-configurable policy knobs: max retries, backoff base/duration, whether to auto-retry trackers, and whether to auto-start on recovery.
Respect AGENTS.md rules: all new UI state must use semantic tokens and the token pipeline; no magic numbers; use existing heartbeat rather than adding separate intervals.
Add clear PR notes listing semantic roles used (p-panel/gap-stage etc.) if UI changes follow this plan.
Estimated Effort & Phasing

Phase 1 (Quick wins): 1–2 weeks — spec, UI CTAs, normalization mapping, small UI tweaks.
Phase 2 (Medium): 2–4 weeks — adapter state fields, scheduler, UI integration, basic tests.
Phase 3 (Long-term): 3–6 weeks — recovery FSM, persistence, telemetry, extensive E2E testing.
Verification checklist (what to validate when implementing)

Error taxonomy correctly classifies >95% of daemon messages in the wild.
Auto-retry triggers only for transient classes and obeys exponential backoff.
UI shows next retry time, retry count, and correct suggested CTAs.
Persistent errors do not trigger auto-retry and show clear remediation steps.
Heartbeat remains single source for scheduling; no duplicated intervals.
No new numeric literals or banned Tailwind utilities introduced to UI (follow AGENTS.md token pipeline).
Next steps I can take (if you want me to continue)

Expand the error taxonomy into a concrete mapping table from Transmission daemon messages → standardized errorType values.
Draft the UI microcopy and CTA placements for each error type.
Produce a test matrix and example JSON shapes for the new per-torrent metadata.


-------------------------------


Mostly accurate, with two corrections:

1. **Transmission already has a real error taxonomy — you’re under-crediting it.**
   Transmission’s RPC exposes `error` + `errorString` per torrent, where `error` is explicitly categorized (OK / tracker warning / tracker error / local error) and `errorString` carries the message. ([GitHub][1])
   So: if TinyTorrent feels “single flag + generic text”, that’s likely your **normalization + UI** collapsing detail, not Transmission lacking it.

2. **qBittorrent’s retry/backoff behavior is not uniformly “smart exponential backoff at the UI level.”**

* Libtorrent has tracker retry/backoff mechanics (it maintains retry intervals; the backoff behavior is configurable/observable in libtorrent contexts). ([GitHub][2])
* But qBittorrent also has client-specific behaviors/quirks; e.g., there are reports that after a tracker error it may wait a fixed long time (e.g., ~1 hour) before re-announcing in some cases. ([GitHub][3])
  So your statement “qB retries with exponential backoff” is directionally true at the engine level, but **not reliably true as a user-perceived behavior across all tracker failure modes**.

---

## What’s best to do next (big step toward uTorrent-level functionality, minimal bloat)

### Step 1 — Stop treating “error” as a single UI state

You already have the foundation (heartbeat + normalized entities). The fastest “real” leap is to standardize a **normalized error envelope** that preserves Transmission’s meaning instead of flattening it:

**Normalized per-torrent fields (conceptual, not code):**

* `errorClass`: `none | trackerWarning | trackerError | localError | unknown` (this maps cleanly to Transmission’s `error` categories). ([pythonhosted.org][4])
* `errorMessage`: from `errorString` (and/or derived message)
* `lastErrorAt`: timestamp (client-side if engine doesn’t provide it)
* `recoveryHint`: derived “what to do next”
* `recoveryActions[]`: a small set of valid actions for that class

Why this is the “big step”: it turns “red state” into **diagnosis + next action**, which is what uTorrent felt like when it was good (and what users interpret as “works”).

### Step 2 — Implement uTorrent-style recovery UX (not qBittorrent-style power UI)

uTorrent’s strength wasn’t deep telemetry; it was **one-click recovery**. Do that:

**Action mapping (minimal set):**

* Tracker error/warn → **Reannounce** (per tracker if you have it; otherwise per torrent)
* Local error “files missing / path” → **Set Location** + **Force Recheck** (these are the canonical fixes users expect in qB too). ([Reddit][5])
* Disk full / insufficient space → **Pause active downloads** + show required/free numbers (you already compute disk risk)
* Metadata/pieces inconsistent → **Force Recheck**
* Permission denied → **Open download folder** + show exact path and required permission

This is *high function, low bloat*: no logs panel required, no scheduler UI required, no endless settings.

### Step 3 — Add “tracker visibility” only to the extent uTorrent had it

Users need: last announce result + next announce time (or at least “waiting X minutes”).
qB users explicitly expect to understand announce timing; announce interval is tracker-driven, but the client must display schedule/status. ([Reddit][6])

Minimal UI: hover tooltip (or small details drawer) showing:

* last announce: success/fail + message
* next announce: time remaining
* per-tracker status if available

### Step 4 — Defer auto-retry schedulers unless your engine can’t do it

Because you’re currently using Transmission-style RPC: **Transmission/libtransmission already retries a lot of transient stuff internally**; your UI-layer scheduler risks fighting it and creating weirdness. Your earlier plan’s “client-side retry scheduler” is only worth it if:

* you run **your own daemon** that lacks these semantics, or
* the engine provides no retry scheduling and users get stuck

So the upgrade priority should be:
**(A) preserve and expose engine truth → (B) provide correct actions → (C) only then add automation where the engine truly doesn’t recover.**

---

## If you want qBittorrent-level “smarts” without qBittorrent bloat

Do exactly one thing beyond uTorrent:

**Add a tiny recovery state machine, but keep it internal and invisible.**
States like:

* `OK`
* `Transient (auto-waiting)` (tracker/network)
* `Needs action` (path, permission, disk full)
* `Verifying` (recheck in progress)

No “log view”, no “advanced options” panel. Just:

* correct badge color
* correct tooltip
* correct one-click action

---

## Your draft: what I’d change in it (conceptually)

* Replace “limited structured reason text” with “Transmission provides categorized `error` + `errorString`; we’re likely flattening it.” ([GitHub][1])
* Replace “qB retries exponentially” with “engine maintains retry scheduling/backoff, but user-visible behavior can include long waits after errors depending on conditions.” ([GitHub][3])

---

## The single best next deliverable

A **mapping table** from *current normalized fields + Transmission RPC fields* → **your new normalized error envelope + recovery actions**.

That table is the hinge that unlocks:

* accurate error badges
* correct tooltips
* uTorrent-grade one-click recovery
* future engine swap compatibility (TinyTorrent daemon vs Transmission)


--------------------

You are GPT-5 mini acting as a “Torrent Client Error/Recovery Spec Engineer” for TinyTorrent.

GOAL (next step deliverable):
Produce a concrete, implementation-ready SPEC (no code) that upgrades error handling toward uTorrent-level recovery UX without qBittorrent bloat by introducing a normalized per-torrent “Error Envelope” and a mapping table from engine/RPC fields → envelope → UI actions.

HARD CONSTRAINTS:
* NO CODE CHANGES in your output. Spec + tables only.
* Use the existing architecture: Transmission-style RPC via engine-adapter/services/rpc, heartbeat-driven updates, normalizers.
* Preserve/stop flattening engine truth: Transmission exposes categorized errors (error + errorString); do not reduce everything to a single “error” state.
* Keep it minimal: no log panels, no heavy telemetry UIs, no new background intervals beyond the heartbeat unless strictly necessary.
* Output must be actionable for implementation: exact field names, exact enum values, exact UI action list per class, and acceptance criteria.

INPUTS YOU MUST EXTRACT FROM THE REPO (search/read only):

1) Where torrent error state is surfaced today:
   * torrent entity shape(s): TorrentEntity / services/rpc/entities
   * any normalized “state”, “status”, “error”, “errorString”-like fields
   * any “missing_files”, “paused”, “isFinished”, “isGhost”, etc.
2) Where Transmission RPC is mapped/normalized:
   * engine-adapter mapping for Transmission fields
   * normalizers / heartbeat payload shaping
3) UI consumption points:
   * components that render torrent status/errors (table rows, detail tabs, tooltips)
   * any existing action buttons (resume, recheck, remove, reannounce if present)

DELIVERABLE STRUCTURE (exact):
A) Current behavior summary (1 page max)

* What fields exist today, where they come from, and where detail gets lost.
* Identify the “flattening points” (e.g., normalizer collapsing error categories).

B) Proposed “Error Envelope” (spec)

* Add a new normalized object on each torrent (or equivalent shape) with:
  * errorClass: enum
  * errorMessage: string | null
  * lastErrorAt: number | null (ms epoch)
  * recoveryState: enum (minimal)
  * retryCount: number | null (optional; only if already available or trivial)
  * nextRetryAt: number | null (optional; only if engine can provide or trivial)
  * recoveryActions: enum[] (small set)
* Define EXACT enum values:
     errorClass = none | trackerWarning | trackerError | localError | diskFull | permissionDenied | missingFiles | metadata | unknown
     recoveryState = ok | transientWaiting | needsUserAction | verifying | blocked
     recoveryActions = reannounce | forceRecheck | resume | pause | changeLocation | openFolder | removeReadd

C) Mapping Table (the main artifact)

* Table columns:
     Source engine (Transmission / TinyTorrent / Unknown)
     Source fields (e.g., rpc.error, rpc.errorString, state, leftUntilDone, downloadDirFreeSpace, etc.)
     Detection rule (precise boolean logic)
     errorClass
     recoveryState
     Primary CTA (single)
     Secondary CTA(s) (0–2)
     User-facing tooltip template variables (keys only, no prose)
* Must include at least these scenarios:
     1) tracker warning vs tracker error
     2) disk full / insufficient space to complete active torrents
     3) permission denied
     4) missing files / bad path
     5) stalled/no peers (NOT an error; classify separately)
     6) metadata/verification needed
     7) offline/transport disconnected (NOT per-torrent; but describe how UI should avoid stale “active” errors)

D) Minimal UX plan (uTorrent-level, not qBittorrent bloat)

* Exactly where the CTA appears (row, detail panel, context menu).
* How to keep UI non-noisy (badge rules + tooltip rules).
* What NOT to build (explicit exclusions to avoid bloat).

E) Acceptance Criteria + Test Matrix (no code)

* 10–15 test cases with:
     Setup → expected envelope → expected CTA(s) → expected badge/tone.
* Include: tracker unreachable then recovers; disk becomes free; path fixed; permissions fixed; transport disconnect/reconnect.

OUTPUT QUALITY BAR:
* Be ruthless about minimizing surface area while increasing “recovery clarity”.
* Do not invent engine fields: if repo doesn’t provide something, mark it as “not available” and propose a fallback rule.
* Use repo-derived names and paths wherever possible.
* Keep language implementation-oriented (keys, enums, rules), not narrative.

START NOW:
* First: list the files you inspected (paths only).
* Then: deliver A–E exactly in order.
-------------------------------

Files inspected:

types.ts
schemas.ts
rpc-base.ts
normalizers.ts
entities.ts
engine-adapter.ts
ColumnDefinitions.tsx
A) Current behavior summary (1 page max)

Where fields exist today:
Source RPC schema/types: TransmissionTorrent in types.ts exposes error (number) and errorString (string). TransmissionTorrentTracker exposes per-tracker fields like lastAnnounceSucceeded and lastAnnounceResult.
Zod parsing: schemas.ts parses error / errorString and preserves them in the normalized payloads.
Normalization: normalizers.ts maps RPC -> TorrentEntity via normalizeTorrent(). It preserves error and errorString on the normalized entity as error and errorString. State derivation uses hasRpcError() and isMissingFilesError() and returns either "missing_files" or "error" as the UI state. The derive flow is:
If error !== 0 → if narrow string matches (e.g., "no data found", "no such file", "not found") → state "missing_files" else "error".
Else other derived states (stalled, downloading, etc.)
UI consumption: ColumnDefinitions.tsx renders torrent.state (enum from entities.ts) and uses torrent.errorString for tooltip/title only; there is no structured envelope beyond error and errorString. CTAs are the standard resume/pause/verify/remove; there is no dedicated per-error primary action like reannounce surfaced in the row status chip.
Where detail gets lost / flattening points:
Transmission already provides categorized integers in error and detailed per-tracker results; the normalizer collapses every non-zero error into either "missing_files" (narrow pattern) or a generic "error" state. That is the primary flattening: error numeric categories are used only to detect "has error" and not to produce a richer normalized envelope.
Per-tracker information (lastAnnounceResult, lastAnnounceSucceeded, lastAnnounceTime) is normalized but not synthesized into a per-torrent recovery/action model. The UI surface shows errorString as tooltip but not actionable advice.
There is no per-torrent retry metadata (retryCount, nextRetryAt, lastErrorAt) in normalized entities; heartbeat is single source but not leveraged to drive a UI-visible retry schedule.
B) Proposed “Error Envelope” (spec)
Add a normalized object on each torrent entity (extend TorrentEntity) named errorEnvelope with these exact fields:

errorEnvelope: {
errorClass: "none" | "trackerWarning" | "trackerError" | "localError" | "diskFull" | "permissionDenied" | "missingFiles" | "metadata" | "unknown"
errorMessage: string | null
lastErrorAt: number | null // ms epoch (client-side set if engine doesn't provide)
recoveryState: "ok" | "transientWaiting" | "needsUserAction" | "verifying" | "blocked"
retryCount?: number | null // optional: only set if adapter can provide or trivial to maintain
nextRetryAt?: number | null // optional: epoch ms if engine provides or adapter schedules
recoveryActions: Array<"reannounce" | "forceRecheck" | "resume" | "pause" | "changeLocation" | "openFolder" | "removeReadd">
}
Notes:

Field names must be used verbatim in implementation (errorEnvelope and the keys above).
errorMessage derives from errorString or synthesized messages from per-tracker results. If errorString is empty, set errorMessage to null.
lastErrorAt should be set when error first becomes non-zero or when a new non-equivalent errorMessage arrives; if engine supplies timestamps, prefer them, otherwise set client-side from heartbeat time.
recoveryState is the minimal recovery FSM visible to UI; adapters should set transientWaiting when auto-retry is scheduled/in-progress and needsUserAction when persistence (disk/permission/missing files) requires human remediation.
C) Mapping Table (engine RPC → envelope)
Format: Source field(s) → Detection rule (boolean logic) → errorClass → recoveryState → Primary CTA → Secondary CTA(s) → Tooltip template keys

Tracker warning vs tracker error
Source fields:
TransmissionTorrent.error (from RPC): numeric values as Transmission uses: 0 = OK, 1 = tracker warning, 2 = tracker error, 3 = local error (see normalizers comment).
Per-tracker: trackers[].lastAnnounceSucceeded (bool), trackers[].lastAnnounceResult (string), trackers[].lastAnnounceTime (number)
Detection:
If torrent.error === 1 OR any tracker lastAnnounceSucceeded === false && lastAnnounceResult non-empty and lastAnnounceTime within last X heartbeats → trackerWarning.
If torrent.error === 2 → trackerError.
Map:
errorClass: trackerWarning (for 1 or non-fatal tracker failures) or trackerError (for 2 / repeated fails).
recoveryState: transientWaiting if recent and engine/trackers indicate scheduled reannounce; needsUserAction if lastAnnounceResult contains permanent errors (e.g., "403 Forbidden", "404 Not Found") or repetitive failures (>= configured threshold).
Primary CTA: reannounce
Secondary CTAs: openFolder (rare), removeReadd (if tracker permanently gone)
Tooltip keys: { lastAnnounceResult, lastAnnounceTime, nextAnnounceIn } — (nextAnnounceIn only if adapter exposes nextRetryAt)
Disk full / insufficient space to complete active torrents
Source fields:
leftUntilDone and sizeWhenDone from RPC; optional engine free space queries: TransmissionFreeSpace (via adapter.checkFreeSpace) or session-wide free space telemetry.
Detection:
If adapter provides checkFreeSpace(downloadDir) and freeBytes < leftUntilDone OR engine session telemetry reports insufficient space → diskFull.
If leftUntilDone > 0 and free space < leftUntilDone → diskFull.
Map:
errorClass: diskFull
recoveryState: needsUserAction
Primary CTA: pause (or changeLocation if UI offers)
Secondary CTAs: changeLocation, openFolder
Tooltip keys: { freeBytes, requiredBytes, downloadDir }
Permission denied (filesystem permission)
Source fields:
errorString contains patterns "permission denied", "access is denied" (case-insensitive), or adapter reports permissionDenied in some file operations.
Detection:
If torrent.error === 3 (local error) AND errorString contains "permission" or adapter/system call returns permissionDenied.
Map:
errorClass: permissionDenied
recoveryState: needsUserAction
Primary CTA: openFolder
Secondary CTAs: changeLocation, forceRecheck
Tooltip keys: { downloadDir, errorMessage }
Missing files / bad path
Source fields:
torrent.error === 3 AND errorString patterns: "no data found", "no such file", "not found", "file missing".
Detection:
If isMissingFilesError (existing normalizers.isMissingFilesError() logic) → missingFiles.
Map:
errorClass: missingFiles
recoveryState: needsUserAction
Primary CTA: changeLocation (or openFolder to show expected path)
Secondary CTAs: forceRecheck, removeReadd (if user confirms)
Tooltip keys: { expectedPath, lastErrorAt, errorMessage }
Metadata / pieces inconsistent / verification required
Source fields:
status values indicating checking or recheck progress; errorString containing "bad hash" or "corrupt" patterns; RPC fields for piece states in detail.
Detection:
If status → checking OR errorString mentions "corrupt" or piece verification failure OR user triggered verify in-flight → metadata.
Map:
errorClass: metadata
recoveryState: verifying (if verify in progress) or needsUserAction (if corrupted)
Primary CTA: forceRecheck
Secondary CTAs: removeReadd
Tooltip keys: { verificationProgress, lastVerifyAt }
Offline/transport disconnected (not per-torrent)
Source fields:
Heartbeat result indicates RPC connection error or adapter status RpcStatus = "error"; torrent list may still show previous states.
Detection:
If global RPC connectivity is down, do not interpret unchanged per-torrent error as new; set UI to show stale indicator.
Map:
errorClass: keep existing errorClass per last known state; UI should not set needsUserAction for per-torrent errors until heartbeat confirms persistence.
recoveryState: transientWaiting globally; UI should show global banner (not per-torrent CTA).
Primary CTA (global): none per torrent; global Reconnect in top-level status bar.
Tooltip keys: { lastHeartbeatAt }
Stalled / no peers (NOT an error)
Source fields:
status derived to stalled in normalizer; rateDownload === 0, peersConnected === 0.
Detection:
Not an error: set errorEnvelope.errorClass = none and recoveryState = ok. Show stalled visual as before.
Map:
Primary CTA: resume or reannounce optional (but not necessary by default)
Tooltip keys: { peersConnected, lastActiveAt }
Fallback / unknown rules

If RPC error is missing or unknown numeric value: set errorClass = unknown, recoveryState = needsUserAction if errorString non-empty else transientWaiting.
If adapter can supply engine-specific retry metadata (e.g., libtorrent next announce time), populate nextRetryAt and set recoveryState = transientWaiting.
D) Minimal UX plan (uTorrent-level, not qB bloat)

CTA placement (exact):
Row-level: primary action exposed in the row context menu & overflow actions (three-dot menu). Also show a one-button inline CTA only for the most common recoverable class:
If errorEnvelope.recoveryActions includes reannounce → show a compact action button visible on hover in the status column: small Reannounce icon button.
If errorEnvelope.recoveryActions includes forceRecheck → show Recheck in the details panel primary area and in the context menu only (not in row inline unless user expands).
Details panel (GeneralTab.tsx): show errorEnvelope summary at top with:
error badge (color derived from errorClass mapping to existing StatusColor),
errorMessage,
lastErrorAt timestamp,
Primary CTA as a large button (semantic HeroUI variant="shadow" per AGENTS.md).
Context menu: all recoveryActions listed, with primary action shown first.
Badge rules + noise control:
Keep current state badge behavior; do not show an extra modal/log by default.
Add a subtle ! indicator on status chip when recoveryState === needsUserAction.
For transientWaiting, show a muted spinner on the chip and tooltip like auto-retry scheduled.
Tooltips use the template keys enumerated in mapping table; no heavy logs or panels by default.
What NOT to build:
No large log panel, no complex scheduler UI, and no new background timers beyond using heartbeat to drive scheduled checks. Do not implement a global per-torrent scheduler UI unless engine lacks retry behavior (see below).
Engine-first policy:
Always prefer to expose engine-provided metadata (engine capabilities via engine-adapter.getExtendedCapabilities() and TransmissionTorrent fields). Only synthesize nextRetryAt if engine does not provide and adapter can compute safely using heartbeat; otherwise set nextRetryAt = null.
E) Acceptance Criteria + Test Matrix (concise cases)
For each case: Setup → Expected errorEnvelope → CTA(s) visible → badge/tone

Tracker transient failure (single announce fail)
Setup: torrent.error === 1 or one tracker lastAnnounceSucceeded === false, short-lived.
Expect: errorClass=trackerWarning, recoveryState=transientWaiting, recoveryActions=[reannounce], primary CTA: inline Reannounce (hover) + context menu; badge = warning with spinner/text "waiting".
Tracker persistent permanent failure (403)
Setup: lastAnnounceResult contains "403" or "403 Forbidden", repeated failures > threshold.
Expect: errorClass=trackerError, recoveryState=needsUserAction, recoveryActions=[reannounce, removeReadd], primary CTA: context Reannounce, badge = danger; tooltip includes lastAnnounceResult and lastAnnounceTime.
Disk full detected by adapter
Setup: free space < leftUntilDone.
Expect: errorClass=diskFull, recoveryState=needsUserAction, recoveryActions=[pause, changeLocation, openFolder], primary CTA: Pause (row/context), details show required/free bytes.
Missing files (bad path)
Setup: torrent.error === 3, errorString contains "no data found" or "no such file".
Expect: errorClass=missingFiles, recoveryState=needsUserAction, recoveryActions=[changeLocation, forceRecheck], primary CTA: Change Location in details + context menu.
Permission denied on write
Setup: errorString contains "permission denied" or adapter returns permissionDenied.
Expect: errorClass=permissionDenied, recoveryState=needsUserAction, recoveryActions=[openFolder, changeLocation], primary CTA: Open Folder.
Metadata corruption / verify needed
Setup: verify in progress or errorString includes "corrupt" / "hash mismatch".
Expect: errorClass=metadata, recoveryState=verifying (if verify started) else needsUserAction, recoveryActions=[forceRecheck], primary CTA: Recheck.
Stalled (zero peers) — not an error
Setup: state derived to stalled, error === 0
Expect: errorEnvelope.errorClass=none, recoveryState=ok, no error CTAs; status badge remains stalled (secondary).
RPC disconnected / stale view
Setup: global heartbeat returns error; torrents list unchanged.
Expect: UI shows global banner; per-torrent envelope unchanged; per-torrent CTAs disabled until heartbeat confirms state. RecoveryState for torrents should not flip to needsUserAction during disconnected window.
Engine reports error === 2 (tracker error)
Setup: RPC error === 2
Expect: errorClass=trackerError, recoveryState=transientWaiting or needsUserAction per repeated fails; CTA=reannounce.
Torrent leftUntilDone 0 but missing files
Setup: torrent percent done <1 but leftUntilDone === 0 (edge case), errorString indicates missing.
Expect: missingFiles, recoveryState=needsUserAction, CTA changeLocation.
Auto-recovery success after transient tracker fail
Setup: initial trackerWarning → adapter/engine reannounce succeeds on next heartbeat.
Expect: errorEnvelope transitions to none and UI clears spinner; lastErrorAt preserved and UI shows brief success flash (optional).
Repair (force recheck) resolves metadata
Setup: user triggers forceRecheck; subsequent heartbeat shows verificationProgress then seeding/downloading.
Expect: recoveryState transitions verifying → ok; errorClass becomes none.
Unknown errorString, engine numeric unknown
Setup: engine returns unknown error numeric or unrecognized string.
Expect: errorClass=unknown, recoveryState=needsUserAction if errorString non-empty else transientWaiting, CTA=removeReadd (in context menu) and reannounce if trackers present.
Acceptance pass criteria (implementation must meet):

Normalizer produces errorEnvelope for every torrent within one heartbeat after an error is visible.
UI shows the primary CTA in either row hover (for reannounce) or detail panel for forceRecheck/changeLocation.
No new background intervals other than heartbeat; scheduled retries (if synthesized) must be driven by heartbeat logic and persisted only if adapter explicitly supports persistence.
All tooltip template keys referenced must map to normalized entity fields (e.g., lastAnnounceResult, lastErrorAt, freeBytes).
If adapter lacks checkFreeSpace, diskFull detection must be marked as not available in the envelope (nextRetryAt = null), and the system must fall back to needsUserAction with wording "free space unknown".
Final implementation notes / handoff guidance

Minimal wiring required:
Update normalizeTorrent() in normalizers.ts to synthesize errorEnvelope using torrent.error, torrent.errorString, and detail.trackers (when available). Do not remove existing error/errorString fields — add errorEnvelope as new structured field.
Use engine-adapter optional methods (checkFreeSpace, getExtendedCapabilities) when available to enrich envelope fields (freeBytes, nextRetryAt).
UI: add a small errorEnvelope consumer in ColumnDefinitions.tsx and GeneralTab to surface primary CTA and tooltip keys.
Preserve single-heartbeat design: use HeartbeatManager to set lastErrorAt and to drive any synthesized nextRetryAt checks; do not create independent per-torrent intervals.
If nextRetryAt is synthesized by the client, persist it only if necessary and keep default null; prefer engine-provided schedule.

(prompt not sent - too detailed)
----------------------------------------------


You are GPT-5-mini.

Your task is NOT to change code.

Your task is to READ and REPORT FACTS.

Objective:
Determine which recovery actions and engine signals actually exist today so we can safely wire error recovery without fabricating behavior.

Rules:

Do NOT modify any code.
Do NOT propose new APIs.
Do NOT assume Transmission semantics unless confirmed in code comments or types.
If something is unclear, say “unclear” and point to the file/line that blocks certainty.
You must report ONLY the following, each with file path + line range:

What numeric values of torrent.error are handled explicitly today (if any).
Whether per-tracker data is available at the UI layer (trackers array, announce result fields).
Which recovery actions are already implemented end-to-end (engine-adapter → UI):
reannounce
force recheck / verify
change location / relocate
open folder
Where the torrent “state” is flattened (exact functions).
Whether any timestamp of last error or retry already exists anywhere.
Output format:

Bullet list
Each bullet = confirmed fact OR explicitly marked “not found”
No recommendations
No code
No speculation
Start now.

----------

Numeric torrent.error values handled explicitly today: normalizers.ts [20-60] — shows the comment “Transmission error semantics: error: 0 = OK, 1/2 = tracker warning/error, 3 = local error”, hasRpcError (checks non-zero), and isMissingFilesError (checks torrent.error !== 3 / error === 3 logic).
File: normalizers.ts [20-60]

Per‑tracker data is available to the UI (trackers array + announce/result/time fields):

RPC schema defines tracker fields including lastAnnounceTime, lastAnnounceResult, lastAnnounceSucceeded: schemas.ts [148-172].
Transmission detail type includes trackers: TransmissionTorrentTracker[]: types.ts [70-110].
Normalizer maps tracker objects into UI entities (normalizeTracker / trackers: detail.trackers?.map(normalizeTracker)): normalizers.ts [170-188] and normalizers.ts [280-312].
UI consumes per-tracker timestamps/results (Trackers tab uses lastAnnounceTime, computes next announce): TrackersTab.tsx [80-116].
Recovery actions already implemented (engine-adapter → rpc-base → UI) — evidence per action:

reannounce: engine-adapter declaration forceTrackerReannounce?: engine-adapter.ts [56-72]; rpc implementation forceTrackerReannounce (calls torrent-reannounce): rpc-base.ts [1140-1176]; UI handler wiring handleForceTrackerReannounce: useDetailControls.ts [160-176]; button binding in GeneralTab: GeneralTab.tsx [280-304].
force recheck / verify: engine-adapter declares verify(ids): engine-adapter.ts [44-56]; rpc implementation verifyTorrents / torrent-verify: rpc-base.ts [1186-1200] and wrapper verify(ids) calling it: rpc-base.ts [1088-1120]; UI action maps recheck → torrentClient.verify(ids): useTorrentActions.ts [24-40].
change location / relocate: engine-adapter declares setTorrentLocation?: engine-adapter.ts [56-72]; rpc implementation setTorrentLocation (calls torrent-set-location): rpc-base.ts [1212-1236]; UI calls torrentClient.setTorrentLocation(...) during add/relocate flow: App.tsx [1080-1106].
open folder: engine-adapter exposes openPath? (implicit via adapter interface usage), rpc implementation openPath (uses NativeShell or system-open): rpc-base.ts [892-916]; UI handleOpenFolder calls torrentClient.openPath(targetPath): useTorrentActions.ts [80-108].
Where the torrent “state” is flattened (exact functions):

deriveTorrentState(...) performs error → state classification and stalled logic: normalizers.ts [60-120].
normalizeTorrent(torrent) calls normalizeStatus(...) and deriveTorrentState(...) and assigns state: derivedState on the normalized entity: normalizers.ts [220-236].
Timestamps / retry timestamps presence:

Per‑tracker timestamps (announce time) exist and are normalized/used: lastAnnounceTime present in RPC schema and tracker entity and used in UI: schemas.ts [148-156]; types.ts [70-110]; normalizers.ts [170-188]; TrackersTab.tsx [80-116].
Per‑torrent “last error” or “next retry” timestamp fields (e.g., lastErrorAt, nextRetryAt) are NOT present in the normalized torrent entity or RPC entity definitions — TorrentEntity includes error and errorString but no last-error/retry timestamp: entities.ts [1-120]; normalized torrent object includes error / errorString but does not synthesize a last-error timestamp: normalizers.ts [220-246] (no lastErrorAt/nextRetryAt field).
-------------


You are GPT-5-mini.

TASK
Upgrade TinyTorrent’s torrent error handling to support a structured per-torrent Error Envelope, aligned with the previously approved spec.

OBJECTIVE (NON-NEGOTIABLE)
After your change:

1) Every TorrentEntity exposes a new field named `errorEnvelope`.
2) `errorEnvelope` preserves engine truth and DOES NOT flatten or fabricate error causes.
3) Existing UI behavior MUST continue to work unchanged.
4) No new background timers, schedulers, or retry loops are introduced.
5) No new user-visible features are added beyond structured error representation.

SCOPE
* You may read any file needed.
* You may modify only what is required to add and populate `errorEnvelope`.
* You must not remove or rename existing fields (`error`, `errorString`, `state`, etc.).
* You must not invent engine semantics that are not already present in code.

ERROR ENVELOPE CONTRACT (MUST MATCH EXACTLY)
Each TorrentEntity must expose:

errorEnvelope: {
  errorClass: "none" | "trackerWarning" | "trackerError" | "localError" | "diskFull" | "permissionDenied" | "missingFiles" | "metadata" | "unknown";
  errorMessage: string | null;
  lastErrorAt: number | null;
  recoveryState: "ok" | "transientWaiting" | "needsUserAction" | "verifying" | "blocked";
  retryCount?: number | null;
  nextRetryAt?: number | null;
  recoveryActions: Array<"reannounce" | "forceRecheck" | "resume" | "pause" | "changeLocation" | "openFolder" | "removeReadd">;
}

TRUTH RULES
* Use ONLY information already available in the codebase.
* If you cannot confidently classify an error, use:
  errorClass = "unknown"
* If a recovery action is not already implemented end-to-end, DO NOT include it.
* lastErrorAt may be null if you cannot reliably derive it.

DELIVERABLES

1) Code changes implementing the above.
2) A short summary listing:
   * files changed
   * any assumptions you made (explicitly)
   * anything you could not implement due to missing information

You are allowed to make reasonable engineering decisions, but you are NOT allowed to invent behavior.

Proceed.
