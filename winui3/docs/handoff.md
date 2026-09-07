# TinyTorrent — handover

Where the work stands, what is waiting on the owner, and the things that cost time to learn. Written
because the owner is pausing; read it before starting, then consult it.

It carries only what the repository cannot tell you. The design is in `tinytorrent-plan.md`, what was
built is in `git log`, and what the table must do is in `torrent-table-specs.md`.

## Which document is which

| Document | What it is |
|---|---|
| `tinytorrent-plan.md` | The approved plan for the whole client — three processes, the transport, the session, the tray, the table API. **The design of record.** Describes work that is already built as if it were future; that is expected. |
| `torrent-table-specs.md` | The table's normative specification. Sections 1–20 and Appendix B bind; Appendix A is reference, and A.1 is the torrent host's column profile. |
| `tableview-winui3-design.md` | How the specification is built in WinUI 3. The specification wins where they differ; that document says so itself. |
| `tableview-implementation-plan.md` | The table control's own build order, from before the client work started. |
| `../AGENTS.md` | How to work here, with the cost of each rule named. Read before writing code. |
| `../CONTEXT.md` | The glossary. Project nouns come from here. |
| `../../docs/Fluent 2 design and review standard for WinUI 3.md` | The visual authority. **Repository root `docs/`, not this folder.** |
| `proof/` | Evidence from a 2026-09-03 run of the table control. Historical. |

## Where the work is

Stages are the ones named in `tinytorrent-plan.md`; that document says what each contains.

| Stage | State |
|---|---|
| 0 projects, 1A table API, 1B transport, 1C tray | Committed in `3ea4363` |
| 3 session layer | Committed in `bff687a`, together with the selection cue, the demo harness and the column guard |
| 2 drive all 24 RPC methods against a live daemon | **Not started** |
| 4 UI shell | **Not started** |
| 5 inspector, including the Pieces map | **Not started** |
| 6 dialogs, preferences, connection profiles | **Not started** |
| 7 Inno Setup installer | **Not started** |

**Stages 4 to 6 are the bulk of what remains.** Everything committed so far is plumbing beneath them:
a table control, a protocol library, a session that merges ticks, and a tray. There is no window, no
inspector and no dialog. Judge remaining effort by that, not by the number of stages left.

**Stage 3 shipped ahead of stage 2, out of the planned order.** The session layer was built against
fakes rather than against a daemon that stage 2 would have driven first. That is why the transport is
the least-proven committed piece — see *What is verified* below.

## Waiting on the owner

Both are settled enough to work around and neither can be closed by an engineer.

### The accent bar's contrast is unbounded

The selected-row cue is an accent bar. It draws from the platform's selection-indicator brush, which
follows the user's accent colour. So its contrast is whatever the user picked, and no measurement
taken here holds anywhere else.

Measured on this machine's default blue: **5.11:1 Light, 8.12:1 Dark**, against the §19 requirement
of 3:1 for a non-text cue. Windows ships Gold `#FFB900` as a standard swatch, which lands near
**2.03:1 in Light**. So `RowCueContrastTests` passes here and would fail on a machine set to Gold.
Same code, different result.

Three options were put to the owner:

1. Accept that the cue is accent-dependent, and scope the test to the default palette.
2. Make the cue accent-independent, and lose the accent identity the owner asked for.
3. Keep the bar, and add a second cue that carries the 3:1 on its own.

`tinytorrent-plan.md` records the constraint this disproved: "measured ≥3:1" is not a property any
accent-derived cue can hold.

### The GPLv3 election

**Settled by the owner: elect GPLv3 terms for the redistributed Transmission binary**, so a pinned
source link is sufficient. GPLv2 §3 alone would not allow that — it offers only accompanying source,
a three-year written offer, or passing along an offer received. The link route is GPLv3 §6(d), and
Transmission is GPLv2-or-later, so the election is available.

