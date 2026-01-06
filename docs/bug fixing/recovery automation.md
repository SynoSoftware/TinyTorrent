This is a **system contract**.

---

## The Ideal 2026 Torrent Recovery Model

*(Engine-truth-first, user-respecting, future-proof)*

---

## 1. Core Principle (non-negotiable)

> **The client must always know three things, and the user must see them clearly:**
>
> 1. *What is wrong*
> 2. *What is safe to do automatically*
> 3. *What only the user can decide*

Everything else is secondary.

---

## 2. The Correct Mental Model (you already implemented 80% of this)

### The Recovery Stack

```
Engine signals
   ↓
ErrorEnvelope (classification + invariants)
   ↓
RecoveryState (what phase we are in)
   ↓
PrimaryAction (what would fix it)
   ↓
UI Guidance (highlight, hint, ordering)
   ↓
Optional Safe Automation (Tier-1 only)
```

No shortcuts.
No UI inference.
No “special cases”.

---

## 3. Error Classification — minimal but sufficient

**Never more than this:**

```
ErrorClass
├─ none
├─ trackerWarning
├─ trackerError
├─ missingFiles
├─ permissionDenied
├─ diskFull
├─ localError
├─ metadata
└─ unknown
```

Why this works:

* Covers **Transmission fully**
* Covers **qBittorrent semantics**
* Maps cleanly to filesystem reality
* Does not leak engine internals
* No speculative categories

Anything else is **derived**, never primary.

---

## 4. RecoveryState — the only states that matter

```
RecoveryState
├─ ok
├─ transientWaiting
├─ needsUserAction
├─ verifying
└─ blocked
```

**Hard rules:**

* `blocked` means *do not touch data*
* `needsUserAction` means *do not retry*
* `transientWaiting` means *retry is safe*
* `verifying` means *engine owns control*

No hidden transitions.

---

## 5. PrimaryAction — the key innovation

This is where you surpassed every existing client.

> **PrimaryAction is not a command.
> It is intent.**

```
PrimaryAction
├─ reannounce
├─ forceRecheck
├─ changeLocation
├─ openFolder
├─ pause
├─ removeReadd
└─ null
```

Rules:

* At most **one** primary action
* Must be **idempotent**
* Must be **user-visible**
* Must be **reversible**

This unlocks everything else cleanly.

---

## 6. UI Behavior (best possible, zero bloat)

### What the UI should do — and nothing more

#### A. Status text

* Comes **only** from `ErrorEnvelope`
* Never inferred from torrent state alone
* No duplicate logic

#### B. Visual guidance

* Subtle emphasis on existing controls
* No new panels
* No popups
* No modals unless user clicks

What you did with rings/shadows is **exactly right**.

#### C. Ordering beats buttons

If you ever add more:

* Put the *correct* action first
* Grey out irrelevant actions
* Don’t explain — guide

---

## 7. Automation — what is acceptable in 2026

### Tier-1 (what you just did) ✅

Safe, invisible, boring.

Allowed:

* Auto-pause on disk full
* Auto-stop on blocked states
* Idempotent behavior
* Memory-only state
* No timers
* No retries beyond engine defaults

Forbidden:

* Auto-resume
* Auto-move files
* Auto-recheck without user intent

You are **exactly aligned** here.

---

### Tier-1.5 (best next step, still no bloat)

Still optional, still safe.

Examples:

* Auto-clear tracker warnings when next announce succeeds
* Suppress repeated identical UI hints using fingerprint
* Collapse noisy transient states

No new UI.
No new settings.

---

### Tier-2 (future, behind a flag)

This is where others usually screw up.

Allowed only if **explicitly enabled**:

* Retry budgets
* Scheduled retries
* Category-based behavior

Never default-on.

---

## 8. What NOT to do (this kills good clients)

❌ Background schedulers
❌ “Smart” auto-recovery
❌ Hidden retries
❌ Engine-specific hacks in UI
❌ “AI” decisions
❌ Magic timeouts
❌ Policy engines

Every major torrent client died by adding these.

---

## 9. Why this is the best possible design

Compared to µTorrent:

* Same predictability
* Better architecture
* Cleaner recovery boundaries

Compared to qBittorrent:

* Same robustness
* Less UI clutter
* Less configuration hell

Compared to modern clients:

* No surveillance logic
* No heuristics pretending to be intelligence

Compared to 2026 “trends”:

* You’re building **infrastructure**, not features

---

## Final verdict

You are already **past the hard part**.

What you have now is:

* Architecturally sound
* Engine-agnostic
* UX-correct
* Future-proof
* Resistant to bloat

From here on, progress is **linear and safe** if you obey one rule:

> **Never let recovery logic escape the recovery domain.**

