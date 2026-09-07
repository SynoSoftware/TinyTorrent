# TinyTorrent — the approved plan

The design of record for the three-process client: the C tray, the bundled Transmission engine, and
the on-demand WinUI 3 interface, plus the reusable table API underneath the list. Approved by the
owner. Written before stage 0 and moved here unchanged except where the work disproved something;
each such place says what replaced it.

**It is a design, not a status report.** Passages describing work as future describe work that may
already be committed. `handoff.md` holds where the work actually stands.

## Context

All work lands in `winui3/`. The other trees — `backend/`, `frontend/`, `win/`, root `docs/` — stay
in git as reference and are **not** integrated with, and **nothing is deleted**; that call is the
owner's to make later. Where this plan cites them it is as a requirements source or a design
reference, on request.

When this plan was written, `winui3/` held a finished generic table control (`src/Synapse`) and a
torrent page driven by `TorrentCatalog`, a fake feed that invented rows and ticked them. Nothing
talked to a daemon. Two things had to happen:

1. **Build the communication layer to Transmission** — the RPC surface complete, the application
   focused. Vendored source at `3rdParty/transmission` (4.2.0-dev) for truth about the protocol;
   installed binary at `C:\Program Files\Transmission` (4.1.1) to test against.
2. **Redesign the table's host-facing API** so the control is reusable elsewhere. §5 of
   `docs/torrent-table-specs.md` gets rewritten, and the sample and tests change with it.

The previous attempt failed from accumulated complexity, not from one bad decision. That is why
`winui3/AGENTS.md` exists and names the cost of every rule it sets, and it is the standard this work
is judged against.

## North star

The root `README.md` states the original goal: a **<3 MB binary**, a native tray always running, and a
UI launched on demand so that **no UI process exists when the window is closed**.

The owner's correction: **the binary-size target was the wrong measure.** A 3 MB binary holding 1 GB
of RAM is worse than a 30 MB binary holding 50 MB. So the goal is restated:

> **While the client is working — downloading or seeding — it uses as little memory as possible, and
> the interface uses none at all, because it is not running.**
> Install size and binary size are disk, not RAM, and are not the thing being optimised.

That is why the engine is Transmission's C daemon and the tray is C with no framework. The parts that
run all the time are the parts that must be thin.

Everything below follows from that. It is also why WinUI 3 replaces the browser: the README chose
WebView2 to get "zero idle UI memory", and it does — but when the window *is* open, a WinUI 3 process
costs less than a browser hosting a React application.

There are deliberately **no numeric targets**. Leanness is judged at review, not gated on a threshold
picked before anything exists.

## Architecture — three processes

```
  TinyTorrent.exe          C, Win32. Always running. The tray.
    │                      Owns the daemon, the tray icon and menu, .torrent and magnet:
    │                      registration, start-with-Windows, and launching the UI.
    │
    ├── transmission-daemon.exe    Bundled. Always running. Does the work.
    │
    └── TinyTorrent.Ui.exe         WinUI 3. Launched on request.
                                   Closing the window exits the process.
```

**Closing the UI window costs nothing and never stops a torrent.** That is the whole point, and it
deletes several things I had planned: there is no close-to-tray in the UI, no exit confirmation in
the UI, no `Shell_NotifyIcon` P/Invoke in C#, and no `ActivationRegistrationManager` — the tray
registers its own `HKCU\Software\Classes` keys, which the existing backend already does.

**The tray is C and stays small.** It never hosts a UI surface: no WebView2, no DirectComposition, no
OLE drag-drop. Its whole job is a message loop, an icon, a menu, a child process, four registry
values, and a handful of HTTP POSTs.

**It needs no JSON parser.** Menu commands are fire-and-forget POSTs whose replies are checked only
for HTTP status. The one read is `session_stats` when the menu opens, for four known numeric keys —
a targeted scanner, not a library.

**Idle cost is zero requests and zero CPU.** The tray polls nothing until the user clicks it.

## What we are building

**A modern uTorrent, not a Transmission compliance suite.** The *library* covers all 24 RPC methods —
completeness there costs about 120 lines, because the method name derives from the request type's
name. The *product* gets the features people use.

**In the tray**, because it must work with nothing open: engine lifecycle, `.torrent` and `magnet:`
handling, start with Windows, Pause all, Resume all, turtle mode, and opening the interface.

**In the interface:** the torrent list with queue drag and labels; the row menu (start, pause, force
start, verify, remove, remove with data, open folder, copy magnet, set location, queue moves,
priority); a detail pane with General, Files, Peers, Trackers, Speed and **Pieces**; an add dialog
with per-file selection; preferences in five groups; alt-speed with its schedule; blocklist; port
test; free space; remote connection profiles.

**Out, as low return for the noise they add:**

| Cut | Reason |
|---|---|
| Bandwidth groups (`group_get` / `group_set`) | Nobody uses them. The library keeps the methods; there is no UI. |
| The four `script_torrent_*` hook pairs | Power-user daemon feature with no uTorrent equivalent. |
| `reqq`, `preferred_transports`, `anti_brute_force_*`, `default_trackers` | Advanced daemon tuning. An Advanced page nobody visits is exactly the noise to avoid. |
| Toast notifications | Not wanted. |

**`cache_size_mib` was cut, put back, and cut again.** Worth recording, because the reasoning changed
twice and the evidence settles it.

