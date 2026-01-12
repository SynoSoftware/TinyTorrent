Here is the authoritative summary and execution guide for the TinyTorrent Refactor. This document acts as the single source of truth for the project's current state, architectural rules, and immediate roadmap.

---

# TinyTorrent Refactor: Master Status & Execution Guide

## 1. Executive Summary
**The Problem:** The application suffered from severe "prop drilling" (passing parameters through too many layers) and leakage of domain logic into the UI. Specifically, the "Missing Files / Recovery" specification exposed that `App.tsx` was orchestrating engine logic, `serverClass` was polluting UI props, and recovery handlers were duplicated or ineffective.

**The Solution:** A strict **Context-Based Architecture**. We are moving ownership of logic and data into specific React Contexts. Components must consume these contexts directly rather than receiving props from their parents.

**Current Status:**
*   **Phase 0 (Design & Mapping):** ✅ Complete.
*   **Phase 1 (Action Wiring):** ✅ Complete & Frozen. `TorrentActionsContext` is created and wired; primary entry points use it.
*   **Phase 2 (Prop Deletion):** 🚧 **ACTIVE**. We are currently removing the legacy props and replacing them with context hooks.

---

## 2. The Architectural Constitution
Do not invent new patterns. Adhere strictly to these boundaries.

### A. Canonical Context Inventory
These are the **only** shared access points allowed.

| Context | Hook | Responsibility |
| :--- | :--- | :--- |
| **TorrentActions** | `useTorrentActions()` | **The Brain.** Owns all intents (resume, pause, setLocation, recover). The *only* layer allowed to call the Engine. |
| **Services** | `useServices()` | **The Transport.** Raw EngineAdapter, RPC calls, filesystem primitives. No domain logic. |
| **Lifecycle** | `useLifecycle()` | **The Environment.** Read-only runtime flags: `serverClass`, `rpcStatus`, `nativeIntegration`. |
| **UI** | `useUI()` | **The Surface.** Toasts, Modals, Native File Pickers (`pickFolder`). |
| **Selection** | `useSelection()` | **The Pointer.** Owns selected IDs and active Row ID. Does *not* own data. |
| **RecoveryLogic** | *(Module)* | **The Rules.** Pure functions for classification (S1–S4) and confidence. Consumed only by TorrentActions. |

### B. Ownership Axioms (Non-Negotiable)
1.  **UI NEVER calls engine methods.**
2.  **UI NEVER interprets Recovery Outcomes.** (It only reacts to signals like "resume_started").
3.  **TorrentActions is the ONLY engine caller.**
4.  **ServicesContext is Transport only.** (It does not know what "Recovery" is).
5.  **Props are for Configuration, not Context.** (If a prop answers "What environment am I in?" or "What is currently selected?", it must be deleted and replaced with a Context read).

---

## 3. Progress Report: What Was Done (Phase 1)
**Goal:** Establish the `TorrentActionsContext` as the single owner of side effects.

1.  **Created `TorrentActionsContext`:** It now houses the logic for recovery sequencing, deduplication, and engine calls.
2.  **Redirected Entry Points:** The "Gate" in `App.tsx` and the `useRecoveryController` hook were patched to delegate to `useTorrentActions().recoverPrimary()`.
3.  **Frozen Wiring:** The provider is injected at the root.

**Known Debt (To Be Fixed in Phase 2):**
*   `serverClass` is still passed as a prop to `Dashboard_Layout` and `TorrentTable` to unblock the build.
*   `onOpenFolder`, `onRetry`, etc., are still passed down from `App.tsx`.

---

## 4. The Master Plan (Current Phase)

We are currently executing **Phase 2: Prop Deletion**.

**Objective:** Collapse the parameter explosion by replacing prop passing with direct context consumption.

### Step 1: Lifecycle cleanup (`serverClass`)
*   **Target:** `App`, `WorkspaceShell`, `Dashboard_Layout`, `TorrentTable`.
*   **Action:** Replace `props.serverClass` with `const { serverClass } = useLifecycle()`.
*   **Outcome:** `serverClass` is removed from all intermediate component signatures.

