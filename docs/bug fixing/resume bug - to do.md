
Used 1 reference
Analyzed error recovery code and designed workflow
Diagnosis (why it’s broken)

Error classification is present (buildErrorEnvelope), but there is no recovery orchestrator: buttons fire window events and nothing handles the actual filesystem path checks or directory creation.
Missing/permission/disk errors are reduced to “needsUserAction” with generic actions; no path existence/writability check is performed, so the UI can’t decide between “re-download here”, “create folder”, or “pick another path”.
Path capabilities exist in EngineAdapter (checkFreeSpace, createDirectory, setTorrentLocation) but are not used in the recovery flow.
The only “re-download”/“set location” hooks are ad-hoc window events; users end up deleting/re-adding torrents because the built-in recovery loop is unimplemented.
Proposed end-to-end solution (ordered by importance / net gain)

Introduce a Recovery Orchestrator (single source)

New module: src/services/recovery/recovery-controller.ts (or a hook useRecoveryController used by the inspector).
Responsibilities:
Observe ErrorEnvelope + detail (downloadDir, files, piece info).
Decide the recovery path for missingFiles, permissionDenied, diskFull, partialFiles.
Run preflight checks: checkFreeSpace(downloadDir); if the directory is missing, call createDirectory(downloadDir) when supported.
If checkFreeSpace/createDirectory fail with “not found” or permission errors, trigger a “select new path” prompt.
Surface a typed result to the UI: { suggestedAction, message, requiresUserPath?: boolean }.
Replace window events with typed callbacks

In GeneralTab, remove dispatchEvent("tiny-torrent:*"); instead, receive callbacks for:
onResume, onForceRecheck, onReDownloadHere, onSelectNewPath, onOpenFolder.
Wire these from a new controller hook in the inspector container (useDetailControls is a good place to host them).
Path handling rules (robust flow)

For missingFiles:
Try checkFreeSpace(downloadDir); if ENOENT → attempt createDirectory(downloadDir).
If creation succeeds → offer “Re-download to existing path” (no prompt).
If creation fails or free-space check shows unwritable → open path picker (native if available, else browser prompt) and then call setTorrentLocation(id, newPath, moveData=false).
After path resolution, call forceRecheck(id) or resume(id) depending on desired flow.
For permissionDenied: skip creation, go directly to path picker (or “Open folder” if accessible) then setTorrentLocation.
For diskFull: surface “Pause” + “Pick another path” + “Check free space” (use checkFreeSpace to show remaining bytes).
For partialFiles: default to “Verify” then “Re-download”; do not auto-delete.
Where to put code

Recovery logic: src/services/recovery/recovery-controller.ts.
Hook to use in inspector: extend useDetailControls to call the controller for missing/permission/disk cases and provide the callbacks to TorrentDetails → GeneralTab.
UI prompt: a small modal in modules/dashboard/components (e.g., TorrentRecoveryModal.tsx) that presents options: Re-download here (if path ready), Create folder, Choose another path, Verify files.
EngineAdapter usage

Use existing optional methods:
checkFreeSpace(path): to detect existence/writability (if it throws/returns error → interpret).
createDirectory(path): to create missing folders before prompting.
setTorrentLocation(id, path, moveData?): to relocate or reattach.
forceTrackerReannounce and verify already present.
Fallback when methods are missing: go straight to path picker.
State machine / UX sequencing

For missingFiles:
Step A: Path ready? → Re-download here (call addTorrent with same hash? Or reDownload action if supported; otherwise setTorrentLocation + forceRecheck + resume).
Step B: Path missing but creatable? → Create + Re-download.
Step C: Path not writable/missing → prompt for new path → setTorrentLocation (no move) → forceRecheck.
For permissionDenied:
Prompt: “Try another folder” → path picker → setTorrentLocation.
Offer “Open folder” if possible for manual permission fix.
For diskFull:
Show remaining space via checkFreeSpace; offer “Pause all” and “Change location”.
Ensure the UI never asks for a new path when the current path exists and is writable.
Robustness guidelines

Keep recovery pure: controller should be stateless per invocation; no global mutable flags.
Never hide errors: if directory creation fails, surface the error string in the modal.
Debounce repeated recovery attempts per torrent (e.g., by fingerprint) to avoid storms.
Always revalidate after user picks a path: run checkFreeSpace before issuing RPCs.
Prefer optimistic UI only for button state; do not mark torrent “fixed” until heartbeat confirms state change.
Testing targets