Nothing acts on it yet. The installer that must carry `LICENSES\transmission-COPYING.txt`, the
statement of election and the version-pinned source link is stage 7, which does not exist. The
separate question of whether shipping an unmodified binary spoken to over a documented protocol is
aggregation rather than a combined work is still open, and is the owner's to confirm before release.

## Traps

Each of these cost real time, and none is discoverable before you hit it.

### One MSBuild builds everything, and it is not the obvious one

```
"C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\amd64\MSBuild.exe" ^
    winui3\Synapse.slnx -p:Configuration=Debug -p:Platform=x64
```

Three-way trap, all three verified:

- **`dotnet build` cannot host `Tray.vcxproj` at all.** It dies on `MSB4278` for
  `Microsoft.Cpp.Default.props`. Pointing it at the installed toolset gets past that and then fails
  inside the C++ tasks, which need the .NET-Framework-hosted MSBuild.
- **The default 32-bit `MSBuild.exe` fails the WinUI projects** with `NETSDK1032: The
  RuntimeIdentifier platform 'win-x86' and the PlatformTarget 'x64' must be compatible`. The csproj
  infers its RID from `RuntimeInformation.ProcessArchitecture` — the *build process's* architecture —
  so a 32-bit MSBuild infers `win-x86` while `Platform=x64` sets `PlatformTarget=x64`.
- **The x64 MSBuild agrees with itself** and builds every project in `Synapse.slnx`, tray included.

### Every daemon command carries an explicit, verified port

**Port 9091 is the owner's own Transmission service.** Connecting to it acts on the owner's live
torrents. It has been stopped once already, by an empty shell variable that let
`transmission-remote "127.0.0.1:"` fall back to the default port.

So: put a real port in the string, check the variable is non-empty before the command runs, and pick
a port you started yourself. The plan's own rig uses 9199.

### The real table sources are under `src/Synapse/`

`winui3/TableCellsPanel.cs` and `winui3/TableRowVisual.cs` **at the repository root** are stale
uncompiled duplicates whose contents differ from the real files. No project builds them. They exist
only because nothing has deleted them, and they will mislead a grep. Take `src/Synapse/` as the
source and disregard a hit in either root file.

### Two suites are cheap; one takes the machine

- `Transmission.Tests` and `TinyTorrent.Tests` are plain `net10.0` and headless. Run them freely.
- `Synapse.Tests` is a packaged WinUI application. It opens a real window, takes the foreground for
  roughly **24 seconds per run**, and does that to whoever is sitting at the machine. It is run once,
  deliberately, by whoever is coordinating. `../AGENTS.md` sets the rule and names what it cost.

### ARM64 is declared everywhere and cannot be built here

Every project declares ARM64 in `Synapse.slnx`, and the tray fails with `MSB8020: The build tools for
v145 cannot be found`. The MSVC ARM64 *libraries* are installed; the *cross-compiler* is not. Two
ways out: install the **"MSVC v145 ARM64/ARM64EC build tools"** Visual Studio component, or drop
ARM64 from the platform list, since nothing ships it. Do not read the declared platform as evidence
that anyone has built it.

### `TinyTorrent.Core` exists because of target frameworks, not XAML

A plain `net10.0` test project **cannot reference** a `net10.0-windows10.0.26100.0` one — the
platform-specific framework is not assignable to the general one. The plan first said the session
layer could live in `TinyTorrent.Ui` "once the row is XAML-free". Being XAML-free was necessary and
not sufficient; the target framework decided it. So `Session`, the cache, the merge, the queue
arithmetic, the optimism and the formatters live in `src/TinyTorrent.Core`, and `TinyTorrent.Ui`
holds pages, templates and renderers.

### This machine is memory-constrained

Parallel solution builds collide over locked intermediate files, and running agents concurrently made
it swap. Work serially, build incrementally, pass `-nodeReuse:false`, and leave `-m` off.

## The ETA column nobody could explain

