
perform an audit of the torrenttable component. I need to figure out why it doesn't respects the consistency of the UI: in smallest zoom mode, the height of the colulmn header is smaller than the height of the row. in maximum zoom mode, the height of the column header it is bigger than the the height of the row. The fact is the height of the row in the table is always the same, it doesn't respect the tt-zoom css variable. I want to know why exactly and what can it be done. no code changes, just report



Root cause and evidence

The header height is purely CSS‑driven via .h-row → height: var(--tt-h-row), and --tt-h-row scales with --tt-zoom-level through --tt-uz. That means headers correctly resize with zoom. See TorrentTable_Header.tsx (line 161), index.css (line 29), index.css (line 887), index.css (line 11).
The row height used by the virtualizer is numeric rowHeight from useLayoutMetrics, which reads the custom property --tt-row-h and parses it with parseFloat. For custom properties, getComputedStyle(...).getPropertyValue("--tt-row-h") returns a non‑numeric token like var(--tt-h-row) or calc(...), so parseFloat yields NaN, and the hook falls back to numericBaseRow (unscaled). See useLayoutMetrics.ts (line 23), useLayoutMetrics.ts (line 84), useLayoutMetrics.ts (line 45).
The virtualized rows then use virtualRow.size (fed by rowHeight) for their actual rendered height, so they stay constant across zoom even when headers scale. See useTorrentTableVirtualization.ts (line 82) and TorrentTable_Row.tsx (line 49).
The loading skeleton path uses TABLE_LAYOUT.rowHeight (string CSS var), so it does scale with zoom; the mismatch is specific to the virtualized row path. See TorrentTable_Body.tsx (line 122).
Why the header vs row flips at min/max zoom

Header height scales with --tt-zoom-level (CSS). Rows do not (JS fallback). So at smaller zoom, header shrinks below the fixed row height; at larger zoom, header grows above the fixed row height.
What can be done (no code changes requested, just options)

Measure a real element to get pixel height. Create or reuse a hidden element with class="h-row" (or style height: var(--tt-h-row)), then read getBoundingClientRect().height or getComputedStyle(el).height for a numeric value to feed rowHeight. This avoids parsing raw custom property strings and will track --tt-zoom-level.
Use the virtualizer’s measurement path instead of hardcoding. Let rows report their height (e.g., measureElement / observeElementRect) so the virtualizer derives size from actual rendered rows rather than an unscaled JS number.
If you want to keep a CSS‑variable lookup, don’t read --tt-row-h directly. Instead read a computed height from an element that consumes var(--tt-h-row); custom properties aren’t resolved to px when read directly.
Validation status

Unvalidated: audit only, no runtime checks or visual verification were performed.


Re-audit confirms the earlier diagnosis: the mismatch is not in TorrentTable_* styling, it’s in how the numeric row height is derived for virtualization.

What I’m sure about (with concrete anchors)

Headers scale with zoom because they use the CSS utility h-row → height: var(--tt-h-row), and --tt-h-row is defined as calc(var(--tt-uz) *12) where --tt-uz = var(--u)* var(--z) and --z = var(--tt-zoom-level).

Header cell uses h-row: TorrentTable_Header.tsx (line 161)
h-row definition: index.css (line 887)
--tt-h-row + zoom chain: index.css (line 11) and index.css (line 29)
Rows do not scale with zoom because the virtualized row height comes from useLayoutMetrics().rowHeight, and that hook tries to parse the custom property --tt-row-h via parseFloat. But --tt-row-h is defined as var(--tt-h-row) (not a number), so parsing fails and it falls back to a constant base row height (baseUnit * 12).

--tt-row-h is an alias: index.css (line 151)
parsing logic: useLayoutMetrics.ts (line 23) + useLayoutMetrics.ts (line 84)
fallback is unscaled: useLayoutMetrics.ts (line 45)
virtualizer uses that number: useTorrentTableVirtualization.ts (line 82)
row element height is driven by virtualRow.size: TorrentTable_Row.tsx (line 49)
Why you see “header smaller at min zoom, bigger at max zoom”

Header height changes with --tt-zoom-level. Row height stays at the fallback constant (likely 48px if unit=4). So as zoom decreases, header drops below rows; as zoom increases, header rises above rows.
Extra confirmation (this is systemic, not just TorrentTable)

The same broken assumption (“we can parseFloat a CSS var like var(...)/calc(...)”) affects other virtualized lists too, e.g. FileExplorerTree uses rowHeight the same way: FileExplorerTree.tsx (line 404) and applies virtualRow.size: FileExplorerTree.tsx (line 516).
What can be done (conceptually)

If you need a numeric rowHeight for a virtualizer, you can’t reliably read it by parsing a custom property that contains var(...)/calc(...). You must make the browser resolve it by reading a computed property (e.g., measure an element whose height is set via h-row / var(--tt-h-row)), or switch to the virtualizer’s element-measurement path so it derives sizes from actual DOM rows.
