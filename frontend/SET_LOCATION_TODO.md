## Set Download Path / Set Location — Connection-Scoped Capability TODO

1. [x] Verify `setLocationCapability` now reflects the active RPC profile host (`127.0.0.1` only) so browse is only offered for the native daemon.
2. [x] Surface-aware outcome state: avoid storing a single `lastSetLocationOutcome` so context menu, general tab, and recovery modal do not share stale unsupported/conflict reasons.
3. [x] Define transport capability flags (e.g., `supportsOpenFolder`, `supportsSetLocation`, `supportsManual`) and propagate them from the RPC adapter instead of inferring them in the UI.
4. [x] Expose a transport-declared `supportsManual` flag so the `manual-disabled` reason can ever occur, keeping the contract honest when a remote server disables manual edits.
5. [x] Audit other `NativeShell.isAvailable` usages (open-folder helpers, settings) to ensure they respect the transport host contract rather than assuming the UI runtime.
6. [x] Recompute `setLocationCapability` whenever the RPC profile or connection host changes so scenarios like switching from loopback to remote drop browse instantly.
7. [x] Enforce the UI invariants from §1.6: no folder pickers unless `hasNativeShell`, manual entry always shown, and unsupported flows log precise reason bubbles (not stale outcomes).
8. [x] Expand `setLocationOutcome` messaging to flag “remote transport” vs “missing NativeShell bridge” so the user sees which axis blocked browsing, matching the spec’s canonical capability matrix.
9. [x] Define a unified `connectionMode` enum (TransmissionRemote, TinyTorrentRemote, TinyTorrentLocalShell) derived from `(serverClass, connected_host_local, NativeShell bridge)` and require every behavior to branch through it.
10. [x] Outline reconciliation rules for inline editor state/drafts/browse promises when `connectionMode` changes so mode transitions cancel or adjust UI immediately.
11. [x] Split “open folder” vs “browse for folder” capability flags (both NativeShell-owned) and enforce them separately when rendering buttons or invoking helpers, especially for remote paths.
12. [x] Ensure the status bar / transport chip renders the canonical `connectionMode` (TransmissionRemote / TinyTorrentRemote / TinyTorrentLocalShell) so tooltips/status text always explain why browse is hidden or enabled.
13. [ ] Ensure recovery UX messaging aligns with confidence rules (unknown -> "Location unavailable") and that set-location outcomes feed those user-friendly texts without guesswork.
14. [ ] Drive all recovery/set-location UI copy and flows from the recovery gate state+confidence (no re-classification), keep editors/modals open until the gate resolves, and sanity-check user-friendly paths for path/volume/access/unknown scenarios.
