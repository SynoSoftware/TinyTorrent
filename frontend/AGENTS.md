# TinyTorrent Frontend AGENTS.md

This file governs work inside `frontend/`.
Root `AGENTS.md` still applies. If this file conflicts with the root file, the root file wins.

## Purpose

Produce small, direct, review-friendly patches.

The default good change in this repo:

- touches the fewest files possible
- changes the natural owner instead of spreading logic across layers
- preserves working behavior outside the bug or requirement
- adds no new abstraction unless there is a clear immediate need

If a solution is clever, broad, or highly structured, it is probably wrong for this codebase.

## Default Bias

Prefer these by default:

- the minimal architecture that still works
- the smallest local change at the natural owner
- direct, explicit code over reusable or generalized structure
- deleting code over adding structure
- tightening existing code over extracting helpers
- preserving working code over “cleaning up” adjacent systems

Reject these by default:

- new APIs, params, props, callbacks, options, or context values
- new helpers, wrappers, hooks, services, or config surfaces
- speculative generalization
- compatibility, fallback, legacy, or migration logic
- “just in case” flags, refs, timers, or guards
- moving logic to a broader layer without proving the bug originates there

## Hard Rules

### 1. One Owner Per Behavior

Every behavior and every mutable value must have one clear owner.

- Facts belong to the layer that observes them.
- Policy belongs to the layer that decides what to do with facts.
- Presentation belongs to the component that renders UI.

Do not mix them without a concrete reason.

Examples:

- Session/provider layers expose connection facts. They do not own onboarding or UI preference policy.
- A settings toggle owns a preference. Other code may read it, but must not reinterpret it into a second meaning.
- A dialog component renders a message. It should not become the policy owner unless that policy is truly local to rendering.

### 2. Fix the Bug Where It Starts

Change the narrowest layer that already owns the broken decision.

Before touching a broad or shared layer, prove the bug actually originates there.

High-blast-radius layers include:

- `app/context/*`
- `services/transport.ts`
- shared hooks
- shared UI primitives
- config authorities

If the bug can be fixed in a feature owner or local hook, do not move it outward.

### 3. API Growth Is A Regression By Default

Any added API surface must be treated as harmful until proven necessary.

This includes:

- new function parameters
- new props
- new context fields
- new callback plumbing
- new exported helpers
- new config keys
- new command variants

Allowed only if all are true:

1. the current owner cannot absorb the change directly
2. no existing data can express the behavior
3. the added surface has an immediate consumer
4. the added surface reduces duplication or ownership leakage now

“Cleaner”, “more modular”, or “future-proof” are not sufficient reasons.

If a value already has a context or owner, read it there.
Do not widen APIs just to pass context-owned values through props or parameters, except in tests or boundary adapters.

### 4. Overlap Must Be Collapsed

If two variables, flags, concepts, or code paths describe the same thing, collapse them.

Do not keep parallel concepts unless the distinction is real, observable, and necessary.

Treat overlap as a bug signal.

Examples of suspicious overlap:

- two booleans that gate the same modal
- “history” state and “display mode” state that end up deciding the same UI copy
- retry timing owned in two places
- a setting plus a derived flag that restates the same intent
- a leaf token or config class that restates a broader semantic surface already owned higher in the tree

### 5. No Speculative Compatibility

Do not add:

- legacy reads
- migration paths
- compatibility shims
- fallback keys
- dual behavior for “old” formats

unless there is concrete evidence that existing real data requires it.

This repo has not earned compatibility complexity by default.

### 6. No Defensive Layering

Do not stack:

- wrapper around wrapper
- timeout around timeout
- suppression around suppression
- helper around one callsite
- generic abstraction for one consumer

If behavior is already owned somewhere, extend that owner or delete the duplicate logic.

### 7. Preserve Working Code

Do not touch working adjacent code unless one of these is true:

1. it is the real owner of the bug
2. it directly blocks the fix
3. the current diff already made it worse and must be reduced

Working code is not an invitation to redesign.

### 8. Follow-Up Passes Are Cleanup, Not Redesign

If a patch already works, a later pass must focus on:

- removing overlap
- moving logic back to the right owner
- tightening APIs
- deleting unnecessary helpers, flags, config, or indirection

It must not introduce a new system.

## Pre-Edit Procedure

Before writing code, answer these questions from the current codebase:

1. What is the single owner of this behavior?
2. What layer currently makes the broken decision?
3. Can I fix it by changing fewer files?
4. Am I about to add any API surface, flags, or indirection?
5. Does an existing concept already represent this?
6. Am I broadening scope beyond the bug?

If you cannot answer these from the code, keep reading before editing.

Minimum familiarization:

- inspect the current feature owner
- inspect adjacent shared owners that already touch the behavior
- inspect any existing state/config already expressing the same concept
- verify that an equivalent helper, module, service, utility, pattern, or library does not already exist

Do not write code before doing this.
If an equivalent already exists, reuse or extend it instead of creating a parallel implementation.
Overlapping implementations must be collapsed into one clear owner.

