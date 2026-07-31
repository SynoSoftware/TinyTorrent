# TableView — WinUI 3 data-table specification

- Status: version-one component design
- Audience: engineers building dense, interactive WinUI 3 lists
- Normative content: sections 1–9 and Appendix B; Appendix A is a torrent
  host profile

`TableView` is a reusable, `ListView`-based WinUI 3 control for changing
collections whose cells need arbitrary XAML content. It provides one shared
column layout, local search and sort, selection, persisted user layout, and
domain-neutral reorder requests. It is a dense table, not a spreadsheet and not
a domain framework.

## 1. Purpose, scope, and boundaries

For users, the control behaves like a desktop table: scan rich rows, sort,
resize or reorder columns, choose visible columns, select items, and return to
a saved layout. A host can bind a search box so matching rows filter out or
non-matches dim without changing the source data.

For the application developer, configuration is deliberately small: provide
items, columns, optional stable identity and search fields, then handle a few
generic events. The host keeps its data, commands, menus, storage, and domain
policy.

### Version-one scope

| Area | Contract |
|---|---|
| Core table | Virtualized rich rows, fixed shared columns, local single-column sort, resize, reorder, hide/show, and layout persistence. |
| Selection | Native list selection and keyboard navigation, current item, rich-cell input precedence, and key-based continuity. |
| Optional table mechanics | Local word-prefix search (`Filter` or `DimNonMatches`), mouse/pen marquee selection, and mouse/pen multi-row reorder requests. |
| Host-owned behavior | Domain filtering/order, commands and menus, remote work, optimistic updates, search editor, state-specific empty content, and layout storage. |

The following are intentionally outside version one: spreadsheet cell editing
and navigation, grouping/tree rows, frozen columns, summaries, formulas,
pagination, multi-column or remote sorting, a built-in search editor, export,
and a plug-in or visual-token framework.

`TableView` MUST NOT know domain types, domain commands, RPC/polling, remote
search, page chrome, application navigation, or a consumer's resource system.
It never mutates `ItemsSource`, baseline column definitions, or domain state.

## 2. Model and ownership

The **source order** is the latest enumeration order of `ItemsSource` after
the host has applied domain filtering and semantic ordering. The table creates
a non-mutating **view** over it: local search presentation first, then optional
stable sort.
**Natural order** is source order after an active `Filter` search; clearing sort
returns to that order. A **baseline layout** is the declared column defaults;
the **current layout** is the user's resolved order, visibility, widths, and
sort.

| `TableView` owns | The host owns |
|---|---|
| Local view, selection/current state, generic table gestures, current layout, generated header menu, and generic loading/no-results presentation. | Row objects, domain projection, templates, commands, context-menu content, search-box state, persistence store, remote/update policy, and all domain rules. |

The table raises interaction requests after it has completed its own mechanics.
The host decides what each request means and publishes any resulting source
change. There is one interactive selection owner: `TableView`. A page or shell
may project selected IDs outward and request a new selection only when another
surface changes it.

## 3. Public contract

The names below describe the version-one surface; equivalent WinUI naming is
acceptable only when the observable contract is unchanged.

