# Delivery validation

Work in progress, 2026-09-14. The product design remains in `tinytorrent-plan.md`.
This record tracks observed acceptance results, not a new architecture or specification.

The owner's follow-up messages add ordered work items. Finish the current item
before taking the next; change course only for an explicit stop, replacement or
reprioritization. Reuse existing reviewers and keep no more than two active
subagents for this interface iteration.

## Acceptance

- Cold launch reaches the local engine through the tray; repeated opens activate one UI.
- Add by file, magnet, URL and drop; cancel changes nothing; duplicates are explicit.
- Select, search, filter, sort, pause, start, reorder and remove through the interface.
- Removal asks once and distinguishes keeping files from deleting them.
- Properties show General, Files, Peers, Trackers, Speed and Pieces. Peers and Trackers use Synapse.
- File selection, priority, rename, tracker editing and per-torrent limits round-trip.
- Preferences save only intended changes; errors preserve edits; connection switching cancels old work.
- Reconnection restores the list and visible inspector without another selection.
- Window, theme, column layout and inspector choices survive restart.
- Closing the UI ends its process while the engine continues working.
- Hidden inspector data and animation are released; static file metadata is not polled repeatedly.
- Product staging builds a runnable folder; installed runtime and clean-machine limits are stated.

## Test isolation

The existing Transmission service on port 9091 is outside this test.
Coordinator fixtures use independent configuration and generated data under
`%TEMP%\TinyTorrent-delivery-20260913\rig`, with RPC ports 9199 and 9200.
The opt-in protocol test creates its own temporary daemon and OS-assigned ports.
Builds and desktop interaction are serial and coordinator-owned.

## Observations

- The 2026-10-02 fix/polish iteration repaired the six remaining review findings
  and two selection defects found during keyboard review. Touch tap/Space and
  Ctrl/Multiple navigation share the selection model; Single Ctrl-selection
  replaces the old row correctly. The existing selection bar uses the platform
  selected foreground brush rather than the accent. Connection transitions wait
  for one explicit draft outcome; failed saves retain the queued source, Cancel
  declines only the matching head, and Save/Discard resumes the queue independently
  of polling. Otherwise-quiet sessions sweep every 30 successful polls through
  the existing tick/cache owners. Native startup lookup/creation is serialized;
  the existing RPC scanner recognizes the envelope error and its own message.
  Simulated user, keyboard/accessibility, Fluent, performance and maintenance
  source reviews found no further actionable regression after iteration. They are
  engineering perspectives, not actual stakeholder approval.
  Final x64 Debug `Synapse.slnx` build passed. `TinyTorrent.Tests` passed 119 tests;
  both quiet external-edit regressions failed before the policy fix. The native
  console target passed 13 response/scanner cases, eight-thread startup contention
  and abandoned-mutex recovery with warnings treated as errors. Its original RPC
  baseline failed five assertions. Table regressions compile but were not run.
  No production dependency, extra runtime thread, timer, setting, styling token or
  shipping test artifact. The startup mutex is closed after initialization; the
  queue stores one hold condition only for a failed draft decision. Quiet full
  sweeps add summary/facts reads once per 30 successful quiet polls; rendered UI
  latency, memory footprint and final artifact size were not measured.
  All 21 identified findings are recorded in GitHub issues #1–#21, with local,
  uncommitted repair and validation status. Issues remain open pending delivery
  and validation. Existing work is preserved. No app, sample, tray, daemon or GUI
  suite was launched; desktop control remains stopped. Rendered contrast, actual
  touch/keyboard/editor behavior, modal cancellation/save-failure flows, cross-process
  tray forwarding and external live-daemon refresh remain unvalidated and may
  still be incorrect. Actual usability acceptance requires a desktop pass.