Unit: recovery-controller given mocked adapter responses (missing dir → create → success; missing dir → create fails → requires path; permissionDenied → requires path).
Integration: simulate heartbeat detail with errorEnvelope.missingFiles and ensure the modal offers the correct primary action sequence.
Regression: ensure non-error torrents bypass the recovery flow.
If you want, I can draft the file structure and function signatures for the recovery controller and the inspector wiring to make this implementable.

Quick sanity add-ons before handing this to a developer:

Verify adapter support matrix: Confirm EngineAdapter actually implements checkFreeSpace, createDirectory, setTorrentLocation, forceTrackerReannounce, updateFileSelection. If any are missing in the current adapter, the recovery plan must include fallbacks (e.g., always prompt for path if createDirectory is absent).
Detail payload consistency: Re-validate that heartbeat detail carries downloadDir and non-empty files for the failing torrents. Missing downloadDir will block path checks; missing files will misclassify “missingFiles”.
Hash stability test: Ensure summary vs detail hash equality. If hashes differ, detail will be dropped and recovery UI never gets data—this will masquerade as a recovery bug.
UI prompts contract: Decide the exact UX copy and order for recovery modal actions (Create folder → Re-download here → Choose another path → Verify). This prevents bikeshedding during implementation.
Disk/writable signals: Define how to interpret checkFreeSpace failures (ENOENT → create; EACCES → prompt new path; ENOSPC → “disk full” state). Make this mapping explicit in the controller.
Partial files class: Clarify the behavior for .part detection: should we default to verify, or always prompt before re-download? Write it down.
Timeout behavior: For tracker reannounce and verify, specify reasonable timeouts and what message to show on timeout (do not leave spinners).
Empty data display: Align on “unknown” labels for NaN counts/speeds and file sizes to avoid blank cells.
Layout guard: Reconfirm inspector/tab height constraints; if the defrag/radar UI still clips, mandate a minimum height token for these panels.
Test plan: Include three flows to exercise after implementation:
Missing folder but creatable → auto-create → re-download succeeds.
Missing folder not creatable (permissions) → prompt path → set location → recheck/resume.
Disk full → shows space, offers change location; resume is blocked until resolved.
If you align on these points, the developer will have a clear contract to implement the recovery controller and wire the UI without ambiguity.


---------------------------


Proposed Files & Placement

src/services/recovery/recovery-controller.ts
src/modules/dashboard/hooks/useRecoveryController.ts (wrapper hook for UI wiring)
src/modules/dashboard/components/TorrentRecoveryModal.tsx (UI prompt)
Adjust useDetailControls.ts to invoke the controller and supply callbacks to TorrentDetails/GeneralTab.
Update EngineAdapter typings if needed to mark checkFreeSpace, createDirectory, setTorrentLocation as optional but consumable.
src/services/recovery/recovery-controller.ts
Purpose: Pure orchestrator for error-driven recovery decisions and actions.
```
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { TorrentDetailEntity, ErrorEnvelope } from "@/services/rpc/entities";

export type RecoveryOutcome =
    | { kind: "resolved"; message?: string }
    | { kind: "path-needed"; reason: "missing" | "unwritable" | "disk-full"; hintPath?: string }
    | { kind: "verify-started"; message?: string }
    | { kind: "reannounce-started"; message?: string }
    | { kind: "noop"; message?: string }
    | { kind: "error"; message: string };

export interface RecoveryControllerDeps {
    client: EngineAdapter;
    detail: TorrentDetailEntity;
}

export interface RecoveryPlan {
    primaryAction: "reDownloadHere" | "createAndDownloadHere" | "pickPath" | "verify" | "resume" | "reannounce" | "openFolder" | "none";
    rationale: string;
    // Whether we can proceed without user path input
    requiresPath: boolean;
    suggestedPath?: string;
}

export function planRecovery(envelope: ErrorEnvelope | null | undefined, detail: TorrentDetailEntity): RecoveryPlan;

export async function runMissingFilesRecovery(
    deps: RecoveryControllerDeps
): Promise<RecoveryOutcome>;

export async function runPermissionDeniedRecovery(
    deps: RecoveryControllerDeps
): Promise<RecoveryOutcome>;

export async function runDiskFullRecovery(
    deps: RecoveryControllerDeps
): Promise<RecoveryOutcome>;

export async function runPartialFilesRecovery(
    deps: RecoveryControllerDeps
): Promise<RecoveryOutcome>;


```


