# RichTable — WinUI 3 Data Table Design Specification

- Status: component design specification
- Scope: version 1
- Audience: engineers building dense, interactive WinUI 3 data lists
- Normative content: sections 1–21 and Appendix B; Appendix A is reference
  material

`RichTable` is a reusable WinUI 3 control for large, changing collections whose
cells need arbitrary XAML content. It combines `ListView` virtualization and
selection with shared column layout, local search, sorting, layout persistence,
and optional row-reorder requests. It fills the gap between a basic list and a
spreadsheet-style grid without taking ownership of application data or actions.

## 1. Purpose and intended experience

For users, `RichTable` is a familiar desktop table: they can scan dense rows,
interact with rich controls inside cells, sort data, change column order and
visibility, resize columns, select ranges, and return to their saved layout.
Search narrows the display immediately without changing the underlying data.

For application developers, the control is declarative and bounded: supply
items, stable identity when needed, column definitions, XAML templates, and
optional search fields; handle a small set of domain-neutral events; persist
the layout snapshot in the host's chosen store.

The component provides:

- arbitrary rich controls and layouts inside cells;
- virtualized rows;
- sorting from column headers;
- column drag reordering;
- column resizing and automatic width fitting;
- column hide/show from a header context menu;
- persisted column order, visibility, widths, and sort;
- optional local text search across host-configured fields, with either
  filtering or dimmed non-matches;
- single, extended, range, keyboard, and marquee selection;
- row activation and row context menus;
- optional drag reordering of one or more selected rows;
- loading, empty, and no-results presentations;
- aligned, horizontally scrolling headers and rows.

The component deliberately keeps these behaviors cohesive rather than exposing
a collection of unrelated helpers. The rest of this document defines their
observable contract and ownership boundaries.

## 2. Scope and intentional non-goals

`RichTable` MUST NOT know about:

- domain entities, domain state names, or a particular row view-model type;
- domain commands, domain context-menu content, navigation, or application
  workflows;
- RPC, polling, remote search, optimistic domain updates, or storage;
- a consumer's localization resources or theme-token system.

Those concerns belong to the host. `RichTable` owns presentation and interaction
mechanics only.

This is a dense item table, not a spreadsheet. Version 1 does not include:

- in-place spreadsheet-style cell navigation;
- column grouping, frozen columns, summaries, formulas, or pagination;
- multi-column sorting;
- arbitrary grouping or tree rows;
- a built-in search box or domain-filter editor;
- data export;
- a general styling or plug-in framework.

These omissions keep the control focused, predictable, and inexpensive to
integrate.

## 3. Design decisions and rationale

1. **Specify observable behavior and ownership.** The contract defines what
   users and hosts observe, not a prescribed internal class structure.
2. **Use WinUI primitives where they fit.** `ListView`, native flyouts, and UI
   Automation provide virtualization, input, and accessibility without a
   parallel control framework.
3. **One owner per state.** The table owns transient view interaction; the host
   owns records, domain commands, saved settings, and domain mutations.
4. **Typed composition, not reflection.** Typed `DataTemplate`s, comparers,
   and callbacks keep row behavior explicit and compile-time discoverable.
5. **Direct row binding.** Each cell receives the row item directly, avoiding
   per-cell wrapper models and their update churn.
6. **No additional runtime dependency.** The control relies on WinUI 3 and
   does not require a data-grid, drag, or command-adapter package.
7. **Pay only for enabled behavior.** Marquee selection, auto-fit measurement,
   and row reordering do no work when disabled or idle.
8. **One local view pipeline.** Search and header sort operate on one private
   view, so selection, layout, and visible order have a single authority.

## 4. Mental model and ownership

### Terms

| Term | Meaning |
|---|---|
| host / consumer | The page, view, or application component that configures `RichTable`. |
| source snapshot | One coherent enumeration of `ItemsSource`, after host filtering and semantic ordering. |
| base sequence | The source snapshot in its enumeration order. |
| private view | The table's non-mutating display projection over the base sequence. |
| natural order | The base sequence after local `Filter` search, if any, preserves its relative order; it is the order before header sorting. |
| baseline layout | Immutable column defaults declared by the host. |
| effective layout | User-adjusted order, visibility, widths, and active sort. |

### Data flow

```text
host source + columns + optional query
    -> RichTable private view (local search, then stable header sort)
    -> virtualized rich rows
    -> gesture events and layout snapshot back to host
```

### `RichTable` owns

- the visible projection and stable sort of `ItemsSource`;
- optional local word-prefix matching and filter/dim presentation of that
  projection;
- realized row containers;
- selection mechanics, anchor, current item, focus, and marquee gesture;
- reconciliation of its selected/current/anchor/focus items to a new source
  snapshot by stable key or reference identity;
- the effective column layout used by both header and rows;
- header sorting, resizing, reordering, and context-menu interaction;
- drag visuals and insertion feedback for optional row reordering;
- horizontal header/body synchronization;
- generation and validation of a serializable layout snapshot;
- loading, empty, and no-results presentation selection.

### The consumer owns

- row objects, their lifetime, and domain-content reconciliation of external
  data updates;
- column definitions and cell templates;
- any optional observed selected-ID/current-ID projection of the table's
  selection;
- whether a row-reorder request is allowed and what it means;
- row and cell commands;
- row context-menu content;
- external/domain filters and the search-box/query state;
- storage and retrieval of the layout snapshot;
- batching view-affecting row changes and asking the table to refresh its
  private view;
- remote fetch timing, cancellation, version ordering, optimistic updates, and
  deferral of disruptive updates while a domain edit or animation is active;
- visual continuity outside table-owned selection/current state, including
  template-local edit state and animations;
- all domain-specific policy.

The table emits requests and events. It MUST NOT execute domain actions or
mutate `ItemsSource` or the baseline column definitions. User layout changes
affect its private resolved layout only.

## 5. Public control contract

The public surface is intentionally small. The following is the version-one
contract; an implementation may use equivalent language conventions without
changing these behaviors:

