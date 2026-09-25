// Shared Tailwind compositions for controls used by more than one feature.

/** Joins a base composition with a caller's optional additions. */
export const cx = (...classes: ReadonlyArray<string | false | undefined>): string =>
  classes.filter(Boolean).join(" ")

/** Muted copy in a panel: an empty state, progress, or a failure shown in the deleted colour. */
export const panelNoteClasses =
  "[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]"

/** A chevron that turns to point down while its Collapsible panel is open. */
export const disclosureChevronClasses =
  "motion-transform motion-duration-200 disclosure-chevron flex-none [[data-panel-open]_>_&]:[transform:rotate(90deg)]"

/** An inbox control whose right edge follows the sidebar panel's live width. Collapsed to the
 * rail it becomes a square around its icon; its left edge and icon never move. */
export const railControlClasses = "max-w-[calc(100cqw_-_16px)]"

/** Inbox copy beside an icon, faded out while the sidebar is collapsed to its rail. */
export const railLabelClasses =
  "motion-colors motion-duration-220 group-data-[rail]/inbox:opacity-0 group-data-[rail]/inbox:pointer-events-none"

/** One row in a menu or select list, highlighted by Base UI's roving focus. */
export const menuItemClasses = [
  "menu-item flex h-[30px] items-center gap-[9px] [padding:0_9px] rounded-[var(--radius-sm)]",
  "text-[var(--text-secondary)] cursor-default text-[12.5px] outline-none select-none",
  "[&[data-highlighted]]:bg-[var(--surface-active)] [&[data-highlighted]]:text-[var(--text-primary)]",
  "[&[data-disabled]]:text-[var(--text-disabled)]",
].join(" ")

/** The gutter before a menu row's label, holding its icon or selection tick. */
export const menuGutterClasses =
  "grid w-[14px] flex-[0_0_14px] place-items-center text-[var(--text-primary)]"

export const tooltipPopupClasses = [
  "[padding:5px_8px] border-[1px] border-[color:var(--line)] rounded-[var(--radius-sm)]",
  "bg-[var(--surface-overlay)] [backdrop-filter:blur(24px)] [box-shadow:var(--shadow-popup)]",
  "text-[var(--text-primary)] text-[11.5px]",
  "[@media(prefers-reduced-transparency:_reduce)]:[backdrop-filter:none]",
].join(" ")

export const menuPopupClasses = [
  "popup min-w-[190px] max-h-[var(--available-height,_420px)] overflow-y-auto p-[5px]",
  "border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] bg-[var(--surface-menu)]",
  "[backdrop-filter:blur(32px)]",
  "[box-shadow:var(--shadow-popup),_inset_0_1px_0_var(--edge-highlight)]",
  "text-[var(--text-primary)] outline-none [transform-origin:var(--transform-origin)]",
  "[@media(prefers-reduced-transparency:_reduce)]:[backdrop-filter:none]",
  "[@media(prefers-reduced-transparency:_reduce)]:bg-[var(--surface-overlay)]",
].join(" ")

/** Inline code and emphasis inside transcript Markdown. */
export const markdownInlineClasses = [
  "[&_code:not(pre_code)]:[padding:1px_5px]",
  "[&_code:not(pre_code)]:rounded-[var(--radius-sm)] [&_code:not(pre_code)]:text-[var(--text-primary)]",
  "[&_code:not(pre_code)]:[background:color-mix(in_srgb,_var(--text-primary)_7%,_transparent)]",
  "[&_code:not(pre_code)]:[box-decoration-break:clone] [&_code:not(pre_code)]:[-webkit-box-decoration-break:clone]",
  "[&_code:not(pre_code)]:[font-family:var(--font-mono)] [&_code:not(pre_code)]:text-[0.86em]",
  "[&_strong]:font-semibold [&_strong]:text-[var(--text-primary)]",
].join(" ")

