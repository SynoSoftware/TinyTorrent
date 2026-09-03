# How we build Synapse

Read this before writing code here. Every rule below earned its place by costing
us something, and the cost is named. Nothing goes in that has not.

## Why this project exists

It replaces a torrent table that grew to 27 files, 6,108 lines, over a thousand
design tokens, and twelve separate owners of one table's state. Nothing was
wrong with any single decision in it. It died of a thousand reasonable ones,
each made without reference to the others, until no change could be made in one
place.

So the goal is not "a table that works". It is a table that a person can still
change confidently a year from now. Every rule below serves that and nothing
else.

## Elegance is the requirement, not the finish

Elegance here means: **the smallest arrangement of parts that makes the
behaviour obvious.** Not the shortest code. Not the cleverest. Not the most
general.

The test is not "does it work" but "would a competent stranger predict what this
does before reading it, and be right?"

Three things follow.

**Write the obvious version.** If a plain loop and a well-named local read
clearly, use them. Compressing four lines into one expression that requires a
second read is a loss, not a gain. Density is not elegance; clarity is.

**No cleverness.** A trick that saves a line and costs a reader thirty seconds is
a bad trade every time it is read, forever. If you find yourself pleased with how
smart something is, that is the signal to replace it.

**No mechanical work.** Do not pattern-match a solution onto a requirement you
have not understood. If a rule in the specification seems arbitrary, find out
why it is there before implementing it — the reason usually constrains the
implementation more than the rule does. If there is no reason, say so; that is a
finding worth more than the code.

## Intent belongs in the code, not beside it

This is how the elegant code gets written: the names and the shape carry the
intent. A method called `ClampOffsetToExtent`, a local called
`firstUnclippedColumn`, a guard that returns early on the one case it exists for
— none of these need a comment, because the reader already knows why they are
there.

So the first move is never "add a comment explaining this". It is: **can the
code say it?** Rename the thing. Split the method so each half has one job. Pull
the condition into a named local. Nine times in ten the comment you were about
to write is a name you have not chosen yet, and choosing it fixes the code as
well as the reader.

A comment is what is left over — the part the code genuinely cannot say:

- a defect in something we do not own, and how it shows up here
- what breaks if this is changed, when the breakage appears somewhere else
- a measured number, so nobody re-derives or re-argues it
- why the obvious alternative was rejected, when it still looks better

Never a restatement of the line below it. That is not explanation; it is a
second copy of the code that can go out of date.

The `Directory.Build.props` at the root is the model, and it sits at the limit —
eleven lines of XML, fifteen of explanation. It earns them because the reason is
entirely outside the file: a compiler defect, and a failure that appears a week
later somewhere that looks unrelated. No naming could have carried that. Almost
nothing else here will earn that ratio.

### A why that can be proved wrong

A written reason is safer than an unwritten one. An unwritten reason cannot be
argued with — the next person assumes somebody had a purpose and leaves it there
forever. A written one can be read, tested, and deleted. That is its whole value,
and it only works if the reason is **checkable**.

- **Checkable.** "Measured 1.08:1 against a 3:1 requirement." "Remove this and a
  repeated build deepens `bin/**/bin-fl`." Each names how to find out it is wrong.
- **Not checkable.** "Cleaner." "For performance." "Safer this way." Nothing to
  test, so nobody ever removes them, and the code underneath becomes permanent by
  accident. If you cannot say what would prove a reason wrong, you do not have one
  yet — say that instead.

A comment is part of the line it explains. Change the line, change or delete the
comment in the same edit.

### The why binds in both directions

Writing the reason is the easy half. The half that gets missed: **before obeying a
rule, check that its stated reason applies to the case in front of you. If it does
not, stop and say so — do not comply anyway, and do not quietly ignore it.**

That has already cost us. Specification 8 and 19 forbid *defining* TableView
spacing resources, and the reason is the token sprawl that killed the predecessor.
That reason says nothing about a literal default inside the control's own template
— but the rule was applied to one regardless, the header cell's padding was
deleted, and the control now renders misaligned until a host writes a style. The
rule was obeyed and the product got worse.

A rule whose reason you cannot find is a finding. Raise it.

## One owner per thing

This is the architectural bet, and it is the thing most worth defending.

