# Recovery UX — Engineer Checklist (Synced)

Canonical role: Implementation/QA checklist for Recovery UX.
Companion docs:

- [TinyTorrent_Recovery_UX_Specification.md](TinyTorrent_Recovery_UX_Specification.md)
- [Recovery UX — Final Acceptance Specification (Post-Implementation).md](Recovery%20UX%20%E2%80%94%20Final%20Acceptance%20Specification%20(Post-Implementation).md)

## 1. Recovery Authority + Convergence

* [ ] Exactly one Recovery Gate exists.
* [ ] Row actions, context menu, navbar resume/start, and details actions all call the same gate.
* [ ] UI does not sequence recovery engine operations directly.

---

## 2. Closed Outcome Model

* [ ] Gate emits only:
  * `AUTO_RECOVERED`
  * `AUTO_IN_PROGRESS`
  * `NEEDS_USER_DECISION`
  * `BLOCKED`
  * `CANCELLED`
* [ ] No overlapping flags or dual-state combinations (for example, resolved + decision-required).
* [ ] Wrapper reinterpretation of gate outcomes is forbidden.

---

## 2a. Dedup Safety

* [ ] In-flight dedup may share work but cannot suppress terminal outcomes.
* [ ] If shared in-flight flow resolves to `NEEDS_USER_DECISION`, `BLOCKED`, or `AUTO_RECOVERED`, UI observes transition exactly once.
* [ ] “Already in progress” is never treated as a final outcome.

---

## 3. Escalation Window (User-Initiated Actions)

For `Resume`, `Download missing`, `Set location`:

* [ ] Deterministic automatic recovery starts immediately.
* [ ] `AUTO_IN_PROGRESS` is emitted with visible recovering state.
* [ ] Bounded escalation timer starts (400–700ms).
* [ ] At timer expiry:
  * recovery complete → `AUTO_RECOVERED`
  * meaningful choice exists → `NEEDS_USER_DECISION`
  * no actionable choice → `BLOCKED`
* [ ] Immediate certainty exception works (known decision-required can emit `NEEDS_USER_DECISION` before timer expiry).

---

## 3a. Outcome Emission Rules

* [ ] Exactly one outcome is emitted per recovery cycle.
* [ ] Only `AUTO_IN_PROGRESS` is non-terminal.
* [ ] `AUTO_IN_PROGRESS` eventually terminates to one of:
  * `AUTO_RECOVERED`
  * `NEEDS_USER_DECISION`
  * `BLOCKED`
  * `CANCELLED`
* [ ] Wrapper cannot reinterpret gate outcome.
* [ ] UI mapping is centralized in exactly one location.

---

## 4. Ask-User Boundary

* [ ] User is asked only when no deterministic safe action exists.
* [ ] Deterministic actions are attempted first:
  * `dataGap` + same path → reprobe
  * likely `volumeLoss` → wait/retry
  * safe `pathLoss` recreation → auto recreate
  * `accessDenied` → one retry before escalation
* [ ] Escalation triggers are explicit (ambiguity, unsafe default, repeated deterministic failure).

---

## 5. Modal Discipline

* [ ] Decision modal opens only for `NEEDS_USER_DECISION`.
* [ ] `BLOCKED` does not open a decision modal.
* [ ] If no real user choice is present, modal is not shown.
* [ ] Modal does not auto-open from passive startup/background polling.
* [ ] While modal is open, reprobe continues.
* [ ] If same torrent raises another `NEEDS_USER_DECISION`:
  * same root cause → update current modal
  * different root cause → queue
* [ ] If issue self-resolves while modal is open: shows brief resolved state, then **must** auto-close (non-negotiable).

---

## 5a. Persistent Recovery & Non-Silent Progress (All Recovery Errors)

Applies to missing files, path/volume loss, permission denied, disk full, and unknown/unclassified recovery states.

### Deterministic-first (before any modal)

