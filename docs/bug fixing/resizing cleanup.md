I think that setIsTableResizing and setSuppressLayoutAnimations were designed for the same thing. I think that one implementation broke and the AI reimplemented the same thing with a different name. currently setSuppressLayoutAnimations() might be the one that's working. report what's going on in the code. need some cleanup here. more context: the idea is that during resizing the header and the contents animation must be disabled as it looks awful if animated. 4 iterations were made on this code to repair the same code over and over again, resulting most likely in various params that are not needed. find out all about it and report. dont' change code yet


Here’s what I found in the current code; there is no setIsTableResizing anywhere in this repo, and the behavior is split between two different signals.

Findings

setIsTableResizing doesn’t exist in the codebase; the closest equivalent is isAnyColumnResizing (derived from activeResizeColumnId + columnSizingInfo.isResizingColumn) and it only tracks manual column resizing via the header handle. isAnyColumnResizing drives the data-tt-column-resizing attribute and is also used to disable dnd/framer layout in headers/rows. TorrentTable.tsx (line 996), useColumnResizing.ts, TorrentTable_Header.tsx, TorrentTable_Row.tsx
suppressLayoutAnimations is a separate, broader flag used for programmatic or container resizes and row drag reordering. It is toggled in:
column auto-fit + auto-fit all (double-rAF clear) TorrentTable.tsx (lines 518-585)
table container resize via ResizeObserver (150ms debounce) TorrentTable.tsx (lines 600-626)
row drag start/cancel and pending queue reorders useTorrentRowDrag.ts, TorrentTable.tsx (lines 759-779)
Both isAnyColumnResizing and suppressLayoutAnimations are also expressed as global CSS suppressors:
[data-tt-column-resizing="true"] * { transition/animation: none; } index.css (line 267)
[data-tt-suppress-layout] * { transition/animation: none; } index.css (line 927)
These are redundant in effect but cover different trigger paths.
There’s a wiring gap: TorrentTable_Headers never receives the suppressLayoutAnimations prop from the parent, so header layout animation is only disabled by isAnyColumnResizing (column resize) but not during panel resize or row drag suppression. That means the header can still do framer-motion layout animations during panel resizing even while the body is suppressed. TorrentTable.tsx (line 1023), TorrentTable_Headers.tsx
suppressLayoutAnimations can be cleared by the ResizeObserver timeout even if a queue-reorder is still pending, because it unconditionally sets false after 150ms. That can re-enable animations mid-reorder. TorrentTable.tsx (lines 600-626)
What this implies

The system currently has two overlapping suppression mechanisms:
isAnyColumnResizing = manual column resize.
suppressLayoutAnimations = auto-fit + panel resize + row drag reorder.
The “awful animation during resizing” goal is partially met: rows are suppressed during panel resizing, but headers are not (because the prop isn’t wired), and CSS suppression alone doesn’t stop framer-motion layout transforms.
Potential cleanup direction (no code changes yet)

Unify suppression into a single “layout suppression” boolean that composes:
isAnyColumnResizing OR isPanelResizing OR isRowDragging OR isAutoFitInProgress
Pass that unified flag to TorrentTable_Headers, TorrentTable_Body, and any DnD layout handlers consistently.
Keep only one of the two CSS attributes to reduce duplication (or keep both but document their separate roles explicitly).
If you want, I can map a concrete cleanup plan with minimal changes and show exactly what I’d remove/rename first.

continue the review, see if you missed anything


Continued review results — found a few more issues tied to suppression/resizing, plus one unrelated refactor bug that looks recent.

Findings

Header suppression is still not wired: TorrentTable_Headers expects suppressLayoutAnimations but it is never passed from the parent, so header layout animations and header drag disabling ignore the suppression flag during panel resize/auto-fit/row drag. TorrentTable.tsx (lines 1038-1046), TorrentTable_Headers.tsx (lines 74-123)
Single boolean is race-prone across multiple sources: setSuppressLayoutAnimations(false) is called by multiple independent paths (auto-fit rAFs, resize debounce, queue reorder cleanups). Any one of those can re-enable animations while another operation is still active. TorrentTable.tsx (lines 551-566), TorrentTable.tsx (lines 613-626), TorrentTable.tsx (lines 762-786)
Row style memo doesn’t re-run on suppression changes: rowStyle uses suppressLayoutAnimations to gate transitions, but the dependency list omits it, so toggling suppression won’t update the transition behavior for existing rows. TorrentTable_Row.tsx (lines 74-106)
Refactor bug in row drag normalization: useTorrentRowDrag relies on rowsLength, but the caller passes rows only; rowsLength is undefined, which makes normalization math NaN when sorting desc. useTorrentRowDrag.ts (lines 10-55), TorrentTable.tsx (lines 821-830)
No code changes made; this is an unvalidated review only. If you want, I can propose a cleanup plan that consolidates suppression (ref-count or composed boolean) and fixes the wiring/dep issues.