## Decision Order

Evaluate solutions in this order:

1. delete dead or duplicate logic
2. tighten the existing owner
3. express the behavior with existing state
4. move logic back to the correct owner if it drifted
5. add a new surface only if the previous steps fail

For visual token decisions, search in this direction:

1. higher-level semantic owner already used by similar surfaces
2. sibling usage of the same semantic object
3. local owner only if the broader owners do not already cover it

Do not branch upward and invent a parallel token locally.
If a broader owner already expresses the object, move the usage to that owner or delete the stale lower-level token.
If a useful semantic exists only in another leaf but is clearly shared, bring it down to the common owner, define it once there, and make both leaves consume that single surface.

Skipping earlier steps requires a concrete reason in the final explanation.

## Frontend Ownership Map

Use these owners by default.

- Feature behavior: the owning feature module under `src/modules/*`
- Cross-feature app policy: `src/app/*`, only when no feature can own it
- Session facts: `src/app/context/SessionContext.tsx` and session hooks
- Preferences and persisted UI state: `src/app/context/PreferencesContext.tsx`
- RPC transport behavior: `src/services/transport.ts`
- RPC protocol/schema behavior: `src/services/rpc/*`
- Non-visual product knobs and timers: `src/config/constants.json`
- Shared semantic surface tokens and visual surfaces: `src/config/logic.ts`
- Global geometry and CSS tokens: `src/index.css`
- Shared non-surface semantic roles: `src/shared/ui/uiRoles.ts`

Do not create a new owner if one of these can absorb the change.

## Facts, Policy, Presentation

Keep these separate.

### Facts

Facts are observations or persisted values.

Examples:

- current connection state
- current endpoint
- stored preference values
- transport outcome

Facts should be named plainly and not encode policy.

### Policy

Policy decides what the app should do with facts.

Examples:

- whether to open a dialog
- when suppression resets
- whether a successful connection should clear a preference

Policy belongs in the narrowest non-presentation owner that already consumes the needed facts.

### Presentation

Presentation renders UI and local visual state.

Examples:

- which title/body text to show
- layout
- button arrangement

Presentation should not become a hidden policy owner.

## UI Rules

### Surface Styling Authority

- `src/config/logic.ts` is the single authority for semantic surface styling.
- `src/config/constants.json` is for non-visual configuration only.
- Feature code must not author raw CSS for visual treatment.
- `className`, `itemClasses`, and similar props are not styling authority.
- `src/shared/ui/uiRoles.ts` must not define surfaces.
- HeroUI is the control layer, not the surface-selection authority.
- `src/index.css` owns global geometry and CSS tokens.
- Prefer reducing token count over preserving local convenience tokens; consolidation reduces drift.

Required decision procedure:

1. Identify what the object is semantically.
2. Search `src/config/logic.ts` for an existing token for that semantic object.
3. In that search, prefer broader shared semantics before narrower leaf-local ones.
4. If a matching semantic exists only in another leaf but is actually shared, move it into the proper shared location in `src/config/logic.ts` and reuse that one token from both places.
5. Do not select a token because class strings look similar; select it because the semantic object is the same.
6. If no match is found after best-effort search, ask before creating a new token.

Forbidden:

- choosing tokens by class similarity or visual resemblance
- creating tokens to match visuals instead of semantics
- duplicating tokens across leaves
- falling back to inline CSS or local CSS because the token search was incomplete

### `className` Rule

`className`, `itemClasses`, and similar class-prop maps are for layout only.

Allowed:

- flex/grid
- gap
- sizing
- overflow
- positioning

Not allowed in feature code:

- ad hoc colors
- borders
- radius
- shadows
- blur
- typography recipes
- custom interaction-state styling
- arbitrary values such as `bg-[#...]`, `w-[...]`, `text-[...]`, or hand-written CSS fragments

Required solution:

- resolve the visual treatment through the required decision procedure above
- use surface tokens from `src/config/logic.ts`, not local CSS, to express visual styling
- if a lower-level token duplicates a broader semantic token, remove the duplicate instead of preserving both
- keep only layout classes in `className`, `itemClasses`, and similar class-prop maps

Inline `style` is not a styling escape hatch.

- do not put ad hoc visual styling in `style`
- use `style` only for unavoidable dynamic geometry already owned by the component/system

### Shared UI Structure

Do not add wrapper components that only restyle HeroUI or forward props.

Extract a component only when it owns real local behavior or removes real duplication.

## Type And Boundary Rules

- do not use `any`
- do not widen types to “make it work”
- do not add unchecked casts unless they are at a validated boundary
- prefer exact internal types over loose catch-all objects
- prefer discriminated unions or explicit result shapes for stateful/control-flow data
- expected failures belong in typed outcomes, not exception control flow
- behavior must branch on explicit typed conditions, not names, URLs, caller position, or heuristics

External data must be validated and normalized once at the boundary owner:

- RPC responses
- local storage / persisted data
- URL and query input
- env/runtime flags
- browser or native host APIs

