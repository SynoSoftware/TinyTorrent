### **Recovery UX — Final Acceptance Specification (Post-Implementation, Synced)**

Canonical role: Acceptance contract for Recovery UX implementation.
Companion docs:

- [TinyTorrent_Recovery_UX_Specification.md](TinyTorrent_Recovery_UX_Specification.md)
- [Recovery UX — Engineer Checklist.md](Recovery%20UX%20%E2%80%94%20Engineer%20Checklist.md)

This document is the acceptance target for the production recovery UX model.
If any item below is false, the implementation is incorrect.

---

## 1. Global Invariants (Must Always Hold)

* **Exactly one recovery gate exists**
  * All recovery entry points funnel through it.
  * No UI component sequences recovery logic.
  * UI only reacts to gate outcomes.

* **Recovery outcomes are closed and mutually exclusive**
  * `AUTO_RECOVERED`
  * `AUTO_IN_PROGRESS`
  * `NEEDS_USER_DECISION`
  * `BLOCKED`
  * `CANCELLED`

* **Wrapper reinterpretation is forbidden**
  * No boolean overlays like “resolved + decision-required”.
  * No early-return that suppresses `NEEDS_USER_DECISION`.

---

## 2. Recovery Gate Contract

### Entry Convergence

All of the following must call the same gate:

* Row inline actions (Download / Retry / Locate)
* Context menu actions
* Navbar Resume / Start
* Details / General tab recovery actions

### Determinism + Deduplication

* Same input state → same gate outcome.
* In-flight calls for same torrent fingerprint return the same promise.
* Race-dependent branching is forbidden.
* Recovery deduplication may share in-flight work but must not suppress terminal outcomes.
* If in-flight work transitions to `NEEDS_USER_DECISION`, `BLOCKED`, or `AUTO_RECOVERED`, UI observes that transition exactly once.
* “Already in progress” is not a valid final outcome.

### Retry Semantics

* `Retry` = availability probe + reclassification only.
* No implicit verify/start/set-location sequence from retry-only intent.

---

## 3. Escalation Policy (Hard)

For user-initiated actions (`Resume`, `Download missing`, `Set location`):

1. Immediately attempt deterministic auto recovery.
2. Emit `AUTO_IN_PROGRESS` and show visible recovering state.
3. Start bounded escalation timer (400–700ms).

When the timer expires:

* If recovery completed → emit `AUTO_RECOVERED`.
* If a meaningful user decision exists → emit `NEEDS_USER_DECISION`.
* If no actionable decision exists → emit `BLOCKED`.

If gate certainty exists from the start (for example, arbitration conflict or multiple valid paths), `NEEDS_USER_DECISION` may be emitted immediately without waiting for timer expiry.

Escalation timing is mandatory to avoid both modal spam and frozen-feeling UI.

Low-friction acceptance rule:

* `BLOCKED` without meaningful decision must not open a decision modal.
* It must surface lightweight guidance (toast + persistent inline status).

---

## 4. Recovery Outcome Emission Rules

* Exactly one outcome is emitted per recovery cycle.
* Outcomes are terminal except `AUTO_IN_PROGRESS`.
* `AUTO_IN_PROGRESS` eventually transitions to one of:

  * `AUTO_RECOVERED`
  * `NEEDS_USER_DECISION`
  * `BLOCKED`
  * `CANCELLED`
* `CANCELLED` produces at most one cancellation feedback emission, then no further recovery noise.
* Wrapper reinterpretation or override of gate outcomes is forbidden.
* UI mapping occurs in exactly one place.

---

## 5. Ask-User Boundary (Hard)

Ask the user **only** when no deterministic safe action exists.

### Typical deterministic actions (Transmission-backed)

* `dataGap` + same path → auto reprobe
* `volumeLoss` likely transient → auto wait/retry
* `pathLoss` + safe directory recreate supported → auto recreate
* `accessDenied` → single automatic retry before escalation

### Escalate to `NEEDS_USER_DECISION` only if

* multiple valid location choices exist
* path is ambiguous
* default action is unsafe
* deterministic actions repeatedly fail

---

## 5a. Persistent Recovery & Non-Silent Progress (Hard Contract)

This contract applies to **all recovery-relevant errors**, including but not limited to:

* missing files
* path/volume loss
* permission denied / access denied
* disk full
* unknown/unclassified recovery states

If any item below is false, the implementation is incorrect.

### Deterministic-first (before any modal)

* System attempts the best safe deterministic recovery action automatically before requesting user input.
* Deterministic actions are minimal and correctness-preserving.
* No recovery modal opens before deterministic attempts are evaluated unless certainty indicates a user decision is immediately required.

### Persistent retry (no silent stall)

When progress may become possible later:

* System continues retrying automatically using bounded backoff.
* Retry cadence is bounded and jittered (non-CPU-spiky):
  * Uses `timers.recovery.retry_cooldown_ms` as the minimum per-fingerprint delay between attempts.
  * Applies bounded backoff up to a max (for example, `5–10×` cooldown) with small jitter (±`10–20%`) to avoid synchronized retry spikes.
  * No tight loops: a retry attempt never immediately schedules another attempt without awaiting cooldown.
* Only one retry loop per torrent fingerprint is active.
* Retry never blocks the UI thread.

Retry work is cheap:

* A retry attempt is availability probe + reclassification only (no verify storms).
* Verify/recheck is guarded and rate-limited by the anti-loop verify guard.

### Pause ownership + cancellation gating (hard)

Paused retry eligibility is derived from explicit ownership state, not from raw paused status:

* `pauseOrigin: "user" | "recovery" | null`
* `cancelled: boolean`

