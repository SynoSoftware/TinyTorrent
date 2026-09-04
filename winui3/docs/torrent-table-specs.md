# TableView — WinUI 3 Data Table Design Specification

- Status: component design specification
- Scope: version 1
- Audience: engineers building dense, interactive WinUI 3 data lists
- Normative content: sections 1–20 and Appendix B; Appendix A is reference
  material

`TableView` is a reusable WinUI 3 control for large, changing collections whose
cells need arbitrary XAML content. It combines native collection virtualization
and selection with shared column layout, sorting, layout persistence, and
row-reorder requests. It fills the gap between a basic list and a
spreadsheet-style grid without taking ownership of application data or actions.

## 1. Purpose and intended experience

For users, `TableView` is a familiar desktop table: they can scan dense rows,
interact with rich controls inside cells, sort data, change column order and
visibility, resize columns, select ranges, and return to their saved layout.

For application developers, the control is declarative and bounded: supply
items, stable identity when needed, column definitions, and XAML templates;
handle a small set of domain-neutral events; persist the layout snapshot in the
host's chosen store.

The component provides:

- arbitrary rich controls and layouts inside cells;
- virtualized rows;
- sorting from column headers;
- column drag reordering;
- column resizing and explicit fit-to-current-content actions;
- column hide/show from a header context menu;
- persisted column order, visibility, widths, and sort;
- single, extended, range, keyboard, and optional marquee selection;
- row activation and row context menus;
- drag reordering of one or more selected rows when its host accepts reorder
  requests;
- loading, empty, and no-results presentations;
- aligned, horizontally scrolling headers and rows.

The component deliberately keeps these behaviors cohesive rather than exposing
a collection of unrelated helpers. The rest of this document defines their
observable contract and ownership boundaries.

## 2. Scope and intentional non-goals

`TableView` MUST NOT know about:

- domain entities, domain state names, or a particular row view-model type;
- domain commands, domain context-menu content, navigation, or application
  workflows;
- RPC, polling, remote search, optimistic domain updates, or storage;
- page chrome, host-specific embedded modes, or outer page layout;
- a consumer's localization resources or theme-token system.

Those concerns belong to the host. `TableView` owns presentation and interaction
mechanics only.

This is a dense item table, not a spreadsheet. Version 1 does not include:

- in-place spreadsheet-style cell navigation;
- column grouping, frozen columns, summaries, formulas, or pagination;
- multi-column sorting;
- arbitrary grouping or tree rows;
- local text search, text-match semantics, a built-in search box, or a
  domain-filter editor;
- data export;
- a separate visual theme, token system, styling framework, or plug-in
  framework.

These omissions keep the control focused, predictable, and inexpensive to
integrate.

## 3. Design decisions and rationale

1. **Specify observable behavior and ownership.** The contract defines what
   users and hosts observe, not a prescribed internal class structure.
2. **Use WinUI primitives where they fit.** Native collection controls, flyouts,
   theme resources, and UI Automation provide virtualization, input,
   appearance, and accessibility without a parallel control or visual framework.
3. **One owner per state.** The table owns transient view interaction; the host
   owns records, domain commands, saved settings, and domain mutations.
4. **Typed composition, not reflection.** Typed `DataTemplate`s, comparers,
   and callbacks keep row behavior explicit and compile-time discoverable.
5. **Direct row binding.** Each cell receives the row item directly, avoiding
   per-cell wrapper models and their update churn.
6. **No additional runtime dependency.** The control relies on WinUI 3 and
   does not require a data-grid, drag, or command-adapter package.
7. **Pay only for enabled behavior.** Marquee selection and row reordering do
   no work when disabled or idle. Fit measurement happens only for an explicit
   fit command.
8. **One local view projection.** Header sort operates on one private view, so
   selection, layout, and visible order have a single authority.
9. **Be a Windows control, not a visual subsystem.** The control uses the
   application's normal WinUI control styles and platform theme resources; it
   introduces no TableView-specific palette, type scale, geometry, or animation
   vocabulary.
10. **Direct manipulation communicates intent; the host changes data.** The
    table supplies native-feeling drag feedback and an unambiguous insertion
    request. The host alone decides whether that intent is valid for its
    domain and publishes the resulting source order.

## 4. Mental model and ownership

### Terms

| Term | Meaning |
|---|---|
| host / consumer | The page, view, or application component that configures `TableView`. |
| source snapshot | One coherent enumeration of `ItemsSource`, after host filtering and semantic ordering. |
| base sequence | The source snapshot in its enumeration order. |
| private view | The table's non-mutating display projection over the base sequence. |
| natural order | The base sequence order; it is the order before header sorting. |
| baseline layout | Immutable column defaults declared by the host, plus the control's documented defaults. |
| baseline width | A column's declared `DefaultWidth`, or the control's generic width when none is declared, after its bounds are applied. |
| width override | A user resize, explicit fit, or valid applied layout width that takes precedence over the baseline width. |
| effective layout | User-adjusted order, visibility, width overrides, and active sort resolved against the baseline layout. |

### Data flow

```text
host source + columns
    -> TableView private view (stable header sort)
    -> virtualized rich rows
    -> gesture events and layout snapshot back to host
```

### `TableView` owns

- the visible projection and stable sort of `ItemsSource`;
- realized row containers;
- selection mechanics, anchor, current item, logical row focus, and marquee
  gesture;
- reconciliation of its selected/current/anchor/focus items to a new source
  snapshot by stable key or reference identity;
- the effective column layout used by both header and rows;
- header sorting, resizing, reordering, and context-menu interaction;
- drag visuals, insertion feedback, and platform layout continuity for row
  reordering;
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
- external, domain, and text filters, and the search-box/query state;
- storage and retrieval of the layout snapshot;
- batching view-affecting row changes and asking the table to refresh its
  private view;
- remote fetch timing, cancellation, version ordering, optimistic updates, and
  deferral of disruptive updates while a domain edit or animation is active;
- visual continuity outside table-owned selection/current/layout state,
  including template-local edit state and animations;
- all domain-specific policy.

The table emits requests and events. It MUST NOT execute domain actions or
mutate `ItemsSource` or the baseline column definitions. User layout changes
affect its private resolved layout only.

## 5. Public control contract

The public surface is intentionally small. The following is the version-one
contract; an implementation may use equivalent language conventions without
changing these behaviors:

```csharp
public sealed class TableView : Control
{
    public IEnumerable? ItemsSource { get; set; }
    public ObservableCollection<TableColumn> Columns { get; }

    public ListViewSelectionMode SelectionMode { get; set; } // default Extended
    public IReadOnlyList<object> SelectedItems { get; }
    public object? CurrentItem { get; }
    public Func<object, string>? ItemKeySelector { get; set; }
    public void SetSelection(IEnumerable<object> items, object? currentItem = null);
    public static void SetSuppressRowGestures(DependencyObject element, bool value);
    public static bool GetSuppressRowGestures(DependencyObject element);

    public bool IsLoading { get; set; }
    public TableEmptyState EmptyState { get; set; } // Empty | NoResults
    public bool IsMarqueeSelectionEnabled { get; set; } // default false
    public bool IsRowReorderingEnabled { get; set; } = true;
    public Func<object, bool>? CanInteractWithItem { get; set; }

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

    public event EventHandler<TableSelectionStateChangedEventArgs>
        SelectionStateChanged;
    public event EventHandler<TableItemInvokedEventArgs> ItemInvoked;
    public event EventHandler<TableRowContextRequestedEventArgs>
        RowContextRequested;
    public event EventHandler<TableRowsReorderRequestedEventArgs>
        RowsReorderRequested;
    public event EventHandler<TableLayoutChangedEventArgs> LayoutChanged;
}
```

`ItemsSource`, loading/empty state, and the runtime interaction flags
`IsMarqueeSelectionEnabled` and `IsRowReorderingEnabled` are bindable
dependency properties. Marquee selection defaults to disabled and row
reordering to enabled.

`IsRowReorderingEnabled` makes row reordering available by default; it is not a
claim that every current view has a meaningful domain insertion. A gesture is
offered only when the flag is true, the table has a `RowsReorderRequested`
handler, the view shows the row order, and the row is eligible. The view shows
the row order when it is unsorted, which is the source order, or sorted either
way by the column whose `DefinesRowOrder` is true (section 6); under any other
sort the table withholds the drag itself, and a drag from a row is section 14's
marquee. A host binds or sets the flag to false whenever its current external
filter/order, pending domain operation, or ordering model cannot map a visual
placement to a domain insertion. This keeps the default capable without
presenting a dead drag gesture in a host that has no reorder owner.

`ItemsSource` may be any `IEnumerable`. It is the host's already filtered
projection. When that projection is empty, the host binds `EmptyState` to
`Empty` when its wider source has no items and `NoResults` when an external
filter excluded them.

