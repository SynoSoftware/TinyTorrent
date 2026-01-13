### **Subject: Stabilization & Wiring of the Control Plane**

We are at the pivot point of the `App.tsx` refactor. You have successfully stripped the component of its implementation details. Before you wire `useTorrentOrchestrator` back into `App.tsx`, we must ensure we aren't simply moving the "God Component" problem from the View layer into the Hook layer.

Please proceed with the following architectural mandates:

read the changes in AGENTS.md. they contain details about expected architecture which are important right now!

---

### **1. Placement Validation (File Structure Check)**

Before writing the orchestrator code, verify that the logic you extracted belongs in a hook at all.

*   **Pure Domain Logic:** If a function calculates a value without side effects (e.g., `derivePathReason`, `getRecoveryFingerprint`, `classifyMissingFiles`), it **must not** live inside `useTorrentOrchestrator.ts`.
    *   *Action:* Move these to `src/app/domain/recoveryUtils.ts` or `src/shared/logic/torrentUtils.ts`. The Orchestrator should import them, not define them.
*   **The Orchestrator vs. Sub-Flows:** `useTorrentOrchestrator.ts` is likely too large if it contains the full implementation of Magnet resolution, File Parsing, and Recovery Gating.
    *   *Action:* Create distinct **Sub-Orchestrators** (e.g., `useAddTorrentFlow.ts`, `useRecoveryFlow.ts`).
    *   *Rule:* The main `useTorrentOrchestrator` must act as a **Composition Root**. It should call the sub-hooks and merge their states into a single View Model. It should not contain the raw `useEffect` logic for every domain.

### **2. Define the "View Model" Contract First**

Do not implement the logic yet. First, define the strictly typed interface that `useTorrentOrchestrator` exposes to `App.tsx`.

*   **State:** Define a **Discriminated Union** for the UI state.
    *   *Constraint:* The UI cannot be in "Add Magnet" mode and "Recovery" mode simultaneously. The type system must forbid this.
    *   *Example:* `type ViewState = { mode: 'idle' } | { mode: 'add-magnet'; link: string } | { mode: 'recovery'; session: RecoverySession }`.
*   **Actions:** Define a strictly typed set of **Commands**.
    *   *Constraint:* Do not expose generic `setState` functions. Expose semantic intents (e.g., `cancelFlow`, `confirmSelection`, `retryOperation`).

### **3. The "Shim" Strategy for Wiring**

Once the Contract (Point 2) and File Placement (Point 1) are settled:

1.  **Implement the Composition Root:** Inside `useTorrentOrchestrator`, wire up the dependencies (Client, NativeShell, Toast) and the Sub-Flows.
2.  **Map to the Contract:** Map the internal state of your sub-flows to the clean `ViewState` union you defined.
3.  **Wire App.tsx:** Now—and only now—replace the TODOs in `App.tsx`.
    *   `App.tsx` should effectively become a dumb renderer that takes the `ViewState` and passes it to layout components (like `TorrentRecoveryModal` or `AddMagnetModal`).

### **4. Hard Constraints for Execution**

*   **No Cross-Talk:** Sub-orchestrators (e.g., `useAddTorrentFlow`) must **never** import or call each other. If they need to coordinate, they must bubble events up to the main `useTorrentOrchestrator`, which handles the coordination.
*   **Strict Typing:** `any` and `unknown` are forbidden in the Orchestrator return type. If the legacy code had loose types, define a proper Interface for them at the boundary.
*   **Context usage:** The Orchestrator should receive its data dependencies (like the list of torrents) via arguments or by reading the *Data* hooks directly. It should generally avoid reading the *Action* context to prevent circular dependencies (Action Context -> calls Orchestrator -> reads Action Context).

**Summary of Deliverable:**
I expect to see `App.tsx` wired to a single `orchestrator` object, where `useTorrentOrchestrator.ts` is clean, readable, and composed of smaller, focused domain hooks and pure utility files.