```csharp
public sealed class RichTable : Control
{
    public IEnumerable? ItemsSource { get; set; }
    public ObservableCollection<RichTableColumn> Columns { get; }
    public ObservableCollection<RichTableSearchField> SearchFields { get; }
    public string? SearchText { get; set; }
    public RichTableSearchPresentation SearchPresentation { get; set; } // Filter

    public ListViewSelectionMode SelectionMode { get; set; } // default Extended
    public IReadOnlyList<object> SelectedItems { get; }
    public object? CurrentItem { get; }
    public Func<object, string>? ItemKeySelector { get; set; }
    public void SetSelection(IEnumerable<object> items, object? currentItem = null);
    public static void SetSuppressRowGestures(DependencyObject element, bool value);
    public static bool GetSuppressRowGestures(DependencyObject element);

    public bool IsLoading { get; set; }
    public RichTableEmptyState EmptyState { get; set; } // Empty | NoResults
    public bool IsMarqueeSelectionEnabled { get; set; }
    public bool IsRowReorderingEnabled { get; set; }
    public Func<object, bool>? CanInteractWithItem { get; set; }

    public object? LoadingContent { get; set; }
    public DataTemplate? LoadingContentTemplate { get; set; }
    public object? EmptyContent { get; set; }
    public DataTemplate? EmptyContentTemplate { get; set; }
    public object? NoResultsContent { get; set; }
    public DataTemplate? NoResultsContentTemplate { get; set; }

    public RichTableLayoutState GetLayoutState();
    public void ApplyLayoutState(RichTableLayoutState state);
    public void RefreshView();
    public void AutoFitColumn(string columnId);
    public void AutoFitAllColumns();
    public void ResetColumnLayout();

    public event SelectionChangedEventHandler SelectionChanged;
    public event EventHandler<RichTableItemInvokedEventArgs> ItemInvoked;
    public event EventHandler<RichTableRowContextRequestedEventArgs>
        RowContextRequested;
    public event EventHandler<RichTableRowsReorderRequestedEventArgs>
        RowsReorderRequested;
    public event EventHandler<RichTableLayoutChangedEventArgs> LayoutChanged;
}
```

`ItemsSource`, `SearchText`, `SearchPresentation`, loading/empty state, and the
runtime interaction flags `IsMarqueeSelectionEnabled` and
`IsRowReorderingEnabled` are bindable dependency properties. `SearchText`
defaults to empty and `SearchPresentation` to `Filter`. The table renders no
input: the host owns a normal WinUI search box and binds its live text to
`SearchText`.

`ItemsSource` may be any `IEnumerable`. It is the host's already domain-filtered
projection. When that projection is empty, the host binds `EmptyState` to
`Empty` when its wider source has no items and `NoResults` when an external
filter excluded them. When the table's own `Filter` search excludes
otherwise-present source rows, the table selects `NoResultsContent` itself.

`Columns`, `SearchFields`, `SelectionMode`, `ItemKeySelector`,
`CanInteractWithItem`, and each column comparer are setup-only schema/policy
configuration. The table captures them exactly once at its first `Loaded`
event. A host may populate them in XAML or code before then; changing a
setup-only property, or structurally adding, removing, or replacing a column or
search field afterwards, fails fast. This fixed schema keeps cell templates,
persisted layout, identity semantics, search meaning, and selection rules
stable. Runtime changes belong in bindable state or the resolved layout, not in
the schema.

`Columns` form the immutable baseline. The table keeps a separate effective
order, visibility, widths, and sort state. A drag, resize, visibility change,
or `ApplyLayoutState` MUST NOT mutate the definitions.
`ResetColumnLayout()` restores the captured baseline.

`SetSelection` is the only programmatic selection entry point. It atomically
replaces the table-owned selection/current item after resolving the requested
items to eligible instances in the current private view. A `null` `currentItem`
(including an omitted argument) makes the first selected item in current visual
order current, or makes current `null` when nothing remains selected. It is
idempotent: if the effective selected identities and current identity are
unchanged, it does not raise `SelectionChanged`. Hosts can therefore project
selection to shell/view-model IDs on `SelectionChanged`, then call
`SetSelection` when another surface changes that projection, without a
suppression flag or second interactive selection model.
`SelectedItems` and `CurrentItem` are observational properties, not writable or
two-way-bound state.

`CanInteractWithItem` defaults to true. When it returns false, the item still
renders but cannot be selected, invoked, context-clicked, or included in a row
drag packet. Keyboard navigation skips it. Eligibility is evaluated on each
view rebuild and immediately before an item interaction.

`ItemKeySelector` is optional. Without it, identity is object reference. When
provided, it returns a stable, non-empty, unique string key for every item in a
source snapshot; the table uses ordinal string comparison to reconcile
table-owned selection, current item, anchor, and focus across source
rehydration.
The selector MUST be pure and inexpensive.

The API is intentionally non-generic, matching WinUI item controls and keeping
the control directly usable from XAML. Type erasure is confined to the item
boundary (`ItemsSource`, events, selectors, and comparers); typed
`DataTemplate`s with `x:DataType` retain the host's row type for rendering.
There is no generic control hierarchy, reflection, property-path API, or
untyped row wrapper. The host contains the one explicit row-type cast in each
selector/comparer declaration; a type mismatch is a configuration error, not
a second dynamic data model.

### 5.1 Callback and event boundary

The control deliberately has two extension mechanisms, with no overlap:

| Surface | Kind | Used for | Must not do |
|---|---|---|---|
| `ItemKeySelector` | synchronous policy callback | stable item identity | allocate, fetch, mutate, or depend on visual state |
| `CanInteractWithItem` | synchronous policy callback | display-only versus interactive rows | execute a command or change selection |
| `SortComparer` | synchronous column callback | comparing two row items during sort | format UI, mutate items, or call RPC |
| `RichTableSearchField.TextSelector` | synchronous policy callback | text searched for one selected field | allocate, fetch, mutate, or inspect visual state |
| `SelectionChanged` | host event | publish an optional external selection projection | continuously feed its own output back |
| `ItemInvoked` | host event | primary domain action | assume an action was completed |
| `RowContextRequested` | host event | construct/show a domain menu | put domain menu logic in the table |
| `RowsReorderRequested` | host event | request a domain reorder | mutate `ItemsSource` through `RichTable`; the host may update its own source after the event |
| `LayoutChanged` | host event | debounce a persisted layout snapshot | write settings on every pointer movement |

Policy callbacks are called on the UI thread and MUST be pure, synchronous, and
cheap. The table never calls them per render frame. Sort comparers are called
`O(n log n)` during an explicit sort and therefore must be especially cheap.

Events are the component's callback API for completed gestures or table-state
changes. They fire only after the table has completed its own mechanics.
`SelectionChanged` can also result from `SetSelection` or source/search/
eligibility reconciliation. It retains native `SelectionChangedEventArgs`: read
the updated `SelectedItems` and `CurrentItem` from the table in the handler.
Every selected-item packet below is in current visual row order. The custom
event payloads are immutable snapshots:

| Event | Event args contract |
|---|---|
| `ItemInvoked` | `Item`, ordered `SelectedItems` |
| `RowContextRequested` | `Item`, ordered `SelectedItems`, row `PlacementTarget`, `RelativePoint` |
| `RowsReorderRequested` | visual-order `MovingItems`, non-null `TargetItem` not in `MovingItems`, `Before`/`After` placement |
| `LayoutChanged` | `LayoutState` and one `Kind`: `Sort`, `ColumnMove`, `ColumnResize`, `AutoFit`, `Visibility`, or `Reset` |

`ApplyLayoutState` is silent. A drop onto an item already in `MovingItems` is a
no-op and does not raise a reorder event.

