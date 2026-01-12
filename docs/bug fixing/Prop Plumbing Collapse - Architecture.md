## Goal

Collapse the app from “prop plumbing + scattered side effects” into a **single explicit control plane** where:

* **UI is pure surface**: renders state, emits intents.
* **One place owns all side effects**: engine calls, sequencing, dedupe, retries, verify guards.
* **No behavior is triggered implicitly** by effects/callbacks sprinkled across components.
* **Any action is locatable**: you can point to one module and say “this is where resume/recover/setLocation happens.”

This is not about file size. It’s about **ownership** and **execution determinism**.

---

## The core problem (why this exists)

### 1) Ownership drift created parameter soup

Props exploded because the app lacked authoritative shared access points. So “what environment am I in?” and “how do I resume?” got threaded through UI layers as props.

That produces:

* brittle call graphs
* duplicated handlers
* “App.tsx as event bus”
* impossible-to-audit behavior

### 2) Domain logic leaked into UI plumbing

When UI holds recovery sequencing or calls engine methods (even indirectly), you get:

* inconsistent behavior across entry points
* broken recovery (no-op actions, wrong sequencing)
* UI copy lying (confidence vs truth rules)
* loops (verify spam) and stuck states

### 3) Implicit control flow

Effects, callbacks, and handlers become “hidden schedulers.” Execution order is inferred from code shape instead of being declared. You can’t reliably answer:

* “What happens when user hits Resume?”
* “Where is the recovery gate?”
* “Who owns VERIFY_GUARD reset?”

---

## The architecture (what we build)

You already defined the frozen inventory. Here it is as a coherent system, with **strict boundaries**.

### A) TorrentActionsContext — the control plane (“the brain”)

**Purpose:** One authoritative owner for all torrent intents and all engine side effects.

Owns:

* resume / pause / recheck
* setLocation / recreate / redownload
* retryProbe (probe-only)
* openFolder (as an intent)
* recovery gate orchestration (S1–S4 classification usage + confidence)
* in-flight dedupe maps (per torrent fingerprint)
* VERIFY_GUARD + verify watcher semantics
* serialization / deconfliction (no competing recoveries)

Consumes:

* **ServicesContext** for raw effects
* **RecoveryLogic** for classification + decision helpers
* **LifecycleContext** for environment flags
* **UIContext** only for presentation triggers that actions decide to request (e.g., open picker)

Emits:

* **UI-agnostic signals**, not domain objects for UI to interpret:

  * `resume_started`
  * `verify_started`
  * `path_required`
  * `recovery_resolved`
  * `recovery_blocked`
  * (and similar)

**Why:** This creates a single “execution spine.” Every entry point funnels here, so behavior becomes consistent.

---

### B) ServicesContext — transport only (“the hands”)

**Purpose:** Provide raw capabilities and safe execution wrappers. No domain meaning.

Owns:

* engine adapter access
* RPC primitives
* filesystem primitives (where available)
* capability flags
* safeCall normalization

Does NOT own:

* “resume” semantics
* recovery decisions
* verify sequencing
* any “intent” APIs

**Why:** If transport exposes domain helpers, UI will eventually call them directly and you recreate leakage through a new door.

---

### C) RecoveryLogic — pure module (“the rules”)

**Purpose:** Stateless decision helpers used internally by TorrentActions.

Contains:

* S1–S4 classification logic
* confidence rules (certain/likely/unknown)
* verify watcher predicates / timeouts
* anti-loop and VERIFY_GUARD decision logic
* fingerprint derivation rules

Contains NO:

* engine calls
* UI calls
* hooks
* mutable cross-app state (except tiny internal logic helpers if needed; ownership still belongs to TorrentActions)

**Why:** Keeps recovery truth testable and prevents UI from “reasoning” about causes.

---

### D) UIContext — presentation only (“the surface”)

**Purpose:** Centralize user interaction and feedback mechanisms.

Owns:

* toasts
* modals (open/close)
* native pickers (pickFolder)
* OS shell open (openFolder(path))

Does NOT:

* call engine
* decide recovery state
* interpret RecoveryOutcome
* decide which recovery action is correct

**Why:** UI can be swapped/re-themed/restructured without changing recovery correctness.

---

### E) LifecycleContext — environment facts (“the world state”)

**Purpose:** Read-only flags about runtime context.

Owns:

* `serverClass`
* `rpcStatus`
* native integration flags
* platform flags

**Why:** These are orthogonal facts; passing them as props is exactly the smell you’re eliminating.

---

### F) SelectionContext — identity only (“the pointer”)

**Purpose:** Own selection and focus identity, not data.

Owns:

* selected IDs
* active row ID
* focus ownership

Does NOT own:

* TorrentDetail objects

**Why:** Otherwise selection becomes a second data store and you get desync bugs.

---

### G) TelemetryContext — derived metrics (“the pulse”)

**Purpose:** Read-only derived and historical metrics.

Owns:

* speed history refs
* optimistic statuses
* derived display metrics

**Why:** Keeps UI fast and avoids recomputation everywhere; also prevents threading telemetry props through tables.

---

## The single most important invariant

> **Every user-visible entry point that can cause a torrent state change must funnel into TorrentActions.**

Entry points include:

* row buttons (Download missing / Retry / Locate)
* context menus
* toolbar Resume/Start
* details panel actions
* modal primary actions

If any bypass exists, you will get divergent behavior again.

---

## Why Phase-2 is a “deletion compiler pass”

Phase-1 established the control plane. Phase-2 is not “refactor.” It’s a **mechanical elimination of illicit data paths**.

The order matters because dependencies are real:

