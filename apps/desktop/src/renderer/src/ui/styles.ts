// Shared Tailwind compositions for controls used by more than one feature.
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

/** A keycap for shortcut hints; sized in `em` so it follows the surrounding label. */
export const kbdClasses = [
  "inline-flex h-[1.7em] min-w-[1.7em] items-center justify-center [padding:0_0.45em]",
  "border-[1px] border-[color:var(--line)] border-b-[color:var(--line-strong)] rounded-[4px]",
  "bg-[var(--surface-hover)] text-[var(--text-tertiary)] [font-family:var(--font-mono)]",
  "text-[0.95em] leading-none whitespace-nowrap",
].join(" ")
