# Desktop architecture review

Review of [Desktop architecture](desktop-architecture.md), 2026-10-03.
This records simulated stakeholder reviews, not real-user approval or runtime
validation. Implementation is paused until the design work is finished and the
user chooses to proceed.

## Requirements given independently to every pass

- Windows, local libtorrent only, with a C++ tray application that downloads.
- Maintainable ownership: one authority and implementation per responsibility.
- Lowest useful background memory; load no UI runtime while the UI is unused.
- Retain download performance and essential torrent behavior. A smaller file is
  not a reason to damage throughput, reliability, or interoperability.
- Keep only needed dependencies and product features. No search panel or other
  speculative feature expansion.
- Cache behavior is configurable through the UI, starts with a sensible default,
  and changes the native engine's effective behavior.
- Explain tradeoffs and reasons to reconsider decisions. A plan must yield to
  evidence rather than perpetuate a mistaken step.

## Independence and sequence

Each of the initial three passes uses a new reviewer context with no previous
conversation or review verdicts. Each receives the same requirements and source
access, derives a design first, then challenges the current architecture draft.
The coordinator revises the draft before starting the next pass. The revised
artifact is shared; earlier reviewers' reasoning and verdicts are not. Each pass
polishes the previous revision rather than discarding its useful decisions.

Review is adversarial: derive the minimum necessary responsibilities from the
requirements, then try to break the draft under realistic workload and failure.
Challenge the cost of every process, dependency, thread, state copy, and protocol
rule. Resolve a concrete objection or record its remaining risk; agreement does
not substitute for evidence. Reviewers may overturn an earlier design choice.

Within each pass the reviewer considers these roles in order: everyday
downloader, heavy seeder, memory-constrained laptop user, keyboard/accessibility
user, senior C++ engineer, senior WinUI engineer, runtime architect, and
maintainability/product architect. These are eight simulated perspectives, not
eight independently recruited people. Earlier exploratory reviews do not count.

| Pass | Fresh reviewer | Status |
| --- | --- | --- |
| 1 | `architecture_pass_one` | Complete; draft revised |
| 2 | `architecture_pass_two` | Complete; draft revised |
| 3 | `architecture_pass_three` | Complete; material clarifications applied; not a clean-pass verdict |

The user subsequently required review to continue until a full pass found no
major correctness, scope, or implementability issue. The convergence rounds below
retain the eight-role sequence. Astra's first round uses a fresh independent
context; subsequent rounds explicitly reuse reviewers and are not counted as
additional fresh-context reviews. A major finding must identify a concrete
failure or instruction conflict that prevents a correct, scoped implementation;
ordinary implementation detail and unmeasured runtime effects are recorded
separately. A revision following a major finding receives a full new pass, not
only a check that the cited paragraph changed.

## Pass 1 — establish behavior and ownership

The reviewer derived the native host plus disposable UI before reading the
draft, then raised these objections in the required role order:

| Perspective | Objection | Change in the next revision |
| --- | --- | --- |
| Everyday downloader | Duplicate metadata parsers and unclear preview/cancel semantics | Native libtorrent owns metadata; preview, direct add, duplicate, and activation outcomes are explicit. |
| Heavy seeder | All inspector data in one response can monopolize the pipe | Request visible sections only; bound collection and transfer without rejecting large valid torrents. |
| Laptop user | UI shutdown can leave native UI-only observation work alive | Stop/release that work with its consumers while retaining required engine activity. |
| Keyboard/accessibility user | Exit could stop the engine before Save or Cancel | Resolve drafts while the engine is usable; separate ordinary exit from Windows shutdown. |
| C++ engineer | Resume alerts and queued writes were confused with durability | Periodic checkpoints, ordered writes, stale-save prevention, explicit storage completion. |
| WinUI engineer | Background preferences still had two writers | Native application owns background behavior; WinUI owns presentation and drafts. |
| Runtime architect | A late reply after cancellation could be read as another result | Discard uncertain connections, refresh after reconnect, bound queues and explain data-directory ownership conflicts. |
| Product/maintainability architect | Existing code was being treated as a feature specification | Add a retained-capability floor and explicit scope exclusions; require legacy-instruction reconciliation before implementation. |