```csharp
public sealed class TableView : Control
{
    public IEnumerable? ItemsSource { get; set; }
    public ObservableCollection<TableColumn> Columns { get; }
    public ObservableCollection<TableSearchField> SearchFields { get; }

    public string? SearchText { get; set; }
    public TableSearchPresentation SearchPresentation { get; set; } =
        TableSearchPresentation.Filter;

    public ListViewSelectionMode SelectionMode { get; set; } =
        ListViewSelectionMode.Extended;
    public IReadOnlyList<object> SelectedItems { get; }
    public object? CurrentItem { get; }
    public Func<object, string>? ItemKeySelector { get; set; }
    public Func<object, bool>? CanInteractWithItem { get; set; }
    public void SetSelection(IEnumerable<object> items, object? currentItem = null);
    public static void SetSuppressRowGestures(DependencyObject element, bool value);
    public static bool GetSuppressRowGestures(DependencyObject element);

    public bool IsLoading { get; set; }
    public bool IsMarqueeSelectionEnabled { get; set; } // false
    public bool IsRowReorderingEnabled { get; set; } = true;
    public object? LoadingContent { get; set; }
    public DataTemplate? LoadingContentTemplate { get; set; }
    public object? EmptyContent { get; set; }
    public DataTemplate? EmptyContentTemplate { get; set; }
    public object? NoResultsContent { get; set; }
    public DataTemplate? NoResultsContentTemplate { get; set; }

    public TableLayoutState GetLayoutState();
    public void ApplyLayoutState(TableLayoutState state);
    public void RefreshView();
    public void AutoFitColumn(string columnId);
    public void AutoFitVisibleColumns();
    public void ResetColumnLayout();

    public event EventHandler<TableSelectionChangedEventArgs> SelectionChanged;
    public event EventHandler<TableItemInvokedEventArgs> ItemInvoked;
    public event EventHandler<TableRowContextRequestedEventArgs> RowContextRequested;
    public event EventHandler<TableRowsReorderRequestedEventArgs> RowsReorderRequested;
    public event EventHandler<TableLayoutChangedEventArgs> LayoutChanged;
}

public sealed class TableColumn
{
    public string Id { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public DataTemplate? HeaderTemplate { get; set; }
    public DataTemplate? CellTemplate { get; set; }

    public double DefaultWidth { get; set; } = 150;
    public double MinWidth { get; set; } = 48;
    public double MaxWidth { get; set; } = double.PositiveInfinity;
    public bool IsVisibleByDefault { get; set; } = true;
    public bool CanHide { get; set; } = true;
    public bool CanResize { get; set; } = true;
    public HorizontalAlignment CellHorizontalAlignment { get; set; } =
        HorizontalAlignment.Left;
    public IComparer<object>? SortComparer { get; set; }
}

public enum TableSearchPresentation { Filter, DimNonMatches }
public enum TableSortDirection { Ascending, Descending }

public sealed class TableSearchField
{
    public Func<object, string?> TextSelector { get; set; } = null!;
}

public sealed record TableLayoutState(
    IReadOnlyList<string> ColumnOrder,
    IReadOnlyDictionary<string, bool> ColumnVisibility,
    IReadOnlyDictionary<string, double> ColumnWidths,
    string? SortColumnId,
    TableSortDirection SortDirection);
```

`ItemsSource`, query/presentation, loading state, optional-gesture flags, and
content properties are bindable dependency properties. `Columns`,
`SearchFields`, selection mode, identity/eligibility selectors, and column
properties are setup configuration: establish them before the first `Loaded`
event and do not structurally change them afterwards. The table captures that
baseline once. Dynamic values inside templates remain normal live bindings.
After schema configuration, `ApplyLayoutState` is valid before or after first
`Loaded`; a pre-load application determines the first presented layout and is
silent.

`TableColumn` is deliberately a simple configuration object, not a second
live state model. `DisplayName` is the localized plain-text default header,
menu label, and accessible name. `HeaderTemplate`, when supplied, receives the
`TableColumn`; it is the composition point for an icon, alternate visual label,
tooltip, or header-local control. `CellTemplate` receives the row item. There
is no separate header-icon, header-description, renderer, property-path, or
column-subclass API.

The control is non-generic so it can be declared directly in XAML; type erasure
is confined to items, selectors, and comparers. Hosts keep rendering strongly
typed with `x:DataType`/`x:Bind` templates and make any necessary row cast only
inside their selector or comparer.

Column IDs must be unique and non-empty, every column supplies a `CellTemplate`,
and every search field supplies a non-null `TextSelector`. `DefaultWidth` and
`MinWidth` are finite; `MaxWidth` is finite or positive infinity; and the
resolved range is valid. A non-null
`SortComparer` makes a column sortable; there is no second sort-enable flag.
`CanHide` and `CanResize` govern their corresponding generic actions. At least
one column remains visible. A malformed schema, invalid item key, or structural
setup change after initialization is a consumer configuration error rather than
a state the control guesses how to repair.

