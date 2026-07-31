# Fluent 2 design and review standard for WinUI 3

## 1. Purpose and scope

Use this standard when designing, implementing, or reviewing a native Windows desktop interface built with WinUI 3 and the Windows App SDK.

The objective is a coherent, focused, accessible interface that behaves naturally on Windows and uses Fluent as WinUI implements it. WinUI 3 is the recommended native UI framework for new Windows desktop applications and provides Fluent controls, styles, XAML resources, high-DPI rendering, and support for Windows input methods.

Do not treat this standard as permission for an unrelated redesign. Preserve established product behavior, workflows, terminology, information architecture, components, and coherent visual conventions unless concrete evidence shows that they are inaccessible, inconsistent, confusing, or unsuitable for the product.

This standard covers:

* Fluent design principles
* WinUI controls and patterns
* Information hierarchy and content composition
* Layout, spacing, and adaptive window behavior
* Typography
* Color, themes, and contrast
* Shape and geometry
* XAML resources and design-token principles
* Keyboard, assistive-technology, and input accessibility
* Task-relevant verification

It does not replace:

* The documentation for a specific WinUI control or pattern
* Product-specific UX requirements
* Application architecture requirements
* Complete Windows accessibility documentation
* Guidance for areas not covered here, such as detailed iconography, animation, data visualization, or specialized input scenarios

When a change materially affects a specific control, consult that control’s current WinUI documentation and inspect its behavior in the WinUI 3 Gallery. The foundation rules in this document do not override component-specific guidance.

## 2. Authority and precedence

Product correctness and accessibility are concurrent, non-negotiable constraints.

Within those constraints, use the following precedence:

1. Real user needs and correct product behavior
2. Existing project controls, styles, resources, and coherent conventions
3. Current guidance for the specific WinUI control or pattern being changed
4. Windows application design guidance
5. Fluent foundations
6. New custom design decisions

Do not replace an established project convention merely because a Microsoft example looks different. First determine whether the existing convention causes a concrete problem.

Do not allow a general spacing, typography, color, or geometry rule to override the intended structure or behavior of a standard WinUI control.

Use custom behavior only when the existing WinUI controls and patterns cannot satisfy the demonstrated product need.

## 3. Agent working method

Before changing the interface:

1. Inspect the actual screen and the surrounding workflow.
2. Identify the WinUI controls, styles, resource dictionaries, theme resources, and existing project conventions already in use.
3. Review the current behavior at relevant window sizes and in applicable themes.
4. Inspect keyboard traversal, focus behavior, automation information, and supported input methods where relevant.
5. Identify concrete problems supported by evidence.
6. Consult the current documentation for every control materially affected.
7. Make the smallest coherent correction that resolves the identified problems.
8. Verify the affected interaction, not only its default static appearance.

Do not interpret this standard as permission to:

* Perform a general visual rewrite
* Restyle unrelated screens
* Replace working WinUI controls with custom equivalents
* Introduce a parallel styling or resource system
* Add abstractions or resources without demonstrated reuse
* Normalize harmless differences
* Expand a bounded task into an exhaustive application-wide audit

Where the source provides a principle rather than a fixed rule, assess the actual application context instead of applying it mechanically.

## 4. Design intent

### Natural on Windows

Use familiar Windows controls, interaction behavior, terminology, navigation, window behavior, and input conventions.

The interface should behave predictably with mouse, keyboard, touch or pen where supported, display scaling, theme changes, contrast themes, and assistive technologies.

Fluent recommends adapting to the target platform and reusing native components and patterns for most of an experience. WinUI is the native Fluent implementation for this application.

### Built for focus

Make the current context, important information, and next meaningful action easy to identify.

Reduce visual noise. Decoration, secondary information, and implementation detail must not compete with the user’s task.

### Inclusive by design

Account for different abilities, input methods, display conditions, window sizes, languages, content lengths, and Windows preferences from the beginning.

### Fluent-coherent and product-specific

Use Fluent and Windows foundations to create familiarity, structure, and quality while preserving the product’s own identity.

Do not imitate Microsoft branding or add decorative Fluent motifs without a product purpose. A small amount of visual personality is sufficient; it must not weaken focus or consistency.

## 5. Controls and interaction patterns

Prefer an existing WinUI control or documented Windows pattern over a custom recreation.

