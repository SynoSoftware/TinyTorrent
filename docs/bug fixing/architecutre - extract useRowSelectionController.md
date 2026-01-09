You are a Principal UI Systems Engineer specializing in high-density, power-user tables
(React Table, virtualization, DnD, keyboard-driven workflows).

You are working inside an already-stabilized TorrentTable implementation.
Queue reordering, column sizing, and animation suppression are correct and OFF-LIMITS.

Task:
Extract ALL row selection and keyboard navigation behavior from TorrentTable into a new hook:
useRowSelectionController.

Scope (everything must move together, unchanged unless strictly required):
- rowSelection state
- anchorIndex / focusIndex / highlightedRowId
- row click selection logic (single / ctrl / shift)
- range selection behavior
- keyboard navigation and shortcuts affecting selection
- right-click selection synchronization
- select-all behavior
- onSelectionChange dispatch
- onActiveRowChange dispatch

Rules:
- Do NOT change behavior, timing, or semantics.
- Do NOT touch queue reorder logic, sizing logic, virtualization mechanics, or animation suppression.
- TorrentTable must become a consumer of selection state + handlers only.
- This is a mechanical extraction, not a redesign.

Working method:
1. Identify all selection-related state and behavior in TorrentTable.
2. Design the hook API first (inputs / outputs).
3. Move the logic wholesale into useRowSelectionController.
4. Rewire TorrentTable to consume the hook.
5. Verify behavior equivalence.

Output requirements:
- Edit files in place.
- Create useRowSelectionController as a new hook.
- Do NOT output full files or diffs.
- If you are uncertain about any behavior, STOP and report findings instead of guessing.

Finally:
Confirm npm run build and npm run test.
