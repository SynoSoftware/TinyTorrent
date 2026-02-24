# Torrent Missing Files - Recovery UX Specification (v2026.02)

Companion docs:

- [Recovery UX — Final Acceptance Specification (Post-Implementation).md](Recovery%20UX%20%E2%80%94%20Final%20Acceptance%20Specification%20(Post-Implementation).md)
- [Recovery UX — Engineer Checklist.md](Recovery%20UX%20%E2%80%94%20Engineer%20Checklist.md)
- [Recovery_Implementation_Directions.md](Recovery_Implementation_Directions.md) (non-normative)

## 1. Product Objective

TinyTorrent must prioritize download continuity:

* recover automatically whenever safe
* ask the user only when a real user choice is required
* never spam modals or expand row actions into visual noise
* stay truthful when confidence is low

---

## 2. Hard Invariants

* Exactly one recovery gate owns recovery decisions and sequencing.
* All recovery entry points converge into that gate.
* UI does not infer causes or run engine sequences directly.
* Recovery state transitions are derived from daemon/RPC truth only.
* Shell integration may assist user input (for example folder picker), but must not drive recovery state transitions.
* Recovery outcomes are closed and mutually exclusive:

	* `AUTO_RECOVERED`
	* `AUTO_IN_PROGRESS`
	* `NEEDS_USER_DECISION`
	* `BLOCKED`
	* `CANCELLED`

* No booleans, no combinations, no overlap, no wrapper reinterpretation.
* Recovery operations are deduplicated per torrent fingerprint while in flight.
* Recovery deduplication may share in-flight work but must not suppress terminal outcomes.

	If an in-flight recovery transitions to:

	* `NEEDS_USER_DECISION`
	* `BLOCKED`
	* `AUTO_RECOVERED`

	the UI must observe that transition exactly once.

	“Already in progress” is not a valid final outcome.

---

## 3. State and Confidence Model

Classification remains:

* `dataGap`
* `pathLoss`
* `volumeLoss`
* `accessDenied`

Other recovery-relevant errors (for example, disk-full or unknown/unclassified filesystem states) must still follow the hard contract in **§4a** (deterministic-first, persistent retry with non-silent progress, and correct modal escalation/auto-close) even when they cannot be mapped to a more specific classification.

Confidence remains:

* `certain`
* `likely`
* `unknown`

Copy contract:

* If confidence is `unknown`, use `Location unavailable`.
* Never claim `Drive disconnected` or `Folder missing` when confidence is `unknown`.

---

## 4. Ask User vs Auto-Recover Policy

### Must ask user

Must ask only when no deterministic safe action exists.

### Transmission-specific deterministic-first behavior

* `dataGap` + same path → auto reprobe
* `volumeLoss` likely transient → auto wait + retry
* `pathLoss` + same path → daemon probe/reclassify/retry (no host-side directory mutation)
* `accessDenied` → auto retry once before escalate

Escalate only if:

* multiple possible valid locations
* path ambiguity
* unsafe default
* repeated deterministic failure

### Must not ask user

* Transient volume/path disruptions that can self-heal via reprobe.
* Cases where automatic recovery succeeds after reprobe/retry.

Rule: background failures should not interrupt the user with a modal unless user input is truly required.

---

## 4a. Persistent Recovery & Non-Silent Progress (Hard Contract)

This contract applies to **all recovery-relevant errors**, not just path/volume loss.

Recovery-relevant errors include (but are not limited to):

* missing files
* path loss / volume loss
* permission denied / access denied
* disk full / out of space
* unknown or unclassified recovery states

### 1. Deterministic-First Recovery

For any recovery-relevant error:

* The system **must attempt the best safe deterministic recovery action automatically** before requesting user input.
* Deterministic actions must be minimal and correctness-preserving.
* Deterministic actions must be derived from daemon-visible truth; host shell state may not influence recovery transitions.
* No modal may open before deterministic attempts are evaluated unless certainty indicates a user decision is immediately required.

### 2. Persistent Retry (No Silent Stall)

If progress may become possible later:

* The system **must continue retrying automatically** using bounded backoff.
* Retry cadence must be bounded and jittered (non-CPU-spiky).
	* Use `timers.recovery.retry_cooldown_ms` as the **minimum** delay between retry attempts per torrent fingerprint.
	* Apply bounded backoff up to a max (for example, `5–10×` cooldown) with small jitter (±`10–20%`) to avoid thundering herds.
	* No tight loops: a retry attempt must never immediately schedule another attempt without awaiting the cooldown.
* Retry work must be cheap:
	* A retry attempt is an availability probe + reclassification only (no verify storms).
	* Verify/recheck must be guarded and rate-limited by the anti-loop verify guard.
* Only one retry loop per torrent fingerprint may be active; additional triggers subscribe to the same loop.
* Retry must never block the UI thread.

