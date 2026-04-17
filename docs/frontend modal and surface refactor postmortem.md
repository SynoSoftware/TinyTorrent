# Frontend Modal And Surface Refactor Postmortem

## Purpose

This document records what went wrong in the frontend modal and surface refactor on `feature/heroui3`, why the result degraded code quality relative to `master`, and what constraints must be respected so the same failure mode does not repeat.

This is not an implementation plan and not a migration checklist.
It is a failure analysis.

## Short Version

The refactor correctly identified that shared modal ownership was too broad.

The refactor failed because it tried to fix that by deleting too much authority from `src/shared/ui/layout/glass-surface.ts` before creating a sanctioned non-TSX replacement owner for the deleted static recipes.

As a result:

- generic modal ownership became smaller
- feature-shaped static recipes disappeared from the only non-TSX authority file that owned them
- TSX files started recreating those recipes locally
- styling authority leaked outward instead of being collapsed

The branch therefore improved one ownership boundary while simultaneously violating a more important architectural constraint: styling authority moved into TSX.

## What The Refactor Was Trying To Do

The original goal was correct:

- collapse shared modal ownership to the smallest generic primitive
- remove aliases and compatibility layers
- stop treating feature-specific settings/add-torrent/layout concerns as if they were generic modal concerns

That direction was right.

The error was in the execution model.

## The Core Mistake

`glass-surface.ts` previously held both:

1. true generic modal primitive concerns
2. many feature- or view-shaped static recipes that should never have lived under `modal`

The refactor recognized that this was over-shared.

But instead of:

- shrinking `modal`, and
- rehoming the non-generic static recipes into another non-TSX authority,

it mostly did:

- shrink `modal`, and
- delete the old exports, and
- let consumers recreate them inside TSX

That is the exact opposite of a real authority collapse.

It does not reduce styling ownership.
It only relocates it from one wrong place to many worse places.

## Where `glass-surface.ts` Went Wrong

The main regression happened in `src/shared/ui/layout/glass-surface.ts`.

The file correctly removed many modal-shaped exports that were not primitive concerns.
That part was directionally correct.

The file failed because it did not replace those exports with new static owners.

In practice, the file stopped being an authority for many settings/workflow/view shells without establishing another non-TSX authority to take over.

Examples of the deleted or collapsed authority classes included:

- settings modal shell recipes
- settings sidebar/header/tab recipes
- add-torrent workflow shell recipes
- add-torrent split-pane and footer recipes
- modal-adjacent layout helpers that were still the only static authority for some consumers

The result was predictable:

- `SettingsModalView.tsx` recreated shell recipes locally
- `AddTorrentModal.tsx` recreated workflow shell recipes locally
- `ModalEx.tsx` briefly recreated modal footer structure locally
- other TSX files continued or expanded local style maps because shared authority had been hollowed out

The branch therefore removed over-sharing from `glass-surface.ts` but replaced it with TSX sprawl.

## Why This Was Worse Than The Original Problem

The original state had too much style ownership in one shared file.
That is bad, but it is still at least static, centralized, and non-TSX.

The refactored state moved those decisions into many component files.

That is worse because:

- styling authority became harder to discover
- the same kind of recipe could now drift independently across files
- code review became harder because behavior and style ownership were mixed in leaf components
- shared primitive cleanup became entangled with feature rendering details
- future collapses became harder because there was no longer a single static owner to clean up

Centralized-but-overbroad authority is easier to fix than decentralized TSX-owned authority.

## The AGENTS Rule Conflict That Was Exposed

The refactor exposed a real rule conflict that must be acknowledged explicitly.

The frontend rules say, in effect:

- visual styling authority must not live in TSX
- shared authority files must not own feature-shaped naming or semantics

Those two rules are both valid.
But they imply a missing structure:

- if feature-shaped static recipes cannot remain in a generic shared authority,
- and they also cannot live in TSX,
- then they must live in some other non-TSX static authority

That sanctioned destination was not created before the refactor proceeded.