Choose controls by semantics and behavior, not visual resemblance. Buttons, hyperlinks, check boxes, toggle switches, radio buttons, tabs, menu items, selectable rows, and disclosure controls represent different interactions and must behave accordingly.

Windows supplies Fluent controls and documented patterns for input, collections, forms, dialogs, flyouts, commands, navigation, status, scrolling, text, and window surfaces. Use the relevant control documentation rather than deriving behavior from a screenshot or a generic visual rule.

When using a standard control, preserve its expected:

* Semantic purpose
* Keyboard behavior
* Focus behavior
* Pointer and applicable touch behavior
* UI Automation information
* Sizing and internal layout
* Rest, pointer-over, pressed, focused, selected, checked, disabled, and unavailable states
* Validation, loading, or status behavior where relevant

Do not customize or retemplate a standard control merely to make it distinctive. Any deviation must address a concrete product requirement without weakening familiarity, accessibility, theme behavior, or state clarity.

When retemplating a control, preserve the equivalent visual states, focus indication, input behavior, and automation behavior supplied by the original control.

## 6. Information hierarchy and content

The interface should make the following apparent without careful inspection:

* Where the user is
* What the screen or surface is about
* What information matters most
* What action is primary
* What other actions are available
* What state the application is in
* What an action is expected to do

Create hierarchy through content order, placement, spacing, typography, surface treatment, and restrained emphasis.

Do not rely on one visual device—such as large headings, accent color, cards, borders, or bold text—to create the entire hierarchy.

Use:

* Logical and predictable information structure
* Scannable headings
* Concise and descriptive labels
* Consistent terminology
* Plain language
* Sentence case
* Stable grouping and alignment

Each sentence and label should contribute useful information. Avoid unnecessary technical terminology, vague commands, repeated explanations, decorative headings, and excessive helper text.

Visual hierarchy and UI Automation structure should convey compatible information. A visually prominent heading or region should not be exposed to assistive technology as unrelated anonymous content. Fluent emphasizes predictable structure, meaningful hierarchy, concise language, and explicit accessibility specifications.

## 7. Layout, spacing, and alignment

Use space to communicate relationships.

Elements that belong together should be closer together. Separate distinct groups with more space. Prefer spacing and alignment over unnecessary borders, cards, and dividers.

Use existing project resources and standard WinUI control spacing before introducing new values. Where no project convention exists, use the Fluent spacing rhythm and Windows composition guidance rather than arbitrary measurements.

Fluent’s spacing ramp is primarily based on four-pixel increments, with intermediate values where component and icon alignment require them. Windows composition commonly uses relationships such as:

* 8 effective pixels between closely related controls or between a control and its heading or flyout
* 12 effective pixels between a control and label or between distinct content regions
* 16 effective pixels for common surface gutters

These are relationship guides, not a command to scatter literal values through every page. Preserve the spacing already supplied by standard controls and styles unless there is evidence that it is unsuitable.

Do not place every section inside a card. A surface should represent a meaningful boundary, interaction region, selection, or visual layer.

Use shared edges and baselines:

* Left-align ordinary text in left-to-right languages.
* Align related labels, fields, content, and actions.
* Center icons within their bounds while aligning adjacent text by baseline or text edge.
* Keep repeated rows and controls geometrically consistent.
* Avoid isolated offsets that break the visual rhythm.

Choose a layout structure appropriate to the content. Do not force every screen into the same grid or column arrangement. Important content should receive appropriate placement and space without allowing secondary content to dominate merely to fill the window.

## 8. Adaptive window behavior

Design for application windows, not for one fixed screenshot or display resolution.

WinUI uses effective pixels so the framework can account for display density and scaling. Do not adjust font or control sizes merely because the physical screen resolution changes. Adapt the composition when the available window space changes or when the content requires it.

Depending on available space, the interface may:

* Reposition elements
* Resize regions
* Reflow columns or collections
* Adjust spacing
* Show less or more secondary metadata
* Collapse secondary commands
* Replace one composition with another
* Change between list-detail and single-pane presentations

Responsive design retains one fluid layout; adaptive design replaces one layout with another. Either may be appropriate, and some screens may use both. Choose breakpoints according to actual content pressure and workflow needs rather than specific device models.

Use WinUI layout panels, sizing behavior, visual states, and adaptive mechanisms appropriate to the existing application architecture. Do not introduce a new responsive framework for a bounded correction.