### Pause Ownership Contract (Hard)

Paused-state retry eligibility must not be inferred from torrent state alone.
Recovery must track explicit ownership:

* `pauseOrigin`: `user | recovery | null`
* `cancelled`: `boolean`

Paused retry eligibility is derived as:

* `actionableError && pauseOrigin === "recovery" && !cancelled`

This prevents unintended auto-resume after explicit user pause while still allowing recovery-owned paused sessions to continue safely.

Reset semantics are mandatory:

* clear recovery pause ownership when torrent successfully resumes
* clear recovery pause ownership when user explicitly pauses
* clear recovery pause ownership when user cancels recovery
* clear recovery pause ownership when torrent transitions to non-error running state

The system cannot know whether a condition is permanently impossible or just temporarily unresolved.
Persistent retry continues while progress remains plausibly possible.
If recovery remains unsuccessful after bounded deterministic attempts, the system must transition to `BLOCKED` while still allowing periodic low-frequency re-evaluation.

While retrying:

* UI **must display a persistent, truthful state** (for example: “Waiting…”, “Retrying…”, “Recovering…”).
* UI must remain interactive.
* Recovery may not enter a silent inactive state.

No recovery path may result in invisible inactivity.

### 3. Automatic Continuation

If conditions become valid again (for example, disk space freed, drive remounted, permissions corrected):

* The system **must automatically resume deterministic recovery**.
* UI must show an observable transition (for example: “Detected…”, “Resuming…”).
* No additional user interaction may be required unless a real decision exists.

### 4. Modal Escalation Boundary

A recovery modal may open only when:

* A meaningful user decision exists, and
* No safe deterministic default exists, or
* Certainty makes waiting pointless.

Transient retrying must not cause modal escalation.

### 5. Modal Auto-Close (Hard)

If a recovery modal is open and the underlying issue resolves automatically:

* The modal **must show a brief resolved state**, then
* The modal **must auto-close**.

A recovery modal is a decision UI, not a status monitor.

### 6. Acceptance Criteria

Implementation is incorrect if:

* A recoverable error results in silent inactivity.
* The UI shows no persistent state while retrying.
* A modal remains open after automatic recovery completes.
* A retry loop blocks UI interaction.
* Multiple retry loops run concurrently for the same torrent.

---

## 5. Escalation Policy (Hard)

For user-initiated actions (`Resume`, `Download missing`, `Set location`):

1. Immediately attempt deterministic auto recovery.
2. Emit `AUTO_IN_PROGRESS` and show visible recovering state.
3. Start bounded escalation timer (400–700ms).

When the timer expires:

* If recovery completed → emit `AUTO_RECOVERED`.
* If a meaningful user decision exists → emit `NEEDS_USER_DECISION`.
* If no actionable decision exists → emit `BLOCKED`.

If the gate is certain from the start that a user decision is required (e.g. arbitration conflict, multiple valid paths), it may emit `NEEDS_USER_DECISION` immediately without waiting for the timer.

This removes:

* modal spam
* fake “ask user” cases
* ambiguity between BLOCKED and NEEDS_USER_DECISION

Low-friction rule:

* `BLOCKED` without a meaningful decision must not open a recovery decision modal.
* Surface blocked guidance via lightweight feedback (toast + persistent inline state).

---

## 6. Recovery Outcome Emission Rules

* Exactly one outcome must be emitted per recovery cycle.
* Outcomes are terminal except `AUTO_IN_PROGRESS`.
* `AUTO_IN_PROGRESS` must eventually transition to one of:

  * `AUTO_RECOVERED`
  * `NEEDS_USER_DECISION`
  * `BLOCKED`
  * `CANCELLED`
* `CANCELLED` emits at most one user-visible cancellation feedback, then remains silent.
* No wrapper may reinterpret or override a gate outcome.
* UI mapping must occur in exactly one place.

---

## 7. Modal Behavior Contract

Modal is a hard-stop decision UI, not a status spam channel.

* One active recovery modal at a time.
* Additional recoveries queue; no modal cascade.
* While modal is open, background reprobe continues.
* If same torrent triggers another `NEEDS_USER_DECISION` while modal is open:
	* same root cause → update modal content
	* different root cause → queue
* If issue self-resolves while modal is open:
	* show a brief resolved state with countdown (`3s` default)
	* **must** auto-close modal after countdown (non-negotiable; modal is not a status monitor)
* No auto-open modal on app startup/background polling without user intent.

### BLOCKED vs NEEDS_USER_DECISION

* `NEEDS_USER_DECISION` → at least one meaningful user choice exists.
* `BLOCKED` → no meaningful choice exists; show actionable error UI, not a decision modal.
  Default surface is non-modal (toast + persistent inline status).

If you cannot present a real choice, you must not open a modal.

### Action surface discipline

