### **Recovery UX — Final Acceptance Specification (Post-Implementation)**

This is **not a plan**.
This is the **expected system state**.
If any item below is false, the implementation is wrong.

---

## 1. Global Invariants (Must Always Hold)

* **Exactly one recovery gate exists**

  * All recovery entry points funnel through it
  * No UI component sequences recovery logic
  * No prop-threaded recovery functions anywhere

* **Recovery logic is deterministic**

  * Same input state → same actions → same outcome
  * No race conditions, no duplicated engine calls

* **Controller is authoritative**

  * UI never guesses
  * UI never re-derives recovery state
  * UI only reacts to gate outcomes

---

## 2. Recovery Gate Contract

### Entry

All of the following **must** call the same gate:

* Row inline actions (Download / Retry / Locate)
* Context menu actions
* Navbar Resume / Start
* Details / General tab recovery actions

### Deduplication

* Concurrent calls for the same torrent fingerprint:

  * Reuse the same in-flight promise
  * Never run verify / resume twice in parallel

### Retry Semantics

* `Retry` = **availability probe only**

  * No verify
  * No resume
  * No set-location
* Only re-classifies state + confidence

### Free-Space Probe

* If free-space probing is unavailable:

  * Gate returns **blocking outcome**
  * UI must surface a modal / message
  * Silent continuation is forbidden

---

## 3. State + Confidence Guarantees

Every recovery run produces:

* **State:** `DataGap | PathLoss | VolumeLoss | AccessDenied`
* **Confidence:** `certain | likely | unknown`

### Confidence Rules (Hard)

* `unknown` → UI text **must** be *“Location unavailable”*
* Never claim:

  * “Drive disconnected”
  * “Folder missing”
    unless confidence ≠ `unknown`

---

## 4. Engine Sequencing Rules

### Minimal Correct Sequence (RPC)

* After **any** `setTorrentLocation`:

  * Always run the minimal sequence
* Sequence:

  1. Decide verify vs start
  2. If verify:

     * Watch until torrent leaves `CHECK / CHECK_WAIT`
  3. Resume exactly once

### Anti-Loop Guard

* If verify completes and `leftUntilDone` is unchanged:

  * Do **not** verify again in this session
  * Promote to **DataGap (certain)**

### Timeout Handling

* If verify watcher times out:

  * Inline status: *“Still verifying…”*
  * Offer Retry / Locate
  * No forced modal

---

## 5. Post-Location Behavior

* `setTorrentLocation` is **never** the final step
* It always triggers:

  * Verify (if required)
  * Watcher
  * Resume
* Anti-loop state is updated during this flow

---

## 6. UI Outcome Mapping (Single Source)

Gate outcomes map **once**, centrally:

| Gate Outcome | UI Effect           |
| ------------ | ------------------- |
| `handled`    | Toast + refresh     |
| `needsModal` | Open recovery modal |
| `cancelled`  | No-op               |
| `noop`       | No-op               |

* No scattered toasts
* No duplicated refresh calls
* No UI-side branching

---

## 7. Modal Rules (Hard Stop Only)

* Modal appears **only** when:

  * User action requires a decision
  * Gate returns `needsModal`
* Modal never appears automatically
* Modal never offers “Verify”

---

## 8. Test Coverage Expectations

Unit tests **exist and pass** for:

* In-flight deduplication
* Retry-only reprobe
* Free-space unsupported blocking
* Post-location minimal sequence
* Verify watcher + anti-loop guard

Tests validate **behavior**, not intent.

---

## 9. Prohibited States (Must Not Exist)

* Any recovery logic outside the gate
* Any UI sequencing engine actions
* Any verify loop without anti-loop guard
* Any “Retry” that modifies state
* Any silent skip of missing probes

---


### Title

**User-Visible Progress Guarantee**

---



**After any recovery-related user action (Resume, Retry, Locate, Download missing), the UI must present an observable state change within 500 ms.**
An observable change is at least one of:
* Row status text changes
* Inline micro-status appears
* Modal opens
* Toast appears
* Torrent enters a visible engine state (CHECKING, DOWNLOADING, SEEDING)
If the recovery gate returns `handled` but the torrent engine state remains unchanged, the UI **must** surface a truthful waiting or unavailable message (e.g. “Checking location…”, “Waiting for drive…”, or “Location unavailable”).

**Silent success is forbidden.**

---

QA checklist (mandatory)

* [ ] Clicking **Resume** on a missing-files torrent produces a visible change within 500 ms.
* [ ] Clicking **Retry** never results in a silent no-op.
* [ ] If recovery performs no engine action, the UI still shows a truthful waiting/unavailable state.
* [ ] No recovery action can end in “handled” without a visible user-facing effect.

---



---

## 10. Definition of Done (Binary)

This system is **correct** iff:

* All recovery paths converge through one gate
* Engine calls are centralized
* UI is declarative and passive
* Confidence rules are never violated
* No race conditions exist
* Tests cover all hard paths
* No TODOs or “next steps” remain

**Anything less is incomplete.**