Do not hide essential information or actions solely to make a narrow window look cleaner. When secondary content is removed from the immediate composition, it must remain available through a clear and predictable interaction.

The application’s supported minimum window size is a product decision. Verify that affected content remains usable throughout the supported range rather than assuming that the operating system will prevent unsuitable sizes.

## 9. Input and target sizing

Support every input method that the application or affected feature claims to support.

Mouse and keyboard are primary desktop inputs. Touch, pen, gamepad, or other modalities should be considered when they are part of the product’s supported use.

Built-in WinUI controls already provide platform-appropriate target sizing and interaction behavior. Preserve those defaults unless a documented product need requires a change.

For custom or substantially modified interactive elements:

* Ensure the target is large enough to acquire accurately.
* Use approximately 40 by 40 effective pixels as the general Windows touch-target reference.
* Consider larger targets or greater separation for frequent actions or actions with serious consequences if activated accidentally.
* Apply the requirement to the effective interactive region, not necessarily to the visible glyph alone.

Do not enlarge every dense desktop control mechanically when touch is not a supported or realistic interaction. Verify the supported and affected input methods rather than every theoretically possible modality.

## 10. Typography

Typography should communicate structure clearly without drawing unnecessary attention to itself.

Use Segoe UI Variable through the standard WinUI controls and Windows XAML type resources. WinUI common controls select the Windows system font by default for supported languages, and the supplied type-ramp styles adapt correctly to Windows rendering and scaling.

Use the established Windows type roles rather than arbitrary font sizes, weights, and line heights:

* Caption
* Body
* Body Strong
* Body Large
* Subtitle
* Title
* Title Large
* Display

Use the corresponding XAML type-ramp resources instead of reproducing their measurements locally. The standard Windows ramp ranges from 12-effective-pixel Caption text through 68-effective-pixel Display text.

Apply these principles:

* Use regular weight for most text.
* Use semibold for meaningful emphasis and titles.
* Use sentence case for UI text.
* Left-align ordinary text by default.
* Center text only in limited compositions where centering has a clear purpose.
* Keep hierarchy restrained and meaningful.
* Avoid using size or weight alone to communicate structure.
* Do not shrink text merely to force content into a fixed container.
* Allow space for localization and longer content.

Do not use regular text smaller than 12 effective pixels or semibold text smaller than 14 effective pixels. Windows identifies those as minimum values because smaller text can become illegible in some languages. Bold and italic are not part of the standard Windows type ramp; use semibold for normal emphasis, and avoid italics where they reduce readability.

For prose, approximately 50–60 characters per line is a useful readability target. Do not apply this constraint to tables, labels, command bars, code, or other non-prose structures.

Handle overflow intentionally. Depending on the component and importance of the content, text may wrap, clip, trim, or expose the full value through an appropriate interaction. Avoid accidental clipping and indiscriminate ellipses.

Use Windows language-aware font selection for scripts not covered by Segoe UI Variable. Do not force one font across languages when Windows provides a more appropriate UI font.

## 11. Color, themes, and contrast

Use neutral colors as the foundation for surfaces, text, borders, and hierarchy.

Use accent, shared, and semantic colors sparingly:

* Accent color may emphasize important interactive elements and state.
* Semantic colors should communicate feedback, status, or urgency.
* Shared categorical colors should remain consistent.
* Strong color should not dominate the interface without a functional reason.

Do not use semantic colors as decoration. Pair color with text, an icon, shape, position, or another perceivable indicator. Color must not be the only indication of selection, error, success, warning, availability, or interactivity.

### Theme behavior

Use WinUI theme brushes and XAML theme resources rather than hardcoded colors.

The XAML framework supports Light, Dark, and HighContrast theme dictionaries. `{ThemeResource}` values are reevaluated when the active theme changes, while `{StaticResource}` values are resolved when the XAML is loaded. Use `{ThemeResource}` for values that must respond to theme changes.

By default, allow the application to follow the user’s Windows theme preference. Force an application theme only when there is a justified product requirement. Windows contrast themes override an application’s requested light or dark theme, and that behavior must remain usable.

Built-in controls already use theme brushes. Do not replace those brushes casually with literals that break light, dark, contrast, or runtime theme behavior.