I put it back on the grounds that it is the setting most directly controlling memory while working. A
peer review then pointed out it is deprecated. **Verified:** commit `849cd0ece` *"refactor: remove
write cache (#8669)"*, 2026-03-11, makes `session_set cache_size_mib` a no-op and renames the backing
field to `unused_cache_size_mbytes` (`session.h:463`, with `// TODO(TR5): remove`).
`rpc-spec.md:1124` says it stays settable only until 5.0.0 to avoid breaking clients and that clients
should stop using it.

But `git tag --contains 849cd0ece` returns **nothing** — it is HEAD of the vendored 4.2.0-dev tree and
is in **no released tag**, including 4.1.1, 4.1.2 and 4.1.3. So on the daemon we bundle it is still a
real knob, and on the next major one it is inert.

**It goes, and it does not come back.** A control that works today, silently becomes a no-op when the
bundled daemon is updated, and disappears at 5.0 would have to be version-gated to be honest — more
machinery than a 4 MiB default is worth, and exactly the low-return noise this scope exists to avoid.
The memory win arrives anyway: upstream deleting the write cache lowers daemon memory with no work
from us. **`peer_limit_global` is then the only live memory knob**, and the plan says so rather than
implying there are two.

Related: **bundle the newest 4.1.x**, not 4.1.1. The tree has 4.1.2 and 4.1.3 tags; the machine
happens to have 4.1.1 installed, which is a fact about this machine, not a choice.

**Every cut is one property to reverse.** The settings request derives its field list from the
settings type, so putting `reqq` back later adds it to both the request and the response
automatically. Nothing has to be re-plumbed. That is what makes cutting safe rather than final.

Two features the old frontend had that Transmission simply does not offer, so they cannot carry over
regardless: **adding a peer by address** and **banning a peer IP**. No such method exists among the
24; they were extensions of its own engine.

### Two corrections worth recording

**The alt-speed scheduler is cheap, and the old UI made it look expensive.** Transmission models it
as *one* time range plus a day bitmask — `alt_speed_time_begin` and `..._end` in minutes from
midnight, `..._day` as Sun=1…Sat=64. That is two time pickers and seven checkboxes. The old frontend
spent **744 lines** on a per-hour weekly grid, implementing something richer than the daemon can
store. It stays, and it is small.

**The Pieces tab's cost is the rarity colouring, not the map.** `pieces` is a base64 have/don't-have
bitfield — one decode, drawn into a `WriteableBitmap`. `availability` is the expensive field: one
integer per piece, tens of thousands on a large torrent. It stays, because the rarity colours are the
part the owner liked, but **it rides the detail request only while the Pieces tab is the visible
one.** One condition. That replaces the derived-refresh-interval scheme the session design proposed
and itself flagged as the one piece of cleverness it would accept being overruled on.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Process split | **Three**: C tray, bundled daemon, on-demand WinUI 3 UI | The north star. |
| Daemon | **Bundled** `transmission-daemon.exe`, owned by the tray, plus user-added remote profiles | First run always works. Brings GPL obligations — see below. |
| Packaging | **Unpackaged**, shipped by an **Inno Setup** installer | Three loose executables and a registry-writing tray; MSIX fits none of it. |
| Windows App Runtime | **Framework-dependent.** The installer detects it and fetches it if missing | Owner's call: do not ship bloat, and the app needs the internet anyway. |
| Wire dialect | **JSON-RPC 2.0 only.** Transmission 4.1+ required | See below — this deletes a whole layer. |
| Remote profiles | Modern daemons only, with trust-on-first-use for self-signed TLS | Owner's call. |
| Tray exit | A setting: stop the engine, leave it running, or ask. **Default: leave it running** | Owner's call. Settles the orphan design — see below. |
| Tray at rest | Polls nothing. One `session_stats` when the menu opens | Owner's call, and the north star applied to the tray itself. |
| Integrations | File and magnet association, tray, start with Windows. No toasts. | Owner's call. All three live in the tray. |
| Visual language | **Stock Fluent.** No invented theme, no token sprawl | Owner's call, and see below. |
| Strings | English literals in the app; the control keeps its `.resw` | The control is built for reuse and earns resource lookup. The app is one product for one audience. |
| Table API | Free rein to redesign the host-facing surface and rewrite §5 | Owner's call. |
| Targets | None. Leanness judged at review | Owner's call. |

### Dropping the legacy dialect deletes a layer

Transmission 4.1 replaced the bespoke envelope with JSON-RPC 2.0 and renamed every string to
`snake_case`. Supporting the old dialect too would have cost a second name annotation on ~200
properties, a second serializer options object, a dialect abstraction with two implementations, and —
because **batching requires `"jsonrpc":"2.0"` on every element** (`rpcimpl.cc:2850`) — a non-batching
fallback path with its own tests.

All of it goes. There is one envelope writer, one options object, and batching is always available.

What remains is the **detection**, and it is nearly free. `X-Transmission-Session-Id` is required
unconditionally (`rpc-server.cc:61`), so a fresh client is *guaranteed* one 409 before anything
executes. `X-Transmission-Rpc-Version` appears only in that 409 branch (`rpc-server.cc:627`). So: no
version header on the 409 means a pre-4.1 daemon, and the connection fails fast with
`SessionFault.Protocol` and a message naming the required version — rather than half-working and
producing wrong field names.

One consequence to hold: **never persist a session id across runs.** Reusing one skips the 409, and
the 409 is the only place the daemon's version is revealed.

### Stock Fluent, and the token discipline that goes with it

The **repository root** `docs/Fluent 2 design and review standard for WinUI 3.md` is the authority —
root, not `winui3/docs/`, which is where this plan now sits. It stays where it is —
**and it must survive whenever that folder is cleared.** Its §2 settles precedence: real product
behaviour first, then *existing project conventions*, then control-specific guidance, then Windows
guidance, then Fluent foundations, and custom design decisions last. It explicitly forbids
introducing a parallel styling system or adding resources without demonstrated reuse.

Its §13 is the answer to "avoid token bloat but keep the theme consistent", and it is an ordered
preference, not a prohibition:

1. Built-in WinUI control resources and styles
2. Existing application resources and styles
3. A justified reusable project resource
4. A local literal, when no reusable semantic role exists — *a deliberate exception, not the default*

So: no app-wide token system, and no element styled in isolation either. A resource is added only
when the same semantic role appears in more than one place, and it is named for the role rather than
the value. The one hard rule from the table's own specification carries over unchanged: **never
hard-code a theme-sensitive colour when a brush exists.**

### Bundling Transmission — what it obliges

Transmission is GPLv2-or-later. Shipping its binary means shipping its licence text and providing
access to its corresponding source for the version shipped. Because we ship the **unmodified official
binary** and talk to it over a **documented network protocol**, this is the shape that is normally
treated as aggregation rather than a combined work — but that judgement is the owner's, not mine, and
worth confirming before release.

**Settled by the owner: we elect GPLv3 terms for the redistributed copy and ship a pinned source
link.** Transmission is GPLv2-or-later, so that election is available, and it makes a link sufficient
where it would not be under GPLv2 alone. The installer carries
`LICENSES\transmission-COPYING.txt`, a note stating the election, and a link pinned to the **exact
version and commit** shipped — not to a moving `latest`, which would stop corresponding to the binary
the moment upstream tags a release.

The reasoning behind that election, for whoever revisits it: **a download link is not sufficient under
GPLv2.** GPLv2 §3 offers three routes — accompany the binary with source, include a written offer
valid for three years, or (non-commercial redistribution only) pass along the offer you received.
The "just link to the source" option is GPLv3 §6(d). Transmission is GPLv2-**or-later**, so electing
GPLv3 terms for the copy we redistribute makes a pinned source link sufficient — but that election
should be deliberate and stated, not assumed. The owner has elected it, so the installer carries
`LICENSES\transmission-COPYING.txt`, the statement of election, and the pinned link.

## Project shape

All of it lives under `winui3/`, including the C tray — that is where work goes.

```
winui3/
  src/Tray/                 the tray                   (C, Win32, .vcxproj — new)
  src/Synapse/              the table control          (WinUI 3 class library, unchanged purpose)
  src/Transmission/         the RPC client             (plain net10.0 — no WinUI reference)
  src/TinyTorrent.Core/     session, cache, commands   (plain net10.0 — see below; created at stage 3)
  src/TinyTorrent.Ui/       the interface              (WinUI 3, WinExe; gains Torrent/ from the sample)
  samples/Synapse.Sample/   the control's demo host    (keeps Demo/ and Probe/; gains a second page)
  tests/Synapse.Tests/      control tests              (packaged WinUI host, unchanged)
  tests/Transmission.Tests/ protocol tests             (plain net10.0, headless — new)
  tests/TinyTorrent.Tests/  session and queue tests    (plain net10.0 once the row is XAML-free — new)
  installer/                Inno Setup script          (new)
```

**The RPC library has no WinUI reference.** A plain `net10.0` library, so its tests run headless in
seconds. `AGENTS.md:246-265` records what the packaged test host costs — a window stealing focus every
few seconds on whoever is at the machine — which is why the control's suite is run once by a
coordinator rather than per change. A protocol suite that runs on every build cannot pay that.

**The interface is its own project, not the sample.** `AGENTS.md:401-406` is explicit: *"this
control exists to be reused, so the torrent page must never be the only thing it has been built
against."* If the torrent page becomes the app, the sample stops being a second consumer at exactly
the moment we are trying to prove reuse.

**The sample gains a page that is not a torrent list, and this is not a nicety.**
`tableview-implementation-plan.md:199-200` promised *"one synthetic row type that is deliberately not
a torrent"*, and `DemoRow.Generate` produces `ubuntu-24.1-netinst-amd64.iso`. Both existing consumers
are torrent lists, so the reuse claim has never been tested. The new page should also use a
**non-notifying source replaced whole, with no key selector** — the half of §5.3 the torrent app never
touches, because it uses stable rows and a key selector for everything.

**A fifth project, `TinyTorrent.Core`, was forced by stage 0 and is not in the original layout.** A
plain `net10.0` test project **cannot reference** a `net10.0-windows10.0.26100.0` one — the
platform-specific target framework is not assignable to the general one. Verified, not assumed. So
`tests/TinyTorrent.Tests` as scaffolded can reach nothing, and the plan's phrasing — "plain net10.0
once the row is XAML-free" — was wrong: being XAML-free is necessary but not sufficient, because the
*target framework* blocks the reference regardless of what the code contains.

The session layer is already designed to be XAML-free, so the fix is to give it a home that matches:
`src/TinyTorrent.Core`, plain `net10.0`, holding `Session`, `Poll`, `Torrents/*`, `Commands`,
`Inspector`, `Settings`, `Stats`, `Queue`, `Merge`, the row model and the formatters.
`TinyTorrent.Ui` keeps the pages, templates, `SparklineView` and the piece-map renderer, and
references Core. It is created at stage 3, when there is something to put in it — creating it empty
now would be speculative scaffolding.

**No NuGet package is added.** `System.Net.Http` and `System.Text.Json` are in the shared framework.
The design's decision 14 rejects any package absent numbers for executable size, memory and runtime
cost.

**Two stale files stay put.** `winui3/TableCellsPanel.cs` and `winui3/TableRowVisual.cs` are
uncompiled duplicates that differ from the `src/Synapse` copies. Nothing builds them. They are a trap
for anyone grepping during this work — **do not open them, do not edit them, and do not trust a grep
hit in them.** They are not deleted.

## Build order

**Three independent tracks, then a merge.** The tray is C and touches none of the C#, so it can be
built alongside. The table redesign comes **before** any host is written against it, or the torrent
page gets written twice.

| Stage | What | Depends on | Proven by |
|---|---|---|---|
| 0 | Create `Tray`, `TinyTorrent.Ui`, `Transmission` and the two test projects; **move `samples/…/Torrent/` into the UI project**; wire `Synapse.slnx` | — | Clean build; the sample still runs on its demo page |
| **1C** | **The tray**, ~400–500 lines of C. Message loop, icon, menu, engine supervision and adoption, `.torrent` and `magnet:` registration and handling, start-with-Windows, launching the interface | 0 | **A working torrent client with no interface at all** — see below |
| 1A | Table API redesign; migrate both hosts in their final homes; **add the sample's non-torrent page**; rewrite §5 | 0 | Wiring line count falls; the sample proves the API against something that is not a torrent |
| 1B | Transport: envelope, errors, the single-request path, then the 24 request records, then the DTOs, then batching | 0 | Headless protocol suite. `RpcClient` is the riskiest file and gets full coverage **before any DTO exists** |
| 2 | Boundary types, the three field sets, fixtures captured from the live daemon | 1B | Headless suite, plus every method against the live daemon |
| 3 | Session: state machine, tick, cache, merge, one optimism mechanism, queue arithmetic | 1A, 2 | `TorrentCatalog` deleted; the list runs on a real daemon with real transfer; **and the 2,000-row merge is timed here**, because stage 3 assumes it fits |
| 4 | UI shell: window, sidebar filters, toolbar, status bar, connection state, layout persistence | 3, 1C | Launched by the tray; manual pass against the two-daemon rig |
| 5 | Inspector: General, Files, Peers, Trackers, Speed, Pieces | 3 | Every detail field visible, every editable one round-tripped |
| 6 | Dialogs: add torrent, remove, set location, preferences, connection profiles | 3 | Every `session_set` key we expose round-trips; add by file, magnet and URL; duplicate detected |
| 7 | Inno Setup installer: three binaries, the runtime check, the licence files | 6, 1C | Install, run, uninstall on a clean machine |

**Stage 1C is the first thing worth having.** At the end of it there is no interface at all, and the
product already works: the tray starts the daemon, a magnet link clicked in a browser downloads, and
Pause all and Resume all work from the menu. Everything after it is the interface. That ordering is
what the north star implies — the UI is the optional part.

It also means the C# tracks develop against a daemon the tray is already managing, rather than one
started by hand, so there is never a moment where process supervision and the client are both new.

### The build command

**One command builds everything, and it is not the obvious one:**

```
"C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\amd64\MSBuild.exe" ^
    winui3\Synapse.slnx -p:Configuration=Debug -p:Platform=x64
```

Both alternatives fail, and I verified all three:

- **`dotnet build` fails.** Its MSBuild cannot host native C++ at all — `Tray.vcxproj` dies on
  `MSB4278: The imported file "$(VCTargetsPath)\Microsoft.Cpp.Default.props" does not exist`. Pointing
  it at the installed toolset gets past that and then fails inside the C++ tasks themselves, which
  need the .NET-Framework-hosted MSBuild.
- **The default 32-bit `MSBuild.exe` fails** on the WinUI projects with
  `NETSDK1032: The RuntimeIdentifier platform 'win-x86' and the PlatformTarget 'x64' must be
  compatible`. The cause is that the csproj infers its RID from
  `RuntimeInformation.ProcessArchitecture` — the *build process's* architecture — so a 32-bit MSBuild
  infers `win-x86` while `Platform=x64` sets `PlatformTarget=x64`.
- **The x64 MSBuild agrees with itself** and builds all seven projects, tray included.

**ARM64 is unverified**: this machine has no ARM64 cross-compiler (`MSB8020: The build tools for v145
cannot be found`), so the tray's ARM64 configuration is declared but untested. Win32 and x64 both
prove the project shape.

### Order within stage 1A

1. **Rename the internal `ResolvedLayout` accessor** (`TableView.Layout`) to `Geometry` first, freeing
   the public name. ~40 internal call sites.
2. `TableColumn`: `DefaultWidth`→`Width`, `IsVisibleByDefault`→`IsVisible`,
   `CellHorizontalAlignment`→`CellAlignment`, `Id` becomes nullable, `CanSort` and `SortComparer`
   delete.
3. New types, then the `TableView` members, then the defaults, then the shipped placeholder content.
4. **`tests/Synapse.Tests/TorrentSchema.cs` before any other test file** — every test builds its
   table through it.
5. Then the remaining test files, largely mechanical: `SelectedItems`→`Selection.Items` (115 sites),
   `ApplyLayoutState(x)`→`Layout = x` (75), `SetSelection(a,b)`→`Selection = new(a,b)` (40),
   `GetLayoutState()`→`Layout` (32), `CurrentItem`→`Selection.Current` (22). Two groups are **not**
   mechanical: anything asserting the marquee or reorder default, and the `CanSort`-without-comparer
   error cases that no longer exist.
6. `TableDemoPage` before `TorrentPage` — the smallest host is the proof the new defaults work. It
   should end shorter with no other change.
7. **The specification lands in the same change**, not after it: §5, §6, §17, §18 and Appendix A.2.2,
   A.2.3, A.2.5, A.2.6. A plan and a specification that disagree are worse than either alone.
8. The coordinator runs the suite once, at the end.

Build after each library step. Do not run the suite per step.

## Design — the transport

`src/Transmission`, plain `net10.0`, no package references. Namespace `Transmission`, primary type
`RpcClient`, so a use site reads `new RpcClient(address, credential)`.

**Three owners, and the third is the point.**

| Concern | Owner |
|---|---|
| The wire — key names, method names, envelope, every converter | one `JsonSerializerOptions` and one envelope writer |
| The connection — `HttpClient`, address, credential, session id, cancellation | `RpcClient` |
| Which fields a `torrent_get` or `session_get` asks for | **the projection type itself** |

### The field list is the type

```csharp
var (torrents, stats) = await client.Send(new TorrentGet<TorrentSummary>(), new SessionStats(), token);
```

`fields` is never written by hand. A contract modifier adds a synthetic `fields` property to any
request implementing `IFieldRequest`, whose getter returns the property names of the projection type
read from its own `JsonTypeInfo`, cached. So the request asks for exactly the properties of the type
the response deserializes into. **Drift is not prevented; it is unrepresentable.**

That is the Qt defect removed: `MainAll` must equal `MainInfo ∪ MainStats` by hand
(`qt/Session.cc:501-503`), with a 64-key ceiling and no check. And the union itself disappears — Qt
needs one only because it merges everything into a single HTTP request. **The union is an artifact of
not batching.**

`session_get` gets the same treatment, which matters: with `fields` absent it returns everything,
including `download_dir_free_space`, which stats the filesystem server-side. Qt does that every three
seconds. Here there is no way to send it without `fields`.

Names derive from the C# property name via `JsonNamingPolicy.SnakeCaseLower`, and **no property needs
an explicit one** — the library ships zero `[JsonPropertyName]`. I expected `speed_Bps` to be the one
exception; stage 1B established it appears in no RPC request or response at all. `quark.cc:616` marks
it `.resume`, it occurs only in `resume.cc` and the legacy mapping table, and it is absent from all
five fixtures captured from a live 4.1.1 daemon. The RPC key is `speed_bytes` (`quark.cc:617`).

### Method names derive from type names

All 24 methods are one to four line records; `Requests.cs` is about 120 lines total and there is no
wrapper method at all. A test asserts the 24 derived names equal the 24 transcribed from the dispatch
maps. The table exists as an assertion, not as behaviour. The old frontend spent **1,742 lines** here
because every method was hand-written twice, once for the call and once for the argument shape; here
the record *is* the argument shape and its type name *is* the method.

### The 409 replay

Capture the session-id cell, send, and on 409 read both headers, compare-and-swap the new id, then
**re-serialize the request from the model object** and send once more. Qt replays the bytes it
already encoded (`qt/RpcClient.cc:237`); keeping the request as a model object until the moment of
send costs nothing and is strictly safer.

**The retry bound is one, and it is derived**: the session id rotates on a 3600 s timer with no grace
window, and a request lives at most 60 s, so at most one rotation can occur within a request's
lifetime. A second consecutive 409 is not a stale id and must throw.

Replay is safe **even for side-effecting methods**, and this is stronger than idempotence: the 409 is
emitted at `rpc-server.cc:621-646`, before dispatch at 647. The request provably did not execute.

The herd at the hour boundary is honest — N in-flight requests all get one 409 and nothing can
prevent that. The compare-and-swap does not reduce N; it stops N racing writes and keeps each request
to its single retry. **What actually shrinks N is batching**: one request per tick makes N about 1.

### Timeouts belong to the request

`IRpcRequest<T>.Timeout` defaults to 60 s; `BlocklistUpdate` overrides it to 300 s. Both are
`transmission-remote`'s own policy. A batch takes the **maximum** of its members', which makes the
batching hazard self-correcting rather than silently wrong.

### Decisions worth naming

- **`AllowAutoRedirect = false`.** The 301 points at the *web client*, not another RPC endpoint, and
  .NET drops `Authorization` across a redirect.
- **We set `Authorization: Basic` ourselves.** It avoids a wasted 401 per connection, makes a 401 we
  do see unambiguous, and — since each challenge round trip increments `login_attempts_` — stops us
  burning the anti-brute-force budget at double rate.
- **gzip on, except on loopback.** The server compresses only when asked and never enlarges; on
  loopback there is no wire to save.
- **Concurrency is allowed because it is required.** The four async-dispatched methods complete out
  of band and `blocklist_update` may take minutes; a serialized transport would stall polling for
  five minutes on a blocklist fetch. Note what it does *not* buy: the server takes one session lock
  anyway, so concurrency exists solely to keep long calls off the poll path — which is also why the
  poll batches rather than parallelises.
- **Never retry 401 or 403.** A retry loop burns the login budget, and a 403 lockout cannot be cleared
  by a good login at all: the 403 gate at `rpc-server.cc:536` runs *before* `is_authorized` at 570,
  so the reset at 585 is unreachable. Only disabling the setting or restarting the daemon clears it.
  The two 403 causes — brute-force lockout and IP not whitelisted — are byte-identical on the wire, so
  the message names both rather than guessing.
- **Object format, not `format: "table"`.** Weighed and rejected: gzip already crushes the repeated
  keys, and the parse saving — 25,000 property matches versus 25 — has no budget to exceed, because
  parsing happens off the UI thread. The cost is a hand-written positional converter that
  hard-couples the wire shape to the DTO. The one benefit worth having is knowing which fields the
  server honoured, since unknown names are dropped silently and the set genuinely differs across
  versions (`webseeds_ex` exists in 4.2.0-dev and **not** in the installed 4.1.1). That is available
  for ten lines instead: the daemon emplaces every key it accepted, so the keys present on a returned
  torrent object *are* the supported set. The switch stays reversible.

### Two things about batching the spec does not say

**The response array is compacted, so position is not a reliable correlator.** Responses are written
into slot `i`, but before the callback runs every slot belonging to a notification is removed with
`remove_if`. **Correlate by `id`, never by position** — and Qt generates an `id` then ignores it on
the network path, matching by reply object identity instead. That is the bug this avoids.

**The whole batch runs under one session lock**, and 20 of the 24 methods are synchronous and
complete inline in the loop. So the stats and torrents in a tick are one consistent view — a property
neither Qt nor the web client has. But **a batch waits for its slowest element**, so the four
asynchronous methods — `torrent_add`, `port_test`, `blocklist_update`, `torrent_rename_path` — must
never ride the poll batch.

### The seam between transport and session

The transport materialises into the projection type; the session model declares that type. The
alternative — handing back raw `JsonElement` so the session can merge without a second object graph —
was considered and rejected: sweeps are rare, deltas are small, and the typed decode is exactly what
makes the field list derivable. If a measurement shows the sweep allocation matters,
`TorrentGetResult<T>` grows a raw-element escape hatch without changing the request side.

## Design — the session

`src/TinyTorrent.Core`, not `src/TinyTorrent.Ui` as this section first said — the Project shape
section above records why the split was forced. `Session` owns the connection, and its state is one
field with one transition method: `Idle`, `Connecting`, `Live`, `Retrying`, `Blocked`, each carrying
its own data.

`SessionFault` has **four** members — `Unreachable`, `Unauthorized`, `Refused`, `Protocol` — because
each produces a *different* screen. A fault that produced the same screen as another would not be a
member. An earlier draft had a fifth, `NotInstalled`; the tray split removes it. The interface never
discovers a missing engine, because it never installs or starts one — it is handed a port. A missing
engine is the tray's problem and is reported there.

### The tick is 2 seconds, constant, and not configurable

Derived: `Bandwidth::HistoryMSec = 2000`. The daemon averages speed over a 2-second window, so
polling faster returns the same average twice and polling slower discards one it already computed.
Qt's 3 seconds is derived from nothing.

**What varies is the batch's contents, not the interval.** Every tick carries `session_stats`. The
`torrent_get` element is added only when the *previous* tick's stats say there is something to learn:
active count above zero, non-zero session rates, a mutation landed, `torrent_count` disagreeing with
the cache, or the paused count moving. With everything stopped the tick is a few dozen bytes.

So there is no idle interval to choose, **no second number to argue about, and no "poll interval"
setting to drift** — one of the four settings the old frontend gave two owners and two defaults.

Non-overlapping ticks need no flag: the timer is non-repeating and restarts from the tick's own
completion. A tick cannot overlap because the next one does not exist until this one finishes.

### Why a missed removal cannot go unnoticed

`session_stats.torrent_count` rides every tick. Any membership drift — a removal we missed, an add
from elsewhere, a watch-folder add — makes it disagree with the cache count, and the next tick is
promoted to a full sweep. **One integer compare, within one tick, whether or not we were even
connected when it happened.** An add can never be missed anyway: constructing a torrent calls
`mark_changed()`, so it is always in the next delta.

That demotes the 60-second sweep from safety net to a named residual case: with everything stopped,
another client can rename a torrent or change its labels, and neither moves a counter we watch.

**Rows absent from a delta have their rates zeroed.** Provable, not a heuristic: any byte moved bumps
`date_changed`, so a torrent missing from a delta has moved nothing for ≥60 s while the daemon's rate
window is 2 s. Its true rate is 0. This fixes a real defect both Qt and the web client have — a
torrent that goes quiet keeps showing its last speed until the next sweep.

**`ids` must be the bare string `"recently_active"`, not an array containing it.** The guard is
`args_in.value_if<std::string_view>(TR_KEY_ids)` (`rpcimpl.cc:1018`). Wrapped in an array you get the
right torrents, no `removed` key, and no error — a silent loss of every removal.

### Three outcomes per tick, one branch

The merge reports which *kinds* of field changed as a flags value. The page holds two masks,
recomputed only when the filter or the sort changes:

```csharp
if ((change.Fields & _projectionFields) != 0)  ApplyProjection();  // membership/filter inputs moved
else if ((change.Fields & _sortFields) != 0)   Table.Refresh();    // once per batch, per §5.3
// otherwise nothing — cells redraw from INotifyPropertyChanged
```

A speed tick under a name sort does nothing at all. A speed tick under a speed sort refreshes,
because that is what the user asked for.

### One optimism mechanism

The list can show exactly three things before the daemon confirms them — a status, a queue order, and
whether a row is there. So the edit type is exactly those three, `Apply` **returns its own inverse**,
and rollback is applying the inverse.

**Inverses are never composed across overlapping edits.** If a later mutation touched the same rows,
the optimism is discarded and the next tick is forced to sweep. Composing is exactly where the old
frontend grew a 264-line grace-timer state machine beside a separate 67-line toggle.

Success does not retire the optimism either — the poll in flight when the daemon acked may predate
the change. The mutation records the tick stamp at ack and retires when a later merge lands.

**Queue reorder needs no planner.** `queue_position` is directly settable through `torrent_set`. The
old frontend had a `planQueueReorder` that computed a minimal sequence of move-to-top and
move-to-bottom calls to reach an arbitrary drop position; that whole function is unnecessary. One
pure `Arrange` computes the desired order and `Steps` computes the minimal `torrent_set` sequence,
all in a single batched round trip. The drag and the four menu commands differ only in which
`Arrange` overload they call — AGENTS.md's rule that a menu command and the gesture it mirrors call
one implementation, or they will eventually disagree about what a legal destination is. The
`queue_move_*` methods stay for the menu, where "up one" is exactly what the user asked for.

### The inspector shares the tick

Subscription is one string field; `Watch(id)` clears the detail so the pane never shows the previous
torrent's files. **Cancellation is a comparison, not a token**: the detail `torrent_get` is one
element of the tick batch, and a response whose id no longer matches is dropped on arrival. Nothing
to cancel, no orphaned request, no race.

Per-tab field sets split once-per-torrent from every-tick. `files` — names, lengths, piece ranges —
is constant, and refetching it every two seconds for a 5,000-file torrent is the shape of thing that
made the old client slow. **`availability` is fetched only while the Pieces tab is visible.**

### Two fixes the existing row model needs

- **`StatusAccent` must go.** It resolves `Application.Current.Resources[key] as Brush` and caches it,
  so a runtime theme change leaves every row holding a stale brush — the file's own remark admits
  this. It becomes a key string resolved by the cell template. That also makes the whole session
  layer XAML-free, which is what lets it be tested without opening a window.
- **`IsStalled` is a second owner of a daemon concept.** Derived locally from
  `Status == Downloading && PeersConnected == 0`, while the daemon publishes `is_stalled`, which
  honours the user's `queue_stalled_minutes`. Take it from the wire, and compute one
  `TorrentActivity` display enum from `(Status, IsStalled)` so the label, glyph and accent cannot
  disagree.

Also: `TorrentFormat.Bytes` hardcodes 1024 while the daemon publishes what it means. The **speed**
"k" is always 1000 (`utils.cc:65` sets `Config::Base::Kilo` and only the GTK and Qt *clients* ever
reassign it, both to `Kilo`), so `units.speed_bytes` is read once and asserted, not branched on.

## Design — the tray

A C Win32 program: a window class with no visible window, a message loop, `Shell_NotifyIcon`, a popup
menu, one child process, four registry values, and a few `WinHTTP` POSTs. Nothing else. It must
re-add its icon on the `TaskbarCreated` message, or it vanishes when Explorer restarts.

**The menu**, with `session_stats` fetched once when it opens:

```
  ↓ 5.2 MB/s   ↑ 340 KB/s   8 active
  ─────────────────────────────────
  Open TinyTorrent
  ─────────────────────────────────
  Pause all
  Resume all
  Turtle mode                    ✓
  ─────────────────────────────────
  Exit
```

Every command is one POST whose reply is checked for HTTP status and nothing more. `session_stats` is
the only read, and it is four known numeric keys — **a targeted scanner, not a JSON library.** If a
fifth value is ever wanted, that is the moment to reconsider, not before.

### What the existing tray teaches

`backend/src/tray/entry_winmain.cpp` is 3,095 lines. **Only ~700 are tray and lifecycle**; the other
2,391 are WebView2 hosting, DirectComposition, OLE drop targets and frameless-window input, and all of
it is discarded. Two of the remaining chunks also evaporate: the 118-line splash window existed only
to cover WebView2's cold start, and a 39-line `EnumWindows` hack scanned every window title for a
token because the tray had no handle on its UI — when you own the UI's process you have its PID.
**Realistic target: 400–500 lines of C** for the parts with precedent. Do **not** anchor the stage 1C
review on that number: engine supervision has no precedent here, and once WinHTTP, the JSON-RPC
writer, the 409 replay, adoption and crash restart, port allocation, `settings.json` seeding, the
registry work, `WM_COPYDATA`, `WM_QUERYENDSESSION`, `TaskbarCreated`, `SetPreferredAppMode`, DPI and
balloons are counted, roughly twice that is the honest expectation. Still far below the 3,095 it
replaces, which is the point.

**The one thing there is no precedent for is engine supervision.** The backend has no daemon process
at all — libtorrent, SQLite and the HTTP server run as a *thread inside the tray*
(`entry_winmain.cpp:2994`). There is no `CreateProcess`, no job object, no crash detection anywhere in
that tree. Every part of managing `transmission-daemon.exe` is new work.

**Worth copying:**

- The status line as a menu item with `MF_DISABLED` and **not** `MF_GRAYED` — inert but normal
  weight. `MF_GRAYED` makes it look broken.
- Build the menu once at startup and rewrite labels with `SetMenuItemInfoW`, rather than rebuilding it
  on each right-click.
- The worker thread heap-allocates its status struct and `PostMessage`s the pointer; the window
  procedure consumes and frees it. Correct, and it keeps the RPC off the UI thread.
- `AllowSetForegroundWindow` before launching the interface, or the new process cannot take focus.
- **The uninstall check**: before deleting `HKCU\Software\Classes\.torrent`, verify it still names our
  ProgID. Most implementations delete unconditionally and break whatever the user switched to.
- `SHChangeNotify(SHCNE_ASSOCCHANGED, …)` after register and unregister, or Explorer shows stale icons
  for minutes.
- The registry keys are known rather than guessed: `magnet` with `URL Protocol`, `.torrent` →
  `TinyTorrent.torrent`, and `shell\open\command` = `"<exe>" "%1"` under each.

**Bugs and omissions to fix rather than inherit** — this list is the value of having read it:

- **The tray window is `HWND_MESSAGE`.** Message-only windows do not receive broadcasts, so the
  `TaskbarCreated` message can never arrive — and no handler exists anyway. **The icon disappears
  permanently when Explorer restarts.** Use a normal hidden top-level window instead.
- **Single-instance handoff is dead.** It calls `FindWindowW`, which only searches top-level windows
  and therefore never finds the message-only window; and even if it did, it posts a
  "double-click" message that carries no payload, so the `.torrent` path is discarded. **Opening a
  torrent while the tray is already running silently does nothing.** Use `WM_COPYDATA` to pass the
  argument to the running instance.
- `NIM_SETVERSION` is never called, so the icon runs in legacy mode: no `NIF_SHOWTIP`, a 64-character
  tooltip cap that the current three-line tooltip nearly hits, and older mouse semantics.
- `PostMessage(hwnd, WM_NULL, 0, 0)` after `TrackPopupMenu` is missing — the standard workaround for a
  menu that will not dismiss when the user clicks away.
- `NIM_ADD`'s return value is ignored with no retry. It can legitimately fail when the shell is not
  ready yet at logon, which is exactly the autostart case.
- **No DPI awareness at all** — no manifest entry, no `SetProcessDpiAwarenessContext` — so
  `GetSystemMetrics(SM_CXSMICON)` always returns the 96-DPI value and the shell upscales a 16 px icon.
  Compounding it, four of the five entries in the current `.ico` are **non-square** (16×17, 24×26,
  32×35, 48×52), so every small render is a stretch. Ship square 16/20/24/32/40/48/64/256.
- **No dark-mode menu.** A Win32 popup menu renders light on a dark taskbar without `SetPreferredAppMode`
  or owner-draw.
- No `WM_QUERYENDSESSION` handling — covered above, and it is why every Windows restart currently
  costs a full re-verify.
- `WINHTTP_ACCESS_TYPE_DEFAULT_PROXY` on a `127.0.0.1` connection, which subjects loopback traffic to
  the user's proxy settings. Use `WINHTTP_ACCESS_TYPE_NO_PROXY`.
- The icon is removed *before* the engine is joined, so the app looks closed while it is still
  flushing. Reverse the order.
- Shell integration is **implemented twice**, in `services/SystemInstallService.cpp` and
  `rpc/Dispatcher.cpp`, and the build compiles both. Do not carry two copies forward.

**And it confirms the JSON decision.** Outside the discarded WebView bridge the tray reads **nine
live scalars** from a flat, single-nesting response it generates itself — speeds, counts, a paused
flag, a download directory. Two more are decoded and never read. A parser library buys nothing;
a small scanner covers the whole surface.

### Daemon lifecycle: adoption, not a job object

The tray owns `transmission-daemon.exe`, which ships beside it. Five details are the difference
between working and mysteriously not:

- **`-f` is mandatory.** Without it the Windows build registers itself as the `TransmissionDaemon`
  service, which needs elevation and outlives us.
- **Its own config directory**, `%LOCALAPPDATA%\TinyTorrent\daemon\`. The daemon takes an exclusive
  lock on its config dir, so sharing the user's own means whichever starts second fails. Both must be
  able to run at once.
- **An OS-chosen port.** Bind a socket on `127.0.0.1:0`, read the assigned port, close, pass it with
  `-p`, and persist it. 9091 is wrong because the user's own daemon may hold it, and that failure
  presents as "connected to the wrong daemon".
- **No password.** `rpc_bind_address` and `rpc_whitelist` both `127.0.0.1`. Strictly safer than a
  generated password on a command line every process on the machine can read.
- **`settings.json` has one owner at a time.** The tray writes it once when creating the profile;
  after that every change goes through `session_set` from the UI. The daemon rewrites the file itself
  at exit, so editing it behind a running daemon loses.

**There is no job object, and the default exit setting is why.** An earlier draft used
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` to guarantee no orphan. But the default is now *leave the daemon
running*, which makes a surviving daemon the intended state rather than a leak. So the guarantee is
replaced by adoption, and the two agree instead of fighting:

- On launch, if the persisted port answers `session_get` **and reports our own `config_dir`**, adopt
  it. That check is what stops the tray adopting the user's own Transmission.
- Otherwise start one.
- A tray crash therefore leaves a daemon the next launch adopts — correct under the default, and
  merely "it didn't stop" under the other setting. Self-healing either way.

Two things this owes. **The uninstaller must send `session_close` before removing files**, or it
leaves a daemon running with its executable deleted. **And so must the installer's upgrade path** —
replacing `transmission-daemon.exe` underneath a running engine is the same failure, and upgrades
happen far more often than uninstalls.

**Exit** reads a setting with three values — stop the engine, leave it running, or ask — defaulting
to *leave it running*. When it stops the engine it sends `session_close`, letting the daemon write
`settings.json`, `stats.json` and every `.resume` file; killing instead loses resume state and makes
the next start re-verify everything. When set to *ask*, the prompt carries a "remember this" box that
writes one of the other two values.

**Stopping the engine while the interface is open** is the case that would otherwise ship unnoticed,
because under the default setting it never fires. The interface would be left polling a port that has
gone. So the tray closes the interface first: it signals the window to exit, waits briefly, then sends
`session_close`. The interface treats that signal as an ordinary close — it has nothing to flush but
its own window bounds and table layout.

A daemon crash while the tray is running restarts it **once**, then shows the failure with the
captured stderr tail. An unbounded restart loop against a daemon that crashes on its own data hides
the failure forever.

**The tray must handle `WM_QUERYENDSESSION` and `WM_ENDSESSION`,** and this matters more than it
looks. Transmission writes `settings.json`, `stats.json` and every `.resume` file at exit
(`daemon.cc:1015`). The default exit setting leaves the engine running, so on a Windows restart or
shutdown nothing would ever close it cleanly — and every restart would cost a full re-verify of every
torrent, plus the loss of any setting changed since the engine started. So a session-end message
sends `session_close` and waits for it, regardless of the exit setting: that setting governs what
*the user's* Exit does, not what a shutdown does. Ask for the extra time with
`ShutdownBlockReasonCreate` so Windows does not kill it mid-write.

### Shell integration lives in the tray

- **Association**: four values under `HKCU\Software\Classes` for the `.torrent` extension and the
  `magnet:` protocol, written by the tray at startup. Per-user, no elevation. The existing backend
  already does exactly this, so the keys are known rather than guessed. **This is why
  `ActivationRegistrationManager` is not used** — it is a Windows App SDK API, and the tray is C.
- **Single instance** is free: the tray *is* the single instance. A second launch finds the existing
  window by class name, forwards its argument, and exits. No `AppInstance` redirection anywhere.
- **Activation needs no file reading and no base64.** `torrent_add`'s `filename` argument accepts a
  local path *or* a magnet URI, so the tray POSTs the argument it was handed, verbatim.
- **Start with Windows** is one `HKCU\…\Run` value pointing at the tray, and a preference.

**Clicking a magnet adds it silently. The interface never starts.** The tray POSTs the argument and
the torrent lands in the default folder with every file wanted. This is the north star taken
literally, chosen over the uTorrent-style add dialog.

**A setting turns on a confirmation balloon**, off by default. This is `NIF_INFO` on the
`NOTIFYICONDATA` the tray already owns — a flag and a string, no framework, no extra process, and
nothing polled. It is worth distinguishing from the toast notifications that were cut: those needed
`AppNotificationManager` in the interface, which is not running.

**The line it draws:** the tray can announce things it *does* — a torrent added, an add rejected as
a duplicate or a corrupt file — because it already has the answer in the reply it just received. It
cannot announce things it would have to *discover*, such as a download finishing, because that means
polling, and polling at rest is the cost this design exists to avoid. If completion notifications are
ever wanted, they belong to the engine's `script_torrent_done` hook, not to a poll.

Turning the balloon on is also the reason to call `NIM_SETVERSION` with `NOTIFYICON_VERSION_4`, which
the existing tray never does — see below.

### Launching the interface

The tray passes the engine's port on the command line. If the interface is started some other way —
the Start Menu, a shortcut — it reads the port from the small file the tray persists it to, and if no
tray is running it starts one. The interface never starts an engine itself; that owner is the tray.

**The tray only ever manages and acts on the local engine.** Remote profiles belong to the interface.
Without that line, "Pause all" from the tray would be ambiguous whenever the interface happened to be
showing a seedbox — and making the tray follow the interface's current profile would mean giving a
framework-free C program credential storage and TLS trust decisions, which is exactly the bloat it
exists to avoid. So the tray's menu is always about this machine, and that is worth saying in the
menu itself if it ever becomes unclear.

### The tray is a second implementation of the wire protocol

Naming this rather than fixing it. `src/Transmission` owns the RPC surface for the interface, and the
tray speaks the same protocol again in C — a handful of POSTs and one scanned reply, but genuinely a
second implementation. It violates the plan's own one-owner rule.

It is unavoidable across the language boundary: sharing would mean either the tray taking a .NET
dependency, which destroys the reason it exists, or the interface calling into C for its whole
protocol layer, which is worse. So it stands as a **stated exception**, and the consequence is written
down so nobody is surprised by it: **the tray's five or six calls must be re-checked by hand whenever
the wire changes.** The blast radius is small precisely because the tray's surface is small — which is
another reason to keep it small.

### Diagnostics

Three processes, one of them invisible, and for most of a session no interface at all. Without
somewhere to look, a failure is a torrent that quietly does not start.

The minimum that earns its place: **the tray writes a small rolling log** — engine start and exit with
the command line and exit code, adoption decisions and why, crash restarts, registration results, and
any non-200 from the engine. Plain text, capped, in `%LOCALAPPDATA%\TinyTorrent\`. The interface adds
its own connection-state transitions to the same directory, and offers **Open log folder** in the
tray menu and in preferences.

No log levels, no rotation policy beyond a size cap, no telemetry. This is a file a person reads when
something is wrong, not an observability system.

## Design — the Pieces map

Rebuilt from the frontend's version, which was extracted in full: geometry, thresholds, colours,
flash curve, HUD breakpoints, legend and tooltip. The behaviour below is that design; only the
palette changes, because stock Fluent replaces the invented one.

**Geometry.** Blocks are a constant **16 × 16** with a **4 px** gap, and an extra **6 px** gutter
every 8 blocks in both axes, so the map reads as 8 × 8 bands. Content is centred horizontally,
top-aligned. **The block never shrinks** — when there are more pieces than fit, one block covers a
contiguous range of pieces instead. Columns are always a multiple of 8, chosen by trying candidate
aggregation factors and picking the layout that fits the height with the best coverage, preferring
finer detail on a tie.

**A block's colour is the mode of its range, not an average** — the most common tone among its
pieces, and on a tie the *worse* state wins (dead > rare > common > missing > verified). A block
holding more than one tone gets a 4 px triangle in its top-right corner. That is a better rule than
any-have or all-have and it is worth keeping.

**Thresholds**, in order: done → **verified**; no availability array → **missing**; zero peers →
**dead**; `peers <= ceil(maxPeers × 0.15)`, floor 1 → **rare**; otherwise **common**. `maxPeers` is
the maximum across that torrent's own availability array, so rarity is relative to its best-seeded
piece rather than an absolute number.

**Palette — mapped to Fluent theme resources, not the frontend's hexes:**

| Tone | Draw |
|---|---|
| verified | `SystemFillColorSuccessBrush`, opaque |
| common | accent, 35 % |
| rare | `SystemFillColorCautionBrush` at 75 %, plus 45° hatching in foreground at 22 % |
| dead | foreground at 12 %, with a 1 px `SystemFillColorCriticalBrush` border |
| missing | foreground at 18 % |

**The completion flash** is white, alpha `0.48 + 0.08` per extra piece completed in the same block in
one tick, capped at `0.68`, decaying as `(1 − t)²` over **1000 ms**, with a 1 px glow stroke fading
linearly. Two details make it correct rather than decorative: it fires **only** when the engine gave a
trustworthy per-piece snapshot, and a hit is **discarded if the block's piece range changed since the
last frame** — so resizing the panel does not light up the whole map.

**HUD fields drop as the panel narrows**: speed below 1040, piece size below 920, pieces below 800,
rare below 680, unavailable below 560. Verified, missing and progress are always present. Unavailable
and rare read "Unknown" rather than zero when there is no availability array — a distinction worth
keeping, because zero dead pieces and no data are not the same thing.

**Rendering.** A `WriteableBitmap` — a thousand-plus `Rectangle` elements is not viable, and Win2D is
a package the dependency rule rejects. Hatching, the corner triangle and the flash all fall out of a
pixel buffer naturally. Two layers: blocks, and an overlay for the flash and hover outline. The
buffer exists only while the tab is open, which is also the only time `availability` is fetched.

**Three latent bugs in the original that should not be reproduced.** The extraction resolved every
utility class against the built stylesheet, and four of them generate **no CSS at all**:
`bg-primary/35`, `text-primary`, `bg-content1/55` and `shadow-medium`. So in the shipped frontend the
**"Common" legend swatch is invisible**, the upload sparkline silently inherits `currentColor`
instead of its intended colour, and the HUD, legend and tooltip cards have no fill — only their
border and blur. Reproduce the intent, not the accident: the Common swatch takes the same accent at
35 % that the map uses, so the legend actually matches the map.

## Design — memory while working

**Working** means downloading or seeding — any time the client is doing its job, which is nearly all
the time. This is the north star, so it deserves an honest accounting rather than a slogan. While the
client is working and no window is open, exactly two processes exist:

| Process | What holds its memory | What we control |
|---|---|---|
| `transmission-daemon.exe` | Peer connections, per-torrent state | `peer_limit_global` — the only live knob |
| `TinyTorrent.exe` (tray) | A message loop, an icon, a menu, no buffers | Everything |
| *(the UI)* | — | **It is not running.** |

**The daemon dominates, and we have exactly one live knob: `peer_limit_global`**, already in the
Bandwidth group. `cache_size_mib` looks like a second one and is not — see the note above; it is
deprecated upstream and inert from 4.2. Upstream removing the write cache lowers daemon memory
without any work from us, so the right move is to bundle a newer daemon, not to expose a setting with
an expiry date.

**The tray is a TSR, and the rule for it is a build setting, not an aspiration.** This is the part
that tells a developer what to reach for, which is: nothing.

- **C, compiled as C.** C++ only if something genuinely requires it, and nothing here should.
- **No framework of any kind** — no MFC, no ATL, no WIL, no C++ standard library.
- **Links only** `kernel32`, `user32`, `shell32`, `advapi32`, `winhttp`. Anything else on that line is
  a question to answer before it is added.
- **No JSON library, no HTTP library.** `WinHTTP` is the OS; the one response it reads is scanned for
  four known numeric keys.
- Exceptions disabled, no RTTI, nothing running before `WinMain`.
- One `WinHTTP` connection handle for the life of the process, not one per menu click.

No benchmarking exercise attached. The rule is the deliverable: a launcher that sits in the tray all
day has no business carrying a framework, and the 162 KB uTorrent is the right instinct applied to
the right place — the part that never stops running.

## Design — storage

Three stores, three owners, and no key in more than one.

- **Engine settings** live in the engine, read and written by `session_get` / `session_set`. The
  tray seeds `settings.json` once at first run and never writes it again.
- **Interface settings**: `Microsoft.Windows.Storage.ApplicationData.GetForUnpackaged` — the
  first-class replacement for `ApplicationData.Current`, which throws without package identity.
  Window bounds, the table's layout, profiles, theme, inspector tab.
- **Tray settings** are a handful of values the tray must read without starting anything: the engine
  port, the exit behaviour, whether to add silently, whether to show the balloon, start-with-Windows.
  These live in **`HKCU\Software\TinyTorrent`**, and that is a decision rather than an option. An
  earlier draft offered "a flat file or registry values — either"; that was a dodge. A shared file
  means the interface writes a format the tray hand-parses, which is a second owner of a format and
  exactly the drift this plan spends effort avoiding elsewhere. With registry values the **OS owns
  the format**: the tray reads them with `RegGetValueW` in a few lines and the interface writes them
  with `Microsoft.Win32.Registry`, and neither parses anything.
- **Remote credentials**: `CredWriteW`/`CredReadW` P/Invoke (`CRED_TYPE_GENERIC`). Not `PasswordVault`
  — **not** because it needs package identity (it does not) but because for a full-trust process it
  writes to a *shared, unisolated* vault every full-trust process can read. `CredWrite` reaches the
  same store without the WinRT indirection.

**The drift-proof rule is a test, not a convention:** no client-local preference may have a
snake-cased name that appears in `session_get`'s key list. The old frontend had four pairs that would
each fail it.

## Design — the table API

The control stays non-generic, because WinUI 3 XAML cannot instantiate an open generic. But **a
non-generic class can have generic methods, and XAML cannot see them.** That one observation is the
whole mechanism.

### The row type is stated once, in a schema

```csharp
Table.Schema<Torrent>()
     .Key(row => row.Id)
     .CanInteract(row => !row.IsGhost)
     .Sort(Queue, row => row.QueuePosition)
     .Sort(Speed, row => row.ActiveSpeed)
     .Sort(CompletedOn, row => row.CompletedOn ?? DateTimeOffset.MaxValue);
```

`Queue` and `Speed` are the fields the XAML compiler already generates for `x:Name`-d objects — the
same mechanism as `<ColumnDefinition x:Name="…"/>`. So a column joins to its comparer through a
compiler-checked reference, not a dictionary keyed by a string. Rename a column, get a build break.

What this deletes:

- The `Dictionary<string, IComparer<object>>` and the loop matching ids to comparers.
- The hand-written `IComparer<object>` adapter. Two consumers wrote two different ones; the library
  now has one, and it casts hard — a wrong row type throws instead of returning 0 and silently
  disabling the sort.
- `CanSort`, because a column given a sort key is sortable and one that was not is not. Two
  properties that had to agree become one call, so the disagreement stops being representable.
- The `CanInteractWithItem` cast.

`where TKey : IComparable<TKey>` turns an unorderable key into a compile error, and forces the host
to say where nulls sort rather than deciding it invisibly.

### Three method pairs become three properties

`Selection`, `Sort` and `Layout` each become a settable property whose natural state is `null` or
empty and whose setter is an idempotent request. That removes `SetSelection`, `SelectedItems`,
`CurrentItem`, `GetLayoutState`, `ApplyLayoutState` and the sort back door in one move.

`Table.Sort = new(Queue, Descending)` replaces the diagnostics harness's trick of synthesising a
whole `TableLayoutState` — including a column order read back from `GetLayoutState()` — to change one
field. Column and direction live in one value, so no state exists where they disagree.

`Selection` is deliberately **not** a dependency property. §5.2's rule that there must be no two-way
selected-items binding is currently prose; making it un-bindable makes it structural.

### The control owns the cell inset

`TableView.CellPadding`, read by the header cell and the row cell in the same method four lines apart
in `TableCellsPanel.CreateCell`. That kills the regression `AGENTS.md:119-126` records and 16
repeated margins across two hosts. It is a literal default in the control's own template, not a
resource, so §8 and §19's ban on defining TableView spacing resources does not reach it — and their
stated reason, token sprawl, does not apply to a value that is never named.

The number is derived: enumerate the live resource tree for the platform's own list-item padding, the
technique already proven here when 7,484 `Thickness` resources were enumerated to establish that no
cell-padding resource exists. If nothing is found, that is a finding to report, and the fallback is
stated with its evidence — two independent hosts arrived at 12 with no communication between them.

### Two default flips, each with a reason

**Marquee selection off → on.** With it off an ordinary drag in the table body does nothing, and
design decision 16 already rules that a press nothing competes for must not be a dead press.

**Row reordering on → off, and the hidden switch goes.** `CanBeginRowDrag` currently requires
`_rowsReorderRequested is not null`, so subscribing to an event is load-bearing behaviour and nothing
in the API says so — two owners of one capability. The check is removed and the flag becomes the only
owner, defaulting off because most tables have no domain order. The asymmetry is sayable: a marquee
is a selection gesture and is always meaningful; a reorder is a domain request and is meaningful only
when the host owns an order.

**`IsLoading` beside `EmptyState` collapses to one `TablePlaceholder { Empty, Loading, NoResults }`** —
a boolean qualifying an enum is the enum missing a member. The control ships default content for all
three from its own `.resw`, so a minimal host writes none. Today a table with no rows and nothing
configured renders a blank rectangle, which is exactly what `TableDemoPage` does.

### What it costs and what it buys

| | Before | After |
|---|---:|---:|
| Public members | 34 | 28 |
| Public types | 16 | 12 |
| Torrent host wiring | 300 lines | 166 |
| The part of that which nothing checked | 112 lines | 17, all compiler-checked |
| A fresh host: four columns, one sortable, one selection handler | ~70 lines, two unchecked joins | **28 lines** |

### Deliberately not done

- **No dependency properties on `TableColumn`.** Eleven registrations to enable a binding mode that
  changes nothing: sortability is setup-only by design, and a localized `DisplayName` already works
  through `{StaticResource}`. Revisit when a consumer genuinely cannot resolve its header text before
  `Loaded`.
- **No per-column padding override.** No consumer needs a flush cell today. Revisit at the first
  column whose content must reach the edge.
- **Setup-only schema stays.** `Schema<TRow>()` makes the rule visible in the shape of the API instead
  of only in prose.
- **`Lucide` stays public**, and this is worth naming plainly: **a table control ships 1,651 public
  icon constants**, and every consumer inherits them. The fix is a shared icon library, which the
  no-dependencies rule forbids. Revisit when a project exists that can produce the size and footprint
  numbers that rule demands.

### The selected-row cue returns

**Settled by the owner: bring the cue back.** It was removed by an earlier ruling, leaving selection
shown only by the container's own Fluent fill, which measures **1.07:1 in Light and 1.17:1 in Dark**
against a §19 requirement of **3:1** for a non-text cue. `Themes/Generic.xaml` records the situation
in HEAD and states that the two contrast tests will fail — and they did, which is why the suite sat
at 198/200 rather than 200/200.

Constraints on whatever comes back, all from §19 and the design record:

- **Measured ≥3:1**, in Light, Dark and a contrast theme. Measured, not derived from a resource name —
  the project has been wrong about this before, and the 1.08:1 figure was itself a surprise.
- **No hard-coded colour anywhere**, and **no new control-specific resource**. Colour comes from the
  theme; §8 and §19 forbid the control defining brush resources, and the reason — token sprawl — has
  not changed.
- It must not reintroduce what the earlier ruling objected to. If restoring the accent bar cannot meet
  3:1 without doing so, that is a finding to report rather than a licence to substitute something the
  owner has not seen.

The two failing tests are the acceptance: they assert the 3:1 and must go green **without being
weakened**. A cue that passes because the test was relaxed is worse than the red test.

**Corrected by the work: "measured ≥3:1" is not a property the cue can hold.** The accent bar draws
from the platform's selection-indicator brush, which follows the user's accent colour, so its
contrast is whatever the user picked. Both tests are green here — 5.11:1 Light, 8.12:1 Dark on this
machine's default blue — but Windows ships Gold `#FFB900` as a standard swatch, which lands near
2.03:1 in Light. The same code passes on one machine and fails on another. The constraint as written
assumed a single measurement settles the requirement; it does not, and no cue that takes its colour
from the accent can. This is one of the two decisions waiting on the owner — `handoff.md` states the
three options.

### One finding this raised, and what I am doing about it

**`SortSettleInterval` does not keep §9's promise.** §9 says *"while a sort is applied, the view
converges on the sorted order within a bounded interval"*. `ScheduleSettle` is called only on the
held-order branch (`TableView.Sorting.cs:196`), so once an order is taken no timer is pending, and a
table sorted by a continuously-changing field never re-sorts until the source publishes again.

The proposed fix is a timer that keeps running while a sort is active, costing one sort per interval
on an idle table. **I am not taking it, and the reason should be visible rather than silent.** Our
feed re-evaluates the order every tick anyway, so the defect cannot show in this application, and
adding a permanent idle timer for a case we do not have is the sixth-owner mistake in miniature. It
is recorded as a finding against §9 so a future host that does *not* refresh has something to read.
If such a host appears, that is the requirement that forces the timer.

## The domain model

`CONTEXT.md` is the glossary and it needs four resolutions before any of this is typed, because three
of the new designs contradict it:

| Term | Resolution |
|---|---|
| **Schema** | The glossary says it is *all* setup-only configuration including columns; `Schema<TRow>()` carries the key selector, predicate and comparers but not the columns. Amend: Schema is the setup-only configuration, of which `Columns` is the declarative half and `Schema<TRow>()` the typed half. |
| **Row** | The glossary's word for one object from the source is **Item** (*"also: row item"*). So wire projections are `TorrentSummary`, `TorrentDetail`, `TorrentRef` — never `TorrentRow` — and the app's stable per-torrent object is `Torrent`. |
| **Snapshot** | The glossary has *source snapshot* and *layout snapshot*. Do not add a third: a decoded `torrent_get` reply is a list of `TorrentSummary` and needs no name. |
| **Session** | No type-name collision exists (the library has `SessionStats` and `SessionSettings`, no bare `Session`). The glossary defines **Session** as *the live connection to one daemon*; `session_get` is a protocol noun, not a domain term. |

New terms to add when the work starts. The three-process split introduced most of them, and they need
writing down precisely because "the app" is now ambiguous:

| Term | Meaning |
|---|---|
| **Tray** | The always-running C process. Owns the engine, the icon, the menu, and shell registration. |
| **Engine** | `transmission-daemon.exe`. Never called "the backend" — that word belongs to a tree we are not building. |
| **Interface** | The on-demand WinUI 3 process. Not "the app": the app is all three. |
| **Working** | Downloading or seeding. The state the client is in nearly all the time, and the state the memory goal is about. |
| **Tick** | One poll of the engine by the interface. Two seconds, and only while the interface is open. |
| **Delta** / **Sweep** | A `recently_active` poll, versus a full re-read of every torrent. |
| **Profile** | One connection: the local engine, or a remote daemon. |
| **Ghost** | A row shown before the engine has confirmed it. Display-only. |

## Reference — the protocol facts this is built on

Read from the vendored source, not the published spec, which has at least four errors.

| | |
|---|---|
| Methods | **24, and no others** — verified from the two dispatch maps at `rpcimpl.cc:2790-2820`, whose declared capacities are exactly 20 and 4. |
| Endpoint | POST only (405 otherwise). Default `/transmission/rpc`, but server-configurable via `rpc_url`, so it is a connection setting. |
| Auth | HTTP Basic. 401 on bad credentials. 403 for a non-whitelisted IP **and** for the brute-force lockout, which a good login cannot clear. |
| CSRF | 409 carries the correct session id; replay once. The id expires after an hour, so a 409 can arrive at any time. |
| `torrent_get` | 81 valid field names (`rpcimpl.cc:703-793`). Unknown names dropped silently; an empty resulting list is an error. |
| Deltas | `ids: "recently_active"` also returns a `removed` id array. "Recently active" means changed within 60 s, and `removedSince` filters removals to the same 60 s — it is not a durable record. |
| Batching | A top-level JSON array returns an array of responses. **No shipped Transmission client uses it.** |
| Identity | Numeric ids are **not stable across daemon restarts**; info hashes are. Mutations accept either; we always send hashes. |
| Units | Limits written are kB/s and the "k" is always 1000. Rates read are bytes/sec. `eta` uses −1 not available, −2 unknown. |
| Encodings | `pieces` is a base64 bitfield, MSB-first, and an **empty string while a magnet has no metainfo**. `peer_id` is base64 and the spec does not say so. `availability` uses −1 for "we already have this piece". |
| Spec errors | `source` and `downloaded_ever` missing or mangled from the `torrent-get` table; `location` documented on `torrent_set` but never read by the handler; `group_get`'s request filter key is `name`, not `group`; `anti_brute_force_threshold` settable but undocumented. |

### The three field sets

`torrent_get` has 81 fields. Fetching all of them every second is what makes a client feel heavy;
fetching too few makes it wrong. **Checked, not asserted:** I extracted the 81 accepted names from
`isSupportedTorrentGetField` and diffed them against these sets. Every name below is real, and the
diff is what surfaced `eta_idle` and `percent_complete`, which I had missed.

**Static** — once when a torrent is first seen, and again when `edit_date` changes:
`id`, `hash_string`, `name`, `added_date`, `total_size`, `piece_count`, `piece_size`, `download_dir`,
`is_private`, `file_count`, `primary_mime_type`, `trackers`, `comment`, `creator`, `date_created`,
`source`, `magnet_link`.

`trackers` is here rather than in the tick set because the sidebar's per-tracker filter needs each
torrent's `sitename`, and that does not change between edits.

**Tick** — every poll, for all torrents or the recently-active delta:
`id`, `status`, `queue_position`, `percent_done`, `size_when_done`, `left_until_done`,
`rate_download`, `rate_upload`, `peers_connected`, `peers_getting_from_us`, `peers_sending_to_us`,
`eta`, `upload_ratio`, `downloaded_ever`, `uploaded_ever`, `done_date`, `error`, `error_string`,
`is_finished`, `is_stalled`, `metadata_percent_complete`, `recheck_progress`, `labels`, `edit_date`.

`edit_date` earns its place by being the trigger that refetches the static set. `is_stalled` is in
Qt's model but no Qt field set ever requests it, so their UI reads it as permanently false.

**Detail** — the selected torrent only:
`files`, `file_stats`, `peers`, `peers_from`, `tracker_stats`, `pieces`, `webseeds`,
`webseeds_sending_to_us`, `bandwidth_priority`, `download_limit`, `download_limited`, `upload_limit`,
`upload_limited`, `honors_session_limits`, `seed_ratio_limit`, `seed_ratio_mode`, `seed_idle_limit`,
`seed_idle_mode`, `eta_idle`, `peer_limit`, `max_connected_peers`, `sequential_download`,
`sequential_download_from_piece`, `corrupt_ever`, `desired_available`, `have_unchecked`, `have_valid`,
`percent_complete`, `seconds_downloading`, `seconds_seeding`, `start_date`, `activity_date`,
`tracker_list`, `torrent_file`. Plus **`availability` only while the Pieces tab is visible.**

`percent_done` and `percent_complete` are both here on purpose and are not the same number: *done* is
progress toward the files you asked for, *complete* is progress toward the whole torrent. With
unwanted files they differ, and a user who sees only one cannot tell why "100%" is still downloading.

Not requested, and the reason belongs beside the sets so nobody re-adds them: `manual_announce_time`
(deprecated, documented as never having worked, and requested by Qt anyway), `group` (no UI), and
`priorities`, `wanted` and `bytes_completed` — the
parallel-array forms of exactly what `file_stats` returns as objects, where the array form
additionally changed representation between 4.0 and 4.1.

**`webseeds_ex` is out of the detail set, because it does not exist on the daemon we target.** Stage
1B requested all 75 fields against a live 4.1.1 daemon and it was **the only one dropped** — which is
exactly the silent-drop behaviour this design anticipated, caught by the very mechanism built to
catch it. 4.1 answers `webseeds`, a plain URL array. Both halves of what this plan previously said
were therefore wrong for our target: `webseeds_ex` is unavailable, and `webseeds` is not deprecated
*yet*. That swap happens in the 4.2.0-dev tree.

### Preferences, grouped

Every key we expose has a home. Groups are ours; keys are the daemon's.

| Group | Keys |
|---|---|
| General | `download_dir`, `incomplete_dir(_enabled)`, `rename_partial_files`, `start_added_torrents`, `trash_original_torrent_files` |
| Connection | `peer_port`, `peer_port_random_on_start`, `port_forwarding_enabled`, `port_test` action, `encryption`, `pex_enabled`, `dht_enabled`, `lpd_enabled` |
| Bandwidth | `speed_limit_down(_enabled)`, `speed_limit_up(_enabled)`, `alt_speed_down`, `alt_speed_up`, `alt_speed_enabled`, `alt_speed_time_enabled/_begin/_end/_day`, `peer_limit_global`, `peer_limit_per_torrent` |
| Queueing | `download_queue_enabled/_size`, `seed_queue_enabled/_size`, `queue_stalled_enabled/_minutes`, `seed_ratio_limit(ed)`, `idle_seeding_limit(_enabled)` |
| Advanced | `blocklist_enabled`, `blocklist_url`, `blocklist_update` action, read-only `blocklist_size`, `sequential_download` |


**Not everything in `settings.json` is reachable over RPC**, and the difference is not documented
anywhere — it is the difference between two tables in the source. I extracted the session accessor
map: **56 explicit keys plus 8 added in a loop for the script hooks, which is exactly the 64-entry cap
the map declares.** Everything outside that list is file-only, including all `rpc_*` keys,
`bind_address_ipv4/6`, `announce_ip(_enabled)` and `blocklist_updates_enabled`. For our bundled
daemon those can still be written to the file and applied on restart; for a remote profile they cannot
be offered at all.

Read-only, get but never set: `blocklist_size`, `config_dir`, `download_dir_free_space` (deprecated —
use `free_space`), `rpc_version*`, `session_id`, `tcp_enabled`, `units`, `version`.

### Commands, and where each surfaces

| Capability | RPC | Surface |
|---|---|---|
| Start / start now / stop | `torrent_start`, `torrent_start_now`, `torrent_stop` | Row menu, toolbar, tray, multi-select |
| Verify | `torrent_verify` | Row menu |
| Reannounce | `torrent_reannounce` | Row menu, Trackers tab |
| Remove, remove with data | `torrent_remove` (`delete_local_data`) | Row menu, toolbar, one confirmation |
| Add by file, magnet or URL | `torrent_add` | Add dialog, drag-drop, file association |
| Duplicate on add | `torrent_add` → `torrent_duplicate` | The dialog says so instead of appearing to succeed |
| Move data | `torrent_set_location` (`move`) | Row menu, General tab |
| Rename file or folder | `torrent_rename_path` | Files tree |
| Queue top / up / down / bottom | `queue_move_*` | Row menu, keyboard |
| Queue drag to any position | `torrent_set` (`queue_position`) | Row drag |
| File wanted and priority | `torrent_set` | Files tree |
| Per-torrent limits, ratio, idle | `torrent_set` | Options in the General tab — **the old frontend only displayed these, and had no ratio or idle control at all** |
| Bandwidth priority, peer limit, sequential | `torrent_set` | Row menu and General tab |
| Labels | `torrent_set` (`labels`) | Row menu, sidebar filter — **no prior implementation to copy** |
| Tracker list | `torrent_set` (`tracker_list`) | Trackers tab. Not the deprecated `tracker_add/remove/replace` |
| Session settings | `session_get` / `session_set` | Preferences |
| Alt speed and schedule | `session_set` | Status-bar toggle, tray, preferences |
| Session statistics | `session_stats` | Status bar |
| Free space | `free_space` | Add dialog, set-location, status bar |
| Blocklist update | `blocklist_update` | Preferences, with the 300 s timeout it needs |
| Port test | `port_test` | Preferences, IPv4 and IPv6 |
| Shut the daemon down | `session_close` | Exit path and the tray menu |

**`torrent_add` accepts** `filename` or `metainfo`, plus `download_dir`, `paused`, `labels`,
`peer_limit`, `bandwidth_priority`, `files_wanted`, `files_unwanted`, `priority_high/low/normal`,
`sequential_download`, `sequential_download_from_piece` and `cookies`. Two consequences: `cookies` is
what makes adding from a private tracker's URL work; and **`group` is not accepted on add**, though we
have no group UI anyway.

## Things that will bite

Each is a fact I checked, not a worry.

**A live sort goes stale unless the host asks for it.** `INotifyPropertyChanged` redraws cells and
nothing more. The fake catalog gets away with never calling `Refresh()` because torrents finish often
enough to force a republish; a real feed keeps everything running. Handled by the flags mask above.

**Numeric torrent ids die with the daemon process.** Key everything on `hash_string` — already what
the row model holds. Numeric ids are still what `removed` returns, so the cache must resolve id→hash.

**The session id expires after an hour**, so the 409 handshake is not a start-up step.

**`pieces` is an empty string while a magnet is still resolving.** Decode after checking.

**A JSON-RPC error usually carries no `data`.** `Error::build_data` (`rpcimpl.cc:104-117`) emplaces
`error_string` only when a handler supplied one, and most do not. All three failed-`torrent_add`
modes answer `{"code":4,"message":"unrecognized info"}` — no `data`, at **HTTP 200**. Handle both
shapes; a decoder that assumes `data` is present fails on the common case.

**`X-Transmission-Rpc-Version` is the RPC semver, not the daemon version.** On 4.1.1 it reads
`6.0.1`. Gating on the header's **presence** — which is what the design does — is right; gating on
its value would have been wrong, and the mistake would not show until an older daemon appeared.

**The 300-second `blocklist_update` timeout is what bounds the 409 retry derivation**, not the 60 s
default. The bound is unchanged — 300 s still fits inside one 3600 s session-id rotation, so at most
one rotation can occur within a request's lifetime — but the reasoning has to cite the longest
request, not the typical one.

**The UI has no package identity.** `ApplicationData.Current` throws;
`Microsoft.Windows.Storage.ApplicationData.GetForUnpackaged` is the replacement. This is settled
rather than open, but it is the kind of thing that produces a confusing first crash if forgotten.

**Framework-dependent means the Windows App Runtime must be present.** The UI is unpackaged and uses
the bootstrap initializer, so a machine without the runtime fails before `Main` with
`REGDB_E_CLASSNOTREG` — the same failure the csproj comment already records for a different cause.
The installer checks for it and fetches it; the tray should also fail gracefully rather than
launching a UI that dies silently.

**Three things a native tray gets wrong if nobody says them.** The icon disappears when Explorer
restarts unless `TaskbarCreated` is registered and handled. A Win32 popup menu does **not** follow
dark mode on its own — it needs the undocumented `SetPreferredAppMode`, or owner-draw, and without
either it is a white menu on a dark desktop. And the tray must run **non-elevated**: started elevated
by an installer it will not accept drag-and-drop from Explorer and will look broken for a reason
nobody guesses.

**The vendored source and the installed daemon are different versions.** `3rdParty/transmission` is
4.2.0-dev; the installed binary is 4.1.1. Read the source for protocol truth, test against the
binary, and do not assume a field documented in the vendored tree exists on 4.1.1.

## Verification

A complete local rig already exists: `C:\Program Files\Transmission` holds `transmission-daemon`,
`-remote`, `-create`, `-show` and `-edit`, all 4.1.1. Nothing needs the internet.

**1. Protocol, without a daemon.** A fake `HttpMessageHandler` replays recorded responses — the
envelope, the 409 replay and its retry cap, status-code mapping, sentinel and unit normalisation, the
base64 piece bitfield, the mixed bool/int `wanted` array. Plain `net10.0`, headless, runs on every
build.

**1b. Fixtures, captured once.** `transmission-remote --debug` prints request and response JSON.
Capture one `torrent_get`, one `session_get`, one `session_stats`, one `free_space` and one failed
`torrent_add`, and commit them. Decoding is then tested against what the daemon actually sends rather
than what the spec says it sends.

**2. Every method, against a real daemon.** `transmission-daemon --config-dir <temp> -p 9199 -f` on
loopback; drive all 24 and cross-check against `transmission-remote -p 9199`.

**3. Real transfer data.** `transmission-create` makes a torrent from a local file; a second daemon
instance on the same host seeds it and the two find each other over Local Peer Discovery. That
produces genuine progress, peers, pieces and file statistics — the fields a fake cannot exercise
honestly.

**4. Lifecycle, from the tray.** Kill the tray while the daemon runs and confirm the next launch
adopts it *and* refuses to adopt the user's own Transmission, which differs only by `config_dir`.
Confirm `session_close` writes `.resume` files by restarting and checking nothing re-verifies.
Confirm a crashed daemon restarts once and then reports. Confirm the uninstaller stops the daemon
before deleting its executable.

**5. The whole thing.** A magnet link clicked in a browser downloading with **no UI process ever
started** — that is stage 1C's acceptance, and it is the north star made checkable. Then with the UI
open: rows arriving, speed moving, a sort staying converged, selection surviving a poll, a queue drag
reconciling, a connection drop and recovery — and closing the window leaving the torrent running with
the UI process gone from Task Manager.

## What could not be verified

Written before stage 0, when everything about the protocol had been read from source and nothing had
been tested against a running daemon. Two entries have since been settled and are marked; the rest
still stand. `handoff.md` carries the current verification state, which is broader than this list.

- ~~**The field set of the installed 4.1.1 daemon.**~~ **Resolved at stage 1B.** All 75 requested
  fields were driven against a live 4.1.1 daemon; `webseeds_ex` was the only one dropped. The field
  sets above are now correct for our target rather than assumed.
- **Whether `JsonIgnoreCondition.WhenWritingDefault` treats a `readonly record struct` the way the
  `TorrentIds.All` design assumes.** Covered by a test at step 5 of the transport build.
- ~~**Whether a 2,000-row sweep merge fits in one frame.**~~ **Resolved at stage 3**, where the plan
  put it, and it passes with room: **~4 ms Debug, ~2.2 ms Release** for 2,000 rows. No architectural
  change is needed, so stage 4 can be built on the assumption stage 3 made.
- **The gzip-on-loopback trade-off.** Both branches are safe; the measurement that settles it is
  `Content-Length` with and without `Accept-Encoding`.
- **§18 layout persistence remains unproven**, as it is today. No host in the repository has ever
  stored or restored a `TableLayoutState`. Stage 4 is the first thing that will round-trip one across
  a restart. Until then its defensive-restore rules are untested prose, and that is the largest
  unverified area in the control's contract.
- **The aggregation reading.** Stated, not settled — that unmodified binary plus documented network
  protocol is aggregation rather than a combined work. Separate from the GPLv3 election, which the
  owner has settled; confirm the aggregation reading before release.

## Out of scope

- **Nothing is deleted from git.** `backend/`, `frontend/`, `win/` and root `docs/` stay for
  reference, as do the two stale duplicate files at `winui3/` root.
- **The repository root's `docs/Fluent 2 design and review standard for WinUI 3.md` must survive**
  any future clearing of that folder — it is the visual authority for this work.
- **No NuGet packaging of `Synapse`.** Reuse in another project works through a project reference; a
  package is a separate decision with its own versioning and CI cost.
- **No auto-update.** The installer replaces the app; the bundled daemon updates with it.