`CanInteractWithItem` defaults to true. A false result renders a non-interactive
row but excludes it from selection, invocation, context targeting, keyboard
navigation, and reorder packets.

### Callbacks and events

`ItemKeySelector`, `CanInteractWithItem`, `SortComparer`, and
`TableSearchField.TextSelector` are pure, synchronous, inexpensive callbacks
on the UI thread. They do not fetch, mutate, or call back into the table.

| Event | Snapshot / purpose |
|---|---|
| `SelectionChanged` | `TableSelectionChangedEventArgs`: selected-item packet and current item after a selection/current-state change. |
| `ItemInvoked` | Invoked item and selected-item packet in current visual order after normal input processing. |
| `RowContextRequested` | Target item, selected packet in current visual order, realized `FrameworkElement` placement target, and nullable pointer point relative to it (`null` for keyboard). |
| `RowsReorderRequested` | Visual-order `MovingItems` and a nullable post-removal `InsertBeforeItem` anchor. |
| `LayoutChanged` | An independent `TableLayoutState` snapshot. |

Events run synchronously on the UI thread after table mechanics. A host may
start asynchronous work, but the table neither awaits it nor interprets its
outcome. `ApplyLayoutState` is silent to prevent restore-and-persist loops.
Event packets and layout snapshots are independent of later table changes.
Unavailable gestures are no-ops; stale persisted layout is recovered
defensively as defined in section 5. A throwing or contract-invalid policy
callback cannot commit partial table state; an event-handler failure never rolls
back host work.

## 4. Items, identity, and update behavior

The control is UI-thread-affine. The host marshals source assignments,
collection notifications, property changes that affect the view, and public
method calls to the XAML dispatcher.

An `INotifyCollectionChanged` source is live for membership and source-order
changes. For another `IEnumerable`, the host reassigns `ItemsSource` after its
membership or order changes. Each accepted change establishes the latest source
order and preserves the current query, current layout, and sort criterion.
`RefreshView()` re-evaluates that captured source order without re-enumerating a
non-notifying source.

`ItemKeySelector` is optional. Without it, identity is object reference. With
it, every item in a source update must have a stable, non-empty, unique string
key. The control reconciles selected/current state to same-key replacement
instances. A same-key rehydration does not raise `SelectionChanged` merely
because the row object changed; a removed, filtered, or non-interactive row is
pruned atomically and causes at most one notification.

`INotifyPropertyChanged` redraws bound cell content; it does not continuously
search, sort, or re-evaluate row eligibility. After a batch changes a value
used by the active sort, configured search fields, or `CanInteractWithItem`,
the host calls `RefreshView()` once. Display-only value updates require no
refresh.

`SetSelection` atomically replaces table selection with eligible rows in the
current view, subject to `SelectionMode`: `None` yields no selection or current
item; `Single` retains the first supplied eligible row in visual order; and
`Multiple`/`Extended` retain all supplied eligible rows in visual order. A
supplied `currentItem` is used only when it is in the resulting selection;
otherwise the first selected row becomes current. Equal selected/current
identities are an idempotent no-op, so an observed shell-ID projection does not
need a feedback suppression guard. `SelectedItems` and every event packet that
contains a set of items use current visual order; a sort or layout change alone
does not raise `SelectionChanged`.

A source, query, presentation, sort, or explicit view refresh during a row
drag or marquee cancels that gesture without a reorder request or partial
marquee result. The table guarantees continuity only for its key-addressable
selection/current state; merging remote snapshots, preserving template-local
edits or animations, optimistic rollback, and update scheduling remain host
policy.

## 5. Columns, sizing, layout, and persistence

Columns use fixed DIPs. `DefaultWidth` is the baseline after clamping to
`MinWidth` and `MaxWidth`; an undeclared width uses the generic 150-DIP
baseline. The default minimum is 48 DIPs. Width does not silently react to
source data, scrolling, sorting, filtering, visibility changes, or window
size. Extra width remains table surface; insufficient width uses horizontal
scrolling.

