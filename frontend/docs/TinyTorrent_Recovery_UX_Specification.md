# Torrent Missing Files — Recovery UX Specification (vFinal)

## 1. Core UX Philosophy

* **Non-Accusatory:** Never blame the user. State observations, not causes.
* **Context-Aware:** Distinguish between "I can't find the drive" (Hardware) and "I can't find the folder" (Organization).
* **Action-Oriented:** Every error state offers a one-click primary resolution.
* **Transient-Resistant:** Do not panic over temporary system glitches (e.g., sleeping drives).

---

## 2. State Machine Logic

The client must classify a "Missing Files" error into one of **four** distinct states. This classification determines the UI.

| State Code | Name | Technical Condition | User Reality |
| :--- | :--- | :--- | :--- |
| **S1** | **Data Gap** | Path exists, writable. Hash check failed or file size mismatch. | "Files are corrupted or incomplete." |
| **S2** | **Path Loss** | Drive/Mount exists. Specific folder path missing. | "I moved, renamed, or deleted the folder." |
| **S3** | **Volume Loss** | Root path (Drive Letter / Mount point) not found. | "The external drive is unplugged." |
| **S4** | **Access Denied** | Path exists but is Read-Only or Permission Denied. | "The OS is blocking access." |

---

## 3. Inline UI (Torrent List Row)

*Status Column replacement when error is detected.*

### Visual Grammar

* **Icon:** ⚠️ (Warning Yellow/Orange) — *Never Red (Red implies fatal/stopped).*
* **Text:** High-contrast, legible.
* **Buttons:** Standard action buttons/links.

### Row Layouts per State

**S1: Data Gap** (Files exist but are wrong)
> `[⚠️] Missing: 1.2 GB`
> **[ Download missing ]**  ·  *Open folder*

**S2: Path Loss** (Folder gone)
> `[⚠️] Folder not found: /Movies/Avatar`
> **[ Locate... ]**  ·  *Download to recreate*

**S3: Volume Loss** (Drive gone)
> `[⚠️] Drive disconnected (E:)`
> **[ Retry ]**  ·  *Locate...*

**S4: Access Denied** (Permissions)
> `[⚠️] Permission denied (Read-only)`
> **[ Retry ]**  ·  *Fix permissions* (Opens OS Properties)

---

## 4. Interaction Logic (The "Smart" Behavior)

### A. The "Open Folder" Algorithm (Recursive Fallback)

*Trigger: User clicks "Open folder" or uses Context Menu > Open Destination.*

1. **Try:** Open `Target_Directory`.
2. **Catch (Missing):** Try `Target_Directory`'s Parent.
3. **Catch (Missing):** Repeat up to `Drive_Root`.
4. **Catch (Missing):** Open OS Default File Manager view (This PC / Home).
5. **Feedback:** If the exact target was not opened, display Toast:
    * *"Folder missing. Opened parent directory."*

### B. The "Download / Retry" Algorithm (Smart Recovery)

*Trigger: User clicks Primary Action.*

1. **Grace Period (S3 only):**
    * If State is **S3 (Volume Loss)**, show spinning loader for **2000ms**.
    * Background: Attempt to list directory. (Allows sleeping USB drives to wake).
    * If success: Proceed to Step 2.
    * If fail: Show Modal (See Section 5).

2. **Pre-Flight Capacity Check:**
    * Calculate `Missing_Bytes`.
    * Check `Free_Space` on target.
    * If `Free_Space < Missing_Bytes`: Show **Disk Full Modal**.

3. **Execution (S1/S2):**
    * **If State S1 (Gap):** Transition to "Queued" -> "Downloading".
    * **If State S2 (Path Loss) AND User clicked "Download to recreate":** Create folder structure -> Start Download.

4. **Verification (The Hidden Step):**
    * If the engine requires a hash check before downloading:
    * **UI Status:** Change to "Verifying local data..." (Show progress %).
    * **Logic:** Do *not* delete existing data. Only verify.
    * **Completion:** If 100% match, transition directly to "Seeding" (Do not download).

---

---

## 5. The Recovery Modal (Hard Stop)

*Trigger: Only appears if the Primary Action fails (e.g., user clicked "Retry" but drive is still gone).*

### 5.1 Modal Architecture

**Trigger:**
Appears **only** when a recovery action fails or requires explicit user decision (e.g., Drive still missing after grace period, or Permissions denied).

**States:**

1. **S2: Path Loss** (Folder deleted/moved)
2. **S3: Volume Loss** (Drive unplugged)
3. **S4: Access Denied** (Read-only/No Write)

---

### 5.2 Header Strategy (The Problem)

**Layout:** `[Icon] [Title]`

* **Icon:** `AlertTriangle` (Yellow/Warning) - *Never Red (panic).*