Events are raised synchronously on the UI thread. A host may start or forward
async work from an event handler, but the table does not await it and never
infers success from it. In particular, a reorder event is a request, not a
transaction.

Do not add parallel `ICommand` properties or an async completion protocol for
these events. They would duplicate delivery and make gesture ordering unclear.
A host may use ordinary XAML event handlers or adapt events to its own command
model outside the control.

### 5.2 MVVM consumption

`RichTable` follows normal WinUI control semantics: bind values into dependency
properties and receive interaction requests or state changes as events. A page
may forward an immutable event packet to its view-model command or application
service using the MVVM mechanism it already uses. That forwarding is
deliberately outside the control; it requires no behavior library, command
adapter, or framework-specific dependency.

The table is the single interactive selection owner. A page or shell only
needs an ID projection when another surface—such as a command bar or detail
pane—uses it. It observes the table's `SelectionChanged` output and makes an
intentional `SetSelection` request only when another surface changes the
selection. There is intentionally no two-way selected-items binding: that
would create a competing selection owner. The idempotence rule above prevents a
feedback loop. Cell commands belong in the typed cell template; a row-context
request necessarily remains at the view boundary because it carries placement
and pointer information.

### 5.3 Source, identity, and update contract

The control is UI-thread-affine. `ItemsSource` assignment, source enumeration,
`INotifyCollectionChanged` notifications, public method calls, and callbacks
MUST occur on its XAML `DispatcherQueue`. A host receiving daemon, RPC, or
background data marshals a completed update to that queue before changing its
source. The table does not dispatch, serialize, cancel, or order external
updates.

On `ItemsSource` assignment, and after every observed collection notification,
the table captures one ordered source snapshot. `Add`, `Remove`, `Move`,
`Replace`, and `Reset` are all visible as a new snapshot; `Reset` is equivalent
to replacement of the complete source input. The implementation may update a
private view incrementally or rebuild it, but the observable result MUST be the
same. The enumerable must be finite and stable for each enumeration. A one-shot
iterator is treated as a snapshot and the host supplies a new iterator for a
later source update.

A source that implements `INotifyCollectionChanged` is live for membership and
source-order changes. A plain `IEnumerable` is immutable from the table's
perspective after assignment: the host assigns it again after changing its
membership or order. Each accepted source update retains the current query,
search presentation, layout, and sort criterion, then applies local search and
stable header sort to the new base sequence.

A source update establishes the latest base sequence. In an unsorted view, the
visible natural order is that sequence, or its relative-order-preserving
`Filter` subset. In a sorted view, the same latest sequence breaks equal
comparer values. Clearing sort always returns to this latest natural order; it
never restores an earlier visual order.

`INotifyPropertyChanged` on a row redraws ordinary bound cell content only.
It does not automatically re-search, re-sort, or re-evaluate eligibility.
After a batch changes any value used by the active sort, configured search
fields, or `CanInteractWithItem`, the host calls `RefreshView()` once.
`RefreshView()` re-evaluates the current source snapshot, applies the current
search and sort, and does not re-enumerate or fetch a non-notifying source.
Display-only updates need no call.

When `ItemKeySelector` is configured, every new source snapshot—including
assignment, `Add`, `Remove`, `Move`, `Replace`, and `Reset`—reconciles selected
items, current item, selection anchor, and focus to the current row instances
by key. `SelectedItems` then exposes those new instances.
A rehydration with the same logical selected/current identities does not raise
`SelectionChanged` merely because objects or visual positions changed. An
anchor or focus item that no longer survives clears. Without a selector, object
reference is identity, so a replacement object is a removal and an addition.
Null, empty, or duplicate configured keys are a source-contract error and fail
fast.

If an update removes, locally filters out, or makes an item non-interactive,
the table prunes the effective selection/current item atomically. If that
removes the current item while selected items remain, the first retained
selected item in current visual order becomes current; otherwise current becomes
`null`. The table raises at most one `SelectionChanged` event. Source reordering
and header sorting do not raise that event when the logical selected/current
packet is unchanged.

A source update, `RefreshView()`, `SearchText`/`SearchPresentation` change, or
sort change during a row drag cancels the drag without raising
`RowsReorderRequested`. During a marquee gesture it restores the pre-gesture
logical selection, then reconciles it to the resulting current private view.
Header resize and
column-drag gestures are data-independent and remain active.

An explicit `SetSelection` request, or turning off
`IsMarqueeSelectionEnabled`/`IsRowReorderingEnabled` during its corresponding
gesture, cancels that gesture before applying the new state. It never produces a
reorder request.

Policy callbacks MUST NOT mutate the source or call back into the table. Events
are post-mechanics: a handler may publish an optimistic source update or start
async domain work. If it changes source or control input synchronously, the
table processes that change after the current event returns; it MUST NOT re-enter
the gesture or expose a mixed old/new view.

The table guarantees continuity only for its own key-addressable state. It does
not merge domain snapshots, retain row view models, preserve arbitrary cell
animation/edit state, or promise scroll anchoring across disruptive replacement.
A host that needs that continuity keeps stable row objects or defers/reconciles
its external updates. Remote fetch coalescing, cancellation, version checks,
optimistic rollback, and update deferral remain host policy.

## 6. Column contract

```csharp
public sealed class RichTableColumn : DependencyObject
{
    public string Id { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;

    public object? Header { get; set; }
    public DataTemplate? HeaderTemplate { get; set; }
    public DataTemplate? CellTemplate { get; set; }

    public double DefaultWidth { get; set; }
    public double MinWidth { get; set; }
    public double MaxWidth { get; set; }

    public bool IsVisibleByDefault { get; set; }
    public bool CanHide { get; set; }
    public bool CanResize { get; set; }
    public bool CanSort { get; set; }

    public HorizontalAlignment CellHorizontalAlignment { get; set; }
    public IComparer<object>? SortComparer { get; set; }
}
```

### 6.1 Search-field contract

```csharp
public enum RichTableSearchPresentation
{
    Filter,        // default: non-matches leave the view
    DimNonMatches  // non-matches remain visible in a dimmed row state
}

public sealed class RichTableSearchField
{
    public Func<object, string?> TextSelector { get; set; } = null!;
}
```

A search field is one host-configured text value, independent of column
visibility. It can therefore search a non-displayed value without inventing a
hidden column. `TextSelector` returns `null` when its row has no value for that
field. The control validates every registered selector during initialization.
Any consumer that binds `SearchText` MUST register at least one field before
initialization; an active query without fields fails fast as a configuration
error rather than silently hiding every row.

There is deliberately no field name, property path, query-language syntax, or
per-row search wrapper. A consumer that wants to search three values registers
three fields. The selector is a pure, cheap callback and is evaluated while
rebuilding the search view, never while rendering a cell.

### 6.2 Column invariants

Required invariants:

- `Id` is stable, unique, non-empty, and is the persistence key.
- `DisplayName` is a non-empty localized plain-text name used by generated menus
  and UI Automation; it need not match the visual header exactly.