- Files sorting and Speed inspection passed independent design and source reviews.
  Files now has a native Sort flyout for Name, Size, Progress, Priority and Wanted,
  with Ascending/Descending. Folders stay first and unknown values last. Sorting
  uses temporary numeric/name snapshots and background comparisons; stale results
  are rejected after target, connection, filter or policy changes. Native collection
  reordering uses RemoveAt/Insert, with temporary selection/expansion restoration.
  New and filtered listings use the selected policy; progress refresh leaves rows
  stationary until explicitly reapplied. Read-only sorting and local navigation
  stay separate from write-command guards. The installed .NET 10 natural comparer
  was exercised with file2/file10, case variants and zero-padded names; results
  support numeric ordering with deterministic ordinal path ties.
  Speed inspection uses one selected sample time, retained across refreshes and
  clamped on eviction. Hover/click, Left/Right, Home/End and Ctrl+C inspect actual
  retained samples; Escape closes the native readout. The tooltip and read-only
  automation Value report age relative to the latest recorded sample, download
  and upload. Empty-to-first-sample focus, inherited cursor brush updates, edge
  clipping and immediate geometry release were corrected during source review.
  F6 now enters the selected inspector view through its existing FocusView owner.
  No new dependency, timer, history store, token system or production file.
  The analyzer-enabled Release UI publish and tray build passed with zero warnings
  and errors; evidence is
  `%TEMP%\TinyTorrent-delivery-20260913\release-sorting-inspection.log`
  (12 analyzer references). Stage: 2026-09-14 16:39:42 UTC, 51 files,
  64,305,275 bytes; all 50 manifest sizes and hashes match. No staging leftovers,
  shipped analyzers or temporary imports. Payload increased by 49,704 bytes from
  the preceding functionality candidate; runtime memory was not measured.
  No GUI or test suite was launched. Native TreeView selection, expansion, focus
  and viewport retention, graph pointer/keyboard/UIA behavior, contrast rendering
  and usability remain unvalidated while desktop control is stopped. Large sibling
  collection application still uses quadratic list search/shifts with native
  notifications; actual large-folder latency has not been measured. Background
  comparison alone does not establish UI responsiveness.

- The approved property functionality pass adds no menu bar or new context menu.
  Files uses its existing compact CommandBar for Open, Folder and Pieces. Local
  path probes run off the UI thread, reject escaped/remote targets, and publish
  only for the captured connection, torrent, destination and selection. Root-drive,
  ordinary nested, parent-escape and UNC-root path normalization examples passed;
  Explorer launching itself remains untested. The structured tracker editor owns
  one ordered tier/URL draft under the existing Save/Cancel lifetime, with native
  list, URL field and tier selection. It preserves duplicate URLs, validates before
  saving and retains failed drafts. Delete applies in the list; Alt+A adds a row.
  Save and discard restore focus to the tracker table.
  Peers Sources discloses connected-peer discovery counts and read-only webseed
  URLs. Speed labels actual rate/time bounds using the existing 32 samples.
  Files → Pieces annotates the validated exclusive file range in the existing
  bitmap overlay, distinguishes aggregate-block facts, and enters the map's focus
  region during loading. No new dependency, polling loop or history store.
  Independent design and source reviews corrected root-path containment,
  selected-peer visibility, tracker focus return, small-chart label bounds and
  Pieces loading focus before final staging.
  The analyzer-enabled Release UI publish and tray build passed with zero warnings
  and errors; the final log is
  `%TEMP%\TinyTorrent-delivery-20260913\release-functionality-verified.log`
  (12 analyzer references). Stage: 2026-09-14 11:59:54 UTC, 51 files,
  64,255,571 bytes; all 50 manifest hashes and sizes match. No staging leftovers,
  shipped analyzers or temporary imports. Payload grew by 67,856 bytes from the
  preceding properties candidate; runtime memory was not measured.
  No application or GUI test suite was launched. Live keyboard journeys, tracker
  save round-trips, Explorer behavior, text scaling, theme rendering and visual
  acceptance remain unvalidated while desktop control is stopped. The comparison
  workbook retains its pre-implementation baseline; this entry records the changes.

- The properties comparison produced a bounded implementation pass, independently
  design-reviewed before editing and source-reviewed afterward. General now places
  Transfer/Information before Limits, distinguishes total size for a selected subset,
  and includes known Last activity. Peer facts retain endpoint and directional
  diagnostics without repeating row fields. Tracker outcome labels and their sort
  agree; waiting schedules are relative with exact selected-detail timestamps,
  inactive trackers are Not scheduled, and active/queued operations show no future
  estimate. Negative returned-peer counts display Unknown. Clean General focuses
  its selected tab; Trackers focuses the table unless editing. Dirty General drafts
  retain their editor path. All 97 named XAML elements remain, with existing native
  styles, access keys and command handlers. No backend, dependency or timer changes.
  The analyzer-enabled Release UI publish and tray build passed with zero warnings
  and errors; 12 analyzer references are present in
  `%TEMP%\TinyTorrent-delivery-20260913\release-properties.log`.
  Stage: 2026-09-14 10:11:53 UTC, 51 files, 64,187,715 bytes; all 50 manifest hashes
  and sizes match. No staging leftovers or shipped analyzers. Artifact size is
  unchanged from the preceding candidate; runtime memory was not measured.
  No GUI or native test suite was run. Live focus, schedule refresh, text wrapping
  and visual quality remain unvalidated while desktop control is stopped.
  The comparison XLSX/CSV/JSON and inventories describe the pre-refinement baseline;
  this entry records subsequent implementation, without retroactively changing grades.

