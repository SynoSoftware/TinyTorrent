
# Torrent Missing Files — Recovery UX Specification (vFinal+)

## 1. Core UX Philosophy

* **Non-Accusatory:** Never blame the user. State observations, not causes.
* **Truth-Only:** Never claim “drive disconnected” or “folder missing” unless proven.
* **Context-Aware:** Distinguish hardware absence (volume) vs folder absence (path) vs permission vs integrity.
* **Action-Oriented:** Every recoverable state offers a one-click primary resolution.
* **Transient-Resistant:** Do not panic over temporary glitches (sleeping drives, slow mounts).
* **No Destructive Advice:** Never instruct “remove torrent and re-add”.

---

## 2. State Machine Logic

The client must classify into **one of four states** and attach a **confidence level**: `certain | likely | unknown`.

### Confidence levels

* `certain`: proven by OS probing (local) or unambiguous RPC result.
* `likely`: heuristic (RPC free-space probes + error hints).
* `unknown`: conflicting/missing signals → UI must say **“Location unavailable”** and offer **Locate/Retry**.

### Detection context

* **Remote (RPC):** heuristic, best-effort (Transmission RPC constraints).
* **Local (TinyTorrent Server / WebView2):** OS calls, authoritative.

### S1 — Data Gap (Integrity mismatch / incomplete pieces)

**Remote (RPC):**

* torrent is in `CHECK_WAIT`/`CHECK` (checking states), **or**
* user explicitly initiated Verify and it resulted in missing pieces (observed via state/bytes).
  **Local:**
* OS confirms files exist, but verify marks pieces missing/corrupt.
  **User reality:** “Files are corrupted or incomplete.”

### S2 — Path Loss (Folder missing)

**Remote (RPC, likely):**

* error indicates path missing **and**
* `free-space(root)` succeeds **and**
* `root` stable across polls (2 samples).
  **Local (certain):**
* `exists(path) == false` **and** `exists(root) == true`.
  **User reality:** “Folder moved/renamed/deleted.”

In Remote (RPC) mode, “Download to recreate” MUST send torrent-set-location
even if the path string is unchanged, to force Transmission to re-evaluate
path existence and permissions before recovery.

### S3 — Volume Loss (Drive missing)

**Remote (RPC, likely/unknown):**

* error indicates path missing **and**
* `free-space(root)` fails repeatedly (>=2 samples, 500ms–2s).
* If failure reason is unknown → confidence `unknown` and UI must not claim drive is disconnected.
  **Local (certain):**
* `exists(root) == false` (volume unmounted).
  **User reality:** “External drive not mounted.”

### S4 — Access Denied (Permissions)

**Remote (RPC):**

* error contains permission/denied semantics (best-effort).
  **Local (certain):**
* `access(path, W_OK)` fails.
  **User reality:** “OS blocks access.”

---

## 3. Inline UI (Torrent List Row)

**Status column replacement when missing-files error is detected.**

### Visual grammar

* **Icon:** ⚠️ warning (yellow/orange). Never red (red implies fatal).
* **Text:** high contrast, short, factual.
* **Actions:** standard buttons/links.

### Confidence-to-copy rule (global)

If confidence = `unknown`, inline text must be **“Location unavailable”** (never “Drive disconnected” or “Folder not found”).

### Row layouts per state

**S1: Data Gap**

> `[⚠️] Missing: 1.2 GB`
> **[ Download missing ]** · *Open folder*

**S2: Path Loss**

> `[⚠️] Folder not found: /Movies/Avatar`
> **[ Locate... ]** · *Download to recreate*
> “Download to recreate” performs: ensure folder exists (local) / set location (remote) + minimal engine sequence + start.

**S3: Volume Loss**

> `[⚠️] Drive disconnected (E:)` *(only if confidence != unknown)*
> **[ Retry ]** · *Locate...*

**S4: Access Denied**

> `[⚠️] Permission denied (Read-only)`
> **[ Choose new location… ]** · *Open folder*
> Optional: *Show permission help* (TinyTorrent help sheet / OS dialog best-effort)

### Retry semantics (must be consistent)

“Retry” performs **availability re-probing only** (drive/path/access checks). It does **not** modify paths or data.

---

## 4. Interaction Logic (Smart Recovery)

### A. Open Folder algorithm

**Trigger:** user clicks *Open folder*.