### Step 2: Action cleanup (Callbacks)
*   **Target:** `onOpenFolder`, `onSetLocation`, `onRedownload`, `onRetry`, `onResume`.
*   **Action:** Replace callbacks with `useTorrentActions().[method]`.
*   **Outcome:** `App.tsx` stops being an event bus. `TorrentTable` becomes self-sufficient.

### Step 3: Selection cleanup
*   **Target:** `selectedTorrents`, `onSelectionChange`, `activeRow`.
*   **Action:** Replace with `useSelection()`.
*   **Outcome:** Props related to selection state are deleted.

---

## 5. Phase 2 Execution Detail (The Checklist)

Use this table to execute the specific code changes required right now.

| Component | Prop to Delete | Replacement API | Notes |
| :--- | :--- | :--- | :--- |
| **App.tsx** | `serverClass`, `rpcStatus` | `useLifecycle()` | Stop passing these to `WorkspaceShell`. |
| **App.tsx** | `requestRecovery` | `useTorrentActions().recoverPrimary` | Already wired in Phase 1; delete the prop def. |
| **App.tsx** | `onOpenFolder`, `onRetry` | `useTorrentActions()` | Delete the handler functions in App entirely. |
| **WorkspaceShell** | `serverClass` | `useLifecycle()` | Stop forwarding to `Dashboard_Layout`. |
| **WorkspaceShell** | All Action Callbacks | `useTorrentActions()` | Stop forwarding to `Dashboard_Layout`. |
| **Dashboard_Layout**| `serverClass` | `useLifecycle()` | Stop forwarding to `TorrentTable`. |
| **TorrentTable** | `serverClass` | `useLifecycle()` | Read context inside the table/row. |
| **TorrentTable** | `onOpenFolder`, `onRetry` | `useTorrentActions()` | Invoke context methods directly in row actions. |
| **ColumnDefs** | `meta.serverClass` | `useLifecycle()` | Columns should read context or accept minimal data. |

---

## 6. Verification: How to Check Success

After Phase 2 changes are applied, run this audit to confirm the refactor is correct:

1.  **The "Prop Scan":**
    *   Open `TorrentTable.tsx`. Does it accept `serverClass` as a prop?
        *   **YES:** ❌ Fail.
        *   **NO:** ✅ Pass.
    *   Open `App.tsx`. Does it contain functions like `handleRetry` or `handleOpenFolder`?
        *   **YES:** ❌ Fail.
        *   **NO:** ✅ Pass.

2.  **The "Engine Check":**
    *   Search the entire `src/modules/dashboard` folder for direct usage of `client.call`, `client.verify`, or `engine.*`.
    *   **Result:** Should be **0 results**. All engine calls must be inside `src/app/context/TorrentActionsContext`.

3.  **The "Recovery Check":**
    *   Trigger a "Missing Files" error (S1–S4).
    *   Click "Retry" or "Download Missing."
    *   **Result:** The UI should update via signals from `TorrentActionsContext` (e.g., toast appears, state changes to verifying), *without* `App.tsx` re-rendering or passing new props down.

## 7. Immediate Next Instruction
Proceed to **Phase 2 Step 1**: Remove `serverClass` and `rpcStatus` props by implementing `useLifecycle()` reads in `WorkspaceShell`, `Dashboard_Layout`, and `TorrentTable`.


Here is the consolidated, authoritative **Master Design & Refactor Specification** for TinyTorrent.

This document supersedes all previous chat logs and notes. It contains the architecture, the domain logic standards, and the granular execution plan required to complete the refactor.

---

# TinyTorrent Refactor: Master Specification

## 1. Core Architectural Standards

### 1.1. The "North Star" Rule

**UI components must never know about the Engine, Transport, or Recovery Sequencing.**
Prop drilling is a symptom of missing contexts. We solve this by moving data ownership to the specific contexts defined below.

### 1.2. Canonical Context Inventory (Frozen)

