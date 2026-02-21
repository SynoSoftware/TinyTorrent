# Torrent Missing Files - Recovery UX Specification (v2026.02)

Companion docs:

- [Recovery UX — Final Acceptance Specification (Post-Implementation).md](Recovery%20UX%20%E2%80%94%20Final%20Acceptance%20Specification%20(Post-Implementation).md)
- [Recovery UX — Engineer Checklist.md](Recovery%20UX%20%E2%80%94%20Engineer%20Checklist.md)
- [Recovery_Implementation_Directions.md](Recovery_Implementation_Directions.md) (non-normative)

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
* Recovery outcomes are closed and mutually exclusive:

	* `AUTO_RECOVERED`
	* `AUTO_IN_PROGRESS`
	* `NEEDS_USER_DECISION`
	* `BLOCKED`
	* `CANCELLED`

* No booleans, no combinations, no overlap, no wrapper reinterpretation.
* Recovery operations are deduplicated per torrent fingerprint while in flight.
* Recovery deduplication may share in-flight work but must not suppress terminal outcomes.

	If an in-flight recovery transitions to:

	* `NEEDS_USER_DECISION`
	* `BLOCKED`
	* `AUTO_RECOVERED`

	the UI must observe that transition exactly once.

	“Already in progress” is not a valid final outcome.

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

Must ask only when no deterministic safe action exists.

### Transmission-specific deterministic-first behavior

* `dataGap` + same path → auto reprobe
* `volumeLoss` likely transient → auto wait + retry
* `pathLoss` and directory recreation safe → auto recreate
* `accessDenied` → auto retry once before escalate

Escalate only if:

* multiple possible valid locations
* path ambiguity
* unsafe default
* repeated deterministic failure

### Must not ask user

* Transient volume/path disruptions that can self-heal via reprobe.
* Local path-loss where directory recreation is safe and supported.
* Cases where automatic recovery succeeds after reprobe/retry.

Rule: background failures should not interrupt the user with a modal unless user input is truly required.

---

## 5. Escalation Policy (Hard)

For user-initiated actions (`Resume`, `Download missing`, `Set location`):

1. Immediately attempt deterministic auto recovery.
2. Emit `AUTO_IN_PROGRESS` and show visible recovering state.
3. Start bounded escalation timer (400–700ms).

When the timer expires:

* If recovery completed → emit `AUTO_RECOVERED`.
* If a meaningful user decision exists → emit `NEEDS_USER_DECISION`.
* If no actionable decision exists → emit `BLOCKED`.

If the gate is certain from the start that a user decision is required (e.g. arbitration conflict, multiple valid paths), it may emit `NEEDS_USER_DECISION` immediately without waiting for the timer.

This removes:

* modal spam
* fake “ask user” cases
* ambiguity between BLOCKED and NEEDS_USER_DECISION

---

## 6. Recovery Outcome Emission Rules

* Exactly one outcome must be emitted per recovery cycle.
* Outcomes are terminal except `AUTO_IN_PROGRESS`.
* `AUTO_IN_PROGRESS` must eventually transition to one of:

  * `AUTO_RECOVERED`
  * `NEEDS_USER_DECISION`
  * `BLOCKED`
  * `CANCELLED`
* No wrapper may reinterpret or override a gate outcome.
* UI mapping must occur in exactly one place.

---

## 7. Modal Behavior Contract

Modal is a hard-stop decision UI, not a status spam channel.

* One active recovery modal at a time.
* Additional recoveries queue; no modal cascade.
* While modal is open, background reprobe continues.
* If same torrent triggers another `NEEDS_USER_DECISION` while modal is open:
	* same root cause → update modal content
	* different root cause → queue
* If issue self-resolves while modal is open:
	* show resolved message with countdown (`3s` default)
	* auto-close modal after countdown
* No auto-open modal on app startup/background polling without user intent.

### BLOCKED vs NEEDS_USER_DECISION

* `NEEDS_USER_DECISION` → at least one meaningful user choice exists.
* `BLOCKED` → no meaningful choice exists; show actionable error UI, not a decision modal.

If you cannot present a real choice, you must not open a modal.

### Action surface discipline

* Keep row/table visually stable. Do not expand action cells to inject extra button stacks.
* Use compact signal + dedicated modal when user decision is required.

---

## 8. Outcome → UI Mapping (Single Location Only)

* `AUTO_IN_PROGRESS` → show recovering indicator
* `AUTO_RECOVERED` → refresh + success state
* `NEEDS_USER_DECISION` → open recovery modal
* `BLOCKED` → show actionable error UI
* `CANCELLED` → no further action

No other code path may trigger recovery UI.

---

## 9. Observable Change Contract (500ms)

Within 500ms of user recovery action, at least one must occur:

* torrent state changes
* recovering indicator appears
* modal appears
* toast appears
* progress badge updates

Silent outcomes are invalid.

---

## 10. Set-Location Contract

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

## 11. Sequencing Rules

* `Retry` means reprobe/re-evaluate availability. It is not a blind multi-step rewrite.
* Use minimal engine sequence required for correctness.
* Keep anti-loop verify guard active; do not re-verify forever when no progress is made.
* Refresh authoritative data after `AUTO_RECOVERED` before claiming success.

---

## 12. Recovery Timing and Configuration

Expose only high-value recovery timing knobs in configuration:

* `timers.recovery.poll_interval_ms`
* `timers.recovery.retry_cooldown_ms`
* `timers.recovery.modal_resolved_auto_close_delay_ms`

Micro-timings remain internal implementation constants to avoid user-facing configuration entropy.

---

## 13. Multiple Concurrent Recovery Problems

Current behavior:

* single modal session
* queued follow-up recoveries
* no cascade

Future enhancement (optional, not default yet):

* grouped recovery inbox in a single modal (grouped by root cause/path/root drive)
* only if it improves clarity without increasing visual noise

---

## 14. Copy Baseline

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

## 15. Core Philosophy in One Paragraph

TinyTorrent should attempt deterministic recovery immediately and silently.
If recovery is ongoing, visibly indicate it.
Only if no safe deterministic path exists after a short bounded attempt should a modal appear.
The modal must represent a true user decision, never a status update.
All recovery outcomes must be mutually exclusive and centrally mapped to UI effects.

---

## 16. Definition of Done

* [ ] Resume/Start/context-row/details recovery actions all pass through the same gate.
* [ ] Unknown confidence never claims specific cause.
* [ ] Background transient recovery does not spam modals.
* [ ] Modal remains hard-stop only and auto-closes after self-resolve countdown.
* [ ] Recovery success is confirmed through refresh/state transition before success messaging.
* [ ] No action-cell expansion regression for recovery controls.
