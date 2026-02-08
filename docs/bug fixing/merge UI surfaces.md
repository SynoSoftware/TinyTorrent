No — do **not** forget the review yet.

What you added to `AGENTS.md` fixes the **governance gap** (lack of structural primitives), but the **codebase still contains mixed-ownership surfaces** identified in the audit. Without a cleanup pass, drift will continue even with the new rule.

You now need **one controlled normalization pass**, then you can close the review permanently.

---

# Required follow-up (single cleanup pass)

Execute once, then stop.

## 1. Normalize modal/dialog/menu surfaces

Make every modal/dialog use:

* one **ModalSurface** primitive (backdrop + frame)
* no ad-hoc blur/border/shadow classes inside feature modals

Unify:

* SettingsModal
* AddTorrentModal
* AddMagnetModal
* RecoveryModal
* RemoveConfirmationModal
* ColumnSettingsModal
* CommandPalette

---

## 2. Normalize floating menu / popover surfaces

All menus must use **one MenuSurface primitive**:

Replace:

* custom LanguageMenu styling
* custom peer context menus
* ad-hoc tooltip cards
* mixed HeroUI + custom menu shells

---

## 3. Normalize panel / card framing

Replace duplicated panel shells with **Surface**:

Targets:

* TorrentTable shells
* FileExplorerTree container
* SettingsSection / SystemSectionCard divergence
* detail tab root surfaces (Peers/Trackers/Content)
* chart cards
* destination gate cards

---

## 4. Normalize stage wrappers

Replace repeated centered stage wrappers with **Section**:

Targets:

* WorkspaceShell stage wrapper
* modal inner stage wrappers
* command palette centered wrapper

---

# When the review is considered complete

The review is finished once:

* every framed container uses **Surface**
* every page/workbench wrapper uses **Section**
* no feature component defines blur/border/shadow/radius directly
* menus and modals each have a single canonical surface implementation

After that pass, layout drift is structurally impossible and the review can be closed permanently.