/** Rendered Markdown descendants shared by the transcript, expanded tables, and file previews. */
export const markdownProseClasses = [
  "event-markdown whitespace-normal [&_>_:first-child]:mt-[0] [&_>_:last-child]:mb-[0]",
  "[&_p]:[margin:0_0_0.7em] [&_a]:text-[var(--color-info)]",
  "[&_a]:[text-decoration-color:color-mix(in_srgb,_var(--color-info)_50%,_transparent)]",
  "[&_a]:[text-underline-offset:3px]",
  "[&_.markdown-table]:max-w-full [&_.markdown-table]:overflow-x-auto [&_.markdown-table]:[margin:1em_0]",
  "[&_.markdown-table]:border-[1px] [&_.markdown-table]:border-[color:var(--line)] [&_.markdown-table]:rounded-[var(--radius)]",
  "[&_.markdown-table]:max-h-[400px] [&_.markdown-table]:overflow-auto [&_.markdown-table]:mt-[0]",
  "[&_.markdown-table:focus-visible]:[outline:1px_solid_var(--focus-ring)]",
  "[&_.markdown-table:focus-visible]:[outline-offset:2px] [&_table]:w-full",
  "[&_table]:[border-collapse:collapse] [&_table]:[overflow-wrap:normal] [&_th]:min-w-[10rem]",
  "[&_th]:[padding:9px_12px] [&_th]:border-b-[1px] [&_th]:border-b-[color:var(--line)] [&_th]:[vertical-align:top]",
  "[&_th]:bg-[var(--surface-hover)] [&_th]:text-left [&_th]:font-semibold [&_td]:min-w-[10rem]",
  "[&_td]:[padding:9px_12px] [&_td]:border-b-[1px] [&_td]:border-b-[color:var(--line)] [&_td]:[vertical-align:top]",
  "[&_th:first-child]:min-w-auto [&_td:first-child]:min-w-auto [&_tr:last-child_td]:border-b-0",
  "[&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:p-[12px] [&_pre]:border-[1px] [&_pre]:border-[color:var(--line)]",
  "[&_pre]:rounded-[var(--radius)] [&_pre]:bg-[var(--surface-hover)] [&_pre]:whitespace-pre",
  "[&_pre]:[overflow-wrap:normal] [&_pre_code]:[font-family:var(--font-mono)] [&_pre_code]:text-[0.9em]",
  "[&_blockquote]:[margin:1em_0] [&_blockquote]:pl-[12px]",
  "[&_blockquote]:border-l-[2px] [&_blockquote]:border-l-[color:var(--line-strong)] [&_blockquote]:text-[var(--text-secondary)]",
  "[&_img]:max-w-full [&_img]:h-auto [&_.contains-task-list]:[list-style:none]",
  "[&_.contains-task-list]:pl-[1.5em] [&_hr]:border-0 [&_hr]:border-t-[1px] [&_hr]:border-t-[color:var(--line)]",
  "[&_hr]:[margin:1.5em_0] [&_.markdown-code-scroll_pre]:flex-1",
  "[&_.markdown-code-scroll_pre]:overflow-visible [&_.markdown-code-scroll_pre]:border-0",
  "[&_.markdown-code-scroll_pre]:rounded-[0] [&_.markdown-code-scroll_pre]:m-0",
  "[&_.markdown-code-scroll_pre]:bg-transparent [&_.markdown-code-scroll_pre]:leading-[1.65]",
  "[&_.markdown-code-scroll_pre]:text-[0.9em] [&_.markdown-code-scroll_pre_code]:text-[inherit]",
  "[&_.markdown-code-scroll_.markdown-line-numbers]:sticky",
  "[&_.markdown-code-scroll_.markdown-line-numbers]:left-[0]",
  "[&_.markdown-code-scroll_.markdown-line-numbers]:flex-none",
  "[&_.markdown-code-scroll_.markdown-line-numbers]:text-[var(--text-tertiary)]",
  "[&_.markdown-code-scroll_.markdown-line-numbers]:text-right",
  "[&_.markdown-code-scroll_.markdown-line-numbers]:bg-[var(--surface-menu)]",
  "[&_.markdown-code-scroll_.markdown-line-numbers]:select-none [&_.markdown-table_th]:sticky",
  "[&_.markdown-table_th]:top-[0] [&_.markdown-table_th]:z-[1]",
  "[&_.markdown-table_th]:bg-[var(--surface-menu)] [&_mark]:text-[var(--text-primary)]",
  "[&_mark]:[background:color-mix(in_srgb,_var(--color-modified)_35%,_transparent)]",
  "[&_mark[data-current]]:[outline:2px_solid_var(--color-modified)] [&_.katex-display]:overflow-x-auto",
  "[&_.katex-display]:overflow-y-hidden",
].join(" ")