A user resize, explicit fit, or restored width is an override until another
override or `ResetColumnLayout()` replaces it. Hiding a column retains its
order and width. Reset restores declared order, visibility, widths, and natural
sort state; it does not fit current data.

Resizable visible columns support mouse/pen resize and double-click-to-fit.
The generated header menu provides **Fit this column** and **Fit visible
columns**, plus **Narrow this column** and **Widen this column** for the active
resizable column. The latter change width by 8 DIPs and are disabled at the
relevant bound. A fit considers the header and currently realized normal cells
only, clamps to column bounds, and never realizes off-screen templates or turns
observed content into a permanent minimum. A later explicit fit may see content
that was not previously realized. There is deliberately no automatic sizing or
hidden measurement surface. An unknown `AutoFitColumn` ID is an argument error;
a hidden or non-resizable target is a no-op.

Mouse/pen header drag reorders visible columns. A drag distinguishes itself
from a sort click by the normal drag threshold, shows legal before/between/after
destinations, and changes only the current layout. A visible move reinserts the
column at the selected visible boundary while hidden columns keep their relative
order. Escape, invalid drops, and no-op drops leave layout unchanged. Touch and
keyboard use **Move left**/**Move right** in the generated header menu instead
of a competing direct-touch drag.

Right-click, press-and-hold, or a keyboard context invocation on a header opens
a native `MenuFlyout`. It contains only generic table actions: hide the active
column when allowed, a checked **Columns** visibility submenu, fitting commands,
width adjustments, and move commands. `TableView` localizes those generic
action labels; the host supplies localized column names. The menu cannot hide
every column and has no consumer command injection surface. A passive sortable
header cycles ascending, descending, and natural order through click, tap,
Enter, or Space. Embedded header controls keep their own input.

The data-only layout snapshot persists full order (including hidden columns),
visibility and width overrides, and the active sort. `ColumnVisibility` and
`ColumnWidths` are sparse: a missing ID means use its declared default. The
table fires `LayoutChanged` once after each completed effective user or public
layout operation—sort, column move, visibility change, resize/fit, or reset.
The host may debounce storage of the supplied snapshot.

It does not contain selection/current state, query/presentation, scroll
position, loading state, row data, or transient gesture/menu state.

`ApplyLayoutState` ignores unknown IDs and duplicates after their first valid
occurrence, appends new columns in declared order, clamps valid restored widths,
rejects invalid/non-resizable widths, restores non-hideable columns, falls back
to natural order for an unavailable sort column, and guarantees one visible
column. It treats a missing width or visibility entry as that column's declared
default. `SortDirection` is ignored when `SortColumnId` is null. `TableLayoutState`
has no control-version field: stable column IDs plus defensive restore are
sufficient in version one; a host may version its own storage envelope if it
ever needs to.

## 6. Rich cells, search, and sorting

Cells may contain any ordinary XAML composition—text, icons, progress, buttons,
editors, toggles, tooltips, or a consumer control. The table owns outer-row
selected/current/focus/drag/search-match state; a template supplies domain
content without replacing those states.

Interactive descendants receive their normal pointer, keyboard, focus, context
menu, and automation behavior. They take precedence over row selection,
invocation, context, marquee, and reorder gestures. Passive cell content keeps
normal row selection behavior. For a custom interactive subtree that the table
cannot identify, set `TableView.SuppressRowGestures="True"` on its root or an
ancestor. It suppresses table row gestures from that subtree without suppressing
the child's own input or automation behavior.

Local text search is optional and in-memory. The host owns a normal labeled
WinUI `TextBox` and binds its live query to `SearchText`; it registers one or
more `SearchFields` before initialization. The table owns no search-editor
strings, field syntax, property-path lookup, remote mode, pagination, ranking,
or fuzzy/substring mode.

For immediate filtering, bind `TextBox.Text` two-way with
`UpdateSourceTrigger=PropertyChanged`, then bind that page property one-way to
`TableView.SearchText`. The table never moves focus from the search editor.

For a non-empty query, normalize values and query tokens using invariant case
folding and diacritic removal, then split on non-letter/non-digit characters. A
**parsed local query** has one or more resulting tokens. Every distinct token
must prefix a word in at least one registered field; tokens may match different
fields. Thus `para 50` matches `Paracetamol 500`, while `ara` and `cetamol` do
not. Blank or punctuation-only input has no parsed local query and matches every
row. A parsed local query without fields is a configuration error.

`Filter` is the default: non-matches leave the view, selected/current
non-matches are pruned, and `NoResultsContent` appears when an otherwise
non-empty source has no match. `DimNonMatches` retains all rows in their usual
position and interactivity, marking non-matches visually and with a localized
search-nonmatch state in row automation metadata, never as unavailable. Search
never reorders or ranks rows. A parsed local query makes row dragging
unavailable.

Sort is local and stable. Activating a sortable header cycles ascending,
descending, then natural/source order. Equal values preserve latest source
order. Sorting never mutates `ItemsSource`; clearing it returns to current
natural order. There is no remote-sort callback or multi-column sort in v1.

## 7. Selection, invocation, context, and optional gestures

The default selection mode is native `Extended` list selection; other
`ListViewSelectionMode` values retain their normal WinUI behavior. Non-
interactive rows still render but cannot be selected, invoked, context-targeted,
or moved, and keyboard navigation skips them. `CurrentItem` is the table's
logical current row: it is either null or an eligible member of the current
selection, not a replacement for focus inside a rich child control.

Use the native `ListView` keyboard selection/navigation behavior. Enter invokes
the current passive row; Menu or Shift+F10 requests its context menu. Generated
header sort, menu, fit, visibility, and move actions must be keyboard reachable
using standard WinUI focus and flyout behavior. Version one does not prescribe
a bespoke roving-header focus system.

A double-click, double-tap, or Enter on a passive eligible row raises
`ItemInvoked`; the table does not execute a domain command. A row context
request from right-click, press-and-hold, Menu, or Shift+F10 behaves as follows:

- preserve the selected packet when the target is already selected; otherwise
  select only the target;
- make the target current, logically focused, and the next range-selection
  anchor;
- raise `RowContextRequested` with native placement context so the view can
  create a `MenuFlyout` or `CommandBarFlyout` containing domain commands.

The placement target is transient view context, not a view-model state object.
The host builds the flyout at the view boundary; it uses the selected packet for
bulk actions and the event target for single-row actions. It owns its command
labels, accessibility, and normal focus restoration; `TableView` owns those
concerns only for its generated header menu.

### Row reorder requests

Row reordering is capable by default but offered only when the flag is true, a
`RowsReorderRequested` handler exists, the row is interactive, no parsed local
query or local sort is active, and the host has not disabled it for its own
filter/order/domain state. The host enables it only when it can accept every
structurally valid boundary in the current view; version one deliberately has
no per-drop veto callback. The host must provide an equivalent keyboard/touch
domain move command whenever it enables pointer reordering.

Mouse/pen drag of a selected row moves the complete selected packet in current
visual order. Dragging an unselected row moves only that row and does not turn
it into a multi-row packet or replace the existing selection/current item.
Valid drops express a post-removal boundary:
`InsertBeforeItem` is the remaining item before which `MovingItems` belong, or
`null` for append. Top, between-row, and append boundaries are valid. Invalid,
packet-internal, and no-change placements emit nothing.

The table supplies drag feedback and the request only. It never changes source
or domain order, invents a speculative order, waits for remote work, or
interprets success. Escape or a view-changing update cancels the gesture.
Direct row reordering is mouse/pen only; touch retains native panning,
selection, and press-and-hold context behavior.

### Marquee selection

When `IsMarqueeSelectionEnabled` is true and selection mode is `Multiple` or
`Extended`, a mouse/pen drag beginning on empty row-surface space selects
intersected interactive rows. A plain marquee replaces selection; Ctrl or Shift
makes it additive. Escape or a view-changing update cancels it. It never starts
from a row, header, resize separator, interactive cell, or active reorder
gesture. It has no touch gesture and no toggle or range-anchor behavior. It
intentionally has no edge auto-scroll; ordinary range selection remains the path
for selecting beyond the viewport.

## 8. Loading and empty presentation

The row surface shows, in order:

1. rows when the view has rows;
2. loading content when it is empty and `IsLoading` is true;
3. `NoResultsContent` when local `Filter` search found no match in a non-empty
   source; or
4. `EmptyContent` otherwise.

The host chooses `EmptyContent` for domain-empty, externally filtered,
offline/error, or permission states because only it knows their meaning. It can
bind different content as that page state changes and supplies localized,
meaningful status or recovery content where appropriate. The table presents it
in normal accessible reading order. Existing rows remain visible during refresh.

## 9. Native visual, accessibility, and performance constraints

The row surface uses native `ListView` virtualization and one resolved column
layout shared by header and realized rows. It does not nest a second vertical
`ScrollViewer`; the header remains visible while rows scroll vertically and
stays horizontally aligned with them. Narrow allocations use horizontal
scrolling rather than silently hiding or reflowing chosen columns.

Use built-in WinUI controls, styles, `ThemeResource`s, and the application's
existing resources before adding a custom treatment. `TableView` defines no
palette, font scale, geometry/spacing scale, menu styling system, or visual
token map. Generated headers trim long visible text but expose full localized
`DisplayName` through normal accessible-name/tooltip treatment. Templates own
their own overflow policy and accessible content.

The host supplies a localized accessible name for the table and its search
editor. The control preserves standard list selection, scrolling, focus, and
automation behavior; keeps rich child controls independently reachable; exposes
header labels/sort state, generated-menu state, and dimmed search-nonmatch state;
and does not communicate selection, dimming, focus, non-interactive state, or
drop position by color alone. It
must work in Light, Dark, High Contrast, user accent, normal text/display
scaling, keyboard, mouse, pen, and the supported touch/menu paths. Table-owned
text and required non-text cues meet the applicable 4.5:1/3:1 contrast
requirements. Do not claim unsupported UI Automation table/grid or drag/drop
patterns.

Motion clarifies active resize, legal drag placement, and a committed column
layout change without delaying input or pretending a host row reorder succeeded.
Use normal WinUI layout/transition behavior when available and remain
understandable when system animations are disabled.

Performance is an observable contract:

- normal scrolling and direct column layout gestures do not perform work over
  the full source;
- ordinary bound cell updates redraw cells without rebuilding/searching/sorting
  the view;
- source, query/presentation, sort, or `RefreshView()` changes may rebuild the
  local view;
- fit is limited to currently realized header/cell content;
- optional marquee and row reorder perform no continuous work while idle or
  disabled.

Private implementation structure is deliberately outside this contract. The
control adds no runtime dependency beyond WinUI 3.

## Appendix A — Torrent host profile

This appendix is informative. It records what the torrent page supplies to the
generic control; it does not add torrent behavior to `TableView`.

### A.1 Column policy

| ID | Initial width | Minimum | First-run visible | Cell content |
|---|---:|---:|:---:|---|
| `name` | 150 | 90 | yes | name and error indication/tooltip |
| `progress` | 220 | 110 | yes | progress, percentage, transferred amount |
| `status` | 110 | 95 | yes | localized status |
| `queue` | 80 | table default | yes | queue position |
| `eta` | 110 | table default | no | estimated time |
| `speed` | 180 | 160 | yes | download/upload speed and history |
| `peers` | 88 | table default | yes | connected/available peers |
| `size` | 100 | table default | yes | total size |
| `ratio` | 90 | table default | no | share ratio |
| `added` | 100 | table default | no | added date |
| `completedOn` | 110 | table default | no | completion date |

These are explicit torrent-host defaults, not generic table defaults. The host
supplies typed cell/header templates, localized `DisplayName` values, and
comparers for sortable columns. Its source arrives in semantic queue-ascending
order before a saved layout or user sort applies.

### A.2 Source, policy, and event wiring

Use torrent ID as `ItemKeySelector`. The host may update stable row objects or
publish rehydrated rows with the same ID; the latter preserves table
selection/current state but not template-local animations or edits.

The torrent host builds `ItemsSource` from its current daemon projection: it
applies semantic queue order and All/Downloading/Seeding state filtering before
the table sees rows. To retain current product behavior, ghost/pending rows
bypass the state filter, checking rows appear in both Downloading and Seeding,
and ghosts are non-interactive through `CanInteractWithItem`.

Bind one page-owned `SearchText` to the search box and table. Register `Name`
and `GhostLabel` as search fields; do not apply a second host text filter. The
specified word-prefix match is intentional WinUI behavior, not a promise to
preserve the web table's substring haystack. Enable marquee selection for the
torrent page's desktop experience.

Map generic events at the page boundary:

| Table event | Torrent host responsibility |
|---|---|
| `SelectionChanged` / `SetSelection` | Project selected/current torrent IDs to the shell and accept independent shell selection requests. |
| `ItemInvoked` | Open permitted details/inspector content. |
| `RowContextRequested` | Show the torrent command flyout; bulk commands use the packet and single-item commands use the target. |
| `RowsReorderRequested` | When the All/no-parsed-query/no-local-sort/queue-compatible view is active, map the visual packet and anchor to queue policy, publish an optimistic projection if appropriate, then reconcile daemon state. |
| `LayoutChanged` | Debounce and store the data-only layout using torrent preferences. |

The host disables row reordering whenever its filter, order, or pending queue
operation cannot accept every structural placement. It owns queue priorities,
RPC, errors, commands, and rollback. It calls `RefreshView()` once after a
batch changes a queue/search/eligibility value; rapid progress or speed updates
normally only redraw cells. During setup it supplies the fixed column profile,
applies any stored `TableLayoutState`, then saves subsequent `LayoutChanged`
snapshots.

## Appendix B — Verification

These observable scenarios form the acceptance contract and run in a WinUI
sample or real host integration.

### User-visible behavior and public API

1. Typed templates render rich cells and header content while rows remain
   virtualized and aligned with the header.
2. Header sort, column resize/fit, drag/move, hide/show, and a persisted layout
   round trip produce the documented current layout without mutating source or
   baseline definitions; `ApplyLayoutState` is silent.
3. Explicit widths remain stable across later data, sorting, filtering,
   visibility changes, and window resizing; fit affects only realized content.
4. Selection modes, current item, keyboard navigation, and rich child controls
   behave without competing focus or gesture handling; `SetSelection` observes
   mode capacity and same-key replacement preserves selection/current state
   without a spurious notification.
5. Invocation and context requests give the host the processed selected packet,
   current state, and a usable native flyout placement context.
6. Row reorder emits a current-visual-order packet and legal post-removal
   anchor for top, middle, and append placements; invalid drops do not mutate
   source or emit a request, and an equivalent keyboard/touch domain move route
   exists. When enabled in a multi-select mode, marquee replaces or adds from
   empty mouse/pen surface and cancels cleanly without touch or cell-control
   conflict.
7. Word-prefix search handles multi-field tokens; punctuation-only input is not
   an active query; `Filter` prunes selection and
   shows no-results content, while `DimNonMatches` retains ordinary row
   interaction with a localized nonmatch automation state. A parsed query or
   local sort blocks row reorder.

### Consumer-integration behavior

8. Source notifications and one post-batch `RefreshView()` produce correct
   search/sort/eligibility results; repeat display-only updates redraw cells
   without rebuilding the local view.
9. Loading, local-search no-results, and host-owned empty/error/offline
   content follow the documented precedence.

### Accessibility

10. Keyboard-only use, Narrator/UI Automation inspection, Light/Dark/High
    Contrast, scaling, long localized content, system animation settings, and
    supported mouse/pen/touch paths preserve meaning, focus, and operability.

### Performance and implementation constraints

11. An instrumented source confirms that scrolling and direct column-layout
    gestures do not traverse the full source; view rebuilds occur only at the
    documented source, query/presentation, sort, or `RefreshView()` boundaries,
    and `ListView` remains the sole vertical-scroll owner.