The review rejected extra event frameworks, process supervisors, generalized job
registries, and compatibility platforms as resolutions to these concerns.
Unproven: observation cost at scale, codec maintenance cost, actual memory and
throughput, shutdown durability, and activation/disconnect races. These remain
future runtime checks, not design-review passes.

Source checks included native Core, SessionService, ResumeDataService,
PersistenceManager, SnapshotBuilder, the native tray, WinUI lifecycle and
metainfo parsing, and the existing shared tray preferences. No code was changed.

The user added cache configurability after this pass's main review. The same
independent reviewer completed a supplement before pass 2. It required Automatic
to remain a saved policy, at least one effective manual choice, separate
requested/applied/saved state, safe Windows I/O combinations, and honest migration
of the obsolete MB setting. The architecture now includes those corrections.
The shipped libtorrent version/backend and concrete supported controls remain
unresolved at the end of pass 1; performance measurements remain unperformed.

## Pass 2 — attack lifecycle, scale, and cache assumptions

This fresh reviewer inspected source before the revised draft and did not read
the first review. It independently retained the two-process arrangement.

| Perspective | Objection | Change in the next revision |
| --- | --- | --- |
| Everyday downloader | UI crashes could abandon previews; duplicates can arrive during preview | Connection-owned previews, explicit activation handoff, and confirmation-time duplicate checks. |
| Heavy seeder | The old 20-byte identity cannot faithfully represent v2/hybrid torrents | Preserve full identities and aliases; migrate through libtorrent metadata/resume data. |
| Laptop user | The 2.0 cache explanation was incorrectly generalized to every 2.x disk backend | Select a version/backend and concrete policies; qualify the different pread cache implementation. |
| Keyboard/accessibility user | Replacing observations could reset selection and focus | Preserve interaction state by identity and define focus after removal. |
| C++ engineer | Stopping commands does not quiesce transfers or complete disk writes | Specify quiescence, resume/flush, storage completion, session join, and ownership-release order. |
| WinUI engineer | Request/reply alone cannot deliver tray Exit and activations | Small native control notifications on the same duplex pipe; Save remains possible during close coordination. |
| Runtime architect | A giant chunked response still monopolizes the one request slot | Bounded request/reply units yield to commands; coherent observation with bounded retention. |
| Product/maintainability architect | Periodic checkpoints could lose a confirmed add/remove | Structural changes require storage confirmation; transfer progress retains bounded checkpoint loss. |

The cache decision was sharpened rather than adopting an experimental backend
just to support a size slider. The draft now selects libtorrent 2.1.2 with the
Windows mmap implementation for validation and Automatic/Buffered/Write-through
policies. Automatic uses its reviewed write-through default; changes take effect
on native restart. The old ineffective MB field migrates honestly to Automatic.
The coordinator checked upstream source for the mapping; actual Windows effects
and performance remain unvalidated and are explicit proof obligations.

The reviewer also corrected an overly broad bug inference: the inspected resume
SQL uses UPDATE, so that statement alone does not recreate a deleted row. The
design retains the necessary cross-operation ordering rule without claiming that
specific SQL statement proves resurrection.

Inspected evidence included native settings, session/identity/resume/storage,
manifest and build definitions, WinUI lifecycle and stable row caching, plus
versioned upstream disk implementations. No implementation or tests were run.

## Pass 3 — challenge the revised contracts

The third reviewer started from requirements and selected source before reading
revision 2. It did not receive the previous verdicts or this record.