- The focused Impeccable consistency pass reviewed the existing shell, inspector,
  Add, shared dialogs and Preferences. Independent review accepted three local
  Add refinements before implementation: collapse empty link/space feedback,
  collapse absent file parent captions, and expose existing Select all/Search
  shortcuts in tooltips with matching accessibility help. One static compiled
  binding function projects existing text to visibility, without separate state
  or resources. Feedback uses OneWay; immutable file captions use explicit
  OneTime. Source review passed. The first build caught two unqualified static
  calls and an implicit binding-mode warning; these were corrected together.
  Generated code confirms type-qualified calls and registration/unregistration
  of both feedback Text callbacks. The corrected analyzer-enabled Release UI
  publish and tray build passed with zero warnings/errors (12 analyzer references).
  Evidence: `%TEMP%\TinyTorrent-delivery-20260913\release-consistency.log`.
  Stage: 2026-09-14 07:26:18 UTC, 51 files, 64,187,715 bytes; all 50 manifest hashes
  and sizes match. No staging leftovers, shipped analyzers or temporary imports.
  No application, desktop control or test suite was run. Live spacing, text-scale
  behavior and screen-reader announcements remain unvalidated; source/build
  evidence does not establish visual or usability acceptance. The prior icon-width
  question remains pending and its critique finding stays open.

- The Impeccable correction pass read the exact critique snapshot
  `2026-09-14T06-31-42Z__src-tinytorrent-ui-torrent-torrentpage-xaml.md`.
  Independent design review preceded implementation. Filter now exposes its
  active value locally, with full identity in tooltip/accessibility and bounded
  presentation; the shared icon label uses a native Grid and text ellipsis.
  A contextual Reset clears search/filter through the same implementation used
  when revealing a newly added torrent. F6/search focus goes directly to Reset
  only for actual empty matching results; clearing restrictions retains drafts.
  Files remains a single-line native tree with visible headers, shared widths
  and uniform narrow-mode hiding. One probe measures current realized values,
  including hidden fields, with their typography. Fresh measurement permits
  shrinking. No row registry or all-file scan was added. Source review caught
  deep indentation reducing available row width; fit now also respects the
  narrowest realized row. Selected-file facts retain hidden metrics.
  Source reviews passed the filter/reset changes and the corrected Files design.
  Release UI publish and tray build passed with zero warnings/errors, with the
  installed WinUI analyzer enabled (12 compiler-log references).
  Evidence: `%TEMP%\TinyTorrent-delivery-20260913\release-impeccable-fixes.log`.
  Latest stage: 2026-09-14 06:52:05 UTC, 51 files, 64,175,259 bytes, all 50 manifest
  hashes and sizes matching. No generated staging leftovers, shipped analyzer or
  temporary analyzer import remained. Torrent columns and page resources compare
  identically to the before snapshot. Pieces and domain/engine contracts are unchanged.
  The shared button-padding finding remains OPEN: native padding provides 22 DIP,
  while the existing icon/gap use 24 DIP before text scaling. Larger scaled icons
  can exceed the entire allowance. The owner was asked to choose necessary growth
  versus a smaller-than-text icon at enlarged text sizes; the answer remains pending.
  No padding exception was implemented, and the critique backlog was not closed.
  No applications or tests ran. Desktop control remains stopped; current pixel
  geometry, native keyboard behavior, themes, probe text scaling and performance
  are unvalidated. These source corrections may still require live-test fixes.

