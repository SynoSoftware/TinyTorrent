## Classify what remains (this matters)

### ✅ Category A — **Geometry (must be tokenized)**

Already handled correctly:

* Row height
* Icon size
* Font size
* Padding
* Context menu spacing
* Table dimensions

These belong to the **visual geometry system** → CSS authority.

---

### ⚠️ Category B — **Interaction physics (must NOT be CSS)**

Examples you found:

* `MAX_PAN_OFFSET = 60`
* Drag limits
* Scroll inertia bounds
* Gesture thresholds

These are:

* Input-domain constraints
* Device-dependent
* Often nonlinear
* Sometimes frame-rate dependent

**These do NOT scale with zoom.**
They scale with **motor control**, not optics.

🔒 **Rule**
If changing zoom should NOT change behavior → it does not belong in CSS.

Leave these in TS.

---

### ⚠️ Category C — **Scene geometry (visualization space)**

Examples:

* PeerMap radius = 70
* PeerMap center = 90

These are:

* Coordinate-space definitions
* Visualization math
* Not UI chrome

They may *reference* CSS scale indirectly, but they are not UI layout.

Correct future approach (not now):

```ts
const unit = getCssUnit(); // --u
const radius = 18 * unit; // scene-specific mapping
```

But this is a **manual design decision**, not an automated refactor.

Do not touch these in bulk.

---

### ⚠️ Category D — **Perceptual constants**

Example:

* `MIN_HANDLE_VISUAL_WIDTH = 1`

This maps to:

* Border visibility threshold
* Contrast perception
* Not zoom-linear

Correct mapping:

* Fixed in px
* Or clamped (as you already defined with `--bw`)

But again: **manual**, not automated.

---

## Why continuing now would break the system

If you continue auto-migrating:

* You will push **behavioral constants** into CSS
* Zoom will start affecting drag physics
* Visualizations will distort unpredictably
* You’ll recreate the same “everything scales” bug you just diagnosed

That’s how systems rot quietly.

---

## What to do instead (the correct next step)

### ✅ Declare the boundary explicitly

Add this rule (conceptually, not necessarily as code yet):

> CSS owns **visual geometry only**
> TS owns **interaction, physics, and models**

No constant crosses that line without intent.

---

### ✅ Lock the geometry migration as “complete”

At this point you have:

* No TS reading px geometry
* CSS is authoritative
* constants.json is intent-only
* Zoom is centralized

That is a **valid checkpoint**.

Stop here.

---

### ✅ Next real task (not scanning)

The next *correct* task is one of these:

1. **Enforcement**

   * ESLint rule / grep check that forbids:

     * `px`
     * `text-[`
     * `h-[`
   * Outside visualization folders only

2. **Density law**

   * Implement `[data-density]` modifiers that adjust `--row`
   * Verify table + inspector behavior

3. **Perceptual scaling refinement**

   * Clamp borders, blur, stroke
   * Test zoom extremes (0.85 → 1.35)

All of those are **design-law work**, not migration work.

---

## One-line directive (the one to follow)

> Stop scanning. Geometry migration is complete. Remaining numeric constants are non-visual or model-level and must not be auto-tokenized.

If you want, next I can:

* Define a **hard lint rule** that prevents regression, or
* Walk through **one** visualization (PeerMap) and refactor it *intentionally* using the new laws.

But do not keep scanning blindly.
