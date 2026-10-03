# Impeccable audit of the desktop plan

2026-10-03. Scope: the [architecture](desktop-architecture.md),
[localisation](localisation.md), [testing policy](testing.md), and the existing
WinUI design instructions and specifications they depend on.

## Verdict and method

The plan describes an appropriate native Windows product. Three P2 documentation
gaps were found and corrected; there are no P0/P1 findings or open recommendations
in this audit. These are not
reproduced application bugs. Runtime appearance, accessibility, performance, and
language-switch latency remain unverified.

The explicitly requested impeccable audit used its native audit, Operate, adapt,
harden, and polish guidance, adapted to a Windows **plan**. The skill's context
loader ran successfully. It found no root PRODUCT.md or DESIGN.md; the user's
requirements, existing Fluent standard, and WinUI specifications provide the
context for this bounded audit. Creating another product/design authority would
not address a finding.

Web/mobile checks translate to WinUI UI Automation/Narrator, keyboard and IME,
native virtualization and dispatcher work, Light/Dark/High Contrast, Windows
animation preferences, resizing, text scale, DPI, and monitor work areas. Browser
detectors, ARIA scanners, mobile-device matrices, and screenshot runs do not
apply to this document-only task. The skill's audit-only boundary is followed by
the user's explicit instruction to apply the report's document corrections.

## Five-dimension assessment

A numeric application health score would imply measurements this audit did not
make. This table records plan coverage instead; it is not a WCAG certification
or a claim that the running application passes.

| Dimension | Existing evidence | Gap to correct |
| --- | --- | --- |
| Accessibility | Table §19 and interface review §5 already specify UI Automation, Narrator, focus, non-color cues, labels, and text scaling. | Active IME composition needs explicit protection. |
| Performance | Architecture bounds observations and lifetimes; table §20 owns virtualization and realized-container work. | No additional performance machinery or routine test gate is justified. |
| Appearance and theming | Existing Fluent/control specifications cover runtime Light/Dark/High Contrast and system animation settings. | Historical tray-menu color advice encourages unnecessary custom behavior. |
| Platform conformance and integrity | WinUI and native tray roles are appropriate; root instructions identify the new authority. | Older WinUI entry documents still call the Transmission plan current/approved. |
| Adaptivity | Existing UI guidance covers narrow layouts, effective pixels, long text, RTL, and preserved primary actions. | Saved window placement does not explicitly account for changed work areas/DPI. |

## Findings and actions

### P2 — IME input can conflict with commands and live localisation

**Location:** [localisation, live behavior](localisation.md#ownership-and-live-behavior)
and [interface keyboard rules](../winui3/docs/design-review.md#keyboard-map-and-focus-paths).
**Categories:** accessibility, adaptivity. Editor-first keys are specified, but
active composition/candidate selection is not. Enter could submit Add while a
user is choosing a CJK character; a language refresh could replace composing text.

**Correction:** let native composition handling consume its keys before application
commands; preserve composition, caret, selection, and drafts during language
changes. Defer only editor changes that would disrupt composition; update other
text immediately. Keep this rule in the localisation/input contract and point
the detailed keyboard guidance to it. Use standard input controls rather than
introducing an IME abstraction. Microsoft describes the system-owned
[IME interaction](https://learn.microsoft.com/en-us/windows/apps/develop/input/input-method-editors)
and [keyboard accelerator behavior](https://learn.microsoft.com/en-us/windows/apps/develop/input/keyboard-accelerators).

**Adapted command:** `$impeccable harden`. A focused composition interaction is
future evidence when its input/refresh path changes, not a suite per string edit.

### P2 — saved placement can outlive its display configuration

**Location:** [architecture, lifetime](desktop-architecture.md#lifetime-must-be-obvious-to-the-user),
old WinUI plan's stored bounds, and the interface's adaptive layout guidance.
**Category:** adaptivity. Layout responsiveness does not by itself prevent a
window reopening offscreen after a monitor is disconnected, or at an unusable
size after a DPI change.

**Correction:** keep restoration with WinUI's existing window-state owner; resolve
saved bounds against current display work areas and DPI, recover a reachable
placement, and retain access to essential actions at supported text scales.
Preserve ordinary Windows move/resize behavior and use its
[windowing APIs](https://learn.microsoft.com/en-us/windows/apps/develop/ui/windowing-overview).
No placement service or new display framework is needed.

**Adapted command:** `$impeccable adapt`. Exercise invalid saved bounds and available
scale changes when placement changes; a second physical monitor is not a gate.

### P2 — historical UI documents can direct the wrong implementation

**Location:** [old client plan](../winui3/docs/tinytorrent-plan.md),
[interface review](../winui3/docs/design-review.md), and
[handover](../winui3/docs/handoff.md). **Categories:** conformance, integrity, theming.
The old plan is still labelled approved/current, despite the root authority
superseding its three-process Transmission design. It also recommends undocumented
theme hooks or owner-drawn tray menus purely to obtain a dark appearance.

**Correction:** mark the runtime/transport/packaging portions historical at these
entry points; retain useful interaction/control guidance only within current
scope. Point runtime, localisation, and test scope to their existing authorities.
Retire the menu-color prescription: standard Win32 menu semantics, keyboard
behavior, accessibility, and system appearance take priority over color matching.

**Adapted commands:** `$impeccable distill`, then `$impeccable polish` for the
document references and consistency. Do not redesign the UI or create new tokens.

## What to preserve

The user journeys, native control semantics, meaningful loading/error states,
destructive-action distinction, virtualized table, keyboard equivalents, Pieces
map alternatives, theme behavior, on-demand details, and disposable UI already
have owners. Repeating their complete contracts in the architecture would add
drift. Add clear pointers where the migration plan must lead an implementer there.

The testing policy remains authoritative. This audit does not add a permanent
matrix, screen-string assertions, screenshot suite, benchmark service, or a
runtime test for every small edit. No feature, dependency, or implementation change
is recommended by these findings.

## Disposition

All three corrections are applied to the documents: the localisation contract
owns composition protection; the architecture owns window restoration and tray
menu behavior; the old plan, interface review, and handover identify their current
scope. Existing Fluent and control requirements are linked from the architecture.
The independent Astra review agreed on these three P2 gaps and found no major
architecture issue. Its subsequent full confirmation pass, covering all eight
stakeholder perspectives, found all three resolved and zero new or remaining
major correctness, scope, or implementability issues. Local document links and
changed root-document whitespace checks passed. Application behavior remains
untested; no builds, applications, or runtime tests were run.