Because that destination did not exist, the refactor had no valid place to move those recipes.
Instead of stopping, it kept going.
That was the process failure.

## The Wrong Assumption

A bad assumption drove the work:

> If a token does not belong under `modal`, deleting it from `glass-surface.ts` is progress.

That assumption is false.

Deleting an export is only progress if one of these is true:

- the recipe is genuinely dead
- the recipe is already represented by another existing static authority
- the recipe is moved to another valid static owner in the same change

None of those conditions were consistently true.

In many cases, the recipe was still needed.
The only thing that changed was where it was authored.

## The Modal-Specific Error

For modal work specifically, the correct end state was:

- one small generic `modal` primitive
- no feature-shaped modal exports
- no `control.modal`
- no compatibility aliases
- feature-specific structure returned to feature ownership

The mistake was interpreting “feature ownership” as “component-local TSX style map ownership”.

That is not feature ownership.
That is style leakage.

Feature ownership still needs a non-TSX static authority if the style is static.

## The Branch-Level Process Error

The branch mixed too many concerns at once:

- HeroUI 3 migration
- shared primitive cleanup
- modal ownership collapse
- settings shell restructuring
- add-torrent workflow restructuring
- table/menu/workspace surface changes
- test rewrites

Because those concerns landed together, the branch lost a reliable baseline.

When code quality dropped, there was no narrow diff to inspect and no safe stopping point.

That is why the branch became difficult to salvage.

## Signals That The Refactor Had Gone Off Track

These signals appeared and should be treated as hard stop conditions in the future:

1. TSX files started gaining local `const ...Layout = { ... }` style maps containing static class strings.

2. `glass-surface.ts` was getting smaller, but the number of static class strings in TSX files was not going down.

3. Consumers stopped reading shared authority and started reconstructing equivalent layout/chrome/shell strings locally.

4. A primitive cleanup required touching many unrelated feature views at once.

5. A migration step could not name the new permanent owner for a deleted recipe.

6. The branch had passing tests/builds but no longer had trustworthy styling ownership.

Passing tests/builds do not prove architectural correctness.

## What Should Have Happened Instead

The correct sequence should have been:

1. Define the permanent non-TSX destination for feature-shaped static recipes.

2. Shrink `modal` to only true primitive concerns.

3. Rehome non-generic modal-adjacent recipes into new static owners.

4. Migrate consumers to those new owners.

5. Only then delete the old over-shared exports and aliases.

The order matters.

Deleting authority before replacement is what caused the branch to degrade.

## Non-Negotiable Rules For Future Refactors

### 1. Never delete static authority before replacement

If a static recipe is still live, it must not be removed from a non-TSX authority file unless a new non-TSX owner is introduced in the same change.

### 2. “Move back to feature ownership” does not mean “put it in TSX”

If the recipe is static, feature ownership still requires a static non-TSX authority.

### 3. A generic primitive cleanup is not complete if TSX class maps increase

A primitive collapse that pushes styles into TSX is a regression, not a cleanup.

### 4. Stop when rules imply a missing owner

If the current architecture has no legal destination for a recipe, do not continue the refactor. Resolve the ownership model first.

### 5. Build/test green is necessary but insufficient

Authority drift can pass both.

### 6. Refactors must reduce total authority surface, not just rename it

If the same number of recipes still exist but are now distributed across TSX files, the refactor failed.

## What Should Be Preserved Conceptually

The branch was not wrong about everything.

These ideas were correct and should be preserved in any future redo:

- `modal` should be a small generic primitive
- compatibility aliases and parallel modal owners should be removed
- feature-specific modal structure should not live under generic shared modal ownership
- duplicate modal-shaped ownership should be collapsed

Those ideas remain valid.

What failed was the lack of a valid static rehome target.

## Final Conclusion

The main failure was not that `modal` became too small.

The main failure was that `glass-surface.ts` stopped owning many static recipes before another non-TSX authority was ready to own them.

That created a vacuum.
TSX files filled the vacuum.

So the refactor did not truly collapse styling authority.
It fragmented it.

That must not happen again.