Respect the user’s system accent and contrast-theme choices. Do not override system contrast resources or depend on one fixed accent color for legibility.

### Contrast

Meet at least:

* 4.5:1 for normal text
* 3:1 for large text
* 3:1 for visual information required to identify active controls, focus indicators, meaningful states, and necessary non-text graphics

Measure the actual foreground and adjacent background in the affected states and themes. A resource name or palette membership does not prove that a customized combination has sufficient contrast.

Inactive controls are exempt from WCAG’s minimum non-text contrast requirement. They should remain understandable where practical, but they must not be reported as failing solely because an inactive presentation is below 3:1.

## 12. Shape and geometry

Use the standard WinUI control geometry unless there is a demonstrated reason to change it.

Windows uses:

* 4-pixel corner radii for ordinary in-page controls
* 8-pixel corner radii for app windows, dialogs, flyouts, and most overlays
* No rounding where straight edges join or where the window is maximized or snapped

Tooltips and bar-like controls generally use the smaller control radius. Connected parts of a compound control should not be separated by rounded gaps.

Use the existing `ControlCornerRadius` and `OverlayCornerRadius` resources rather than independently assigning nearby values to individual controls. Do not override these global resources application-wide without evidence that the entire product requires a different geometry.

Use a small and consistent shape vocabulary:

* Rectangles for most controls and containers
* Circles for avatars or representations of people
* Pills for appropriate tracks, tags, keywords, or compact selections
* Beaks where a floating surface needs a visual connection to its invoking element

Do not use pills, circles, borders, or excessive rounding purely as decoration. Shape should reinforce the meaning and structure of the component.

## 13. XAML resources and design-token discipline

Use the WinUI XAML resource system as the visual source of truth.

Prefer, in order:

1. Built-in WinUI control resources and styles
2. Existing application resources and styles
3. A justified reusable project resource
4. A local literal when no reusable semantic role exists

Use:

* `ResourceDictionary` for reusable application resources
* Merged dictionaries where the project already uses them
* `{ThemeResource}` for theme-dependent consumption
* `ThemeDictionaries` for justified Light, Dark, and HighContrast custom resources
* XAML styles for reusable control treatment
* Built-in type, brush, radius, and control resources whenever they express the intended role

For custom theme resources, define coherent Light, Dark, and HighContrast values. Within theme dictionaries, follow the XAML resource-reference rules rather than creating circular or runtime-unstable theme references.

Fluent’s global-versus-alias token model can guide resource organization:

* Raw values are context-independent.
* Semantic resources describe purpose, such as primary text, subtle surface, status, border, or selected state.
* Feature code should normally consume purpose-based resources rather than raw colors or measurements.

This conceptual model does not require introducing a separate Fluent-token framework on top of WinUI.

Before adding a resource:

1. Check whether WinUI or the application already provides the required role.
2. Determine whether the distinction is reusable and semantically meaningful.
3. Name it by purpose rather than its current literal value.
4. Verify its behavior in the supported themes.

Do not:

* Hardcode a theme-sensitive color when an appropriate brush exists.
* Duplicate an existing resource under a new name.
* Create a global resource for a one-screen difference without demonstrated reuse.
* Introduce a broad resource refactor for a bounded correction.
* Create a parallel styling architecture.
* Replace component resources without understanding their state and theme behavior.

A local literal is acceptable when no reusable semantic role exists and a new resource would add more complexity than consistency. Treat that as a deliberate exception, not the default.

## 14. Accessibility, keyboard, and UI Automation

Accessibility is part of the interaction contract.

Prefer built-in WinUI controls because they already provide standard focus, input, and automation behavior. Composition of standard controls is generally safer than attaching pointer behavior to non-interactive elements.

The affected interface must:

* Support every meaningful operation by keyboard.
* Keep interactive controls reachable through logical focus traversal.
* Provide visible focus.
* Avoid keyboard traps.
* Restore focus appropriately after dialogs, flyouts, menus, and other temporary UI close.
* Expose clear accessible names.
* Expose applicable roles, values, states, relationships, and shortcut information through UI Automation.
* Preserve the same essential meaning and available actions for Narrator and other assistive-technology users.
* Provide alternatives for meaningful non-text content.
* Remain usable in Windows contrast themes.

Keyboard accessibility is a primary interaction model, not a secondary fallback. Pointer-complete behavior is not complete if the same functionality cannot be reached and activated from the keyboard.

