# Localisation and immediate language switching

This is part of the [desktop architecture](desktop-architecture.md), not an
implemented feature. English alone must provide a complete working application.
Adding another language changes catalogue data, not application behavior.

## One source for application text

Use `resources/locales/en.json` as the canonical source of message keys and
English fallback text. Other shipped languages use the same keys in
`resources/locales/<language-tag>.json`. These are shared product resources,
independent of the web frontend and available to the engine build without WinUI.
JSON has a concrete role here as editable translation data; IPC remains binary.

Cover every application-authored surface: windows, dialogs, menus, tray text,
tooltips, status and error messages, empty states, notifications, keyboard hints,
and accessibility names/announcements, including those inside Synapse controls.
Use stable semantic keys, not English sentences as identifiers. Keep whole
messages together with named arguments; translators control word order. Text is
plain data, never executable markup. Preserve user text, torrent names, paths,
URLs, hashes, and peer/tracker messages as data rather than translation keys.
Windows-owned dialogs and shell surfaces retain platform-controlled language
behavior; TinyTorrent cannot promise to relabel an already-open system dialog.

Migrate useful existing web translations and hard-coded WinUI/Synapse text into
this authority as their desktop consumers move. Do not import the web runtime or
keep hand-maintained English duplicates in XAML, C++, C#, and `.resw`. Any resources
required by packaging or standalone controls are generated from the JSON source.
Shipping another language is separate from this architecture requirement; expose
only installed, validated catalogues in the language selector.

## Ownership and live behavior

The engine owns the selected language tag in its existing preferences,
because tray text must work with WinUI closed. First use matches the Windows
language against shipped catalogues, falling back to English. Preserve an explicit
selection across UI and engine restarts. Show languages by their own names so a
user can recover from an unfamiliar selection.

One localisation component in the UI process supplies text to both application
views and owned controls. Selecting a language updates existing visible content
on the next dispatcher/render update after the local catalogue is ready, without
waiting for a torrent refresh. A language revision
invalidates translated bindings and formatted display values, including open
application dialogs, flyouts, column headers, and accessibility metadata. Changing
a culture property or resource qualifier alone is not the refresh mechanism.
Hidden or virtualized content uses the current language when it appears.

Switch in place: no process restart, page recreation, reconnect, torrent reload,
lost focus/selection, or discarded draft. Keep numeric edits under the culture in
which editing began until they are committed or cancelled; reformat settled
values without reinterpreting the user's input. Download work is unaffected.
Native text composition and IME candidate handling get first refusal on input:
application shortcuts must not consume composition keys or commit unfinished
text. Preserve the composing editor's text, caret, selection, and focus during
language changes. Defer only editor updates that would interrupt composition
until it ends; surrounding translated content still updates immediately. Use
standard text controls and their composition behavior, not another input system.
Load/validate a candidate catalogue away from the UI thread, replace the active
catalogue together, and retain the current one on failure. Coalesce rapid choices
so an older load or acknowledgement cannot overwrite the latest selection.

Use the existing settings command and the engine's control notifications to synchronize
the live language and update tray surfaces; do not add a transport or event bus.
UI feedback can preview the pending choice immediately, then reconcile with the
engine. Saving runs asynchronously under the existing persistence contract:
distinguish the live language from a successfully saved preference, report save
failure, and never silently claim persistence. Reconnecting reads the engine's
language again. Tray menus use the current catalogue when shown; an already-open
tray menu must be refreshed or safely reopened without executing a selection.

## Language rules and fallback

Resolve a message from the selected catalogue, then its shipped parent language,
then English. Missing or invalid translations fall back to a complete English
message, not a raw key or a mixture of sentence fragments. A malformed catalogue
cannot prevent startup; embedded English remains available. Missing English keys,
duplicate keys, and incompatible placeholders are catalogue defects to catch
before packaging. Keep unknown engine error codes usable through a translated
generic message with optional diagnostic detail.

Send stable error/status codes and typed arguments from the engine, not English
sentences that WinUI must parse. Localize at the surface displaying the message;
retain codes/arguments for pending results so they can be rendered again after a
switch. Raw operating-system or library diagnostics may accompany that message
without being treated as translated product copy.

Use locale-correct plural forms for counted messages, not an English singular/
plural rule for every language. Select forms using the message's resolved language,
including when it falls back to English. Keep regional number/date/unit formatting
consistent with Windows regional preferences; UI language and region are separate
choices, without adding a second settings panel. Use platform globalization
facilities; Windows supplies [ICU C APIs](https://learn.microsoft.com/en-us/windows/win32/intl/international-components-for-unicode--icu-)
when plural selection needs them. Do not bundle another ICU distribution or build
a general message-expression interpreter. The catalogue contract needs only the
message forms and substitutions actually used by the product.

Allow longer translations, Unicode, appropriate font fallback, and right-to-left
layout. Direction changes with the UI language; paths and identifiers retain
readable direction. Focus, keyboard hints, and accessibility remain coherent.
Microsoft documents [layout and RTL requirements](https://learn.microsoft.com/en-us/windows/apps/design/globalizing/adjust-layout-and-fonts--and-support-rtl)
and [WinUI resource behavior](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/mrtcore/localize-strings).

## Cost and proportionate evidence

WinUI loads English and the selected/fallback catalogue using its existing .NET
JSON support; release obsolete catalogues after a switch. Retain language names
without loading every translation. The engine build generates only the messages
the engine shows, for the tray and the splash window, from the same JSON into its
own resources, as a step of that build. No runtime JSON parser, managed runtime,
WinUI, or full UI catalogue is loaded into the engine solely for localisation. Generated outputs have no
independent editing authority. Load platform formatting support only where needed.
There is no translation server, network fetch, watcher, or plugin framework.

Follow [the testing policy](testing.md). A quick catalogue integrity check covers
keys, placeholders, and required forms when catalogues change; it does not assert
the wording of screen strings. One focused live-switch exercise during
implementation should cover an open draft, an owned control, tray state, fallback,
and switching back while downloads continue. Use temporary long-text/RTL data to
review layout when that path changes, not a maintained screenshot suite. Check
that the visible switch has no perceptible pause on this machine; investigate an
observed delay instead of imposing a benchmark run on every translation edit.