Behavior sketch inside controller:

planRecovery reads errorClass, recoveryActions, detail.downloadDir, and decides the initial UI posture.
runMissingFilesRecovery:
checkFreeSpace(downloadDir); on ENOENT → attempt createDirectory(downloadDir).
If create succeeds → reDownloadHere (or forceRecheck + resume if re-download not supported).
If permission/ENOSPC → return path-needed with reason.
runPermissionDeniedRecovery: skip create; return path-needed with reason unwritable.
runDiskFullRecovery: return path-needed with reason disk-full, include free-space info if available.
runPartialFilesRecovery: prefer verify-started; optionally path-needed if path invalid.
src/modules/dashboard/hooks/useRecoveryController.ts
Purpose: UI-friendly hook to consume the controller and expose callbacks to components.

```
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { ErrorEnvelope } from "@/services/rpc/entities";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { RecoveryOutcome, RecoveryPlan } from "@/services/recovery/recovery-controller";

export type RecoveryCallbacks = {
    handlePrimaryRecovery: () => Promise<RecoveryOutcome>;
    handlePickPath: (path: string) => Promise<RecoveryOutcome>;
    handleVerify: () => Promise<RecoveryOutcome>;
    handleReannounce: () => Promise<RecoveryOutcome>;
};

export function useRecoveryController(params: {
    client: EngineAdapter;
    detail: TorrentDetail | null;
    envelope: ErrorEnvelope | null | undefined;
}): {
    plan: RecoveryPlan | null;
    recoveryCallbacks: RecoveryCallbacks;
    isBusy: boolean;
    lastOutcome: RecoveryOutcome | null;
};

```

Behavior: Memoize planRecovery; provide handlers that call the controller run-functions and update local state for UI feedback.

src/modules/dashboard/components/TorrentRecoveryModal.tsx
Purpose: Present recovery options based on RecoveryPlan/RecoveryOutcome.

Props:

interface TorrentRecoveryModalProps {
    isOpen: boolean;
    plan: RecoveryPlan | null;
    outcome: RecoveryOutcome | null;
    onClose: () => void;
    onPrimary: () => Promise<void>;
    onPickPath: (path: string) => Promise<void>;
    onVerify: () => Promise<void>;
}

I: Buttons for primary action, “Choose another folder”, “Verify”, with messaging from plan.rationale and outcome.message.

Wiring changes in useDetailControls.ts
Accept recoveryPlan and recoveryCallbacks from useRecoveryController.
Provide onRetry, onSetLocation, onRedownload, onForceTrackerReannounce, onResume to TorrentDetails based on these callbacks instead of window events.
When errorEnvelope.errorClass in detail is one of missing/permission/disk/partial, open TorrentRecoveryModal and route actions through the controller.
Notes for Implementation
Keep controller pure and isolated from UI; it only uses EngineAdapter and detail.
Define an error-code interpretation map for checkFreeSpace/createDirectory exceptions (ENOENT vs EACCES vs ENOSPC).
Ensure fallbacks when adapter methods are absent: go straight to path-needed and rely on setTorrentLocation after a picker.
Do not change global heartbeat or adapter state inside the controller; let heartbeat reflect success after RPCs.
This structure gives a clear place for business logic (recovery-controller), a UI hook (useRecoveryController), and a modal for user decisions, with minimal churn to existing inspector components.

Final notes for the developer:

Verify EngineAdapter implementations: if checkFreeSpace, createDirectory, or setTorrentLocation aren’t implemented in the current adapter, add them or wire fallbacks (path picker only). The recovery controller depends on these.
Define the error-code mapping for checkFreeSpace/createDirectory (ENOENT → create; EACCES → path-needed; ENOSPC → disk-full) and keep it consistent.
Ensure detail payloads include downloadDir; without it, recovery cannot decide where to operate.
Avoid window-level custom events; use typed callbacks from the recovery hook/controller.
Keep the controller pure and side-effect-limited to adapter calls; let heartbeat confirm fixes instead of forcing state locally.
UX copy/order for recovery modal should be agreed upfront to avoid rework (create folder → re-download here → pick another path → verify).
Add tests: missing-folder-creatable, missing-folder-not-creatable, permission-denied, disk-full, partial-files (no destructive defaults).

