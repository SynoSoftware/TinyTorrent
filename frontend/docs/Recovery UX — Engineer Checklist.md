# Recovery UX — Engineer Checklist

## 1. Single Source of Truth

* [ ] **Exactly one Recovery Gate exists**

  * All recovery logic funnels through it.
  * No UI component sequences recovery steps.
  * No duplicated logic in rows, menus, navbar, or details.

* [ ] **No bypasses**

  * Row inline actions, context menu, navbar Resume/Start, details actions → same gate.
  * Any alternative entry path is a bug.

---

## 2. User-Intent → Observable Feedback (500 ms Rule)

* [ ] Every recovery-related user action produces **visible feedback < 500 ms**

  * Toast, inline micro-status, modal, or truthful waiting state.

* [ ] **Silent outcomes are forbidden**

  * “Retry” that does nothing visibly is a failure.
  * “Handled” without feedback is invalid.

---

## 3. Truthfulness & Confidence

* [ ] Every recovery run yields:

  * **State:** `DataGap | PathLoss | VolumeLoss | AccessDenied`
  * **Confidence:** `certain | likely | unknown`

* [ ] If confidence = `unknown`:

  * UI text **must** be exactly “Location unavailable”.
  * Never claim drive/path causes.

* [ ] UI never guesses.

  * No inferred causes.
  * No speculative copy.

---

## 4. Recovery Gate Contract

* [ ] Gate is **deterministic**

  * Same inputs → same outcome.
  * No race-dependent behavior.

* [ ] **In-flight deduplication**

  * Same torrent recovery called twice → same promise returned.

* [ ] **Retry semantics**

  * Retry = availability probe only.
  * No verify, no resume, no set-location.

---

## 5. Engine Sequencing (Minimal Correct Sequence)

* [ ] `setTorrentLocation` is **never terminal**

  * Always followed by minimal engine sequence.

* [ ] Verify rules enforced:

  * Force verify for S1 (DataGap) and S4 (Access).
  * Skip verify **only** in Local mode when all data absent and path is valid.

* [ ] **Anti-loop guard exists**

  * Verify that makes no progress is never re-run in the same session.

---

## 6. Modal Discipline

* [ ] Modal opens **only** when:

  * User decision is required, or
  * Gate returns `needsModal`.

* [ ] Modal never appears automatically.

* [ ] Modal **never** offers:

  * “Verify”
  * Free-text path input
  * Generic error messaging

---

## 7. UI Responsibility Boundaries

* [ ] UI reacts to gate outcomes only.

  * UI does not compute recovery state.
  * UI does not infer engine steps.

* [ ] Details panels are **informational only**

  * No primary recovery CTAs duplicated there.

---

## 8. Local vs Remote Truth

* [ ] Local mode is authoritative when available.

  * OS probes override RPC heuristics.

* [ ] Remote mode never claims certainty without proof.

  * Unknown stays unknown.

---

## 9. Lifecycle Reconciliation

After any successful recovery (`handled`):

* [ ] Torrent list/details are **authoritatively refreshed**

* [ ] Selection is validated

  * If torrent vanished → details close, selection clears.

* [ ] Success toasts fire **only after engine confirmation**

---

## 10. Prohibited States (Hard Failures)

* [ ] Any recovery logic outside the gate
* [ ] Any silent failure
* [ ] Any verify loop without anti-loop guard
* [ ] Any UI sequencing engine calls
* [ ] Any claim of cause without confidence ≠ `unknown`

---

## Final Acceptance Rule

If **any** checkbox above is false:

> **The recovery UX is incorrect. Do not ship.**