Do not create new contexts. All logic must fit into one of these six.

| Context | Hook | Responsibility & Scope |
| :--- | :--- | :--- |
| **TorrentActions** | `useTorrentActions()` | **The Brain.** Owns all intents (resume, pause, setLocation, recover, openFolder). The *only* layer allowed to call the Engine. Owns in-flight dedupe and `VERIFY_GUARD`. |
| **Services** | `useServices()` | **The Transport.** Raw EngineAdapter, RPC calls, filesystem primitives. Exposes `safeCall` and capability flags. **Transport only.** |
| **Lifecycle** | `useLifecycle()` | **The Environment.** Read-only runtime flags: `serverClass` (TinyTorrent vs Transmission), `rpcStatus`, `nativeIntegration`. |
| **UI** | `useUI()` | **The Surface.** Toasts, Modals, Native File Pickers (`pickFolder`). **Must not contain domain logic.** |
| **Selection** | `useSelection()` | **The Pointer.** Owns selected IDs and active Row ID. Does *not* own TorrentDetail objects. |
| **Telemetry** | `useTelemetry()` | **The Pulse.** Read-only derived metrics (speed history, optimistic statuses). |

### 1.3. The RecoveryLogic Module

* **Type:** Pure Module (not a Context).
* **Role:** Stateless logic consumed *internally* by `TorrentActionsContext`.
* **Responsibilities:** `classifyMissingFilesState` (S1–S4), `determineConfidence`, verify-watcher predicates, anti-loop guards.

### 1.4. Ownership Axioms (Strict)

1. **UI NEVER calls engine methods.**
2. **UI NEVER interprets Recovery Outcomes** (it only reacts to signals like `resume_started`).
3. **TorrentActions is the ONLY engine caller.**
4. **ServicesContext is Transport only** (it does not know what "Recovery" is).
5. **SelectionContext owns Identity, not Data.**

---

## 2. Domain Logic Specification (Recovery UX)

The refactor exists to support this specific logic.

### 2.1. State Classifications (S1–S4)

The `RecoveryLogic` module must classify errors into these states:

* **S1 — Data Gap:** Files exist but pieces missing/corrupt. (Action: Verify).
* **S2 — Path Loss:** Folder missing but root volume exists. (Action: Locate / Recreate).
* **S3 — Volume Loss:** Root volume/drive missing. (Action: Retry / Wait for Mount).
* **S4 — Access Denied:** Permissions error. (Action: New Location).

### 2.2. Confidence Levels

* **Certain:** Proven by local OS probing (webview2) or unambiguous RPC error code.
* **Likely:** Heuristic (RPC free-space probes).
* **Unknown:** Conflicting signals. **UI Rule:** If unknown, display "Location unavailable" (never guess "Drive disconnected").

### 2.3. Anti-Loop & Verification Rules

* **VERIFY_GUARD:** If a torrent was verified and `leftUntilDone` did not change, do not verify again in the same session. Surface S1 (Data Gap).
* **Retry Semantics:** "Retry" only performs availability probing. It never modifies paths or data.

---

## 3. Migration Status & Roadmap

### Phase 1: Action Wiring (COMPLETED)

* **Status:** Frozen.
* **Deliverables:** `TorrentActionsContext` created. Primary entry points (`recoverPrimary`, `requestRecovery` gate) redirected to provider.
* **Constraint:** Do not modify Phase 1 wiring.

### Phase 2: Prop Deletion (ACTIVE)

* **Goal:** Eliminate parameter explosion by replacing props with context hooks.
* **Scope:** `serverClass`, action callbacks (`onOpenFolder`, etc.), and selection state.

### Phase 3: Cleanup & Optimization (PENDING)

* **Goal:** Extract `RecoveryLogic` into a pure module; remove transitional adapters in `App.tsx`.

---

## 4. Phase 2 Execution Plan (The Checklist)

Execute these changes component-by-component to remove props.

### 4.1. Step 1: Lifecycle Props (`serverClass`, `rpcStatus`)

