### **Recovery UX — Final Acceptance Specification (Post-Implementation)**

This is **not a plan**.
This is the **expected system state**.
If any item below is false, the implementation is wrong.

---

## 1. Global Invariants (Must Always Hold)

* **Exactly one recovery gate exists**
  * All recovery entry points funnel through it.
  * No UI component sequences recovery logic.
  * No prop-threaded recovery functions anywhere.

* **Recovery logic is deterministic**
  * Same input state → same actions → same outcome.
  * No race conditions, no duplicated engine calls.

* **Controller is authoritative**
  * UI never guesses.
  * UI never re-derives recovery state.
  * UI only reacts to gate outcomes.

* **User interruption is minimal**
  * Automatic safe recovery runs in background first.
  * Modal is shown only when user decision is genuinely required.
  * No modal cascade.

---

## 2. Recovery Gate Contract

### Entry

All of the following **must** call the same gate:

* Row inline actions (Download / Retry / Locate)
* Context menu actions
* Navbar Resume / Start
* Details / General tab recovery actions

### Deduplication

* **In-flight Locking:** If a recovery promise is already pending for this torrent ID, return it.
* **State Locking:** Do not run logic if torrent is currently transitioning (e.g., `CHECK_WAIT`).

### Retry Semantics

* `Retry` = **availability probe only**
  * No verify, No resume, No set-location.
  * Only re-classifies state + confidence.

### Free-Space Probe

* If free-space probing is unavailable (network/RPC down):
  * Gate returns **blocking outcome** (e.g. `needsModal` or error toast).
  * Silent continuation is forbidden.

### Ask User Boundary (Hard)

* Ask user only for unresolved path/permission decisions.
* Do not ask user for transient disruptions that self-heal during reprobe.
* User-triggered actions (`Resume`, `Set location`, `Download missing`) may open modal only if auto-recovery still cannot proceed.

---

## 3. State + Confidence Guarantees

Every recovery run produces:

* **State:** `DataGap | PathLoss | VolumeLoss | AccessDenied`
* **Confidence:** `certain | likely | unknown`

### Confidence Rules (Hard)

* `unknown` → UI text **must** be *“Location unavailable”*
* Never claim “Drive disconnected” or “Folder missing” unless confidence ≠ `unknown`.

---

## 4. Engine Sequencing Rules (Minimal Correct Sequence)

**Trigger:** Any `setTorrentLocation` OR any `Resume/Download` recovery action.

### 1. Verification Decision

* **Force Verify:** Default for S1 (Data Gap) or S4 (Access).
* **Skip Verify (Optimization):** Allowed **only** if:
  * State is S2 (Path Loss) AND
  * Mode is Local (Authoritative) AND
  * Folder is empty (`missingBytes == expectedBytes`).

### 2. Execution Sequence

1. **If Verifying:**
    * Send `torrent-verify`.
    * **Watch** until torrent leaves `CHECK / CHECK_WAIT`.
    * **Timeout:** If watcher > 30s, abort sequence, return `handled` (UI shows "Still verifying...").
2. **Resume:**
    * Send `torrent-start` (only if verification succeeded or was skipped).

### 3. Anti-Loop Guard (Crucial)

* If verify completes and `leftUntilDone` is unchanged:
  * Do **not** verify again in this session.
  * Promote to **S1 Data Gap (certain)**.

---

## 5. Post-Location Behavior

* `setTorrentLocation` is **never** the final step.
* It always triggers the **Minimal Correct Sequence** (Section 4).

---

## 6. UI Outcome Mapping (Single Source)

Gate outcomes map **once**, centrally:

| Gate Outcome | UI Effect |
| :--- | :--- |
| `handled` | Toast + **Lifecycle Reconciliation** (see Sec 10) |
| `needsModal` | Open recovery modal |
| `cancelled` | No-op (User closed modal) |
| `noop` | **Forbidden** if silent (must explain why, e.g., "Waiting") |

---

## 7. Modal Rules (Hard Stop Only)

* Modal appears **only** when:
  * User action requires a decision.
  * Gate returns `needsModal`.
* Modal never appears automatically from background polling/startup.
* Modal never offers “Verify”.

### Modal Background Recovery Contract

* While modal is open, recovery reprobe continues in background.
* If issue self-resolves while modal is open:
  * show resolved status with countdown
  * auto-close modal after countdown delay
* Default auto-close delay is configuration-driven.

---

## 8. Test Coverage Expectations

Unit tests **exist and pass** for:

* In-flight deduplication (calling twice returns same promise).
* Retry-only reprobe (does not trigger engine start).
* Post-location minimal sequence.
* Verify watcher + anti-loop guard.

---

## 9. Prohibited States (Must Not Exist)

* Any recovery logic outside the gate.
* Any UI sequencing engine actions.
* Any verify loop without anti-loop guard.
* **Silent Failure:** A user action resulting in no visible change.
* **Visual Noise Regression:** Expanding action cells for rare recovery failures.

---

## 10. Lifecycle Reconciliation (Non-Negotiable)

After any Gate outcome of `handled`:

1. **Authoritative Refresh:**
    * The torrent list/details must be re-fetched or re-validated immediately.
    * Do not rely on optimistic UI updates.

2. **Selection Safety:**
    * If the specific Torrent ID no longer exists (e.g. removed during recovery):
        * Details panel **must close**.
        * Selection **must clear**.

3. **Action Truthfulness:**
    * Toasts like "Download Resumed" must only fire **after** the engine confirms the state change.

---

## 11. User-Visible Progress Guarantee

**The 500ms Rule:**
After any recovery-related user action, the UI must present an observable state change within 500ms.

* **Observable Changes:** Row status text update, Inline micro-status, Modal open, Toast, or Engine State change.
* **Requirement:** If the Gate returns `handled` but engine state hasn't changed yet, the UI **must** surface a truthful waiting message (e.g. “Checking location…”).

---

## 12. Definition of Done (QA Checklist)

This system is **correct** iff:

* [ ] **Convergence:** All recovery paths (Row, Navbar, Menu) hit the same Gate.
* [ ] **Liveness:** Clicking **Resume** on a missing-files torrent produces a visible change < 500 ms.
* [ ] **No Silent Retry:** Clicking **Retry** never results in a silent no-op.
* [ ] **Truthful "Unknown":** Unplugging a drive (RPC fail) shows "Location unavailable," NOT "Drive disconnected."
* [ ] **Anti-Loop:** A torrent with corrupt data does not verify -> start -> verify -> start forever.
* [ ] **Reconciliation:** Changing location via "Locate" immediately updates the Details panel path.
* [ ] **Safety:** If recovery logic removes a torrent (rare edge case), the app does not crash or show a ghost row.
* [ ] **No Modal Spam:** multiple failing torrents do not cause cascading modal popups.
* [ ] **Self-Resolve Close:** if modal issue resolves in background, modal shows countdown and closes automatically.
* [ ] **UI Stability:** recovery UI does not expand table action cell layout.

**Anything less is incomplete.**
