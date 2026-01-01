


---

# The Strategy: Decoupling & Control (Restored)

### Phase 0: Isolation (Stop the Bleeding)
**Intent:** Halt the spread of dependencies immediately.
*   **Action:** Create `engine_impl/`.
*   **Action:** Lock build scripts so `core/` cannot include `libtorrent`.
*   **Constraint:** No new features in the legacy engine until it moves.

### Phase 1: Discovery (The Audit)
**Intent:** Understand the contract without breaking anything yet.
*   **Action:** Scan Core/RPC for every touchpoint with the engine.
*   **Action:** Categorize them: **Essential** (Keep), **Accidental** (Refactor), **Legacy** (Drop).
*   **Constraint:** Read-only. No code changes.

### Phase 2: The Cut (The Hard Boundary)
**Intent:** Break the compilation dependency.
*   **Action:** Define the `tt_engine` C-ABI.
*   **Action:** Implement the `EngineHost` wrapper.
*   **Action:** **Refactor Core/RPC** to speak only to `EngineHost`.
*   **Constraint:** The application must compile without linking *any* engine (calls act as stubs).

### Phase 3: Verification (The Simulation)
**Intent:** Prove the application architecture works.
*   **Action:** Implement `NullEngine` (for build speed).
*   **Action:** Implement `FakeEngine` (for logic).
*   **Action:** Run the UI/RPC flows end-to-end.
*   **Constraint:** Fix application logic bugs here, in the deterministic simulator.

### Phase 4: Integration (The Adapter)
**Intent:** Restore real networking.
*   **Action:** Move libtorrent logic behind the `engine_impl/lt` wall.
*   **Action:** Implement the adapter to translate ABI calls to libtorrent.
*   **Constraint:** **Lossy Adapter.** If libtorrent does X, but ABI only supports Y, do Y. Do not expand ABI for X.

### Phase 5: Validation (The Future)
**Intent:** Prove independence.
*   **Action:** Build a Transmission engine (or simple http downloader) behind the ABI.
*   **Action:** Swap engines via build flag.
*   **Constraint:** No changes to Core/RPC allowed.

---

**Status:** FIXED.
**Reason:** Separated **Analysis** (Phase 1) from **Execution** (Phase 2) to manage risk.