| Concern | Owner |
|---|---|
| Column geometry | `ResolvedLayout` — nothing else computes a column position |
| Selection, current, anchor, focus | the selection model, as pure logic |
| Pointer gestures | one arbiter: press, threshold, dispatch |
| Header and row arithmetic | one panel type — the header strip hosts the same panel the rows use, so the two cannot drift |
| The source snapshot | one view, replaced whole, so the list never sees a partial update |

Five, against the twelve that killed the last attempt. Before adding a sixth,
name the requirement that forces it. If you cannot, you have found a place where
an existing owner should absorb the work.

Keep this table true. It is a claim about the code, so it is checkable, and a
stale one is worse than none — it would let the sixth owner arrive unnoticed,
which is the exact way the last attempt reached twelve.

State that lives in two places will disagree. Not might — will. So will behaviour:
two code paths that produce the same result are the same defect as two copies of
the state. A menu command and the gesture it mirrors call one implementation, or
they will eventually disagree about what a legal destination is.

Two signs you are about to add the sixth owner, both worth stopping for: a fix
that only works by copying logic from somewhere else, and a change you cannot
explain in two or three sentences.

## Model state as state

A `bool` answers a yes-or-no question. Control state is almost never a yes-or-no
question. Two booleans beside each other claim four states while the code has
three, and the fourth stays representable, unreachable, and waiting.

The progression, and where to stop:

- **A boolean qualifying an enum means the enum is missing a member.** It is not a
  flag. It is a state nobody named. This is about values that are *stored* and read
  later; five booleans recomputed fresh by one function are a projection of the
  state, not a second copy of it, and they are fine.
- **Let a state carry its own data.** If a row drag needs the dragged item and a
  marquee must not have one, the item belongs in the state, not in a field beside
  it where the two can disagree.
- **An enum any code can assign is not a state machine.** When only some
  transitions are legal, write them in one place and let nothing else touch the
  field.
- **Stop there.** One field and one transition method is usually the whole
  machine. A class per state is the opposite failure — more structure than
  behaviour.

We have the first one now, in `TableView.Input.cs`. `GesturePhase` is
`None | Pressed | Committed`, but `_gestureDeferred` splits `Pressed` in two, and
`_marquee.IsActive` splits `Committed` into marquee and row drag. Five states in
one enum and two booleans across two objects — which is why a committed row drag
calls `_marquee.Track` and relies on the marquee quietly doing nothing. Code that
works because a call happens to no-op is not working; it is waiting.

That also settles what the marquee is. It owns marquee *geometry* — a rectangle
tested against realized rows — and that earns its place. It does not own gesture
*state*: one arbiter decides which gesture is running, and the marquee is told.
An owner that keeps a second copy of somebody else's state is not a new owner, it
is a defect in the pointer arbiter.

The test: can you name every state, and every legal transition, from one field?

**The failure is rarely choosing wrong. It is never re-opening the choice.** The
observed pattern is repair: one more flag, one more condition, each small enough
to justify, while the shape stays wrong and nobody notices they are designing. So
use a trigger instead of judgement — **the second fix to the same condition means
stop and change the shape.** `_gestureDeferred` is what that looks like: a field
added beside `GesturePhase` instead of a member added to it.

## Tokens

See design §12.1. In one line: never name a token after an element, name it by
semantic role, reuse a role rather than restating it, and if the control must
ever introduce a key, alias it to a platform token so it inherits.

A token is a named resource that other things reference. A literal value inside
the control's own default template is not one. Confusing the two already cost us a
visible regression — see *Defaults are the API*.

The last project's thousand tokens were all reasonable individually. That is the
point.

## Measure; do not reason about what you can observe

This project has been wrong, confidently, several times. Every one was caught by
running something rather than by thinking harder:

- `SelectionMode="None"` with `IsSelected = true` reads perfectly in the
  documentation and renders **nothing at all**. Pixels identical to an untouched
  row.
- The container's selected-row cue measures **1.08:1**. The requirement is 3:1.
  Nobody would have guessed it was that far off.
- An automation check "proved" custom peers worked by asking the in-process
  cache — which returns whatever you put in it. A real out-of-process client saw
  none of it, and one override had collapsed a six-item list to one accessible
  child.

So: if a claim can be observed, observe it. Report what you saw, including the
numbers. "Could not determine" is a real and useful result. A plausible guess
stated as fact is the most expensive thing you can produce here, because
everything built on it has to be redone.