### Focus and traversal

Focus order must follow the logical reading and task sequence and remain predictable relative to the visual arrangement.

The default tab order follows XAML declaration or insertion order, which is often suitable but can diverge from the visual layout. Verify it explicitly, especially in grids, tables, rearranged layouts, and composite controls.

Use arrow-key navigation inside composite controls where that is the established Windows behavior. Do not expose every internal child as an independent tab stop when the control should behave as one composite interaction. Built-in collection controls already implement appropriate inner navigation; preserve it.

For applications with several prominent task regions, consider F6 and Shift+F6 navigation between those regions. Do not introduce F6 handling mechanically on a simple screen where it adds no value. When implemented, regions should have clear accessible names.

### Activation and shortcuts

Anything invokable by pointer must have an appropriate keyboard path.

Use standard controls so Enter, Space, arrow keys, access keys, and other expected interactions work naturally. For important or frequently used commands, use `KeyboardAccelerator` or access-key mechanisms where they improve productivity.

Automation metadata describing a shortcut does not implement the shortcut. The keyboard behavior and its UI Automation metadata must both be correct.

### Custom and retemplated controls

Any custom focusable control must provide:

* A logical keyboard interaction model
* Visible focus in every applicable theme
* Appropriate UI Automation information
* Equivalent accessibility to the standard control it replaces

Built-in controls already supply focus indicators that adapt to theme and contrast settings. If a control is retemplated, preserve equivalent focus visibility instead of removing the focus visual for aesthetic reasons.

Test affected behavior with keyboard-only navigation and Narrator, not only by inspecting automation properties in code.

## 15. Native window and application surfaces

Use Windows application surfaces according to their documented purpose:

* `NavigationView` for appropriate top-level navigation structures
* `ContentDialog` for modal decisions that genuinely require interruption
* Flyouts and menus for contextual commands or information
* `TeachingTip` for contextual instruction
* `InfoBar` for non-modal status or error communication
* `CommandBar` or related command surfaces for grouped application actions
* Standard title-bar APIs when customizing window chrome

Do not invent a custom surface when an established WinUI control already expresses the interaction.

Mica, an integrated title bar, sidebar navigation, transparent page backgrounds, and `InfoBar` messaging form one documented modern WinUI application structure, but they are not mandatory for every product. Use these elements only when they fit the application’s architecture and user needs.

A custom title bar must follow the dedicated title-bar guidance and preserve expected window dragging, caption-button, theme, scaling, and accessibility behavior. Do not customize window chrome solely for decoration.

System backdrops must not substitute for clear hierarchy or readable surfaces. Verify legibility and fallback behavior in all supported themes.

## 16. Verification and completion

Verification must be proportional to the change.

Identify and verify every state, window size, theme, input method, content condition, and accessibility path that the change affects or could reasonably regress. Do not expand a bounded correction into an exhaustive audit of unrelated behavior.

A UI change is complete when the agent can show that:

* The selected controls and patterns are appropriate for WinUI 3.
* Existing WinUI and project resources were reused where appropriate.
* Any custom behavior or styling is supported by a concrete product need.
* Product behavior and established workflows remain intact unless an intentional correction was required.
* The hierarchy makes context, important content, application state, and primary action clear.
* Spacing, alignment, typography, color, and geometry are coherent with Windows and the existing application.
* No unnecessary literals, resources, abstractions, control variants, or unrelated styles were introduced.
* The affected layout remains usable throughout the supported window-size range.
* Affected display-scaling, long-content, localization, and overflow conditions are handled intentionally.
* Light, dark, and contrast themes preserve meaning and usability.
* Required contrast thresholds are met.
* Supported and affected input methods work correctly.
* Keyboard traversal, activation, focus visibility, and focus restoration are correct.
* Affected accessible names, roles, values, states, relationships, and shortcut information are exposed correctly.
* Meaning is not communicated through color alone.
* Relevant rest, pointer-over, pressed, focused, selected, checked, disabled, validation, and status states were verified.
* Custom or retemplated controls preserve equivalent input, focus, theme, and automation behavior.
* The work remains bounded to the identified problem.

Report which checks were applicable and provide concrete evidence for them.

Do not claim Fluent, WinUI, or accessibility compliance from visual inspection of the default state alone.