- `CellTemplate` receives the row item as its `DataContext`/content.
- `DefaultWidth`, `MinWidth`, `MaxWidth`, and persisted widths are finite
  device-independent pixels; resolved widths are clamped to `[MinWidth, MaxWidth]`;
- at least one column remains visible;
- `CanHide == false` prevents hiding that column;
- a column is sortable only when `CanSort` is true and it has a pure comparer
  that defines a consistent total ordering for the consumer's rows;
- hidden columns retain their resolved position and most recent width;
- the declaration order and `DefaultWidth`/`IsVisibleByDefault` form the reset
  baseline; runtime layout lives only in `RichTableLayoutState`.

The table validates every column and search-field definition when it captures
the schema at `Loaded`. Missing or duplicate values fail fast in development
rather than producing an unusable header later. Changing a captured column
definition or comparer, or a registered search field's `TextSelector`, after
that point is unsupported and fails fast. Values bound inside a cell or header
template remain live; only the schema definition is fixed.

Defaults SHOULD be:

- visible, hideable, and resizable;
- non-sortable unless a comparer is supplied;
- a sensible pixel width with a sensible minimum;
- maximum width unbounded;
- cell content left aligned.

All visible columns are reorderable in version one. Version 1 does not include
per-column subclasses, render delegates, property paths, table-owned value
converters, or a separate column registry.

## 7. Rich cells

A cell template can contain any normal WinUI content, including:

- formatted text, icons, badges, and multiple aligned values;
- `ProgressBar` with labels;
- `Button`, `ToggleButton`, or command surfaces;
- `CheckBox`, `ToggleSwitch`, `ComboBox`, or `TextBox`;
- a consumer-defined `UserControl`;
- tooltips and accessibility descriptions.

Example:

```xml
<DataTemplate x:Key="ProgressCellTemplate"
              x:DataType="viewModels:ProgressRowViewModel">
    <Grid ColumnDefinitions="*,Auto" ColumnSpacing="8">
        <ProgressBar Value="{x:Bind Progress, Mode=OneWay}" />
        <TextBlock Grid.Column="1"
                   Text="{x:Bind ProgressText, Mode=OneWay}" />
    </Grid>
</DataTemplate>
```

The table MUST NOT convert rich templates into text values or take over their
visual styling.

Input rules:

- interactive descendants receive pointer, keyboard, and focus input normally;
- clicking a `Button`, editor, selector, or toggle MUST NOT also invoke the row;
- table keyboard shortcuts MUST ignore text-editing controls;
- clicking passive cell content follows normal row-selection behavior;
- a consumer can update cell values through normal binding and
  `INotifyPropertyChanged`.

For a custom interactive control the table cannot recognize automatically, set
`RichTable.SuppressRowGestures="True"` on its root or an ancestor. It prevents
row selection, invocation, marquee initiation, and row dragging from that
subtree without adding another policy callback.

## 8. Rendering constraints

The implementation MUST preserve native vertical virtualization and a single
effective column layout shared by headers and rows:

- use one native `ListView` for the vertical item surface and do not nest it in
  another vertical `ScrollViewer`;
- render each realized row from its row item and the visible column templates;
- derive header and row widths from the same resolved column values;
- keep the header visible during vertical scrolling and synchronize horizontal
  scrolling between header and body without feedback loops;
- retain columns at narrow widths and use horizontal scrolling rather than
  silently hiding or reflowing data.

The host controls which columns are visible through the header menu. Header and
cell controls remain reachable at every width. Private presenter classes and
template composition are implementation choices, not extension points.

## 9. Local text search

`RichTable` provides optional, local, in-memory text search. It uses normalized
word-prefix matching so users can narrow a dense list quickly without ambiguous
mid-word substring matches. The table renders no search editor: the host owns
an ordinary `TextBox` and query state, then binds the live query to
`SearchText`.

```xml
<TextBox
    AutomationProperties.Name="Search table"
    Text="{x:Bind ViewModel.SearchText,
                   Mode=TwoWay,
                   UpdateSourceTrigger=PropertyChanged}" />

<controls:RichTable
    ItemsSource="{x:Bind ViewModel.StateFilteredRows, Mode=OneWay}"
    SearchText="{x:Bind ViewModel.SearchText, Mode=OneWay}"
    SearchPresentation="Filter" />
```

`UpdateSourceTrigger=PropertyChanged` is required: typing updates the table
immediately and the table never moves focus away from the search box. The
source property MUST notify `PropertyChanged` so the one-way table binding also
updates. The same page-owned `SearchText` can be used by other page policy.

### 9.1 Match contract

`SearchFields` is the configured-field list. It is configuration, not a
type-in query language: there is no comma-prefixed field selector,
`field:value`, property-name lookup, or reflection.

For a non-empty query:

- tokenize both query and values into maximal Unicode letter-or-digit words;
- normalize words with invariant case folding and diacritic removal;
- treat whitespace and punctuation, including commas, as word separators;
- discard duplicate query tokens after normalization;
- require every query token to prefix-match a word in at least one registered
  search field; different tokens may match different fields;
- reject mid-word substring matching.

Thus `para 50` matches `Paracetamol 500`; `ara` and `cetamol` do not.
`joh urin` can match a row with `John Smith` in one selected field and
`Urine analysis` in another. A blank or punctuation-only query has no tokens
and matches every row.

There is no contains, quoted phrase, fuzzy, field-qualified, ranked, remote,
or paged mode in version one. If a future screen needs server-backed search, it
supplies its already-filtered rows through `ItemsSource`; it does not add an
async search callback to this control.

### 9.2 View and interaction behavior

```text
current base sequence (host's domain/semantic order)
    -> determine match for each row against SearchFields
    -> Filter: retain matches / DimNonMatches: retain all
    -> stable header sort
    -> rendered rows
```

`Filter` is the default. It removes non-matches, prunes non-matching selected
and current items, and automatically uses `NoResultsContent` when source rows
exist but none match. If pruning changes selection/current item, it raises the
ordinary `SelectionChanged` event after the new view is established. Clearing
the query does not restore selections that were pruned.

`DimNonMatches` retains every row in its normal sorted position and gives
non-matches a distinct, theme-aware dimmed row visual state. It is visual only:
non-matches retain their ordinary interactivity, selection/current-item state,
and availability semantics; selected styling remains unambiguous. Its visual
state MUST remain distinguishable in High Contrast without opacity alone. Use
`Filter` when selection and commands must be constrained to matches. A no-match
dimmed view still displays its rows, so it does not replace them with
`NoResultsContent`.

Search never ranks matches, changes natural order, or owns sorting. Header sort
remains the only sort authority and is applied after the search decision.
`SearchText` is transient query state and is not included in
`RichTableLayoutState`.