`Columns`, `SelectionMode`, `ItemKeySelector`, `CanInteractWithItem`, and each
column comparer are setup-only schema/policy configuration. The table captures
them exactly once at its first `Loaded` event. A host may populate them in XAML
or code before then; changing a setup-only property, or structurally adding,
removing, or replacing a column afterwards, is a configuration error. This
fixed schema keeps cell templates, persisted layout, identity semantics, and
selection rules stable. Runtime changes belong in bindable state or the
resolved layout, not in the schema.

`Columns` form the immutable baseline. The table keeps separate effective
order, visibility, width overrides, and sort state. A drag, resize, visibility
change, or `ApplyLayoutState` MUST NOT mutate the definitions.
`ResetColumnLayout()` restores the captured baseline. Because that baseline has
no sort criterion, reset also clears local sort and returns to natural order.

After the host has populated its setup-only schema, it may call
`ApplyLayoutState` before or after the first `Loaded` event. A pre-load state
is resolved after schema capture, determines the first effective layout, and
remains silent just like a later application.

`SetSelection` is the only programmatic selection entry point. It atomically
replaces the table-owned selection and sets the table-owned current item after
resolving both to eligible instances in the current private view. An omitted or
`null` `currentItem` uses the first selected item in current visual order, or
`null` when nothing is selected. A supplied `currentItem` may be unselected.
An unavailable supplied `currentItem` is treated as `null` and uses that same
fallback.
The operation is idempotent: if the effective selected identities and current
identity are unchanged, it does not raise `SelectionStateChanged`. Hosts can
therefore project selection/current IDs on `SelectionStateChanged`, then call
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
| `SelectionStateChanged` | host event | publish an optional external selection/current projection | continuously feed its own output back |
| `ItemInvoked` | host event | primary domain action | assume an action was completed |
| `RowContextRequested` | host event | construct/show a domain menu | put domain menu logic in the table |
| `RowsReorderRequested` | host event | request a domain reorder | mutate `ItemsSource` through `TableView`; the host may update its own source after the event |
| `LayoutChanged` | host event | debounce a persisted layout snapshot | write settings on every pointer movement |

Policy callbacks are called on the UI thread and MUST be pure, synchronous, and
cheap. The table never calls them per render frame. Sort comparers are called
`O(n log n)` during an explicit sort and therefore must be especially cheap.

Events are the component's callback API for completed gestures or table-state
changes. They fire only after the table has completed its own mechanics.
`SelectionStateChanged` can also result from `SetSelection` or
source/eligibility reconciliation. Its immutable payload contains the updated
selected packet and `CurrentItem`, including when only current changes.
Every selected-item packet below is in current visual row order. Event payloads
are immutable snapshots:

| Event | Event args contract |
|---|---|
| `SelectionStateChanged` | current visual-order `SelectedItems`, `CurrentItem` |
| `ItemInvoked` | `Item`, ordered `SelectedItems` after normal input selection processing |
| `RowContextRequested` | `Item`, ordered `SelectedItems`, realized row `FrameworkElement PlacementTarget`, nullable `Point RelativePoint` relative to it (`null` for a keyboard invocation) |
| `RowsReorderRequested` | row-order `MovingItems`, nullable `InsertBeforeItem` anchor, never one of `MovingItems` |
| `LayoutChanged` | `LayoutState` and one `Kind`: `Sort`, `ColumnMove`, `ColumnResize`, `AutoFit`, `Visibility`, or `Reset` |

`ApplyLayoutState` is silent. `InsertBeforeItem` describes a position in the
row order *after* `MovingItems` have been removed: insert the complete packet
immediately before that remaining item; `null` means append at the end. The
row order is the current visual sequence, read from the bottom up when the
`DefinesRowOrder` column is sorted descending, and `MovingItems` is in that
order too, so the request names the placement the user pointed at whichever
way the view runs. The first remaining item therefore expresses the start of
the order, and `null` expresses its end without a synthetic target or a
two-direction ambiguity. A request is emitted only for a legal placement that
would change visual order. A drop outside a legal boundary, onto the dragged
packet, or back to the same resulting order is a no-op and does not raise a
reorder event. When the packet is the complete view, there is no distinct
remaining insertion position and no reorder request.

Events are raised synchronously on the UI thread. A host may start or forward
async work from an event handler, but the table does not await it and never
infers success from it. In particular, a reorder event is a request, not a
transaction.

Do not add parallel `ICommand` properties or an async completion protocol for
these events. They would duplicate delivery and make gesture ordering unclear.
A host may use ordinary XAML event handlers or adapt events to its own command
model outside the control.

### 5.2 MVVM consumption

`TableView` follows normal WinUI control semantics: bind values into dependency
properties and receive interaction requests or state changes as events. A page
may forward an immutable event packet to its view-model command or application
service using the MVVM mechanism it already uses. That forwarding is
deliberately outside the control; it requires no behavior library, command
adapter, or framework-specific dependency.

The table is the single interactive selection/current owner. A page or shell
only needs an ID projection when another surface—such as a command bar or
detail pane—uses it. It observes `SelectionStateChanged` and makes an
intentional `SetSelection` request only when another surface changes that
projection. There is intentionally no two-way selected-items binding: that
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

The private view is handed to the native item surface in full. That surface
reads a row only when it realizes the row's position, and for every other
position it keeps nothing but the count. A source update or sort therefore
raises a collection notification for two things and nothing else: every
membership change, at its true position, and every position the surface
currently holds a container for, pinned and not-yet-recycled containers
included. Every other position takes its new row without a notification. The
observable result is the one this section already requires: the count is
always right, a row that leaves or arrives at a held position animates, and a
container never shows a row other than the view's row at its index. A
membership-only update, such as a host filter over an already-ordered source,
raises exactly the notifications it raised before this rule and no others.
What falsifies the rule is a container whose content differs from the view's
row at its index after a sort, a scroll, or `ScrollIntoView`; the reference
host's diagnostics section R checks exactly that.

A source that implements `INotifyCollectionChanged` is live for membership and
source-order changes. A plain `IEnumerable` is immutable from the table's
perspective after assignment: the host assigns it again after changing its
membership or order. Each accepted source update retains the current layout
and sort criterion, then applies stable header sort to the new base sequence.

A source update establishes the latest base sequence. In an unsorted view, the
visible natural order is that sequence. In a sorted view, the same latest
sequence breaks equal comparer values. Clearing sort always returns to this
latest natural order; it never restores an earlier visual order.

`INotifyPropertyChanged` on a row redraws ordinary bound cell content only.
It does not automatically re-sort or re-evaluate eligibility.
After a batch changes any value used by the active sort or
`CanInteractWithItem`, the host calls `RefreshView()` once.
`RefreshView()` re-evaluates the current source snapshot, applies the current
sort, and does not re-enumerate or fetch a non-notifying source.
Display-only updates need no call.

When `ItemKeySelector` is configured, every new source snapshot—including
assignment, `Add`, `Remove`, `Move`, `Replace`, and `Reset`—reconciles selected
items, current item, selection anchor, and focus to the current row instances
by key. `SelectedItems` then exposes those new instances.
A rehydration with the same logical selected/current identities does not raise
`SelectionStateChanged` merely because objects or visual positions changed. An
anchor or focus item that no longer survives clears. Without a selector, object
reference is identity, so a replacement object is a removal and an addition.
Null, empty, or duplicate configured keys are a source-contract error and fail
fast.

If an update removes an item or makes it non-interactive, the table prunes the
effective selection/current item atomically. If that removes the current item
while selected items remain, the first retained selected item in current visual
order becomes current; otherwise current becomes `null`. The table raises at
most one `SelectionStateChanged` event. Source reordering and header sorting do
not raise that event when the logical selected/current packet is unchanged.

A source update, `RefreshView()`, or sort change during a
row drag cancels the drag without raising
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

### 5.4 Invalid conditions and failure boundaries

The control distinguishes four cases so that a consumer does not have to infer
meaning from a missing update:

- **Configuration error.** A malformed captured schema or policy contract—for
  example duplicate column IDs, an invalid width range, duplicate item keys, or
  a setup-only mutation after `Loaded`—is a developer error. The table does not
  construct a partly valid interactive schema or substitute a guessed meaning.
- **Ineligible runtime interaction.** A well-formed interaction can be
  unavailable because the host disables reordering, an item is non-interactive,
  a resize target is non-resizable, or a drop has no legal insertion boundary.
  The table cancels or ignores that interaction, changes no
  layout/source/selection state, and emits no domain request.
- **Consumer callback or handler failure.** A policy callback that throws or
  returns a contract-invalid value is a consumer defect; the originating view
  or interaction does not apply a partial table state. Event delivery is
  post-mechanics: the table neither interprets a handler's outcome nor rolls
  back host work. In particular, a reorder request is never accepted merely
  because the event was raised.