- The table-centered torrent-client pass inspected the native shell, shared
  resources, inspector, Add and Preferences, plus the legacy table, Pieces and
  useful Add/settings behavior. The KEEP/REFINE/REDESIGN/REMOVE/MISSING assessment
  and proposed interactions are recorded in `design-review.md`. Both independent
  reviewers accepted the revised design before implementation, then challenged
  the source. The resulting shell removes the left navigation and places a native
  Filter menu beside search, using the existing filter owner and predicates.
  Labels exist as controls only while the menu is open. Filter changes preserve
  draft cancellation and normalize disappeared labels before and after awaiting
  a decision. Ctrl+Shift+F opens Filter; F6 cycles commands, table and visible
  Details. Reflow measures the independent available slot rather than its own
  stacked arrangement. Active filter status has a tooltip bound to the actual text.
  Peer limits now live in Connection and sequential defaults in General, with
  nonconflicting access keys. General reveals nonzero unchecked/corrupt bytes;
  selected peer facts include directional interest/choke/transfer state and
  nonzero active webseeds; trackers retain the last announce outcome separately
  from current activity. Native bounded facts scrolling preserves table space.
  Existing Ctrl+C still copies the peer address or tracker URL; full facts use
  native text selection and context Copy. Both reviewers passed the final source
  corrections. Torrent columns and page resources compare identically to the
  pre-change XML; Pieces, Add, domain/RPC contracts and dependencies are unchanged
  in this pass. No resource keys, services, view models or polling were added.
  The first build exposed a switch-expression precedence warning; the corrected
  final Release UI publish and native tray build passed with zero warnings/errors.
  The installed WinUI analyzer was enabled (12 compiler-log references).
  Evidence: `%TEMP%\TinyTorrent-delivery-20260913\release-torrent-shell.log`.
  Latest stage: 2026-09-14 06:19:24 UTC, 51 files, 64,166,411 bytes, all 50 manifest
  hashes and sizes matching, no `.work`/`.previous` leftovers, no shipped analyzer
  and no remaining temporary import. No application, desktop automation or tests
  ran. Desktop resumption remains unanswered. Visual conformance, normal/narrow/
  enlarged-text geometry, native menu/focus behavior, all themes, text selection,
  Narrator and the earlier icon-without-button-growth requirement remain
  unvalidated. Source/build acceptance does not establish usability or runtime
  memory use; these changes may still require correction after live observation.

- The visual-refinement source pass audited MainWindow, the shell, all six inspector
  tabs, Add, Preferences, Connections and shared dialogs. Both independent reviewers
  accepted the bounded design before implementation, including the later native
  accent treatment for inspector Apply/Save, then cross-reviewed the resulting
  source against saved pre-change snapshots. Preferences has one padding authority
  (16 DIP), a 12-DIP heading gap and secondary engine context. Dialog identities and
  inspector sections use native BodyStrong; peer/tracker numeric columns align
  right; empty stopping facts collapse; history context and Pieces legend use the
  native secondary brush. The focus dictionary explicitly names Dark.
  No new resources, theme aliases, dependencies, bindings, controls or state owners
  were added. The changed XAML retains exactly the prior bindings and element counts.
  Release UI publish and native tray build both passed with zero warnings/errors,
  with the installed WinUI analyzer actually enabled (12 compiler-log references).
  Evidence: `%TEMP%\TinyTorrent-delivery-20260913\release-visual-refinement.log`.
  Latest stage: 2026-09-14 05:42:52 UTC, 51 files, 64,145,635 bytes, 50 matching
  manifest hashes, no `.work`/`.previous` leftovers, no shipped analyzer and no
  remaining temporary analyzer import. No app, GUI automation or tests ran.
  Desktop resumption was requested and remains unanswered. Visual conformance,
  normal/narrow/enlarged-text layouts, all theme/focus states, Narrator, keyboard
  usability and the earlier button-width requirement remain unvalidated; these
  source refinements may still need correction after live observation.

- The follow-up request to apply fixes retained the six reviewed defect corrections
  and resolved both remaining WUI1001 advisories. Pieces now uses one window-scoped
  ThemeSettings observer, created only for active detail in an attached, loaded
  control. Loaded retries the same draw path; Release revokes it and existing queued
  sender/revision guards reject obsolete callbacks. The lifecycle design and source
  passed independent review before the final build. The installed analyzer was
  enabled through a temporary import, with no dependency or shipped analyzer.
  Release UI publish and tray build both passed with zero warnings/errors. Evidence:
  `%TEMP%\TinyTorrent-delivery-20260913\release-review-fixes.log`.
  Latest stage: 2026-09-14 05:23:19 UTC, 51 files, 64,145,347 bytes, 50 matching
  manifest hashes, no generated `.work`/`.previous` leftovers. The temporary analyzer
  import was removed. No app, UI automation, tests or credential fault injection
  ran; actual theme transitions and the prior interaction acceptance remain unvalidated.