* Keep row/table visually stable. Do not expand action cells to inject extra button stacks.
* Use compact signal + dedicated modal when user decision is required.

---

## 8. Outcome → UI Mapping (Single Location Only)

* `AUTO_IN_PROGRESS` → show recovering indicator
* `AUTO_RECOVERED` → refresh + success state
* `NEEDS_USER_DECISION` → open recovery modal
* `BLOCKED` → show actionable error UI
* `CANCELLED` → no further action

No other code path may trigger recovery UI.

“Recovery UI” here includes the decision modal and any persistent recovery indicators; toasts are allowed as feedback but must be emitted by the same centralized outcome→UI interpreter (single source still holds).

---

## 9. Observable Change Contract (500ms)

Within 500ms of user recovery action, at least one must occur:

* torrent state changes
* recovering indicator appears
* modal appears
* toast appears
* progress badge updates

Silent outcomes are invalid.

---

## 10. Set-Location Contract

Set-location must support both browse and manual workflows.

* Browse is preferred when available.
* Manual entry is required fallback when browse is unavailable or user requests manual mode.
* Browse is input convenience only; recovery classification/outcomes still come from daemon truth.
* Arbitration is explicit:
	* `acquired`
	* `already_owned`
	* `conflict`
* Outcomes are explicit:
	* `picked | manual_opened | cancelled | unsupported | conflict | failed`

After successful location update, recovery sequence must continue (location update is not terminal).

---

## 11. Sequencing Rules

* `Retry` means reprobe/re-evaluate availability. It is not a blind multi-step rewrite.
* Use minimal engine sequence required for correctness.
* Keep anti-loop verify guard active; verify/recheck must be rate-limited and must not repeat unboundedly when no progress is made.
* Refresh authoritative data after `AUTO_RECOVERED` before claiming success.

---

## 12. Recovery Timing and Configuration

Expose only high-value recovery timing knobs in configuration:

* `timers.recovery.poll_interval_ms`
* `timers.recovery.retry_cooldown_ms`
* `timers.recovery.modal_resolved_auto_close_delay_ms`

Micro-timings remain internal implementation constants to avoid user-facing configuration entropy.

### Retry timing semantics (Hard)

* `timers.recovery.retry_cooldown_ms` is the **minimum per-fingerprint delay** between retry attempts.
* Backoff and jitter are mandatory but remain internal constants:
	* bounded backoff up to a max multiplier (for example, `5–10×` cooldown)
	* small jitter (±`10–20%`) to avoid synchronized retry spikes
* No tight loops: retry attempts must not schedule immediate follow-up attempts without awaiting cooldown.
* A retry attempt is cheap (probe + reclassification only); verify/recheck is guarded by the anti-loop verify guard.

### `BLOCKED` does not mean “stop observing”

* If the gate transitions to `BLOCKED` after bounded deterministic attempts, the system must still perform periodic low-frequency re-evaluation.
* Low-frequency re-evaluation should be tied to `timers.recovery.poll_interval_ms` (or a slower internal cadence), and must remain non-CPU-spiky.
* Low-frequency re-evaluation must be at or slower than `timers.recovery.poll_interval_ms`, and must not schedule more frequently than `timers.recovery.retry_cooldown_ms`.

---

## 13. Multiple Concurrent Recovery Problems

Current behavior:

* single modal session
* queued follow-up recoveries
* no cascade

Future enhancement (optional, not default yet):

* grouped recovery inbox in a single modal (grouped by root cause/path/root drive)
* only if it improves clarity without increasing visual noise

---

## 14. Copy Baseline

Core strings:

* `Missing files`
* `Download missing`
* `Locate...`
* `Retry`
* `Waiting for drive...`
* `Location unavailable`
* `Drive detected`
* `Recovery completed. Closing in {{seconds}}s...`

---

## 14a. Bulk Feedback Noise Guard

For bulk recovery actions:

* show one aggregated progress feedback surface (for example, “Resuming {{count}} torrents…”)
* suppress per-torrent success toasts from recovery internals
* do not suppress per-torrent blocked/error visibility in row/detail status

---

## 15. Core Philosophy in One Paragraph

TinyTorrent should attempt deterministic recovery immediately and silently.
If recovery is ongoing, visibly indicate it.
Only if no safe deterministic path exists after a short bounded attempt should a modal appear.
The modal must represent a true user decision, never a status update.
All recovery outcomes must be mutually exclusive and centrally mapped to UI effects.

---

## 16. Definition of Done

* [ ] Resume/Start/context-row/details recovery actions all pass through the same gate.
* [ ] Unknown confidence never claims specific cause.
* [ ] Background transient recovery does not spam modals.
* [ ] Modal remains hard-stop only and auto-closes after self-resolve countdown.
* [ ] Recovery success is confirmed through refresh/state transition before success messaging.
* [ ] No action-cell expansion regression for recovery controls.