- **Obsolete persisted state.** Unknown or stale layout data is ordinary
  compatibility input and is recovered defensively as defined in section 18;
  it is not treated as a configuration error.

These are observable categories, not requirements for a particular exception,
assertion, logging, or recovery mechanism.

## 6. Column contract

```csharp
public sealed class TableColumn : DependencyObject
{
    public string Id { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;

    public object? Header { get; set; }
    public DataTemplate? HeaderTemplate { get; set; }
    public DataTemplate? CellTemplate { get; set; }

    public double DefaultWidth { get; set; } = 150; // DIPs
    public double MinWidth { get; set; } = 48;      // DIPs
    public double MaxWidth { get; set; } = double.PositiveInfinity;

    public bool IsVisibleByDefault { get; set; } = true;
    public bool CanHide { get; set; } = true;
    public bool CanResize { get; set; } = true;
    public bool CanSort { get; set; }
    public bool DefinesRowOrder { get; set; }

    public HorizontalAlignment CellHorizontalAlignment { get; set; } =
        HorizontalAlignment.Left;
    public IComparer<object>? SortComparer { get; set; }
}
```

`HeaderTemplate` is the composition point for an icon, visual label, tooltip,
or embedded header control. `TableView` deliberately has no separate header
icon, description, or renderer-metadata API; those are ordinary host content.

### 6.1 Column invariants

Required invariants:

- `Id` is stable, unique, non-empty, and is the persistence key.
- `DisplayName` is a non-empty localized plain-text name used by generated menus
  and UI Automation; it need not match the visual header exactly.
- `CellTemplate` receives the row item as its `DataContext`/content.
- `DefaultWidth`, `MinWidth`, and persisted widths are finite
  device-independent pixels (DIPs). `DefaultWidth` is greater than zero;
  `MinWidth` is non-negative; `MaxWidth` is either a finite positive DIP value
  or `double.PositiveInfinity`; and `MinWidth <= MaxWidth`;
- the resolved width is clamped to `[MinWidth, MaxWidth]`;
- at least one column remains visible;
- `CanHide == false` prevents hiding that column;
- a column is sortable only when `CanSort` is true and it has a pure comparer
  that defines a consistent total ordering for the consumer's rows;
- at most one column has `DefinesRowOrder`; its ascending values are the host's
  row order, the order the unsorted view shows and a row drag changes (section
  16);
- hidden columns retain their resolved position and most recent width;
- the declaration order, `DefaultWidth`, `IsVisibleByDefault`, and the
  control's documented width defaults form the reset baseline; runtime layout
  lives only in `TableLayoutState`.

The table validates every column definition when it captures the schema at
`Loaded`. Missing or duplicate values are configuration errors rather than an
unusable header later. Changing a captured column definition or comparer after
that point is unsupported and is a configuration error. Values bound inside a
cell or header template remain live; only the schema definition is fixed.

The declared defaults are: visible, hideable, resizable, non-sortable,
left-aligned, a `DefaultWidth` of 150 DIPs, a `MinWidth` of 48 DIPs, and an
unbounded `MaxWidth`. A host SHOULD explicitly declare width and minimum policy
for rich cells whose footprint is meaningful—such as progress, button clusters,
sparklines, or status pills—rather than treating the generic default as domain
policy.

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
    <Grid ColumnDefinitions="*,Auto">
        <ProgressBar Value="{x:Bind Progress, Mode=OneWay}" />
        <TextBlock Grid.Column="1"
                   Text="{x:Bind ProgressText, Mode=OneWay}" />
    </Grid>
