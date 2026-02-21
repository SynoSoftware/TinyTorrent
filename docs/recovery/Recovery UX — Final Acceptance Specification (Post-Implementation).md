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

---

## 4. Recovery Outcome Emission Rules

* Exactly one outcome is emitted per recovery cycle.
* Outcomes are terminal except `AUTO_IN_PROGRESS`.
* `AUTO_IN_PROGRESS` eventually transitions to one of:

  * `AUTO_RECOVERED`
  * `NEEDS_USER_DECISION`
  * `BLOCKED`
  * `CANCELLED`
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

## 6. Outcome → UI Mapping (Single Location Only)

| Gate Outcome | UI Effect |
| :--- | :--- |
| `AUTO_RECOVERED` | Reconcile data, then success/progress messaging |
| `AUTO_IN_PROGRESS` | Show recovering state immediately |
| `NEEDS_USER_DECISION` | Open (or update) recovery decision modal |
| `BLOCKED` | Show actionable blocked error surface (toast/panel), no decision modal |
| `CANCELLED` | No-op / explicit cancellation state |

No other code path may trigger recovery UI.

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
* If issue self-resolves, show resolved countdown and auto-close.

---

## 8. BLOCKED vs NEEDS_USER_DECISION

* `NEEDS_USER_DECISION` → at least one meaningful user choice exists.
* `BLOCKED` → no meaningful choice exists; show actionable error UI, not a decision modal.

If no real choice can be presented, do not open a modal.

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

**Anything less is incomplete.**
