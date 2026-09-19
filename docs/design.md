# Interface design

Use this reference for desktop UI changes. The renderer's theme tokens, Tailwind utilities, shared controls, and Motion helpers own exact values. This document defines design intent and interaction constraints, not visual certification.

## Purpose and appearance

MeldShell helps a developer supervise several coding conversations while reading one or more selected threads. Keep concurrent activity visible in the inbox and the reading area clear.

Use the established dense desktop layout. Windows acrylic appears at the window edge, title bar, inbox, and floating controls; Linux uses a solid backdrop. Dark, light, and system-following themes share the same hierarchy.

Chrome uses neutral tones with a contrasting accent for selection, focus, and primary actions. Provider/file icons, diffs, and transcript content retain meaningful colors. Status also needs a label or shape so color is not the only signal.

Use installed system display, text, and monospace fonts for their existing roles. Reading text is larger than controls and metadata. Use sentence-case labels and reserve compact uppercase styling for existing hierarchy needs.

## Workbench

The tab strip selects views; the inbox finds threads; the content area shows threads or files. Closing a view never interrupts work.

The inbox lists pinned threads before active threads and an optional Archived section. Archived status is named `settled` in storage. Filter by workspace rather than grouping threads beneath workspace headings. Show workspace names where they disambiguate rows. Empty draft threads stay out of the inbox until submission.

Search opens full-text matches with workspace filtering and paged snippets. Selecting a result opens its matching turn. The thread switcher is a separate action.

The composer keeps attachments, next-turn settings, queue state, stop, and send with the conversation. Controls reflect native capabilities: Claude Code/Plan and tool permissions, Codex sandbox/approval choices, and Cursor Agent/Plan/Ask with native permission options. Live steering is not exposed.

Files and Changes share a workspace sidebar. File and diff tabs use the content area. Git controls expose staged/working changes, commit actions, push, and history. Represent these as workspace operations; they are not proof that one thread owns every changed file.

Settings replaces workbench content while retaining open tabs in memory. Workspace management is reached from the workspace menu. Model selection uses provider headings and searchable rows; catalogs and account usage remain provider-specific.

## Split thread layouts

A tab can hold one thread or a tree of horizontal and vertical splits. Each visible thread appears once. Opening another thread creates a solo tab; selecting an open thread returns to its tab and focuses its pane.

Dragging a tab, inbox row, or pane title over a pane previews a split at the outer quarter of an edge. A center drop takes over that pane or swaps threads already on screen. The inbox menu can open a thread to the right or below the focused pane. Pane menus offer splitting by thread name so dragging is optional.

Separators resize with dragging or arrow keys. Measure reading width against the pane, and retain usable minimum sizes. Switching tabs preserves layouts and ratios for the current session.

A shared tab shows a split icon, titles, and pane count. Closing it removes the view without stopping its threads. Closing one pane gives space to its neighbor; one remaining pane becomes a solo tab. Showing one thread alone moves it to a solo tab and keeps the remaining split together.

Pane headers contain title, layout menu, and close controls only when a layout is shared. Tabs and layouts are not restored after application restart.

## Components and depth

Adjacent regions share the base tint and use hairline dividers. Floating menus, dialogs, tooltips, and the composer may add blur or shadow. Dialogs dim the content behind them. With transparency disabled, use solid neutral backgrounds while preserving contrast.

Base UI provides focus, navigation, dismissal, portals, and ARIA behavior through shared wrappers. Feature code uses those wrappers and MeldShell styling. Keep Tailwind utilities near markup and shared compositions in `ui/styles.ts`. Raw CSS is reserved for tokens, document defaults, platform scrollbars, and vendor typesetting.

Icons share a thin optical weight except for product and file marks. Icon-only controls need an accessible name and tooltip.

Use compact buttons and inputs, menus for choices, switches for enablement, and dialogs for decisions. Put recoverable errors beside the control that resolves them. Durable approvals and attention requests stay with the thread even if an operating-system notification draws attention to them.

## Density and motion

Keep controls compact while giving transcripts a comfortable reading width. Running threads have room for title, context, and activity; archived rows are quieter. The inbox resizes within bounds that preserve the reading area.

User messages form compact blocks. Agent output uses structured reasoning, commands, diffs, plans, and tool activity. Containers and borders should clarify those relationships.

Motion communicates activity or a state change. Use shared Motion helpers and `data-motion` for control interpolation. Keep virtualized row positions free of animation. Running indicators may move continuously; reduced motion and background/unfocused windows suppress motion as defined by existing helpers.

## Keyboard behavior

| Shortcut | Action |
| --- | --- |
| Ctrl+N | New thread |
| Ctrl+, | Settings |
| Ctrl+P | Thread switcher |
| Ctrl+K | Transcript search |
| Ctrl+Tab / Ctrl+Shift+Tab | Cycle open tabs |
| Ctrl+W | Close the selected tab |
| Ctrl+Enter | Send by default; settings can enable Enter |
| Shift+Enter | Newline |
| Shift++ / Shift+- | Scale 70% to 150% in 10% steps outside text fields |
| Escape | Dismiss the top temporary UI |

Preserve visible focus and visual-order navigation. Menus support arrow navigation; dialogs contain focus and return it to the invoker. Disabled actions remain understandable, and the composer explains missing prerequisites.

## Review criteria

Apply [repository verification policy](../AGENTS.md#verification) to the changed UI. Review the affected layout for readable hierarchy, neutral chrome, discoverable actions, keyboard access, and scannable running/queued/approval/error states.

When the user performs visual checks, include the relevant theme, transparency fallback, reduced motion, or text scale for the risk being addressed. A routine component change does not require a full-screen audit.
