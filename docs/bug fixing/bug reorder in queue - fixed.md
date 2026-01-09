bug: reorder queue


Perform an audit of the current torrenttable implementation and old one (torrenttable-old). The reordering in the new one is broken. I can't figure out why and how to fix it. what happens: after drag, I can't see the animation of the torrent moving into its new place. and on top of that I'm not even sure that it moved or it got into the right position. I've even seen artifacts where while I was dragging one row higher and lower, the others were jumping around. I want you to tell me exactlyu what I broke to cause all these problems and a detail description of what as before, what is now, provide advice on what's the best way to fix the current problems. do not modify any code. be thorough into your investigation and review it at least once before you report to ensure that no mistakes have been made while reviewing

Used 1 reference
Auditing implementation
I'll search the repo for the current and old torrent table files to inspect their implementations.

Searched for files matching torrenttable pattern
I'll search the dashboard module for torrent table code and draggable/drag-related hooks.

Searched and inspected files for details
Next I'll open useTorrentRowDrag.ts to inspect the drag logic.

Analyzed drag behavior and implementation changes
I'll create a short TODO plan summarizing findings and next recommended actions.

Created 5 todos

Summary (what I found)

Root regression: you now have two nested DnD contexts. TorrentTable.tsx wraps the entire table in a DndContext, and TorrentTable_Body.tsx also creates a second DndContext around the rows. The original (TorrentTable-old.tsx) used a single DndContext for headers + rows.
Why that breaks things:
Nested DnDProviders/sensors cause conflicting drag event routing and duplicate DragOverlay handling. DnD kit expects a single context per drag scope — nesting makes some drag events handled by the inner context while header/overlay logic on the outer context sees different events/state, so the FLIP/layout lifecycle (virtualizer positions → framer-motion layout animations) gets out of sync.
As a result rows can jump (two providers competing for collision detection / sortable strategy), the dragged item animation/overlay doesn't coordinate with the list reflow, and layout transitions produced by Framer Motion often don't run (or run at the wrong time), so you don't see the intended "row gliding into place".
Secondary minor mismatch:
useTorrentRowDrag accepts an optional rowsLength param and falls back to rowIds.length. The old implementation used rows.length when computing normalized indices for queue movement. In normal cases the two are equal, but if ghost/virtual rows or filtering are present the fallbacks can differ and produce an incorrect delta/number-of-steps for onAction, which can cause extra RPCs and transient inconsistent state while reordering.
What was before (old code behavior)

Single DndContext for the whole table.
Drag start: suppress layout animations, set active row.
Drag end: set pending optimistic order, keep layout animations suppressed while server updates; once server data equals pending order, clear pending and lift suppression — Framer Motion then animates the rows to their final positions (FLIP works correctly).
One DragOverlay tied to the single DnD context so overlays and state transitions were coordinated.
What is now (current code/bug)

Two DndContexts: one in TorrentTable.tsx and one in TorrentTable_Body.tsx. Each has its own sensors, handlers, and DragOverlay usage.
Because of the nested contexts:
Drag events and collision detection are split between contexts, producing mis-coordinated sortable behavior and occasional jumps as each context tries to compute positions.
Overlay/drag visuals are inconsistent (sometimes inner overlay shows the dragged node but the outer context’s state drives the list reflow, or vice versa).
The timing for when Framer Motion sees elements with or without layoutId becomes inconsistent, so the expected layout animation does not run (you see no glide to new position).
The optional rowsLength fallback may cause incorrect delta steps if rows.length != rowIds.length in edge cases.
Concrete evidence references (files / locations)

Duplicate top-level DndContext:
TorrentTable.tsx:862-874 — top-level DndContext wrapping the headers + body.
TorrentTable_Body.tsx:64-73 — an inner DndContext wrapping rows again.
Old single-context approach:
TorrentTable-old.tsx:1 — historical file shows a single DndContext used for the whole table.
Drag handlers now split:
useTorrentTableInteractions wires handleDragStart/End (header) and delegates row handlers to useTorrentRowDrag.
TorrentTable.tsx creates the outer DndContext (headers + body), but TorrentTable_Body.tsx also declares one and its own DragOverlay for rows — duplicate providers.
Recommended fix (surgical, do not change behavior elsewhere)