- `winui-code-review` ran in the requested order: independent design challenge,
  implementation audit, design review of six corrections, then implementation and
  independent source cross-review. All six corrections passed that source review;
  findings and remaining limits are recorded below. The installed Microsoft analyzer
  was actually loaded through a temporary MSBuild import, with no project/package
  changes and no app launch. The initial analyzer build reported three warnings;
  making the fixed splitter binding explicitly OneTime removed WUI2011. The final
  Release build and staging passed with zero errors and two WUI1001 migration
  advisories for the Pieces High Contrast event subscription. Native tray build
  had zero warnings/errors. Logs: `%TEMP%\TinyTorrent-delivery-20260913\winui-analyzer-review.log`
  and `release-code-review.log`.
  That stage: 2026-09-14 01:42:13 UTC, 51 files, 64,145,347 bytes, 50 verified
  manifest entries, no mismatches or leftover `.work`/`.previous` directories.
  The analyzer is absent from the staged product; the temporary import was removed.
  No GUI tests or credential/storage fault injection ran. The earlier 106 passing
  headless Core/parser tests were not rerun for these UI-only changes and do not
  validate their interaction or storage-failure behavior.

- The requested UI/UX Pro Max refinement used the installed skill's actual UX and
  WinUI database searches, its quick reference, and a native labeled TextBox sample
  from WinApp. The accepted consistency/hierarchy/density/task-flow rules and five
  changes are at the end of `design-review.md`. Independent user/keyboard and
  Fluent/UIUX/necessary-data reviews passed before implementation; independent
  source review then passed. Add now exposes direct link entry, retains a prior
  draft until replacement metadata succeeds, and gives the local path a full-width
  row. Connections feedback follows the loaded draft; inspector facts distinguish
  unknown peer clients and avoid duplicate/empty scrape results. No dependency,
  persistent state owner, timer or cache was added.
  Release UI publish and tray build passed with zero warnings/errors through
  `scripts/build.ps1` (`%TEMP%\TinyTorrent-delivery-20260913\release-refinement.log`).
  That stage was built at 2026-09-14 01:27:01 UTC: 51 files, 64,141,251 bytes,
  50 verified manifest entries, no hash mismatch and no leftover `.work`/`.previous`.
  These UI-only refinements did not rerun the 106 previously passing headless tests;
  those tests do not validate focus or layout. No app or UI automation was launched.

- The owner's complete screen review is recorded at the end of `design-review.md`:
  shell, Add, all five Preferences categories, Connections, all six inspector tabs,
  Location, Labels, Rename and confirmations. Two independent theoretical reviewers
  passed seven bounded corrections after requiring AltGr-safe exact modifiers and
  short fixed confirmation titles. Implementation began after that design gate.
  Independent source cross-review found one omitted unsaved-dialog body scroller;
  its targeted correction passed rereview. One compiler local-name collision was
  corrected. Final Release UI publish/tray build passed with zero warnings/errors
  (`%TEMP%\TinyTorrent-delivery-20260913\release-screen-review.log`). All 106
  headless Core/parser tests passed with no skips, including uncertain rename
  reconciliation, metadata reload and exactly one rename write (`core-screen-build.log`,
  `core-screen-tests.log`, `results/core-screen.trx`). Shared modifier and popup
  projection replaces repeated handlers; no dependency or extra persistence owner
  was added. That stage was built at 2026-09-14 01:10:45 UTC: 51 files,
  64,141,283 bytes, 50 verified manifest entries, no hash mismatch and no leftover
  `.work`/`.previous` directory. No desktop app or UI automation was launched.

- The requested design-tool check ran both executables successfully. The bundled
  `winui-my-design/scripts/winui-search.exe` returned Gallery control searches and
  full samples. WinApp CLI 0.6.1 returned `find-ui` search/scenario results after
  allowing its normal network/cache access. Its installed NuGet tools directory
  was added to user PATH; after refreshing PATH, `winapp` resolves through the
  existing WindowsApps alias and returns version 0.6.1. .NET SDK 10.0.401 and
  Developer Mode were already present. No software, SDK, project dependency,
  service or GUI process was installed or started for this check. Existing
  terminals may need reopening to inherit the updated environment.

