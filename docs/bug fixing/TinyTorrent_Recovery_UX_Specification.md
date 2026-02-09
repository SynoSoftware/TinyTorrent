
# Torrent Missing Files - Recovery UX Specification (v2026.02)

## 1. Product Objective

TinyTorrent must prioritize download continuity:

* recover automatically whenever safe
* ask the user only when a real user choice is required
* never spam modals or expand row actions into visual noise
* stay truthful when confidence is low

---

## 2. Hard Invariants

* Exactly one recovery gate owns recovery decisions and sequencing.
* All recovery entry points converge into that gate.
* UI does not infer causes or run engine sequences directly.
* Recovery outcomes are typed and explicit (`handled | continue | cancelled | not_required | ...`).
* Recovery operations are deduplicated per torrent fingerprint while in flight.

---

## 3. State and Confidence Model

Classification remains:

* `dataGap`
* `pathLoss`
* `volumeLoss`
* `accessDenied`

Confidence remains:

* `certain`
* `likely`
* `unknown`

Copy contract:

* If confidence is `unknown`, use `Location unavailable`.
* Never claim `Drive disconnected` or `Folder missing` when confidence is `unknown`.

---

## 4. Ask User vs Auto-Recover Policy

### Must ask user

* A path decision is required (`locate`, `choose location`) and no safe default exists.
* Access-denied cannot be resolved by automatic retry/reprobe.
* The user explicitly initiated a recovery-like command (`Resume`, `Set location`, `Download missing`) and gate still cannot proceed automatically.

### Must not ask user

* Transient volume/path disruptions that can self-heal via reprobe.
* Local path-loss where directory recreation is safe and supported.
* Cases where automatic recovery succeeds after reprobe/retry.

Rule: background failures should not interrupt the user with a modal unless user input is truly required.

---

## 5. Modal Behavior Contract

Modal is a hard-stop decision UI, not a status spam channel.

* One active recovery modal at a time.
* Additional recoveries queue; no modal cascade.
* While modal is open, background reprobe continues.
* If issue self-resolves while modal is open:
  * show resolved message with countdown (`3s` default)
  * auto-close modal after countdown
* No auto-open modal on app startup/background polling without user intent.

### Action surface discipline

* Keep row/table visually stable. Do not expand action cells to inject extra button stacks.
* Use compact signal + dedicated modal when user decision is required.

---

## 6. Set-Location Contract

Set-location must support both browse and manual workflows.

* Browse is preferred when available.
* Manual entry is required fallback when browse is unavailable or user requests manual mode.
* Arbitration is explicit:
  * `acquired`
  * `already_owned`
  * `conflict`
* Outcomes are explicit:
  * `picked | manual_opened | cancelled | unsupported | conflict | failed`

After successful location update, recovery sequence must continue (location update is not terminal).

---

## 7. Sequencing Rules

* `Retry` means reprobe/re-evaluate availability. It is not a blind multi-step rewrite.
* Use minimal engine sequence required for correctness.
* Keep anti-loop verify guard active; do not re-verify forever when no progress is made.
* Refresh authoritative data after handled recovery before claiming success.

---

## 8. Recovery Timing and Configuration

Expose only high-value recovery timing knobs in configuration:

* `timers.recovery.poll_interval_ms`
* `timers.recovery.retry_cooldown_ms`
* `timers.recovery.modal_resolved_auto_close_delay_ms`

Micro-timings remain internal implementation constants to avoid user-facing configuration entropy.

---

## 9. Multiple Concurrent Recovery Problems

Current behavior:

* single modal session
* queued follow-up recoveries
* no cascade

Future enhancement (optional, not default yet):

* grouped recovery inbox in a single modal (grouped by root cause/path/root drive)
* only if it improves clarity without increasing visual noise

---

## 10. Copy Baseline

Core strings:

* `Missing files`
* `Download missing`
* `Locate...`
* `Retry`
* `Waiting for drive...`
* `Location unavailable`
* `Drive detected`
* `Recovery completed. Closing in {{seconds}}s...`

---

## 11. Definition of Done

* [ ] Resume/Start/context-row/details recovery actions all pass through the same gate.
* [ ] Unknown confidence never claims specific cause.
* [ ] Background transient recovery does not spam modals.
* [ ] Modal remains hard-stop only and auto-closes after self-resolve countdown.
* [ ] Recovery success is confirmed through refresh/state transition before success messaging.
* [ ] No action-cell expansion regression for recovery controls.