</DataTemplate>
```

The example deliberately does not prescribe a table-local spacing, font, or
color treatment. A consumer uses the application's existing layout resources
and standard-control styling for its own cell composition.

The table MUST NOT convert rich templates into text values or take over their
domain visual styling. It owns the outer row container and its selected,
current, hover, focus, unavailable, and drag states; a cell template supplies
content inside that state rather than duplicating or masking it. This keeps the
table's native interaction feedback coherent while letting a consumer use
normal app controls and templates in a cell.

Input rules:

- interactive descendants receive pointer, keyboard, and focus input normally;
- clicking a `Button`, editor, selector, or toggle MUST NOT also invoke the row;
- an interactive descendant's own `ContextFlyout`, manipulation, text editing,
  and automation behavior take precedence over table gestures;
- table keyboard shortcuts apply only from the passive row/header surface and
  MUST ignore text-editing controls;
- clicking passive cell content follows normal row-selection behavior;
- a consumer can update cell values through normal binding and
  `INotifyPropertyChanged`.

For a custom interactive control the table cannot recognize automatically, set
`TableView.SuppressRowGestures="True"` on its root or an ancestor. It prevents
row selection, invocation, row-context requests, marquee initiation, and row
dragging from that subtree without adding another policy callback. It does not
suppress the descendant's own normal focus, keyboard, context-menu, or
automation behavior.

## 8. Rendering, layout, and visual language

The table MUST preserve vertical virtualization and one effective column layout
shared by headers and rows:

- use one vertical scrolling owner rather than nesting vertical scroll surfaces;
- render each realized row from its row item and the visible column templates;
- derive header and row widths from the same resolved column values;
- keep the header visible during vertical scrolling and horizontally synchronized
  with the body;
- retain columns at narrow widths and use horizontal scrolling rather than
  silently hiding or reflowing data.

The table is one dense data surface, not a stack of cards or a second command
bar. Its header provides column actions; its body provides rows. It has no
window-width breakpoint that silently hides columns or table mechanics. The
host chooses the supported allocation and any page-level minimum size; within
that allocation horizontal scrolling keeps the chosen visible columns and
table-owned header actions available.

Text overflow is intentional. A generated textual header keeps a stable
one-line header treatment, trims its visible label when necessary, and exposes
the full localized DisplayName through its native accessible name and tooltip.
A consumer header or cell template deliberately chooses wrapping, trimming, or
clipping for its content and declares a sufficient MinWidth when it contains a
control or essential value that must remain directly usable. The table does not
make a rich cell reachable merely by shrinking it below its usable width.

The visual baseline is WinUI and the surrounding application's existing visual
language. This applies Fluent's platform-native, focused, and inclusive
principles by giving data and interaction states priority over decorative table
chrome:

- use built-in WinUI collection, flyout, text, icon, focus, and control states
  before adding any custom appearance;
- use platform `ThemeResource`s and normal application resources when an
  application already defines them for those standard controls;
- use the Windows type ramp and default system font behavior for ordinary
  labels and values; distinguish headers through the normal control/type
  hierarchy, not a table-specific font recipe;
- retain platform control geometry and flyout geometry instead of defining
  TableView corner-radius, border, elevation, color, or spacing tokens;
- change a standard control template only when shared-column geometry requires
  it, and preserve the control's native rest, pointer-over, pressed, focused,
  selected, checked, disabled, input, and UI Automation behavior;
- let the native row container express hover, selection, current, and focus.
  Cell templates must not replace these with a competing row backdrop;
- adapt when Light, Dark, or High Contrast changes at runtime. A custom
  consumer cell remains responsible for using equivalent accessible resources.

`TableView` exposes no palette, visual-style object, font setting, token map,
or menu-style API. It must not create component-specific colors, bespoke
flyout surfaces, or visual recipes in XAML.

## 9. Sorting

Header passive-surface primary activation behavior:

1. an unsorted sortable column becomes ascending;
2. ascending becomes descending;
3. descending returns to natural/source order.

Mouse/pen click or touch tap on a passive header that does not become another
gesture uses this cycle. A non-sortable header has no sort action.

Only one column is sorted at a time. The active header shows direction using a
native, theme-aware glyph and exposes the state through UI Automation. Each
passive header participates in the header strip's composite focus model;
primary keyboard activation (Enter or Space) sorts only when that column is
sortable.

Sorting requirements:

- sorting creates a private view; it does not reorder `ItemsSource`;
- sorting is stable;
- equal values retain the exact current base-sequence order;
- null placement is defined by the consumer comparer;
- natural order means the current base-sequence order;
- identity is the string `ItemKeySelector` result when supplied, otherwise
  object reference; invalid keys are source-contract errors and unavailable
  items are pruned from selection;
- source updates and rehydration follow section 5.3;
- normal property notification redraws cells but does not continuously resort;
- the host calls `RefreshView()` after a batch changes any active
  view-affecting value;
- while a sort is applied, the view converges on the sorted order within a
  bounded interval. Membership is never deferred; only relative position is. A
  row that arrives appears at once and a row that leaves goes at once, while
  existing rows trade places on the settling interval. `SortSettleInterval`
  sets that interval, and `TimeSpan.Zero` restores immediate re-sorting.

Avoiding automatic re-sorts on every property notification is important for
rapidly changing data such as speed and progress.

The settling interval exists because a host has only one lever and the table has
two. Publishing a snapshot carries membership and position together, so a host
that throttles its updates to stop a reshuffle also delays the completion that
made the update necessary. The table holds both the previous order and the new
one, so it is the only layer that can take the membership immediately and let
the position wait. It does so by never merging the two. A snapshot that adds or
removes a row is not a settling case at all: the table takes the sorted order
for it whole, which is also where an arriving row belongs, and only a snapshot
of exactly the same rows can hold its position. The rule is therefore structural
rather than a promise — no path through the table can defer a membership change,
rather than no path choosing to.

Measured on a 2,002-row torrent list, per host publish, because with settling off
every publish reorders and the two units are then the same one: sorted by
download speed, each publish drew an average of 2,158 collection notifications,
more than the list has rows. What the host had published was a single torrent
finishing. The cost is the reason the interval exists, but the reason it is a
table concern rather than a host one is that no host can separate the two halves
of its own snapshot.

Count per publish for the defect and per reorder for the benefit; per second for
neither. A count over a window measures how often the host happened to publish in
it. Per publish then measures the defect honestly, for the reason just given, and
measures the benefit dishonestly: settling works by making some publishes free,
so averaging those back in divides out the effect. Measured that way one pair of
runs put the saving at a half and the next at nothing, both arithmetically
correct and neither measuring anything.

What the interval buys, over fifteen seconds. Sorted by speed with a
three-second settle, eleven publishes produced five reorders — exactly one per
interval, so the cap holds at the value it claims. The same sort with settling
off reordered on nine publishes out of nine. Sorted by a stable key, sixteen real
publishes produced no reorder at all. That is the claim, and it holds whatever
the host's publish rate: one reorder per interval, against one per publish.

Note what it is not. Each settled reorder is a bigger one, 2,660 notifications
against 2,158, because a longer interval lets more drift accumulate before the
rows are allowed to move. Cutting the number of reorders therefore does not cut
the work by the same factor, and a host raising the interval to thirty seconds
should expect a calmer table rather than a proportionately cheaper one. The
usability gain is the real one — at most one reshuffle per interval instead of
one per publish — and the notification count understates it.

There is no `SortRequested` callback or remote-sort mode in version one.
Sorting is a local table projection; add an explicit external-sort mode only if
a real consumer requires it.

## 10. Column widths, resizing, and fit commands

`TableView` uses fixed device-independent-pixel (DIP) column widths. Version 1
has no star, fill, percentage, or viewport-responsive width mode. Extra space at
the right remains table surface; when visible columns do not fit, the existing
horizontal scroll surface is used. Resizing the host window never redistributes
or re-measures column widths.

Every column has a deterministic baseline width. A declared `DefaultWidth` is
used exactly after its `MinWidth`/`MaxWidth` bounds are applied. When a consumer
does not declare one, the control's 150-DIP default is used. An unspecified
width is not an implicit content-fit mode: initial source data, later data,
property updates, sorting, filtering, scrolling, and visibility changes MUST
NOT silently widen or narrow a column. This keeps a first-use layout stable and
independent of which virtualized rows happen to appear first. `TableView` never
invokes a fit command during initialization.

An applied valid `TableLayoutState.ColumnWidths` entry, a completed direct
resize, or an explicit fit creates a width override.
It wins over the baseline until another override or `ResetColumnLayout()`
replaces it. A user may resize down to the declared `MinWidth` even when cell
content clips or truncates; observed content never becomes a new hard minimum.
Cell templates own their overflow policy.

Every resizable visible column has a mouse/pen resize separator. Touch and
keyboard use the generated header-menu fit commands, so version one does not add
a competing direct-touch resize recognizer to a dense header.

- mouse/pen dragging captures the pointer and updates the shared resolved width;
- the width is clamped only to the column limits;
- Escape cancels the active drag and restores the starting width;
- double-clicking the mouse/pen separator fits that column;
- the header menu includes **Fit this column** and **Fit visible columns** when
  applicable, and offers no per-step width command;
- the table raises one coalesced `LayoutChanged` notification when a gesture,
  fit, or menu width command changes the resolved layout, not one persistence
  write per pointer movement.

An earlier version of this clause required **Narrow this column** and **Widen
this column**, each changing the width by 8 DIPs. They were removed, and the
reason is recorded because the requirement looked like accessibility and was
not. A menu flyout closes on every invocation and WinUI offers no way to keep
one open for a command, so each 8 DIP step cost a full reopen: widening the
torrent host's 150 DIP name column to something readable was thirteen
right-clicks and thirteen clicks. Nobody walks that path twice, so it was the
appearance of a keyboard route to resizing rather than one. **Fit this column**
already gives the keyboard the outcome the user is actually after, in a single
invocation, and it is two lines above in the same menu. Should continuous
keyboard resizing be wanted, it belongs on the focused header as a held key,
where auto-repeat does the work, and not as a menu item invoked once per step.

`AutoFitColumn` and `AutoFitVisibleColumns` are explicit fit commands, not an
automatic sizing mode. A fit considers only the header and cells available to
the current normal visual layout, includes normal padding and the sort glyph,
and clamps the result to that column's limits. It MUST NOT enumerate source data
solely to size columns, instantiate off-screen row templates, or maintain a
hidden measurement table. A per-column fit changes only that column; it MUST
NOT fall back to a fit of other columns when its result is unchanged.

`AutoFitVisibleColumns` fits each currently visible, resizable column independently
and produces at most one `LayoutChanged` event. Hidden columns retain their
resolved width and are not fitted; a direct fit request for a hidden or
non-resizable column is a no-op, while an unknown column ID is an argument
error. A value that has not entered the current visual layout may require a
later fit after scrolling. This is an intentional limitation of a virtualized
convenience action, not a promise to discover the widest value in the source.

Hiding or showing a column does not discard, recompute, or fit its width.
`ResetColumnLayout()` discards width overrides and restores the captured
baseline widths; it does not fit the current data. A host that wants an initial
content-based layout can deliberately invoke a fit command after its data is
available, with the same bounded behavior and persistence semantics as a user
fit.

## 11. Column drag reordering

Mouse/pen dragging of a header reorders visible columns.

- movement begins only after the normal drag threshold;
- the dragged header remains identifiable;
- a theme-aware insertion marker shows each legal destination, including before
  the first and after the last visible column;
- dropping at a different legal destination updates the effective layout order;
- Escape cancels without changing the order;
- a click that never crosses the drag threshold still sorts;
- a visible move removes the dragged ID and reinserts it at the chosen visible
  boundary in the full logical order. All non-dragged IDs, including hidden
  IDs, retain their relative order;
- **Move left** and **Move right** use the same neighboring-visible-column
  semantics as drag;
- no-op and invalid placements leave the layout unchanged and raise no
  `LayoutChanged` event;
- selection and row scroll position do not change, and focus remains on the
  moved header after a keyboard action or returns to it after mouse/pen drag.

Only a passive header surface starts sorting or column drag. Embedded header
controls retain their normal input behavior.

Touch does not start a direct header-drag gesture in version one. Standard
press-and-hold opens the same header menu described in section 12, which gives
touch and keyboard users equivalent move commands without competing with native
touch scrolling or control input.

Column drag remains local to the control and requires no additional runtime
drag-and-drop dependency. During a valid drag it uses platform drag feedback;
on completion, cancellation, or an applied layout, the header and realized
cells use normal WinUI reposition/layout continuity as defined in section 19.

## 12. Header context menu

Right-clicking or standard touch press-and-hold on a header opens a native
`MenuFlyout`. Right-clicking unused header space opens the same menu without an
active-column action. The Menu key or Shift+F10 on a focused header opens the
same menu and leaves row selection unchanged.

The generated menu is deliberately limited to table mechanics. It provides both
pointer actions and keyboard-accessible alternatives:

- **Hide column “Name”** for the column the menu was opened on, while it is
  hideable and another column can remain, which becomes **Show column “Name”**
  once that column is hidden;
- **Fit column “Name”** for a resizable active column, and **Fit visible
  columns** when at least one visible column is resizable;
- **Move left** and **Move right** for the active column;
- one item per declared column, hidden ones included, carrying a check when the
  column is visible.

The three commands that act on a single column name it, in typographic quotation
marks: the label is a sentence a translation owns, and a test asserts the
literal, so a straight quote written here would fail it on a character nobody can
see in a diff. "This column" was
unambiguous only while the column list lived behind a submenu: with the list in
the same menu, "this" meant the column the menu was opened on while the names
directly below it meant themselves, and nothing on screen said which was which.

The column list is in this menu and not a submenu of it. A submenu is a second
popup with a dismissal of its own that no API can refuse, so the root menu could
be held open across a change while the list collapsed underneath it, and turning
three columns on cost three trips back through the submenu. It is also what the
reference does.

No item closes the menu. Every one of them is repeated by nature — showing and
hiding columns, nudging a column left until it sits where it belongs, fitting one
and then another — or is immediately worth undoing, which amounts to the same
thing. Because the menu stays open, every item MUST re-ask its own label, icon
and enabled state after each invocation rather than merely be correct when the
menu was built: hiding a column can leave another as the last visible one and
disable its entry, moving a column to an edge disables the command that moved it
there, and hiding the column the menu was opened on turns that item into the one
that shows it back. No item may be left saying something that has stopped being
true.

A column entry carries its state as an icon rather than as a toggle item's own
check. A checkable menu item keeps its check in a column of its own that holds
its width even while the check is invisible, so one standing beside items that
carry icons gives the menu two glyph columns and indents every label past both.
The cost is that the state is no longer reported through the toggle pattern, so
it MUST be published another way; `AutomationProperties.ItemStatus` carries it.

The two fit commands differ by glyph and MUST NOT differ by colour alone. A menu
icon inherits the text foreground and is monochrome by design, so a coloured one
reads as status rather than as category; High Contrast overrides icon colour
outright, which would take the distinction from the readers who most need it;
and section 19 does not allow colour to be the only carrier. They differ in
scope rather than in instrument — a measurement of one width against arrows
spreading outward — because they do the same thing to a different number of
columns.

Double-clicking a mouse/pen resizer fits one column. The fit commands provide the
keyboard and touch path for column sizing; move commands provide the equivalent
path for column order. Sort is available from the active passive header: Enter or
Space follows section 9's sort cycle. The column entries use each column's
localized `DisplayName`, and the commands that name a column place that name into
a sentence their translation owns; every other label is localized by
`TableView`'s own resources. They are not host-overridable configuration. This
keeps generated UI self-contained while the host owns its column names and
header content. Focus returns to the invoking header when the menu closes, in
the state the request arrived in: a flyout restores focus itself but not with
that state, so a menu opened by pointer and dismissed by invoking a command left
a keyboard focus ring on the header.

The menu MUST prevent a state with zero visible columns, respect `CanHide`, and
enable only commands that can currently change layout. It has no extension or
domain-command injection surface. A consumer that needs a domain command puts
it in normal page UI or an interactive control supplied by its header template;
that control owns its own menu.

## 13. Selection and keyboard behavior

Default selection mode is `Extended`. Its default pointer behavior is the
native extended-list behavior:

Pointer selection:

- plain click selects one row and sets the anchor;
- Ctrl-click toggles one row;
- Shift-click selects the inclusive range from the anchor;
- Ctrl+Shift-click adds the inclusive range;
- clicking empty space clears selection unless a marquee gesture begins;
- selection is based on row identity, not visual index.

Other `ListViewSelectionMode` values retain their normal WinUI semantics rather
than receiving a second TableView-specific interpretation. Non-interactive
display rows are skipped by pointer and keyboard selection.

`None` permits no selected items, `Single` permits at most one, and `Multiple`
and `Extended` permit many. `SetSelection` applies those limits after resolving
eligible current-view items: it clears selection in `None`, retains the first
resolved item in current visual order in `Single`, and retains all resolved
items in `Multiple` and `Extended`. In `None`, `SelectedItems` remains empty,
but a passive row may still become current for invocation or context requests.

`CurrentItem` is the table's logical current row. It may be selected or
unselected, and is not synonymous with physical keyboard focus. A passive row
selection/navigation action makes its row current. When focus enters a rich
interactive descendant, that descendant owns its normal Tab, keyboard,
text-editing, menu, and automation behavior without clearing `CurrentItem` or
redirecting keys back to the table.

The generated passive header strip is one composite control region in page tab
order. Tab enters or leaves the strip instead of visiting every passive header.
Left/Right moves its active visible header, Home/End moves to the first/last,
and Enter, Space, Menu, and Shift+F10 use the active header's defined
sort/menu behavior. The row item surface is the following normal reachable
region; within it, the platform's arrow-key navigation is retained. Decorative
elements and the marquee overlay are not tab stops. Interactive header
descendants and interactive cell controls retain their own normal tab, focus,
and input behavior rather than joining the passive-header composite.

`TableView` is one content region. It does not reserve a page-level F6
shortcut; a shell that offers F6/Shift+F6 navigation between prominent regions
owns that policy and gives this table region a localized accessible name.

Keyboard selection:

- Up/Down moves the current item;
- Shift+Up/Down extends from the anchor;
- Home/End moves to the first/last row;
- Shift+Home/End extends to the first/last row;
- Page Up/Page Down retain normal list-page navigation;
- Ctrl+A selects all rows when multiple selection is enabled;
- Enter invokes the current row;
- Space retains native selection semantics unless consumed by an interactive
  cell control.

The control MUST scroll the current item into view when keyboard navigation
moves beyond the viewport.

Selection MUST survive sorting, column changes, row recycling, and same-key
source rehydration. Removed or unavailable items are pruned as defined in
section 5.3.

`SetSelection` resolves supplied identities by key when configured, drops
duplicate, unavailable, and non-interactive items, and applies these selection
rules atomically. A host treats `SelectionStateChanged` as an output and calls
`SetSelection` only for an independent external selection/current action; an
equal logical request is a no-op.

## 14. Marquee selection

When `IsMarqueeSelectionEnabled` is true and `SelectionMode` is `Multiple` or
`Extended`, dragging from empty row-surface space with a mouse or pen creates a
selection rectangle, and so does dragging from a row the table would not drag:
one it withholds section 16's drag from because reordering is off, the host has
no handler, the view is sorted by a column that is not the row order, or the
row is not interactive. Dragging from a row the table would drag is section
16's row drag. Which of the two a press becomes depends only on what it landed
on, never on the direction of the first movement. The reference implementation
draws the same line between its rows and the canvas beside them; a row it would
not drag starts the rectangle here as well, because nothing competes for the
gesture there and the pointer has already said so with the arrow, where a
draggable row shows the move cursor. In `None` and `Single` modes, marquee
selection is inactive. Touch remains native scrolling/selection/context-menu
input; it does not begin a marquee gesture.

- the rectangle is drawn in an overlay above rows and below menus;
- a plain marquee replaces selection with its intersected eligible rows;
- Ctrl adds/toggles against the selection captured at gesture start;
- Shift extends from the current anchor;
- intersection with a realized row's band selects that row;
- auto-scroll occurs near the top or bottom edge;
- Escape cancels and restores the starting selection;
- the gesture never begins from an interactive cell descendant, header, resize
  separator, or active row-reorder handle/gesture;
- the table delays an empty-surface clear until pointer release or the drag
  threshold, so starting a marquee does not briefly clear selection first;
- a press on a row the table would not drag selects that row as a click would,
  and the rectangle covers that row from its first movement, so nothing the
  press did is taken back;
- the overlay disappears on completion, Escape cancellation, unload, or a
  view-changing update; section 5.3 defines the latter to restore the
  pre-gesture logical selection before reconciliation.

Empty row-surface space is below the last row and beside the last column. A row
is only as wide as its columns, so the space to their right belongs to no row.
That is a requirement and not an appearance: with full-width rows and enough of
them to fill the viewport there is no empty surface anywhere on screen, every
press lands on a row, and while those rows can be dragged the gesture cannot be
started at all. The reference
implementation is built the same way: its rows sit on a canvas the width of the
columns inside a scroll container the width of the viewport, and a press in the
space between the two starts its rectangle.

The line between a row and that space MUST be visible, or the space reads as a
drag that stopped working. Measured on the torrent host at 2,538 wide with
1,120-wide rows, 1,418 pixels of every row band, 56%, started a rectangle
where the user expected a drag, with nothing on screen to mark the line, and
the line moved with every fit, resize and hidden column. The row's own fill
marks it only while the row is selected, and hover is off by the owner's
ruling, so the pointer marks it: the table shows the move cursor over a row
that can be dragged and the arrow over the space beside it, as the reference
shows its grab cursor. Section 19 requires the selected fill to stop at the
same line for the same reason.

While the table offers the drag, the gesture's availability therefore depends
on the column widths. While the columns are narrower than the viewport, the
space beside them starts a marquee on any row line; once they fill it there is
none, and the only empty row surface left is below the last row, which a full
table does not have. That is a boundary of this rule rather than a defect in
it, and the reference has the same one for the same reason. While the table
withholds the drag, every row starts a rectangle and the widths do not matter.

A row's band is its vertical extent across the whole row surface. The rectangle
is tested against the band, not against the row's own box, so how far it reaches
across a row says nothing about whether that row is in it: a rectangle drawn
entirely in the space beside the columns still selects every row it spans.
Testing the box instead would make the one place the gesture can start the one
place it selects nothing.

Only visible/realized geometry is measured. As auto-scroll realizes additional
rows, they participate normally. The overlay uses platform-aware feedback,
does not become an automation element, and never conveys resulting selection by
color alone.

## 15. Row activation and context requests

A row is invoked by double-click, double-tap, or Enter when the original input
target is not an interactive cell descendant. `ItemInvoked` supplies the row
item and the current selection. It does not execute a command itself.

Context invocation includes right-click, touch press-and-hold, and the Menu key
or Shift+F10 on the current/focused eligible row. The platform's normal
press-and-hold recognition resolves touch context invocation; row drag begins
only from a mouse/pen gesture after its normal drag threshold. The table adds no
competing long-press timer.

Row-context behavior:

- if the row is already selected, preserve the existing multi-selection;
- otherwise select only that row when selection is enabled;
- in both cases make the target `CurrentItem`, logical row focus, and the next
  range-selection anchor. A current-item change raises `SelectionStateChanged`
  even when the selected packet itself is unchanged;
- raise `RowContextRequested` with the target item, an immutable selected
  packet, a row `FrameworkElement` placement target, and a point relative to
  that target when pointer-originated (otherwise a null relative point);
- let the consumer synchronously construct and show a native `MenuFlyout` or
  `CommandBarFlyout` with domain-specific commands at that placement target.

The placement target is presentation context, not durable view-model state. A
consumer forwards command intent to its view model but creates/shows the flyout
at the view boundary while that target is valid. Closing a flyout returns focus
through normal native flyout behavior. The consumer owns its menu's labels,
enablement, keyboard behavior, and accessibility; `TableView` owns only the
selected/current mechanics and transient placement context. `SuppressRowGestures`
and interactive cell descendants suppress the row request and retain their own
context menus. This makes multi-selection context menus predictable for any
domain without giving the generic table a domain menu model.

## 16. Row drag reordering

Row reordering is enabled by default as described in section 5. It supports
multi-row movement without embedding domain ordering policy.

The consumer MUST set `IsRowReorderingEnabled` to false whenever its external
filter/order cannot map a visual placement to domain ordering. The active table
sort is the table's own to judge: it offers the drag only while the view shows
the row order — unsorted, or sorted either way by the column whose
`DefinesRowOrder` is true — and withholds it under any other sort, where a drag
from a row is section 14's marquee instead. If `IsRowReorderingEnabled` becomes
false during a drag, the table cancels the drag; if the sort stops showing the
row order during a drag, the drop raises nothing. For a race or command
failure, the consumer simply does not change (or reconciles) its projection;
there is no post-drop accept/reject protocol.

- a mouse/pen passive row press that ends before the normal drag threshold
  follows normal selection behavior; a press that crosses it becomes a row drag;
- dragging an unselected row creates a one-item packet without disturbing the
  existing selected packet;
- dragging a selected row moves the complete selected packet;
- non-interactive display rows cannot start or join a drag packet;
- packet order follows the current visual order;
- an immediate, theme-aware insertion indicator identifies the legal boundary;
- the event supplies `MovingItems` and `InsertBeforeItem` as defined in section
  5.1, both in row order: the visual order, or its reverse when the
  `DefinesRowOrder` column is sorted descending; it never uses a target inside
  the moving packet;
- top, between-row, and append-after-last placements are valid. Invalid,
  packet-internal, and no-change placements are cancelled without an event;
- `TableView` does not mutate the collection; after the event, the host may
  update its own source;
- the table returns to idle immediately after the event; the consumer may begin
  asynchronous domain work and reconcile its own projection;
- a selected moving packet remains selected. An unselected-row drag preserves
  the prior selection and current item;
- Escape cancels the drag;
- cell controls that handle manipulation do not start row dragging.

During a valid drag, the pointer feedback, insertion cue, and realized-neighbor
movement use normal WinUI drag/list layout behavior. Escape, source/view
invalidation, and invalid drops remove that feedback and leave data/layout
unchanged. When the host later publishes a changed source, its normal
repositioning supplies the resulting visual continuity; when it publishes no
change, rows settle in their original order. The table does not create a
speculative second order, await a remote result, or require consumer animation
coordination.

Direct row reordering is a mouse/pen gesture in version one. On touch,
native panning, selection, and press-and-hold row context input retain
precedence; the table installs no competing touch-reorder recognizer. The drag
affordance and destination status must be exposed accessibly while a drag is
active, but the control MUST NOT claim UI Automation Drag/Drop patterns unless
it genuinely implements and verifies them. Because domain ordering remains host
policy, a host that enables row dragging MUST also offer equivalent domain move
commands in its row context menu or another keyboard-accessible command
surface; those commands are also the touch path and may operate directly on the
domain rather than fake a pointer drop.

The host decides whether reordering is valid under its current filter and how
a place in the row order maps to domain ordering; the table decides it under
the sort. Optimistic updates, remote calls, failure handling, and
reconciliation remain outside `TableView`.

## 17. Loading and empty states

`TableEmptyState` has exactly two values: `Empty` and `NoResults`. The consumer
sets it for an empty `ItemsSource`, because only the host knows whether its
wider domain source has no items or its own filter excluded them.

The row surface shows exactly one of:

1. rows when the current view has items;
2. loading content when the view is empty and `IsLoading` is true;
3. the content selected by `EmptyState`—`EmptyContent` for `Empty`,
   `NoResultsContent` for `NoResults`—when the view is otherwise empty.

Content and templates come from the consumer. The table provides layout only.
During refresh, existing rows remain visible. Application-level error, offline,
and permission states remain outside the table unless the consumer deliberately
supplies them as content.

## 18. Layout persistence

The table exposes, but does not store, a data-only snapshot:

```csharp
public sealed record TableLayoutState(
    IReadOnlyList<string> ColumnOrder,
    IReadOnlyDictionary<string, bool> ColumnVisibility,
    IReadOnlyDictionary<string, double> ColumnWidths,
    string? SortColumnId,
    TableSortDirection SortDirection);