The control re-evaluates search when `SearchText`, `SearchPresentation`,
`ItemsSource`, or its observed collection changes. Changing presentation
rebuilds the current view immediately. A change into `Filter` prunes
non-matching selection/current item and raises one ordinary `SelectionChanged`
only when that packet changed. It MUST NOT re-search every row on every
`INotifyPropertyChanged` notification. After a batch changes a configured
search field, active sort value, or eligibility, the host calls
`RefreshView()` once as defined in section 5.3.

An active parsed query (at least one token) makes row reordering ineligible in
both presentations. The control does not start, and cancels, a row-drag gesture
in that state even if `IsRowReorderingEnabled` is true. The consumer still owns
the equivalent rule for its external filters and semantic ordering.

## 10. Sorting

Header primary-click behavior:

1. an unsorted sortable column becomes ascending;
2. ascending becomes descending;
3. descending returns to natural/source order.

Only one column is sorted at a time. The active header shows direction using a
native, theme-aware glyph and exposes the state through UI Automation.

Sorting requirements:

- sorting creates a private view; it does not reorder `ItemsSource`;
- sorting is stable;
- equal values retain the exact current base-sequence order;
- null placement is defined by the consumer comparer;
- natural order means the current base-sequence order after local `Filter`
  search, which preserves that order;
- identity is the string `ItemKeySelector` result when supplied, otherwise
  object reference; invalid keys fail fast and unavailable items are pruned
  from selection;
- source updates and rehydration follow section 5.3;
- normal property notification redraws cells but does not continuously resort;
- the host calls `RefreshView()` after a batch changes any active
  view-affecting value.

Avoiding automatic re-sorts on every property notification is important for
rapidly changing data such as speed and progress.

There is no `SortRequested` callback or remote-sort mode in version one.
Sorting is a local table projection; add an explicit external-sort mode only if
a real consumer requires it.

## 11. Column resizing and automatic fitting

Every resizable visible column has a pointer/touch resize separator.

- dragging captures the pointer and updates the shared resolved width;
- the width is clamped to the column limits;
- Escape cancels the active drag and restores the starting width;
- double-clicking the separator auto-fits that column;
- the header menu includes **Fit all columns**;
- the table raises one coalesced `LayoutChanged` notification when the gesture
  ends, not one persistence write per pointer movement.

Auto-fit measures the rendered header and currently realized cells only. The
result includes normal padding and the sort glyph, then is clamped to the column
limits. It MUST NOT instantiate off-screen row templates, materialize all rows,
or maintain a hidden measurement table.

A value that has never entered the viewport may require a later manual resize
or another fit after scrolling. This boundary preserves virtualization and
avoids a second rendering path for an infrequent convenience action.

## 12. Column drag reordering

Dragging a header reorders visible columns.

- movement begins only after the normal drag threshold;
- the dragged header remains identifiable;
- an insertion marker shows the destination;
- dropping before or after a header updates the effective layout order;
- Escape cancels without changing the order;
- a click that never crosses the drag threshold still sorts;
- hidden IDs never move during a visible-column drag; the dragged visible ID is
  inserted immediately before or after the visible target, based on the drop
  half, in the full logical order;
- selection and row scroll position do not change.

Only a passive header surface starts sorting or column drag. Embedded header
controls retain their normal input behavior.

Column drag MUST remain local to the control and require no additional runtime
drag-and-drop dependency.

## 13. Header context menu

Right-clicking a header opens a native `MenuFlyout`. Right-clicking unused
header space opens the same menu without an active-column action.

The menu provides both pointer actions and keyboard-accessible alternatives:

- **Hide this column** when it is hideable and another column can remain;
- a **Columns** submenu containing a `ToggleMenuFlyoutItem` for every column;
- **Fit this column** and **Fit all columns**;
- **Move left** and **Move right** for the active column.

Double-clicking a resizer fits one column. The per-column fit and move commands
are the keyboard-accessible alternatives to the pointer resize and drag
gestures. The columns submenu uses each
column's `DisplayName`; generic action labels are resources supplied by
`RichTable` and may be overridden by the host. This keeps localization local to
the component without coupling it to application resources.

The menu MUST prevent a state with zero visible columns and must respect
`CanHide`.

## 14. Selection and keyboard behavior

Default selection mode is extended.

Pointer selection:

- plain click selects one row and sets the anchor;
- Ctrl-click toggles one row;
- Shift-click selects the inclusive range from the anchor;
- Ctrl+Shift-click adds the inclusive range;
- clicking empty space clears selection unless a marquee gesture begins;
- selection is based on row identity, not visual index.

Non-interactive display rows are skipped by pointer and keyboard selection.

Keyboard selection:

- Up/Down moves the current item;
- Shift+Up/Down extends from the anchor;
- Home/End moves to the first/last row;
- Shift+Home/End extends to the first/last row;
- Ctrl+A selects all rows when multiple selection is enabled;
- Enter invokes the current row;
- Space retains native selection semantics unless consumed by an interactive
  cell control.

The control MUST scroll the current item into view when keyboard navigation
moves beyond the viewport.

Selection MUST survive sorting, column changes, row recycling, and same-key
source rehydration. Removed or unavailable items are pruned as defined in
section 5.3.

`SetSelection` replaces the selected packet atomically. It resolves supplied
items to eligible current-private-view instances by key when a selector is
configured, enforces `SelectionMode`, and silently drops duplicate,
unavailable, and non-interactive items. A null or omitted requested current item
uses the first selected item in visual order or `null`; a requested current item
that is not selected does the same. A host treats `SelectionChanged` as an
output and calls `SetSelection` only for an independent external selection
action; an equal logical request is a no-op.

## 15. Marquee selection

When `IsMarqueeSelectionEnabled` is true, dragging from empty row-surface space
creates a selection rectangle.

- the rectangle is drawn in an overlay above rows and below menus;
- intersection with realized row bounds selects those rows;
- auto-scroll occurs near the top or bottom edge;
- Ctrl adds/toggles against the selection captured at gesture start;
- Shift extends from the current anchor;
- Escape cancels and restores the starting selection;
- the gesture never begins from an interactive cell descendant, header, resize
  separator, or active row-reorder handle/gesture;
- the overlay disappears on completion, Escape cancellation, unload, or a
  view-changing update; section 5.3 defines the latter to restore the
  pre-gesture logical selection before reconciliation.

Only visible/realized geometry is measured. As auto-scroll realizes additional
rows, they participate normally.

## 16. Row activation and context requests

A row is invoked by double-click, double-tap, or Enter when the original input
target is not an interactive cell descendant. `ItemInvoked` supplies the row
item and the current selection. It does not execute a command itself.

Right-click behavior:

- if the row is already selected, preserve the existing multi-selection;
- otherwise select only that row;
- raise `RowContextRequested` with the target item, an immutable selected
  packet, a row `FrameworkElement` placement target, and a point relative to
  that target;
- let the consumer construct and show the domain-specific menu.

This behavior makes multi-selection context menus predictable for any domain.