export const centeredStateClasses = [
  "flex h-full flex-col items-center justify-center p-[40px] [grid-row:1_/_-1] text-center",
  "[&_.brand-mark]:w-[34px] [&_.brand-mark]:h-[34px] [&_.brand-mark]:flex-[0_0_34px]",
  "[&_.brand-mark]:mb-[16px] [&_.brand-mark]:text-[var(--text-tertiary)] [&_h2]:m-0",
  "[&_h2]:[font-family:var(--font-display)] [&_h2]:text-[20px] [&_h2]:font-semibold",
  "[&_h2]:tracking-[-0.01em] [&_p]:max-w-[380px] [&_p]:[margin:8px_0_20px]",
  "[&_p]:text-[var(--text-secondary)] [&_p]:text-[12.5px] [&_p]:leading-[1.6]",
].join(" ")

export const threadContentClasses = [
  "[&:has(>_.transcript-origin)]:grid-rows-[auto_auto_auto]",
  "[&:has(>_.transcript-origin)]:[align-content:safe_center] [&:has(>_.transcript-origin)]:py-[24px]",
  "[&:has(>_.transcript-origin)]:overflow-y-auto [&:has(>_.transcript-origin)_.composer-zone]:pb-[0]",
  "[&:has(>_.transcript-origin)_.composer]:max-w-[680px]",
  "[&:has(>_.transcript-origin)_.composer-zone_.notice]:max-w-[680px]",
  "[&:has(>_.transcript-origin)_.composer_textarea]:min-h-[120px] grid grid-rows-[minmax(0,_1fr)_auto]",
  "h-full min-w-0 min-h-0 overflow-hidden",
].join(" ")

export const textInputClasses = [
  "text-input w-full h-[32px] [padding:0_10px] border-[1px] border-[color:var(--line)] rounded-[var(--radius)]",
  "[background:rgba(0,_0,_0,_0.198)] text-[var(--text-primary)] text-[12.5px] outline-none",
  "[&::placeholder]:text-[var(--text-tertiary)] [&:focus]:[border-color:var(--line-strong)]",
  "[&:focus]:[box-shadow:0_0_0_3px_rgba(255,_255,_255,_0.045)]",
  "[&[data-mono='true']]:[font-family:var(--font-mono)] [&[data-mono='true']]:text-[11.5px]",
  "[:root[data-theme='light']_&]:bg-[var(--surface-raised)] [select&]:[font-family:var(--font-text)]",
  "[select&]:text-[12px] [select&]:text-[var(--text-primary)] [select&]:bg-[var(--surface-raised)]",
  "[select&]:cursor-pointer",
].join(" ")

export const iconButtonClasses = [
  "icon-button [display:inline-grid] w-[28px] h-[28px] flex-[0_0_28px] border-[1px] border-[color:transparent]",
  "rounded-[var(--radius-sm)] bg-transparent text-[var(--text-secondary)] cursor-default",
  "place-items-center [&:hover:not(:disabled)]:bg-[var(--surface-hover)]",
  "[&:hover:not(:disabled)]:text-[var(--text-primary)] [&[data-popup-open]]:bg-[var(--surface-hover)]",
  "[&[data-popup-open]]:text-[var(--text-primary)] [&:disabled]:text-[var(--text-disabled)]",
].join(" ")

