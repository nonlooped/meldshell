# MeldShell interface design

This document defines the design language: the look, feel, and behaviour every
screen should follow. It intentionally avoids hard values. Exact tokens, sizes,
and timings live in the renderer stylesheet and are the source of truth; this
document explains the intent behind them so new UI reads as MeldShell without
copying old pixels.

Reviewed against the renderer on 2026-09-05. Current behavior includes dark,
light, and system themes, pinned threads, an Archived section, transcript
search, and a full-workbench Settings view. Design criteria below describe
intent; they are not a record of accessibility or visual certification.

## Subject, audience, and job

MeldShell is a Windows workbench for a developer supervising several coding-agent conversations. The interface has one job: make concurrent work legible without pulling attention away from the selected thread.

It should look like installed Windows software. It must not borrow the visual grammar of a marketing site, project-management board, or mobile chat application.

## Visual thesis

The default dark theme uses smoked glass around a quiet, dense workbench. Light and system-following themes preserve the same hierarchy. Content panes stay legible for reading. Acrylic reads at the window edge, title bar, inbox, and transient surfaces. Activity indication lives where threads are listed, so concurrent runs, waits, and approvals are visible at a glance.

Activity indication is functional, not decoration. It marks which threads need
attention and which are busy, using small indicators attached to their rows
rather than badges scattered across the interface or a separate decorative
element.

## Palette and contrast

MeldShell keeps a monochrome base theme, including subtly tinted grays and
white/black alphas. This does not require decolorizing icons or content to match
the chrome. Color can help distinguish status and activity alongside labels,
shapes, and motion. High-contrast readability remains a design and verification
requirement.

The language has four ideas, not four hex codes:

- A shared base over the native material, with dark and light token sets.
- Elevated surfaces for things that float above the base: composer, menus,
  dialogs, tooltips.
- A small stepped text hierarchy: primary for content, quieter tiers for
  secondary context, tertiary metadata, and disabled states.
- One contrasting accent reserved for selection, focus, and primary actions,
  with foreground/background inversion appropriate to the selected theme.

Provider and file icons retain the colors supplied by their icon libraries;
monochrome brand assets do not need invented colors. Transcript content and
diffs retain their own colors inside the neutral frame.

## Type

- Display and window chrome: the system display face.
- Body and controls: the system text face.
- Commands, paths, diffs, and model metadata: the system monospace face.

The interface uses installed system fonts. No web fonts load at runtime. Type
scales by role: larger for reading, compact for metadata and controls. Labels
are sentence case; eyebrows and section headings may use compact uppercase
styling where the hierarchy needs it.

## Window layout

```text
┌─────────────────────────────────────────────────────────────────────┐
│ ◈  [Thread tab] [Thread tab •]                                ─ □ × │
├──────────────────┬──────────────────────────────────────────────────┤
│ Search (Ctrl+K)  │                                                  │
│ Workspace filter │ Canonical conversation                           │
│ + New thread     │ Reasoning summary                                │
│                  │ Commands, diffs, plans, goals, and tool events   │
│ Pinned / Active  │                                                  │
│  with activity   │                                                  │
│                  ├──────────────────────────────────────────────────┤
│ Archived         │ Message composer                                 │
│  Older threads   │ [context chips] [run controls] [send]            │
│ ⚙ Settings       │                                                  │
└──────────────────┴──────────────────────────────────────────────────┘
```

The window has three regions: a tab strip for open threads, an inbox for
finding threads, and a thread pane for reading and replying. Only one tab is
selected. Closing a tab removes it from the strip and leaves its turn
untouched; the inbox always provides the route back.

Threads are never grouped by workspace. The inbox filters and searches across
workspaces, and each row shows its workspace as quiet secondary text only where
needed to disambiguate. Pinned threads lead, followed by active work and an
optional, collapsible Archived section. The database still calls archived
status `settled`. Empty draft threads stay out of the inbox until submitted.

Search opens a dialog with full-text matches across active, pinned, and archived
history, workspace filtering, and paged snippets. Choosing a result opens its
thread at the matching turn. `Ctrl+P` is a separate thread switcher.

The composer keeps thread context (model, reasoning, speed, sandbox,
attachments) and run controls (queue state, stop, send) in one row so sending
and queueing a follow-up stay in the thread. Controls reflect the selected
harness: Claude has Code/Plan modes and tool permissions; Codex exposes its
sandbox and approval choices. Live steering is not currently exposed.

Settings replaces the workbench content while keeping open tabs in memory.
Its sections cover General, Appearance, Providers, Usage, Threads, and About.
Workspace management is available from the workspace menu. Model selection
uses a searchable picker with provider headings and compact model rows; provider catalogs and usage
remain separate where capabilities differ.

## Splitting the thread pane

The thread pane holds one thread by default and can be divided into side-by-side
or stacked panes so two conversations are watched at once.

```text
┌──────────────────┬───────────────────────┬──────────────────────────┐
│ Search (Ctrl+K)  │ Thread ⋯ ×            │ Thread ⋯ ×               │
│ Workspace filter │ Canonical conversation│ Canonical conversation   │
│ + New thread     │                       │                          │
│ Pinned / Active  │ Message composer      │ Message composer         │
│                  ├───────────────────────┴──────────────────────────┤
│ Archived         │ Thread ⋯ ×                                       │
│                  │ Canonical conversation                           │
│ ⚙ Settings       │ Message composer                                 │
└──────────────────┴──────────────────────────────────────────────────┘
```

A thread is dragged from its solo tab, its inbox row, or the title of a pane it
already occupies. Over a pane, the outer quarter of each side previews a split
along that edge; the middle previews taking the pane over, which swaps two
threads that are both on screen. The inbox row menu opens a thread to the right
of or below the pane in front, and a pane's own menu splits it against a thread
chosen by name, so no split depends on a pointer.