## 17. Optional row drag reordering

Row reordering is disabled by default. When enabled, it supports multi-row
movement without embedding domain ordering policy.

The consumer MUST set `IsRowReorderingEnabled` to false whenever its external
filter or semantic sort makes placement ambiguous. Section 9.2 separately
enforces the same restriction for an active built-in search query. If either
condition becomes false during a drag, the table cancels the drag. For a race
or command failure, the consumer simply does not change (or reconciles) its
projection; there is no post-drop accept/reject protocol.

- dragging an unselected row creates a one-item drag packet;
- dragging a selected row moves the selected packet;
- non-interactive display rows cannot start or join a drag packet;
- packet order follows the current visual order;
- an insertion indicator shows before/after the target row;
- dropping raises `RowsReorderRequested`;
- the event supplies `MovingItems`, a non-null `TargetItem`, and
  `Before`/`After`; a target within `MovingItems` and a drop outside a row are
  no-ops;
- `RichTable` does not mutate the collection; after the event, the host may
  update its own source;
- the table returns to idle immediately after the event; the consumer may begin
  asynchronous domain work and reconcile its own projection;
- selection stays on the moved packet;
- Escape cancels the drag;
- cell controls that handle manipulation do not start row dragging.

The host decides whether reordering is valid under its current sort/filter and
how visual placement maps to domain ordering. Optimistic updates, remote calls,
failure handling, and reconciliation remain outside `RichTable`.

## 18. Loading and empty states

`RichTableEmptyState` has exactly two values: `Empty` and `NoResults`. It is
the consumer's fallback for an externally filtered empty `ItemsSource`, because
only the host knows whether its wider domain source has no items or a domain
filter excluded them. The control independently recognizes zero results
from its own active `Filter` search.

The row surface shows exactly one of:

1. rows when the current view has items;
2. loading content when the view is empty and `IsLoading` is true;
3. `NoResultsContent` when an active `Filter` search found no match in a
   non-empty source snapshot;
4. the content selected by `EmptyState` when the view is otherwise empty.

Content and templates come from the consumer. The table provides layout only.
During refresh, existing rows remain visible. Application-level error, offline,
and permission states remain outside the table unless the consumer deliberately
supplies them as content.

## 19. Layout persistence

The table exposes, but does not store, a versionable data-only snapshot:

```csharp
public sealed record RichTableLayoutState(
    IReadOnlyList<string> ColumnOrder,
    IReadOnlyDictionary<string, bool> ColumnVisibility,
    IReadOnlyDictionary<string, double> ColumnWidths,
    string? SortColumnId,
    RichTableSortDirection SortDirection);
```

Persist:

- full column order, including hidden columns;
- visibility;
- explicit pixel widths;
- active sort column and direction.

Do not persist:

- selected/current items;
- `SearchText`, `SearchPresentation`, or transient match state;
- scroll offsets;
- loading state;
- hover, drag, resize, marquee, or context-menu state;
- row data.

Applying saved state MUST be defensive:

- ignore unknown IDs;
- ignore duplicate IDs after their first valid occurrence;
- append newly introduced columns in definition order;
- clamp invalid widths;
- restore required columns if saved as hidden;
- fall back to natural order if the sort column is missing or no longer
  sortable;
- guarantee at least one visible column.

`LayoutChanged` is raised once after a user sort, resize/auto-fit, visibility
change, column move, or explicit reset. It is not raised by initial setup or
`ApplyLayoutState`; this prevents restore-and-persist loops. The host
debounces and writes the supplied `LayoutState` snapshot using its settings
store.

## 20. Accessibility, input, and theming

The control MUST:

- work with mouse, keyboard, and touch;
- expose table/list, row, and header names through UI Automation;
- announce selected state and sort direction;
- expose a dimmed non-match as "not matching current search" through UI
  Automation without marking the row unavailable;
- keep visible focus indicators;
- use `ThemeResource` brushes and metrics;
- support Light, Dark, and High Contrast themes;
- not communicate sort, selection, drag destination, or state by color alone;
- use native flyouts and menu-item keyboard behavior;
- give resize and reorder actions keyboard-accessible menu alternatives;
- avoid hard-coded colors and application-specific semantic tokens.

Column headers use localized accessible names. Rich interactive cells retain
their own automation peers and tab behavior.

## 21. Performance requirements

The component targets frequently updating lists with thousands of items.

- Vertical rows MUST be virtualized and recycled by `ListView`.
- No work may scale with all rows during normal scrolling, column drag, resize,
  or visibility changes.
- A display-only row update MUST NOT rebuild the whole table. A source, query,
  sort, or `RefreshView()` change may recompute the private view as specified.
- Column layout changes rebuild only header cells and realized row presenters.
- Active sorting is `O(n log n)` and occurs only on source, query, sort, or
  explicit `RefreshView()` changes.
- Search is `O(rows * configured fields * query tokens)` only when the active
  query, source, or `RefreshView()` changes; it never runs during scrolling or
  per-frame rendering.
- Search reads selected fields directly and does not allocate a concatenated
  per-row "haystack".
- Auto-fit measures only the header and realized cells.
- Pointer movement updates visuals without persisting or allocating a new full
  layout snapshot each time.
- The hot rendering path contains no reflection and no per-frame LINQ.
- Disabled marquee and row-reorder features install no active timers or
  background work.

The component introduces no runtime dependency beyond WinUI 3. This keeps
package size, memory use, and versioning surface small.

## Appendix A — Reference integration: torrent list

This appendix is informative. It describes one concrete host configuration and
the torrent-specific behavior it must supply. It does not add requirements to
the generic `RichTable` contract.

### A.1 Reference profile

The torrent list uses the following columns. They are host configuration, not
built-in `RichTable` behavior.

| ID | Default width | Minimum | Default visible | Cell content |
|---|---:|---:|:---:|---|
| `name` | 150 | 90 | yes | name and secondary state text |
| `progress` | 220 | 110 | yes | progress bar, percentage, transferred amount |
| `status` | 110 | 95 | yes | localized status |
| `queue` | 80 | default | yes | queue position |
| `eta` | 110 | default | no | estimated time |
| `speed` | 180 | 160 | yes | download and upload speed |
| `peers` | 88 | default | yes | connected/available peers |
| `size` | 100 | default | yes | total size |
| `ratio` | 90 | default | no | share ratio |
| `added` | 100 | default | no | added date |
| `completedOn` | 110 | default | no | completion date |

The intended first-run visible set is:

`name`, `progress`, `status`, `queue`, `speed`, `peers`, and `size`.

The torrent host supplies:

- typed templates for all cells;
- column comparers; its incoming natural order is queue-ascending;
- All/Downloading/Seeding domain filters, plus the `SearchText` binding and
  selected search fields;
- `EmptyState` and loading/empty/no-results content;
- pause, resume, recheck, remove, queue, path, copy, and sequential-download
  commands;