| Perspective | Objection or conclusion | Final disposition |
| --- | --- | --- |
| Everyday downloader | Preview cleanup conflicted with preserving drafts after reconnect | Preserve edits, reconcile uncertain confirmation, reacquire previews, and reject stale IDs. |
| Heavy seeder | Retaining settings labels can retain incorrect behavior | Verify real peer limits, pause/auto-management, and incoming seeding in release builds. |
| Laptop user | Mapped-write mode was unspecified; cache label implied too much | Fix always_mmap_write and name the preference Disk write caching. |
| Keyboard/accessibility user | Stable observations alone do not preserve navigation | Keep identity/focus contract; verify sorting, removal, reconnect, and dialogs without a patch framework. |
| C++ engineer | Complete-pending-work could make Exit wait hours | Operation-specific safe interruption and visible shutdown status; no arbitrary force-kill deadline. |
| WinUI engineer | Repeated Open could create competing UIs | One native launch reservation; verify races without another activation broker. |
| Runtime architect | Removed rows cannot report late failures; old pages can overwrite mutations | Bounded native deletion results survive UI reconnect; discard unfinished observations after mutations. |
| Product/maintainability architect | Internal distinctions could become a bloated settings UI | Keep requested/effective/saved distinctions internal; show a choice, restart indication, and useful errors. |

The material clarifications—preview reacquisition, explicit mapped-write mode,
and long-operation shutdown—are incorporated. Identity migration also preserves
records it cannot yet recover. None required another process, transport, storage
system, or caching layer.

## Practical validation, after the user's final correction

The user correctly challenged treating broad Windows performance validation as
a development gate when only one machine is available. The architecture now
uses upstream defaults and focused correctness checks during development, a
small local baseline once a representative path works, and targeted before/after
checks for cache, hot-path, lifecycle, or UI changes. Broader coverage belongs
near release or follows a concrete fault. No hardware lab or benchmark project
is required, and known correctness failures are never excused by that scope.

## Convergence round 1 — independent Astra and returning reviewer

`architecture_astra` used `gpt-6-astra` in a fresh context, without the previous
ledger or verdicts. `architecture_pass_three` independently reread the documents
in its existing context. Both completed the eight perspectives in sequence. Both
found zero major runtime-design issues, but the overall round was **not clean**:

| Major issue | Consequence | Document correction |
| --- | --- | --- |
| Competing architecture authorities | Mandatory HTTP/browser hosting, token routing, tray polling, and single-executable rules could preserve the machinery the target removes. Web-specific rules also ambiguously covered WinUI. | Root and native instructions point to the desktop architecture; displaced native rules and copied legacy manifest/layout prescriptions are removed; web and WinUI instructions have explicit scope. |
| Compulsory interface extraction | A small change could require new ports, stub adapters, and forwarding layers regardless of their value. | Native instructions judge actual ownership and benefit; extraction counts and compulsory stubs are removed. |
| Competing validation scope | Web instructions still required additional test/build work after behavior changes. | Web validation now defers to the shared testing policy. |

The returning reviewer identified the extraction issue as a separate major
blocker; Astra grouped these conflicts as one authority blocker. They are recorded
by substance rather than summed as independent bugs. Minor clarifications scope
generic Synapse control requirements to those controls and distinguish cosmetic
edits from changes that need responsiveness evidence. No process, protocol,
feature, dependency, or production implementation was added.

Astra corroborated the pinned Windows write-mode default from upstream settings
source. Retrieval of the storage/file sources failed in that pass, so it did not
independently reverify the full Windows flag mapping. Earlier source evidence is
retained; actual effects still require the targeted implementation-time check.

## Convergence round 2 — full clean passes

After the corrections, both reviewers reread the complete architecture, testing
policy, and root/native/WinUI/web instructions. Each repeated all eight roles in
order and checked for new defects, not only closure of the earlier findings.
They did not consult the other's conclusions or this ledger. Both reused their
own contexts in this round.

