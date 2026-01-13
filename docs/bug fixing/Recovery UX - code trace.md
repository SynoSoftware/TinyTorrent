Progress update: I inspected useTorrentOrchestrator, useOptimisticStatuses, recovery-controller, missingFilesStore, and useRecoveryController and used the repo search to find where optimistic statuses and recovery flows are used. Below is the requested read-only behavioral enumeration (no code changes, no fixes).

Matrix of scenarios (each scenario lists branches where timing makes behavior ambiguous)

Scenario 1 — UI-initiated Recheck (user clicks "Recheck") when torrent is PAUSED / IDLE

Initial state
torrent.state = PAUSED (or other non-active), verificationProgress = undefined or 0
recoverySession = null
optimistic overlay = none
User action
Action: Recheck via UI (mapped to recheck action in useTorrentWorkflow.runActionsWithOptimism)
Engine behavior (inferred from code + Transmission-like semantics)
UI calls updateOptimisticStatuses → optimistic state set to CHECKING.
executeTorrentAction triggers the recheck intent (workflow → orchestrator).
requestRecovery → runMissingFilesFlow → runMissingFilesRecoverySequence:
determineShouldVerify returns true because torrent is not active.
client.verify([id]) is called.
Engine transitions to a CHECKING / check_wait state and runs file verification.
watchVerifyCompletion polls getTorrentDetails until state leaves checking.
After verify finishes, orchestrator calls client.resume([id]) (runMinimalSequence resumes the torrent).
recordVerifyAttempt(fingerprint,leftAfterVerify) is set.
UI behavior
Immediately: table row shows optimistic CHECKING (override).
During verify: UI reads verificationProgress from engine and shows real progress (progress bar moves).
Recovery UI: not shown (no errorEnvelope) unless engine reports an error during verify.
If verificationProgress reaches 1 and engine leaves CHECKING, optimistic override is removed by useOptimisticStatuses and UI reconciles to engine truth (torrent becomes DOWNLOADING / SEEDING / IDLE depending on resume outcome).
Termination condition
UI returns to engine-truth when torrent.state !== CHECKING and verificationProgress is not <1 (i.e., when engine reports verification finished or engine not-checking).
Scenario 2 — UI-initiated Recheck while torrent is DOWNLOADING (active)