- the row context menu;
- queue-reorder validation, mutation, optimistic display, and rollback;
- the layout-state storage key and persistence service.

Bulk commands operate on the current selected packet when the context row is
already selected. Single-row actions operate on the context row. These are
torrent-page rules, not table APIs.

### A.2 Reference data and view projection

The following reference configuration keeps daemon state, queue policy,
commands, and storage in the torrent host while `RichTable` supplies table
mechanics.

#### A.2.1 Stable rows and source projection

This reference profile keeps one `TorrentRowViewModel` per torrent identity and
updates its bindable properties from daemon snapshots. That is a torrent-host
choice for smooth progress, edit, and rich-cell animation continuity; it is not
a `RichTable` requirement. The row exposes `INotifyPropertyChanged` so cells
redraw without rebuilding rows.

A host may instead publish rehydrated row instances with the same ID.
`ItemKeySelector` still preserves table selection/current state, but it cannot
preserve template-local animation or edit state across the replacement.

In this stable-row reference profile, the torrent host owns a source collection
of stable row objects. A host that rehydrates instead owns a projection of the
current row instances. Either host derives semantic queue order first, applies a
pending optimistic queue order when one exists, then applies the state filter
before assigning `RichTable.ItemsSource`. Semantic ordering and domain-state
filtering stay outside the control; generic text search is the next private
table-view step:

```text
daemon snapshot -> stable TorrentRowViewModel updates
               -> authoritative or pending semantic queue order
               -> torrent host's state-filtered projection
               -> RichTable.ItemsSource + bound SearchText
               -> generic word-prefix search -> table sort
```

Set `EmptyState` to `Empty` when the unfiltered daemon torrent collection has
no items and `NoResults` when the state filter excludes all source rows. With
the default `Filter` presentation, `RichTable` chooses `NoResultsContent`
automatically when its non-empty state-filtered source has no text match.

The torrent host applies these display rules:

- removed IDs are omitted;
- ghost/pending rows bypass the All/Downloading/Seeding state filter, but search
  matches both name and ghost label;
- checking rows appear in both Downloading and Seeding filters;
- ghosts are display-only: they cannot be selected, invoked, context-clicked,
  included in bulk commands, or included in a queue-reorder packet.

When a changed value affects active table order, search membership, or ghost
eligibility (for example queue position, name, size, ratio, or ghost label),
the torrent host batches updates and calls `RefreshView()` once. Fast-changing
speed/progress updates normally redraw only; they do not force a view refresh.

#### A.2.2 Search binding and fields

Keep one `SearchText` property on the torrent page/view model. It is shared by
the normal search `TextBox`, the table binding, and any host-level enablement
that needs the raw query. `StateFilteredTorrents` contains state-filtered
queue-ordered rows only; it MUST NOT apply text search a second time.

```xml
<TextBox
    AutomationProperties.Name="Search torrents"
    Text="{x:Bind ViewModel.SearchText,
                   Mode=TwoWay,
                   UpdateSourceTrigger=PropertyChanged}" />

<controls:RichTable
    x:Name="TorrentTable"
    ItemsSource="{x:Bind ViewModel.StateFilteredTorrents, Mode=OneWay}"
    SearchText="{x:Bind ViewModel.SearchText, Mode=OneWay}"
    SearchPresentation="Filter" />
```

Before the control reaches `Loaded`, register the two fields that preserve the
torrent search behavior. Keeping them separate avoids a per-row
concatenated search string on every keystroke:

```csharp
TorrentTable.SearchFields.Add(new RichTableSearchField
{
    TextSelector = item => ((TorrentRowViewModel)item).Name
});
TorrentTable.SearchFields.Add(new RichTableSearchField
{
    TextSelector = item => ((TorrentRowViewModel)item).GhostLabel
});
```

`Filter` is the reference torrent profile's default, using disappearing-row
behavior. Another host may explicitly choose `DimNonMatches` for contextual
comparison, but it does not change the torrent's semantic source, daemon
filters, or queue ordering. The control itself blocks queue row-reordering for
a parsed query; the host must not recreate text filtering or a second sorter.

#### A.2.3 Columns

During host setup, create the eleven `RichTableColumn` definitions in the
default order and widths in Appendix A.1. Put the typed XAML templates in the
torrent host or its resource dictionary, then assign each template directly to
the matching column. There is no torrent-specific column class or renderer
registry. Give every definition its localized `DisplayName` for the generated
header menu and UI Automation.

Each sortable column supplies an explicit comparer over `TorrentRowViewModel`.
The natural order is the torrent host's queue-ascending semantic source order,
not an implicit torrent feature of `RichTable`. Start with the seven intended
visible columns listed in Appendix A.1, then call
`ApplyLayoutState` with the stored layout, if present.

Set `CanInteractWithItem` to false for ghost/pending rows.

The torrent host therefore has exactly one mapping layer:

```text
TorrentRowViewModel + DataTemplate + IComparer<object>
                                     -> RichTableColumn
```

Status display calculation, formatted speeds, ETA strings, and progress labels
belong on the torrent row view model (or its display-state owner),
because the templates use them. `RichTable` receives only the finished row
object and template.

#### A.2.4 Events and policy callbacks

Alongside the search setup above, the torrent host wires its remaining generic
policy and event boundary in one place:

```csharp
private void ConfigureTorrentTable()
{
    TorrentTable.ItemKeySelector = item =>
        ((TorrentRowViewModel)item).Id!;
    TorrentTable.CanInteractWithItem = item =>
        !((TorrentRowViewModel)item).IsGhost;

    TorrentTable.SelectionChanged += OnTorrentSelectionChanged;
    TorrentTable.ItemInvoked += OnTorrentItemInvoked;
    TorrentTable.RowContextRequested += OnTorrentRowContextRequested;
    TorrentTable.RowsReorderRequested += OnTorrentRowsReorderRequested;
    TorrentTable.LayoutChanged += OnTorrentLayoutChanged;
}
```

The handlers have exactly these responsibilities:

- `OnTorrentSelectionChanged`: publish selected/current torrent IDs to the
  shell. `SetSelection` is used only when an independent shell action changes
  selection; matching IDs are an idempotent no-op.
- `OnTorrentItemInvoked`: open the permitted docked detail/inspector action.
- `OnTorrentRowContextRequested`: build and show the torrent `MenuFlyout`.
- `OnTorrentRowsReorderRequested`: pass the immutable request to the queue
  coordinator, which owns optimistic update, RPC, reconciliation, and failure.
- `OnTorrentLayoutChanged`: give the supplied snapshot to the torrent settings
  debouncer.

Cell buttons and menu items call torrent commands directly through the row view
model or host command service. Do not add `OnPause`, `OnResume`,
`OnRemove`, or other torrent callbacks to `RichTable`.

#### A.2.5 Selection, activation, and the row menu