**Remote (RPC):**

* Attempt to open the path via OS shell **only if mapped/valid**.
* If not possible: toast **“Cannot open remote folder.”** and stop.

**Local (WebView2):**

1. Try open `Target_Directory`.
2. If target missing:

   * if `root` exists → open parent directory
   * else → open **This PC / Volumes**

No promises of “ghost selection”.

---

### B. Primary action algorithms (Download / Retry / Locate)

**Trigger:** user clicks the primary action for the current state.

#### Step 0: Recovery gate (entry-point invariant)

All entry points (row action, context menu, navbar Resume/Start, details buttons) must funnel into the same recovery gate:

* classify state + confidence
* run preflight (local authoritative / rpc heuristic)
* execute minimal correct engine sequence
* open modal only if required

#### Step 1: Grace period (S3 only)

**Remote (RPC):**

* Poll `free-space(root)` every 500ms for 2s.
* If recovers → proceed.
* Else → open modal in S3 with confidence.

**Local (WebView2):**

* Show “Waiting for drive…” micro-status.
* Listen to OS mount events (or poll `access(root)` every 200ms for 2s).
* If drive appears → proceed immediately (sub-second response).
* **Local best UX:** If the drive reappears later (while app running), auto-recover without user click (see Local Perfect Mode).

#### Step 2: Pre-flight capacity

**Remote (RPC):** `free-space(path)`
**Local:** `getDiskInfo(path)`
If `freeSpace < missingBytes` → show Disk Full modal (separate spec).

#### Step 3: Execution — minimal correct engine sequence

### Context A: Remote (RPC) — Minimal correct sequence (Transmission-max)

**Goal:** avoid unnecessary verify, but never get stuck due to stale bitmap.

**Determine if verify is needed**

* If `leftUntilDone > 0` **and** torrent was previously downloading or seeding in this session:
  → try `torrent-start` first.
* Otherwise (unknown history, prior error, after path repair, integrity suspicion):
  → run `torrent-verify`, then `torrent-start`.

**If verifying**

* UI status: “Verifying local data…”
* Watcher: wait until torrent is **not in any checking state** (`CHECK` / `CHECK_WAIT`) with timeout 30s.

**After watcher**

* If torrent is not active → send `torrent-start`.

**Anti-loop guard (required)**

* If `torrent-verify` completes and `leftUntilDone` is unchanged vs pre-verify:
  → do not re-run verify again in this session.
  → surface S1 with confidence `certain` (data gap).

**Timeout behavior (required)**

* If watcher timeout expires and still checking:

  * show inline status “Still verifying…”
  * offer Retry / Locate
  * do not auto-open modal

---

### Context B: Local (WebView2) — Direct fix (absolute best UX)

**Local is authoritative.** Prefer OS truth over engine guesses.

1. If S2 (path loss): `mkdir(path, recursive=true)` before any engine start.

2. Choose minimal engine sequence:

   * If **all data absent** (`missingBytes == expectedBytes`) and path valid/writable:
    → attempt torrent-start without verify.
    → if the engine errors, stalls, or immediately re-enters missing-files state:
        → run torrent-verify, then torrent-start.
   * Else:
     → `torrent-verify` then `torrent-start`.

3. UI shows fine-grained micro-status (local only):

   * “Creating folder…”
   * “Checking files…”
   * “Waiting for drive…”
   * “Starting download…”

---

## 5. Local Perfect Mode (WebView2-only, authoritative)

Local mode may do everything “perfect” because it has OS access.

### Authoritative probes

* `exists(path)?`
* `exists(root)?`
* `writable(path)?`
* `free space?`
* `missingBytes?` and `expectedBytes?`

### Auto-recovery (best UX)

* If S3 and drive later reappears:

  * toast “Drive detected”
  * auto-run minimal engine sequence
  * no modal unless the user explicitly opens it

### Truthful UI (never guess)

* root missing → “Drive disconnected”
* leaf missing → “Folder not found”
* access denied → “Access denied”
* otherwise → “Missing files” / “Missing: Z”

### After any successful location fix

* queue minimal sequence (possibly skip verify if provably redundant)
* show row status transitions

---

## 6. Recovery Modal (Hard stop)

**Trigger:** appears only when a recovery action fails or requires explicit user decision.

If confidence = `unknown` and the action requires a path decision, the modal may open immediately without attempting recovery.