- Four remaining procedural validation messages were corrected after independent
  literal design review; exact source wording then passed rereview. The final
  Release candidate was staged at `artifacts/TinyTorrent/Release/x64`, built at
  2026-09-14 00:47:23 UTC, with zero warnings/errors in UI publish and native tray
  build (`%TEMP%\TinyTorrent-delivery-20260913\release-final.log`). Its 51 files
  total 64,128,995 bytes; all 50 manifest hashes match, with no leftover `.work`
  or `.previous` staging directories. These last changes affect error text only;
  the 105 passing headless tests below cover the final recovery behavior.

- The Connections recovery amendment passed independent source review: cancelling
  deletion retains the same controls and drafts, and dialog shortcuts share native
  popup priority. Inspector recovery and Pieces theme invalidation also passed an
  independent source review. Failed detail reads expose Retry without a second
  polling owner; disconnect releases detail/file metadata; map theme observers
  follow the active detail lifetime. Release staging passed, followed by all 105
  headless Core/parser tests (zero failures/skips), including initial-null failure,
  next-tick retry and reconnect release/order regressions. Evidence:
  `%TEMP%\TinyTorrent-delivery-20260913\release-recovery.log`,
  `core-recovery-build.log`, `core-recovery-tests.log`, and
  `results/core-recovery.trx`. Actual dialog recovery, F5, theme and contrast behavior
  remain unverified in the interface.

- The subsequent Microsoft `winui-design` review replaced paired section pickers with
  native top NavigationView controls and Files' fixed command row with CommandBar
  overflow. Preferences uses neutral card brushes; Add has one form and stable
  Add/Cancel commands. Direct stock dialog body ScrollViewers make short-height
  scrolling explicit. Generic table behavior and Pieces appearance remain intact.
- Independent source rereviews passed after correcting focus into closed navigation
  overflow, shortcuts retained after an Add duplicate result, native navigation chrome
  measurement and the tracker editor's header allowance. Navigation focus has one
  implementation. The first build caught an unsupported Expander event; the correction
  uses its existing Expanding event. Final Release UI publish and native tray build
  passed with zero warnings/errors through `scripts/build.ps1`; log:
  `%TEMP%\TinyTorrent-delivery-20260913\release-fluent.log`.
  No desktop window or UI test was launched. Live layout, keyboard, theme and usability
  acceptance are still unverified; the older test counts below are not new UI evidence.

- Full Debug solution build passed after integration corrections, with no reported warnings.
- Release headless Core and parser suite: 104 passed after the design implementation's
  speed, reconnect, uncertain-write and magnet-validation changes. Release protocol
  suite: 78 passed, with the opt-in live test skipped in this run.
- The opt-in live test passed against an isolated Transmission 4.1.1 daemon. All 24 request
  methods were exercised. Port testing returned an external-service error; this does not
  establish incoming connectivity. Trackerless reannounce acceptance does not establish
  a successful tracker exchange.
- Independent standards and specification reviews passed the third source review after
  correcting stale editor values, edits during Apply, reconnect inspection, static-file
  polling, generic failures locking drafts, and a rename dialog bypassing the modal owner.
  Later visual revisions require another source review.
- The first actual UI launch exposed a connection-storage failure. Connection storage used
  `LocalFolder` before the folder existed. Both stores now use the single `App.LocalPath`
  authority and create their directory before writing. Relaunch showed no storage error.
- The Add dialog opened from a generated multi-file torrent activation. Excluding one file
  and adding paused succeeded; the list showed the torrent and the isolated daemon confirmed
  its stopped state. Cancel before adding left the list empty.
- The owner rejected the first Preferences, Add and properties layouts. A replacement
  theoretical design in `design-review.md` passed independent user, UI/UX, Fluent and
  keyboard reviews at R3.1. Bounded Location/Labels and Preferences picker extensions
  were reviewed before implementation. Button width interpretation is still pending.
- The implementation adds native pickers, measured dialog bounds, compact Details,
  scoped keyboard paths, shared edit guards, bounded file-selection facts, and keyboard
  inspection of Pieces. Source reviews found and corrected disconnect handling,
  procedural surface help, malformed magnet acceptance, retained obsolete Add files,
  unbounded selection summaries, incorrect clipboard targets and missing-date wording.
  A speculative numeric-rounding finding was withdrawn after checking Microsoft's API.
