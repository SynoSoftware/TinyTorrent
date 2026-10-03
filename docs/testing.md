# Testing that earns its cost

The default feedback loop for a small edit should take seconds, not a five-minute
suite followed by another five-minute suite. Choose evidence for the failure the
change could cause. Neither a test per change nor a full run per task is required.
This policy owns test scope across TinyTorrent; local instructions still govern
build entry points and permission to launch desktop applications.

## The everyday loop

Start with source reasoning, compiler guarantees, and existing coverage. Run the
smallest relevant existing check, using its native filter where available. Build
only the affected target through the repository's supported workflow when a
compile check is needed. Reuse valid build outputs; never test stale binaries.
Documentation and screen-copy edits do not justify an application build or suite.

Aim for seconds for routine checks. If the only available check takes five
minutes, decide whether this edit needs the evidence it provides. A focused
review or an authorized, narrow manual check can be sufficient for a low-risk
change. State what remains unverified. Do not build a new test framework merely
to avoid one slow run, and do not skip essential data-integrity evidence to meet
an arbitrary time budget.

Run a slower integration check after related edits have settled when the risk
actually crosses that boundary. Rerun it if a subsequent change affects what it
proved or a failure requires another attempt. Do not rerun unchanged checks just
because another agent reviewed the work or a small unrelated edit followed.
Coordinate one run and share its result.

A full suite is a deliberate integration or release check, or an explicit user
request. It is not the default completion gate for each bug fix. A known relevant
failure still needs resolution; postponing broad coverage does not excuse it.

## When a new test is worth maintaining

Add a test when it protects a specific, consequential failure that the compiler,
existing checks, and platform guarantees do not already catch. Explain the
failure and observable consequence in one sentence. Prefer one focused case at
the cheapest convincing boundary, adding cases only for materially different
failure modes. Test behavior through the natural owner rather than introducing
public interfaces, mock layers, or parallel implementations solely for tests.

The highest-value candidates in this architecture are persisted state surviving
restart, a destructive action affecting only its intended torrent/files, ordered
writes not resurrecting removed state, and safe handling of malformed or
interrupted IPC. A small set of shared byte fixtures can check the C++/C# wire
contract without generating a test for every field or enum. Select these checks
when implementing or changing the relevant behavior; this is not a mandatory
suite to rerun for every edit.

Do not test screen strings, labels, wording, XAML/source text, or screenshots as
unit-test contracts. Do not mirror implementation details with tests for each
getter, pass-through mapping, or framework behavior. Review presentation as
presentation. A focused interaction check can be worthwhile for an actual
behavioral defect, such as acting on the wrong selection; asserting the button's
caption does not prove that behavior. Exact bytes or strings are appropriate
when they are an external data contract rather than presentation copy.

Keep useful regression tests stable across internal refactors. When a test
fails, determine whether production behavior is wrong, the intended contract
changed, or the test protects no useful contract. Repair or remove it for that
reason, not simply to obtain a green run. Use deterministic inputs and bounded
waits for observable completion; avoid arbitrary sleeps and retries that conceal
failures.

## Windows evidence

Use this machine and the targeted checks described in the
[architecture](desktop-architecture.md#proportionate-validation-on-this-machine).
Lifecycle behavior needs a real process check when it changes; a cache-policy
or hot-path change may need a short comparable workload. Cosmetic changes do not
inherit those costs. Respect the local restriction on launching WinUI tests or
samples; this policy does not grant permission to interrupt the desktop.

Report the relevant checks performed, their outcome, and any material gap.
Distinguish source review, compilation, automated behavior checks, and manual
observation. None should be described as stronger evidence than it provides.