Paused retry eligibility must satisfy:

* `actionableError && pauseOrigin === "recovery" && !cancelled`

Reset semantics are required:

* successful resume clears recovery pause ownership
* explicit user pause clears/overrides recovery pause ownership
* recovery cancellation clears recovery pause ownership and marks cancelled
* non-error running state clears stale recovery pause ownership

While retrying:

* UI displays a persistent, truthful status state (for example: “Waiting…”, “Retrying…”, “Recovering…”).
* UI remains interactive.
* Recovery never enters a silent inactive state.

### Automatic continuation (no extra user steps)

If conditions become valid again (drive remounted, space freed, permissions corrected):

* System automatically resumes deterministic recovery.
* UI shows an observable transition (for example: “Detected…”, “Resuming…”).
* No additional user interaction is required unless a real decision exists.

The system cannot reliably determine “permanent failure” vs “temporarily unresolved.”
If recovery remains unsuccessful after bounded deterministic attempts, the system may transition to `BLOCKED` but must still allow periodic low-frequency re-evaluation.

### Modal escalation boundary

* Transient retrying must not cause modal escalation.
* Modal may open only when a meaningful user decision exists AND either:
  * no safe deterministic default exists, or
  * certainty makes waiting pointless.

### Modal auto-close (non-negotiable)

If a recovery modal is open and the underlying issue resolves automatically:

* Modal shows a brief resolved state, then
* Modal auto-closes.

A recovery modal is a decision UI, not a status monitor.

---

## 6. Outcome → UI Mapping (Single Location Only)

| Gate Outcome | UI Effect |
| :--- | :--- |
| `AUTO_RECOVERED` | Reconcile data, then success/progress messaging |
| `AUTO_IN_PROGRESS` | Show recovering state immediately |
| `NEEDS_USER_DECISION` | Open (or update) recovery decision modal |
| `BLOCKED` | Show actionable blocked error surface (default non-modal toast + inline status), no decision modal |
| `CANCELLED` | At-most-once cancellation feedback, then no-op |

No other code path may trigger recovery UI.

“Recovery UI” here includes the decision modal and any persistent recovery indicators; toasts are allowed as feedback but must be emitted by the same centralized outcome→UI interpreter (single source still holds).

---

## 7. Modal Contract (Decision UI Only)

* Modal appears only for `NEEDS_USER_DECISION`.
* Modal is never a status channel for in-progress-only states.
* Modal never appears from passive startup/background polling alone.
* Modal never offers “Verify” as a generic escape hatch.

### While modal is open

* Background reprobe continues.
* If same torrent produces another `NEEDS_USER_DECISION`:
  * same root cause → update current modal content
  * different root cause → queue
* If issue self-resolves, show resolved countdown and **must** auto-close (non-negotiable).

---

## 8. BLOCKED vs NEEDS_USER_DECISION

* `NEEDS_USER_DECISION` → at least one meaningful user choice exists.
* `BLOCKED` → no meaningful choice exists; show actionable error UI, not a decision modal.

If no real choice can be presented, do not open a modal.

---

## 8a. Bulk Feedback Noise Guard

For bulk resume/recovery intents:

* success/in-progress feedback is aggregated at bulk scope
* per-torrent success toasts from internal recovery paths are suppressed
* per-torrent blocked/error visibility remains on row/details surfaces

---

## 9. User-Visible Progress Guarantee

Within 500ms of user recovery intent, at least one must occur:

* torrent state change
* recovering indicator
* modal open
* toast
* progress badge update

Silent outcomes are acceptance failures.

---

## 10. Lifecycle Reconciliation (Non-Negotiable)

After `AUTO_RECOVERED`:

1. Re-fetch authoritative torrent data.
2. Validate selection/detail safety (close detail if torrent disappeared).
3. Emit success messaging only after engine-confirmed transition.

---

## 11. Prohibited States

* Recovery logic outside the gate.
* UI sequencing engine operations directly.
* Any outcome model with overlap/combinable flags.
* Any path where `NEEDS_USER_DECISION` can be suppressed by wrapper early exit.
* Modal spam or action-cell expansion regressions.
* Silent no-op after user recovery action.
* Any recoverable error that enters invisible inactivity (no persistent waiting/retrying state).
* Multiple retry loops concurrently running for the same torrent fingerprint.
* Any path where retry blocks UI interaction.
* Any recovery modal remaining open after automatic recovery completes.

---

## 12. Definition of Done

* [ ] All recovery entry points converge through one gate.
* [ ] Gate emits only closed outcomes (`AUTO_RECOVERED | AUTO_IN_PROGRESS | NEEDS_USER_DECISION | BLOCKED | CANCELLED`).
* [ ] Dedup shares in-flight work without suppressing terminal transitions.
* [ ] `NEEDS_USER_DECISION` always opens/updates modal (never suppressed).
* [ ] Escalation timer behavior matches contract (expiry branches + immediate certainty exception).
* [ ] Outcome emission rules are enforced (`AUTO_IN_PROGRESS` must terminate to a final outcome).
* [ ] Outcome→UI mapping is centralized in one location only.
* [ ] 500ms observable-change guarantee is met in all recovery intents.
* [ ] `BLOCKED` never opens decision modal.
* [ ] Same-torrent modal concurrency behavior (update vs queue) follows root-cause rule.
* [ ] Unknown confidence copy remains truthful (“Location unavailable”).
* [ ] Persistent retry + non-silent progress contract holds for all recovery-relevant errors (including disk full / unknown states).
* [ ] If a modal is open and auto-recovery succeeds, modal shows resolved briefly and auto-closes (non-negotiable).

**Anything less is incomplete.**