| State | Title Text |
| :--- | :--- |
| **S2** | **Folder Missing** |
| **S3** | **Drive Disconnected** |
| **S4** | **Access Denied** |

---

### 5.3 Body Content (The Diagnostic)

The body must use **Semantic Highlighting** to show exactly what broke.

**S2 (Path Loss):**
> "The folder is missing from disk. If you moved it, please locate it."
>
> **Path:** `E:\Downloads\`**`[Movies]`**
> *(Style note: `E:\Downloads\` is dim/gray. `[Movies]` is bold/foreground color. This highlights the gap.)*

**S3 (Volume Loss):**
> "The drive is not connected. Connect it to resume."
>
> **Path:** **`[E:\]`**`Downloads\Movies`
> *(Style note: `[E:\]` is bold/highlighted. The rest is dim.)*

**S4 (Access Denied):**
> "The software cannot write to this location. Please choose a writable folder."
>
> **Path:** `E:\System\Protected` *(All bold)*

---

### 5.4 Interactions & Buttons (The Solution)

**Footer Layout:**
`[ Tertiary Action ]` (Spacer) `[ Secondary ] [ Primary ]`

#### State S2 (Folder Missing)

* **Primary (Solid):** **Locate...**
  * *Action:* Opens OS File Picker. User finds where they moved the folder.
* **Secondary (Outline):** **Re-create**
  * *Action:* Re-makes the directory structure at the *original* path and starts downloading.
  * *Tooltip:* "Download files again to the original location."
* **Tertiary:** *Cancel*

#### State S3 (Volume Loss)

* **Primary (Solid):** **Locate...**
  * *Action:* Opens OS File Picker (Use this if the drive letter changed).
* **Passive Action (Auto-Resolve):**
  * *Logic:* If the OS reports the drive (`E:`) is mounted while this modal is open:
  * **1.** Flash Toast inside modal: "Drive E: detected."
  * **2.** Auto-transition to **Primary: Resume** (or auto-close and resume).
* **Tertiary:** *Cancel*

#### State S4 (Access Denied)

* **Primary (Solid):** **Choose New Location...**
  * *Action:* Opens OS File Picker.
* **Tertiary:** *Cancel*

---

### 5.5 The "Success" Transition

When the user selects a new path (via "Locate..."), the modal must **not** vanish instantly.

1. **Validation:** System checks write permission on new path.
2. **Visual Feedback:**
    * Modal Body fades out.
    * Replaced by **Green Checkmark** + Text: *"Location updated"*
    * Duration: 600ms.
3. **Close:** Modal closes, torrent status changes to "Checking" or "Downloading."

### 5.6 Developer Prohibitions

1. **NO Text Inputs:** Do not allow users to type paths. It causes syntax errors. Use File Pickers only.
2. **NO "Verify" Button:** Verification is an automatic consequence of fixing the location. Do not offer it as a manual choice here.
3. **NO Generic Errors:** Never show "Error: Path not found." You must calculate whether it is the *Root* (Drive) or the *Leaf* (Folder) and display the correct specific state (S2 vs S3).

---

## 6. Edge Case Safety Rails

1. **The "0 Bytes Missing" Scenario:**
    * If user clicks "Download missing", and the check finds all files are actually complete:
    * **Action:** Immediately transition to "Seeding" / "Complete".
    * **Feedback:** Toast: *"All files verified. Resuming."*

2. **The "Move" vs "Set" Distinction:**
    * In the "Locate..." dialog (triggered from Error state), the logic must be **Set Pointer Only**.
    * Do **not** attempt to move files from the old (missing) path to the new path. Just update the download destination config.

3. **Transient Network Drives:**
    * If a mapped network drive is missing, treat as **S3 (Volume Loss)**. Do not treat as S2 (Path Loss).

---

## 7. Copywriting Dictionary (Exact Strings)

Use these strings to ensure consistency.

* **Generic Header:** "Missing files"
* **Button - Action:** "Download missing"
* **Button - Finding:** "Locate..."
* **Button - Hard Retry:** "Retry"
* **Status - Hashing:** "Verifying: 45%"
* **Status - Waiting:** "Waiting for drive..."
* **Toast - Success:** "Download resumed"
* **Toast - Fallback:** "Location updated"

---

## 8. Definition of Done (QA Checklist)

* [ ] Unplugging a drive shows "Drive disconnected" (Not "Error").
* [ ] Re-plugging the drive and clicking "Retry" resumes without a modal.
* [ ] Deleting the folder shows "Folder not found".
* [ ] Clicking "Open folder" on a missing folder opens the parent directory.
* [ ] Clicking "Download missing" on a perfect file (false alarm) transitions to Seeding instantly.
* [ ] No modal appears automatically; only on user click.