**Constraint:** These are currently passed as props to unblock the build. They must be moved to `LifecycleContext`.

| Component | Prop to Delete | Replacement Strategy |
| :--- | :--- | :--- |
| **App.tsx** | `serverClass`, `rpcStatus` | Remove from state passing. |
| **WorkspaceShell** | `serverClass` | Replace prop with `const { serverClass } = useLifecycle()`. |
| **Dashboard_Layout** | `serverClass` | Replace prop with `const { serverClass } = useLifecycle()`. |
| **TorrentTable** | `serverClass` | Replace prop with `const { serverClass } = useLifecycle()`. |
| **ColumnDefs** | `meta.serverClass` | Remove from table meta. Cell renderers must consume `useLifecycle()` or receive minimal flags. |

### 4.2. Step 2: Action Props (`onOpenFolder`, `onRetry`, `onSetLocation`)

**Constraint:** `App.tsx` must stop acting as an event bus.

| Component | Prop to Delete | Replacement Strategy |
| :--- | :--- | :--- |
| **App.tsx** | `handleOpenFolder`, `onRetry` | **DELETE** the handler functions entirely. |
| **WorkspaceShell** | `onOpenFolder`, `onRetry`, `onRedownload` | Remove props. Do not forward. |
| **Dashboard_Layout** | (All action callbacks) | Remove props. Do not forward. |
| **TorrentTable** | (All action callbacks) | Inside Row Menus / Actions, call `useTorrentActions().openFolder(id)` directly. |
| **TorrentDetails** | `onOpenFolder`, etc. | Call `useTorrentActions()` directly. |

### 4.3. Step 3: Selection Props (`selectedTorrents`, `activeRow`)

**Constraint:** Selection state belongs in `SelectionContext`, not React State in App.

| Component | Prop to Delete | Replacement Strategy |
| :--- | :--- | :--- |
| **App.tsx** | `selectedTorrents`, `setSelected` | Remove state. |
| **TorrentTable** | `selectedTorrents`, `onSelectionChange` | Replace with `useSelection()`. |
| **Dashboard_Layout** | `selectedTorrents` | Replace with `useSelection()`. |

---

## 5. Implementation Details for Specific Flows

### 5.1. The "Open Folder" Flow

* **Old Way:** `TorrentTable` calls `props.onOpenFolder` → `Dashboard` → `App` → `App` calls `electron.openItem`.
* **New Way:** `TorrentTable` calls `useTorrentActions().openFolder(id)`.
  * `TorrentActions` determines path.
  * `TorrentActions` calls `useUI().openFolder(path)` (native shell).

### 5.2. The "Set Location" Flow

* **Old Way:** `App` passes `onSetLocation` callback down 4 layers.
* **New Way:**
    1. User clicks "Move..."
    2. Component calls `useTorrentActions().setLocation(id, ...)`
    3. `TorrentActions` calls `useUI().pickFolder()` to get path (if needed).
    4. `TorrentActions` calls `services.engine.setLocation`.

---

## 6. Verification Protocols

Run these checks to validate the refactor.

### 6.1. The "Prop Scan" (Static Analysis)

Open `TorrentTable.tsx` and `Dashboard_Layout.tsx`.

* **FAIL:** If `interface Props` contains `serverClass`, `onOpenFolder`, `torrentClient`, or `recoveryCallbacks`.
* **PASS:** If `interface Props` is empty or contains only display-specific configuration (e.g., `viewMode`).

### 6.2. The "Engine Leak" Check

Search the `src/modules` directory for:

* `client.call`
* `client.verify`
* `engine.`
* **PASS:** Zero results outside of `src/app/context/TorrentActionsContext` (and the Services wrapper).

### 6.3. The "Recovery" Test (Functional)

1. Induce an S2 state (rename a folder on disk).
2. UI should show "Folder not found" (Confidence: Certain/Likely).
3. Click "Locate...".
4. **Verification:** The File Picker opens. Upon selection, the torrent resumes. `App.tsx` did not re-render.
