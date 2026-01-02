# **System Tab — Final Engineering Spec**

**Context:**
This tab controls OS-level integrations, daemon behavior, and window lifecycle. It replaces legacy µTorrent "Preferences > General" with a modern, state-first approach.

**Design Philosophy:**

* **One setting = One row.** No hidden menus.
* **State always visible.** Users must see "Registered" or "Active" without hovering.
* **Deterministic Behavior.** Ambiguous states (like "Manual Launch hidden") are hard-coded to safe defaults, not user-configurable.

---

## **1. Logic & Behavior Rules (The "Golden Rules")**

### **A. The Splash Screen Rule**

* **User Setting:** **None.** (Removed from UI).
* **Logic:** The splash screen is a latency hider, not a feature.
  * If `app_load_time < 1000ms`: **Skip splash.** Open main window immediately.
  * If `app_load_time > 1000ms`: **Show splash.**
* **Reasoning:** Users prefer instant tools. Configuration adds friction.

### **B. The Manual Launch Rule**

* **User Setting:** **None.** (Hardcoded).
* **Logic:** If the user manually launches the app (Desktop shortcut, Start Menu, or Tray Icon click), the **Main Window MUST always appear**.
* **Reasoning:** Prevents the "I clicked it and nothing happened" perception error.

### **C. The Startup Sequence**

* **Autorun:** Controls *if* the process starts with Windows.
* **Silent Start:** Controls *visibility* only during Autorun.

---

## **2. UI Specification**

### **Section 1: OS Integration**

*Core hooks into the operating system.*

**Row 1: Magnet & Torrent Handlers**

* **Label:** "Default torrent application"
* **Control:** `Button` (size="sm", variant="bordered")
  * **Text:** `Check Association` (if unknown) / `Repair` (if broken)
* **State Indicator:** `Chip` (size="sm", variant="flat")
  * **Green (Success):** "Registered"
  * **Red (Danger):** "Not Registered"
* **Behavior:** Button triggers OS registry check/repair. Chip updates instantly.

**Row 2: Power Management**

* **Label:** "Prevent system sleep while active"
* **Control:** `Switch` (color="primary")
* **Helper Text (Tooltip/Subtext):** "Keeps PC awake only while downloading or seeding."
* **State Indicator:** `Chip` (size="sm", color="default")
  * **Text:** "Active" / "Off"

**Row 3: Updates**

* **Label:** "Automatically check for updates"
* **Control:** `Switch` (color="primary")
* **State Indicator:** `Chip` (size="sm", color="primary")
  * **Text:** "Auto" / "Manual"

---

### **Section 2: Startup & Lifecycle**

*Controls how the application launches on boot.*

**Row 4: Autorun**

* **Label:** "Launch TinyTorrent on system startup"
* **Control:** `Switch` (color="primary")
* **State Indicator:** `Chip` (size="sm")
  * **Text:** "Enabled" / "Disabled"

**Row 5: Silent Start**

* **Dependency:** Visually disabled (opacity 50%) if **Autorun** is OFF.
* **Label:** "Start minimized to tray"
* **Control:** `Checkbox` (size="md")
* **Description:** "Applies to system startup only. Manual launch always opens window."

---

### **Section 3: Window Behavior**

*Controls user-initiated closure.*

**Row 6: Close Button Action**

* **Label:** "When clicking the close (x) button"
* **Control:** `Select` (size="sm", disallow empty) **OR** `RadioGroup` (horizontal)
* **Options:**
    1. **Minimize to Tray** (Default) — Keeps daemon running.
    2. **Quit Application** — Terminates daemon and UI.

---

## **3. Component & Style Mapping (`AGENTS.md`)**

| UI Element | HeroUI Component | Configuration / Token |
| :--- | :--- | :--- |
| **Section Container** | `Card` | `shadow="sm"`, `class="bg-content1/50"` (Layer 1 Glass) |
| **Row Layout** | `div` (Flex) | `h-row`, `items-center`, `justify-between`, `px-panel` |
| **Toggle** | `Switch` | `size="md"`, `color="primary"` |
| **Status Badge** | `Chip` | `size="sm"`, `variant="flat"`, `radius="sm"` |
| **Action Button** | `Button` | `size="sm"`, `variant="bordered"`, `radius="full"` |
| **Typography** | `Text` | Label: `text-foreground`; Desc: `text-default-500` |

**Visual constraints:**

* Do not use "Compact" sizing for the main switches. The rows should feel comfortable (`h-row`).
* State Chips are right-aligned, usually sitting next to the control or action button.
* Dividers are optional; whitespace (`gap-stage`) is preferred between sections.