Observe `SelectionChanged` and project its selected rows to the shell's selected
torrent IDs and current/active ID for global hotkeys, bulk commands, and
inspector/detail loading. When an independent application surface changes that
selection, resolve its IDs to current torrent rows and call `SetSelection`.
Matching logical state is a no-op, so the table remains the one interactive
selection owner without a suppression guard.

Handle `ItemInvoked` by opening the docked torrent detail/inspector, unless
detail opening is disabled. Ghost rows are never invoked.
Handle `RowContextRequested` to create the torrent `MenuFlyout` at the supplied
placement target and relative point. Ghost rows do not request a menu. Use the
supplied selection unchanged:

- Pause, Resume, Resume now, Recheck, Remove, Remove data, and queue commands
  apply to the selected packet.
- Open folder, Set/Locate path, Copy hash, Copy magnet, and sequential-download
  toggle apply to the context row.

The host decides command enablement from current torrent state. The generic
table has no knowledge of any of these commands.

#### A.2.6 Queue drag reordering

Set `IsRowReorderingEnabled` only for All and either natural order or a
queue-column sort. `RichTable` separately blocks a row drag for a parsed
search query. A descending queue view is valid, but the adapter must translate
its visible before/after placement back into semantic ascending queue order.
The torrent host handles `RowsReorderRequested` as follows:

1. Convert `MovingItems`, `TargetItem`, and `Before`/`After` into the daemon's
   queue operation(s).
2. Immediately publish the optimistically reordered semantic source projection.
3. Send the command through the torrent command/RPC path.
4. Reconcile with the next daemon snapshot; roll back or show an
   error state if the command fails.

If queue moves must be serialized, set `IsRowReorderingEnabled` false while a
request is pending and restore it after reconciliation when the view remains
eligible.

The table provides the packet, target, insertion feedback, and selection
preservation. It never calculates queue priorities, reverses descending order,
or talks to the daemon.

#### A.2.7 Layout persistence

Use a torrent-specific settings key to load and save
`RichTableLayoutState`. During setup:

1. create the default torrent columns;
2. load the saved data-only state;
3. call `ApplyLayoutState`;
4. subscribe to `LayoutChanged` and debounce persistence of its `LayoutState`
   snapshot.

Do not save selections, filters, live status values, progress, or queue drag
state as part of the table layout. Application preferences remain the storage
owner; `RichTable` only validates and produces the DTO.

#### A.2.8 Torrent integration checklist

- All eleven columns use typed templates and explicit comparers where sortable.
- Default visibility is the intended seven-column set on a clean profile.
- State filters feed `ItemsSource`; `SearchText` and the two registered
  `SearchFields` feed the generic table search.
- The semantic source order is queue ascending; a pending queue move updates it
  immediately and reconciles it from the daemon snapshot.
- Ghost/pending and checking-row behavior follows the rules above and cannot
  leak into selection, commands, detail opening, or queue reordering.
- The reference profile updates stable view models; a rehydrating host replaces
  current rows. Either calls `RefreshView()` at most once per completed batch
  when a view-affecting property changed.
- `SelectionChanged` and `SetSelection` synchronize the table with the shell's
  selected/current torrent IDs without a second interactive selection owner.
- Context-menu and keyboard commands use the table's selected packet/current
  item instead of reimplementing selection logic.
- Queue requests pass through `RowsReorderRequested` and torrent command
  code.
- Layout state round-trips through the torrent preferences service.
- Initial loading, no-results, error, offline, and permission states have
  explicit page content; refresh keeps existing rows visible.

## Appendix B — Core verification checklist

The component is ready when the following generic outcomes pass in a WinUI 3
sample or host integration. Torrent-specific verification is in Appendix A.

1. A consumer renders text, progress, button, toggle, and custom-control cells
   from typed templates.
2. Scrolling a list of at least 10,000 rows keeps a bounded realized-container
   count and aligned headers.
3. Header clicks cycle ascending, descending, and natural stable order.
4. A column can be dragged across several columns and remains there after a
   save/reload round trip.
5. A column can be resized, double-click auto-fitted from header/realized cells,
   hidden, shown, and reset without creating off-screen row templates.
6. Header right-click works both on a column and on unused header space.
7. It is impossible to hide all columns or a non-hideable column.
8. Plain, Ctrl, Shift, Ctrl+Shift, keyboard, Home/End, and Ctrl+A selection work
   and survive sorting and same-key source rehydration.
9. Marquee selection, edge auto-scroll, Ctrl modification, and Escape
   cancellation work without stealing input from cell controls.
10. Double-click and Enter raise one item-invoked event.
11. Right-click preserves a selected packet and selects an unselected target
    before requesting its menu.
12. Optional row drag sends the correct ordered packet and before/after target
    without mutating the source.
13. Initial loading, empty, filtered-no-results, and refresh-with-existing-rows
    states follow the defined precedence.
14. Unknown, duplicate, invalid, and obsolete saved layout values recover to a
    usable layout.
15. Light, Dark, High Contrast, 100–200% scaling, keyboard-only use, Narrator,
    and touch do not lose functionality.
16. Rapid bound-value updates redraw cells without continuously resorting or
    rebuilding rows.
17. The component contains no domain types, commands, strings, or service
    references.
18. User layout changes do not mutate `ItemsSource` or baseline column
    definitions, and applying saved state does not emit a persistence event.
19. `ItemKeySelector`, `CanInteractWithItem`, `SortComparer`, and
    `RichTableSearchField.TextSelector` are exercised as pure local policy
    hooks; the five documented events carry the specified post-gesture state
    without executing domain commands.
20. A live-bound search box updates on each keystroke; `para 50` and
    cross-field `joh urin` match, while `ara` and other mid-word substrings do
    not.
21. `Filter` removes non-matches, prunes their selection, and chooses
    `NoResultsContent`; `DimNonMatches` preserves the complete sorted view and
    its ordinary interactions while exposing a theme- and automation-aware
    dimmed state.
22. Search runs only for query/source changes or `RefreshView()`, never while
    scrolling; it does not paginate, rank results, or create a second sort
    owner, and an active query blocks row reordering.
23. Assignment and every `INotifyCollectionChanged` change establish the latest
    source order; `Filter` preserves its relative order, stable sort uses it for
    ties, and clearing sort returns to it.
24. Same-key `Replace`/`Reset` transfers selected/current/anchor/focus to new
    eligible row instances without a selection event when the selected/current
    identities remain unchanged. Removed, filtered, or newly ineligible items
    prune once; null, empty, or duplicate keys fail fast.
25. `INotifyPropertyChanged` redraws cells without a search/sort pass; one
    `RefreshView()` after a view-affecting batch applies the correct search,
    eligibility, and sort result without re-enumerating a plain source.
26. A view-changing update cancels marquee and restores its pre-gesture logical
    selection; it cancels row drag without a reorder event, while header layout
    gestures survive. Structural configuration is sealed at `Loaded`; dynamic
    bindings and cell values remain live.