One measurement is inherited rather than ours, and it is settled. **A bound
`ListView` flashes the entire list on `ObservableCollection.Move`** — not the moved
row, the whole list. The owner found it by debugging it directly, twice, in two
other products. Reordering is `RemoveAt` then `Insert`, which does not flash and
does animate. `Clear` is worse still: it discards every container.

So never call `Move`, never raise `NotifyCollectionChangedAction.Move`, and never
`Clear` a displayed collection. This one is closed. If your own measurement seems
to disagree, report it as a finding — and still do not use `Move`.

## Running things costs somebody their machine

Building is free and quiet. Running is neither. The test host is a packaged WinUI
application, so every `dotnet test` opens a real window and takes the foreground,
and the sample does the same. With several agents working at once that becomes a
window stealing focus every few seconds, on the machine of whoever is sitting at
it — which is what happened here, alongside a sample left running for 885 seconds
of CPU by an agent that had finished with it.

So unless you were explicitly asked to:

- **Build to check your work; do not run the test suite.** A clean build is the
  evidence you owe. The suite is run once, deliberately, by whoever is coordinating.
- **Do not launch the sample** to see something you could establish another way.
- **Close what you open.** Check before you report, not after somebody complains.

This does not soften the rule above it. If running something is genuinely the only
way to settle a question, the answer is to say so and ask — and if you cannot,
report the claim as unverified and say what you tried. That is already the expected
result here. Guessing is what is forbidden; running unbidden is not the alternative.

## Names

Write names the way the C# base library does. `Count`. `Add`. `Trim`. `Sort`.
`Clear`. `Contains`. An entire language's API fits in short words because the
TYPE carries the context and the NAME carries only the meaning. Nothing announces
its own type, its storage, its scope, or its mechanism.

**A name is the shortest clear statement of what the thing is** — not what it
contains, not how it works, not where it lives.

- Repeat no context the reader already has **at the use site**, and judge the name
  there rather than where it is declared. Inside a `Column` the type supplies the
  word, so the property is `Width`. At a host's use site the namespace does not,
  so the type is `TableColumn`.
- Over three words is a warning. Over four needs a reason you can say out loud.
- When a name keeps growing, split the responsibility instead of extending the
  name. A long name is usually a type that has not been extracted yet.
- No `Manager`, `Helper`, `Base`, `Common`, `Utils`, `Info`. These name a filing
  cabinet, not a thing.
- Commands are verbs: `FitColumn`. State is a noun: `SortDirection`. Booleans
  read as facts: `CanSort`, `IsVisible`, `HasResults`. Collections are plural:
  `Columns`.
- One concept keeps one word across the whole library. If rows are "rows" in one
  file they are not "items" in the next.
- A word that would be true of every member is not a word.

That last one has teeth. `AutoFitVisibleColumns` calls itself automatic while
specification 10 says in as many words that these are *explicit* commands and not
an automatic sizing mode. The name argues with the contract. `FitColumns` is two
words, says the same thing, and does not lie.

**Files and folders follow the same rule.** One dot — `TableView.Reorder.cs` is
not allowed, and needing a second dot to say which *part* of a type this is means
the part wants to be a type. A folder supplies a word and its files never repeat
it. Small related types share a file; one file per type is filing, not design.

Four files break this today — `TableView.Columns.cs`, `TableView.Input.cs`,
`TableView.Properties.cs`, `TableView.Selection.cs` — and they are queued to be
renamed, not grandfathered. Elsewhere this document names `TableView.Input.cs` as
the home of the gesture state; read that as a location, not as permission.

The same rule decides prefixes: nothing outside sees an internal type, so its use
site never needs one. `ResolvedLayout` is internal, unprefixed, and reads
perfectly.

**A name bound by a string is a contract the compiler cannot see.** Template part
names, visual state names and resource keys join our C# to our XAML by literal, and
each one fails silently — `GetTemplateChild` returns null, `GoToState` returns
false, a missing key returns an empty string. Every consumer here is null-tolerant,
so one mistyped part produces a table with no header, no rows and no pointer input,
and throws nothing to say why. Declare parts with `[TemplatePart]`, and treat a
rename as unfinished until the literal has been grepped across `src`, `samples` and
`tests`. No rename tool follows a string.