Panes are resized by dragging or arrowing the hairline between them, down to a
size where the reading column still works; the column measures itself against
the pane rather than the window. Splitting never opens a thread twice: a thread
already open moves into the split. Each split layout shares one tab, with a split
icon, thread titles, and pane count; solo threads keep individual tabs. Opening
another thread creates a solo tab, while selecting an already open thread returns
to its tab and focuses its pane. Switching tabs preserves each layout and its
pane sizes. Closing a shared tab closes the entire view without stopping its
threads; closing a pane removes only that pane and gives its space to its neighbor.
A split with one remaining pane becomes a solo tab. Showing only one thread moves
it into a solo tab and keeps the remaining panes together. A pane wears a header
— title, layout menu, close — only while the pane is shared; a single pane keeps
the plain thread view.

## Material and depth

Depth comes from the system, not from painted panels. The window uses the
native Windows acrylic material; the renderer never fakes the outer backdrop
with a full-window blur.

The rules:

- Adjacent regions share one base tint and are separated by hairlines, never
  by competing tints. Stacked alphas read as seams, not depth.
- Only genuinely floating things add in-app blur or shadow: menus, dialogs,
  tooltips, and the composer surface.
- Dialogs dim the content behind them so attention stays on the decision.
- When the system disables transparency, every translucent surface falls back
  to a solid neutral with layout and contrast unchanged.

## Components

Base UI supplies behaviour only: focus capture, roving index, typeahead,
dismissal, portalling, and ARIA wiring. MeldShell owns every pixel through one
wrapper layer, so there is no vendor theme to override and feature code never
rebuilds popup scaffolding by hand.

Icons are thin line glyphs with a consistent optical weight; product and brand
marks and file-type icons are the exceptions.
Icon-only controls always expose an accessible name and tooltip.

Prefer:

- Compact native-feeling buttons and inputs.
- Menus for choosing between options: commands, models, reasoning, speed,
  sandbox, workspaces.
- Dialogs for decisions and destructive acts: approvals, deletion, catalog
  edits, close confirmation, thread switching, new-thread creation.
- Switches for enablement: providers and models.
- Inline notices for recoverable problems, kept next to the control that can
  resolve them.

Avoid:

- Pill-shaped navigation and marketing-style cards around every block.
- Large gradients, floating action buttons, and oversized illustrations.
- Toasts for anything durable. Approvals and attention requests stay attached
  to their thread; a Windows notification may attract attention, but the
  decision itself is presented in the thread.

## Density

MeldShell is dense but calm. Rows, controls, and text favour compact Windows
dimensions; the transcript favours comfortable reading measure and generous
margins.

The scale has three ideas:

- Controls share one compact height family, with icon-only controls a step
  smaller and footer or settings actions a step larger.
- Inbox rows give active threads room for title, context, and activity, and
  give settled threads a single quiet line. Headings are shorter than rows.
- Corners stay small everywhere: tighter on controls and rows, softer on
  floating surfaces, softest on the composer. Dividers are hairlines.

The inbox is resizable within sensible bounds so operators can trade list
context against reading width. The thread pane never collapses below a usable
reading width.

User turns and agent output sound different on the page. User turns are set
apart as a compact addressed block; agent output reads like a work log with
structured sections for reasoning, commands, diffs, plans, and tool events.

## Motion

Motion communicates state changes only. Nothing animates for ambience.

- Entering content and hover states fade briefly without shifting layout.
- A running turn shows restrained continuous motion on its row indicator.
- Settling, completing, and approval transitions are single, quiet changes:
  a row recedes, an approval holds a brighter state until decided.
- Motion respects the operator: reduced-motion settings collapse animation,
  and background or unfocused windows go still.

## Keyboard model

Every action is keyboard reachable, in visual order, with a visible focus
indicator that is never removed for aesthetics.

- `Ctrl+N`: new thread.
- `Ctrl+,`: settings.
- `Ctrl+P`: thread switcher.
- `Ctrl+Tab` and `Ctrl+Shift+Tab`: move through open tabs.
- `Ctrl+W`: close selected tab without interrupting its turn.
- Splits are reachable without a pointer: the inbox row menu opens a thread
  beside the pane in front, a pane's layout menu splits it or leaves it alone on
  screen, and the separator between panes resizes with arrow keys.
- `Ctrl+K`: search transcripts.
- `Ctrl+Enter`: send by default; General settings can also enable Enter to send.
- `Shift+Enter`: insert a newline.
- `Shift++` / `Shift+-`: scale the interface from 70% to 150% in 10% steps outside text fields; a temporary indicator shows the percentage.
- `Escape`: dismiss the top temporary surface.
- Arrow keys: move within tabs, menus, lists, and selection groups.

Menus and dialogs trap and return focus to their invoker. Disabled commands
stay discoverable: their shortcut does nothing surprising and the composer
explains what is missing (no model, no thread, empty draft, send in flight).

## Design review checklist

Use these criteria for the affected UI. Choose verification under [AGENTS.md](../AGENTS.md#verification); a small styling edit does not require exercising every screen and accessibility setting.

- It still reads as MeldShell with all text replaced by placeholders: pane
  hierarchy, activity placement, and window chrome identify it.
- Depth comes from the system backdrop or one justified floating layer, and
  adjacent regions share the same base.
- Chrome follows the neutral theme tokens, and no label shouts where sentence
  case would do.
- Removing a border or container does not make the hierarchy less clear.
- Keyboard order matches visual order, and focus is always visible.
- A mix of running, queued, approval, failed, and completed work stays
  scannable in one view.
- The screen holds together with transparency disabled, motion reduced, and
  text scaled.