* [ ] For any recovery-relevant error, best safe deterministic recovery is attempted automatically before requesting user input.
* [ ] No modal opens before deterministic attempts are evaluated unless certainty indicates a user decision is immediately required.

### Persistent retry (no silent stall)

If progress may become possible later:

* [ ] System continues retrying automatically with bounded backoff.
* [ ] Retry cadence is bounded and jittered (non-CPU-spiky):
  * [ ] Uses `timers.recovery.retry_cooldown_ms` as minimum per-fingerprint delay between retry attempts.
  * [ ] Applies bounded backoff up to a max (for example, `5–10×` cooldown) with small jitter (±`10–20%`) to avoid synchronized retry spikes.
  * [ ] No tight loops: a retry attempt never immediately schedules another attempt without awaiting cooldown.
* [ ] Only one retry loop per torrent fingerprint is active.
* [ ] Retry loop never blocks the UI thread.
* [ ] UI shows a persistent, truthful state while retrying (“Waiting…”, “Retrying…”, “Recovering…”).
* [ ] UI remains interactive while retrying.
* [ ] No recovery path can enter invisible inactivity.

Retry work is cheap:

* [ ] A retry attempt is availability probe + reclassification only (no verify storms).
* [ ] Verify/recheck is guarded and rate-limited by the anti-loop verify guard.

### Automatic continuation

* [ ] When conditions become valid again, recovery resumes automatically.
* [ ] UI shows an observable transition (“Detected…”, “Resuming…”).
* [ ] No extra user interaction is required unless a real decision exists.

`BLOCKED` does not imply “permanent failure” detection:

* [ ] If recovery remains unsuccessful after bounded deterministic attempts, gate may transition to `BLOCKED`.
* [ ] Even in `BLOCKED`, system still performs periodic low-frequency re-evaluation (should be tied to `timers.recovery.poll_interval_ms` or slower internal cadence).

### Modal escalation boundary

* [ ] Transient retrying does not cause modal escalation.
* [ ] Modal opens only when a meaningful user decision exists and no safe deterministic default exists (or certainty makes waiting pointless).

---

## 6. Observable Change Guarantee (500ms)

* [ ] Within 500ms of user recovery intent, at least one occurs:
  * torrent state change
  * recovering indicator
  * modal open
  * toast
  * progress badge update
* [ ] Silent outcomes are treated as failures.

---

## 6a. Outcome → UI Mapping Contract

* [ ] `AUTO_IN_PROGRESS` → recovering indicator.
* [ ] `AUTO_RECOVERED` → refresh + success state.
* [ ] `NEEDS_USER_DECISION` → open/update recovery modal.
* [ ] `BLOCKED` → actionable error UI.
* [ ] `CANCELLED` → no further action.
* [ ] No alternate code path triggers recovery UI.
* [ ] “Recovery UI” includes the decision modal + persistent recovery indicators; toasts are allowed as feedback but must still be emitted by the same centralized outcome→UI interpreter.

---

## 7. Truthfulness + Confidence

* [ ] Recovery state and confidence are explicit (`DataGap | PathLoss | VolumeLoss | AccessDenied`, `certain | likely | unknown`).
* [ ] Confidence `unknown` always maps to “Location unavailable”.
* [ ] UI never claims specific cause when confidence is `unknown`.

---

## 8. Lifecycle Reconciliation

After `AUTO_RECOVERED`:

* [ ] Torrent list/details are authoritatively refreshed.
* [ ] Selection/detail is validated (clear/close if torrent no longer exists).
* [ ] Success messaging is emitted only after engine-confirmed state transition.

---

## 9. Prohibited States

* [ ] Recovery logic outside the gate.
* [ ] Any path that suppresses `NEEDS_USER_DECISION`.
* [ ] Any silent no-op after user recovery action.
* [ ] Modal spam / cascade regressions.
* [ ] Action-cell expansion used as recovery error surface.

---

## Final Acceptance Rule

If any checkbox above is false:

> **The recovery UX is incorrect. Do not ship.**