- The first integration build found five compile errors and an unawaited-task warning;
  those and two subsequent XAML name-collision warnings were corrected. Debug output
  replacement was blocked by the older UI process (8140), which was left open after
  desktop control stopped. The complete Release solution compiled successfully;
  final Release UI and tray build/publish passed with zero warnings and errors.
  No source review or build is a visual or usability pass.
- Final independent source rereviews passed the corrected shared-dialog loading,
  uncertain-write ownership, local-folder focus recovery, bounded file selection,
  contextual clipboard content, Pieces keyboard information and literal button/help
  rules. App-authored command buttons and menus use the one Lucide authority.
  Shared label icons are 16 DIPs beside the native 14-DIP text; width/padding acceptance
  is explicitly unresolved, and actual dimensions, focus behavior and pixels are unverified.
- Release staging succeeded repeatedly. The component-based SDK references retain
  the existing WinUI, Foundation, InteractiveExperiences and Runtime versions while
  removing unused AI/ML dependencies. The staged folder fell from 108,821,606 to
  64,141,283 bytes (41%). All 50 manifest entries match their hashes; the folder has
  51 files including its manifest, and no leftover `.work` or `.previous` stage.
  ONNX Runtime, DirectML, Tensors and Windows AI/ML binaries are absent. This measures
  package size, not runtime memory; the current candidate has not been launched.
- The temporary seeder and tracker processes were stopped and verified exited. The
  older UI process and its isolated client daemon remain available on port 9199.
  The unrelated service on port 9091 was not changed.
- The owner stopped Computer Use with Escape. Automated desktop interaction stopped.
  Further visual, keyboard, transfer, persistence, and lifecycle acceptance is pending.

## Review method

UI/UX Pro Max and native WinUI guidance inform hierarchy, keyboard access, loading,
validation and theme checks. The existing torrent-table specification and legacy piece-map
appearance remain the visual references. Marketing-layout recommendations do not apply.
Standards and specification reviews are independent Sol agents; the coordinator drives the UI.
Design acceptance precedes usability acceptance. A separate design review checks the workflows
against the existing Fluent design authority and applicable Microsoft Windows guidance before
another desktop test. Passing source review does not imply either design or usability acceptance.

## WinUI code review

The latest `winui-code-review` findings were all Warning/P2 and have reviewed
source corrections. Locations refer to the corrected source:

| Finding | Location | Correction |
|---|---|---|
| Inactive numeric drafts blocked Preferences Save and targeted a disabled editor | `src/TinyTorrent.Ui/Preferences/PreferencesDialog.cs:190` | Collect only locally enabled dependent Text/Number/Time drafts; retain ordinary validation and use the existing schedule checkbox for weekdays. |
| Initial Preferences read errors could overflow the dialog body | `src/TinyTorrent.Ui/Preferences/PreferencesDialog.cs:52` | Direct stock body ScrollViewer; existing Retry, Close and cancellation owner. |
| JSON-save failure left credential changes or repeated orphan IDs | `src/TinyTorrent.Ui/Preferences/Connections.cs:130` | Stable provisional ID and prior-secret compensation; failed compensation reports partial state. No cross-store crash-atomic guarantee. |
| Selected peer/tracker facts became stale with unchanged logical selection | `src/TinyTorrent.Ui/Torrent/InspectorView.xaml.cs:139` | Shared footer projection after synchronous source reconciliation and selection changes. |
| Stalled seeders lost uploaded total, ratio and stopping rule | `src/TinyTorrent.Ui/Torrent/InspectorView.xaml.cs:181` | Append stalled diagnostics to the existing seeding facts. |
| Files automation identity contained changing values | `src/TinyTorrent.Ui/Torrent/InspectorView.xaml:4` | Relative path names the native TreeViewItem; visible values keep their live bindings. |

Binding review distinguished immutable row snapshots from notifying mutable file
facts; it did not mechanically add OneWay to every binding. The fixed splitter
spacing explicitly uses OneTime. Ownership review preserved Session, table selection,
Form and the existing store/credential boundary. No MVVM framework, additional
dependency registry, polling loop, cache or new public API was introduced.
The skill's blanket collection Clear/re-add advice conflicts with this project's
measured collection contract and was not applied. Native ContentTemplate binding
and runtime-created forms do not justify replacing the established owners.