```

`TableLayoutState` deliberately has no version field. Stable column IDs and
defensive restoration are sufficient for version one; if the host later needs
to version its stored envelope, that envelope is the version boundary.
The only valid persisted directions for an active sort are ascending and
descending; `SortDirection` is ignored when `SortColumnId` is `null`.

`ColumnVisibility` and `ColumnWidths` are intentionally sparse: they contain
only values that override declared visibility and width baselines. A missing
column ID means “use that column's baseline.” `GetLayoutState()` follows the
same rule, so untouched defaults do not become duplicate persisted
configuration.

Persist:

- full column order, including hidden columns;
- visibility overrides;
- explicit width overrides in DIPs, including overrides for hidden columns;
- active sort column and direction.

Do not persist:

- selected/current items;
- scroll offsets;
- loading state;
- hover, drag, resize, marquee, or context-menu state;
- row data.

Applying saved state MUST be defensive:

- ignore unknown IDs;
- ignore duplicate IDs after their first valid occurrence;
- append newly introduced columns in definition order;
- treat `ColumnVisibility` and `ColumnWidths` as complete override maps:
  omitted values use their column baseline and clear any earlier override;
- ignore non-finite, non-positive, and non-resizable-column widths; clamp valid
  finite widths to the column's bounds;
- restore required columns if saved as hidden;
- restore the saved sort when its column is currently sortable and its direction
  is valid; otherwise use natural order, including when the sort column is
  missing, non-sortable, or absent;
- guarantee at least one visible column.

`GetLayoutState()` and each `LayoutChanged` payload are independent snapshots
that the table does not mutate after returning or raising the event.
`LayoutChanged` is raised once after each completed effective sort, column move,
resize, fit, visibility, or reset operation, including public fit/reset calls.
It is not raised by initial setup or `ApplyLayoutState`; this prevents
restore-and-persist loops. Initial baseline widths never force persistence.
The host debounces and writes the supplied `LayoutState` snapshot using its
settings store.

## 19. Accessibility, input, theming, and motion

`TableView` is a dense native list/table surface, not a new visual or
accessibility framework. The host supplies its localized control-level
accessible name through `AutomationProperties.Name` or an explicit automation
label relationship; a nearby visible caption alone is not that relationship.
When the host shows a caption, it uses the same localized text. The control
itself MUST:

- preserve native collection-control selection, scrolling, virtualization,
  focus, and UI Automation behavior;
- expose named, localized column headers with sort direction/state and
  discoverable header actions; generated menu commands must be reachable,
  enabled, and checked correctly through keyboard and UI Automation;
- expose selected/current and unavailable row state;
- retain visible native focus indicators and a logical Tab/arrow-key order;
- keep rich-cell controls as independently named, focusable automation peers.
  Decorative layout elements and marquee overlays must not pollute the
  automation tree;
- use a list/list-item automation structure with separately named headers. It
  MUST NOT claim a full UI Automation `Table`/`Grid` pattern unless the
  implementation genuinely supplies and verifies the complete patterns and
  header/cell relationships those patterns require;
- make sort, selection, drag destination, and current state understandable
  without color alone. A drag destination includes a positional cue; a
  focus/selection state retains its normal visual and programmatic state;
- work with mouse, keyboard, pen, and touch according to sections 11–16.
  Direct resize and row/column reorder are mouse/pen gestures in version one;
  standard touch scrolling, selection, and press-and-hold menus remain native
  paths to the corresponding table or domain commands. Where the table or a
  consumer exposes a custom touch target, its effective target is approximately
  40 × 40 effective pixels (the visible glyph may be smaller). A dense
  mouse/keyboard-only host need not enlarge every row mechanically;
  mouse/pen marquee selection is intentionally not a touch gesture;
- use native `MenuFlyout`/`CommandBarFlyout` behavior and restore focus through
  the platform when those transient surfaces close;
- use WinUI `ThemeResource`s and built-in controls so Light, Dark, user accent,
  and High Contrast update at runtime. It must not hard-code colors or define
  TableView-specific brush, type, geometry, spacing, or token resources;
- meet at least 4.5:1 contrast for table-owned normal text and 3:1 for
  table-owned large text and required non-text information, including selected,
  drag-destination, and availability cues, in every applicable state and
  supported theme. A resource name or use of a standard palette is not proof of
  that result. The table draws no current-row cue: WinUI draws none either, and
  its row container has no visual state for a current row that is not selected,
  because Fluent gives position to the focus visual and choice to selection.
  Current remains a model concept that section 13 needs for the anchor and for
  range selection, and nothing measures it because nothing paints it;
- end a row's own fill at its last column rather than at the edge of the list,
  and show the move cursor over a row that can be dragged. The space to the
  right of the last column belongs to no row, and section 14's marquee is
  started from it; the fill and the cursor are what make that line visible,
  and on a row that is not selected the cursor is the whole of it. A fill
  spanning the list would claim that space for a row, and a pointer that
  never changed would leave the line where it was measured: invisible, and
  read as a drag that stopped working;
- preserve normal effective-pixel text scaling and platform type behavior.
  Text and controls must remain readable and operable at supported display/text
  scaling without a table-specific font-size override.

Motion is functional feedback, not decoration. Direct resize and drag feedback
tracks the input immediately. Column moves and the host-published outcome of a
row reorder use the standard WinUI list/reposition/drag transitions when they
are available; cancellation returns to the unchanged layout without a second
animation system. The transitions clarify movement and destination but never
delay input, create a fake successful reorder, or require a host to coordinate
internal animation state. When the system disables UI animations, the same
state changes and insertion cues remain clear without custom substitute motion.

The control's accessibility contract is verified with keyboard-only use,
Narrator, UI Automation inspection, Light/Dark/High Contrast, animation
enabled/disabled, the supported allocation and display/text scaling range, and
long localized content. A consumer template remains responsible for the
accessible name, contrast, state, and input behavior of any custom visual or
interactive content it introduces.

## 20. Performance requirements

The component supports dense, frequently updating lists. Its performance
contract is expressed as invariants rather than an unproven source-count or
throughput target.

- Vertical rows MUST be virtualized and recycled by the native item surface.
- No work may scale with all rows during normal scrolling, column drag, resize,
  or visibility changes.
- A display-only row update MUST NOT rebuild the whole table. A source, sort,
  or `RefreshView()` change may recompute the private view as specified.
- A sort or source update raises collection notifications for membership
  changes and for the positions the item surface holds a container for, and
  for nothing else (section 5.3). The number of notifications a reorder
  raises is bounded by realized containers, never by the row count. Measured on
  the 2,002-row torrent host in Release, with no collection inside the span: a
  full reversal fell from 3,998 notifications to 34, and the collection change
  from 223 ms to 13 ms. The claim is falsifiable and MUST be tested as such —
  it fails the moment a container's content differs from the view's row at that
  container's index, so the test is a sort, a far scroll and a `ScrollIntoView`,
  each followed by comparing every realized container against the view. Rows
  placed without a notification give the panel no reason to re-examine what it
  holds, so the view MUST invalidate measure when its order moved; without that
  the foot of the viewport stays blank until something else forces a pass.
- A reorder MUST need no forced layout. Two reconciles arriving in one dispatcher
  callback — a source publish and the settle timer landing together with a sort
  applied — resolve without one, because the item surface updates its own map of
  container to index inside the notification rather than at the next layout pass.
  This is stated because the defensive fix is expensive and invisible: a reader
  worrying about a stale realized set adds an `UpdateLayout` to the reconcile
  path, which is a full layout on every publish, and nothing else in the tree
  would tell them it was measured and found unnecessary. The diagnostics carry
  that measurement.
- Column layout changes affect only headers and realized rows.
- Source updates, property updates, sorting, scrolling, visibility changes, and
  host-window resizing MUST NOT measure content or change widths.
- Active sorting is `O(n log n)` and occurs only on source, sort, or explicit
  `RefreshView()` changes.
- Explicit fit commands measure only the header and currently realized cells;
  they never create a second measurement surface or force off-screen
  realization.
- Pointer movement does not produce layout-persistence events.
- Reposition and drag feedback use platform-appropriate transitions and require
  no consumer-visible animation or suppression protocol.

The component introduces no runtime dependency beyond WinUI 3. This keeps
package size, memory use, and versioning surface small.

## Appendix A — Reference integration: torrent list

This appendix is informative. It describes one concrete host configuration and
the torrent-specific behavior it must supply. It does not add requirements to
the generic `TableView` contract.

### A.1 Reference profile

The torrent list uses the following columns. They are host configuration, not
built-in `TableView` behavior.

| ID | Declared initial width | Minimum | Target first-run visible | Cell content |
|---|---:|---:|:---:|---|
| `name` | 150 | 90 | yes | name and error indication/tooltip |
| `progress` | 220 | 110 | yes | progress bar, percentage, transferred amount |
| `status` | 110 | 95 | yes | localized status |
| `queue` | 80 | component default | yes | queue position |
| `eta` | 110 | component default | no | estimated time |
| `speed` | 180 | 160 | yes | download and upload speed |
| `peers` | 88 | component default | yes | connected/available peers |
| `size` | 100 | component default | yes | total size |
| `ratio` | 90 | component default | no | share ratio |
| `added` | 100 | component default | no | added date |
| `completedOn` | 110 | component default | no | completion date |

The target first-run visible set is:

`name`, `progress`, `status`, `queue`, `speed`, `peers`, and `size`.

This is deliberate torrent-host policy, not a generic default or a claim about
another table's startup state. Every listed initial width is explicit,
including `name = 150`; none relies on `TableView`'s generic 150-DIP fallback. A
`component default` minimum means the torrent profile supplies no additional
minimum beyond the table's 48-DIP default `MinWidth`. These values are not
generic defaults for another table.

The torrent host supplies:

- typed templates for all cells;
- header templates for the localized label, existing header icon, and any
  header tooltip or description;
- column comparers; its incoming natural order is queue-ascending;
- All/Downloading/Seeding domain filters and its own text filter;
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
commands, and storage in the torrent host while `TableView` supplies table
mechanics.

#### A.2.1 Stable rows and source projection

The torrent host may keep one `TorrentRowViewModel` per torrent identity and
update its bindable properties from daemon snapshots. That is a host choice for
smooth progress, edit, and rich-cell animation continuity; it is not a
`TableView` requirement. The row exposes `INotifyPropertyChanged` so cells
redraw without rebuilding rows.

A host may instead publish rehydrated row instances with the same ID.
`ItemKeySelector` still preserves table selection/current state, but it cannot
preserve template-local animation or edit state across the replacement.

Regardless of that choice, the torrent host owns a source collection or
projection of its current row instances. It derives semantic queue order first,
applies a pending optimistic queue order when one exists, then applies the
state filter and its own text filter before assigning `TableView.ItemsSource`.
Semantic ordering, domain-state filtering, and text filtering stay outside the
control:

```text
daemon snapshot -> current torrent row objects
               -> authoritative or pending semantic queue order
               -> torrent host's state- and text-filtered projection
               -> TableView.ItemsSource -> table sort