export const chipClasses = [
  "chip inline-flex h-[27px] max-w-[240px] items-center gap-[6px] [padding:0_8px]",
  "border-[1px] border-[color:transparent] rounded-[var(--radius)] bg-transparent text-[var(--text-secondary)]",
  "cursor-default text-[12px] whitespace-nowrap [&:hover:not(:disabled)]:[border-color:var(--line)]",
  "[&:hover:not(:disabled)]:bg-[var(--surface-hover)]",
  "[&:hover:not(:disabled)]:text-[var(--text-primary)] [&[data-popup-open]]:[border-color:var(--line)]",
  "[&[data-popup-open]]:bg-[var(--surface-hover)] [&[data-popup-open]]:text-[var(--text-primary)]",
  "[&:disabled]:text-[var(--text-disabled)] [&[data-active='true']]:[border-color:var(--line)]",
  "[&[data-active='true']]:bg-[var(--surface-selected)]",
  "[&[data-active='true']]:text-[var(--text-primary)]",
].join(" ")

export const buttonClasses = [
  "button inline-flex h-[30px] items-center justify-center gap-[7px] [padding:0_11px]",
  "border-[1px] border-[color:var(--line)] rounded-[var(--radius)] [background:rgba(255,_255,_255,_0.027)]",
  "text-[var(--text-primary)] cursor-default text-[12.5px] font-medium whitespace-nowrap",
  "[&:hover:not(:disabled)]:bg-[var(--surface-hover)]",
  "[&:hover:not(:disabled)]:[border-color:var(--line-strong)]",
  "[&:active:not(:disabled)]:bg-[var(--surface-active)] [&:disabled]:text-[var(--text-disabled)]",
  "[&:disabled]:cursor-default [&:disabled]:opacity-[0.6]",
  "[&[data-variant='primary']]:[border-color:transparent] [&[data-variant='primary']]:bg-[var(--accent)]",
  "[&[data-variant='primary']]:text-[var(--accent-foreground)]",
  "[&[data-variant='primary']:hover:not(:disabled)]:bg-[var(--accent-hover)]",
  "[&[data-variant='primary']:hover:not(:disabled)]:[border-color:transparent]",
  "[&[data-variant='primary']:disabled]:bg-[var(--surface-hover)]",
  "[&[data-variant='primary']:disabled]:[border-color:var(--line-subtle)]",
  "[&[data-variant='primary']:disabled]:text-[var(--text-tertiary)]",
  "[&[data-variant='primary']:disabled]:opacity-[1]",
  "[&[data-variant='ghost']]:[border-color:transparent] [&[data-variant='ghost']]:bg-transparent",
  "[&[data-variant='ghost']]:text-[var(--text-secondary)]",
  "[&[data-variant='ghost']:hover:not(:disabled)]:bg-[var(--surface-hover)]",
  "[&[data-variant='ghost']:hover:not(:disabled)]:[border-color:transparent]",
  "[&[data-variant='ghost']:hover:not(:disabled)]:text-[var(--text-primary)]",
  "[&[data-size='sm']]:h-[26px] [&[data-size='sm']]:[padding:0_9px] [&[data-size='sm']]:text-[12px]",
  "[&[data-block='true']]:w-full",
].join(" ")

/**
 * Tabs within a panel, matching the title bar's tabs: selection is a raised surface with a hairline,
 * not an underline.
 */
export const panelTabsClasses = [
  "flex shrink-0 items-center gap-[2px] [padding:7px_8px] border-b-[1px] border-b-[color:var(--line-subtle)]",
  "[&_button]:inline-flex [&_button]:h-[28px] [&_button]:items-center [&_button]:[padding:0_10px]",
  "[&_button]:border-[1px] [&_button]:border-[color:transparent] [&_button]:rounded-[var(--radius)]",
  "[&_button]:bg-transparent [&_button]:text-[var(--text-tertiary)] [&_button]:text-[12px]",
  "[&_button]:cursor-default [&_button:hover]:bg-[var(--surface-hover)]",
  "[&_button:hover]:text-[var(--text-secondary)] [&_button[data-active]]:[border-color:var(--line-subtle)]",
  "[&_button[data-active]]:bg-[var(--surface-selected)] [&_button[data-active]]:text-[var(--text-primary)]",
].join(" ")