The two WUI1001 warnings were subsequently resolved by migrating the single Pieces
observer to ThemeSettings, with attachment guards and the existing Release and
UI-queue lifetime. The final analyzer-enabled build reports no warnings. Actual
Light, Dark, High Contrast, requested-theme brush resolution and accent contrast still need
desktop observation, as do Narrator/peer-tracker row fallback and text scaling.
History/raster lifetimes were inspected in source; RAM and input latency were not
measured. No universal accessibility, theme or performance pass is claimed.

## Skill routing

The applicable Windows skills run in this order, with earlier gates revisited when
later evidence rejects a decision:

1. `winui-design`: native control choice, composition, navigation, states and responsive
   behavior before implementation. `winui-my-design` and UI/UX Pro Max refine the
   same proposal; independent user, designer, Fluent and keyboard reviews challenge it.
2. `winui-dev-workflow`: build and diagnose the approved implementation using this
   project's existing Visual Studio MSBuild entry point. No new run wrapper is needed.
3. `winui-code-review`: review bindings, accessibility, theme behavior, security and
   performance after a clean build. Project ownership and collection rules prevail:
   no obligatory MVVM framework, displayed-collection Clear, or dependency churn.
4. `winui-ui-testing` and Computer Use: test UI Automation contracts and real user
   journeys, including keyboard, resize, text scaling and contrast themes. Desktop
   verification remains stopped; another automation tool does not bypass that stop.
5. `winui-packaging`: apply release, runtime, signing and clean-machine checks to the
   established unpackaged/Inno distribution plan, without silently switching to MSIX.

`winui-app` provides reference guidance across stages. `winui-setup` is only for
explicitly requested prerequisite repair; `winui-session-report` is only for a
requested session diagnostic. `winui-wpf-migration` does not apply to this rewrite.
Skill invocation establishes the task's guidance once; controls, layout, navigation
and subsequent corrections are checks within it, not separate user commands.
The existing Fluent authority and LabForms composition take precedence over web aesthetics.
Karpathy guidelines guide minimal ownership; code-review supplies
independent standards/specification review. Diagnosing-bugs applies to observed failures,
PowerShell guidance to Windows commands, and writing-for-agents to project rules.
Computer Use applies only to authorized desktop verification and remains stopped.

Research applies when a platform or protocol fact needs primary evidence. Codebase-design
applies when an ownership boundary needs redesign. Prototype
or visualization skills apply only when a design question needs a separate mockup;
they do not authorize production-first design. Browser skills concern actual web
surfaces, not the WinUI app. Marketing, Azure/model deployment, document/media creation,
Sites, account connectors and machine-wide optimization do not apply to this task.
No dependency, plugin, runtime or operating-system tuning is justified by skill availability.

## Release limits still open

The six code-review corrections require interface verification and isolated storage
fault injection. Check invalid dependent numbers with their qualifier off/on,
long initial-read errors and Retry, unchanged peer/tracker selection across live
updates, a stalled seeder's stopping facts, and file row identity in an external
automation client. Test connection JSON failure and failed credential compensation
against disposable profiles only. These behaviors are source-reviewed and built,
but remain unvalidated through the user's external interface and may still be wrong.

The latest refinement also requires live checks after desktop control resumes:
open empty Add and type/paste immediately; traverse its F6 groups; replace a filtered,
partially selected file draft with an unreadable file and cancel the picker; verify
the original draft and destination survive. At a short window and enlarged text,
the path must remain readable and Add/Cancel reachable. Switch between connection
profiles after validation errors, both accepting and canceling discard, and verify
the error follows its draft. Inspect peers without a client name and trackers before
and after a scrape to verify the final visible facts. These are pending acceptance
cases, not claims of observed behavior.

Connections cancellation, popup priority, inspector recovery and Pieces theme
invalidation now have accepted design amendments, reviewed implementations and a
clean Release build. Their live interaction and visual acceptance remain open;
the headless tests establish Session behavior only.

An Inno installer, clean-machine installation, TLS certificate trust-on-first-use, ARM64,
startup registration and verification of accent-dependent contrast are not yet accepted.
The candidate notice bundle pins the tested installed Transmission 4.1.1 bytes and
source; complete acquisition/dependency provenance remains recorded in
`../LICENSES/transmission-4.1.1.md`. This is not yet a distribution-ready release.