### Step 1 — Lifecycle reads

Remove `serverClass`, `rpcStatus`, `nativeIntegration` from props.
Reason: these are global facts; keeping them in props keeps the plumbing alive and blocks later simplification.

### Step 2 — Action callbacks

Remove `onOpenFolder`, `onRetry`, `onSetLocation`, `onRedownload`, etc.
Replace with direct `useTorrentActions()` usage in leaf components.
Reason: until these are gone, App continues to be an event bus and ownership is still split.

### Step 3 — Selection plumbing

Remove `selectedTorrents`, `onSelectionChange`, `activeRow` propagation.
Replace with `useSelection()` reads/writes.
Reason: selection is high-churn state; once actions are stable, selection removal becomes safe and clean.

**Why the strict order:** Jumping to Step-3 produces “clean-looking UI” while action ownership still leaks, creating a false sense of completion and leaving the real bug surface intact.

---

## How this architecture prevents the recovery bugs

Your recovery spec demands:

* truthful copy tied to confidence
* probe-only retry semantics
* no infinite verify loops
* correct minimal engine sequences
* consistent behavior across entry points
* UI never guessing causes

This architecture enforces that by design:

* UI cannot accidentally “decide” recovery state because it doesn’t have the raw signals or authority.
* Transport cannot sneak in recovery semantics because it only exposes primitives.
* RecoveryLogic can’t mutate the world because it has no side effects.
* TorrentActions can enforce:

  * dedupe
  * VERIFY_GUARD
  * watcher timeouts
  * consistent transitions/signals

So “Download missing” means the same thing no matter where it’s triggered.

---

## What “done” looks like (architecturally)

You’ll know this architecture is actually achieved when:

1. **App.tsx stops being a conductor**

* no recovery handlers
* no engine calls
* no event bus callbacks

2. **No intermediate components forward environment or actions**

* `WorkspaceShell`, `Dashboard_Layout` are layout only

3. **Tables/ColumnDefs no longer require table meta callbacks for domain**

* they call hooks directly (actions/lifecycle/telemetry/selection)

4. **Engine call search**

* engine calls appear only in TorrentActions (and Services wrappers)

5. **Recovery entry points converge**

* every surface calls the same action gate, no duplicated flows

---

## Why this is the best architecture for your system

Because your core complexity is not rendering. It’s **side-effect sequencing under uncertain state** (RPC vs local truth, mounts, permissions, incomplete pieces).

The winning architecture is the one that:

* makes side effects owned, serialized, deduped, and testable
* prevents UI from re-implementing domain decisions
* collapses call graphs so you can audit behavior quickly

That is exactly what the control-plane + pure rules + transport primitives model achieves.




---


----------------------------------------------------------------------
------------------------------ OPTIONAL ------------------------------
----------------------------------------------------------------------

## Phase-3 (Optional): Post-Collapse Cleanup & Invariant Tightening

> **Status:** Optional
> **Precondition:** Phase-2 (Prop Plumbing Collapse — Stages 1–3) is fully complete and verified.
> **Constraint:** No behavior or UX changes. No new features. No new contexts.

### Purpose

Leverage the completed control plane and explicit ownership to:

* remove transitional structures that only existed to bridge pre-collapse wiring
* tighten internal invariants now that implicit dependencies are gone
* simplify reasoning and auditing without changing outcomes

This phase exists to **reduce cognitive load**, not to change system behavior.

---

### Scope (Allowed Work Only)

#### 1) Pure Logic Extraction

* Extract **RecoveryLogic** into a stateless module:

  * S1–S4 classification
  * confidence determination
  * VERIFY_GUARD predicates
  * anti-loop rules
* Ensure it has:

  * no hooks
  * no engine calls
  * no UI calls
* TorrentActions remains the sole caller and owner of effects.

#### 2) Transitional Adapter Removal

* Delete adapters introduced solely to support old plumbing:

  * pass-through hooks
  * shim callbacks
  * compatibility layers that no longer serve a caller
* Collapse duplicate logic that became redundant after Phase-2.

#### 3) Invariant Tightening

* Assert and document invariants that are now guaranteed:

  * TorrentActions is the only engine caller
  * UI cannot invoke recovery semantics directly
  * Selection identity exists only in SelectionContext
* Replace defensive checks made obsolete by Phase-2 with clear assertions where appropriate.

#### 4) Dead Code & Comment Pruning

* Remove:

  * unreachable branches
  * TODOs referencing pre-collapse behavior
  * comments explaining why props were forwarded (now impossible)
* Keep documentation that explains **why** invariants exist, not how they were worked around.

---

### Non-Goals (Explicitly Forbidden)

* ❌ No prop rewiring of any kind
* ❌ No changes to action semantics
* ❌ No UI restructuring or visual changes
* ❌ No new contexts or providers
* ❌ No renaming of public APIs
* ❌ No performance “optimizations” that alter execution order

If a change affects runtime behavior, it does **not** belong in Phase-3.

---

### Verification (Optional but Recommended)

Phase-3 is considered complete if:

1. **Ownership Audit**

   * Engine calls exist only in TorrentActions (and Services wrappers).
2. **Purity Audit**

   * RecoveryLogic contains no hooks, UI calls, or side effects.
3. **Diff Audit**

   * No observable behavior changes in recovery, resume, or selection flows.
4. **Deletion Audit**

   * No remaining adapters whose sole purpose was pre-collapse plumbing.

---

### Exit Rule

Phase-3 has **no deadline** and **no required deliverables**.
It may be partially executed, deferred, or skipped entirely.

The system is considered **architecturally complete** at the end of Phase-2.

---