| Reviewer | Complete-pass verdict | Remaining major findings |
| --- | --- | --- |
| `architecture_astra` (`gpt-6-astra`) | Clean: correctness, scope, and implementability | None |
| `architecture_pass_three` (returning reviewer) | Clean: correctness, scope, and implementability | None |

Both found the ownership, scope, lifecycle, persistence, caching, and testing
contracts coherent. The authority conflicts and compulsory abstraction rules are
resolved, with no major regression introduced by their removal. Astra noted
optional shortening of historical narrative and legacy terminology; neither
reviewer required further changes for convergence. The requested stopping
criterion is met. More speculative protocol detail or features would not improve
this review outcome.

The round used document review only. Local link and changed-document whitespace
checks passed. No application code, build, runtime test, or desktop launch was
needed; the first Astra round's upstream source lookup was a narrow factual check.

## Localisation amendment — full clean review

After convergence, the user added complete `en.json`-based localisation and
immediate language switching. [The localisation requirements](localisation.md)
now own that contract; the architecture and root instructions point to them.
Existing web JSON, WinUI literals, and Synapse resources were inspected as
migration inputs. No catalogues or production implementation were created.

Both `architecture_astra` (`gpt-6-astra`) and `architecture_pass_three` reread the
amended plan with the architecture, testing policy, and affected instructions.
Each completed the eight perspectives in sequence in its own existing context,
without consulting the other's findings. Both returned **zero major correctness,
scope, or implementability issues**. No corrective round was required.

The review covered the single English source and generated native subset, native
language ownership, immediate binding refresh, preservation of drafts and numeric
input, fallback-language plural selection, region versus UI language, RTL and
accessibility, native tray updates, save failures, stale selection suppression,
and proportionate catalogue checks. Windows-owned surfaces retain platform
language behavior. Windows ICU availability was checked against Microsoft's
documentation; there was no build, application launch, or runtime test.

Actual switch latency, control/tray refresh, layout, and memory cost remain
implementation evidence. Review approval does not claim those have been measured.

## Impeccable plan audit — corrections confirmed

The user requested an impeccable audit adapted to Windows and application of its
findings. [The audit report](desktop-plan-audit.md) records the five dimensions,
existing evidence, and three P2 corrections: protect active IME composition,
restore windows against current display work areas/DPI, and clarify historical
WinUI authority while retiring unnecessary tray-menu theme hooks. No P0/P1 defect
was identified; these were documented requirement gaps, not reproduced code bugs.

All corrections are applied to their existing document owners. Astra completed
a full confirmation across the eight perspectives and found every P2 resolved,
with zero new or remaining major correctness, scope, or implementability issues.
Existing accessibility, theme, and virtualization contracts remain referenced.
No feature, runtime dependency, implementation, or new test suite was added.

## Additional adversarial pass — storage lifetime and live column text

At the user's request, Astra and the returning reviewer challenged the complete
plan again in their existing contexts. This round found a **P1 correctness gap**:
the original asynchronous file deletion could outlive torrent membership and
race with an addition or relocation reusing the same payload paths. The prior
rule against blindly retrying deletion did not protect against that original
operation. The coordinator and Astra both identified the scenario; it is one
finding, not two independent defects.

Libtorrent's [removal contract](https://www.libtorrent.org/reference-Session.html#remove-torrent())
allows immediate re-addition with a new handle while the old handle can still
have I/O work outstanding. This verifies the relevant lifecycle premise, not a
reproduction of data loss in TinyTorrent.

The architecture now keeps the affected storage claim at the native operation
owner until asynchronous deletion/relocation settles, checks conflicting active
use in both directions, and reports pending conflicts without stopping unrelated
work. Late events belong to the original torrent instance. This is an ownership
invariant, not a new scheduler, storage layer, or durable job registry. Its focused
implementation proof is removal followed by attempted conflicting reuse before
completion, plus a late old-instance event after safe re-addition.