Pass typed internal data inward. Do not re-parse or re-validate the same shape in leaf code.
Do not let raw external shapes leak across the boundary.
Keep external naming at the boundary. Read external `snake_case` there and expose internal `camelCase` keys inward.

## Service And IO Isolation

IO belongs in the existing boundary owner.

- components do not fetch
- presentation code does not talk to storage, native APIs, or transport directly
- services/adapters own external calls
- hooks and app policy may orchestrate, but should not absorb transport/protocol details that already belong to a service

Do not move IO upward just to “simplify” a local fix.

## Config And Timers

If a number is a real product/runtime knob, put it in:

- `src/config/constants.json`
- `src/config/logic.ts`

Do not hardcode shared timing or policy numbers in leaf code.

But do not create config for trivial one-off implementation details either.

Hard rules:

- no non-trivial magic numbers in logic
- only trivial self-evident values such as `0` and `1` may stay inline by default
- all meaningful timeouts, sizes, thresholds, limits, and retry values must have one named entry in `src/config/constants.json`
- shared runtime/config access goes through `src/config/logic.ts`
- leaf code must not parse `constants.json` directly or invent local fallback values
- reuse existing constants before adding new ones
- do not introduce duplicate or overlapping constants

Good candidates:

- RPC timeouts
- retry delays
- debounce windows
- UX grace periods

Bad candidates:

- a one-off loop counter inside a local algorithm
- a purely test-local timing constant

## Import Discipline

- use `@/` absolute imports for frontend source
- do not add cross-feature deep relative imports
- do not import from outside `frontend/`
- do not create new shared modules for one caller
- use normal TypeScript naming consistently:
  - variables, functions, local constants, and local hooks: `camelCase`
  - components, classes, and types: `PascalCase`
  - service/utility modules: `kebab-case`
- do not use all-uppercase identifiers
- only hooks may use `camelCase` filenames; everything else should be `PascalCase` or `kebab-case`
- do not mix naming styles in the same folder
- do not create generic filenames such as `helpers.ts`, `utils.ts`, `client.ts`, or `index2.ts`
- enum-like control-plane vocabularies, their members, and namespace objects use `PascalCase`
- runtime maps, registries, descriptor objects, and authority records use `camelCase`, not enum-style naming

## State And Data Modeling

Prefer the smallest model that matches reality.

- One persisted setting should remain one persisted setting.
- Do not split one concept into “state”, “mode”, “history”, and “derived intent” unless each is independently necessary.
- Do not derive a second boolean when the first boolean already expresses the behavior.
- Do not couple unrelated lifecycles.

If a name needs a paragraph to justify the distinction, the model is probably too complex.

## Structural Change Rules

A structural change includes adding or removing:

- files
- hooks
- helpers
- services
- abstractions
- public contract surfaces
- ownership boundaries

Structural changes are expensive here.

Do not introduce one unless:

1. the existing owner cannot absorb the change without becoming incorrect
2. the new structure removes current duplication or ownership confusion
3. the result is easier to trace than before

If the change increases abstraction depth without reducing ambiguity or duplication, it is invalid.

## User-Facing Text

- all user-visible strings belong in `src/i18n/en.json`
- components should render user-visible text through `t(...)`
- temporary inline text is allowed only during active iteration and must be marked `TODO(i18n)`

## Review-Churn Traps

Avoid these common causes of churn:

- adding “just one more flag”
- adding helper functions that only rename logic
- introducing refs/timers where direct state would work
- moving behavior into context/provider code without proving it belongs there
- widening prop surfaces instead of fixing the owner
- keeping old and new behavior side by side
- cleaning unrelated files while fixing a local bug
- inventing migrations or fallback code with no evidence

## When A Broader Layer Is Justified

A broader/shared layer may be changed only when at least one is true:

1. the bug originates in that shared decision
2. multiple real callers are already duplicating the same broken logic
3. the broader layer is already the declared owner of the behavior

If you cannot state which of these applies, keep the fix local.

## Final Self-Check

Before finalizing, answer all of these:

1. What is the single owner of this behavior?
2. Did I add any new API surface, flags, or indirection?
3. If yes, is each one strictly necessary right now?
4. Did I duplicate or overlap an existing concept?
5. Did I move the fix to a broader layer than necessary?
6. Did I preserve working behavior and keep the diff local?
7. Is any “legacy” or compatibility code actually justified by evidence?
8. Is this the most direct obvious implementation?

If any answer is weak, keep editing.

## Validation

Do not claim a frontend fix is complete without validation.

At minimum:

- add or update the narrowest relevant test when behavior changes and a focused test is practical
- run the narrowest relevant tests
- run `npm run build` for landed/reviewed changes when feasible
- state clearly what was validated and what was not

If you could not validate behavior through the interface the user relies on, say so explicitly.

## Final Standard

The best TinyTorrent frontend patch is boring:

- one clear owner
- one clear model
- one obvious code path
- one local diff
- no speculative structure
- no hidden policy drift

Aim for code that needs little interpretation from the reviewer.