Remove the inner DndContext wrapper inside TorrentTable_Body.tsx.
Keep SortableContext for the rows inside the body (so the rows remain sortable).
Do NOT create a second DndContext there; the single DndContext in TorrentTable.tsx should be the provider for both header and row drags.
Move the rows’ DragOverlay into the same DndContext scope (it can remain where it is in TorrentTable_Body.tsx, but it must be a child of the single parent DndContext). Preferably keep the overlays colocated to the parent DndContext so header and row overlays are both inside the same provider (or ensure the inner one is removed and the parent renders both header & row overlays).
Ensure the sensors object is the same provider-wide (you already create sensors in useTorrentTableInteractions — pass the same sensors to the single DndContext).
Pass rows.length into useTorrentRowDrag (rowsLength) so the normalization logic matches the old behavior exactly (prevents off-by-ghost-row differences).
Verify layout suppression logic remains logically equivalent to the old behavior (you already introduced useTableAnimationGuard; confirm the lifecycle is begin(rowDrag) → begin(queueReorder) → end(queueReorder) when pending is cleared). If animations still do not run, restore the old timing (suppress on drag start; set pendingQueueOrder; clear suppression once pendingQueueOrder is observed to match server data — the code already implements this, but nested DnDContexts are currently preventing correct FLIP timing).
Why this fixes the symptoms

A single DndContext ensures consistent drag event routing, one authoritative collision detection, and a single DragOverlay lifecycle. That restores deterministic ordering: virtualizer computes new positions, Framer Motion sees consistent old/new layoutIds and runs the FLIP animations when suppression is lifted. Removing nested contexts will eliminate the competing handlers that cause the jumping artifacts.
Verification steps (manual)

After applying the fix above:
Start app and load dashboard with queue-sorted torrents.
Click-and-drag one row slightly up and down — ensure other rows do not “jump” randomly while you drag.
Release drag to move the row one slot — watch for:
the dragged row’s overlay moves to the target,
pending optimistic order is applied,
once server confirms (or optimistic update applies), the other rows animate smoothly to final positions.
Move a row multiple positions (drag several rows) and ensure the number of RPC steps equals the expected delta.
If you still see no animations:
Confirm the motion.div layoutId is present when suppression is off for affected rows.
Confirm animationSuppressionActive toggles from true → false at the expected time by temporarily logging the suppression keys or watching the DOM attributes data-tt-layout-suppressed.
Minimal code diffs to implement (conceptual — do not modify without review)

In TorrentTable_Body.tsx:
Remove the wrapping <DndContext ...> and its onDragStart/End/onDragCancel props; keep SortableContext.
Remove the rowSensors DndContext prop usage there; rely on the parent DndContext's sensors.
Ensure the DragOverlay for rows is rendered within the parent DndContext (move it up to TorrentTable.tsx or ensure the body is still a child of the parent context when overlay renders).
In the callsite for useTorrentRowDrag (via useTorrentTableInteractions), add rowsLength: rows.length to deps passed to the hook.
Extra notes / gotchas

If you prefer, instead of moving overlays, remove the outer DndContext and make the inner body DndContext the single provider for both headers and body — but the easiest minimal change is to remove the body’s DndContext so the one in TorrentTable.tsx remains authoritative.
The dropAnimation={null} is intentional (the UI relies on FLIP layout). Keep that; the FLIP animation is provided by Framer Motion and the layoutId mechanism.
After consolidating contexts, if you still observe jerky motion, instrument the suppression lifecycle to ensure suppression key counts are correct (no stray begin without end). The useTableAnimationGuard is robust, but any mismatched begin/end calls will leave suppression active and block animations.
Would you like me to:

prepare the exact patch (small and surgical) to remove the inner DndContext and consolidate overlays and sensors, and add the rowsLength argument to useTorrentRowDrag?