The returning reviewer identified a second **P1 implementability conflict** in
the retained [table specification](../winui3/docs/torrent-table-specs.md): column
definitions, including `DisplayName`, were frozen at load and relied on a static
resource lookup. That prevented the required live translation of generated
headers, menus, and accessibility names without rebuilding controls.

The table specification now distinguishes immutable structural schema from live
localized presentation. Its existing owners update text in place while preserving
column instances, sort/layout state, focus, selection, and edits. The older table
implementation plan points to this exception. No runtime structural schema
changes or general localization framework are introduced.

The first pass was not clean. After both corrections, Astra and the returning
reviewer each completed another full eight-role pass across the architecture,
localisation/testing policies, applicable instructions, and retained component
contracts. Both found **zero major correctness, scope, or implementability
issues**, with neither requesting another substantive correction. The storage
and column-text findings are resolved at the plan level. Local-link and changed
document whitespace checks passed. No implementation, build, application launch,
or runtime test was performed.

## Outcome and limits

The user subsequently reaffirmed runtime memory as the highest optimisation
priority over executable/download size. The architecture and mission compass
now state that ordering explicitly. Existing targeted measurement covers active
downloads/seeding with WinUI closed, incremental UI cost, transient peaks, and
retained state after close. Shared runtime deployment is not counted as a proven
memory saving. This priority clarification does not change the two-process
architecture, require a new test suite, or supply a measured memory result.

The user clarified the timing: design from established memory-conscious
principles now, with measurement deferred to useful implementation milestones.
The architecture places one small native-path check before the remaining UI
work and a whole-app check once functionality is complete, with time for fixes
before release. Routine edits do not trigger profiling; a concrete regression
or a material resource-cost change can justify a focused earlier check.

The subsequent testing-policy review incorporated the user's Forge reference
(`../forge/server.tests/agents.md` and its shared `docs/agents/tests.md`) as ideas,
not a framework to copy. [Testing that earns its cost](testing.md) now owns the
policy: fast focused feedback, no screen-string or implementation-mirroring
tests, selective regression protection, and slow runs after related edits settle
only when their evidence is needed. Blanket backend full-suite completion rules
were replaced with this policy. This clarification is not a fourth independent
architecture pass, and no production implementation or runtime validation was
performed for it.

The initial three fresh-context adversarial passes, two convergence rounds,
localisation review, and impeccable audit/confirmation are recorded above. The
additional adversarial round found two P1 gaps in storage lifetime and live table
presentation. Both are corrected, and the latest complete passes by Astra and the
returning reviewer are clean. These verdicts are bounded review evidence, not
proof that no further issue can exist. Implementation remains paused until the
user chooses to proceed.

The decisions retained are one native C++ engine/tray process, disposable WinUI,
one local pipe, native settings/metadata/persistence authority, useful torrent
capabilities, effective write-cache policies with an Automatic default, and
catalogue-based live localisation without a resident UI dependency.
The custom codec must remain small in practice; the transport decision is not
permission to build a serialization framework.

Remaining evidence to gather proportionately during implementation includes
actual dependency/memory cost, Windows cache effects, throughput and command
latency, UI process exit, lifecycle races, interrupted storage operations,
identity migration, and keyboard/accessibility behavior. Unavailable hardware
is an explicit coverage limit, not an automatic block on development.

Legacy runtime instructions have been reconciled in the documents; the legacy
source has not been migrated. Documentation checks establish internal consistency
and working local links; they do not validate runtime behavior.

## Decisions made after these reviews

The owner made these decisions on 2026-10-03. No review pass above examined them.

- The program that stays in the tray is called the engine. It is a new project in
  `engine/`. `backend/` and `frontend/`, the earlier TypeScript version, are not touched.
- The engine keeps the acrylic splash window, which uses an undocumented call.
- The WinUI program is built as new projects beside the paused Transmission client.
- There will never be a macOS version.

In this record, "native process", "native application", and "native host" mean the
engine as a whole. "Native engine" means the part of it that owns libtorrent and saved
state.
