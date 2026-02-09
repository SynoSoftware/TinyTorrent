This is a recovery automation contract.

---

## 1. Purpose

Recovery automation exists to keep transfers moving without bothering users for temporary problems.

Principle:

1. auto-heal first when safe
2. ask user only when a real decision is required
3. keep UI calm (no cascades, no visual noise)

---

## 2. Automation Boundary

### Allowed automation

* background reprobe for transient path/volume conditions
* safe local directory recreation for path-loss when authoritative local mode can do it
* automatic retry/resume sequencing when gate determines it is safe
* modal self-resolve auto-close countdown when issue resolves in background

### Disallowed automation

* guessing root cause when confidence is `unknown`
* destructive actions (remove/re-add, move files automatically)
* UI surface spam (multiple modal popups, action-cell expansion)
* hidden loops without anti-loop guard

---

## 3. Ask User Policy

Ask user only for:

* choosing/changing path (`locate` / `choose location`)
* unresolved access/permission decision
* explicit user command that still cannot proceed after safe automation

Do not ask user for:

* transient disruptions that recover during reprobe
* background interruptions where automated flow can safely continue

---

## 4. Runtime Cadence Discipline

Recovery cadence is intentionally minimal and configurable only for high-value knobs:

* `timers.recovery.poll_interval_ms`
* `timers.recovery.retry_cooldown_ms`
* `timers.recovery.modal_resolved_auto_close_delay_ms`

Micro-timers remain internal constants to avoid configuration bloat and user confusion.

---

## 5. Modal Automation Contract

When recovery modal is open:

* background reprobe must continue
* if resolved, show resolved countdown and auto-close
* no modal cascade for multiple torrents (single active modal + queue)

---

## 6. Control Plane Rule

All automation decisions are gate-owned.

* UI may render status and trigger typed intents
* UI must not run recovery sequencing logic
* gate outcomes must remain explicit and deterministic

---

## 7. Summary Rule

Automation must reduce user interruptions and increase continuity.
If automation increases noise or ambiguity, it is a regression.