### Modal applies to

* S2 Path loss
* S3 Volume loss
* S4 Access denied
  (never S1: integrity stays inline + advanced tools)

### Header

Icon: AlertTriangle (yellow). Never red.

| State | Title                                                                             |
| ----- | --------------------------------------------------------------------------------- |
| S2    | Folder Missing                                                                    |
| S3    | Drive Disconnected *(only if confidence != unknown; else “Location unavailable”)* |
| S4    | Access Denied                                                                     |

### Body diagnostic (semantic highlighting)

S2:

* “The folder is missing from disk. If you moved it, please locate it.”
* Path with leaf highlighted.

S3:

* “The drive is not connected. Connect it to resume.”
* Root highlighted.

S4:

* “Cannot write to this location. Choose a writable folder.”
* Path highlighted.

### Footer layout

`[Cancel] ... [Secondary] [Primary]`

#### S2 buttons

* **Primary:** Locate…
* **Secondary:** Re-create (recreate at original path + minimal engine sequence + start)
* **Tertiary:** Cancel

#### S3 buttons

* **Primary:** Locate…
* **Passive:** auto-resolve

  * RPC: poll free-space every 2s while modal open
  * Local: mount events
  * If detected: toast “Drive detected” → close modal → resume minimal sequence
* **Tertiary:** Cancel

#### S4 buttons

* **Primary:** Choose New Location…
* **Tertiary:** Cancel

### Success transition (required)

After selecting a new path:

1. validate writable
2. show “Location updated” success state (600ms)
3. close modal
4. torrent proceeds to checking/downloading

### Developer prohibitions

* NO text inputs for paths (picker only)
* NO “Verify” button in modal (verify is a consequence, not a choice)
* NO generic errors; must compute root vs leaf (local) or use confidence (rpc)

---

## 7. Integration rules (all entry points)

### Surface responsibilities (strict)

**Allowed primary recovery surfaces**

* Torrent table row inline UI
* Recovery modal (hard stop only)

**Informational/config surfaces only**

* Detail/General tab and properties panels: may show state and sizes, but must not duplicate primary recovery CTAs.

### Entry points that must funnel into recovery gate

* Row inline buttons (Download missing / Retry / Locate)
* Context menu actions
* Navbar Resume/Start
* Details “Resume”, “Set location”, “Re-download” (if present) must call the same gate

No bypasses, no duplicated logic.

---

## 8. Copywriting dictionary (exact strings)

* Generic header: “Missing files”
* Button: “Download missing”
* Button: “Locate…”
* Button: “Retry”
* Status: “Verifying: 45%”
* Status: “Waiting for drive…”
* Status: “Still verifying…”
* Toast: “Download resumed”
* Toast: “Location updated”
* Row fallback: “Location unavailable”
* Modal fallback title: “Location unavailable”
* Modal fallback body: “The download location cannot be reached. Locate it or choose a new one.”
* Toast: “Drive detected”

---

## 9. Edge case safety rails

1. **0 bytes missing**

* If action finds `missingBytes == 0`:

  * transition to Complete/Seeding
  * toast “All files verified. Resuming.”

1. **Move vs Set**

* Locate updates pointer only; never attempts to move files automatically.

1. **Transient network drives**

* Treat missing mapped network drive as S3 (volume loss). If RPC uncertain → confidence unknown → “Location unavailable”.

1. **No infinite verify loops**

* Anti-loop guard (Section 4) is mandatory.

---

## 10. Definition of Done (QA checklist)

* [ ] Unplugging a drive shows “Drive disconnected” **only when confidence != unknown**.
* [ ] If confidence unknown, UI shows “Location unavailable” (no false claims).
* [ ] Re-plugging a drive resumes:

  * RPC: after Retry (or passive in modal)
  * Local: auto-resume without click
* [ ] Deleting folder shows “Folder not found” (local certain; rpc likely/unknown).
* [ ] Open folder on missing folder opens parent (local); remote shows toast if cannot map.
* [ ] “Download missing” works without deleting/re-adding torrent.
* [ ] Start/Resume from navbar funnels into recovery gate and recovers correctly.
* [ ] Verify does not compete with recovery actions; modal has no Verify button.
* [ ] No modal appears automatically; only on user click or when required decision is unavoidable.
* [ ] Local mode skips verify when all data absent and path is valid (best UX).

---
