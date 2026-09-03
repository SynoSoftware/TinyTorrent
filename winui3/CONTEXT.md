# Context

Glossary for the WinUI 3 project. Terms only — no implementation detail, no specification
content. The normative behaviour lives in `docs/torrent-table-specs.md`.

## The component

**TableView**
A generic WinUI 3 control for large, changing collections whose cells need arbitrary XAML
content. It owns presentation and interaction mechanics. It knows nothing about any domain.

**Host** *(also: consumer)*
The page, view, or application component that configures a TableView. The host owns records,
domain commands, saved settings, domain mutations, and all filtering — domain and text alike.
TableView owns nothing the host owns.

**Schema**
The host's setup-only configuration: columns, selection mode, the identity selector, the
interaction predicate, and every comparer. Captured once, at the control's first `Loaded`.
It never changes afterwards.

## The view pipeline

**Source snapshot**
One coherent enumeration of the host's items, taken after all of the host's filtering and semantic
ordering. It is what the host hands over when filtering is done; TableView never filters it further.
Every membership or order change produces a new snapshot.

**Base sequence**
The source snapshot in its enumeration order.

**Private view**
TableView's non-mutating display projection over the base sequence. Sort orders it. It is the only
thing rendered.

**Natural order**
The base sequence before any sort. Clearing a sort always returns here — never to an earlier visual
order.

## Layout

**Baseline layout**
The immutable column defaults: what the host declared, plus the control's documented defaults.
Resetting returns here.

**Baseline width**
A column's declared default width, or the control's generic width when none was declared, after
its bounds are applied.

**Width override**
A width that takes precedence over the baseline: a user resize, an explicit fit, or a valid
applied layout width. Overrides survive until another override or a reset replaces them.

**Effective layout**
User-adjusted order, visibility, and width overrides, plus the active sort, resolved against the
baseline layout. Header and rows share exactly one of these.

## Items and selection

**Item** *(also: row item)*
One object from the source. Cell templates receive it directly; there is no per-cell wrapper.

**Identity**
How the control recognises the same item across a source change. Object reference by default,
or a stable string key when the host supplies an identity selector.

**Current item**
The control's logical current row. It may be selected or unselected. It is not the same thing as
physical keyboard focus.

**Anchor**
The row a range selection extends from.

**Packet**
An ordered set of items acted on together, in current visual order — the selected packet for a
command, or the moving packet in a reorder request.

**Non-interactive item**
An item the host has marked as display-only. It renders, but it cannot be selected, invoked,
context-clicked, or joined to a packet, and keyboard navigation skips it.

## Requests

**Reorder request**
The control's report that a user placed a packet at a legal position. It is a request, not a
transaction: the control never mutates the source, and never infers that the host accepted it.

**Layout snapshot**
The data-only record of column order, visibility overrides, width overrides, and active sort.
The control produces and validates it; the host stores it.