Names are part of the change, not a pass afterwards — with one boundary. An
internal name that breaks these rules is fixed in the same edit. A public member
the specification names is a contract, so a bad one is an amendment to raise, not
a rename to slip in. `AutoFitVisibleColumns` and `IsVisibleByDefault` are both on
that side of the line.

## Numbers are derived, never chosen

This is a generic control. A number somebody picked because it looked right on one
machine is wrong on the next one — a different pointer, a different DPI, a slower
animation setting, a user who has changed the system's own thresholds. It is also
unarguable, which is the deeper problem: nobody can tell later whether 4 was
reasoned or typed.

So every constant answers **what is this derived from?**

- **The system, when the system owns the concept.** A drag threshold is not ours to
  invent — Windows publishes the user's own (`SM_CXDRAG`, `SM_CYDRAG`). Animation
  timings, spacing and stroke weights belong to the theme.
- **The live resource tree, when the platform publishes a value.** Enumerate it and
  read the value; do not guess a key name from memory. That technique is proven
  here — 7,484 `Thickness` resources were enumerated in one pass to establish that
  no cell-padding resource exists.
- **The layout, when the answer is geometric.** A sub-pixel epsilon comes from the
  rasterization scale. A boundary comes from the resolved column edges.
- **The specification, when the number is a stated contract.** §6.1's 150 DIP
  default width is not a magic number; it is the declared baseline.

If none of those supplies it, that is a **finding to report**, not a licence to pick
one. Say what you looked for and what was missing.

And when a constant is genuinely derived, its name says so and the derivation is
visible at the constant, because a derived number that reads like a chosen one gets
"tuned" by the next person.

We are not there yet. `SeparatorReachDips = 4`, `DragThresholdDips = 4`, a 180 ms
motion duration and a 0.5 DIP movement epsilon are all chosen, and at least the
first two have a system source that should be supplying them.

## Defaults are the API

A property a host must set to get an ordinary result is not a feature. It is a
defect with a workaround.

The target is a table that looks and behaves correctly with nothing configured:
declare columns, bind a source, done. Every setting a host has to discover and
repeat is noise, and noise is what made the predecessor unmaintainable — not one
bad default, but hundreds of small ones each pushed outward to the caller.

So when you find yourself about to make the host supply something:

**Ask whether the control can know it.** If the control can compute or choose it,
the control chooses it. A default the host almost always overrides is the wrong
default; a default nobody ever overrides should probably not be a property.

**A default value is not a design token.** Specification 8 and 19 forbid
*defining* TableView-specific brush, type, geometry, or spacing RESOURCES. They do
not forbid a literal spacing or geometry default inside the control's own template.
Colour is not in that exemption — specification 19 forbids hard-coding it
anywhere, separately from the resource ban. Every WinUI
control ships property defaults, and a host overrides them with a normal implicit
`Style`. Removing a sensible default to avoid inventing a token trades one rule
for a worse outcome: a control that renders wrong until configured.

**Put shared values where they can only agree.** Header inset and cell inset must
match or the table looks broken. If both sides read one value the control owns,
they cannot drift. If each side is supplied separately by the host, they will.
The same reasoning as one-owner-per-thing, applied to defaults.

## The public API is the product

Most of this code will be read from the outside, by someone binding to it who
never opens it. Judge every public member as that person: is the name what it
does, is the shape the smallest that expresses the idea, and is anything here
that they will never need?

The specification's §5 is the contract. Build it as written. If a member is
wrong, that is a finding to raise, not a thing to quietly improve — a plan and a
specification that disagree are worse than either alone.

**One consumer proves nothing.** Logic in the wrong place works perfectly until a
second consumer needs it, which is exactly why review does not catch it: there is
no defect to find yet. Reading for bugs cannot see a layering mistake. Only two
things can — asking what a second consumer would need and whether it can reach
it, and then actually building one. This control exists to be reused, so the
torrent page must never be the only thing it has been built against.

## Before you finish

Read your own diff as the person who has to maintain it. For each new concept —
a file, a type, a parameter, a branch, a piece of state — name the requirement
that forced it. Remove anything that has no answer.

Then say plainly what you did not do, and what you could not verify. That is not
a weakness in a report. It is the most useful part of one.