```

Set `EmptyState` to `Empty` when the unfiltered daemon torrent collection has
no items and `NoResults` when the state or text filter excludes all source
rows.

The torrent host applies these display rules:

- removed IDs are omitted;
- ghost/pending rows bypass the All/Downloading/Seeding state filter, but the
  host's text filter matches both name and ghost label;
- checking rows appear in both Downloading and Seeding filters;
- ghosts are display-only: they cannot be selected, invoked, context-clicked,
  included in bulk commands, or included in a queue-reorder packet.

When a changed value affects active table order or ghost eligibility (for
example queue position, name, size, or ratio), the torrent host batches updates
and calls `RefreshView()` once. Fast-changing speed/progress updates normally
redraw only; they do not force a view refresh.

#### A.2.2 Columns

```xml
<controls:TableView
    x:Name="TorrentTable"
    ItemsSource="{x:Bind ViewModel.FilteredTorrents, Mode=OneWay}" />
```

During host setup, create the eleven `TableColumn` definitions in the
declared order and with the explicit initial widths in Appendix A.1. Put the
typed XAML templates in the torrent host or its resource dictionary, then assign
each template directly to the matching column. There is no torrent-specific
column class or renderer registry. Give every definition its localized
`DisplayName` for the generated header menu and UI Automation.

Each sortable column supplies an explicit comparer over `TorrentRowViewModel`.
The natural order is the torrent host's queue-ascending semantic source order,
not an implicit torrent feature of `TableView`. Start with the seven intended
visible columns listed in Appendix A.1, then call
`ApplyLayoutState` with the stored layout, if present.

Set `CanInteractWithItem` to false for ghost/pending rows.

A user resize or fit produces a width override that supersedes these torrent
widths until reset; `ResetColumnLayout()` returns to the Appendix A.1 values.

The torrent host therefore has exactly one mapping layer:

```text
TorrentRowViewModel + DataTemplate + IComparer<object>
                                     -> TableColumn