**Record this; do not spend time resolving it.** It is written down so that if it happens again the
second sighting is cheap.

`TinyTorrent.Ui` was once seen rendering seven columns — Name, Progress, Status, Queue, **ETA**,
Speed, Peers. That is the first seven columns in *declared* order. Appendix A.1 requires the first
run to show Name, Progress, Status, Queue, Speed, Peers, **Size**; ETA is declared fifth and
`IsVisible="False"`.

What is established: the source is provably correct, no committed build has ever shown ETA by
default, and neither the author nor two reviewers could construct a runtime path in which `IsVisible`
is ignored. The likeliest cause is a stale `Synapse.dll` — a hand-built project picking up an older
binary while an agent was editing `src/Synapse`.

**The diagnostic, if it recurs: look for a horizontal scroll bar.**

| What you would be seeing | Columns | Total width |
|---|---:|---:|
| `IsVisible` ignored entirely | 11 | 1,338 DIP |
| The seven that were seen | 7 | 938 DIP |
| The seven Appendix A.1 requires | 7 | 928 DIP |

The two seven-column cases differ by 10 DIP and no eye can separate them. Eleven columns overflow any
normal window and put a horizontal scroll bar on screen. So a scroll bar means `IsVisible` was
dropped wholesale; no scroll bar means something chose seven columns and the question is which seven.
One look settles it.

`TinyTorrent.Tests/ColumnProfileTests` now parses the shipping `TorrentPage.xaml` and asserts the
eleven declarations against Appendix A.1. It guards the declaration, which is the part that can be
edited. It cannot see a build that ignores what was declared.

## What is verified, and what is not

### Verified

- **All three suites green** at the last full run: `Synapse.Tests` 200, `TinyTorrent.Tests` 48,
  `Transmission.Tests` 78.
- **A real transfer through the session layer**, between two daemon instances on this host finding
  each other over Local Peer Discovery, with matching file hashes at the end. A one-off run, not
  something a suite repeats.
- **The tray's daemon lifecycle**: it adopts an engine it started before, refuses to adopt the
  owner's own Transmission (which differs only by `config_dir`), and stops one cleanly on session end.
- **The 2,000-row merge fits in a frame**: ~4 ms Debug, ~2.2 ms Release. This was the assumption
  stage 3 was built on, and it holds.

### Not verified

- **No RPC method has made a real round trip through `RpcClient` against a live daemon.** Fixtures
  were captured from a live 4.1.1 daemon, so *decoding* is tested against what a daemon really sends
  — but the *request* path has only ever met a fake. `Transmission.Tests/FakeDaemon.cs` and
  `TinyTorrent.Tests/Daemon.cs` are both fakes; nothing in the three suites opens a socket. Stage 2
  is the work that closes this.
- **The interface has been rendered but never driven.** No interaction pass, no layout persistence
  round trip across a restart.
- **The tray's balloon has never been seen, and neither have its icon pixels.** The `NIF_INFO`
  balloon and the square icon set are written and unobserved.
- **ARM64, anywhere.** See the trap above.

## Specification figures that are historical

Several performance numbers in `torrent-table-specs.md` describe a reconcile implementation that no
longer exists, and one of them contradicted a normative bound in the same document — a per-publish
notification count of 2,158 on a list of 2,002 rows, where §20 requires a reorder's notifications to
be bounded by realized containers.

**They are marked in place, and the marking is deliberate.** Each says what it was measured against,
that it cannot be reproduced, and that it must not be quoted as current. They are kept so the origin
of the requirement stays readable. Leave them where they are: deleting them costs the requirement its
history, and re-quoting them as current states a number nobody can check.

The affected passages are §9's settle-interval discussion and §20's reorder bound. The harness that
produced the "after" half was deleted; its replacement,
`samples/Synapse.Sample/Demo/TableDemoPage.Diagnostics.cs`, runs a different feed with different
columns and reports its own numbers.