/** A row of mutually exclusive choices, as Base UI `ToggleGroup` and `Toggle` render them. */
export const segmentGroupClasses =
  "flex gap-[2px] p-[2px] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)]"

export const segmentClasses = [
  "motion-colors inline-flex h-[24px] items-center justify-center gap-[6px] [padding:0_10px] border-0",
  "rounded-[var(--radius-sm)] bg-transparent text-[var(--text-tertiary)] text-[12px] cursor-default",
  "[&:hover]:text-[var(--text-primary)] [&[data-pressed]]:bg-[var(--surface-selected)]",
  "[&[data-pressed]]:text-[var(--text-primary)] [&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)]",
  "[&:disabled]:text-[var(--text-disabled)]",
].join(" ")

/** A keycap for shortcut hints; sized in `em` so it follows the surrounding label. */
export const kbdClasses = [
  "inline-flex h-[1.7em] min-w-[1.7em] items-center justify-center [padding:0_0.45em]",
  "border-[1px] border-[color:var(--line)] border-b-[color:var(--line-strong)] rounded-[4px]",
  "bg-[var(--surface-hover)] text-[var(--text-tertiary)] [font-family:var(--font-mono)]",
  "text-[0.95em] leading-none whitespace-nowrap",
].join(" ")

/** A hairline between resizable panes, with a wider invisible grip. */
export const paneSeparatorClasses = [
  "relative w-[1px] flex-[0_0_1px] bg-[var(--line-subtle)] outline-none [&::after]:absolute",
  "[&::after]:z-[2] [&::after]:[inset:0_-3px] [&::after]:[content:''] [&:hover]:bg-[var(--line-strong)]",
  "[&:focus-visible]:bg-[var(--line-strong)] [&[data-separator='active']]:bg-[var(--line-strong)]",
  "[&[aria-orientation='horizontal']]:w-auto [&[aria-orientation='horizontal']]:h-[1px]",
  "[&[aria-orientation='horizontal']::after]:[inset:-3px_0]",
].join(" ")

/** A selectable answer to a provider's question: a full-width row that is one click target. */
export const questionOptionClasses = [
  "motion-colors flex w-full items-start gap-[10px] [padding:9px_12px] text-left",
  "border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)] bg-transparent",
  "text-[var(--text-primary)] text-[12.5px] leading-[1.45] [font-family:inherit] cursor-pointer",
  "[&:hover]:bg-[var(--surface-hover)] [&:hover]:[border-color:var(--line)]",
  "[&:has([data-checked])]:bg-[var(--surface-selected)] [&:has([data-checked])]:[border-color:var(--line-strong)]",
  "[&[aria-pressed='true']]:bg-[var(--surface-selected)] [&[aria-pressed='true']]:[border-color:var(--line-strong)]",
  "[&:focus-visible]:outline-[2px] [&:focus-visible]:outline-[color:var(--focus-ring)] [&:focus-visible]:outline-offset-[1px]",
  "[&[data-disabled]]:opacity-[0.5] [&:disabled]:opacity-[0.55] [&:disabled]:cursor-default",
  "[&:disabled:hover]:bg-transparent [&:disabled:hover]:[border-color:var(--line-subtle)]",
].join(" ")

/** The short label a provider puts above a question. */
export const questionHeaderClasses =
  "block mb-[4px] text-[var(--text-tertiary)] text-[10.5px] font-semibold uppercase tracking-[0.06em]"

/** The question itself. */
export const questionTextClasses =
  "block m-0 text-[var(--text-primary)] text-[13.5px] font-medium leading-[1.45] [overflow-wrap:anywhere]"