Initial state
torrent.state = DOWNLOADING (active)
recoverySession = null
optimistic overlay = none
User action
Action: Recheck via UI
Engine behavior
updateOptimisticStatuses sets optimistic state CHECKING (UI override).
requestRecovery → runMissingFilesFlow → runMissingFilesRecoverySequence:
determineShouldVerify returns false because torrent is active.
The controller will not run client.verify. The minimal sequence calls client.resume([id]) (a no-op in many clients) and returns resolved/noop.
No engine CHECKING state is entered (or it's extremely brief/absent).
UI behavior
Immediate optimistic CHECKING flash may appear.
On next torrent data update (engine still DOWNLOADING and verificationProgress not <1) useOptimisticStatuses clears the optimistic entry — the row reverts to DOWNLOADING.
Progress bar: remains download progress (no verify progress).
Recovery UI: none.
Termination condition
Immediate reconciliation on next torrent refresh: optimistic cleared because torrent.state !== CHECKING.
Scenario 3 — User Pauses a torrent while engine is performing VERIFY (pause during CHECKING)

Initial state
torrent.state = CHECKING (engine is mid-verify)
recoverySession possibly null (depends on how verify started)
optimistic overlay possibly set to CHECKING (if user initiated) or absent (if engine started verify)
User action
Action: User clicks Pause (calls pause intent)
Engine behavior — two branches (timing-sensitive)
A. Pause processed before any post-verify resume step executes
Engine transitions to PAUSED.
watchVerifyCompletion (if part of a recovery verify watcher) observes state left checking; since PAUSED is not a terminal error, it returns success=true and leftUntilDone whatever is reported.
The recovery flow will later call client.resume([id]) (see runMinimalSequence). That resume call may re-activate the torrent (race: resume may override user's pause).
B. Pause processed after recovery flow's resume call

Engine may briefly go to PAUSED, then resume is invoked, returning torrent to DOWNLOADING or SEEDING.
UI behavior
When user clicks Pause UI sets optimistic state to PAUSED (via updateOptimisticStatuses).
useOptimisticStatuses cleanup: it deletes optimistic entries when torrent.state !== CHECKING and not verifying; therefore:
If engine becomes PAUSED and engine reports PAUSED quickly, optimistic entry will be removed and UI will display engine PAUSED (consistent).
If the recovery flow's resume call happens after user pause, engine state may flip back to DOWNLOADING — user sees pause then resume (possible unexpected resume).
Progress bar: verificationProgress stops/locks if engine aborted verify; otherwise watchVerifyCompletion reports leftUntilDone so UI may show final verify progress.
Termination condition
UI reconciles to engine truth when torrent.state and verificationProgress show non-CHECKING; but note the race: recovery flow's unconditional client.resume can cause engine to resume despite user's pause, producing an observable mismatch (see "violates engine truth" list).
Scenario 4 — User deletes a torrent while engine is CHECKING (delete during verify)

Initial state
torrent.state = CHECKING
recoverySession may be active for this torrent (or not)
optimistic overlay possibly CHECKING
User action
Action: Delete / Remove (UI delete intent), possibly with "delete data"
Engine behavior
performUIActionDelete is called:
marks removed in UI (markRemoved), clears selection/detail, clears verify guard entry and cached probe.
removes pending recovery queue entries for this fingerprint.
if recoverySession fingerprint matches, calls finalizeRecovery({status:'cancelled'}) which aborts recovery controller and resolves the recovery promise.
dispatches TorrentIntents.ensureRemoved(targetId, deleteData) (engine remove request).
Engine will process the remove — stop verify and remove torrent and optionally delete files.
UI behavior
Row is marked removed immediately (UI removed/hidden by isRemoved gating).
Recovery modal (if open) is closed via finalizeRecovery.
optimisticStatuses entries for that id will be meaningless after remove and are cleared because torrent is removed from list.
If remove fails (dispatch throws), unmarkRemoved is called and user receives feedback.
Termination condition
UI returns to engine-truth when the engine confirms removal or when remove fails and unmarkRemoved restores row. No persistent stuck state expected because finalizeRecovery resolves pending recovery and queue entries are cleared.
Scenario 5 — Engine detects CRC / missing-files (torrent gets errorEnvelope), then user clicks Resume (CRC-triggered recheck / recovery flow)

Initial state
torrent.state = ERROR or MISSING_FILES
torrent.errorEnvelope present (errorClass often "missingFiles")
recoverySession = null
optimistic overlay = none
User action
Action: User clicks Resume (or UI tries to resume automatically)
Engine behavior (per orchestrator + recovery-controller)
resumeTorrentWithRecovery sees torrent.errorEnvelope → calls requestRecovery({action:'resume'}).
requestRecovery calls runMissingFilesFlow → runMissingFilesRecoverySequence:
classifyMissingFilesState produces classification (path_missing, data_missing, volumeLoss, etc).
If classification implies path missing / volumeLoss:
ensurePathReady may probe path; if path is unavailable it returns needsModal with path-needed outcome.
If path is available and determineShouldVerify says verify needed, client.verify([id]) will run; watchVerifyCompletion observes verify completion and then client.resume([id]).
If classification indicates missing data and shouldVerify is true, verify runs.
If a blocking modal is required (e.g., path missing, permission denied, disk-full) the sequence resolves status "needsModal" with a blockingOutcome.
If the sequence resolves with status "resolved" the controller clears verify guard and returns success; orchestrator will call refreshAfterRecovery, show feedback and finalizeRecovery({status:'handled'}).
UI behavior
If needsModal is returned:
requestRecovery will either return a blockingOutcome (for recheck it returns handled with blockingOutcome; for resume it will be used by useRecoveryController).
useTorrentOrchestrator enqueues a recovery session: startRecoverySession(...) which sets recoverySession state and recoveryCallbacks are wired to UI.
Recovery modal / flow becomes visible to user (pick path, recreate folder, retry).
If verify is started:
UI may show CHECKING (if optimistic) and a verification progress bar sourced from engine verificationProgress.
If path reattached by auto-detect (volumeLoss polling) the orchestrator calls resolveRecoverySession and the engine may resume automatically; UI shows toast feedback and closes recovery modal.
If verify completes with leftAfterVerify === 0, the controller returns log: "all_verified_resuming" and UI shows special toast.
Termination condition
If resolved, orchestrator calls finalizeRecovery and clears session; UI returns to engine-truth after refreshAfterRecovery.
If needsModal and user never acts, recoverySession persists until user cancels or the orchestrator cancels it (delete or finalize), so recovery UI remains open and consistent with the blockingOutcome.
Scenario 6 — Auto volume-restore while a recoverySession exists (engine drive re-appears)

Initial state
torrent has errorEnvelope, classification volumeLoss
recoverySession may be active or null
volumeLossPollingRef not currently watching this torrent (or is)
Event / User action
Engine path becomes available (drive reconnected) — detected by pollPathAvailability called in periodic serverClass === 'tinytorrent' interval or explicit probe.
Engine behavior
pollPathAvailability resolves success: true.
orchestrator calls resolveRecoverySession(torrent, { notifyDriveDetected: true }).
runMissingFilesFlow is invoked again and will attempt verify/resume as required.
If resolved, orchestrator calls finalizeRecovery({status:'handled'}), clears probe and verify guard.
UI behavior
If a recovery modal was open, it either:
remains visible while resolveRecoverySession runs (UI shows spinner/busy), then closes on success, or
if it was not visible, UI will briefly show toast feedback and may refresh table.
Recovery UI visibility: can be auto-closed after success.
Termination condition
UI returns to engine-truth after refresh; recoverySession cleared via finalizeRecovery. If probe returned success but verification fails, recoverySession will show blockingOutcome.
Scenario 7 — User triggers Retry Fetch / "Retry" from recovery UI (retry-only path)

Initial state
torrent.errorEnvelope exists
recoverySession active (blockingOutcome shown) OR user initiates retry manually
optimistic overlay none
User action
Action: Retry (or executeRetryFetch is called which sets retryOnly: true)
Engine behavior
requestRecovery is called with options.retryOnly:
runMissingFilesFlow is called with retryOnly; in runMissingFilesRecoverySequence, if (options?.retryOnly) { resolve({status: 'noop', classification}); return; }
So retryOnly avoids heavy path work and returns noop; orchestrator then clears cached probe and tries to ensureActive if shouldResume.
That may start the engine (resume) without a prior verify.
UI behavior
Recovery UI: stays open initially until the orchestrator calls refreshAfterRecovery and handleRecoveryClose (if executed from recovery callbacks). If executeRetryFetch came from recovery UI, handleRecoveryRetry calls it then handleRecoveryClose to close UI.
The torrent may be requeued/resumed; no verification progress shown (no verify call).
If resume fails, UI shows "retry failed" toast.
Termination condition
UI returns to engine-truth after refresh or shows a failure toast if resume fails.
Scenario 8 — Verify is skipped by VERIFY_GUARD (repeated verifying attempts)

Initial state
fingerprint = envelope.fingerprint (or hash/id)
earlier verify attempt recorded via recordVerifyAttempt(fingerprint, leftAfterVerify)
torrent.leftUntilDone matches recorded left
User action
Action: user triggers recheck or a recovery flow calls verify again
Engine behavior
shouldSkipVerify(fingerprint, left) returns true (VERIFY_GUARD finds same left), therefore runMinimalSequence treats verify as skipped:
It sets classification override and proceeds to resume; no client.verify call.
No engine CHECKING state occurs.
UI behavior
If user clicked recheck, optimistic CHECKING is set briefly and then cleared once torrent state is observed (not CHECKING).
Because verify was skipped, no verificationProgress is shown.
The recoverySession, if any, may be resolved as resolved (no-op resume) and UI shows "download_resumed" or similar toast depending on log.
Termination condition
Immediate reconciliation on refresh; optimistic cleared quickly.
Scenario 9 — Concurrent recovery requests deduped by IN_FLIGHT_RECOVERY

Initial state
Multiple UI actions or internal flows call runMissingFilesRecoverySequence for same fingerprint concurrently
User action
e.g., user clicks Resume and also triggers Redownload/Retry quickly
Engine behavior
IN_FLIGHT_RECOVERY Map dedupes calls and returns same Promise to all callers; the first caller drives verify/resume flow, others await the same result.
UI behavior
Multiple callers awaiting the same Promise: UI consumers show whichever UI they drive (one recoverySession is started by orchestrator); other inflight callers do not start separate sessions.
If the shared promise resolves to needsModal, orchestrator may create a single recoverySession; if resolved resolved all waiters see same resolution.
Termination condition
Single resolution returns to all waiting UIs; no additional sessions created for the same fingerprint while in-flight.
Scenario 10 — No path / permission / disk-full blocking outcome (modal required)

Initial state
torrent.errorEnvelope indicates missingFiles / permissionDenied / diskFull
classification yields path_missing / accessDenied / volumeLoss
User action
Action: User attempts Resume or Redownload
Engine behavior
ensurePathReady returns blockingOutcome (path-needed/unwritable/disk-full) or pollPathAvailability fails; runMissingFilesRecoverySequence resolves status: needsModal with blockingOutcome.
No client.verify or client.resume happens until user resolves modal (pick path / recreate / retry).
UI behavior
startRecoverySession is called; recoverySession state set with outcome.
Recovery modal / UI shows path pick, recreate folder, retry options (via useRecoveryController.recoveryCallbacks).
If user picks a new path and handlePickPath resolves with resolved, orchestrator calls ensureAtLocation and then resolveRecoverySession which runs runMissingFilesFlow again and possibly client.verify + resume.
Termination condition
UI returns to engine-truth when user resolves modal and runMissingFilesFlow returns resolved (then orchestrator finalizes and refreshes), or when user cancels (finalizeRecovery with cancelled) and UI shows error/cancel message.
Final section — Categorized behavior lists

Behaviors that violate engine truth (explicit mismatches where UI can present or cause a state contradictory to user's explicit intent or engine final state)

Recovery flow’s unconditional resume after a verify: runMinimalSequence calls client.resume([id]) unconditionally; if the user explicitly pauses during verify, the recovery flow can later call resume and cause the torrent to resume despite the user's pause. This can override a user pause (race/violation).
Optimistic "CHECKING" overlay may be shown while engine never enters CHECKING (recheck on active torrent). Although useOptimisticStatuses clears it quickly, there is a brief UI state that is not engine-truth (transient violation).
requestRecovery may return handled for recheck with a blockingOutcome (the API surface says handled) but the orchestrator may not dispatch an engine action; UI that assumes handled == engine started may be misled (semantic mismatch).
A recovery session can persist while engine has left CHECKING/finished verification; a stale recovery modal could remain if the user never completes the modal, showing an unresolved blockingOutcome even though engine truth changed elsewhere (e.g., external repair/auto-resume). The UI may thus show a blocking modal out-of-sync with engine state.
Behaviors that are transient but acceptable (brief UI states that resolve automatically on reconciliation)

Optimistic status showing CHECKING for active torrents where controller decides not to verify; useOptimisticStatuses quickly clears it on next refresh — visible but short-lived.
Optimistic PAUSE/RESUME overlays during action dispatch that are removed once engine reports new state.
Brief verification-progress flicker when verify is initiated and then aborted/fast-completed by the engine; the UI will reconcile after verificationProgress and state updates.
Multiple concurrent callers deduped by IN_FLIGHT_RECOVERY — presents a single UI flow rather than multiple modals; transient aggregation is acceptable.
Behaviors that make recovery UI impossible to reason about (situations or races that produce ambiguous or persistent UI state)

A recoverySession created with needsModal that is never acted upon (user ignores the modal): the session persists and the UI will keep showing blockingOutcome while the engine may later change state (e.g., volume restored by external action) — unless the orchestrator auto-resolves via pollPathAvailability. This can leave the recovery UI out-of-sync and confusing.
VERIFY_GUARD skipping verifies (matching leftUntilDone) can cause silent no-op verification: a user expects a verify to run after they click recheck, but shouldSkipVerify prevents it; UI may show an optimistic verify then disappear with no engine verify having run. Because this guard is internal (based on recorded left), it can be opaque to UI and the user.
Mixed automatic auto-resolve (volumeLoss poll) vs user-driven recovery modal: if auto-resolve happens while the user is in the modal, the orchestrator's resolveRecoverySession may run concurrently with modal actions, producing races (modal may attempt pick-path while auto-resolve already resolved the issue). This can create confusing UI flows or duplicate toasts.
Classification override and cached probes (missingFilesStore) can hide immediate changes: stale probe cached for PROBE_TTL_MS may cause the recovery controller to make decisions based on old data; repeated or rapid filesystem changes could yield inconsistent recovery outcomes visible to UI.
The combination of IN_FLIGHT_RECOVERY dedupe and queuing (pendingRecoveryQueueRef) plus recoveryFingerprintRef means callers may receive a Promise result that was initiated by another path; if that original flow is later cancelled or aborted, awaiting UIs may get a cancelled/noop result unexpectedly — making post-hoc reasoning about "what happened" difficult.
runMinimalSequence always calls client.resume after verify; if callers expected recheck-only behavior (no resume), recovery flows become confusing: user requested verify but torrent may get resumed automatically — complicates user's mental model and the recovery UI behavior.
Concise summary of key invariants observed (read-only)

Optimistic UI overlays are applied for actions (pause/resume/recheck) and are explicitly removed only by engine-confirmed reconciliation (via useOptimisticStatuses effect) — the clearing condition depends on engine state !== CHECKING and verificationProgress not <1.
The recovery flow centralizes decisioning in runMissingFilesRecoverySequence; it may: probe path, create folder, call setTorrentLocation, call client.verify, watchVerifyCompletion, client.resume, and finally mark classification override; blocking outcomes cause the orchestrator to create recoverySession and show modal UI.
There are several timing-sensitive races: pause vs resume on verify, auto-volume-detection vs manual pick-path, and multiple callers deduped by in-flight promises — each creates branches the UI must handle.
The code attempts to avoid duplicate recovery work (IN_FLIGHT_RECOVERY, verify guard, probe caching), but these dedupe mechanisms introduce opacity and race edges that can produce confusing UI states.





. The enumeration describes what the code *does*, but several described behaviors are **non-compliant** with your vFinal+ spec (and match the bugs you’re seeing).

## Where it matches the spec

* **Single recovery gate**: Everything funnels through `requestRecovery` / recovery-controller flows (row actions, resume/start, context actions). That aligns with **§4 Step 0**.
* **Anti-loop guard exists**: `VERIFY_GUARD` / `shouldSkipVerify` matches **§4 Anti-loop guard** (it prevents infinite verify loops based on unchanged `leftUntilDone`).
* **“Retry-only probes” path exists**: the code has a `retryOnly` mode that avoids heavy actions, which is directionally aligned with **§3 Retry semantics** (but see mismatch below).
* **Path-loss “force set-location even if unchanged”**: you added a test enforcing `setTorrentLocation` even if path unchanged, which matches **§2 S2 RPC requirement** and **§3 S2 “Download to recreate”**.

## Where it does NOT comply (hard mismatches)

### 1) Pause during verify can be overridden by auto-resume (violates Truth + user intent)

Your enumeration correctly calls out the race: recovery flow can call `resume` after verify even if the user paused mid-checking.

That violates:

* **Truth-only / action-oriented**: user action “Pause” must be authoritative.
* **§4 Remote minimal sequence**: “After watcher, if torrent is not active → send start” is fine, but only when the user didn’t explicitly pause. Your spec implicitly requires sequencing to respect user intent.
* Practically: this is exactly your “rehash pause → resume -> starts downloading instead of finishing rehash” confusion.

### 2) Recheck while downloading skips verify (conflicts with expected “verify” semantics)

Your enumeration says: if torrent is active, `determineShouldVerify` can skip `verify`.

That conflicts with:

* **§4 Remote sequence**: verify is conditionally required, but the decision hinges on history, suspicion, path repair, etc. Skipping verify purely because “active” can be wrong when the user explicitly pressed **Recheck** (rehash is explicitly “verify local data”).
* UX: user asked to verify; silently doing a no-op violates “Truth-only” and “Action-oriented” expectations (it should either verify or clearly communicate it didn’t).

### 3) “Retry” semantics are wrong if retry triggers resume/start

Your enumeration describes `retryOnly` returning `noop` and then orchestrator attempting to resume/ensureActive.

That violates:

* **§3 Retry semantics**: “Retry performs availability re-probing only. It does not modify paths or data.”
  If retry results in a `start/resume`, you’ve changed state, not just probed.

### 4) Watcher timeout behavior is missing/unclear

Spec requires:

* **§4 Timeout behavior**: if still checking after 30s: show “Still verifying…”, offer Retry/Locate, **do not auto-open modal**.

Your enumeration doesn’t confirm this behavior exists end-to-end. If the current code opens a modal or leaves an optimistic “checking” state pinned, it’s non-compliant.

### 5) “Location unavailable” copy rule depends on confidence; enumeration doesn’t prove the UI obeys it

The spec’s key constraint:

* If confidence = `unknown`, row text must be **“Location unavailable”**, never “Drive disconnected” / “Folder not found”.

Your enumeration focuses on controller flow, not the formatter/copy layer. So you can’t claim compliance until you verify the **shared formatter** uses confidence exactly as required.

## About your rehash behavior questions (as spec compliance)

### “Rehash while downloading; status stuck on checking”

Non-compliant with **Truth-only**: if engine left checking, UI must exit checking immediately. This is typically an **optimistic/guard overlay not clearing** problem (your earlier stuck-checking symptom).

### “Pause while rehashing, resume → starts downloading instead of finishing rehash”

This *can* be normal depending on engine semantics: some engines abort verify on pause and on resume they just start.
But your spec expects the UI to be **truthful**: if verify was aborted, UI should not pretend it’s still verifying, and if it’s continuing verify, it should say so.

### “Downloading while status shows checking”

Acceptable *only if engine really does download during a check state* (some clients can report transient combos), but **your own screenshot + Transmission showing 34% while your UI shows 0%** screams “UI is mixing `verificationProgress` and `progress` incorrectly or clamping wrong” — that’s not compliant with “engine-truth-first”.

## Bottom line

Your enumeration is a good *diagnostic*, but by its own content it proves **at least these violations** exist right now:

* pause intent can be overridden (bad)
* retry is not probe-only (bad)
* recheck can silently skip verify (bad)
* checking/progress mismatches exist (bad)

If you want a fast compliance check, the next thing to ask the agent is:

* “Show me the exact mapping from (classification kind, confidence) → row text + actions, and prove `unknown` always yields ‘Location unavailable’.”
* “Prove Retry does not call resume/start anywhere.”
* “Prove pause during checking cannot be overridden by any post-verify resume path (or enumerate where it currently happens).”