```

Status display calculation, formatted speeds, ETA strings, and progress labels
belong on the torrent row view model (or its display-state owner),
because the templates use them. `TableView` receives only the finished row
object and template.

#### A.2.3 Events and policy callbacks

The torrent host wires its generic policy and event boundary in one place:

```csharp
private void ConfigureTorrentTable()
{
    TorrentTable.ItemKeySelector = item =>
        ((TorrentRowViewModel)item).Id!;
    TorrentTable.CanInteractWithItem = item =>
        !((TorrentRowViewModel)item).IsGhost;
    TorrentTable.IsMarqueeSelectionEnabled = true;

    TorrentTable.SelectionStateChanged += OnTorrentSelectionStateChanged;
    TorrentTable.ItemInvoked += OnTorrentItemInvoked;
    TorrentTable.RowContextRequested += OnTorrentRowContextRequested;
    TorrentTable.RowsReorderRequested += OnTorrentRowsReorderRequested;
    TorrentTable.LayoutChanged += OnTorrentLayoutChanged;
}
```

The handlers have exactly these responsibilities:

- `OnTorrentSelectionStateChanged`: publish selected/current torrent IDs to the
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
`OnRemove`, or other torrent callbacks to `TableView`.

#### A.2.4 Selection, activation, and the row menu

Observe `SelectionStateChanged` and project its selected rows to the shell's
selected torrent IDs and current/active ID for global hotkeys, bulk commands,
and inspector/detail loading. When an independent application surface changes
that state, resolve its IDs to current torrent rows and call `SetSelection`.
Matching logical state is a no-op, so the table remains the one interactive
selection/current owner without a suppression guard.

Handle `ItemInvoked` by opening the docked torrent detail/inspector, unless
detail opening is disabled. Ghost rows are never invoked.
Handle `RowContextRequested` to create the torrent `MenuFlyout` at the supplied
placement target and its relative point when present. Ghost rows do not request
a menu. Use the supplied selection unchanged:

- Pause, Resume, Resume now, Recheck, Remove, Remove data, and queue commands
  apply to the selected packet.
- Open folder, Set/Locate path, Copy hash, Copy magnet, and sequential-download
  toggle apply to the context row.

The host decides command enablement from current torrent state. The generic
table has no knowledge of any of these commands. When queue dragging is
enabled, keep equivalent queue move commands in this menu (or another keyboard-
accessible torrent command surface) for users who do not use pointer drag.

#### A.2.5 Queue drag reordering

Mark the queue column `DefinesRowOrder`, and bind `IsRowReorderingEnabled` to
true only when the state filter is All and no text filter is active; this
deliberately narrows TableView's default-enabled capability to views the
torrent host can map to queue ordering. The sort needs no binding: the table
offers the drag unsorted and under a queue-column sort either way, withholds it
under any other sort, and reports a descending view's request already in
ascending queue order. The torrent host handles `RowsReorderRequested` as
follows:

1. Convert `MovingItems` and `InsertBeforeItem` (defined after removal of the
   moving packet) into the daemon's queue operation(s).
2. Immediately publish the optimistically reordered semantic source projection.
3. Send the command through the torrent command/RPC path.
4. Reconcile with the next daemon snapshot; roll back or show an
   error state if the command fails.

If queue moves must be serialized, set `IsRowReorderingEnabled` false while a
request is pending and restore it after reconciliation when the view remains
eligible.

The table provides the packet, insertion anchor, feedback, and selection
preservation. It never calculates queue priorities or talks to the daemon; the
one order it reverses is its own view's, so that a request under a descending
queue sort arrives in queue order.

#### A.2.6 Layout persistence

Use a torrent-specific settings key to load and save
`TableLayoutState`. During setup:

1. create the default torrent columns;
2. load the saved data-only state;
3. call `ApplyLayoutState`;
4. subscribe to `LayoutChanged` and debounce persistence of its `LayoutState`
   snapshot.

Do not save selections, filters, live status values, progress, or queue drag
state as part of the table layout. Application preferences remain the storage
owner; `TableView` only validates and produces the DTO.

#### A.2.7 Torrent integration checklist

- The Appendix A.1 columns have typed templates, localized headers, explicit
  comparers, the listed first-run visibility, and a persisted layout key.
- The host supplies state- and text-filtered, queue-ascending rows; it applies
  pending queue order before those filters, and calls `RefreshView()` once
  after a view-affecting batch.
- Ghost/pending and checking rows follow A.2.1's display and eligibility rules;
  the host may keep stable row objects or rehydrate by key.
- It enables marquee selection for the torrent page, projects table
  selection/current state to the shell, supplies its domain menus and commands,
  and handles queue requests, persistence, loading, no-results, error, offline,
  and permission presentation as described above.

## Appendix B — Core verification checklist

The component is ready when these generic scenarios pass in a WinUI 3 sample or
host integration. Torrent-specific verification is in Appendix A.

1. Typed templates render text, progress, buttons, toggles, and custom controls
   without stealing their normal input, focus, or automation behavior.
2. A representative large source keeps realized rows driven by the viewport,
   aligns headers and rows, and does not traverse the full source during normal
   scrolling or direct column-layout gestures.
3. A view-affecting batch followed by one `RefreshView()` applies eligibility
   and sort without re-enumerating a plain source.
4. Header mouse/pen click, touch tap, and keyboard activation cycle ascending,
   descending, and natural stable order without interfering with embedded
   controls. Equal values use current source order, and clearing or resetting
   sort returns to natural order.
5. Mouse/pen column drag and touch/keyboard header commands produce the same
   order; the header menu respects hide, visibility, fit, resize, and move
   eligibility and never leaves zero visible columns.
6. Declared and restored widths remain stable across data and layout changes.
   Direct resize, bounded fit, hide/show, reset, and save/reload preserve their
   specified baseline/override behavior without off-screen measurement.
7. `None`, `Single`, `Multiple`, and `Extended` selection limits work with
   pointer and keyboard input. `CurrentItem` can be unselected; `SetSelection`
   produces the specified selection/current state without feedback loops, and
   same-key rehydration retains that state.
8. When enabled, mouse/pen marquee selection, modifiers, edge auto-scroll, and
   Escape work without stealing cell input or touch scrolling.
9. Invocation and row-context requests provide the expected selected/current
   state and a valid transient placement context; host menus retain their own
   commands and accessibility.
10. In an eligible view, mouse/pen row drag sends the current-visual-order
    packet and a valid post-removal `InsertBeforeItem` anchor without mutating
    the source. Invalid/no-change drops emit nothing, and the host exposes an
    equivalent keyboard/touch domain move command.
11. Loading, empty, no-results, and refresh-with-existing-rows follow
    the stated precedence.
12. Saved layout restores valid order, visibility, widths, and sort; obsolete
    values recover defensively to a usable natural/sorted layout. Applying it
    before or after `Loaded` is silent and never mutates source or baseline
    definitions.
13. Collection updates establish the latest source order; display-only property
    changes do not rebuild or sort. View-changing updates reconcile state,
    cancel incompatible marquee or row-drag gestures, and retain live cell
    bindings.
14. Policy callbacks are pure; `SelectionStateChanged` and the other four
    events carry their documented immutable post-mechanics state without
    invoking domain work. The component contains no domain types, commands, or
    service references.
15. Keyboard-only use, Narrator, UI Automation, Light/Dark/High Contrast,
    supported scaling, mouse, pen, touch, and animation-enabled/disabled modes
    preserve the stated interaction, focus, contrast, overflow, and motion
    behavior without a parallel visual or automation system.
16. Invalid schema/callback contracts, ineligible interactions, callback
    failures, and obsolete layout data follow section 5.4 without applying a
    partial table state.
