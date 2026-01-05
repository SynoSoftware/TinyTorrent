### Agent spec: TinyTorrent system integration behavior (brief, not vague)

#### Core rule: user makes **zero** operational decisions

* Toggles reflect **actual machine state**.
* Clicking a toggle performs exactly one state transition and finishes (success or clear error once).
* Never ask the same question twice. Never ask questions that don’t change an outcome.

---

## 1) “Launch TinyTorrent on startup” (single source of truth: Windows startup entry)

**OFF**

* Ensure **this** TinyTorrent startup entry does not exist.
* If multiple TinyTorrent startup entries exist (other installs/paths), do **not** remove them automatically.
* If duplicates exist for this same install: remove duplicates silently.

**ON**

* Ensure exactly **one** startup entry exists for **this** TinyTorrent install (no duplicates).
* If other TinyTorrent startup entries exist (different installs), show one prompt:

  * “Multiple TinyTorrent installs are set to start with Windows. Keep only this one, or keep all?”
  * Options: **Keep only this one** / **Keep all**
* Toggle position is **ON** if (and only if) the startup entry for this install exists.

---

## 2) “Register magnet/torrent” (file/protocol association ownership)

**OFF**

* Ensure **this** TinyTorrent is not registered for:

  * `magnet:` protocol
  * `.torrent` file association
* If multiple TinyTorrent registrations exist, prompt once:

  * “Other TinyTorrent installs are registered too. Unregister this one or all TinyTorrent registrations?”
  * Options: **This one** / **All TinyTorrent**
* If non-TinyTorrent clients are registered, prompt once:

  * “Other torrent apps are registered. Also remove all torrent registrations (magnet/.torrent)?”
  * Options: **No** / **Yes (remove all)**

**ON**

* This TinyTorrent becomes the handler for both magnet and `.torrent` (takes over).
* If takeover requires elevation, request it once.
* Toggle position is **ON** only if this install is the current handler for both.

---

## 3) “Install to Program Files” (system install; requires elevation)

**ON**

* Install (or repair) **this** TinyTorrent to Program Files.
* No duplicate installs. If an install already exists:

  * If same version/path: do nothing (idempotent).
  * If different TinyTorrent install exists: prompt once:

    * “A different TinyTorrent install exists. Replace it with this one?”
    * Options: **Replace** / **Keep both (not allowed)** → Keep both is not allowed; user must pick replace or cancel.
* Toggle position is **ON** only if this install is installed in Program Files and is the active system install target.

**OFF**

* Uninstall **this** Program Files install.
* If other TinyTorrent Program Files installs detected (shouldn’t happen, but handle):

  * prompt once: “Uninstall this one or all TinyTorrent installs?”
  * Options: **This one** / **All**
* Never remove user data unless explicitly requested in a separate flow.

---

## 4) Remove confusing/low-value controls

* Delete **“Run system installed”** button unless it has a single, clear function that is not redundant with clicking the EXE.

  * If it remains: rename to the exact action it performs (e.g., “Open installed TinyTorrent”) and make it just call the same single-instance focus behavior as EXE launch.
* Remove:

  * shortcut name setting
  * “extra command line arguments”
  * any UI that implies user must understand Windows integration internals

---

## 5) Shortcut locations (Desktop / Start Menu / Startup folder)

Each is a separate **idempotent** toggle with one job: ensure exactly one shortcut exists at that location for **this install**.

For each location:
**OFF**

* Remove only this install’s shortcut (and duplicates pointing to same target).
  **ON**
* Create/repair exactly one shortcut for this install.
* If another TinyTorrent shortcut exists pointing elsewhere: prompt once:

  * “Another TinyTorrent shortcut exists here. Replace it with this one?”
  * Options: **Replace** / **Keep both** (Keep both allowed *only* if names differ automatically; otherwise not allowed)

UI rule:

* No “buttons that are on or off”. Use toggles with clear labels and consistent state reporting.

---

# Mandatory single-instance + correct window focus behavior (no UI toggle)

### Definitions

* **Primary backend**: the backend instance started/owned by clicking this EXE (or the system-installed entry for this install).
* **Primary UI tab**: the browser tab/window that is connected to the Primary backend.

### Requirements

1. First click EXE:

   * Start backend if not running.
   * Open UI and connect to Primary backend automatically (correct host/port, not whatever localStorage says).
2. Second click EXE:

   * Focus **only** the Primary UI tab connected to Primary backend.
   * Never focus other tabs/windows based on title or heuristics.
3. If Primary UI tab was closed:

   * Next click opens a new UI tab and connects to Primary backend.
4. Debug connection (frontend setting):

   * Allowed only **for the current tab session**.
   * It must not overwrite the default/primary endpoint for future launches.
   * If a tab is connected to a non-primary backend and user clicks EXE:

     * open or focus the Primary UI tab for Primary backend (if none exists, open a new one).
     * do **not** focus the debug tab.
5. Clicking EXE must always end with exactly one outcome:

   * Primary UI focused (if exists) OR Primary UI opened (if not).

---

## Audit checklist (will expose every deviation fast)

### Single instance + focus

* Click EXE 5 times quickly:

  * expected: 1 backend, 1 primary UI tab focused
  * fail modes:

    * multiple tabs open
    * focuses wrong window/tab
* Open a debug-connected tab (to remote backend).

  * Click EXE:

    * expected: focuses/opens primary tab connected to primary backend
    * fail: focuses debug tab or reuses it
* Close primary tab.

  * Click EXE:

    * expected: opens a new primary tab
    * fail: does nothing / focuses other random tab

### Connection correctness

* In a tab, set debug endpoint to remote.
* Close tab.
* Click EXE again:

  * expected: primary endpoint (local) regardless of previous debug setting
  * fail: still connects to remote (localStorage bleed)

### System integration toggles

For each toggle:

* Turn ON twice:

  * expected: second time is no-op; no duplicates created
* Turn OFF twice:

  * expected: second time is no-op
* With another TinyTorrent install present:

  * expected: one prompt with the exact decision you specified; not repeated

---
