# TinyTorrent — handover

**Current direction, 2026-10-03:** [Desktop architecture](../../docs/desktop-architecture.md),
[localisation](../../docs/localisation.md), and [testing](../../docs/testing.md)
govern the new local-libtorrent product. Implementation is paused. Runtime and
release decisions below belong to the historical Transmission client; use them
as evidence, not instructions to preserve its architecture or features.

Historical delivery work, 2026-09-13, is tracked in `delivery-validation.md`. The accepted
interface proposal and its review gates are in `design-review.md`. Read those records
before the historical notes below. Desktop verification is stopped by the user; source
and build work must not be described as visual or usability acceptance.

Where the work stands, what is waiting on the owner, and the things that cost time to learn. Written
because the owner is pausing; read it before starting, then consult it.

It carries only what the repository cannot tell you. The historical design is in `tinytorrent-plan.md`, what was
built is in `git log`, and what the table must do is in `torrent-table-specs.md`.

## Which document is which

| Document | What it is |
|---|---|
| `../../docs/desktop-architecture.md` | Current runtime, product scope, ownership, and migration authority. |
| `tinytorrent-plan.md` | Historical three-process Transmission plan and implementation rationale; current scope takes precedence. |
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
| 2 drive all 24 RPC methods against a live daemon | Passed against isolated Transmission 4.1.1; connectivity limits in delivery validation |
| 4 UI shell | Implemented; revised design integration and desktop acceptance pending |
| 5 inspector, including the Pieces map | Six views implemented; source corrections reviewed, desktop acceptance pending |
| 6 dialogs, preferences, connection profiles | Revised native controls and recovery passed source review/Release build; desktop acceptance and TOFU remain open |
| 7 Inno Setup installer | **Not started** |

Stages 4–6 now have production implementations. They have not passed the owner's
requested final interface test. Release staging is being verified separately; it is
not an installer or a clean-machine acceptance result.

**Stage 3 shipped ahead of stage 2, out of the planned order.** The session layer was built against
fakes rather than against a daemon that stage 2 would have driven first. That is why the transport is
the least-proven committed piece — see *What is verified* below.

## Waiting on the owner

Both are settled enough to work around and neither can be closed by an engineer.

### Selection contrast requires rendered verification

The 2026-10-02 fix/polish iteration resolves the earlier accent choice by keeping the
single selected-row bar and using the platform `ListViewItemForegroundSelected`
brush. Light/Dark resolve to primary text; High Contrast resolves to system
highlight text. The selection bar is now neutral rather than accent-coloured,
without an additional cue or a new resource key.

The previous accent bar measured 5.11:1 Light and 8.12:1 Dark with this machine's
blue accent, but standard Gold landed near 2.03:1 in Light. Those measurements
describe the replaced implementation. The new brush removes that accent
dependency; it does not establish rendered compliance. `RowCueContrastTests`
includes a low-contrast accent override and remains unrun during this iteration,
along with actual Light/Dark/High Contrast and touch/keyboard acceptance.

### The GPLv3 election

**Settled by the owner: elect GPLv3 terms for the redistributed Transmission binary**, so a pinned
source link is sufficient. GPLv2 §3 alone would not allow that — it offers only accompanying source,
a three-year written offer, or passing along an offer received. The link route is GPLv3 §6(d), and
Transmission is GPLv2-or-later, so the election is available.

The staged candidate now carries the licence, election and source record for the tested
Transmission 4.1.1 bytes; see `../LICENSES/transmission-4.1.1.md` for the exact evidence
and remaining provenance limits. Stage 7's installer and clean-machine verification
remain open. This candidate is not a distribution-readiness claim.

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

`src/Synapse/` is the sole table implementation. The divergent, uncompiled copies of
`TableCellsPanel.cs` and `TableRowVisual.cs` formerly at the `winui3/` root were removed
during the 2026-10-02 review.

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
