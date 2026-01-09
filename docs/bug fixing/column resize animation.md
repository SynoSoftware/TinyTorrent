
Topic: column resize animation





Used 1 reference
Explaining animation needs
Short answer: usually no — you don't need to stop animations globally. Animate only position transforms for rows and opt out inner text/layout animation; that preserves the header-style motion without text stretching. You may still need the existing reorder-related suppression in a few edge cases (virtualization + DnD, column-width transitions, or height changes).

How it works (high level)

Text stretching happens when the animation system interpolates layout metrics (width/height/scale) of the text-containing nodes.
If you limit animation to transforms (translateX/translateY) the browser moves a composited layer; glyph layout is not interpolated, so no stretch.
The pattern: animate an outer wrapper’s position, but disable layout animation on inner text nodes so their layout jumps instantly while the whole row translates smoothly.
Minimal implementation recipe (what to enable/disable)

Row wrapper: animate position only
Framer Motion: use layout="position" (or layout with config that only animates position).
Inner cell/text nodes: opt out of layout animation
Wrap text in plain DOM nodes or motion nodes with layout={false}.
Ensure no CSS transitions are applied to width/height on those nodes.
Remove global “stop animation” flag and instead only disable layout animation where text stretching would occur (i.e., inner text).
Keep GPU hints on moving wrapper: will-change: transform.
Preserve existing reorder-related suppression (do not remove) for interactions that currently rely on it (DnD handoff, virtualization reindexing). Only remove it experimentally after verifying no regressions.
When you still need suppression (do not remove blindly)

Column widths are animated elsewhere (if a column width transition exists, the text may still animate — remove width transitions).
Row height changes (text reflow while row height animates will still show artifacts).
Virtualization re-mounts or rapid unmount/mount during reorder — these can cause jumpy animations; keep suppression until tested.
DnD libraries that apply their own transforms during drag; ensure ordering between DnD transform and Framer Motion layout is coordinated.
Small optional refinement (if you want trailing-edge motion)

To animate only the "end of the line" without reflowing glyphs, animate an overflow-hidden mask (width or clip-path) over the text while the text itself is not animated.
Quick test checklist

Enable row transform-only animation; inner text nodes layout={false}.
Fit all rows:
Rows translate smoothly.
Cell text does not stretch at any point.
Header motion and body motion feel consistent.
Run existing interaction flows: drag reorder, keyboard reorder, virtualization scroll — confirm visuals match prior behavior.
If any visual regression appears, restore the suppression at the problematic place and test again.
If you want, I can:

Produce a small patch that re-enables layout animation on the rows and disables it on inner text nodes, pointing to the exact components to change.
Or list exact file → symbol → line locations to edit so you can apply the change yourself. Which do you prefer?
