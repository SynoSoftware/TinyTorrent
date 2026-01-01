### What we are trying to achieve — clearly and completely

You are **reclaiming control of your system** by separating *what your application does* from *how torrents are downloaded*, so that **engine choice no longer dictates architecture, binary size, or future velocity**.

This is not about Transmission vs libtorrent.
That’s a *consequence*, not the goal.

---

## The real objective (one sentence)

**Build a single-EXE torrent application whose core is engine-agnostic, size-bounded, deterministic, and fully under your control — so the torrent engine can be replaced, forked, or rewritten without touching the rest of the system.**

Everything else flows from this.

---

## What is broken today (the problem you are solving)

Right now:

* Your **application architecture is shaped by libtorrent**
* libtorrent types, semantics, and policies leak everywhere
* Bugs feel “everywhere” because there is **no containment**
* Binary size is uncontrollable because:

  * Boost + templates + inlining bleed across the codebase
  * Static linking multiplies that cost
* You can’t *experiment* safely:

  * fixing libtorrent bugs deepens lock-in
  * trying Transmission would require surgery everywhere

So every step forward increases regret.

---

## The core idea that fixes all of this

You introduce a **hard engine boundary** with these properties:

* **One direction of dependency**

  * App → Engine API
  * Never Engine → App
* **No engine types cross the boundary**
* **C ABI boundary**, even inside a static EXE

  * This kills template bleed, inline bloat, and accidental coupling
* **Minimal, explicit contract**

  * Only what is required to go from *add → download → complete*
* **Deterministic behavior**

  * Events and snapshots define “liveness” and correctness
  * No hidden background behavior

Once this exists, the torrent engine becomes **just a module**, not the spine of your system.

---

## What success looks like (end state)

At the end of this process:

1. **Your application builds and runs with no torrent engine at all**

   * (using a FakeEngine)
   * proves architecture, UI, RPC, state handling are correct

2. **You can swap engines by changing one build flag**

   * FakeEngine
   * LibtorrentEngine (temporary)
   * TransmissionEngine (final)

3. **The rest of the codebase never changes**

   * Core logic, UI, RPC, state machines are frozen
   * No libtorrent or Transmission headers outside engine_impl

4. **Binary size becomes predictable**

   * All heavy code is below the boundary
   * No Boost / templates / inlining above it
   * Static EXE remains feasible

5. **“Not weaker than libtorrent” becomes testable**

   * Defined by explicit events and timing
   * Not by folklore or assumptions

6. **You own the engine**

   * You can fork Transmission and fix magnet bootstrap
   * Or replace it later with something else
   * Without architectural regret

---

## What this is NOT

* Not a refactor for cleanliness
* Not premature abstraction
* Not theoretical purity
* Not “rewrite everything”
* Not “optimize for size first”

It is **damage containment + future freedom**.

---

## Why the FakeEngine matters (this is crucial)

The FakeEngine is not a toy.

It exists to prove:

* your **core architecture is sound**
* bugs are **not everywhere**
* torrent logic is the only chaos source

If the app behaves correctly with FakeEngine:

* the architecture is right
* the problem is the engine, not you

If it doesn’t:

* you fix your code without libtorrent noise

Either way, you win.

---

## Why the ABI matters more than the engine

Engines come and go.
ABIs define *power*.

By freezing a minimal ABI:

* you prevent scope creep
* you prevent accidental re-coupling
* you stop rewriting history every time a requirement changes

The ABI is the **constitution** of your system.

---

## Why Transmission is a consequence, not the goal

You chose Transmission because:

* it fits inside a small, static, C-style core
* it avoids Boost + template explosion
* it is forkable and patchable

But even if Transmission disappears tomorrow:

* your system still works
* the engine can be replaced again

That is the real achievement.

---

## Final summary

You are doing **one thing**:

> **Decoupling torrent mechanics from application architecture so size, correctness, performance, and future changes are all controllable.**

Everything else — ABI, FakeEngine, libtorrent quarantine, Transmission fork — is just the disciplined execution of that idea.
