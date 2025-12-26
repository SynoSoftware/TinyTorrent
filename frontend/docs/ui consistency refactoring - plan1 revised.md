This is the **"Final Desired State" Master Plan**. It is compacted for speed but enhanced for **Forensic Integrity**. It ensures that GPT-5 does not just "edit code," but **re-architects the interface** into a single, unified organism.

---

### **The "Workbench Sovereign" Plan: Final Phase**

#### **Goal:** 
Total transition from **Numeric Utility Scaling** (Tailwind numbers) to **Semantic Logical Roles** (Workbench Tokens). 

---

### **Phase 1: The Source of Truth (Infrastructure)**
*Ensure these files are the only places where math or pixels exist.*

1.  **`src/config/constants.json`**: Define **Logical Units** (integers).
    *   *Example:* `"padding_panel": 6`, `"gap_stage": 4`.
2.  **`src/index.css` (@theme)**: Define **Arithmetic Authority**.
    *   Every token must follow: `calc(var(--u) * [units_from_json] * var(--z))`.
    *   **Tokens Required:** `--tt-p-panel`, `--tt-p-tight`, `--tt-gap-stage`, `--tt-gap-tools`, `--tt-h-nav`, `--tt-h-status`, `--tt-h-row`, `--tt-size-btn`.
3.  **`src/config/logic.ts`**: Define **The Variable Bridge**.
    *   Delete all numeric fallbacks. Export only `var(--tt-...)` strings.

---

### **Phase 2: The Forensic Audit (The "Anti-Lazy" Step)**
*Force the AI to index the codebase before it is allowed to modify it.*

**Task:** GPT-5 must scan **every** `.tsx` file and generate a mapping table.
*   **Target:** Every `p-`, `m-`, `gap-`, `h-`, `w-`, and `size-` utility with a number or `[]`.
*   **Logic:** Assign each finding to a **Role**:
    *   **Panel Padding** (`p-panel`): Interior of Cards/Modals/Panels.
    *   **Tight Padding** (`p-tight`): Chips, menu items, small badges.
    *   **Stage Gap** (`gap-stage`): Distance between major UI sections (Sidebar vs. Table).
    *   **Tool Gap** (`gap-tools`): Distance between buttons, inputs, tabs.
    *   **Structural** (`h-nav`, `h-status`, `h-row`): Main layout heights.

---

### **Phase 3: The Confidence Sweep (Visual Restoration)**
*Apply the design rules that make it look like "High-End Software."*

1.  **Sizing Purge:** Remove `size="sm"` globally. HeroUI must default to `size="md"` for a "Confident" feel.
2.  **Shadow Authority:** Primary buttons (Add, Download, Save) must use `variant="shadow"`.
3.  **Bracket Death:** Zero `[...]` brackets allowed in `.tsx` for geometry. If a specific calculation is needed, move it to `index.css` as a named token (e.g., `--tt-sidebar-max-w`).
4.  **Glass Uniformity:** All `GlassPanel` components must use the same `backdrop-blur-2xl` and `bg-opacity` derived from the central theme.

---

### **Phase 4: Structural Hardening (The Engine)**
*Fix the "Hollow" feel of the app.*

1.  **Zod at the Gate:** Replace all `z.any()` in `rpc-base.ts` with `zRpcMutationResponse`. No silent failures.
2.  **Deterministic Selection:** Fix `TorrentTable.tsx` so that marquee-dragging does not accidentally trigger a row-click (implement distance-based intent detection).
3.  **Heartbeat Integrity:** Ensure `heartbeat.ts` uses `JSON.stringify` for hashing to detect 100% of backend changes (renames, errors, etc.).

---

### **Phase 5: The "Finalized" Validation (The Scale Test)**
*The proof that the "Desired State" has been reached.*

1.  **The Grep Test:** `grep -r "p-[0-9]" src/` should return **zero** results. Only `p-panel` or `p-tight` should remain.
2.  **The Scale Test:** Change `--u` from `4px` to `6px` in `index.css`. The **entire** app—spacing, icons, and text—must expand perfectly. If it doesn't, a magic number is still hiding.

---

### **The "Direct Order" Prompt for GPT-5-mini**

**Copy and paste this to the AI to stop the mechanical guessing and start the Forensic Restoration:**

> "You are now in **Forensic Architect Mode**. We are moving away from 'Pixel Guessing' to **'Logical Role Authority.'** 
>
> **Step 1: The Audit (DO NOT EDIT CODE YET)**
> Scan all files in `src/` and provide a table of every numeric tailwind utility (`p-X`, `gap-X`, `h-X`, etc.). Map each one to its **Logical Role**: `Panel Padding`, `Tight Padding`, `Stage Gap`, `Tool Gap`, or `Structure`.
>
> **Step 2: The Migration**
> Once the audit is listed, replace the numeric utilities with the semantic tokens:
> - `p-panel`, `p-tight`
> - `gap-stage`, `gap-tools`
> - `h-nav`, `h-status`, `h-row`, `size-btn`, `size-btn-lg`
>
> **Step 3: Visual Authority**
> - Delete all `size="sm"` from HeroUI components.
> - Replace all arbitrary brackets `[...]` with semantic CSS tokens from `index.css`.
> - Replace `z.any()` in the RPC layer with `zRpcMutationResponse`.
>
> **Rule of Finish:** The project is only complete when **zero** numeric literals exist in the `.tsx` layout classes. Every pixel must be a slave to the `--u` unit in `index.css`. 
>
> **List the Forensic Audit for the first 5 major UI files now.**"

---

### **Why this version works:**
*   It **compresses** the architecture into roles (Panel, Tight, Stage, Tool).
*   It **enhances** the audit by making the AI prove it has seen every file.
*   It **skips nothing**: it keeps the RPC hardening and the "Confident" UI rules from previous steps. 

**Wait for the AI to provide that Forensic List before allowing it to write code.**